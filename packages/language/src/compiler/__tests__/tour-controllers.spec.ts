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
 * `selectElement X`). The walk is `controllerBalance` (`../controller-balance.ts`): calls are
 * followed (`requestAction` / `startAction` into `config.actions`) with the call's literal
 * operationData substituted, so `leaveChapter`'s `back` resolves to `"#cN-to-hub"`. The two
 * multisets must be equal and no call may stay unresolved.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Effect } from 'effect';
import type { IEngineConfiguration } from 'eligius';
import { beforeAll, describe, expect, test } from 'vitest';
import { type ControllerBalance, controllerBalance } from '../controller-balance.js';
import { compile } from '../pipeline.js';

const TOUR = fileURLToPath(
  new URL('../../../../../examples/eligian-tour/tour.eligian', import.meta.url)
);

describe('the tour detaches every controller its lifecycle blocks attach', () => {
  let config: IEngineConfiguration;
  let balances: readonly ControllerBalance[];

  beforeAll(async () => {
    config = await Effect.runPromise(compile(readFileSync(TOUR, 'utf-8'), { sourceUri: TOUR }));
    balances = controllerBalance(config);
  });

  function balance(uri: string): ControllerBalance {
    const entry = balances.find(candidate => candidate.timeline === uri);
    if (!entry) throw new Error(`no timeline '${uri}'`);
    return entry;
  }

  test('compiles the hub and every chapter', () => {
    expect(config.timelines.length).toBeGreaterThanOrEqual(7);
    expect(config.timelines.map(timeline => timeline.uri)).toContain('Hub');
  });

  test('every timeline removes on leave exactly the controllers it adds on enter', () => {
    expect(balances.map(entry => entry.timeline)).toEqual(
      config.timelines.map(timeline => timeline.uri)
    );
    for (const entry of balances) {
      expect(entry.unresolved).toEqual([]);
    }
    const unbalanced = balances.flatMap(entry =>
      entry.added.length > 0 && JSON.stringify(entry.added) === JSON.stringify(entry.removed)
        ? []
        : [{ timeline: entry.timeline, added: entry.added, removed: entry.removed }]
    );
    expect(unbalanced).toEqual([]);
  });

  test('follows enterChapter / leaveChapter into the library', () => {
    const entry = balance('Logic');
    expect(entry.unresolved).toEqual([]);
    expect(entry.added).toEqual([
      '#c3-to-hub DOMEventListenerController',
      '#progress-fill ProgressbarController',
      '#stage KeyboardController',
      '#stage KeyboardController',
      '#stage KeyboardController',
    ]);
    expect(entry.removed).toEqual(entry.added);
  });
});
