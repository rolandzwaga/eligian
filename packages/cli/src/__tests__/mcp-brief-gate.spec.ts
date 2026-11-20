/**
 * Spec 059 Phase 2 (FR-010, FR-013, FR-014, FR-061, P16; SC-001 server half, SC-013 stand-in,
 * SC-023; T026): the gate in the five generation tools, through the in-memory server.
 *
 * Every project is a temp copy of `__fixtures__/mcp/brief/gate/program/` with the row's
 * `programs.json` as its record (written before the server starts, so the start-time scan never
 * writes). The briefs are made through `eligian_brief` on the server (the terse persona, its
 * sign-offs answered by the client's dialog): no signed line is written by hand. A row's record is
 * put back after its brief is built, so the approval's own record write does not change the row.
 *
 * The lock counts `onQueued` (`compilerLockLayer`) and the smoke stub reports `onSpawn`, so a
 * refused call is shown to take no lock and spawn nothing (FR-014).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { compilerLockLayer } from '../mcp/compiler-lock.js';
import {
  approvedBrief,
  evaluateBriefFile,
  type FileSnapshot,
  snapshotFiles,
  storyboardFor,
} from './brief-helpers.js';
import { loadPersona, runPersona, type Step } from './brief-persona-driver.js';
import {
  type ElicitAnswer,
  type ElicitRequest,
  type InMemoryServer,
  startInMemoryServer,
  type ToolCallResult,
} from './mcp-test-client.js';

const HERE = import.meta.dirname;
const GATE = path.join(HERE, '__fixtures__', 'mcp', 'brief', 'gate');
const PROGRAM = path.join(GATE, 'program');
const DOCS = path.join(HERE, '__fixtures__', 'mcp', 'docs-mini');
const STUB = path.join(HERE, '__fixtures__', 'mcp', 'smoke-tool', 'stub-cli.mjs');

/** Building a brief through the persona takes a few seconds per row. */
const SLOW = 120_000;

type Row = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
const ROWS: readonly Row[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/** How far the row's brief is taken through `eligian_brief` (FR-012). */
type Stage = 'none' | 'open' | 'complete' | 'confirmed' | 'changed' | 'approved';

const STAGE: Readonly<Record<Row, Stage>> = {
  1: 'none',
  2: 'none',
  3: 'open',
  4: 'open',
  5: 'open',
  6: 'changed',
  7: 'complete',
  8: 'confirmed',
  9: 'approved',
};

/** The row's verdict for `main.eligian` (FR-012): `runs` or the refusal code. */
const VERDICT: Readonly<Record<Row, string>> = {
  1: 'runs',
  2: 'brief-required',
  3: 'runs',
  4: 'runs',
  5: 'brief-incomplete',
  6: 'brief-changed',
  7: 'brief-not-confirmed',
  8: 'storyboard-not-approved',
  9: 'runs',
};

type GatedTool =
  | 'eligian_check'
  | 'eligian_fmt'
  | 'eligian_compile'
  | 'eligian_smoke'
  | 'eligian_init';

/** Each tool's arguments on `main.eligian`; `eligian_init` last (it writes the starter). */
const TOOLS: readonly (readonly [GatedTool, Readonly<Record<string, unknown>>])[] = [
  ['eligian_check', { paths: ['main.eligian'] }],
  ['eligian_fmt', { paths: ['main.eligian'] }],
  ['eligian_compile', { path: 'main.eligian' }],
  ['eligian_smoke', { paths: ['main.eligian'] }],
  ['eligian_init', { directory: '.', template: 'blank', title: 'Tea', force: true, agents: false }],
];

const temps: string[] = [];
const servers: InMemoryServer[] = [];
let stateDir: string;

const tempDir = (prefix: string): string => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  temps.push(dir);
  return dir;
};

beforeAll(() => {
  stateDir = tempDir('eligian-gate-state-');
});

