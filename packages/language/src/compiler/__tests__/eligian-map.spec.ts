// @vitest-environment jsdom
// jsdom: one test runs the compiled configuration on the real Eligius engine.
/**
 * Audit idea #14: the Eligian map leads from the compiled JSON (and the errors
 * the Eligius engine reports about it) back to the .eligian source.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { Effect } from 'effect';
import {
  EligiusResourceImporter,
  EngineFactory,
  type IEngineActionError,
  type IEngineConfiguration,
} from 'eligius';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { describe, expect, test, vi } from 'vitest';
import { createEligianServices } from '../../eligian-module.js';
import type { Program } from '../../generated/ast.js';
import { transformAST } from '../ast-transformer.js';
import {
  activeTimelineActions,
  buildEligianMap,
  type EligianMap,
  locateEngineError,
} from '../eligian-map.js';
import { compileWithMap, emitJSON, optimize, typeCheck } from '../pipeline.js';

const SOURCE = `endable action inner(sel) [
  selectElement(sel)
  setElementContent("on")
] [
  selectElement(sel)
  setElementContent("")
]
timeline "t" in "#stage" using raf {
  at 0s..2s [ selectElement("#a") inner("#b") ] [ inner("#b") ]
  sequence {
    inner("#c") for 3s
  }
}`;

const parse = parseHelper<Program>(createEligianServices(EmptyFileSystem).Eligian);

/** Config and map through the compiler stages (no CSS validation: no stylesheet here). */
async function compiled(source = SOURCE) {
  const document = await parse(source);
  const ir = await Effect.runPromise(
    transformAST(document.parseResult.value).pipe(
      Effect.flatMap(typeCheck),
      Effect.flatMap(optimize)
    )
  );
  return { config: await Effect.runPromise(emitJSON(ir)), map: buildEligianMap(ir) };
}

const timelineActionId = (config: IEngineConfiguration, index: number) =>
  config.timelines[0].timelineActions[index].id;

