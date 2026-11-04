/**
 * The tour's controller balance: every controller a timeline's `on enter` attaches is
 * detached again by its `on leave`.
 *
 * The engine never detaches controllers on a timeline switch, so a missing removal leaves
 * e.g. a hub digit key live inside a chapter, and an extra one only logs a warning. `check`,
 * `smoke` and `fmt` all pass either way, so this test compiles examples/eligian-tour and, per
 * timeline, compares the controllers the lifecycle action adds in its startOperations
 * (`addControllerToElement` after `selectElement X` + `getControllerInstance Name`, keyed by
 * X + Name) with those its endOperations remove (`removeControllerFromElement Name` after
 * `selectElement X`). Calls are followed (`requestAction` / `startAction` into
 * `config.actions`) with the call's literal operationData substituted, so `leaveChapter`'s
 * `back` resolves to `"#cN-to-hub"`. The two multisets must be equal.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Effect } from 'effect';
import type { IEngineConfiguration } from 'eligius';
import { beforeAll, describe, expect, test } from 'vitest';
import { compile } from '../pipeline.js';

const TOUR = fileURLToPath(
  new URL('../../../../../examples/eligian-tour/tour.eligian', import.meta.url)
);

type OperationData = Record<string, unknown>;
interface Operation {
  systemName: string;
  operationData?: OperationData;
}
interface ControllerUse {
  added: string[];
  removed: string[];
}

/** Resolves `$operationdata.<name>` references (deeply) against the current operation data. */
function resolve(value: unknown, data: OperationData): unknown {
  if (typeof value === 'string' && value.startsWith('$operationdata.')) {
    return data[value.slice('$operationdata.'.length)];
  }
  if (Array.isArray(value)) return value.map(item => resolve(item, data));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as OperationData).map(([key, item]) => [key, resolve(item, data)])
    );
  }
  return value;
}

/**
 * Walks an operation list like the engine does for controllers: tracks the selected element and
 * the controller instance, records adds and removals, and descends into started actions. A
 * started action runs on a copy of the caller's data plus its arguments; nothing flows back.
 */
function walk(
  operations: readonly Operation[],
  actions: ReadonlyMap<string, readonly Operation[]>,
  start: { data: OperationData; selector: unknown },
  use: ControllerUse,
  depth = 0
): void {
  if (depth > 20) throw new Error('action calls nest deeper than 20: a cycle?');
  const data: OperationData = { ...start.data };
  let selector = start.selector;
  let controller: unknown;
  let requested: string | undefined;
  for (const operation of operations) {
    const own = operation.operationData ?? {};
    switch (operation.systemName) {
      case 'selectElement':
        selector = resolve(own.selector, data);
        break;
      case 'setOperationData':
        Object.assign(data, resolve(own.properties ?? {}, data) as OperationData);
        break;
      case 'getControllerInstance':
        controller = resolve(own.systemName, data);
        break;
      case 'addControllerToElement':
        use.added.push(`${String(selector)} ${String(controller)}`);
        break;
      case 'removeControllerFromElement':
        use.removed.push(`${String(selector)} ${String(resolve(own.controllerName, data))}`);
        break;
      case 'requestAction':
        requested = String(resolve(own.systemName, data));
        break;
      case 'startAction': {
        const name = requested;
        requested = undefined;
        const body = name === undefined ? undefined : actions.get(name);
        if (body === undefined) throw new Error(`startAction of an unknown action: ${name}`);
        const args = (own.actionOperationData ?? data.actionOperationData ?? {}) as OperationData;
        const callee = { ...data, ...(resolve(args, data) as OperationData) };
        delete callee.actionOperationData;
        walk(body, actions, { data: callee, selector }, use, depth + 1);
        break;
      }
    }
  }
}

const sorted = (items: readonly string[]) => [...items].sort();

describe('the tour detaches every controller its lifecycle blocks attach', () => {
  let config: IEngineConfiguration;

  beforeAll(async () => {
    config = await Effect.runPromise(compile(readFileSync(TOUR, 'utf-8'), { sourceUri: TOUR }));
  });

  function balance(uri: string): ControllerUse {
    const timeline = config.timelines.find(candidate => candidate.uri === uri);
    if (!timeline) throw new Error(`no timeline '${uri}'`);
    const lifecycle = timeline.timelineActions.find(action => action.name === 'timeline-lifecycle');
    if (!lifecycle) throw new Error(`timeline '${uri}' has no on enter / on leave`);
    const actions = new Map<string, readonly Operation[]>(
      (config.actions ?? []).map(action => [action.name, action.startOperations as Operation[]])
    );
    const added: ControllerUse = { added: [], removed: [] };
    walk(
      lifecycle.startOperations as Operation[],
      actions,
      { data: {}, selector: undefined },
      added
    );
    const removed: ControllerUse = { added: [], removed: [] };
    walk(
      lifecycle.endOperations as Operation[],
      actions,
      { data: {}, selector: undefined },
      removed
    );
    return { added: added.added, removed: removed.removed };
  }

  test('compiles the hub and every chapter', () => {
    expect(config.timelines.length).toBeGreaterThanOrEqual(7);
    expect(config.timelines.map(timeline => timeline.uri)).toContain('Hub');
  });

  test('every timeline removes on leave exactly the controllers it adds on enter', () => {
    const unbalanced = config.timelines.flatMap(timeline => {
      const use = balance(timeline.uri);
      const added = sorted(use.added);
      const removed = sorted(use.removed);
      return added.length > 0 && JSON.stringify(added) === JSON.stringify(removed)
        ? []
        : [{ timeline: timeline.uri, added, removed }];
    });
    expect(unbalanced).toEqual([]);
  });

  test('follows enterChapter / leaveChapter into the library', () => {
    const use = balance('Logic');
    expect(sorted(use.added)).toEqual([
      '#c3-to-hub DOMEventListenerController',
      '#progress-fill ProgressbarController',
      '#stage KeyboardController',
      '#stage KeyboardController',
      '#stage KeyboardController',
    ]);
    expect(sorted(use.removed)).toEqual(sorted(use.added));
  });
});
