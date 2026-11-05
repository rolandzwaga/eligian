/**
 * Walks compiled operation lists the way the engine handles the selection, controllers and
 * classes, following `requestAction` + `startAction` (`endAction`) into the start (end) operations
 * of `config.actions` with the call's operationData substituted. Lifted from `tour-controllers.spec.ts` (spec 058, FR-028); calls
 * it cannot follow are recorded in `unresolved` instead of throwing.
 */

import type { IEngineConfiguration } from 'eligius';

export type OperationData = Readonly<Record<string, unknown>>;
export interface WalkedOperation {
  readonly systemName: string;
  readonly operationData?: OperationData;
}

/** One effect the walker saw; `at` is the index of the top-level operation that led to it. */
export type WalkEvent =
  | {
      readonly kind: 'controller-added';
      readonly selector: unknown;
      readonly controller: unknown;
      /** The `addControllerToElement` operation data, `$operationdata` references resolved */
      readonly data: OperationData;
      readonly at: number;
    }
  | {
      readonly kind: 'controller-removed';
      readonly selector: unknown;
      readonly controller: unknown;
      readonly at: number;
    }
  | {
      readonly kind: 'class-added' | 'class-removed' | 'class-toggled';
      readonly selector: unknown;
      readonly className: unknown;
      readonly at: number;
    };

/** An action the walker can descend into: `startAction` runs its start, `endAction` its end. */
export interface ActionBody {
  readonly startOperations: readonly WalkedOperation[];
  readonly endOperations?: readonly WalkedOperation[];
}

export interface WalkResult {
  readonly events: readonly WalkEvent[];
  /** Calls the walker could not follow: unknown action names, nesting deeper than 20 */
  readonly unresolved: readonly string[];
}

export interface ControllerBalance {
  /** The timeline's uri */
  readonly timeline: string;
  /** `${selector} ${controller}`, sorted */
  readonly added: readonly string[];
  readonly removed: readonly string[];
  readonly unresolved: readonly string[];
}

const OPERATION_DATA_PREFIX = '$operationdata.';
const MAX_DEPTH = 20;
const LIFECYCLE_ACTION = 'timeline-lifecycle';

const CLASS_EVENTS = {
  addClass: 'class-added',
  removeClass: 'class-removed',
  toggleClass: 'class-toggled',
} as const;

/** `$operationdata.<name>` references, resolved deeply against `data`; other values unchanged. */
export function resolveOperationData(value: unknown, data: OperationData): unknown {
  if (typeof value === 'string' && value.startsWith(OPERATION_DATA_PREFIX)) {
    return data[value.slice(OPERATION_DATA_PREFIX.length)];
  }
  if (Array.isArray(value)) return value.map(item => resolveOperationData(item, data));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, resolveOperationData(item, data)])
    );
  }
  return value;
}

/**
 * An operation's property: its own operationData's, else the data's. An action parameter named
 * like the property reaches the operation by name, through the data: `selectElement(selector)`
 * in `action unclick(selector: string)` compiles to operationData null.
 */
function property(own: OperationData, key: string, data: OperationData): unknown {
  return resolveOperationData(key in own ? own[key] : data[key], data);
}

interface WalkState {
  readonly actions: ReadonlyMap<string, ActionBody>;
  readonly events: WalkEvent[];
  readonly unresolved: Set<string>;
}

/**
 * Walks one operation list. A started action runs on a copy of the caller's data plus its
 * arguments, with the caller's selection; nothing flows back. `at` is fixed below the top level.
 */