afterAll(async () => {
  for (const server of servers.splice(0)) await server.close();
  for (const dir of temps.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const RECORD = path.join('.eligian', 'programs.json');

/** `programs` as the record of `root`, with the `.gitignore` the server would write. */
function putRecord(root: string, text: string): void {
  fs.mkdirSync(path.join(root, '.eligian'), { recursive: true });
  fs.writeFileSync(path.join(root, '.eligian', '.gitignore'), '*\n');
  fs.writeFileSync(path.join(root, RECORD), text);
}

const EMPTY_RECORD = `${JSON.stringify({ version: 1, programs: [] }, null, 2)}\n`;

const readRecord = (root: string): { readonly programs: readonly Record<string, unknown>[] } =>
  JSON.parse(fs.readFileSync(path.join(root, RECORD), 'utf8'));

/** The client's dialog accepts: its one boolean field (`confirmed`, `approved`) is `true`. */
const accept = (request: ElicitRequest): ElicitAnswer => {
  const schema = request.requestedSchema as { readonly properties: Record<string, unknown> };
  const [field] = Object.keys(schema.properties);
  return { action: 'accept', content: { [field]: true } };
};

interface Project {
  readonly root: string;
  readonly server: InMemoryServer;
  /** Sections queued on this server's compiler lock so far. */
  readonly queued: () => number;
  /** `eligian smoke` children spawned by this server so far. */
  readonly spawns: () => number;
}

/** A server on `root` with the counting lock, the smoke stub and the accepting dialog. */
async function serve(root: string): Promise<Project> {
  let queued = 0;
  let spawns = 0;
  const server = await startInMemoryServer(
    {
      cwd: root,
      docsRoot: DOCS,
      brief: { stateDir },
      lock: compilerLockLayer({ onQueued: () => queued++ }),
      smoke: { cliPath: STUB, onSpawn: () => spawns++ },
    },
    { elicitation: true, onElicit: accept }
  );
  servers.push(server);
  return { root, server, queued: () => queued, spawns: () => spawns };
}

/** `eligian_brief` on `dir`; a tool failure throws. */
async function brief(
  project: Project,
  args: Readonly<Record<string, unknown>>,
  dir: string = project.root
): Promise<any> {
  const result = await project.server.callTool('eligian_brief', { directory: dir, ...args });
  if (result.isError) throw new Error(`eligian_brief failed: ${JSON.stringify(result.payload)}`);
  return result.payload;
}

const persona = loadPersona('terse');

/** Takes the brief of `dir` to `stage` through the tool (the terse persona). */
async function briefTo(project: Project, stage: Stage, dir: string = project.root): Promise<void> {
  if (stage === 'none') return;
  if (stage === 'approved') {
    await approvedBrief(project.server, dir, { stateDir, root: project.root });
    return;
  }
  const status = () =>
    brief(project, { action: 'status', idea: persona.idea }, dir) as Promise<Step>;
  if (stage === 'open') {
    expect((await status()).state).toBe('open');
    return;
  }
  const run = await runPersona(
    persona,
    async answers => (await brief(project, { action: 'answer', answers }, dir)) as Step,
    status
  );
  expect(run.final.state).toBe('complete');
  if (stage === 'complete') return;
  const confirmed = await brief(project, { action: 'confirm' }, dir);
  expect(confirmed.state).toBe('confirmed');
  if (stage === 'confirmed') return;
  // FR-026: an answer changed through the tool after the confirmation.
  await brief(
    project,
    { action: 'answer', answers: [{ id: 'W1', value: 'Colours and spacing only.' }] },
    dir
  );
}

/** A temp copy of the fixture program with `record` as its record, served. */
async function programProject(record: string): Promise<Project> {
  const root = tempDir('eligian-gate-project-');
  fs.cpSync(PROGRAM, root, { recursive: true });
  putRecord(root, record);
  return serve(root);
}

/** The project of `row`: its record, its brief built through the tool, the record put back. */
async function buildRow(row: Row): Promise<Project> {
  const record = fs.readFileSync(path.join(GATE, `row-${row}`, 'programs.json'), 'utf8');
  const project = await programProject(record);
  await briefTo(project, STAGE[row]);
  putRecord(project.root, record);
  return project;
}

/** Built once per row for the cases that only read (and the init cases, which run last). */
const rowProjects = new Map<Row, Promise<Project>>();
const rowProject = (row: Row): Promise<Project> => {
  let project = rowProjects.get(row);
  if (project === undefined) {
    project = buildRow(row);
    rowProjects.set(row, project);
  }
  return project;
};

/** Every file under `root` except the record store's transient `.tmp` files (a running scan). */
const filesOf = (root: string): Readonly<Record<string, FileSnapshot>> =>
  Object.fromEntries(
    Object.entries(snapshotFiles(root)).filter(([name]) => !name.endsWith('.tmp'))
  );

interface Observed {
  readonly result: ToolCallResult;
  readonly queued: number;
  readonly spawns: number;
  readonly before: Readonly<Record<string, FileSnapshot>>;
  readonly after: Readonly<Record<string, FileSnapshot>>;
}

/** One tool call, with the lock and spawn counts it caused and the files around it. */
async function observe(
  project: Project,
  tool: string,
  args: Readonly<Record<string, unknown>>
): Promise<Observed> {
  const before = filesOf(project.root);
  const queued = project.queued();
  const spawns = project.spawns();
  const result = await project.server.callTool(tool, args);
  return {
    result,
    queued: project.queued() - queued,
    spawns: project.spawns() - spawns,
    before,
    after: filesOf(project.root),
  };
}

/**
 * The FR-017 refusal of `program` (absolute) in `dir` with `code`: nothing written, no lock, no
 * spawn, the round and state of `eligian_brief` `status` on `dir`. Returns the gate payload.
 */
async function expectRefusal(
  project: Project,
  observed: Observed,
  code: string,
  program: string,
  options: { readonly dir?: string; readonly state?: 'none' } = {}
): Promise<any> {
  const dir = options.dir ?? path.dirname(program);
  expect(observed.result.isError).toBe(true);
  const { error } = observed.result.payload;
  expect(error.kind).toBe('gate');
  const { gate } = error;
  expect(gate.code).toBe(code);
  expect(path.isAbsolute(gate.program)).toBe(true);
  expect(gate.program).toBe(program);
  expect(gate.brief).toBe(path.join(dir, 'BRIEF.md'));
  expect(gate.directory).toBe(dir);
  expect(gate.refused).toEqual([{ program, code }]);
  expect(observed.after).toEqual(observed.before);
  expect(observed.queued).toBe(0);
  expect(observed.spawns).toBe(0);
  // FR-015: the round equals the interview's own next round. An addition's round is its scoped
  // tree's (`status` with a scope comes with T033; brief-gate.spec.ts checks that round).
  const status = await brief(project, { action: 'status' }, dir);
  if (gate.scope === undefined) {
    expect(gate.round).toEqual(status.round);
  } else {
    expect(gate.round.length).toBeGreaterThan(0);
    expect(gate.round.map((item: { id: string }) => item.id)).not.toContain('P1');
  }
  expect(gate.state).toBe(options.state ?? status.state);
  return gate;
}

const LIBRARY =
  'library helpers\n\naction glow(selector: string) [\n  selectElement(selector)\n  addClass("lit")\n]\n';

const timeline = (name: string): string =>
  `\ntimeline "${name}" in "#stage" using raf {\n  at 0s..1s [\n    selectElement("#title")\n    addClass("lit")\n  ] [\n    selectElement("#title")\n    removeClass("lit")\n  ]\n}\n`;

// ---------------------------------------------------------------------------------------------

describe('never gated', () => {
  it.each(ROWS)(
    'eligian_docs, eligian_operations, eligian_project succeed in row %i',
    async row => {
      const project = await rowProject(row);
      for (const [tool, args] of [
        ['eligian_docs', {}],
        ['eligian_operations', { names: ['addClass'] }],
        ['eligian_project', { path: 'main.eligian' }],
      ] as const) {
        const result = await project.server.callTool(tool, args);
        expect(result.isError, `${tool}: ${JSON.stringify(result.payload)}`).toBe(false);
      }
    },
    SLOW
  );
});

describe('the gate runs first', () => {
  it(
    'a refused call leaves queued at 0 and onSpawn uncalled',
    async () => {
      const project = await programProject(EMPTY_RECORD);
      const program = path.join(project.root, 'main.eligian');
      for (const [tool, args] of TOOLS) {
        const observed = await observe(project, tool, args);
        await expectRefusal(project, observed, 'brief-required', program, { state: 'none' });
      }
      expect(project.queued()).toBe(0);
      expect(project.spawns()).toBe(0);
    },
    SLOW
  );

  it(
    'a runs row of eligian_check / eligian_compile raises queued and of eligian_smoke calls onSpawn',
    async () => {
      const project = await buildRow(1);
      const check = await observe(project, 'eligian_check', { paths: ['main.eligian'] });
      expect(check.result.isError).toBe(false);
      expect(check.queued).toBeGreaterThan(0);
      const compile = await observe(project, 'eligian_compile', { path: 'main.eligian' });
      expect(compile.result.isError).toBe(false);
      expect(compile.queued).toBeGreaterThan(0);
      const smoke = await observe(project, 'eligian_smoke', { paths: ['main.eligian'] });
      expect(smoke.result.isError).toBe(false);
      expect(smoke.spawns).toBe(1);
    },
    SLOW
  );
});

describe('globs', () => {
  it(
    'a library alone is never refused',
    async () => {
      const project = await programProject(EMPTY_RECORD);
      fs.writeFileSync(path.join(project.root, 'lib.eligian'), LIBRARY);
      for (const [tool, args] of [
        ['eligian_check', { paths: ['lib.eligian'] }],
        ['eligian_fmt', { paths: ['lib.eligian'] }],
        ['eligian_compile', { path: 'lib.eligian' }],
      ] as const) {
        const result = await project.server.callTool(tool, args);
        expect(result.isError, `${tool}: ${JSON.stringify(result.payload)}`).toBe(false);
      }
    },
    SLOW
  );

  it(
    'a glob over a refused and a known program fails listing only the refused one',
    async () => {
      const record = fs.readFileSync(path.join(GATE, 'row-1', 'programs.json'), 'utf8');
      const project = await programProject(record);
      const extra = path.join(project.root, 'extra.eligian');
      fs.writeFileSync(
        extra,
        `layout "./layout.html"\nstyles "./styles.css"\n${timeline('extra')}`
      );
      for (const tool of ['eligian_check', 'eligian_fmt', 'eligian_smoke'] as const) {
        const observed = await observe(project, tool, { paths: ['*.eligian'] });
        const gate = await expectRefusal(project, observed, 'brief-required', extra, {
          state: 'none',
        });
        expect(gate.refused).toEqual([{ program: extra, code: 'brief-required' }]);
      }
    },
    SLOW
  );
});

describe('eligian_init', () => {
  it.each(['blank', 'chapters', 'video', 'library'])(
    '%s into an empty dir: brief-required, nothing written, no lock',
    async template => {
      const root = tempDir('eligian-gate-init-');
      putRecord(root, EMPTY_RECORD);
      fs.mkdirSync(path.join(root, 'deck'));
      const project = await serve(root);
      const observed = await observe(project, 'eligian_init', {
        directory: 'deck',
        template,
        agents: false,
      });
      await expectRefusal(
        project,
        observed,
        'brief-required',
        path.join(root, 'deck', 'main.eligian'),
        { state: 'none' }
      );
      expect(fs.readdirSync(path.join(root, 'deck'))).toEqual([]);
    },
    SLOW
  );

  it(
    'library with an approved brief runs',
    async () => {
      const root = tempDir('eligian-gate-init-');
      putRecord(root, EMPTY_RECORD);
      const project = await serve(root);
      await briefTo(project, 'approved');
      const result = await project.server.callTool('eligian_init', {
        directory: '.',
        template: 'library',
        title: 'Tea',
        agents: false,
      });
      expect(result.isError, JSON.stringify(result.payload)).toBe(false);
      expect(result.payload.written).toContain('main.eligian');
      expect(fs.existsSync(path.join(root, 'main.eligian'))).toBe(true);
    },
    SLOW
  );
});

describe('under an approved brief (SC-023)', () => {
  /** The starter's own names (`starters.ts`: the `languages` block is en-US and nl-NL). */
  const STARTER_TIMELINES: Readonly<Record<string, readonly string[]>> = {
    blank: ['Tea'],
    chapters: ['Hub', 'Chapter 1', 'Chapter 2'],
    video: ['Tea'],
    library: ['Tea'],
  };

  /** An approved terse brief (S2 `hours`, L1 `en-US`, H1 none) in an empty project. */
  async function approvedProject(): Promise<Project> {
    const root = tempDir('eligian-gate-approved-');
    putRecord(root, EMPTY_RECORD);
    const project = await serve(root);
    await briefTo(project, 'approved');
    return project;
  }

  const entryOf = (root: string, file: string) =>
    readRecord(root).programs.find(entry => entry.path === file);

  it.each(['blank', 'chapters', 'video', 'library'])(
    '%s records main.eligian via brief with S2 ∪ starter timelines and L1 ∪ starter languages (nl-NL of starters.ts:152–155), extensions per FR-061',
    async template => {
      const project = await approvedProject();
      const result = await project.server.callTool('eligian_init', {
        directory: '.',
        template,
        title: 'Tea',
        agents: false,
      });
      expect(result.isError, JSON.stringify(result.payload)).toBe(false);
      expect(entryOf(project.root, 'main.eligian')).toEqual({
        path: 'main.eligian',
        timelines: ['hours', ...STARTER_TIMELINES[template]],
        languages: ['en-US', 'nl-NL'],
        extensions: false,
        via: 'brief',
      });
    },
    SLOW
  );

  it(
    'the next check runs; an appended timeline in neither S2 nor the starter text is addition-not-briefed',
    async () => {
      const project = await approvedProject();
      const init = await project.server.callTool('eligian_init', {
        directory: '.',
        template: 'chapters',
        title: 'Tea',
        agents: false,
      });
      expect(init.isError, JSON.stringify(init.payload)).toBe(false);
      const check = await project.server.callTool('eligian_check', { paths: ['main.eligian'] });
      expect(check.isError, JSON.stringify(check.payload)).toBe(false);

      const main = path.join(project.root, 'main.eligian');
      fs.appendFileSync(main, timeline('Outro'));
      const observed = await observe(project, 'eligian_check', { paths: ['main.eligian'] });
      const gate = await expectRefusal(project, observed, 'addition-not-briefed', main);
      expect(gate.scope).toEqual({ addition: 'view', name: 'Outro' });
      expect(gate.additions).toEqual([{ addition: 'view', name: 'Outro' }]);
    },
    SLOW
  );

  it(
    'a refused init leaves the record unchanged',
    async () => {
      const root = tempDir('eligian-gate-approved-');
      putRecord(root, EMPTY_RECORD);
      const project = await serve(root);
      await briefTo(project, 'confirmed');
      const record = fs.readFileSync(path.join(root, RECORD), 'utf8');
      const observed = await observe(project, 'eligian_init', {
        directory: '.',
        template: 'blank',
        agents: false,
      });
      await expectRefusal(
        project,
        observed,
        'storyboard-not-approved',
        path.join(root, 'main.eligian')
      );
      expect(fs.readFileSync(path.join(root, RECORD), 'utf8')).toBe(record);
    },
    SLOW
  );
});

describe('row 4 whatever the brief state', () => {
  it(
    'a known first-run and a known accepted program governed by an open, a complete, a confirmed, a changed and a hand-edited brief each run; a main brief started with status and an idea beside it does not refuse it; an appended timeline is addition-not-briefed',
    async () => {
      const root = tempDir('eligian-gate-row4-');
      const source = fs.readFileSync(path.join(PROGRAM, 'main.eligian'), 'utf8');
      for (const name of ['layout.html', 'styles.css']) {
        fs.copyFileSync(path.join(PROGRAM, name), path.join(root, name));
      }
      fs.writeFileSync(path.join(root, 'a.eligian'), source);
      fs.writeFileSync(path.join(root, 'b.eligian'), source);
      const entry = (file: string, via: string) => ({
        path: file,
        timelines: ['hours'],
        languages: [],
        extensions: false,
        via,
        ...(via === 'accepted' ? { mode: 'elicitation' } : {}),
      });
      putRecord(
        root,
        `${JSON.stringify(
          {
            version: 1,
            programs: [entry('a.eligian', 'first-run'), entry('b.eligian', 'accepted')],
          },
          null,
          2
        )}\n`
      );
      const project = await serve(root);
      const runs = async (stage: string) => {
        for (const file of ['a.eligian', 'b.eligian']) {
          const result = await project.server.callTool('eligian_check', { paths: [file] });
          expect(result.isError, `${stage} ${file}: ${JSON.stringify(result.payload)}`).toBe(false);
        }
      };
      const stateOf = async () => (await brief(project, { action: 'status' })).state;

      // A main brief started beside the existing work (status with an idea): open.
      await briefTo(project, 'open');
      expect(await stateOf()).toBe('open');
      await runs('open');

      await runPersona(
        persona,
        async answers => (await brief(project, { action: 'answer', answers })) as Step,
        async () => (await brief(project, { action: 'status' })) as Step
      );
      expect(await stateOf()).toBe('complete');
      await runs('complete');

      await brief(project, { action: 'confirm' });
      expect(await stateOf()).toBe('confirmed');
      await runs('confirmed');

      const changed = await brief(project, {
        action: 'answer',
        answers: [{ id: 'W1', value: 'Colours and spacing only.' }],
      });
      expect(changed.state).toBe('complete');
      await runs('changed');

      await brief(project, { action: 'confirm' });
      expect(await stateOf()).toBe('confirmed');
      const briefFile = path.join(root, 'BRIEF.md');
      const text = fs.readFileSync(briefFile, 'utf8');
      // A hand edit of a signed answer: the confirmation no longer verifies.
      expect(text).toContain('Viewers know when support is open.');
      fs.writeFileSync(
        briefFile,
        text.replace('Viewers know when support is open.', 'Viewers know the hours.')
      );
      expect(await stateOf()).not.toBe('confirmed');
      await runs('hand-edited');

      const a = path.join(root, 'a.eligian');
      fs.appendFileSync(a, timeline('Outro'));
      const observed = await observe(project, 'eligian_check', { paths: ['a.eligian'] });
      expect(observed.result.isError).toBe(true);
      expect(observed.result.payload.error.gate.code).toBe('addition-not-briefed');
      expect(observed.result.payload.error.gate.program).toBe(a);
    },
    SLOW
  );
});

describe('new presentation end to end (SC-013 stand-in)', () => {
  it(
    'brief-required → brief-incomplete → (confirm, elicitation) storyboard-not-approved → (approve-storyboard, elicitation) runs',
    async () => {
      const root = tempDir('eligian-gate-new-');
      putRecord(root, EMPTY_RECORD);
      const project = await serve(root);
      const main = path.join(root, 'main.eligian');
      fs.cpSync(PROGRAM, root, { recursive: true });
      const check = () => observe(project, 'eligian_check', { paths: ['main.eligian'] });

      await expectRefusal(project, await check(), 'brief-required', main, { state: 'none' });

      await briefTo(project, 'open');
      await expectRefusal(project, await check(), 'brief-incomplete', main);

      await runPersona(
        persona,
        async answers => (await brief(project, { action: 'answer', answers })) as Step,
        async () => (await brief(project, { action: 'status' })) as Step
      );
      await expectRefusal(project, await check(), 'brief-not-confirmed', main);

      const confirmed = await brief(project, { action: 'confirm' });
      expect(confirmed.state).toBe('confirmed');
      expect(confirmed.signoff).toEqual({ mode: 'elicitation' });
      await expectRefusal(project, await check(), 'storyboard-not-approved', main);

      fs.writeFileSync(
        path.join(root, 'STORYBOARD.md'),
        storyboardFor(await evaluateBriefFile(root, { stateDir }))
      );
      const approved = await brief(project, { action: 'approve-storyboard' });
      expect(approved.state).toBe('approved');
      expect(approved.signoff).toEqual({ mode: 'elicitation' });
      const runs = await check();
      expect(runs.result.isError, JSON.stringify(runs.result.payload)).toBe(false);
      expect(runs.queued).toBeGreaterThan(0);
    },
    SLOW
  );
});

describe('per row', () => {
  const cases = TOOLS.flatMap(([tool, args]) =>
    ROWS.map(row => ({ tool, args, row, verdict: VERDICT[row] }))
  );

  it.each(cases)(
    '$tool on row $row → $verdict',
    async ({ tool, args, row, verdict }) => {
      const project = await rowProject(row);
      const program = path.join(project.root, 'main.eligian');
      const observed = await observe(project, tool, args);
      if (verdict !== 'runs') {
        const gate = await expectRefusal(project, observed, verdict, program, {
          ...(row === 2 ? { state: 'none' as const } : {}),
        });
        if (row === 2) {
          expect(gate.next).toContain('action: accept-existing');
          expect(gate.next).toContain('action: status');
        }
        if (row === 6) expect(gate.changed.map((c: { id: string }) => c.id)).toEqual(['W1']);
        return;
      }
      expect(observed.result.isError, JSON.stringify(observed.result.payload)).toBe(false);
      expect(typeof observed.result.payload.header).toBe('string');
      if (tool === 'eligian_check' || tool === 'eligian_compile') {
        expect(observed.queued).toBeGreaterThan(0);
      }
      if (tool === 'eligian_smoke') expect(observed.spawns).toBe(1);
      if (tool === 'eligian_init')
        expect(observed.result.payload.written).toContain('main.eligian');
    },
    SLOW
  );
});
