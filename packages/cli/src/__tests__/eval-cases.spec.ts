/**
 * The eval cases (spec 058, FR-052; plan C13; phase 3 FR-025–FR-029, SC-008):
 * - all 14 cases of roadmap §6.2: each parses, pins its model, names a scenario that
 *   `parseScenario` accepts (cases 13 and 14 none), has only known assertion kinds, covers
 *   its §6.2 Structural items (`COVERAGE`, mirroring plan F2) and, when it has a `budget`,
 *   a well-formed one;
 * - the generated media fixtures (sizes, durations, structure, reproducibility) and the
 *   port-from-json fixture's drift;
 * - the start states: under the strict check (`--selector-not-in-layout ids`, lint, review)
 *   each yields exactly its planted codes, and case 14 hides a controller imbalance behind
 *   its two errors;
 * - the brief fixtures (spec 059 phase 3 FR-027, FR-028, SC-011): the 12 cases without a start
 *   state each have a `brief.md` that parses clean, confirms on its materialised fixtures and
 *   names the case's entry as R3.
 */
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import type { CheckFileResult } from '@eligian/language';
import type { IEngineConfiguration } from 'eligius';
import { afterAll, describe, expect, it } from 'vitest';
import { checkPaths } from '../check/check-command.js';
import { compileFile } from '../compile-file.js';
import { parseBrief } from '../mcp/brief/brief-file.js';
import { configFragment } from '../mcp/config-fragment.js';
import { parseAssertions } from '../mcp/evals/assert.js';
import { briefStateOf, confirmBriefFixture } from '../mcp/evals/brief-fixture.js';
import { materialiseFixtures } from '../mcp/evals/gate-steps.js';
import { parseScenario } from '../smoke/scenario.js';
import { tempProject } from './brief-helpers.js';

const REPO = path.resolve(__dirname, '../../../..');
const EVALS = path.join(REPO, 'evals/mcp');
const CASES = path.join(EVALS, 'cases');
const startOf = (id: string) => path.join(CASES, id, 'start');

const strictCheck = (files: readonly string[]) =>
  checkPaths(files, { selectorNotInLayout: 'ids', lint: true, review: true });

/** The sorted set of codes of one file's result. */
const codesOf = (result: CheckFileResult): string[] =>
  [...new Set(result.diagnostics.map(d => d.code))].sort();

/** A pinned model id (`claude-sonnet-5-5`), not an alias such as `sonnet` (FR-050). */
const PINNED_MODEL = /^claude-(opus|sonnet|haiku)-\d+(-\d+)*$/;

describe('eval case definitions', () => {
  it.each(['fix-dataflow', 'fix-selectors'])('%s pins its model id', id => {
    const definition = JSON.parse(fs.readFileSync(path.join(CASES, `${id}.json`), 'utf-8')) as {
      model: string;
    };

    expect(definition.model).toMatch(PINNED_MODEL);
  });
});

/** The Phase 2 positive cases (spec 058 phase 2, FR-090): no start state, a scenario beside each. */
const PHASE_2_CASES = [
  'title-card',
  'three-chapters',
  'staggered-list',
  'keyboard-deck',
  'library-reuse',
] as const;

const readJson = (file: string): unknown => JSON.parse(fs.readFileSync(file, 'utf-8'));

describe('phase 2 cases', () => {
  it.each(PHASE_2_CASES)('%s parses and its scenario decodes with parseScenario', id => {
    const definition = readJson(path.join(CASES, `${id}.json`)) as {
      id: string;
      prompt: string;
      entry: string;
      scenario: string;
    };

    expect(definition.id).toBe(id);
    expect(definition.prompt.length).toBeGreaterThan(0);
    expect(definition.entry).toBe('main.eligian');
    expect(definition.scenario).toBe(`${id}.scenario.json`);
    expect(fs.existsSync(startOf(id))).toBe(false);
    const parsed = parseScenario(readJson(path.join(CASES, definition.scenario)));
    expect(parsed).toMatchObject({ ok: true });
  });

  it('every case pins claude-sonnet-5-5', () => {
    const cases = fs
      .readdirSync(CASES)
      .filter(file => file.endsWith('.json') && !file.endsWith('.scenario.json'));

    expect(cases).toEqual(
      expect.arrayContaining(
        [...PHASE_2_CASES, 'fix-dataflow', 'fix-selectors'].map(id => `${id}.json`)
      )
    );
    for (const file of cases) {
      expect((readJson(path.join(CASES, file)) as { model: string }).model, file).toBe(
        'claude-sonnet-5-5'
      );
    }
  });
});