describe('Eligian map (audit idea #14)', () => {
  test('maps every action and operation of the compiled config to its source line', async () => {
    const { config, map } = await compiled();
    const event = map.actions[timelineActionId(config, 0)];

    expect(event).toMatchObject({
      kind: 'timeline',
      timelineUri: 't',
      duration: { start: 0, end: 2 },
    });
    expect(event.location?.line).toBe(9);
    expect(event.start.map(o => o.systemName)).toEqual([
      'selectElement',
      'requestAction',
      'startAction',
    ]);
    expect(event.start[1].calls).toBe('inner');
    const inner = Object.values(map.actions).find(a => a.kind === 'action' && a.name === 'inner')!;
    expect(inner.start.map(o => o.location?.line)).toEqual([2, 3]);
    expect(inner.end.map(o => o.location?.line)).toEqual([5, 6]);
  });

  test('locates an error in the timeline action itself, or in an action it calls', async () => {
    const { config, map } = await compiled();
    const actionId = timelineActionId(config, 0);

    // Operation 0 of the start phase is the timeline action's own selectElement,
    // or inner's: Eligius names only the innermost operation, so both match
    const ambiguous = locateEngineError(map, {
      actionId,
      phase: 'start',
      operationSystemName: 'selectElement',
      operationIndex: 0,
    });
    expect(ambiguous?.location?.line).toBe(9);
    expect(ambiguous?.via).toEqual([]);
    expect(ambiguous?.alternatives.map(a => [a.operation.location?.line, a.via])).toEqual([
      [2, ['inner']],
    ]);

    // Operation 1 is not setElementContent in the timeline action: it is inner's start operation 1
    const nested = locateEngineError(map, {
      actionId,
      phase: 'start',
      operationSystemName: 'setElementContent',
      operationIndex: 1,
    });
    expect(nested?.location?.line).toBe(3);
    expect(nested?.via).toEqual(['inner']);
    expect(nested?.alternatives).toEqual([]);

    // In the end phase the called action's end operations apply (endAction)
    expect(
      locateEngineError(map, {
        actionId,
        phase: 'end',
        operationSystemName: 'setElementContent',
        operationIndex: 1,
      })?.location?.line
    ).toBe(6);

    // Without an operation the action's own location is used
    expect(locateEngineError(map, { actionId, phase: 'start' })).toMatchObject({
      location: { line: 9 },
      alternatives: [],
    });
    expect(locateEngineError(map, { actionId: 'nope', phase: 'start' })).toBeUndefined();
  });

  test('knows which timeline events run at a position (live playhead)', async () => {
    const { map } = await compiled();
    const lines = (position: number) =>
      activeTimelineActions(map, 't', position).map(a => a.location?.line);

    expect(lines(1)).toEqual([9]);
    expect(lines(3)).toEqual([11]);
    expect(lines(6)).toEqual([]);
  });

  test('compileWithMap returns the config with its map', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'eligian-map-'));
    try {
      writeFileSync(path.join(dir, 's.css'), '#stage, #a { color: red; }');
      const sourceUri = path.join(dir, 'p.eligian');
      const source = `styles "./s.css"
timeline "t" in "#stage" using raf { at 0s..1s [ selectElement("#a") ] }`;
      writeFileSync(sourceUri, source);
      const { config, map } = await Effect.runPromise(compileWithMap(source, { sourceUri }));
      expect(map.actions[timelineActionId(config, 0)]?.location?.line).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('an error in a called action at an index the caller shares: both places', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    const { config, map } = await compiled(`action inner() [
  getControllerInstance("NoSuchController")
]
timeline "t" in "#stage" using raf {
  at 0s..5s [
    getControllerInstance("LabelController")
    inner()
  ]
}`);
    const runnable = {
      ...config,
      containerSelector: '#app',
      layoutTemplate: '<div id="stage"></div>',
    } as unknown as IEngineConfiguration;
    const { engine } = new EngineFactory(new EligiusResourceImporter(), window).createEngine(
      runnable
    );
    const errors: IEngineActionError[] = [];
    engine.on('error', error => errors.push(error));
    await engine.init();
    await engine.seek(1);
    await vi.waitFor(() => expect(errors.length).toBeGreaterThan(0));
    await engine.destroy();

    // The engine reports getControllerInstance at index 0: the timeline
    // action's own (line 6) matches as well as inner's (line 2), which failed
    const [error] = errors;
    expect([error.operationSystemName, error.operationIndex]).toEqual(['getControllerInstance', 0]);
    const located = locateEngineError(map as EligianMap, error);
    const places = [located, ...(located?.alternatives ?? [])].map(
      c => c?.operation?.location?.line
    );
    expect(places).toEqual([6, 2]);
    expect(located?.alternatives[0].via).toEqual(['inner']);
  });

  test("an error the real engine reports maps to the failing operation's source line", async () => {
    document.body.innerHTML = '<div id="app"></div>';
    const { config, map } = await compiled(`timeline "t" in "#stage" using raf {
  at 0s..5s [
    selectElement("#stage")
    log("before")
    getControllerInstance("NoSuchController")
  ]
}`);
    const runnable = {
      ...config,
      containerSelector: '#app',
      layoutTemplate: '<div id="stage"></div>',
    } as unknown as IEngineConfiguration;
    const { engine } = new EngineFactory(new EligiusResourceImporter(), window).createEngine(
      runnable
    );
    const errors: IEngineActionError[] = [];
    engine.on('error', error => errors.push(error));
    await engine.init();
    await engine.seek(1);
    await vi.waitFor(() => expect(errors.length).toBeGreaterThan(0));
    await engine.destroy();

    const [error] = errors;
    const located = locateEngineError(map as EligianMap, error);
    expect(located?.operation?.systemName).toBe(error.operationSystemName);
    expect(located?.location?.line).toBe(5);
  });
});
