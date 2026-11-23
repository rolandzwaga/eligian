/**
 * Spec 059 Phase 2 (FR-033 to FR-040, FR-015 addition rounds, P11, P20, P21; SC-008; T033):
 * additions through the in-memory server.
 *
 * Every project is a temp copy made before its server starts: the tour (`examples/eligian-tour/`),
 * `examples/demo.eligian` with its layout, styles, labels and libraries, or the gate's fixture
 * program with an approved brief built through `eligian_brief` (the terse persona). The client
 * announces elicitation and accepts every dialog, so a scoped interview is signed by the dialogs
 * (`confirm`, `approve-storyboard`) and no signed line is written by hand.
 *
 * SC-008's baseline (`__fixtures__/mcp/brief/tour-baseline/`, captured by T001 before any Phase 2
 * change) is compared through the same `normalizeBaseline`.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BASELINE_CALLS, normalizeBaseline } from '../../scripts/capture-tour-baseline.js';
import { generateKnowledge } from '../../scripts/generate-knowledge.js';
import { approvedBrief, snapshotFiles } from './brief-helpers.js';
import {
  type ElicitAnswer,
  type ElicitRequest,
  type InMemoryServer,
  startInMemoryServer,
  type ToolCallResult,
} from './mcp-test-client.js';

const HERE = import.meta.dirname;
const REPO = path.resolve(HERE, '..', '..', '..', '..');
const EXAMPLES = path.join(REPO, 'examples');
const TOUR = path.join(EXAMPLES, 'eligian-tour');
const FIXTURES = path.join(HERE, '__fixtures__', 'mcp');
const BASELINE = path.join(FIXTURES, 'brief', 'tour-baseline');
const STORYBOARDS = path.join(FIXTURES, 'brief', 'storyboards');
const PROGRAM = path.join(FIXTURES, 'brief', 'gate', 'program');
const STUB = path.join(FIXTURES, 'smoke-tool', 'stub-cli.mjs');

/** A scoped interview and its two dialogs take a few seconds; a briefed project more. */
const SLOW = 120_000;

const RECORD = path.join('.eligian', 'programs.json');

const temps: string[] = [];
const servers: InMemoryServer[] = [];
let stateDir: string;
let docsRoot: string;

const tempDir = (prefix: string): string => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  temps.push(dir);
  return dir;
};

beforeAll(async () => {
  stateDir = tempDir('eligian-additions-state-');
  // The docs as the baseline's server had them (`capture-tour-baseline.ts`).
  docsRoot = tempDir('eligian-additions-docs-');
  await generateKnowledge({ outDir: docsRoot });
}, SLOW);

