/**
 * Spec 059 Phase 2, `brief/gate.ts` part 1 (FR-009, FR-011, FR-012, FR-032 to FR-034, R-14,
 * R-15, P16, P21; plan §8; SC-001 pure half): the verdict of the gate matrix, the addition
 * triggers, the approved directory and the known-program change of `accept-existing`, all on
 * plain `GateInput` / `ProgramScan` / `RecordEntry` literals.
 *
 * Part 2 (FR-010, FR-014, FR-015, FR-017, FR-053 to FR-056): `checkPrograms` on temp projects
 * with a real record store, `cliBriefWarnings` and `briefStatusOf`.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Effect } from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BRIEF_FILE, EMPTY_PARSED, parseBrief, writeBrief } from '../mcp/brief/brief-file.js';
import {
  type AdditionState,
  type BriefState,
  type BriefStateName,
  EMPTY_BRIEF,
  evaluate,
  pickRound,
} from '../mcp/brief/engine.js';
import { makeFacts } from '../mcp/brief/facts.js';
import {
  type ApprovedSet,
  approvedAdditionSet,
  approvedDirectory,
  briefStatusOf,
  checkPrograms,
  classifyKnownChange,
  cliBriefWarnings,
  cliBriefWarningsFor,
  type GateInput,
  type GoverningBrief,
  gateVerdict,
  governs,
  isMainBrief,
  type Trigger,
  type Verdict,
} from '../mcp/brief/gate.js';
import {
  makeRecordStore,
  type ProgramRecord,
  type ProgramScan,
  parseRecord,
  RECORD_FILE,
  type RecordEntry,
  type Via,
  writeRecordText,
} from '../mcp/brief/known-programs.js';
import { TREE } from '../mcp/brief/tree.js';

const NONE: ApprovedSet = { timelines: [], languages: [], extensions: false };

const scan = (
  timelines: readonly string[],
  languages: readonly string[] = ['en-US'],
  extensions = false
): ProgramScan => ({ library: false, timelines, languages, extensions });

const entry = (
  via: Via,
  timelines: readonly string[] = ['Intro', 'Logic'],
  languages: readonly string[] = ['en-US'],
  extensions = false
): RecordEntry => ({ path: 'main.eligian', timelines, languages, extensions, via });

/** The brief's approved set: S2 names, L1 codes, H1 ≠ none. */
const BRIEF_SET: ApprovedSet = {
  timelines: ['Intro', 'Logic'],
  languages: ['en-US'],
  extensions: false,
};

const CHANGED = [{ id: 'C1', title: 'Who is it for?', value: 'children' }];

/** The governing brief in each situation the matrix names. */
const BRIEFS: Readonly<Record<string, GoverningBrief>> = {
  open: { state: 'open', confirmation: 'none', changed: [], approvedSet: BRIEF_SET },
  complete: { state: 'complete', confirmation: 'none', changed: [], approvedSet: BRIEF_SET },
  confirmed: { state: 'confirmed', confirmation: 'valid', changed: [], approvedSet: BRIEF_SET },
  approved: { state: 'approved', confirmation: 'valid', changed: [], approvedSet: BRIEF_SET },
  /** Answers changed through the tool after a confirmation (FR-026): the watermark moved. */
  changed: { state: 'complete', confirmation: 'invalid', changed: CHANGED, approvedSet: BRIEF_SET },
  /** A hand edit: the signature breaks, no round moved. */
  'hand-edited': {
    state: 'complete',
    confirmation: 'invalid',
    changed: [],
    approvedSet: BRIEF_SET,
  },
  /** Confirmed on another machine: the HMAC does not verify with this key. */
  'other-key': { state: 'complete', confirmation: 'invalid', changed: [], approvedSet: BRIEF_SET },
};

const input = (overrides: Partial<GateInput>): GateInput => ({
  scan: scan(['Intro', 'Logic']),
  entry: undefined,
  brief: undefined,
  additions: NONE,
  ...overrides,
});

const runs: Verdict = { verdict: 'runs' };
const refused = (code: string): Verdict => ({ verdict: 'refused', code }) as Verdict;

