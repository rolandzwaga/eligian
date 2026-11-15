/**
 * The literal selectors an operation list selects or acts on (spec 058 phase 3, plan B7): every
 * `selectElement`'s selector and the selector of every class / controller effect the walker sees,
 * following requestAction + startAction (endAction) into `config.actions` with the call's
 * operationData substituted. Used by the determinism location (B2) and `beatsCovered` (D1).
 *
 * Import constraint (plan B1, P19): no module-scope side effects, no value import of jsdom,
 * eligius or jquery.
 */

import {
  type ActionBody,
  resolveOperationData,
  type WalkedOperation,
  walkOperations,
} from '@eligian/language/mcp';

type Data = Readonly<Record<string, unknown>>;

/** The walker's nesting limit (`controller-balance.ts` MAX_DEPTH). */
const MAX_DEPTH = 20;

const addLiteral = (into: Set<string>, value: unknown): void => {
  if (typeof value === 'string' && value !== '') into.add(value);
};

/**
 * The selectors of the `selectElement` operations in a list and in the actions it starts or
 * ends, the way `walkOperations` threads the data: setOperationData merges into it, a started
 * action gets a copy plus the call's `actionOperationData`, and a `selectElement` without its own
 * `selector` reads the data's (an action parameter named `selector`).
 */
function collectSelections(
  operations: readonly WalkedOperation[],
  actions: ReadonlyMap<string, ActionBody>,
  start: Data,
  depth: number,
  into: Set<string>
): void {
  const data: Record<string, unknown> = { ...start };
  let requested: string | undefined;
  for (const operation of operations) {
    const own = operation.operationData ?? {};
    switch (operation.systemName) {
      case 'selectElement':
        addLiteral(
          into,
          resolveOperationData('selector' in own ? own.selector : data.selector, data)
        );
        break;
      case 'setOperationData':
        Object.assign(data, resolveOperationData(own.properties ?? {}, data));
        break;
      case 'requestAction':
        requested = String(resolveOperationData(own.systemName, data));
        break;
      case 'startAction':
      case 'endAction': {
        const action = requested === undefined ? undefined : actions.get(requested);
        requested = undefined;
        if (action === undefined || depth >= MAX_DEPTH) break;
        const body =
          operation.systemName === 'startAction'
            ? action.startOperations
            : (action.endOperations ?? []);
        const args = own.actionOperationData ?? data.actionOperationData ?? {};
        const callee: Record<string, unknown> = {
          ...data,
          ...(resolveOperationData(args, data) as Data),
        };
        delete callee.actionOperationData;
        collectSelections(body, actions, callee, depth + 1, into);
        break;
      }
    }
  }
}

/** The literal selectors an operation list selects or acts on, following requestAction + startAction / endAction. */
export function touchedSelectors(
  operations: readonly WalkedOperation[],
  actions: ReadonlyMap<string, ActionBody>
): ReadonlySet<string> {
  const touched = new Set<string>();
  collectSelections(operations, actions, {}, 0, touched);
  for (const event of walkOperations(operations, actions).events) {
    addLiteral(touched, event.selector);
  }
  return touched;
}