afterAll(async () => {
  for (const server of servers.splice(0)) await server.close();
  for (const dir of temps.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** The client's dialog accepts: its one boolean field is `true`. */
const accept = (request: ElicitRequest): ElicitAnswer => {
  const schema = request.requestedSchema as { readonly properties: Record<string, unknown> };
  const [field] = Object.keys(schema.properties);
  return { action: 'accept', content: { [field]: true } };
};

interface Project {
  readonly root: string;
  readonly server: InMemoryServer;
}

/** A server on `root` (its cwd) with the smoke stub and the accepting dialog. */
async function serve(root: string): Promise<Project> {
  const server = await startInMemoryServer(
    { cwd: root, docsRoot, brief: { stateDir }, smoke: { cliPath: STUB } },
    { elicitation: true, onElicit: accept }
  );
  servers.push(server);
  return { root, server };
}

/** A temp copy of the tour. */
function tourCopy(): string {
  const root = tempDir('eligian-additions-tour-');
  fs.cpSync(TOUR, root, { recursive: true });
  return root;
}

/**
 * A served copy whose start-time scan has settled: the first gated call waits for it (FR-005) and
 * runs, so the copied program is known as it was copied before a test edits it.
 */
async function known(root: string, program: string): Promise<Project> {
  const project = await serve(root);
  expectRuns(await check(project, program));
  return project;
}

/** A temp copy of `examples/demo.eligian` with its layout, styles, labels and libraries. */
function demoCopy(): string {
  const root = tempDir('eligian-additions-demo-');
  for (const name of [
    'demo.eligian',
    'demo-layout.html',
    'demo-styles.css',
    'demo-labels.json',
    path.join('libraries', 'animations.eligian'),
    path.join('libraries', 'utils.eligian'),
  ]) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.copyFileSync(path.join(EXAMPLES, name), path.join(root, name));
  }
  return root;
}

/** `programs` as the record of `root`, with the `.gitignore` the server would write. */
function putRecord(root: string, text: string): void {
  fs.mkdirSync(path.join(root, '.eligian'), { recursive: true });
  fs.writeFileSync(path.join(root, '.eligian', '.gitignore'), '*\n');
  fs.writeFileSync(path.join(root, RECORD), text);
}

const EMPTY_RECORD = `${JSON.stringify({ version: 1, programs: [] }, null, 2)}\n`;

interface Entry {
  readonly path: string;
  readonly timelines: readonly string[];
  readonly languages: readonly string[];
  readonly extensions: boolean;
  readonly via: string;
}

const recordOf = (root: string): readonly Entry[] =>
  JSON.parse(fs.readFileSync(path.join(root, RECORD), 'utf8')).programs;

const entryOf = (root: string, program: string): Entry | undefined =>
  recordOf(root).find(entry => entry.path === program);

const edit = (file: string, change: (text: string) => string): void => {
  const text = fs.readFileSync(file, 'utf8');
  const changed = change(text);
  expect(changed).not.toBe(text);
  fs.writeFileSync(file, changed);
};

const timelineText = (name: string): string =>
  [
    '',
    `timeline "${name}" in "#stage" using raf {`,
    '  at 0s..2s [',
    '    selectElement("#stage")',
    '  ] [',
    '    selectElement("#stage")',
    '  ]',
    '}',
    '',
  ].join('\n');

const appendTimeline = (file: string, name: string): void =>
  fs.appendFileSync(file, timelineText(name));

/** `"de-DE"` added to the `languages` block (tour and demo both list `nl-NL`). */
const addGerman = (file: string): void =>
  edit(file, text =>
    text.replace('"nl-NL" "Nederlands"', '"nl-NL" "Nederlands"\n    "de-DE" "Deutsch"')
  );

/** An `extensions` block after the default imports of the demo. */
const addExtensions = (file: string): void =>
  edit(file, text =>
    text.replace(
      'locales "./demo-labels.json"',
      'locales "./demo-labels.json"\n\nextensions "./host.ts" {\n  operation trackEvent(eventName: string)\n}'
    )
  );

/** `eligian_brief` on `dir` (default the root); a tool failure throws. */
async function brief(
  project: Project,
  args: Readonly<Record<string, unknown>>,
  dir: string = project.root
): Promise<any> {
  const result = await project.server.callTool('eligian_brief', { directory: dir, ...args });
  if (result.isError) throw new Error(`eligian_brief failed: ${JSON.stringify(result.payload)}`);
  return result.payload;
}

const check = (project: Project, program: string): Promise<ToolCallResult> =>
  project.server.callTool('eligian_check', { paths: [program] });

/** The gate payload of a refused call. */
function gateOf(result: ToolCallResult): any {
  expect(result.isError).toBe(true);
  expect(result.payload.error.kind).toBe('gate');
  return result.payload.error.gate;
}

/** The call ran: not refused by the gate (its own result may list diagnostics). */
function expectRuns(result: ToolCallResult): void {
  expect(result.payload.error?.gate).toBeUndefined();
  expect(result.isError).toBe(false);
}

type Values = Readonly<Record<string, unknown>>;
type Scope = { readonly addition: 'view' | 'language' | 'host-module'; readonly name: string };

const OUTRO: Scope = { addition: 'view', name: 'Outro' };
const GERMAN: Scope = { addition: 'language', name: 'de-DE' };
const HOST: Scope = { addition: 'host-module', name: '' };

/** The answers of the Outro view, by template id; S4 is the storyboard fixtures' row. */
const outroValues = (from: string): Values => ({
  S4: [{ view: from, target: 'Outro', trigger: 'click #more' }],
  S5: { end: 'stay' },
  S6: { provider: 'raf', source: '-' },
  V1: 'Thanks for watching.',
  V2: 'Thank you',
  V3: 'none',
  V4: 'The thanks fades in and stays.',
  V5: { duration: 'none', pacing: 'none', 'cues-from': '-' },
  V6: 'none',
  I4: 'restart',
  D5: { layout: 'title' },
});

const GERMAN_VALUES: Values = {
  L2: { supplier: 'The agency', when: 'week 3' },
  L3: 'A menu in the corner.',
  L4: 'none',
};

const HOST_VALUES: Values = {
  H1: [{ need: 'analytics', detail: 'page views' }],
  H3: 'Page views go to the analytics endpoint; no consent needed.',
};

/** The scoped interview (`status`, then `answer` per round) until the section is complete. */
async function interview(
  project: Project,
  scope: Scope,
  values: Values,
  dir: string = project.root
): Promise<any> {
  let reply = await brief(project, { action: 'status', scope }, dir);
  for (let round = 0; round < 10 && reply.state === 'open'; round++) {
    const answers = reply.round.map((item: { id: string }) => {
      const [id] = item.id.split(':');
      if (!(id in values)) throw new Error(`no value for ${item.id}`);
      return { id: item.id, value: values[id] };
    });
    reply = await brief(project, { action: 'answer', scope, answers }, dir);
    expect(reply.rejected).toEqual([]);
  }
  expect(reply.state).toBe('complete');
  return reply;
}

/** The scoped interview, then its confirmation in the dialog. */
async function confirmedAddition(
  project: Project,
  scope: Scope,
  values: Values,
  dir: string = project.root
): Promise<void> {
  await interview(project, scope, values, dir);
  const confirmed = await brief(project, { action: 'confirm', scope }, dir);
  expect(confirmed.state).toBe('confirmed');
  expect(confirmed.signoff).toEqual({ mode: 'elicitation' });
}

/** A confirmed addition whose storyboard section (`storyboard`, the text) is approved. */
async function approvedAddition(
  project: Project,
  scope: Scope,
  values: Values,
  storyboard: string,
  dir: string = project.root
): Promise<any> {
  await confirmedAddition(project, scope, values, dir);
  fs.writeFileSync(path.join(dir, 'STORYBOARD.md'), storyboard);
  const approved = await brief(project, { action: 'approve-storyboard', scope }, dir);
  expect(approved.refused).toBeUndefined();
  expect(approved.state).toBe('approved');
  return approved;
}

const fixture = (name: string): string => fs.readFileSync(path.join(STORYBOARDS, name), 'utf8');

/** T016's fixtures: each passes the checks of the additions it does not fail (`brief-signoff.spec.ts`). */
const OUTRO_STORYBOARD = 'addition-host-module-none.md';

/** The approved terse brief of the gate's fixture program (`main.eligian`, view `hours`). */
async function briefedProject(): Promise<Project> {
  const root = tempDir('eligian-additions-briefed-');
  fs.cpSync(PROGRAM, root, { recursive: true });
  putRecord(root, EMPTY_RECORD);
  const project = await serve(root);
  await approvedBrief(project.server, root, { stateDir, root });
  expect(entryOf(root, 'main.eligian')?.via).toBe('brief');
  return project;
}

/** A `## view <name>` section before the interactions of `STORYBOARD.md`, and its rows. */
function addStoryboardView(root: string, name: string, rows: readonly string[] = []): void {
  const file = path.join(root, 'STORYBOARD.md');
  edit(file, text => {
    const section = [
      `## view ${name} (container #stage)`,
      '',
      '| timeline | start | end | selector | change | end-block |',
      '| --- | --- | --- | --- | --- | --- |',
      `| ${name} | 0 | 4 | #thanks | addClass is-visible | removeClass is-visible |`,
      '',
      '## interactions',
    ].join('\n');
    const withSection = text.replace('## interactions', section);
    return rows.length === 0
      ? withSection
      : `${withSection.replace(/\n+$/, '')}\n${rows.join('\n')}\n`;
  });
}

// ---------------------------------------------------------------------------------------------

describe('the tour unchanged', () => {
  it(
    'eligian_check, eligian_compile (view summary), eligian_fmt and eligian_smoke (stub CLI) on tour.eligian deep-equal the baseline',
    async () => {
      const root = tourCopy();
      const project = await known(root, 'tour.eligian');
      for (const [file, tool, args] of BASELINE_CALLS) {
        const result = await project.server.callTool(tool, args);
        const expected = JSON.parse(fs.readFileSync(path.join(BASELINE, `${file}.json`), 'utf8'));
        expect(normalizeBaseline(result, root)).toEqual(expected);
      }
    },
    SLOW
  );
});

describe('a view', () => {
  it(
    'Outro appended → addition-not-briefed, scope { addition: view, name: Outro }, the scoped round; V1:Outro after S4, S5, S6',
    async () => {
      const root = tourCopy();
      const project = await known(root, 'tour.eligian');
      appendTimeline(path.join(root, 'tour.eligian'), 'Outro');
      const gate = gateOf(await check(project, 'tour.eligian'));
      expect(gate.code).toBe('addition-not-briefed');
      expect(gate.scope).toEqual(OUTRO);
      // SC-008 as ruled: the scoped tree's frontier (V1–V6 need S6, plan §7), no main-tree id
      const first: string[] = gate.round.map((item: { id: string }) => item.id);
      expect(first).toEqual(expect.arrayContaining(['S4', 'S6']));
      expect(first.some(id => /^(Pd|S[123]|L1|H1)$/.test(id))).toBe(false);
      expect(first).not.toContain('V1:Outro');
      // FR-015: the refusal created nothing.
      expect(fs.existsSync(path.join(root, 'BRIEF.md'))).toBe(false);
      // The round after S4, S5 and S6 are answered holds V1:Outro
      const values = outroValues('Details');
      const answers = first.map(id => ({ id, value: values[id.split(':')[0]] }));
      const next = await brief(project, { action: 'answer', scope: gate.scope, answers });
      expect(next.rejected).toEqual([]);
      expect(next.round.map((item: { id: string }) => item.id)).toContain('V1:Outro');
    },
    SLOW
  );

  it(
    'after the scoped interview, confirm (elicitation) and approve-storyboard of the section (elicitation) → eligian_check runs and the record lists Outro',
    async () => {
      const root = tourCopy();
      const project = await known(root, 'tour.eligian');
      appendTimeline(path.join(root, 'tour.eligian'), 'Outro');
      const gate = gateOf(await check(project, 'tour.eligian'));
      const scope = gate.scope;
      const status = await brief(project, { action: 'status', scope });
      expect(status.scope).toEqual(OUTRO);
      // FR-035: in a project with no brief, the file holds only the addition's section.
      const created = fs.readFileSync(path.join(root, 'BRIEF.md'), 'utf8');
      expect(created).toContain('## Addition: view Outro');
      expect(created).not.toContain('## P:');
      const approved = await approvedAddition(
        project,
        scope,
        outroValues('Details'),
        fixture(OUTRO_STORYBOARD)
      );
      expect(approved.signoff).toEqual({ mode: 'elicitation' });
      expect(approved.scope).toEqual(OUTRO);
      expectRuns(await check(project, 'tour.eligian'));
      const entry = entryOf(root, 'tour.eligian');
      expect(entry?.timelines).toContain('Outro');
      expect(entry?.via).toBe('addition');
    },
    SLOW
  );
});

describe('a language', () => {
  it(
    'de-DE added to the languages block → addition-not-briefed with the L2 round',
    async () => {
      const root = tourCopy();
      const project = await known(root, 'tour.eligian');
      addGerman(path.join(root, 'tour.eligian'));
      const gate = gateOf(await check(project, 'tour.eligian'));
      expect(gate.code).toBe('addition-not-briefed');
      expect(gate.scope).toEqual(GERMAN);
      expect(gate.round.map((item: { id: string }) => item.id)).toContain('L2');
    },
    SLOW
  );
});

describe('a host module', () => {
  it(
    'an extensions block added to a copy of examples/demo.eligian (with its layout, styles and labels) → H1 in the round',
    async () => {
      const root = demoCopy();
      const project = await known(root, 'demo.eligian');
      addExtensions(path.join(root, 'demo.eligian'));
      const gate = gateOf(await check(project, 'demo.eligian'));
      expect(gate.code).toBe('addition-not-briefed');
      expect(gate.scope).toEqual(HOST);
      expect(gate.round.map((item: { id: string }) => item.id)).toContain('H1');
    },
    SLOW
  );
});

describe('edits', () => {
  it(
    'a new on click interaction and a new beat in Hub run',
    async () => {
      const root = tourCopy();
      const project = await known(root, 'tour.eligian');
      edit(path.join(root, 'tour.eligian'), text =>
        text.replace(
          '  on leave [\n    hideView("#hub")',
          [
            '  at 0s..1s [',
            '    selectElement("#hub-title")',
            '    on click "#hub-tagline" navigate "Logic"',
            '  ] [',
            '    selectElement("#hub-title")',
            '  ]',
            '  on leave [',
            '    hideView("#hub")',
          ].join('\n')
        )
      );
      expectRuns(await check(project, 'tour.eligian'));
    },
    SLOW
  );
});

describe('briefed project', () => {
  it(
    'a timeline not in S2 and a ## view section not in S2 are each addition-not-briefed',
    async () => {
      const project = await briefedProject();
      const main = path.join(project.root, 'main.eligian');
      const original = fs.readFileSync(main, 'utf8');
      expectRuns(await check(project, 'main.eligian'));
      appendTimeline(main, 'Extra');
      const timeline = gateOf(await check(project, 'main.eligian'));
      expect(timeline.code).toBe('addition-not-briefed');
      expect(timeline.scope).toEqual({ addition: 'view', name: 'Extra' });
      fs.writeFileSync(main, original);
      expectRuns(await check(project, 'main.eligian'));
      addStoryboardView(project.root, 'Encore');
      const view = gateOf(await check(project, 'main.eligian'));
      expect(view.code).toBe('addition-not-briefed');
      expect(view.scope).toEqual({ addition: 'view', name: 'Encore' });
    },
    SLOW
  );

  it(
    'after approval, a hand edit to BRIEF.md (state complete), then a ## view X section in STORYBOARD.md → addition-not-briefed with scope { addition: view, name: X } (P21)',
    async () => {
      const project = await briefedProject();
      edit(path.join(project.root, 'BRIEF.md'), text =>
        text.replace('Colours, spacing and timing.', 'Colours only.')
      );
      const status = await brief(project, { action: 'status' });
      expect(status.state).toBe('complete');
      expectRuns(await check(project, 'main.eligian'));
      addStoryboardView(project.root, 'X');
      const gate = gateOf(await check(project, 'main.eligian'));
      expect(gate.code).toBe('addition-not-briefed');
      expect(gate.scope).toEqual({ addition: 'view', name: 'X' });
    },
    SLOW
  );
});

describe('later programs (FR-040)', () => {
  /** The briefed project with an approved Outro addition (S4: hours → Outro). */
  async function withOutro(): Promise<Project> {
    const project = await briefedProject();
    const storyboard = path.join(project.root, 'STORYBOARD.md');
    addStoryboardView(project.root, 'Outro', ['| click #more | Outro | navigate | hours |']);
    await approvedAddition(
      project,
      OUTRO,
      outroValues('hours'),
      fs.readFileSync(storyboard, 'utf8')
    );
    expect(entryOf(project.root, 'main.eligian')?.timelines).toEqual(['hours', 'Outro']);
    return project;
  }

  /** A program written after the approvals: the fixture's text plus `names` as timelines. */
  const laterProgram = (project: Project, file: string, names: readonly string[]): void =>
    fs.writeFileSync(
      path.join(project.root, file),
      fs.readFileSync(path.join(PROGRAM, 'main.eligian'), 'utf8') + names.map(timelineText).join('')
    );

  it(
    'with an approved Outro addition, a program written later whose timelines are S2 names plus Outro runs (row 9)',
    async () => {
      const project = await withOutro();
      laterProgram(project, 'later.eligian', ['Outro']);
      expect(entryOf(project.root, 'later.eligian')).toBeUndefined();
      expectRuns(await check(project, 'later.eligian'));
    },
    SLOW
  );

  it(
    'a later program with a timeline neither S2 nor an approved addition → addition-not-briefed for that name',
    async () => {
      const project = await withOutro();
      laterProgram(project, 'later.eligian', ['Outro', 'Encore']);
      const gate = gateOf(await check(project, 'later.eligian'));
      expect(gate.code).toBe('addition-not-briefed');
      expect(gate.scope).toEqual({ addition: 'view', name: 'Encore' });
      expect(gate.additions).toEqual([{ addition: 'view', name: 'Encore' }]);
    },
    SLOW
  );
});

describe('several triggers', () => {
  it(
    'on the demo copy, one edit adding timeline Outro, de-DE and an extensions block → additions in that order, scope { addition: view, name: Outro }',
    async () => {
      const root = demoCopy();
      const project = await known(root, 'demo.eligian');
      const demo = path.join(root, 'demo.eligian');
      addGerman(demo);
      addExtensions(demo);
      appendTimeline(demo, 'Outro');
      const gate = gateOf(await check(project, 'demo.eligian'));
      expect(gate.code).toBe('addition-not-briefed');
      expect(gate.additions).toEqual([OUTRO, GERMAN, HOST]);
      expect(gate.scope).toEqual(OUTRO);
    },
    SLOW
  );
});

describe('section storyboard (FR-039)', () => {
  it.each([
    ['addition-no-view-section.md', OUTRO, 'storyboard-views'],
    ['addition-no-end-block.md', OUTRO, 'storyboard-end-block'],
    ['addition-missing-s4-row.md', OUTRO, 'storyboard-interactions'],
    ['addition-language-missing.md', GERMAN, 'storyboard-header'],
    ['addition-host-module-none.md', HOST, 'storyboard-header'],
  ] as const)(
    '%s → storyboard-mismatch with exactly its code, nothing written',
    async (file, scope, code) => {
      const root = scope === HOST ? demoCopy() : tourCopy();
      const project = await known(root, scope === HOST ? 'demo.eligian' : 'tour.eligian');
      const values =
        scope === OUTRO ? outroValues('Details') : scope === GERMAN ? GERMAN_VALUES : HOST_VALUES;
      await confirmedAddition(project, scope, values);
      fs.writeFileSync(path.join(root, 'STORYBOARD.md'), fixture(file));
      const before = snapshotFiles(root);
      const dialogs = project.server.elicitations().length;
      const reply = await brief(project, { action: 'approve-storyboard', scope });
      expect(reply.refused?.code).toBe('storyboard-mismatch');
      expect(reply.refused.problems.map((p: { code: string }) => p.code)).toEqual([code]);
      expect(reply.state).toBe('confirmed');
      expect(project.server.elicitations()).toHaveLength(dialogs);
      expect(snapshotFiles(root)).toEqual(before);
    },
    SLOW
  );
});

describe('accept-existing', () => {
  it(
    'refuses an addition (no dialog, record unchanged)',
    async () => {
      const root = tourCopy();
      const project = await known(root, 'tour.eligian');
      appendTimeline(path.join(root, 'tour.eligian'), 'Outro');
      const record = fs.readFileSync(path.join(root, RECORD));
      const reply = await brief(project, { action: 'accept-existing', paths: ['tour.eligian'] });
      expect(reply.refused.code).toBe('addition-not-briefed');
      expect(reply.refused.scope).toEqual(OUTRO);
      expect(reply.accepted).toBeUndefined();
      expect(project.server.elicitations()).toHaveLength(0);
      expect(fs.readFileSync(path.join(root, RECORD)).equals(record)).toBe(true);
    },
    SLOW
  );

  it(
    "takes the Logic → Logic 2 rename; the entry's timelines hold Logic 2, not Logic",
    async () => {
      const root = tourCopy();
      const project = await known(root, 'tour.eligian');
      edit(path.join(root, 'tour.eligian'), text =>
        text.replace('timeline "Logic" in', 'timeline "Logic 2" in')
      );
      const reply = await brief(project, { action: 'accept-existing', paths: ['tour.eligian'] });
      expect(reply.refused).toBeUndefined();
      expect(reply.accepted).toEqual(['tour.eligian']);
      const entry = entryOf(root, 'tour.eligian');
      expect(entry?.timelines).toContain('Logic 2');
      expect(entry?.timelines).not.toContain('Logic');
      expect(entry?.via).toBe('accepted');
    },
    SLOW
  );

  it(
    'renaming Logic to Outro, an approved addition of the directory, is accepted as a rename',
    async () => {
      const root = tourCopy();
      const project = await known(root, 'tour.eligian');
      await approvedAddition(project, OUTRO, outroValues('Details'), fixture(OUTRO_STORYBOARD));
      edit(path.join(root, 'tour.eligian'), text =>
        text.replace('timeline "Logic" in', 'timeline "Outro" in')
      );
      const reply = await brief(project, { action: 'accept-existing', paths: ['tour.eligian'] });
      expect(reply.refused).toBeUndefined();
      expect(reply.accepted).toEqual(['tour.eligian']);
      const entry = entryOf(root, 'tour.eligian');
      expect(entry?.timelines).toContain('Outro');
      expect(entry?.timelines).not.toContain('Logic');
    },
    SLOW
  );
});