describe('gateVerdict', () => {
  it.each<[string, GateInput, Verdict]>([
    ['row 1: not governed, known → runs', input({ entry: entry('first-run') }), runs],
    ['row 2: not governed, not known → brief-required', input({}), refused('brief-required')],
    [
      'row 3: governed, known via brief, answers changed after approval (computed complete) → runs',
      input({ entry: entry('brief'), brief: BRIEFS.changed }),
      runs,
    ],
    [
      'row 3: governed, known via addition, hand-edited after approval → runs',
      input({ entry: entry('addition'), brief: BRIEFS['hand-edited'] }),
      runs,
    ],
    [
      'row 3: governed, known via adopted, approved → runs',
      input({ entry: entry('adopted'), brief: BRIEFS.approved }),
      runs,
    ],
    [
      'row 5: governed, not known, frontier not empty → brief-incomplete',
      input({ brief: BRIEFS.open }),
      refused('brief-incomplete'),
    ],
    [
      'row 6: governed, not known, answers changed after a confirmation → brief-changed',
      input({ brief: BRIEFS.changed }),
      refused('brief-changed'),
    ],
    [
      'row 7: governed, not known, complete with no confirmation → brief-not-confirmed',
      input({ brief: BRIEFS.complete }),
      refused('brief-not-confirmed'),
    ],
    [
      'row 8: governed, not known, confirmed → storyboard-not-approved',
      input({ brief: BRIEFS.confirmed }),
      refused('storyboard-not-approved'),
    ],
    ['row 9: governed, not known, approved → runs', input({ brief: BRIEFS.approved }), runs],
  ])('%s', (_situation, gate, verdict) => {
    expect(gateVerdict(gate)).toEqual(verdict);
  });

  const row4: [Via, string][] = (['first-run', 'accepted'] as const).flatMap(via =>
    ['open', 'complete', 'confirmed', 'changed', 'hand-edited', 'other-key'].map(
      state => [via, state] as [Via, string]
    )
  );
  it.each(row4)('row 4: governed, known via %s, %s brief → runs', (via, state) => {
    expect(gateVerdict(input({ entry: entry(via), brief: BRIEFS[state] }))).toEqual(runs);
  });

  it('a not-known program with another key’s confirmation is brief-not-confirmed (row 7)', () => {
    expect(gateVerdict(input({ brief: BRIEFS['other-key'] }))).toEqual(
      refused('brief-not-confirmed')
    );
  });

  it('a not-known program with changed answers after confirmation is brief-changed (row 6)', () => {
    expect(gateVerdict(input({ brief: BRIEFS.changed }))).toEqual(refused('brief-changed'));
  });

  it('scan undefined (eligian_init’s target, P16) skips the trigger check', () => {
    const storyboardViews = ['Intro', 'Logic', 'Credits'];
    expect(gateVerdict(input({ scan: undefined, entry: entry('first-run') }))).toEqual(runs);
    expect(
      gateVerdict(
        input({ scan: undefined, entry: entry('brief'), brief: BRIEFS.approved, storyboardViews })
      )
    ).toEqual(runs);
    expect(
      gateVerdict(input({ scan: undefined, brief: BRIEFS.approved, storyboardViews }))
    ).toEqual(runs);
    // The brief rows still decide a program that is not known.
    expect(gateVerdict(input({ scan: undefined }))).toEqual(refused('brief-required'));
    expect(gateVerdict(input({ scan: undefined, brief: BRIEFS.open }))).toEqual(
      refused('brief-incomplete')
    );
  });
});

