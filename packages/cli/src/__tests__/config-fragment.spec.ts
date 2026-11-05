/**
 * The shared config fragment (spec 058 phase 2, FR-013, SC-004(6); plan D1):
 * `withoutIds`, `configFragment` (the literate probes' shape) and `fragmentOf`
 * (one timeline or action of it, with its source location from the map).
 */
import * as path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { type CompileResult, compileFile } from '../compile-file.js';
import { configFragment, fragmentOf, withoutIds } from '../mcp/config-fragment.js';

const FIXTURE = path.join(__dirname, '__fixtures__', 'mcp', 'fragment', 'main.eligian');

let compiled: CompileResult;

beforeAll(async () => {
  compiled = await compileFile(FIXTURE);
});

const hasId = (value: unknown): boolean => JSON.stringify(value).includes('"id":');

/** The map id of the config action called `name`, in any list. */
function actionId(name: string): string {
  const entry = Object.entries(compiled.map.actions).find(([, action]) => action.name === name);
  if (!entry) throw new Error(`no map action named ${name}`);
  return entry[0];
}

const selectBox = { systemName: 'selectElement', operationData: { selector: '#box' } };

/** The hand-written probe shape of the fixture (`generate-knowledge.ts` probeFragment). */
const EXPECTED = {
  actions: {
    showPanel: {
      startOperations: [
        { systemName: 'selectElement', operationData: { selector: '#panel' } },
        { systemName: 'setStyle', operationData: { properties: { display: 'block' } } },
      ],
      endOperations: [],
    },
    hidePanel: {
      startOperations: [
        { systemName: 'selectElement', operationData: { selector: '#panel' } },
        { systemName: 'setStyle', operationData: { properties: { display: 'none' } } },
      ],
      endOperations: [],
    },
  },
  timelines: {
    main: {
      type: 'animation',
      duration: 4,
      timelineActions: [
        {
          name: 'timeline-lifecycle',
          duration: { start: 0 },
          startOperations: [
            { systemName: 'requestAction', operationData: { systemName: 'showPanel' } },
            { systemName: 'startAction', operationData: { actionOperationData: {} } },
          ],
          endOperations: [],
        },
        {
          name: 'timeline-action-0-2',
          duration: { start: 0, end: 2 },
          startOperations: [
            selectBox,
            { systemName: 'setStyle', operationData: { properties: { opacity: 1 } } },
          ],
          endOperations: [
            selectBox,
            { systemName: 'setStyle', operationData: { properties: { opacity: 0 } } },
          ],
        },
        {
          name: 'timeline-action-2-4',
          duration: { start: 2, end: 4 },
          startOperations: [
            { systemName: 'requestAction', operationData: { systemName: 'hidePanel' } },
            { systemName: 'startAction', operationData: { actionOperationData: {} } },
          ],
          endOperations: [],
        },
      ],
    },
  },
  initActions: [
    {
      name: 'init-globaldata',
      startOperations: [
        {
          systemName: 'setData',
          operationData: { properties: { '$globaldata.items': ['$globaldata.first', 'b'] } },
        },
      ],
      endOperations: [],
    },
  ],
};

/** An init action selected by id, keyed by its name (so without `name`). */
const INIT_PART = { startOperations: EXPECTED.initActions[0].startOperations, endOperations: [] };

describe('config fragment', () => {
  it('withoutIds removes id at every depth', () => {
    const out = withoutIds({
      id: 'a',
      name: 'x',
      nested: { id: 'b', list: [{ id: 'c', value: 1 }, [{ id: 'd' }]] },
      dropped: undefined,
    });
    expect(hasId(out)).toBe(false);
    expect(out).toEqual({ name: 'x', nested: { list: [{ value: 1 }, [{}]] } });
  });

  it('configFragment keys actions by name and timelines by uri', () => {
    const fragment = configFragment(compiled.config) as Record<string, Record<string, unknown>>;
    expect(Object.keys(fragment.actions)).toEqual(['showPanel', 'hidePanel']);
    expect(Object.keys(fragment.timelines)).toEqual(['main']);
    expect(hasId(fragment)).toBe(false);
  });

  it('configFragment equals the generator probe shape', () => {
    expect(configFragment(compiled.config)).toEqual(EXPECTED);
  });
});