/** Roadmap §6.2, in its order (cases 1–14). */
const CASE_IDS = [
  'title-card',
  'three-chapters',
  'staggered-list',
  'video-subtitles',
  'scrollytelling',
  'keyboard-deck',
  'typewriter-counter',
  'library-reuse',
  'audio-lyrics',
  'host-module',
  'replay-safe',
  'port-from-json',
  'fix-dataflow',
  'fix-selectors',
] as const;
type CaseId = (typeof CASE_IDS)[number];

/** Cases 13 and 14: a start state, no scenario (plan F1). */
const START_STATE_CASES: readonly CaseId[] = ['fix-dataflow', 'fix-selectors'];

interface CaseFile {
  readonly id: string;
  readonly prompt: string;
  readonly entry: string;
  readonly model: string;
  readonly scenario?: string;
  readonly fixtures?: readonly { readonly from: string; readonly to: string }[];
  readonly assertions: readonly Record<string, unknown>[];
  readonly budget?: {
    readonly toolCalls: unknown;
    readonly fromRun: unknown;
    readonly model: unknown;
  };
}

const readCase = (id: string): CaseFile => readJson(path.join(CASES, `${id}.json`)) as CaseFile;

/** One §6.2 Structural item (verbatim) → the assertions (kind + parameters) that encode it. */
interface CoverageRow {
  readonly item: string;
  readonly requires: readonly Record<string, unknown>[];
}

const STORYBOARD_ROWS: readonly CoverageRow[] = [
  { item: '§6.1 step 4: storyboard.exists', requires: [{ kind: 'storyboard.exists' }] },
  { item: '§6.1 step 4: storyboard.beatsCovered', requires: [{ kind: 'storyboard.beatsCovered' }] },
  {
    item: '§6.1 step 4: beats.min(storyboard)',
    requires: [{ kind: 'beats.min', n: 'storyboard' }],
  },
];
const START_BEATS_ROW: CoverageRow = {
  item: 'FR-013: "For cases 13 and 14, n is the count of the start state"',
  requires: [{ kind: 'beats.min', n: 'start' }],
};
const SLIDES = Array.from({ length: 12 }, (_, i) => `slide-${i + 1}`);