describe('triggers', () => {
  const addition = (...triggers: Trigger[]): Verdict => ({
    verdict: 'refused',
    code: 'addition-not-briefed',
    triggers,
  });

  /** Rows 1, 3, 4 and 9: each situation in which a program runs unless it has an addition. */
  const situations: [string, Partial<GateInput>][] = [
    ['row 1 (known, not governed)', { entry: entry('first-run') }],
    ['row 3 (known via brief)', { entry: entry('brief'), brief: BRIEFS.approved }],
    ['row 4 (known via first-run, open brief)', { entry: entry('first-run'), brief: BRIEFS.open }],
    [
      'row 4 (known via accepted, changed brief)',
      { entry: entry('accepted'), brief: BRIEFS.changed },
    ],
    ['row 9 (approved, not known)', { brief: BRIEFS.approved }],
  ];

  it.each(situations)('a new timeline under %s → addition-not-briefed', (_row, overrides) => {
    const gate = input({ ...overrides, scan: scan(['Intro', 'Logic', 'Outro']) });
    expect(gateVerdict(gate)).toEqual(addition({ addition: 'view', name: 'Outro' }));
  });

  it.each(situations)('a new language under %s → addition-not-briefed', (_row, overrides) => {
    const gate = input({ ...overrides, scan: scan(['Intro', 'Logic'], ['en-US', 'de-DE']) });
    expect(gateVerdict(gate)).toEqual(addition({ addition: 'language', name: 'de-DE' }));
  });

  it.each(situations)('an extensions block under %s → addition-not-briefed', (_row, overrides) => {
    const gate = input({ ...overrides, scan: scan(['Intro', 'Logic'], ['en-US'], true) });
    expect(gateVerdict(gate)).toEqual(addition({ addition: 'host-module', name: '' }));
  });

  it.each(situations.slice(1))(
    'a new storyboard view under %s → addition-not-briefed',
    (_row, overrides) => {
      const gate = input({ ...overrides, storyboardViews: ['Intro', 'Logic', 'Credits'] });
      expect(gateVerdict(gate)).toEqual(addition({ addition: 'view', name: 'Credits' }));
    }
  );

  it('rows 3 and 4 measure against the record entry, not the brief’s S2', () => {
    // S2 edited after approval to add Outro: the approved set of a known program is its entry.
    const widened: GoverningBrief = {
      ...BRIEFS.changed,
      approvedSet: {
        timelines: ['Intro', 'Logic', 'Outro'],
        languages: ['en-US'],
        extensions: false,
      },
    };
    for (const via of ['brief', 'first-run', 'accepted'] as const) {
      const gate = input({
        entry: entry(via),
        brief: widened,
        scan: scan(['Intro', 'Logic', 'Outro']),
      });
      expect(gateVerdict(gate)).toEqual(addition({ addition: 'view', name: 'Outro' }));
    }
  });

  it('an approved addition of the directory is not a trigger', () => {
    const additions: ApprovedSet = { timelines: ['Outro'], languages: ['de-DE'], extensions: true };
    for (const overrides of situations.map(([, o]) => o)) {
      const gate = input({
        ...overrides,
        additions,
        scan: scan(['Intro', 'Logic', 'Outro'], ['en-US', 'de-DE'], true),
      });
      expect(gateVerdict(gate)).toEqual(runs);
    }
  });

  it('several triggers in program order: timelines, then languages, then the extensions block, then storyboard views', () => {
    const gate = input({
      entry: entry('brief'),
      brief: BRIEFS.approved,
      scan: scan(['Intro', 'Outro', 'Logic', 'Bonus'], ['de-DE', 'en-US', 'fr-FR'], true),
      storyboardViews: ['Intro', 'Credits', 'Logic', 'Outro'],
    });
    expect(gateVerdict(gate)).toEqual(
      addition(
        { addition: 'view', name: 'Outro' },
        { addition: 'view', name: 'Bonus' },
        { addition: 'language', name: 'de-DE' },
        { addition: 'language', name: 'fr-FR' },
        { addition: 'host-module', name: '' },
        { addition: 'view', name: 'Credits' }
      )
    );
  });

  it.each(['an interaction', 'an asset', 'a beat', 'a class'])(
    'non-trigger: %s in an existing view (equal scans) → runs',
    () => {
      for (const overrides of situations.map(([, o]) => o)) {
        expect(gateVerdict(input({ ...overrides, scan: scan(['Intro', 'Logic']) }))).toEqual(runs);
      }
    }
  );

  it('row 3 with a brief changed after approval and storyboardViews set: a new storyboard view is addition-not-briefed', () => {
    const gate = input({
      entry: entry('brief'),
      brief: BRIEFS.changed,
      storyboardViews: ['Intro', 'Logic', 'Gallery'],
    });
    expect(gateVerdict(gate)).toEqual(addition({ addition: 'view', name: 'Gallery' }));
  });

  it('row 1 ignores storyboard views (no main brief, P21)', () => {
    const gate = input({
      entry: entry('first-run'),
      storyboardViews: ['Intro', 'Logic', 'Gallery'],
    });
    expect(gateVerdict(gate)).toEqual(runs);
  });
});