describe('fragmentOf', () => {
  it('timeline by index', () => {
    const fragment = fragmentOf(compiled.config, { timeline: 0 });
    expect(fragment).toEqual({ timelines: { main: EXPECTED.timelines.main } });
    expect(hasId(fragment)).toBe(false);
  });

  it('action by name, then eventActions', () => {
    expect(fragmentOf(compiled.config, { action: 'hidePanel' })).toEqual({
      actions: { hidePanel: EXPECTED.actions.hidePanel },
    });
    const event = fragmentOf(compiled.config, { action: 'onComplete' });
    expect(event).toEqual({
      eventActions: {
        onComplete: {
          eventName: 'timeline-complete',
          startOperations: [{ systemName: 'log', operationData: { logValue: 'done' } }],
        },
      },
    });
    expect(hasId(event)).toBe(false);
  });

  it('mapActionId', () => {
    expect(fragmentOf(compiled.config, { mapActionId: actionId('showPanel') })).toEqual({
      actions: { showPanel: EXPECTED.actions.showPanel },
    });
    expect(fragmentOf(compiled.config, { mapActionId: actionId('onComplete') })).toEqual(
      fragmentOf(compiled.config, { action: 'onComplete' })
    );
    expect(fragmentOf(compiled.config, { mapActionId: actionId('timeline-action-0-2') })).toEqual({
      timelines: {
        main: {
          type: 'animation',
          duration: 4,
          timelineActions: [EXPECTED.timelines.main.timelineActions[1]],
        },
      },
    });
    expect(fragmentOf(compiled.config, { mapActionId: actionId('init-globaldata') })).toEqual({
      initActions: { 'init-globaldata': INIT_PART },
    });
  });

  it('with map, each action gains source { file, line, column }', () => {
    const at = (line: number, column: number) => ({ file: FIXTURE, line, column });
    expect(fragmentOf(compiled.config, { action: 'hidePanel' }, compiled.map)).toEqual({
      actions: { hidePanel: { ...EXPECTED.actions.hidePanel, source: at(10, 1) } },
    });
    // The compiler's source map holds no event action locations yet (ast-transformer.ts
    // calls `buildSourceMap(…, [], timelines)`), so the location is supplied here.
    const eventId = actionId('onComplete');
    const withEvent = {
      ...compiled.map,
      actions: {
        ...compiled.map.actions,
        [eventId]: { ...compiled.map.actions[eventId], location: { line: 15, column: 1 } },
      },
    };
    expect(fragmentOf(compiled.config, { action: 'onComplete' }, withEvent)).toMatchObject({
      eventActions: { onComplete: { source: at(15, 1) } },
    });
    const [lifecycle, ranged, call] = EXPECTED.timelines.main.timelineActions;
    expect(fragmentOf(compiled.config, { timeline: 0 }, compiled.map)).toEqual({
      timelines: {
        main: {
          ...EXPECTED.timelines.main,
          timelineActions: [
            { ...lifecycle, source: at(20, 3) },
            { ...ranged, source: at(23, 3) },
            { ...call, source: at(30, 3) },
          ],
        },
      },
    });
    expect(
      fragmentOf(compiled.config, { mapActionId: actionId('init-globaldata') }, compiled.map)
    ).toEqual({
      initActions: { 'init-globaldata': { ...INIT_PART, source: at(3, 1) } },
    });
  });

  it('unknown selection → undefined', () => {
    expect(fragmentOf(compiled.config, { timeline: 1 })).toBeUndefined();
    expect(fragmentOf(compiled.config, { timeline: -1 })).toBeUndefined();
    expect(fragmentOf(compiled.config, { action: 'nope' })).toBeUndefined();
    expect(fragmentOf(compiled.config, { mapActionId: 'not-an-id' })).toBeUndefined();
  });
});