/** Plan F2, for all 14 cases. */
const COVERAGE: Readonly<Record<CaseId, readonly CoverageRow[]>> = {
  'title-card': [
    {
      item: '1 raf timeline, duration 10',
      requires: [
        { kind: 'timelines.count', equals: 1 },
        { kind: 'timeline', at: 0, type: 'animation', duration: 10 },
      ],
    },
    {
      item: '`__on__play`/`__on__pause` actions',
      requires: [{ kind: 'actions.named', names: ['__on__play', '__on__pause'] }],
    },
    {
      item: 'layout has headline/subtitle ids',
      requires: [{ kind: 'layout.hasId', ids: ['headline', 'subtitle'] }],
    },
    {
      item: 'CSS defines the state classes',
      requires: [{ kind: 'css.definesStateClasses', classes: ['in'] }],
    },
    ...STORYBOARD_ROWS,
  ],
  'three-chapters': [
    { item: '≥ 4 timelines', requires: [{ kind: 'timelines.count', min: 4 }] },
    { item: '`__nav__*` actions', requires: [{ kind: 'actions.named', prefix: '__nav__' }] },
    {
      item: '`languages` with `en-US` + `nl-NL`',
      requires: [{ kind: 'locales.languages', codes: ['en-US', 'nl-NL'] }],
    },
    {
      item: '`LabelController`',
      requires: [{ kind: 'controllers.used', all: ['LabelController'] }],
    },
    {
      item: 'every chapter has `on enter`/`on leave`',
      requires: [
        {
          kind: 'timelines.lifecycle',
          names: ['Problem', 'Solution', 'Results'],
          enter: true,
          leave: true,
        },
      ],
    },
    { item: '`controllers.balanced`', requires: [{ kind: 'controllers.balanced' }] },
    ...STORYBOARD_ROWS,
  ],
  'staggered-list': [
    {
      item: 'one `stagger` (6 actions 0.4 s apart)',
      requires: [
        { kind: 'source.blocks', keyword: 'stagger', equals: 1 },
        { kind: 'stagger.spaced', count: 6, gap: 0.4 },
      ],
    },
    {
      item: '6 card ids in layout',
      requires: [
        { kind: 'layout.hasId', ids: ['card-1', 'card-2', 'card-3', 'card-4', 'card-5', 'card-6'] },
      ],
    },
    {
      item: 'no `class-never-removed`',
      requires: [{ kind: 'check.codesAbsent', codes: ['class-never-removed'] }],
    },
    ...STORYBOARD_ROWS,
  ],
  'video-subtitles': [
    {
      item: '1 `mediaplayer` timeline with `VideoPositionSource`, `from` set',
      requires: [
        { kind: 'timelines.count', type: 'mediaplayer', equals: 1 },
        {
          kind: 'timeline',
          type: 'mediaplayer',
          positionSource: 'VideoPositionSource',
          from: 'media/intro.mp4',
        },
      ],
    },
    {
      item: '5 ranged caption events',
      requires: [{ kind: 'timeline.rangedActions', type: 'mediaplayer', min: 5 }],
    },
    {
      item: '`ProgressbarController` or Subtitles controller',
      requires: [
        { kind: 'controllers.used', anyOf: ['ProgressbarController', 'SubtitlesController'] },
      ],
    },
    {
      item: 'CSS sizes `.eligius-video`',
      requires: [
        {
          kind: 'css.hasRule',
          selector: '.eligius-video',
          anyProperty: ['width', 'height', 'max-width', 'max-height', 'inline-size', 'block-size'],
        },
      ],
    },
    {
      item: 'a raf hub timeline first',
      requires: [{ kind: 'timeline', at: 0, type: 'animation' }],
    },
    {
      item: '`media-timeline-first-without-start-gesture` clean',
      requires: [
        { kind: 'check.codesAbsent', codes: ['media-timeline-first-without-start-gesture'] },
      ],
    },
    ...STORYBOARD_ROWS,
  ],
  scrollytelling: [
    {
      item: '1 timeline with `ScrollPositionSource`, `duration`',
      requires: [
        { kind: 'timelines.count', equals: 1 },
        { kind: 'timeline', at: 0, positionSource: 'ScrollPositionSource', hasDuration: true },
      ],
    },
    {
      item: 'scrollable selector in layout',
      requires: [{ kind: 'timeline.scrollSelectorInLayout', at: 0 }],
    },
    { item: '4 ranged events', requires: [{ kind: 'timeline.rangedActions', at: 0, min: 4 }] },
    ...STORYBOARD_ROWS,
  ],
  'keyboard-deck': [
    {
      item: 'one timeline per slide … 12 timelines',
      requires: [{ kind: 'timelines.count', equals: 12 }],
    },
    {
      item: 'a KeyboardController added in `on enter` and removed in `on leave`',
      requires: [
        { kind: 'timeline.addsController', controller: 'KeyboardController', names: SLIDES },
        { kind: 'controllers.balanced' },
      ],
    },
    {
      item: 'ArrowRight/ArrowLeft `navigate` to neighbours, Home to slide 1',
      requires: [
        { kind: 'interactions.keyboard', keys: ['ArrowRight', 'ArrowLeft', 'Home'] },
        { kind: 'actions.named', prefix: '__nav__' },
      ],
    },
    {
      item: '`on key` → `KeyboardController`',
      requires: [{ kind: 'controllers.used', all: ['KeyboardController'] }],
    },
    ...STORYBOARD_ROWS,
  ],
  'typewriter-counter': [
    { item: '`for`/`sequence`', requires: [{ kind: 'source.blocks', anyOf: ['for', 'sequence'] }] },
    {
      item: '`calc`/`math` + `setElementContent`',
      requires: [{ kind: 'operations.used', anyOf: ['calc', 'math'], all: ['setElementContent'] }],
    },
    {
      item: 'erased-parameter save/restore compiles',
      requires: [{ kind: 'origins.present', all: ['erased-save', 'erased-restore'] }],
    },
    { item: 'W151 clean', requires: [{ kind: 'check.codesAbsent', codes: ['eligius-W151'] }] },
    ...STORYBOARD_ROWS,
  ],
  'library-reuse': [
    { item: '`lib\\*.eligian` with `library`', requires: [{ kind: 'library.file', dir: 'lib' }] },
    {
      item: '`import { fadeIn, fadeOut, slideIn }`',
      requires: [{ kind: 'library.imports', dir: 'lib', names: ['fadeIn', 'fadeOut', 'slideIn'] }],
    },
    {
      item: 'all three used',
      requires: [{ kind: 'actions.called', names: ['fadeIn', 'fadeOut', 'slideIn'] }],
    },
    {
      item: 'JSDoc',
      requires: [{ kind: 'library.jsdoc', dir: 'lib', names: ['fadeIn', 'fadeOut', 'slideIn'] }],
    },
    {
      item: 'the library checks alone',
      requires: [{ kind: 'library.checksClean', dir: 'lib' }],
    },
    ...STORYBOARD_ROWS,
  ],
  'audio-lyrics': [
    {
      item: '`audio` timeline with `from`',
      requires: [
        { kind: 'source.provider', name: 'audio' },
        { kind: 'timeline', type: 'mediaplayer', from: 'media/song.mp3', sourceType: 'audio/mpeg' },
      ],
    },
    {
      // min: the prompt's line count (`#line-1` to `#line-5`)
      item: 'one range per line',
      requires: [{ kind: 'timeline.rangedActions', type: 'mediaplayer', min: 5 }],
    },
    {
      item: '`__on__seek*` actions',
      requires: [{ kind: 'actions.named', prefix: '__on__seek__' }],
    },
    {
      item: 'raf start timeline first',
      requires: [{ kind: 'timeline', at: 0, type: 'animation' }],
    },
    ...STORYBOARD_ROWS,
  ],
  'host-module': [
    {
      item: '`extensions "./host.ts" { operation score(answer: string) }`',
      requires: [
        {
          kind: 'source.extensions',
          module: './host.ts',
          operations: [{ name: 'score', params: 'answer: string' }],
        },
      ],
    },
    { item: '`host.ts` exists', requires: [{ kind: 'files.exist', paths: ['host.ts'] }] },
    {
      item: '`on click … run`',
      requires: [
        {
          kind: 'interactions.listener',
          controller: 'DOMEventListenerController',
          event: 'click',
          runs: true,
        },
      ],
    },
    {
      item: 'result shown by a covering range',
      requires: [{ kind: 'timeline.rangeTouches', selector: '#result' }],
    },
    {
      item: 'FR-027: "snapshot after 3.5 s (timeline-driven, not `wait`) → hidden"',
      requires: [
        { kind: 'interactions.noWait', triggers: ['#answer-a', '#answer-b', '#answer-c'] },
      ],
    },
    ...STORYBOARD_ROWS,
  ],
  'replay-safe': [
    {
      item: '`as reveal` label and `seek reveal.start`',
      requires: [
        { kind: 'source.label', name: 'reveal' },
        { kind: 'source.labelSeek', label: 'reveal', anchor: 'start' },
        { kind: 'interactions.seekTo', position: 12 },
      ],
    },
    {
      item: 'Restart = reset-then-seek',
      requires: [{ kind: 'replay.resetThenSeek', trigger: '#restart' }],
    },
    ...STORYBOARD_ROWS,
  ],
  'port-from-json': [
    {
      item: 'same timelines (uris, durations), action names and operation sequence per action (order-insensitive on inserted `setOperationData`), same controllers',
      requires: [{ kind: 'config.equivalent', fixture: '../fixtures/port-from-json/config.json' }],
    },
    ...STORYBOARD_ROWS,
  ],
  'fix-dataflow': [
    {
      item: 'both fixed with `target`/`with`/save-restore',
      requires: [{ kind: 'dataflow.callsPreserved' }, { kind: 'dataflow.selectedBeforeAddClass' }],
    },
    { item: '`beats.min` unchanged', requires: [{ kind: 'beats.min', n: 'start' }] },
  ],
  'fix-selectors': [
    { item: 'layout gained the ids', requires: [{ kind: 'layout.gainedCssOnlyIds' }] },
    {
      item: '`controllers.balanced`',
      requires: [
        { kind: 'controllers.balanced' },
        { kind: 'check.codesAbsent', codes: ['controller-imbalance'] },
      ],
    },
    START_BEATS_ROW,
  ],
};