describe('approvedDirectory (P21)', () => {
  const root = path.join(os.tmpdir(), 'eligian-gate-project');
  const dir = path.join(root, 'deck');
  const record = (...programs: RecordEntry[]): ProgramRecord => ({ version: 1, programs });
  const at = (via: Via, file = 'deck/main.eligian'): RecordEntry => ({ ...entry(via), path: file });
  const states: BriefStateName[] = ['open', 'complete', 'confirmed', 'approved'];

  it.each(['brief', 'addition', 'adopted'] as const)(
    'an entry in the dir via %s → true whatever the state',
    via => {
      for (const state of states) {
        expect(approvedDirectory(record(at(via)), root, dir, state)).toBe(true);
      }
    }
  );

  it('only first-run / accepted entries and state complete → false', () => {
    const r = record(at('first-run'), at('accepted', 'deck/other.eligian'));
    expect(approvedDirectory(r, root, dir, 'complete')).toBe(false);
  });

  it('no entry and state approved → true', () => {
    expect(approvedDirectory(record(), root, dir, 'approved')).toBe(true);
    expect(
      approvedDirectory({ invalid: 'programs.json is not valid JSON' }, root, dir, 'approved')
    ).toBe(true);
  });

  it('an entry via brief in another directory → false', () => {
    expect(
      approvedDirectory(record(at('brief', 'other/main.eligian')), root, dir, 'complete')
    ).toBe(false);
    expect(
      approvedDirectory(record(at('brief', 'deck/sub/main.eligian')), root, dir, 'complete')
    ).toBe(false);
  });

  it('an invalid record and state complete → false', () => {
    expect(
      approvedDirectory({ invalid: 'programs.json has no programs list' }, root, dir, 'complete')
    ).toBe(false);
  });
});

describe('classifyKnownChange (FR-009, R-15)', () => {
  const known = entry('first-run', ['Intro', 'Logic'], ['en-US'], false);

  it('scan equal to the entry → unchanged', () => {
    expect(classifyKnownChange(scan(['Intro', 'Logic']), known, NONE)).toEqual({
      change: 'unchanged',
    });
  });

  it('Logic → Logic 2 (1 removed, 1 new) → rename', () => {
    expect(classifyKnownChange(scan(['Intro', 'Logic 2']), known, NONE)).toEqual({
      change: 'rename',
    });
  });

  it('1 removed + 2 new → addition, triggers = both new names in program order', () => {
    expect(classifyKnownChange(scan(['Zeta', 'Intro', 'Alpha']), known, NONE)).toEqual({
      change: 'addition',
      triggers: [
        { addition: 'view', name: 'Zeta' },
        { addition: 'view', name: 'Alpha' },
      ],
    });
  });

  it('rename + a new language code → addition', () => {
    expect(
      classifyKnownChange(scan(['Intro', 'Logic 2'], ['en-US', 'de-DE']), known, NONE)
    ).toEqual({
      change: 'addition',
      triggers: [
        { addition: 'view', name: 'Logic 2' },
        { addition: 'language', name: 'de-DE' },
      ],
    });
  });

  it('rename + a new extensions block → addition', () => {
    expect(classifyKnownChange(scan(['Intro', 'Logic 2'], ['en-US'], true), known, NONE)).toEqual({
      change: 'addition',
      triggers: [
        { addition: 'view', name: 'Logic 2' },
        { addition: 'host-module', name: '' },
      ],
    });
  });

  it('a new name that is an approved addition of the directory (Outro) → unchanged', () => {
    const additions: ApprovedSet = { timelines: ['Outro'], languages: [], extensions: false };
    expect(classifyKnownChange(scan(['Intro', 'Logic', 'Outro']), known, additions)).toEqual({
      change: 'unchanged',
    });
  });

  it('a removed name and nothing new → rename', () => {
    expect(classifyKnownChange(scan(['Intro']), known, NONE)).toEqual({ change: 'rename' });
  });
});

