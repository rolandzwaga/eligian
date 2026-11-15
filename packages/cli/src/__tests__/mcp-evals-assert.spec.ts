/**
 * Spec 058 Phase 3 (FR-011–FR-013, FR-028; SC-007(1)–(5); plan D1): the eval assertion library.
 * Every kind has a passing and a failing test over a small config (built here or under
 * `__fixtures__/evals/assert/`) or a project (a fixture directory or a temp copy of one).
 * `interactions/main.eligian` is compiled once with `compileFile`, so the listener, call and
 * label shapes are the compiler's own.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { EligianMap, IEngineConfiguration } from '@eligian/language';
import { controllerBalance } from '@eligian/language/mcp';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { compileFile } from '../compile-file.js';
import {
  ASSERTION_KINDS,
  type Assertion,
  type AssertionInput,
  type AssertionResult,
  evaluateAssertions,
  parseAssertions,
} from '../mcp/evals/assert.js';
import { readStoryboard } from '../mcp/storyboard.js';

const FIXTURES = path.join(__dirname, '__fixtures__', 'evals', 'assert');
const INTERACTIONS = path.join(FIXTURES, 'interactions');
const LIBRARY = path.join(FIXTURES, 'library');
const DATAFLOW_START = path.join(FIXTURES, 'fix-dataflow-start');
const SELECTORS_START = path.join(FIXTURES, 'fix-selectors-start');

type Data = Record<string, unknown>;
interface Op {
  readonly systemName: string;
  readonly operationData?: Data;
}

const op = (systemName: string, operationData?: Data): Op =>
  operationData === undefined ? { systemName } : { systemName, operationData };
const call = (name: string, args: Data = {}): Op[] => [
  op('requestAction', { systemName: name }),
  op('startAction', { actionOperationData: args }),
];
const listener = (selector: string, controller: string, data: Data): Op[] => [
  op('selectElement', { selector }),
  op('getControllerInstance', { systemName: controller }),
  op('addControllerToElement', data),
];
const action = (name: string, startOperations: Op[], endOperations: Op[] = []) => ({
  id: `action-${name}`,
  name,
  startOperations,
  endOperations,
});
const ranged = (start: number, end: number, startOperations: Op[], endOperations: Op[] = []) => ({
  id: `range-${start}-${end}`,
  name: `timeline-action-${start}-${end}`,
  duration: { start, end },
  startOperations,
  endOperations,
});
const lifecycle = (startOperations: Op[], endOperations: Op[] = []) => ({
  id: 'lifecycle',
  name: 'timeline-lifecycle',
  duration: { start: 0 },
  startOperations,
  endOperations,
});
const timeline = (uri: string, timelineActions: unknown[], extra: Data = {}) => ({
  id: `timeline-${uri}`,
  uri,
  type: 'animation',
  duration: 10,
  loop: false,
  selector: '#stage',
  timelineActions,
  ...extra,
});
const configOf = (partial: Data): IEngineConfiguration =>
  ({ id: 'config', actions: [], timelines: [], ...partial }) as unknown as IEngineConfiguration;

const inputOf = (config: IEngineConfiguration, extra: Partial<AssertionInput> = {}) =>
  ({
    projectDir: INTERACTIONS,
    entry: 'main.eligian',
    config,
    casesDir: FIXTURES,
    ...extra,
  }) as AssertionInput;

const evaluate = (input: AssertionInput, assertion: Data): AssertionResult => {
  const [result] = evaluateAssertions(input, [assertion as Assertion]);
  expect(result.kind).toBe(assertion.kind);
  expect(typeof result.detail).toBe('string');
  return result;
};

const readJson = (file: string): IEngineConfiguration =>
  JSON.parse(fs.readFileSync(file, 'utf8')) as IEngineConfiguration;

const BEAT_HEADER =
  '| timeline | start | end | selector | change | end-block |\n|---|---|---|---|---|---|';
const INTERACTION_HEADER = '| trigger | target | verb | timeline |\n|---|---|---|---|';
const storyboardOf = (beats: readonly string[], interactions: readonly string[] = []) =>
  readStoryboard(
    [
      '# Storyboard',
      '',
      BEAT_HEADER,
      ...beats,
      '',
      '## interactions',
      '',
      INTERACTION_HEADER,
      ...interactions,
    ].join('\n')
  );

let compiled: { config: IEngineConfiguration; map: EligianMap };
let interactions: AssertionInput;

beforeAll(async () => {
  const result = await compileFile(path.join(INTERACTIONS, 'main.eligian'));
  compiled = { config: result.config, map: result.map };
  interactions = inputOf(compiled.config, {
    map: compiled.map,
    checkCodes: ['controller-imbalance'],
  });
});

const temps: string[] = [];
const tempProject = (from?: string): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-evals-assert-'));
  temps.push(dir);
  if (from !== undefined) fs.cpSync(from, dir, { recursive: true });
  return dir;
};
afterEach(() => {
  for (const dir of temps.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('ASSERTION_KINDS', () => {
  it('lists the kinds of the plan D1 table', () => {
    expect([...ASSERTION_KINDS].sort()).toEqual(
      [
        'timelines.count',
        'timeline',
        'timeline.rangedActions',
        'timelines.lifecycle',
        'timeline.addsController',
        'timeline.scrollSelectorInLayout',
        'timeline.rangeTouches',
        'actions.named',
        'actions.called',
        'operations.used',
        'controllers.used',
        'controllers.balanced',
        'interactions.keyboard',
        'interactions.listener',
        'interactions.seekTo',
        'interactions.noWait',
        'replay.resetThenSeek',
        'stagger.spaced',
        'origins.present',
        'check.codesAbsent',
        'files.exist',
        'layout.hasId',
        'layout.gainedCssOnlyIds',
        'css.definesStateClasses',
        'css.hasRule',
        'locales.languages',
        'source.blocks',
        'source.provider',
        'source.label',
        'source.labelSeek',
        'source.extensions',
        'library.file',
        'library.imports',
        'library.jsdoc',
        'library.checksClean',
        'dataflow.callsPreserved',
        'dataflow.selectedBeforeAddClass',
        'storyboard.exists',
        'storyboard.beatsCovered',
        'beats.min',
        'config.equivalent',
      ].sort()
    );
  });
});

describe('parseAssertions', () => {
  it('accepts the plan F2 shapes', () => {
    const parsed = parseAssertions([
      { kind: 'timelines.count', type: 'mediaplayer', equals: 1 },
      { kind: 'timeline', at: 0, type: 'animation', duration: 10 },
      {
        kind: 'timeline',
        type: 'mediaplayer',
        positionSource: 'VideoPositionSource',
        from: 'media/intro.mp4',
      },
      { kind: 'actions.named', prefix: '__nav__' },
      { kind: 'operations.used', anyOf: ['calc', 'math'], all: ['setElementContent'] },
      { kind: 'source.blocks', keyword: 'stagger', equals: 1 },
      { kind: 'source.blocks', anyOf: ['for', 'sequence'] },
      {
        kind: 'source.extensions',
        module: './host.ts',
        operations: [{ name: 'score', params: 'answer: string' }],
      },
      { kind: 'controllers.balanced' },
      { kind: 'beats.min', n: 'storyboard' },
      { kind: 'beats.min', n: 3 },
      { kind: 'config.equivalent', fixture: 'fixtures/port-from-json/config.json' },
    ]);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.assertions).toHaveLength(12);
  });

  it('rejects an unknown kind', () => {
    const parsed = parseAssertions([{ kind: 'timelines.cuont', equals: 1 }]);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.message).toContain('assertion 0');
      expect(parsed.message).toContain("unknown kind 'timelines.cuont'");
    }
  });

  it('rejects a missing parameter', () => {
    const parsed = parseAssertions([
      { kind: 'files.exist', paths: ['a'] },
      { kind: 'layout.hasId' },
    ]);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.message).toContain('assertion 1');
      expect(parsed.message).toContain('layout.hasId');
    }
  });

  it('rejects an unknown parameter', () => {
    const parsed = parseAssertions([{ kind: 'layout.hasId', ids: ['a'], idz: ['b'] }]);
    expect(parsed.ok).toBe(false);
  });

  it('rejects a kind whose alternatives are all missing', () => {
    expect(parseAssertions([{ kind: 'actions.named' }]).ok).toBe(false);
    expect(parseAssertions([{ kind: 'timelines.count' }]).ok).toBe(false);
    expect(parseAssertions([{ kind: 'timeline', duration: 1 }]).ok).toBe(false);
  });

  it('rejects a non-array', () => {
    expect(parseAssertions({ kind: 'controllers.balanced' }).ok).toBe(false);
  });
});

describe('timelines.count', () => {
  const config = configOf({
    timelines: [timeline('A', []), timeline('B', [], { type: 'mediaplayer' })],
  });
  it('passes', () => {
    expect(evaluate(inputOf(config), { kind: 'timelines.count', equals: 2 }).pass).toBe(true);
    expect(
      evaluate(inputOf(config), { kind: 'timelines.count', min: 1, type: 'mediaplayer' }).pass
    ).toBe(true);
  });
  it('fails', () => {
    const result = evaluate(inputOf(config), { kind: 'timelines.count', equals: 3 });
    expect(result).toMatchObject({ kind: 'timelines.count', pass: false });
    expect(result.detail).toContain('2');
    expect(
      evaluate(inputOf(config), { kind: 'timelines.count', min: 2, type: 'mediaplayer' }).pass
    ).toBe(false);
  });
});

const mediaConfig = configOf({
  timelines: [
    timeline('Hub', []),
    timeline('./media/intro.mp4', [], {
      type: 'mediaplayer',
      duration: 30,
      positionSource: {
        selector: '#player',
        sources: [{ src: './media/intro.mp4', type: 'video/mp4' }],
      },
    }),
    timeline('Article', [ranged(0, 2, []), ranged(2, 4, []), lifecycle([])], {
      positionSource: { systemName: 'ScrollPositionSource', selector: '#article', duration: 10 },
    }),
  ],
  timelineProviderSettings: {
    animation: { positionSource: { systemName: 'RafPositionSource' } },
    mediaplayer: { positionSource: { systemName: 'VideoPositionSource', selector: '' } },
  },
});
const mediaMap = {
  version: 1,
  actions: {},
  timelineNames: ['Hub', 'Intro', 'Article'],
} as EligianMap;

describe('timeline', () => {
  it('passes', () => {
    const input = inputOf(mediaConfig, { map: mediaMap });
    expect(
      evaluate(input, { kind: 'timeline', at: 0, type: 'animation', duration: 10, loop: false })
        .pass
    ).toBe(true);
    expect(
      evaluate(input, {
        kind: 'timeline',
        type: 'mediaplayer',
        positionSource: 'VideoPositionSource',
        from: 'media/intro.mp4',
        sourceType: 'video/mp4',
      }).pass
    ).toBe(true);
    expect(evaluate(input, { kind: 'timeline', name: 'Intro', duration: 30 }).pass).toBe(true);
    expect(
      evaluate(input, {
        kind: 'timeline',
        at: 2,
        positionSource: 'ScrollPositionSource',
        hasDuration: true,
      }).pass
    ).toBe(true);
  });
  it('fails', () => {
    const input = inputOf(mediaConfig, { map: mediaMap });
    const result = evaluate(input, { kind: 'timeline', at: 0, duration: 12 });
    expect(result).toMatchObject({ kind: 'timeline', pass: false });
    expect(result.detail).toContain('duration');
    expect(
      evaluate(input, { kind: 'timeline', at: 0, positionSource: 'ScrollPositionSource' }).pass
    ).toBe(false);
    expect(evaluate(input, { kind: 'timeline', name: 'Outro' }).detail).toContain('Outro');
    expect(evaluate(inputOf(configOf({})), { kind: 'timeline', type: 'mediaplayer' }).pass).toBe(
      false
    );
  });
});

describe('timeline.rangedActions', () => {
  it('passes', () => {
    const input = inputOf(mediaConfig, { map: mediaMap });
    expect(evaluate(input, { kind: 'timeline.rangedActions', name: 'Article', min: 2 }).pass).toBe(
      true
    );
  });
  it('fails', () => {
    const input = inputOf(mediaConfig, { map: mediaMap });
    const result = evaluate(input, { kind: 'timeline.rangedActions', at: 2, min: 3 });
    expect(result).toMatchObject({ kind: 'timeline.rangedActions', pass: false });
    expect(result.detail).toContain('2 ranged');
  });
});

describe('timelines.lifecycle', () => {
  const config = configOf({
    timelines: [
      timeline('Problem', [lifecycle([op('selectElement', { selector: '#a' })], [op('wait')])]),
      timeline('Solution', [lifecycle([op('selectElement', { selector: '#a' })])]),
    ],
  });
  it('passes', () => {
    expect(
      evaluate(inputOf(config), {
        kind: 'timelines.lifecycle',
        names: ['Problem'],
        enter: true,
        leave: true,
      }).pass
    ).toBe(true);
    expect(
      evaluate(inputOf(config), { kind: 'timelines.lifecycle', names: ['Solution'], enter: true })
        .pass
    ).toBe(true);
  });
  it('fails', () => {
    const result = evaluate(inputOf(config), {
      kind: 'timelines.lifecycle',
      names: ['Problem', 'Solution', 'Results'],
      enter: true,
      leave: true,
    });
    expect(result).toMatchObject({ kind: 'timelines.lifecycle', pass: false });
    expect(result.detail).toContain("'Solution' has no on leave");
    expect(result.detail).toContain("no timeline 'Results'");
  });
});

describe('timeline.addsController', () => {
  const regression = readJson(path.join(FIXTURES, 'controller-param-selector.json'));
  it('passes', () => {
    expect(
      evaluate(inputOf(regression), {
        kind: 'timeline.addsController',
        controller: 'DOMEventListenerController',
        names: ['Problem'],
      }).pass
    ).toBe(true);
  });
  it('fails', () => {
    const result = evaluate(inputOf(regression), {
      kind: 'timeline.addsController',
      controller: 'KeyboardController',
      names: ['Problem'],
    });
    expect(result).toMatchObject({ kind: 'timeline.addsController', pass: false });
    expect(result.detail).toContain('Problem');
  });
});

describe('timeline.scrollSelectorInLayout', () => {
  const scrollAt = (selector: string) =>
    configOf({
      timelines: [
        timeline('Scroll', [], {
          positionSource: { systemName: 'ScrollPositionSource', selector, duration: 10 },
        }),
      ],
    });
  it('passes', () => {
    expect(
      evaluate(inputOf(scrollAt('#article')), { kind: 'timeline.scrollSelectorInLayout', at: 0 })
        .pass
    ).toBe(true);
  });
  it('fails', () => {
    const result = evaluate(inputOf(scrollAt('#missing')), {
      kind: 'timeline.scrollSelectorInLayout',
      at: 0,
    });
    expect(result).toMatchObject({ kind: 'timeline.scrollSelectorInLayout', pass: false });
    expect(result.detail).toContain('#missing');
  });
});

describe('timeline.rangeTouches', () => {
  it('passes', () => {
    // `at 1s..2s [ show("#box") ]`: the selector reaches the range through a called action
    expect(evaluate(interactions, { kind: 'timeline.rangeTouches', selector: '#box' }).pass).toBe(
      true
    );
  });
  it('fails', () => {
    // #play is only touched by the lifecycle action, which is not ranged
    const result = evaluate(interactions, { kind: 'timeline.rangeTouches', selector: '#play' });
    expect(result).toMatchObject({ kind: 'timeline.rangeTouches', pass: false });
  });
});

describe('actions.named', () => {
  it('passes', () => {
    expect(
      evaluate(interactions, { kind: 'actions.named', names: ['replay', 'resetView'] }).pass
    ).toBe(true);
    expect(evaluate(interactions, { kind: 'actions.named', prefix: '__nav__' }).pass).toBe(true);
  });
  it('fails', () => {
    const result = evaluate(interactions, { kind: 'actions.named', names: ['replay', 'nope'] });
    expect(result).toMatchObject({ kind: 'actions.named', pass: false });
    expect(result.detail).toContain('nope');
    expect(evaluate(interactions, { kind: 'actions.named', prefix: '__zzz' }).pass).toBe(false);
  });
});

describe('actions.called', () => {
  it('passes', () => {
    expect(
      evaluate(interactions, { kind: 'actions.called', names: ['show', 'resetView', 'hideLater'] })
        .pass
    ).toBe(true);
  });
  it('fails', () => {
    // markResult only runs from a listener: no requestAction names it
    const result = evaluate(interactions, { kind: 'actions.called', names: ['markResult'] });
    expect(result).toMatchObject({ kind: 'actions.called', pass: false });
    expect(result.detail).toContain('markResult');
  });
});

describe('operations.used', () => {
  it('passes', () => {
    expect(
      evaluate(interactions, {
        kind: 'operations.used',
        all: ['wait', 'broadcastEvent'],
        anyOf: ['calc', 'addClass'],
      }).pass
    ).toBe(true);
  });
  it('fails', () => {
    const result = evaluate(interactions, { kind: 'operations.used', all: ['wait', 'calc'] });
    expect(result).toMatchObject({ kind: 'operations.used', pass: false });
    expect(result.detail).toContain('calc');
    expect(evaluate(interactions, { kind: 'operations.used', anyOf: ['calc', 'math'] }).pass).toBe(
      false
    );
  });
});

describe('controllers.used', () => {
  it('passes', () => {
    expect(
      evaluate(interactions, {
        kind: 'controllers.used',
        all: ['DOMEventListenerController', 'KeyboardController'],
      }).pass
    ).toBe(true);
  });
  it('fails', () => {
    const result = evaluate(interactions, {
      kind: 'controllers.used',
      anyOf: ['ProgressbarController', 'SubtitlesController'],
    });
    expect(result).toMatchObject({ kind: 'controllers.used', pass: false });
  });
});

describe('controllers.balanced', () => {
  const regression = readJson(path.join(FIXTURES, 'controller-param-selector.json'));
  it('passes', () => {
    expect(evaluate(inputOf(regression), { kind: 'controllers.balanced' }).pass).toBe(true);
  });
  it('fails', () => {
    const result = evaluate(interactions, { kind: 'controllers.balanced' });
    expect(result).toMatchObject({ kind: 'controllers.balanced', pass: false });
    expect(result.detail).toContain('Intro');
  });
  it('agrees with controllerBalance on the Phase 2 regression fixture', () => {
    // The selector of the removal reaches `unclick` as an action parameter (Phase 2 T058)
    const balanced = controllerBalance(regression).every(
      entry =>
        JSON.stringify(entry.added) === JSON.stringify(entry.removed) &&
        entry.unresolved.length === 0
    );
    expect(balanced).toBe(true);
    expect(evaluate(inputOf(regression), { kind: 'controllers.balanced' }).pass).toBe(balanced);
    const imbalanced = controllerBalance(compiled.config).every(
      entry => JSON.stringify(entry.added) === JSON.stringify(entry.removed)
    );
    expect(evaluate(interactions, { kind: 'controllers.balanced' }).pass).toBe(imbalanced);
  });
});

describe('interactions.keyboard', () => {
  it('passes', () => {
    expect(
      evaluate(interactions, { kind: 'interactions.keyboard', keys: ['ArrowRight'] }).pass
    ).toBe(true);
  });
  it('fails', () => {
    const result = evaluate(interactions, {
      kind: 'interactions.keyboard',
      keys: ['ArrowRight', 'ArrowLeft'],
    });
    expect(result).toMatchObject({ kind: 'interactions.keyboard', pass: false });
    expect(result.detail).toContain('ArrowLeft');
  });
});

describe('interactions.listener', () => {
  it('passes', () => {
    expect(
      evaluate(interactions, {
        kind: 'interactions.listener',
        controller: 'DOMEventListenerController',
        event: 'click',
        runs: true,
      }).pass
    ).toBe(true);
  });
  it('fails', () => {
    const onlyPlay = configOf({
      actions: [
        action('__on__play', [op('broadcastEvent', { eventName: 'timeline-play-request' })]),
      ],
      timelines: [
        timeline('Intro', [
          lifecycle(
            listener('#a', 'DOMEventListenerController', {
              eventName: 'click',
              actions: ['__on__play'],
            })
          ),
        ]),
      ],
    });
    const result = evaluate(inputOf(onlyPlay), {
      kind: 'interactions.listener',
      controller: 'DOMEventListenerController',
      event: 'click',
      runs: true,
    });
    expect(result).toMatchObject({ kind: 'interactions.listener', pass: false });
    expect(
      evaluate(interactions, {
        kind: 'interactions.listener',
        controller: 'DOMEventListenerController',
        event: 'dblclick',
      }).pass
    ).toBe(false);
  });
});

describe('interactions.seekTo', () => {
  it('passes', () => {
    // `seek reveal.start` is compiled to the label's time, 3
    expect(evaluate(interactions, { kind: 'interactions.seekTo', position: 3 }).pass).toBe(true);
  });
  it('fails', () => {
    const result = evaluate(interactions, { kind: 'interactions.seekTo', position: 12 });
    expect(result).toMatchObject({ kind: 'interactions.seekTo', pass: false });
  });
});

describe('interactions.noWait', () => {
  it('passes', () => {
    expect(
      evaluate(interactions, { kind: 'interactions.noWait', triggers: ['#restart', '#answer-a'] })
        .pass
    ).toBe(true);
  });
  it('fails', () => {
    const result = evaluate(interactions, {
      kind: 'interactions.noWait',
      triggers: ['#answer-a', '#answer-b'],
    });
    expect(result).toMatchObject({ kind: 'interactions.noWait', pass: false });
    expect(result.detail).toContain('#answer-b');
  });
  it("a wait in an action the listener's action calls fails", () => {
    // #answer-b runs answerB(), which calls hideLater(), which waits
    const result = evaluate(interactions, { kind: 'interactions.noWait', triggers: ['#answer-b'] });
    expect(result.pass).toBe(false);
    expect(result.detail).toContain('wait');
  });
  it('a timeline range passes', () => {
    // #answer-a runs markResult(); the result is hidden by the 3s..5s range, not by a wait
    expect(
      evaluate(interactions, { kind: 'interactions.noWait', triggers: ['#answer-a'] }).pass
    ).toBe(true);
  });
  it('a trigger with no listener fails', () => {
    const result = evaluate(interactions, { kind: 'interactions.noWait', triggers: ['#nothing'] });
    expect(result.pass).toBe(false);
    expect(result.detail).toContain('#nothing');
  });
});

describe('replay.resetThenSeek', () => {
  it('passes', () => {
    expect(evaluate(interactions, { kind: 'replay.resetThenSeek', trigger: '#restart' }).pass).toBe(
      true
    );
  });
  it('fails', () => {
    // #skip seeks to 3 without a reset
    const result = evaluate(interactions, { kind: 'replay.resetThenSeek', trigger: '#skip' });
    expect(result).toMatchObject({ kind: 'replay.resetThenSeek', pass: false });
    expect(evaluate(interactions, { kind: 'replay.resetThenSeek', trigger: '#nothing' }).pass).toBe(
      false
    );
  });
});

describe('stagger.spaced', () => {
  const staggered = (gap: number) =>
    configOf({
      timelines: [
        timeline(
          'List',
          [0, 1, 2, 3, 4, 5].map(i => ({
            ...ranged(i * gap, i * gap + 1, []),
            name: `stagger-inline-${i}-${i * gap}-${i * gap + 1}`,
          }))
        ),
      ],
    });
  it('passes', () => {
    expect(
      evaluate(inputOf(staggered(0.4)), { kind: 'stagger.spaced', count: 6, gap: 0.4 }).pass
    ).toBe(true);
  });
  it('fails', () => {
    const result = evaluate(inputOf(staggered(0.5)), {
      kind: 'stagger.spaced',
      count: 6,
      gap: 0.4,
    });
    expect(result).toMatchObject({ kind: 'stagger.spaced', pass: false });
    expect(result.detail).toContain('0.5');
  });
});

describe('origins.present', () => {
  it('passes', () => {
    expect(
      evaluate(interactions, { kind: 'origins.present', all: ['call', 'interaction'] }).pass
    ).toBe(true);
  });
  it('fails', () => {
    const result = evaluate(interactions, {
      kind: 'origins.present',
      all: ['erased-save', 'erased-restore'],
    });
    expect(result).toMatchObject({ kind: 'origins.present', pass: false });
    expect(result.detail).toContain('erased-save');
    expect(
      evaluate(inputOf(compiled.config), { kind: 'origins.present', all: ['call'] }).detail
    ).toContain('no eligian map');
  });
});

describe('check.codesAbsent', () => {
  it('passes', () => {
    expect(
      evaluate(interactions, { kind: 'check.codesAbsent', codes: ['eligius-W151'] }).pass
    ).toBe(true);
  });
  it('fails', () => {
    const result = evaluate(interactions, {
      kind: 'check.codesAbsent',
      codes: ['eligius-W151', 'controller-imbalance'],
    });
    expect(result).toMatchObject({ kind: 'check.codesAbsent', pass: false });
    expect(result.detail).toContain('controller-imbalance');
    expect(
      evaluate(inputOf(compiled.config), { kind: 'check.codesAbsent', codes: ['x'] }).pass
    ).toBe(false);
  });
});

describe('files.exist', () => {
  it('passes', () => {
    expect(
      evaluate(interactions, { kind: 'files.exist', paths: ['layout.html', 'styles.css'] }).pass
    ).toBe(true);
  });
  it('fails', () => {
    const result = evaluate(interactions, {
      kind: 'files.exist',
      paths: ['layout.html', 'host.ts'],
    });
    expect(result).toMatchObject({ kind: 'files.exist', pass: false });
    expect(result.detail).toContain('host.ts');
  });
});

describe('layout.hasId', () => {
  it('passes', () => {
    expect(evaluate(interactions, { kind: 'layout.hasId', ids: ['box', 'result'] }).pass).toBe(
      true
    );
  });
  it('fails', () => {
    const result = evaluate(interactions, { kind: 'layout.hasId', ids: ['box', 'headline'] });
    expect(result).toMatchObject({ kind: 'layout.hasId', pass: false });
    expect(result.detail).toContain('headline');
  });
});

describe('layout.gainedCssOnlyIds', () => {
  it('passes', () => {
    const dir = tempProject(SELECTORS_START);
    fs.writeFileSync(
      path.join(dir, 'layout.html'),
      '<div id="stage"><h1 id="title">Title</h1><div id="panel"></div></div>\n'
    );
    const result = evaluate(inputOf(configOf({}), { projectDir: dir, startDir: SELECTORS_START }), {
      kind: 'layout.gainedCssOnlyIds',
    });
    expect(result).toMatchObject({ kind: 'layout.gainedCssOnlyIds', pass: true });
  });
  it('fails', () => {
    const result = evaluate(
      inputOf(configOf({}), { projectDir: SELECTORS_START, startDir: SELECTORS_START }),
      { kind: 'layout.gainedCssOnlyIds' }
    );
    expect(result).toMatchObject({ kind: 'layout.gainedCssOnlyIds', pass: false });
    expect(result.detail).toContain('panel');
    expect(evaluate(interactions, { kind: 'layout.gainedCssOnlyIds' }).detail).toContain('start');
  });
});

describe('css.definesStateClasses', () => {
  it('passes', () => {
    expect(evaluate(interactions, { kind: 'css.definesStateClasses' }).pass).toBe(true);
    expect(
      evaluate(interactions, { kind: 'css.definesStateClasses', classes: ['visible'] }).pass
    ).toBe(true);
  });
  it('fails', () => {
    const result = evaluate(interactions, { kind: 'css.definesStateClasses', classes: ['in'] });
    expect(result).toMatchObject({ kind: 'css.definesStateClasses', pass: false });
    expect(result.detail).toContain("'in'");
  });
});

describe('css.hasRule', () => {
  it('passes', () => {
    expect(
      evaluate(interactions, {
        kind: 'css.hasRule',
        selector: '.eligius-video',
        anyProperty: ['width', 'max-width'],
      }).pass
    ).toBe(true);
  });
  it('fails', () => {
    const result = evaluate(interactions, {
      kind: 'css.hasRule',
      selector: '.visible',
      anyProperty: ['width', 'height'],
    });
    expect(result).toMatchObject({ kind: 'css.hasRule', pass: false });
    expect(result.detail).toContain('.visible');
  });
});

describe('locales.languages', () => {
  it('passes', () => {
    expect(evaluate(interactions, { kind: 'locales.languages', codes: ['en-US'] }).pass).toBe(true);
  });
  it('fails', () => {
    const result = evaluate(interactions, { kind: 'locales.languages', codes: ['en-US', 'nl-NL'] });
    expect(result).toMatchObject({ kind: 'locales.languages', pass: false });
    expect(result.detail).toContain('nl-NL');
  });
});

describe('source.blocks', () => {
  it('passes', () => {
    // "timeline-seek-request" is a string: only the two declarations count
    expect(
      evaluate(interactions, { kind: 'source.blocks', keyword: 'timeline', equals: 2 }).pass
    ).toBe(true);
    expect(
      evaluate(interactions, { kind: 'source.blocks', anyOf: ['sequence', 'action'] }).pass
    ).toBe(true);
  });
  it('fails', () => {
    const result = evaluate(interactions, { kind: 'source.blocks', keyword: 'stagger', equals: 1 });
    expect(result).toMatchObject({ kind: 'source.blocks', pass: false });
    expect(result.detail).toContain('0');
    expect(evaluate(interactions, { kind: 'source.blocks', anyOf: ['for', 'sequence'] }).pass).toBe(
      false
    );
  });
});

describe('source.provider', () => {
  it('passes', () => {
    expect(evaluate(interactions, { kind: 'source.provider', name: 'raf' }).pass).toBe(true);
  });
  it('fails', () => {
    const result = evaluate(interactions, { kind: 'source.provider', name: 'audio' });
    expect(result).toMatchObject({ kind: 'source.provider', pass: false });
  });
});

describe('source.label', () => {
  it('passes', () => {
    expect(evaluate(interactions, { kind: 'source.label', name: 'reveal' }).pass).toBe(true);
  });
  it('fails', () => {
    const result = evaluate(interactions, { kind: 'source.label', name: 'intro' });
    expect(result).toMatchObject({ kind: 'source.label', pass: false });
  });
});

describe('source.labelSeek', () => {
  it('passes', () => {
    expect(
      evaluate(interactions, { kind: 'source.labelSeek', label: 'reveal', anchor: 'start' }).pass
    ).toBe(true);
  });
  it('fails', () => {
    const result = evaluate(interactions, {
      kind: 'source.labelSeek',
      label: 'reveal',
      anchor: 'end',
    });
    expect(result).toMatchObject({ kind: 'source.labelSeek', pass: false });
  });
  it('seek reveal.start passes', () => {
    const dir = tempProject();
    fs.writeFileSync(
      path.join(dir, 'main.eligian'),
      'timeline "T" in "#s" using raf {\n  on enter [ on click "#skip" seek reveal.start ]\n  at 12s..15s as reveal [ wait(1) ]\n}\n'
    );
    expect(
      evaluate(inputOf(configOf({}), { projectDir: dir }), {
        kind: 'source.labelSeek',
        label: 'reveal',
        anchor: 'start',
      }).pass
    ).toBe(true);
  });
  it('an unused as reveal label with a literal seek 12s fails', () => {
    const dir = tempProject();
    fs.writeFileSync(
      path.join(dir, 'main.eligian'),
      'timeline "T" in "#s" using raf {\n  on enter [ on click "#skip" seek 12s ]\n  // seek reveal.start\n  at 12s..15s as reveal [ wait(1) ]\n}\n'
    );
    const result = evaluate(inputOf(configOf({}), { projectDir: dir }), {
      kind: 'source.labelSeek',
      label: 'reveal',
      anchor: 'start',
    });
    expect(result.pass).toBe(false);
    expect(result.detail).toContain('reveal.start');
  });
});

describe('source.extensions', () => {
  const project = () => {
    const dir = tempProject();
    fs.writeFileSync(
      path.join(dir, 'main.eligian'),
      'extensions "./host.ts" {\n  operation score(answer:  string)\n  function formatPrice\n}\n'
    );
    return dir;
  };
  it('passes', () => {
    expect(
      evaluate(inputOf(configOf({}), { projectDir: project() }), {
        kind: 'source.extensions',
        module: './host.ts',
        operations: [{ name: 'score', params: 'answer: string' }],
      }).pass
    ).toBe(true);
  });
  it('fails', () => {
    const dir = project();
    const result = evaluate(inputOf(configOf({}), { projectDir: dir }), {
      kind: 'source.extensions',
      module: './host.ts',
      operations: [{ name: 'score', params: 'answer: number' }],
    });
    expect(result).toMatchObject({ kind: 'source.extensions', pass: false });
    expect(result.detail).toContain('score');
    expect(
      evaluate(inputOf(configOf({}), { projectDir: dir }), {
        kind: 'source.extensions',
        module: './other.ts',
        operations: [{ name: 'score' }],
      }).detail
    ).toContain('./other.ts');
  });
});

describe('library.file', () => {
  it('passes', () => {
    expect(
      evaluate(inputOf(configOf({}), { projectDir: LIBRARY }), { kind: 'library.file', dir: 'lib' })
        .pass
    ).toBe(true);
  });
  it('fails', () => {
    const result = evaluate(inputOf(configOf({}), { projectDir: LIBRARY }), {
      kind: 'library.file',
      dir: 'shared',
    });
    expect(result).toMatchObject({ kind: 'library.file', pass: false });
    expect(result.detail).toContain('shared');
  });
});

describe('library.imports', () => {
  it('passes', () => {
    expect(
      evaluate(inputOf(configOf({}), { projectDir: LIBRARY }), {
        kind: 'library.imports',
        dir: 'lib',
        names: ['fadeIn', 'fadeOut'],
      }).pass
    ).toBe(true);
  });
  it('fails', () => {
    const result = evaluate(inputOf(configOf({}), { projectDir: LIBRARY }), {
      kind: 'library.imports',
      dir: 'lib',
      names: ['fadeIn', 'slideIn'],
    });
    expect(result).toMatchObject({ kind: 'library.imports', pass: false });
    expect(result.detail).toContain('slideIn');
  });
});

describe('library.jsdoc', () => {
  it('passes', () => {
    expect(
      evaluate(inputOf(configOf({}), { projectDir: LIBRARY }), {
        kind: 'library.jsdoc',
        dir: 'lib',
        names: ['fadeIn'],
      }).pass
    ).toBe(true);
  });
  it('fails', () => {
    const result = evaluate(inputOf(configOf({}), { projectDir: LIBRARY }), {
      kind: 'library.jsdoc',
      dir: 'lib',
      names: ['fadeIn', 'fadeOut'],
    });
    expect(result).toMatchObject({ kind: 'library.jsdoc', pass: false });
    expect(result.detail).toContain('fadeOut');
    expect(result.detail).not.toContain('fadeIn');
  });
});

describe('library.checksClean', () => {
  const runs: (readonly string[])[] = [];
  const cli =
    (status: number) =>
    (args: readonly string[]): { status: number | null; stdout: string; stderr: string } => {
      runs.push(args);
      return { status, stdout: status === 0 ? '' : 'lib/animations.eligian 1 warning', stderr: '' };
    };
  it('passes', () => {
    runs.length = 0;
    const result = evaluate(inputOf(configOf({}), { projectDir: LIBRARY, eligian: cli(0) }), {
      kind: 'library.checksClean',
      dir: 'lib',
    });
    expect(result).toMatchObject({ kind: 'library.checksClean', pass: true });
    expect(runs).toEqual([
      ['check', path.join(LIBRARY, 'lib', 'animations.eligian'), '--max-warnings', '0'],
    ]);
  });
  it('fails', () => {
    const result = evaluate(inputOf(configOf({}), { projectDir: LIBRARY, eligian: cli(1) }), {
      kind: 'library.checksClean',
      dir: 'lib',
    });
    expect(result).toMatchObject({ kind: 'library.checksClean', pass: false });
    expect(result.detail).toContain('1 warning');
    expect(
      evaluate(inputOf(configOf({}), { projectDir: LIBRARY }), {
        kind: 'library.checksClean',
        dir: 'lib',
      }).pass
    ).toBe(false);
  });
});

describe('dataflow.callsPreserved', () => {
  const fixed = (highlight: Op[]) =>
    configOf({
      actions: [action('highlight', highlight)],
      timelines: [
        timeline('main', [
          ranged(0, 3, [op('selectElement', { selector: '#title' })], call('highlight')),
        ]),
      ],
    });
  const input = (config: IEngineConfiguration) =>
    inputOf(config, { projectDir: DATAFLOW_START, startDir: DATAFLOW_START });
  it('passes', () => {
    const config = fixed([
      op('selectElement', { selector: '#title' }),
      op('addClass', { className: 'highlight' }),
    ]);
    expect(evaluate(input(config), { kind: 'dataflow.callsPreserved' }).pass).toBe(true);
  });
  it('fails', () => {
    const lost = evaluate(input(fixed([op('selectElement', { selector: '#title' })])), {
      kind: 'dataflow.callsPreserved',
    });
    expect(lost).toMatchObject({ kind: 'dataflow.callsPreserved', pass: false });
    expect(lost.detail).toContain("lost its 'addClass'");
    expect(evaluate(input(configOf({})), { kind: 'dataflow.callsPreserved' }).detail).toContain(
      "'highlight'"
    );
  });
});

describe('dataflow.selectedBeforeAddClass', () => {
  const configWith = (highlight: Op[], caller: Op[]) =>
    configOf({
      actions: [action('highlight', highlight)],
      timelines: [timeline('main', [ranged(0, 3, [], caller)])],
    });
  const input = (config: IEngineConfiguration) =>
    inputOf(config, { projectDir: DATAFLOW_START, startDir: DATAFLOW_START });
  it('passes', () => {
    const own = configWith(
      [op('selectElement', { selector: '#title' }), op('addClass', { className: 'highlight' })],
      call('highlight')
    );
    expect(evaluate(input(own), { kind: 'dataflow.selectedBeforeAddClass' }).pass).toBe(true);
    const caller = configWith(
      [op('addClass', { className: 'highlight' })],
      [op('selectElement', { selector: '#title' }), ...call('highlight')]
    );
    expect(evaluate(input(caller), { kind: 'dataflow.selectedBeforeAddClass' }).pass).toBe(true);
  });
  it('fails', () => {
    const config = configWith([op('addClass', { className: 'highlight' })], call('highlight'));
    const result = evaluate(input(config), { kind: 'dataflow.selectedBeforeAddClass' });
    expect(result).toMatchObject({ kind: 'dataflow.selectedBeforeAddClass', pass: false });
    expect(result.detail).toContain('highlight');
  });
});

describe('storyboard.exists', () => {
  it('passes', () => {
    const storyboard = storyboardOf([
      '| Intro | 1 | 2 | #box | addClass visible | removeClass visible |',
    ]);
    expect(evaluate({ ...interactions, storyboard }, { kind: 'storyboard.exists' }).pass).toBe(
      true
    );
  });
  it('fails', () => {
    const result = evaluate(interactions, { kind: 'storyboard.exists' });
    expect(result).toMatchObject({ kind: 'storyboard.exists', pass: false });
    expect(result.detail).toContain('no storyboard');
    expect(
      evaluate({ ...interactions, storyboard: storyboardOf([]) }, { kind: 'storyboard.exists' })
        .pass
    ).toBe(false);
  });
});

describe('storyboard.beatsCovered', () => {
  const covered = (beats: readonly string[], rows: readonly string[] = [], input = interactions) =>
    evaluate(
      { ...input, storyboard: storyboardOf(beats, rows) },
      { kind: 'storyboard.beatsCovered' }
    );

  it('passes', () => {
    const result = covered(
      [
        '| Intro | 3 | 5 | #result | addClass visible | removeClass visible |',
        '| Details | 0 | 4 | #intro | addClass visible | removeClass visible |',
        '| Intro | 1.05 | 2 | #box | addClass visible | removeClass visible |',
      ],
      [
        '| click #next | Details | navigate | Intro |',
        '| click #restart | replay() | run | Intro |',
        '| click #skip | reveal.start | seek | Intro |',
        '| key ArrowRight | Details | navigate | Intro |',
        '| click #play | - | toggle | Intro |',
      ]
    );
    expect(result).toMatchObject({ kind: 'storyboard.beatsCovered', pass: true });
  });
  it('fails', () => {
    const result = covered([
      '| Intro | 0 | 5 | #result | addClass visible | removeClass visible |',
    ]);
    expect(result).toMatchObject({ kind: 'storyboard.beatsCovered', pass: false });
    expect(result.detail).toContain('#result');
  });
  it('matches through a called action (requestAction substitution)', () => {
    // `at 1s..2s [ show("#box") ]`: #box is the argument of show(sel)
    expect(
      covered(['| Intro | 1 | 2 | #box | addClass visible | removeClass visible |']).pass
    ).toBe(true);
  });
  it('rejects a different selector', () => {
    const result = covered(['| Intro | 1 | 2 | #intro | addClass visible | removeClass visible |']);
    expect(result.pass).toBe(false);
    expect(result.detail).toContain('#intro');
  });
  it('a run row matches its declared action', () => {
    expect(covered([], ['| click #restart | replay() | run | Intro |']).pass).toBe(true);
    expect(covered([], ['| click #restart | resetView() | run | Intro |']).pass).toBe(false);
  });
  it('a navigate row with an at-position matches', () => {
    // `on click "#next" navigate "Details" at 2s`
    expect(covered([], ['| click #next | Details | navigate | Intro |']).pass).toBe(true);
    expect(covered([], ['| click #next | Intro | navigate | Intro |']).pass).toBe(false);
  });
  it('a seek row matches by number and by label', () => {
    expect(covered([], ['| click #skip | 3 | seek | Intro |']).pass).toBe(true);
    expect(covered([], ['| click #skip | 3s | seek | Intro |']).pass).toBe(true);
    expect(covered([], ['| click #skip | reveal.start | seek | Intro |']).pass).toBe(true);
    expect(covered([], ['| click #skip | 4 | seek | Intro |']).pass).toBe(false);
  });
  it('a key row matches a KeyboardController listener', () => {
    expect(covered([], ['| key ArrowRight | Details | navigate | Intro |']).pass).toBe(true);
    expect(covered([], ['| key arrowright | Details | navigate | Intro |']).pass).toBe(true);
    expect(covered([], ['| key ArrowLeft | Details | navigate | Intro |']).pass).toBe(false);
  });
  it('three rows with one listener fail and name the two unmatched rows', () => {
    const config = configOf({
      actions: [
        action('__on__play', [op('broadcastEvent', { eventName: 'timeline-play-request' })]),
      ],
      timelines: [
        timeline('Intro', [
          lifecycle(
            listener('#a', 'DOMEventListenerController', {
              eventName: 'click',
              actions: ['__on__play'],
            })
          ),
        ]),
      ],
    });
    const result = covered(
      [],
      [
        '| click #a | - | play | Intro |',
        '| click #b | - | pause | Intro |',
        '| click #c | - | stop | Intro |',
      ],
      inputOf(config)
    );
    expect(result.pass).toBe(false);
    expect(result.detail).toContain('click #b');
    expect(result.detail).toContain('click #c');
    expect(result.detail).not.toContain('click #a');
  });
  it('a row whose trigger has no listener in its timeline fails', () => {
    const result = covered([], ['| click #next | Details | navigate | Details |']);
    expect(result.pass).toBe(false);
    expect(result.detail).toContain('click #next');
  });
  it('no storyboard → "no storyboard"', () => {
    const result = evaluate(interactions, { kind: 'storyboard.beatsCovered' });
    expect(result).toEqual({
      kind: 'storyboard.beatsCovered',
      pass: false,
      detail: 'no storyboard',
    });
  });
});

describe('beats.min', () => {
  it('passes', () => {
    // Intro: 1s..2s and 3s..5s; Details: 0s..4s; the lifecycle action is not a beat
    expect(evaluate(interactions, { kind: 'beats.min', n: 3 }).pass).toBe(true);
  });
  it('fails', () => {
    const result = evaluate(interactions, { kind: 'beats.min', n: 4 });
    expect(result).toMatchObject({ kind: 'beats.min', pass: false });
    expect(result.detail).toContain('3');
  });
  it('excludes lifecycle actions', () => {
    const config = configOf({
      timelines: [
        timeline('Intro', [
          { ...lifecycle([op('wait')]), duration: { start: 0, end: 10 } },
          ranged(0, 2, []),
        ]),
      ],
    });
    expect(evaluate(inputOf(config), { kind: 'beats.min', n: 1 }).pass).toBe(true);
    expect(evaluate(inputOf(config), { kind: 'beats.min', n: 2 }).pass).toBe(false);
  });
  it("n: 'storyboard' uses the beat count", () => {
    const row = '| Intro | 1 | 2 | #box | addClass visible | removeClass visible |';
    const three = storyboardOf([row, row, row]);
    const four = storyboardOf([row, row, row, row]);
    expect(
      evaluate({ ...interactions, storyboard: three }, { kind: 'beats.min', n: 'storyboard' }).pass
    ).toBe(true);
    expect(
      evaluate({ ...interactions, storyboard: four }, { kind: 'beats.min', n: 'storyboard' }).pass
    ).toBe(false);
    expect(evaluate(interactions, { kind: 'beats.min', n: 'storyboard' }).pass).toBe(false);
  });
  it("n: 'start' counts the start state's at events only", () => {
    // fix-dataflow-start: two `at` events and an `on enter` block → n = 2
    const two = configOf({
      timelines: [timeline('main', [lifecycle([op('wait')]), ranged(0, 3, []), ranged(3, 6, [])])],
    });
    const one = configOf({
      timelines: [timeline('main', [lifecycle([op('wait')]), ranged(0, 3, [])])],
    });
    const start = { projectDir: DATAFLOW_START, startDir: DATAFLOW_START };
    const passing = evaluate(inputOf(two, start), { kind: 'beats.min', n: 'start' });
    expect(passing.pass).toBe(true);
    expect(passing.detail).toContain('at least 2');
    expect(evaluate(inputOf(one, start), { kind: 'beats.min', n: 'start' }).pass).toBe(false);
    expect(evaluate(inputOf(two), { kind: 'beats.min', n: 'start' }).pass).toBe(false);
  });
});

describe('config.equivalent', () => {
  const fixture = 'equivalent/config.json';
  const base = () =>
    readJson(path.join(FIXTURES, fixture)) as unknown as Data & {
      actions: { startOperations: Data[] }[];
      timelines: { id: string; duration: number; timelineActions: { id: string }[] }[];
    };
  it('passes', () => {
    expect(
      evaluate(inputOf(base() as unknown as IEngineConfiguration), {
        kind: 'config.equivalent',
        fixture,
      }).pass
    ).toBe(true);
  });
  it('fails', () => {
    const config = base();
    config.actions[0].startOperations.pop();
    const result = evaluate(inputOf(config as unknown as IEngineConfiguration), {
      kind: 'config.equivalent',
      fixture,
    });
    expect(result).toMatchObject({ kind: 'config.equivalent', pass: false });
    expect(result.detail).toContain('reveal');
    expect(
      evaluate(inputOf(base() as unknown as IEngineConfiguration), {
        kind: 'config.equivalent',
        fixture: 'equivalent/missing.json',
      }).pass
    ).toBe(false);
  });
  it('ignores ids and setOperationData order', () => {
    const config = base();
    config.id = 'another-id';
    config.timelines[0].id = 'other-timeline-id';
    for (const timelineAction of config.timelines[0].timelineActions) {
      timelineAction.id = `${timelineAction.id}-x`;
    }
    const [first, second, ...rest] = config.actions[0].startOperations;
    config.actions[0].startOperations = [second, first, ...rest];
    expect(
      evaluate(inputOf(config as unknown as IEngineConfiguration), {
        kind: 'config.equivalent',
        fixture,
      }).pass
    ).toBe(true);
  });
  it('rejects a changed duration', () => {
    const config = base();
    config.timelines[0].duration = 12;
    const result = evaluate(inputOf(config as unknown as IEngineConfiguration), {
      kind: 'config.equivalent',
      fixture,
    });
    expect(result.pass).toBe(false);
    expect(result.detail).toContain('duration');
  });
});