/** An assertion covers a requirement when it has the same kind and every required parameter. */
const covers = (assertion: Record<string, unknown>, required: Record<string, unknown>): boolean =>
  Object.entries(required).every(([key, value]) => isDeepStrictEqual(assertion[key], value));

/** The Structural items of `id` that `assertions` leave uncovered, each with what is missing. */
function coverageGaps(id: CaseId, assertions: readonly Record<string, unknown>[]): string[] {
  return COVERAGE[id].flatMap(row =>
    row.requires
      .filter(required => !assertions.some(assertion => covers(assertion, required)))
      .map(required => `${id}: "${row.item}" needs ${JSON.stringify(required)}`)
  );
}

/** A results dir name (`evals/mcp/results/<run-id>`). */
const RESULTS = path.join(EVALS, 'results');

describe('the 14 eval cases', () => {
  const withoutBudget: string[] = [];

  afterAll(() => {
    if (withoutBudget.length > 0) {
      console.error(
        `eval cases without a budget (FR-023: written by --write-budgets): ${withoutBudget.join(', ')}`
      );
    }
  });

  it('exactly the 14 ids of §6.2', () => {
    const ids = fs
      .readdirSync(CASES)
      .filter(file => file.endsWith('.json') && !file.endsWith('.scenario.json'))
      .map(file => file.slice(0, -'.json'.length));

    expect([...ids].sort()).toEqual([...CASE_IDS].sort());
  });

  describe.each(CASE_IDS)('%s', id => {
    it('parses', () => {
      const definition = readCase(id);

      expect(definition.id).toBe(id);
      expect(definition.prompt.length).toBeGreaterThan(0);
      expect(definition.entry).toBe('main.eligian');
      expect(Array.isArray(definition.assertions)).toBe(true);
      for (const fixture of definition.fixtures ?? []) {
        // `from` is relative to the cases dir (the T041 ruling of 2026-11-05: one `casesDir`)
        expect(fs.existsSync(path.join(CASES, fixture.from)), fixture.from).toBe(true);
        expect(path.isAbsolute(fixture.to), fixture.to).toBe(false);
      }
      expect(fs.existsSync(startOf(id))).toBe(START_STATE_CASES.includes(id));
    });

    it('pins its model id', () => {
      const { model } = readCase(id);

      expect(model).toMatch(PINNED_MODEL);
      expect(model).toBe('claude-sonnet-5-5');
    });

    it.runIf(!START_STATE_CASES.includes(id))(
      'names an existing scenario that parseScenario accepts',
      () => {
        const { scenario } = readCase(id);

        expect(scenario).toBe(`${id}.scenario.json`);
        const file = path.join(CASES, scenario!);
        expect(fs.existsSync(file)).toBe(true);
        expect(parseScenario(readJson(file))).toMatchObject({ ok: true });
      }
    );

    it.runIf(START_STATE_CASES.includes(id))('names no scenario', () => {
      expect(readCase(id).scenario).toBeUndefined();
    });

    it('has only known assertion kinds', () => {
      expect(parseAssertions(readCase(id).assertions)).toMatchObject({ ok: true });
    });

    it('covers the F2 Structural items', () => {
      expect(coverageGaps(id, readCase(id).assertions)).toEqual([]);
    });

    it('a budget, when present, is well-formed', () => {
      const { budget } = readCase(id);
      if (budget === undefined) {
        withoutBudget.push(id);
        return;
      }

      expect(Number.isInteger(budget.toolCalls) && (budget.toolCalls as number) > 0).toBe(true);
      expect(typeof budget.fromRun).toBe('string');
      const run = path.join(RESULTS, budget.fromRun as string);
      expect(fs.existsSync(run) && fs.statSync(run).isDirectory(), String(budget.fromRun)).toBe(
        true
      );
      expect(budget.model).toMatch(PINNED_MODEL);
    });
  });

  it('an incomplete copy fails coverage', () => {
    const definition = readCase('video-subtitles');
    const removed = { kind: 'timeline', at: 0, type: 'animation' };
    const copy = definition.assertions.filter(assertion => !isDeepStrictEqual(assertion, removed));
    expect(copy).toHaveLength(definition.assertions.length - 1);

    expect(coverageGaps('video-subtitles', copy)).toEqual([
      `video-subtitles: "a raf hub timeline first" needs ${JSON.stringify(removed)}`,
    ]);
    // Every assertion of every case is a Structural one: removing any of them leaves a gap.
    for (const id of CASE_IDS) {
      const { assertions } = readCase(id);
      for (const [index] of assertions.entries()) {
        const without = assertions.filter((_, i) => i !== index);
        expect(coverageGaps(id, without).length, `${id} without #${index}`).toBeGreaterThan(0);
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------
// The brief fixtures (spec 059 phase 3 FR-027, FR-028, SC-011): arm A1 starts from a confirmed
// brief, signed by the harness from `cases/<id>/brief.md`. The two fix cases get none: their
// start program is existing work the first-run scan records.

const BRIEF_CASES: readonly CaseId[] = CASE_IDS.filter(id => !START_STATE_CASES.includes(id));
const briefFixtureOf = (id: string) => path.join(CASES, id, 'brief.md');
const FIXTURE_NOW = new Date('2026-11-20T00:00:00Z');

describe('brief fixtures', () => {
  const temps: string[] = [];

  afterAll(() => {
    for (const dir of temps.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  });

  /** A temp project holding the case's materialised fixtures, and a state dir outside it. */
  const projectOf = (id: CaseId): { readonly project: string; readonly stateDir: string } => {
    const definition = readCase(id);
    const project = tempProject();
    const scratch = tempProject();
    temps.push(project, scratch);
    const failures = materialiseFixtures(
      {
        id: definition.id,
        entry: definition.entry,
        assertions: [],
        ...(definition.fixtures === undefined ? {} : { fixtures: definition.fixtures }),
      },
      CASES,
      project
    );
    expect(failures).toEqual([]);
    return { project, stateDir: path.join(scratch, 'state') };
  };

  it('exactly the 12 cases without start/ have brief.md', () => {
    const withFixture = CASE_IDS.filter(id => fs.existsSync(briefFixtureOf(id)));

    expect(withFixture).toEqual(BRIEF_CASES);
    expect(withFixture).toHaveLength(12);
  });

  describe.each(BRIEF_CASES)('%s', id => {
    const text = () => fs.readFileSync(briefFixtureOf(id), 'utf8');

    it('parses with no ignored content', () => {
      const parsed = parseBrief(text());

      expect(parsed.ignored).toEqual([]);
      expect(parsed.kept).toEqual([]);
      expect(parsed.brief.idea).toBe(readCase(id).prompt);
      expect(parsed.brief.confirmation).toBeUndefined();
      expect(parsed.brief.approval).toBeUndefined();
    });

    it('confirms on its materialised fixtures', async () => {
      const { project, stateDir } = projectOf(id);

      const result = await confirmBriefFixture(text(), project, stateDir, FIXTURE_NOW);

      if (!('text' in result)) throw new Error(`${id}: ${result.error}`);
      fs.writeFileSync(path.join(project, 'BRIEF.md'), result.text);
      expect(await briefStateOf(project, stateDir)).toBe('confirmed');
    });

    it("R3 is the case's entry", () => {
      const r3 = parseBrief(text()).brief.answers.find(answer => answer.id === 'R3')?.value;

      expect(typeof r3).toBe('string');
      expect(path.posix.normalize(r3 as string)).toBe(readCase(id).entry);
    });
  });

  it('a fixture with one answer removed is refused naming it', async () => {
    const full = fs.readFileSync(briefFixtureOf('title-card'), 'utf8');
    const start = full.indexOf('### P1:');
    expect(start).toBeGreaterThan(-1);
    const end = full.indexOf('\n### ', start + 1);
    expect(end).toBeGreaterThan(start);
    const withoutP1 = full.slice(0, start) + full.slice(end + 1);
    const { project, stateDir } = projectOf('title-card');

    const result = await confirmBriefFixture(withoutP1, project, stateDir, FIXTURE_NOW);

    expect('error' in result).toBe(true);
    const open = 'error' in result ? /^the brief is open: (.*)$/.exec(result.error) : null;
    expect(open?.[1].split(', ')).toContain('P1');
  });
});

// ---------------------------------------------------------------------------------------------
// The media fixtures (FR-026, SC-008), read by parsers that share no constant with the generator

const MEDIA = path.join(EVALS, 'fixtures/media');
const MP4 = path.join(MEDIA, 'intro.mp4');
const MP3 = path.join(MEDIA, 'song.mp3');

interface Box {
  readonly type: string;
  /** The payload, after the 8-byte header */
  readonly body: Buffer;
}

/** The boxes laid end to end in `data` (32-bit sizes; the fixtures need no `largesize`). */
function boxesOf(data: Buffer): Box[] {
  const boxes: Box[] = [];
  let offset = 0;
  while (offset < data.length) {
    expect(offset + 8, 'a box header past the end').toBeLessThanOrEqual(data.length);
    const size = data.readUInt32BE(offset);
    expect(size, `box at ${offset}`).toBeGreaterThanOrEqual(8);
    expect(offset + size, `box at ${offset} past the end`).toBeLessThanOrEqual(data.length);
    boxes.push({
      type: data.toString('latin1', offset + 4, offset + 8),
      body: data.subarray(offset + 8, offset + size),
    });
    offset += size;
  }
  return boxes;
}

/** The single child of type `type` (fails when absent or repeated). */
function child(boxes: readonly Box[], type: string): Box {
  const found = boxes.filter(box => box.type === type);
  expect(
    found.map(box => box.type),
    `one '${type}' in [${boxes.map(b => b.type)}]`
  ).toEqual([type]);
  return found[0]!;
}

/** Follow a path of container boxes. */
const descend = (boxes: readonly Box[], ...types: readonly string[]): Box =>
  types.slice(1).reduce((box, type) => child(boxesOf(box.body), type), child(boxes, types[0]!));

/** A full box's (`mvhd`, `mdhd`) timescale and duration, for versions 0 and 1. */
function timing(box: Box): { timescale: number; duration: number } {
  const version = box.body.readUInt8(0);
  if (version === 1) {
    return {
      timescale: box.body.readUInt32BE(4 + 16),
      duration: Number(box.body.readBigUInt64BE(4 + 20)),
    };
  }
  return { timescale: box.body.readUInt32BE(4 + 8), duration: box.body.readUInt32BE(4 + 12) };
}

/** ISO/IEC 11172-3: MPEG-1 Layer III bitrates (kbps) by index, sample rates (Hz) by index. */
const MPEG1_L3_KBPS = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const MPEG1_RATES = [44100, 48000, 32000];
const MPEG1_L3_SAMPLES_PER_FRAME = 1152;

/** Walks the mp3 frame by frame; fails on any byte that is not a frame (no tags). */
function mp3Frames(data: Buffer): { frames: number; sampleRate: number } {
  let offset = 0;
  let frames = 0;
  let sampleRate = 0;
  while (offset < data.length) {
    expect(offset + 4, `frame header at ${offset}`).toBeLessThanOrEqual(data.length);
    const header = data.readUInt32BE(offset);
    expect(header >>> 21, `frame sync at ${offset}`).toBe(0x7ff);
    expect((header >>> 19) & 0b11, `MPEG-1 at ${offset}`).toBe(0b11);
    expect((header >>> 17) & 0b11, `Layer III at ${offset}`).toBe(0b01);
    const kbps = MPEG1_L3_KBPS[(header >>> 12) & 0xf];
    const rate = MPEG1_RATES[(header >>> 10) & 0b11];
    expect(kbps, `bitrate at ${offset}`).toBeGreaterThan(0);
    expect(rate, `sample rate at ${offset}`).toBeDefined();
    if (sampleRate === 0) sampleRate = rate!;
    expect(rate).toBe(sampleRate);
    const padding = (header >>> 9) & 1;
    offset += Math.floor((144 * kbps! * 1000) / rate!) + padding;
    frames += 1;
  }
  expect(offset).toBe(data.length);
  return { frames, sampleRate };
}

describe('media', () => {
  const temps: string[] = [];

  afterAll(() => {
    for (const dir of temps) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('sizes < 500 KB', () => {
    for (const file of [MP4, MP3]) {
      expect(fs.statSync(file).size, file).toBeLessThan(500 * 1024);
    }
  });

  it('durations 30 ± 0.1 and 20 ± 0.1', () => {
    const mvhd = timing(descend(boxesOf(fs.readFileSync(MP4)), 'moov', 'mvhd'));
    expect(Math.abs(mvhd.duration / mvhd.timescale - 30)).toBeLessThanOrEqual(0.1);

    const { frames, sampleRate } = mp3Frames(fs.readFileSync(MP3));
    expect(Math.abs((frames * MPEG1_L3_SAMPLES_PER_FRAME) / sampleRate - 20)).toBeLessThanOrEqual(
      0.1
    );
  });

  it('structure: mp3 frames only; mp4 ftyp, moov, avc1 with avcC, 30 samples of 1 s, mdat', () => {
    expect(mp3Frames(fs.readFileSync(MP3)).frames).toBeGreaterThan(0);

    const top = boxesOf(fs.readFileSync(MP4));
    expect(top.map(box => box.type)).toEqual(['ftyp', 'moov', 'mdat']);
    expect(child(top, 'ftyp').body.toString('latin1', 0, 4)).toBe('isom');
    const stbl = descend(top, 'moov', 'trak', 'mdia', 'minf', 'stbl');
    const tables = boxesOf(stbl.body);

    // stsd: version/flags, entry count, then the sample entries
    const stsd = child(tables, 'stsd');
    expect(stsd.body.readUInt32BE(4)).toBe(1);
    const avc1 = child(boxesOf(stsd.body.subarray(8)), 'avc1');
    // VisualSampleEntry: 78 bytes of fixed fields, then its child boxes
    const avcC = child(boxesOf(avc1.body.subarray(78)), 'avcC');
    expect(avcC.body.readUInt8(0), 'avcC configurationVersion').toBe(1);

    // stts: one entry of 30 samples whose deltas cover 30 s at the media timescale (a single
    // 30 s sample ends at once in Chrome: the FR-026 ruling of 2026-11-05)
    const mdhd = timing(descend(top, 'moov', 'trak', 'mdia', 'mdhd'));
    const stts = child(tables, 'stts').body;
    expect(stts.readUInt32BE(4)).toBe(1);
    const samples = stts.readUInt32BE(8);
    expect(samples).toBe(30);
    expect(Math.abs((samples * stts.readUInt32BE(12)) / mdhd.timescale - 30)).toBeLessThanOrEqual(
      0.1
    );
    // stsz: 30 samples of one size; stco: one chunk per sample, each inside mdat
    const stsz = child(tables, 'stsz').body;
    expect(stsz.readUInt32BE(8)).toBe(30);
    const sampleSize = stsz.readUInt32BE(4);
    const mdat = child(top, 'mdat');
    expect(sampleSize).toBeGreaterThan(0);
    expect(sampleSize).toBeLessThanOrEqual(mdat.body.length);
    const stco = child(tables, 'stco').body;
    expect(stco.readUInt32BE(4)).toBe(30);
  });

  it('the generator reproduces the committed bytes', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-eval-media-'));
    temps.push(out);

    const run = spawnSync(`pnpm exec tsx evals/mcp/generate-media.ts --out "${out}"`, {
      cwd: REPO,
      encoding: 'utf-8',
      shell: true,
    });

    expect(run.status, run.stderr).toBe(0);
    for (const name of ['intro.mp4', 'song.mp3']) {
      expect(
        fs.readFileSync(path.join(out, name)).equals(fs.readFileSync(path.join(MEDIA, name))),
        name
      ).toBe(true);
    }
  }, 60_000);
});

it('port-from-json drift: the source recompiles to the fixture config', async () => {
  const fixture = path.join(EVALS, 'fixtures/port-from-json');

  const compiled = await compileFile(path.join(fixture, 'source/main.eligian'));

  const committed = readJson(path.join(fixture, 'config.json')) as IEngineConfiguration;
  expect(configFragment(compiled.config)).toEqual(configFragment(committed));
}, 60_000);

describe('eval case start states', () => {
  const temps: string[] = [];

  afterAll(() => {
    for (const dir of temps) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('fix-dataflow yields exactly its codes', async () => {
    const results = await strictCheck([path.join(startOf('fix-dataflow'), 'main.eligian')]);

    expect(results).toHaveLength(1);
    for (const result of results) {
      expect(codesOf(result)).toEqual(['erased-property-access', 'missing-action-dependency']);
    }
  });

  it('fix-selectors yields exactly its codes', async () => {
    const results = await strictCheck([path.join(startOf('fix-selectors'), 'main.eligian')]);

    expect(results).toHaveLength(1);
    for (const result of results) {
      expect(codesOf(result)).toEqual([
        'import-duplicate-default',
        'selector_not_in_layout',
        'syntax-error',
      ]);
    }
  });

  it('fix-selectors hides a controller imbalance behind its errors', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-eval-case-'));
    temps.push(tmp);
    fs.cpSync(startOf('fix-selectors'), tmp, { recursive: true });
    const main = path.join(tmp, 'main.eligian');
    const source = fs.readFileSync(main, 'utf-8');
    const lines = source.split(/\r?\n/);
    const kept = lines.filter(line => !line.trimEnd().endsWith('// eval:defect'));
    expect(lines.length - kept.length).toBe(2);
    fs.writeFileSync(main, kept.join('\n'));

    const results = await strictCheck([main]);

    const codes = results.flatMap(codesOf);
    expect(codes).not.toContain('syntax-error');
    expect(codes).not.toContain('import-duplicate-default');
    expect(codes).toContain('controller-imbalance');
  });
});