describe('governance (FR-011)', () => {
  const empty: BriefState = { treeVersion: 1, answers: [] };
  const answer = { id: 'C1', value: 'adults', by: 'user' as const, round: 1 };
  const confirmation = {
    mode: 'elicitation' as const,
    at: '2026-11-20T10:00:00.000Z',
    round: 1,
    hmac: `hmac-sha256:${'0'.repeat(64)}`,
  };
  const outro: AdditionState = {
    kind: 'view',
    name: 'Outro',
    heading: 'Addition: view Outro',
    answers: [answer],
  };

  it('a main brief has an idea, an answer outside the addition sections, or a confirmation line', () => {
    expect(isMainBrief({ ...empty, idea: 'A tour of the zoo' })).toBe(true);
    expect(isMainBrief({ ...empty, answers: [answer] })).toBe(true);
    expect(isMainBrief({ ...empty, confirmation })).toBe(true);
    expect(isMainBrief(empty)).toBe(false);
    expect(isMainBrief({ ...empty, additions: [outro] })).toBe(false);
  });

  it('a brief of only addition sections governs nothing; an adopted one only once approved', () => {
    expect(governs({ ...empty, additions: [outro] }, 'open')).toBe(false);
    expect(governs({ ...empty, idea: 'x' }, 'open')).toBe(true);
    const adopted: BriefState = { ...empty, scope: 'adopt', answers: [answer] };
    for (const state of ['open', 'complete', 'confirmed'] as const) {
      expect(governs(adopted, state)).toBe(false);
    }
    expect(governs(adopted, 'approved')).toBe(true);
  });

  it('the approved set of the addition sections takes only the approved ones', () => {
    const sections: AdditionState[] = [
      outro,
      { kind: 'view', name: 'Credits', heading: 'Addition: view Credits', answers: [] },
      { kind: 'language', name: 'de-DE', heading: 'Addition: language de-DE', answers: [] },
      { kind: 'language', name: 'fr-FR', heading: 'Addition: language fr-FR', answers: [] },
      { kind: 'host-module', name: '', heading: 'Addition: host-module', answers: [] },
    ];
    const approved = new Set([
      'Addition: view Outro',
      'Addition: language de-DE',
      'Addition: host-module',
    ]);
    const stateOf = (a: AdditionState): BriefStateName =>
      approved.has(a.heading) ? 'approved' : 'confirmed';
    expect(approvedAdditionSet(sections, stateOf)).toEqual({
      timelines: ['Outro'],
      languages: ['de-DE'],
      extensions: true,
    });
    expect(approvedAdditionSet([], stateOf)).toEqual(NONE);
  });
});

// ---------------------------------------------------------------------------------------------
// Part 2: the effectful gate, the CLI warning and the project's brief section.