function walk(
  operations: readonly WalkedOperation[],
  state: WalkState,
  start: { readonly data: OperationData; readonly selector: unknown },
  depth: number,
  at: number | undefined
): void {
  const data: Record<string, unknown> = { ...start.data };
  let selector = start.selector;
  let controller: unknown;
  let requested: string | undefined;
  operations.forEach((operation, index) => {
    const position = at ?? index;
    const own = operation.operationData ?? {};
    switch (operation.systemName) {
      case 'selectElement':
        selector = property(own, 'selector', data);
        break;
      case 'setOperationData':
        Object.assign(data, resolveOperationData(own.properties ?? {}, data));
        break;
      case 'getControllerInstance':
        controller = property(own, 'systemName', data);
        break;
      case 'addControllerToElement':
        state.events.push({
          kind: 'controller-added',
          selector,
          controller,
          data: resolveOperationData(own, data) as OperationData,
          at: position,
        });
        break;
      case 'removeControllerFromElement':
        state.events.push({
          kind: 'controller-removed',
          selector,
          controller: property(own, 'controllerName', data),
          at: position,
        });
        break;
      case 'addClass':
      case 'removeClass':
      case 'toggleClass':
        state.events.push({
          kind: CLASS_EVENTS[operation.systemName],
          selector,
          className: property(own, 'className', data),
          at: position,
        });
        break;
      case 'requestAction':
        requested = String(resolveOperationData(own.systemName, data));
        break;
      case 'startAction':
      case 'endAction': {
        const name = requested;
        requested = undefined;
        const action = name === undefined ? undefined : state.actions.get(name);
        if (name === undefined || action === undefined || depth >= MAX_DEPTH) {
          state.unresolved.add(name ?? `${operation.systemName} without requestAction`);
          break;
        }
        const body =
          operation.systemName === 'startAction'
            ? action.startOperations
            : (action.endOperations ?? []);
        const args = own.actionOperationData ?? data.actionOperationData ?? {};
        const callee: Record<string, unknown> = {
          ...data,
          ...(resolveOperationData(args, data) as OperationData),
        };
        delete callee.actionOperationData;
        walk(body, state, { data: callee, selector }, depth + 1, position);
        break;
      }
    }
  });
}

/**
 * Walk an operation list as the engine does for the selection, controllers and classes
 * (selectElement, setOperationData, getControllerInstance, addControllerToElement,
 * removeControllerFromElement, addClass, removeClass, toggleClass), descending into
 * requestAction + startAction (the action's start operations) and requestAction + endAction
 * (its end operations: a ranged call of an endable action ends it) with a copy of the
 * caller's data plus the call's arguments; nothing flows back. `actions`: action name → body.
 */
export function walkOperations(
  operations: readonly WalkedOperation[],
  actions: ReadonlyMap<string, ActionBody>
): WalkResult {
  const state: WalkState = { actions, events: [], unresolved: new Set() };
  walk(operations, state, { data: {}, selector: undefined }, 0, undefined);
  return { events: state.events, unresolved: [...state.unresolved] };
}

const controllerKey = (event: WalkEvent): string =>
  `${String(event.selector)} ${String('controller' in event ? event.controller : undefined)}`;

/** Per timeline: the controllers its lifecycle action adds (start) and removes (end). */
export function controllerBalance(config: IEngineConfiguration): readonly ControllerBalance[] {
  const actions = new Map<string, ActionBody>(
    (config.actions ?? []).map(action => [action.name, action])
  );
  return config.timelines.map(timeline => {
    const lifecycle = timeline.timelineActions.find(action => action.name === LIFECYCLE_ACTION);
    if (lifecycle === undefined) {
      return { timeline: timeline.uri, added: [], removed: [], unresolved: [] };
    }
    const enter = walkOperations(lifecycle.startOperations, actions);
    const leave = walkOperations(lifecycle.endOperations, actions);
    return {
      timeline: timeline.uri,
      added: enter.events
        .filter(event => event.kind === 'controller-added')
        .map(controllerKey)
        .sort(),
      removed: leave.events
        .filter(event => event.kind === 'controller-removed')
        .map(controllerKey)
        .sort(),
      unresolved: [...new Set([...enter.unresolved, ...leave.unresolved])],
    };
  });
}