const temps: string[] = [];
afterEach(() => {
  for (const dir of temps.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const tempDir = (prefix: string): string => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  temps.push(dir);
  return dir;
};

const put = (root: string, relative: string, text: string): string => {
  const file = path.join(root, ...relative.split('/'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
};

const program = (...timelines: string[]): string =>
  timelines.map(name => `timeline "${name}" in "#stage" using raf {\n}\n`).join('\n');

const known = (relative: string, timelines: readonly string[], via: Via = 'first-run') => ({
  path: relative,
  timelines,
  languages: [],
  extensions: false,
  via,
});

const putRecord = (root: string, entries: readonly RecordEntry[]): string =>
  put(root, RECORD_FILE.split(path.sep).join('/'), writeRecordText(entries));

/** An open brief: the idea only (Phase 1's writer). */
const OPEN_BRIEF = writeBrief(
  TREE,
  { ...EMPTY_PARSED, brief: { ...EMPTY_BRIEF, idea: 'A tour of the zoo' } },
  {
    state: 'open',
    serverEligian: '0.0.0-test',
    eligianInstalled: undefined,
    packageManager: undefined,
    textDirection: undefined,
    assets: [],
  }
);

/** Every file under `root`: bytes and mtime. */
const snapshot = (root: string): Record<string, { bytes: string; mtime: number }> => {
  const out: Record<string, { bytes: string; mtime: number }> = {};
  const walk = (dir: string): void => {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, item.name);
      if (item.isDirectory()) walk(full);
      else
        out[path.relative(root, full)] = {
          bytes: fs.readFileSync(full).toString('base64'),
          mtime: fs.statSync(full).mtimeMs,
        };
    }
  };
  walk(root);
  return out;
};

interface RefusalShape {
  readonly _tag: string;
  readonly message: string;
  readonly path?: string;
  readonly gate: {
    readonly code: string;
    readonly program: string;
    readonly refused: readonly { readonly program: string; readonly code: string }[];
    readonly brief: string;
    readonly directory: string;
    readonly state: string;
    readonly round: readonly { readonly id: string }[];
    readonly scope?: { readonly addition: string; readonly name: string };
    readonly additions?: readonly { readonly addition: string; readonly name: string }[];
    readonly next: string;
  };
}

const refusalOf = async (result: Promise<unknown>): Promise<RefusalShape> => {
  const settled = (await result) as { readonly _tag: string; readonly failure?: unknown };
  expect(settled._tag).toBe('Failure');
  const failure = settled.failure as RefusalShape;
  expect(failure._tag).toBe('ToolGateRefused');
  return failure;
};

describe('checkPrograms', () => {
  const setup = () => {
    const root = tempDir('eligian-gate-');
    const stateDir = tempDir('eligian-gate-state-');
    const noteBrief = vi.fn();
    const context = { record: makeRecordStore(), stateDir, noteBrief };
    const run = (files: readonly string[], options?: { readonly init?: true }) =>
      Effect.runPromise(
        Effect.result(checkPrograms({ root, from: 'cwd' }, files, context, options))
      );
    return { root, stateDir, noteBrief, run };
  };

  it('row 2: fails ToolGateRefused with brief-required and the FR-017 payload', async () => {
    const { root, run } = setup();
    putRecord(root, []);
    const file = put(root, 'deck/main.eligian', program('Intro'));
    const dir = path.dirname(file);
    const failure = await refusalOf(run([file]));
    expect(failure.message).toBe(`brief-required: ${file}`);
    expect(failure.path).toBe(file);
    const expectedRound = pickRound(TREE, evaluate(TREE, EMPTY_BRIEF, makeFacts(root, dir)), 7);
    expect(expectedRound).toHaveLength(7);
    expect(failure.gate).toEqual({
      code: 'brief-required',
      program: file,
      refused: [{ program: file, code: 'brief-required' }],
      brief: path.join(dir, BRIEF_FILE),
      directory: dir,
      state: 'none',
      round: expectedRound,
      next: expect.any(String),
    });
    expect(failure.gate.next).toContain('action: status');
    expect(failure.gate.next).toContain('action: accept-existing');
  });

  it('row 5: brief-incomplete with the next round of the brief', async () => {
    const { root, run } = setup();
    putRecord(root, []);
    const file = put(root, 'deck/main.eligian', program('Intro'));
    const dir = path.dirname(file);
    put(root, 'deck/BRIEF.md', OPEN_BRIEF);
    const failure = await refusalOf(run([file]));
    const evaluation = evaluate(TREE, parseBrief(OPEN_BRIEF).brief, makeFacts(root, dir));
    expect(failure.gate.code).toBe('brief-incomplete');
    expect(failure.gate.state).toBe('open');
    expect(failure.gate.round).toEqual(pickRound(TREE, evaluation, 7));
    expect(failure.gate.round.length).toBeGreaterThan(0);
    expect(failure.gate.next).toContain('action: answer');
  });

  it('a glob over a refused and a known program fails listing only the refused one (R-12)', async () => {
    const { root, run } = setup();
    putRecord(root, [known('deck/a.eligian', ['A'])]);
    const a = put(root, 'deck/a.eligian', program('A'));
    const b = put(root, 'deck/b.eligian', program('B'));
    const failure = await refusalOf(run([a, b]));
    expect(failure.gate.program).toBe(b);
    expect(failure.gate.refused).toEqual([{ program: b, code: 'brief-required' }]);
  });

  it('a library alone runs', async () => {
    const { root, run, noteBrief } = setup();
    putRecord(root, []);
    const lib = put(root, 'lib.eligian', 'library helpers\n\naction greet() [\n]\n');
    const result = await run([lib]);
    expect(result._tag).toBe('Success');
    expect(noteBrief).not.toHaveBeenCalled();
  });

  it('a known program runs and the result lists its verdict', async () => {
    const { root, run, noteBrief } = setup();
    putRecord(root, [known('main.eligian', ['Intro'])]);
    const file = put(root, 'main.eligian', program('Intro'));
    const result = await run([file]);
    expect(result._tag).toBe('Success');
    if (result._tag === 'Success') {
      expect(result.success.map(g => [g.file, g.verdict])).toEqual([[file, { verdict: 'runs' }]]);
    }
    expect(noteBrief).toHaveBeenCalledWith({ state: 'none' });
  });

  it('an invalid record: brief-required, the message names the parse problem', async () => {
    const { root, run } = setup();
    const record = put(root, '.eligian/programs.json', 'not json');
    const file = put(root, 'main.eligian', program('Intro'));
    const failure = await refusalOf(run([file]));
    expect(failure.gate.code).toBe('brief-required');
    const problem = parseRecord('not json');
    expect('invalid' in problem).toBe(true);
    if ('invalid' in problem) expect(failure.message).toContain(problem.invalid);
    expect(fs.readFileSync(record, 'utf-8')).toBe('not json');
  });

  it('addition-not-briefed: the scope, every trigger and the scoped round', async () => {
    const { root, run } = setup();
    putRecord(root, [known('main.eligian', ['Intro'])]);
    const file = put(root, 'main.eligian', program('Intro', 'Outro'));
    const failure = await refusalOf(run([file]));
    expect(failure.gate.code).toBe('addition-not-briefed');
    expect(failure.gate.state).toBe('none');
    expect(failure.gate.scope).toEqual({ addition: 'view', name: 'Outro' });
    expect(failure.gate.additions).toEqual([{ addition: 'view', name: 'Outro' }]);
    // The scoped tree's first round (S6 before the V templates that need it), not the main tree's.
    const ids = failure.gate.round.map(item => item.id);
    expect(ids).toEqual(expect.arrayContaining(['S4', 'S6']));
    expect(ids).not.toContain('P1');
    expect(failure.gate.next).toContain('scope');
    expect(fs.existsSync(path.join(root, BRIEF_FILE))).toBe(false);
  });

  it('nothing is written: the project files (bytes, mtimes) and the absence of BRIEF.md are unchanged (FR-015)', async () => {
    const { root, run } = setup();
    putRecord(root, [known('deck/a.eligian', ['A'])]);
    const a = put(root, 'deck/a.eligian', program('A', 'B'));
    const b = put(root, 'b.eligian', program('B'));
    const c = put(root, 'open/c.eligian', program('C'));
    put(root, 'open/BRIEF.md', OPEN_BRIEF);
    const before = snapshot(root);
    for (const file of [a, b, c]) await refusalOf(run([file]));
    expect(snapshot(root)).toEqual(before);
    expect(fs.existsSync(path.join(root, 'deck', BRIEF_FILE))).toBe(false);
    expect(fs.existsSync(path.join(root, BRIEF_FILE))).toBe(false);
  });

  it('noteBrief gets the state and code of the first refused program', async () => {
    const { root, run, noteBrief } = setup();
    putRecord(root, [known('deck/a.eligian', ['A'])]);
    const a = put(root, 'deck/a.eligian', program('A'));
    const b = put(root, 'deck/b.eligian', program('B'));
    put(root, 'deck/BRIEF.md', OPEN_BRIEF);
    const failure = await refusalOf(run([a, b]));
    expect(failure.gate.refused).toEqual([{ program: b, code: 'brief-incomplete' }]);
    expect(noteBrief).toHaveBeenCalledTimes(1);
    expect(noteBrief).toHaveBeenCalledWith({ state: 'open', gate: 'brief-incomplete' });
  });

  it('the target of eligian_init (init: true) is not read and skips the triggers (P16)', async () => {
    const { root, run } = setup();
    putRecord(root, []);
    const target = path.join(root, 'fresh', 'main.eligian');
    const failure = await refusalOf(run([target], { init: true }));
    expect(failure.gate.code).toBe('brief-required');
    expect(failure.gate.program).toBe(target);
    expect(fs.existsSync(path.dirname(target))).toBe(false);
  });
});

describe('cliBriefWarnings', () => {
  const LINE =
    /^eligian: .* — BRIEF\.md is open; the open questions: eligian_brief \{"action":"status","directory":".*"\}$/;

  const setup = () => {
    const root = tempDir('eligian-warn-');
    const stateDir = tempDir('eligian-warn-state-');
    return { root, stateDir, env: { ELIGIAN_STATE_DIR: stateDir } };
  };

  it('an open BRIEF.md and no record → one line', async () => {
    const { root, env } = setup();
    const file = put(root, 'deck/main.eligian', program('Intro'));
    put(root, 'deck/BRIEF.md', OPEN_BRIEF);
    const lines = await cliBriefWarnings([file], root, env);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(LINE);
  });

  it('a record without the program and no BRIEF.md → one "is none" line', async () => {
    const { root, env } = setup();
    putRecord(root, []);
    const file = put(root, 'main.eligian', program('Intro'));
    expect(await cliBriefWarnings([file], root, env)).toEqual([
      'eligian: main.eligian — BRIEF.md is none; the open questions: eligian_brief {"action":"status","directory":"."}',
    ]);
  });

  it('no record, no brief → []', async () => {
    const { root, env } = setup();
    const file = put(root, 'main.eligian', program('Intro'));
    expect(await cliBriefWarnings([file], root, env)).toEqual([]);
  });

  it('an unparsable record → []', async () => {
    const { root, env } = setup();
    put(root, '.eligian/programs.json', 'not json');
    const file = put(root, 'main.eligian', program('Intro'));
    expect(await cliBriefWarnings([file], root, env)).toEqual([]);
  });

  it('BRIEF.md is a directory → []', async () => {
    const { root, env } = setup();
    const file = put(root, 'main.eligian', program('Intro'));
    fs.mkdirSync(path.join(root, BRIEF_FILE));
    expect(await cliBriefWarnings([file], root, env)).toEqual([]);
  });

  it.each<Via>(['first-run', 'accepted', 'brief', 'addition', 'adopted'])(
    'a governed program listed in the record via %s → []',
    async via => {
      const { root, env } = setup();
      putRecord(root, [known('main.eligian', ['Intro'], via)]);
      const file = put(root, 'main.eligian', program('Intro'));
      put(root, 'BRIEF.md', OPEN_BRIEF);
      expect(await cliBriefWarnings([file], root, env)).toEqual([]);
    }
  );

  it('an addition is not reported', async () => {
    const { root, env } = setup();
    putRecord(root, [known('main.eligian', ['Intro'])]);
    const file = put(root, 'main.eligian', program('Intro', 'Outro'));
    expect(await cliBriefWarnings([file], root, env)).toEqual([]);
  });

  it('a library is not reported', async () => {
    const { root, env } = setup();
    putRecord(root, []);
    const lib = put(root, 'lib.eligian', 'library helpers\n');
    expect(await cliBriefWarnings([lib], root, env)).toEqual([]);
  });

  it('paths are relative to cwd with /', async () => {
    const { root, env } = setup();
    const file = put(root, 'deck/sub/main.eligian', program('Intro'));
    put(root, 'deck/sub/BRIEF.md', OPEN_BRIEF);
    expect(await cliBriefWarnings([file], root, env)).toEqual([
      'eligian: deck/sub/main.eligian — BRIEF.md is open; the open questions: eligian_brief {"action":"status","directory":"deck/sub"}',
    ]);
  });

  it('cliBriefWarningsFor expands the patterns first', async () => {
    const { root, stateDir } = setup();
    put(root, 'deck/main.eligian', program('Intro'));
    put(root, 'deck/BRIEF.md', OPEN_BRIEF);
    put(root, 'other/main.eligian', program('Other'));
    vi.stubEnv('ELIGIAN_STATE_DIR', stateDir);
    try {
      const lines = await cliBriefWarningsFor(['.'], root);
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatch(LINE);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('the state dir is still empty afterwards (no brief-key, no *.tmp)', async () => {
    const { root, stateDir, env } = setup();
    const file = put(root, 'main.eligian', program('Intro'));
    put(root, 'BRIEF.md', OPEN_BRIEF);
    const before = snapshot(root);
    await cliBriefWarnings([file], root, env);
    expect(fs.readdirSync(stateDir)).toEqual([]);
    expect(snapshot(root)).toEqual(before);
    expect(fs.existsSync(path.join(root, '.eligian'))).toBe(false);
  });
});

describe('briefStatusOf', () => {
  it("known unbriefed: { file: null, state: 'none', known: true, gate: 'runs' }", async () => {
    const root = tempDir('eligian-status-');
    const file = put(root, 'main.eligian', program('Intro'));
    const record: ProgramRecord = { version: 1, programs: [known('main.eligian', ['Intro'])] };
    const status = await briefStatusOf(root, file, record, undefined);
    expect(status).toMatchObject({ file: null, state: 'none', known: true, gate: 'runs' });
    expect(status.counts).toBeUndefined();
    expect(typeof status.next).toBe('string');
  });

  it('governed open: state open, counts, gate brief-incomplete', async () => {
    const root = tempDir('eligian-status-');
    const file = put(root, 'deck/main.eligian', program('Intro'));
    const dir = path.dirname(file);
    put(root, 'deck/BRIEF.md', OPEN_BRIEF);
    const record: ProgramRecord = { version: 1, programs: [] };
    const status = await briefStatusOf(root, file, record, undefined);
    const evaluation = evaluate(TREE, parseBrief(OPEN_BRIEF).brief, makeFacts(root, dir));
    expect(status).toEqual({
      file: path.join(dir, BRIEF_FILE),
      state: 'open',
      counts: evaluation.counts,
      next: expect.any(String),
      known: false,
      gate: 'brief-incomplete',
    });
  });
});
