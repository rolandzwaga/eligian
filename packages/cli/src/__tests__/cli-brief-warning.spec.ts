/**
 * Spec 059 Phase 2, T036 (FR-053 to FR-055, SC-010, SC-006 (b) terminal half): the brief warning
 * line of `eligian check`, `compile`, `smoke`, `fmt` and `dev`, on the spawned `bin/cli.js`.
 *
 * Every run gets a fresh, empty `ELIGIAN_STATE_DIR`; the last case checks that none of them holds
 * anything afterwards (no `brief-key`, no `*.tmp`). The briefs (open, complete, changed, approved
 * with another key) come from the in-process server, never a hand-made signature.
 *
 * `compile -o -` writes a fresh `crypto.randomUUID()` per action, so every spawn preloads a
 * counter in its place (a `data:` module, `--import`): the two runs' stdout can then be compared
 * byte for byte.
 */
import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RECORD_FILE, type Via, writeRecordText } from '../mcp/brief/known-programs.js';
import { evaluateBriefFile, storyboardFor } from './brief-helpers.js';
import { loadPersona, runPersona, type Step } from './brief-persona-driver.js';
import { BIN, type InMemoryServer, startInMemoryServer } from './mcp-test-client.js';

const HERE = import.meta.dirname;
const BUILT = fs.existsSync(path.resolve(HERE, '..', '..', 'dist', 'cli.mjs'));
const PROGRAM = path.join(HERE, '__fixtures__', 'mcp', 'brief', 'gate', 'program');
const DOCS = path.join(HERE, '__fixtures__', 'mcp', 'docs-mini');
const PROGRAM_FILES = ['main.eligian', 'layout.html', 'styles.css'];
/** The fixture program's one timeline (the terse persona's S2 view). */
const TIMELINES = ['hours'];
const SLOW = 180_000;

const UUID_PRELOAD = `data:text/javascript,${encodeURIComponent(
  "let n=0;globalThis.crypto.randomUUID=()=>'00000000-0000-4000-8000-'+String(++n).padStart(12,'0');"
)}`;

const lineOf = (state: string): RegExp =>
  new RegExp(
    `^eligian: .* — BRIEF\\.md is ${state}; the open questions: eligian_brief \\{"action":"status","directory":".*"\\}$`
  );
const OPEN_LINE = lineOf('open');
const NONE_LINE = lineOf('none');
const ANY_LINE = /^eligian: .* — BRIEF\.md is \w+; the open questions: eligian_brief /m;

const temps: string[] = [];
/** Every `ELIGIAN_STATE_DIR` a spawned run got (FR-055: each must still be empty). */
const stateDirs: string[] = [];

const tempDir = (prefix: string): string => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  temps.push(dir);
  return dir;
};

const freshStateDir = (): string => {
  const dir = tempDir('eligian-warn-state-');
  stateDirs.push(dir);
  return dir;
};

afterAll(() => {
  for (const dir of temps.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** A temp project holding the gate fixture program (or `into`, created). */
function project(into?: string): string {
  const dir = into ?? tempDir('eligian-warn-');
  fs.mkdirSync(dir, { recursive: true });
  for (const name of PROGRAM_FILES) fs.copyFileSync(path.join(PROGRAM, name), path.join(dir, name));
  return dir;
}

const putRecord = (root: string, via?: Via): void => {
  const file = path.join(root, RECORD_FILE);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    writeRecordText(
      via === undefined
        ? []
        : [{ path: 'main.eligian', timelines: TIMELINES, languages: [], extensions: false, via }]
    )
  );
};

interface Run {
  readonly stdout: Buffer;
  readonly stderr: string;
  readonly status: number | null;
}

/** `bin/cli.js <args>` in `cwd` with a fresh empty state dir. */
function cli(args: readonly string[], cwd: string): Run {
  const result = spawnSync(process.execPath, ['--import', UUID_PRELOAD, BIN, ...args], {
    cwd,
    env: { ...process.env, ELIGIAN_STATE_DIR: freshStateDir() },
  });
  return { stdout: result.stdout, stderr: result.stderr.toString('utf8'), status: result.status };
}

const stderrLines = (stderr: string): string[] => stderr.split('\n').filter(line => line !== '');

/** `with` is `without` plus one first stderr line matching `line`; stdout and exit code equal. */
function expectOneMoreLine(without: Run, withIt: Run, line: RegExp): void {
  expect(withIt.stdout.equals(without.stdout)).toBe(true);
  expect(withIt.status).toBe(without.status);
  const added = stderrLines(withIt.stderr);
  expect(added.length).toBe(stderrLines(without.stderr).length + 1);
  expect(added[0]).toMatch(line);
  expect(withIt.stderr).toBe(`${added[0]}\n${without.stderr}`);
}

function expectIdentical(without: Run, withIt: Run): void {
  expect(withIt.stdout.equals(without.stdout)).toBe(true);
  expect(withIt.status).toBe(without.status);
  expect(withIt.stderr).toBe(without.stderr);
}

// ---------------------------------------------------------------------------------------------
// The briefs, written by the in-process server (state dir A) once for the file.

type BriefKind = 'open' | 'complete' | 'changed' | 'other-key';

interface Briefs {
  readonly text: Readonly<Record<BriefKind, string>>;
  /** The approved brief's `STORYBOARD.md` (copied beside the other-key brief). */
  readonly storyboard: string;
}

let briefs: Briefs | undefined;
const briefsOf = (): Briefs => {
  if (briefs === undefined) throw new Error('the briefs were not written (not built?)');
  return briefs;
};

async function writeBriefs(): Promise<Briefs> {
  const stateA = tempDir('eligian-warn-key-a-');
  const dir = tempDir('eligian-warn-brief-');
  for (const name of ['layout.html', 'styles.css']) {
    fs.copyFileSync(path.join(PROGRAM, name), path.join(dir, name));
  }
  const read = () => fs.readFileSync(path.join(dir, 'BRIEF.md'), 'utf8');
  const server: InMemoryServer = await startInMemoryServer({
    cwd: dir,
    docsRoot: DOCS,
    brief: { stateDir: stateA },
  });
  try {
    const call = async (args: Record<string, unknown>): Promise<any> => {
      const result = await server.callTool('eligian_brief', { directory: dir, ...args });
      if (result.isError) throw new Error(`eligian_brief: ${JSON.stringify(result.payload)}`);
      return result.payload;
    };
    const persona = loadPersona('terse');
    let open: string | undefined;
    const run = await runPersona(
      persona,
      async answers => (await call({ action: 'answer', answers })) as Step,
      async () => {
        const first = (await call({ action: 'status', idea: persona.idea })) as Step;
        open = read();
        return first;
      }
    );
    if (run.final.state !== 'complete' || open === undefined) throw new Error('not complete');
    const complete = read();
    await call({ action: 'confirm', confirmation: 'Yes, that is the brief.' });
    const changedStep = await call({
      action: 'answer',
      answers: [{ id: 'W1', value: 'Colours and spacing only.' }],
    });
    if (changedStep.state !== 'complete') throw new Error(`changed: ${changedStep.state}`);
    const changed = read();
    await call({ action: 'confirm', confirmation: 'Yes, that is the brief.' });
    const storyboard = storyboardFor(await evaluateBriefFile(dir, { stateDir: stateA }));
    fs.writeFileSync(path.join(dir, 'STORYBOARD.md'), storyboard);
    const approved = await call({
      action: 'approve-storyboard',
      confirmation: 'Yes, approve the storyboard.',
    });
    if (approved.state !== 'approved') throw new Error(`approve: ${approved.state}`);
    return {
      text: { open, complete, changed, 'other-key': read() },
      storyboard,
    };
  } finally {
    await server.close();
  }
}

/** `kind`'s `BRIEF.md` (and the approved one's `STORYBOARD.md`) into `dir`. */
function putBrief(dir: string, kind: BriefKind): void {
  const { text, storyboard } = briefsOf();
  fs.writeFileSync(path.join(dir, 'BRIEF.md'), text[kind]);
  if (kind === 'other-key') fs.writeFileSync(path.join(dir, 'STORYBOARD.md'), storyboard);
}

beforeAll(async () => {
  if (BUILT) briefs = await writeBriefs();
}, SLOW);

// ---------------------------------------------------------------------------------------------

const COMMANDS: readonly (readonly [string, readonly string[]])[] = [
  ['check --format json', ['check', 'main.eligian', '--format', 'json']],
  ['check --format github', ['check', 'main.eligian', '--format', 'github']],
  ['compile -o -', ['compile', 'main.eligian', '-o', '-']],
  ['smoke --format ndjson', ['smoke', 'main.eligian', '--format', 'ndjson']],
  ['fmt --check', ['fmt', '--check', 'main.eligian']],
];

describe.each(COMMANDS)('eligian %s (SC-010)', (_name, args) => {
  it.skipIf(!BUILT)(
    'stdout (Buffer.equals) and exit code identical with and without an open BRIEF.md; stderr has exactly one more line matching the open line',
    () => {
      const dir = project();
      const without = cli(args, dir);
      putBrief(dir, 'open');
      const withIt = cli(args, dir);
      expectOneMoreLine(without, withIt, OPEN_LINE);
      expect(fs.existsSync(path.join(dir, '.eligian'))).toBe(false);
    },
    SLOW
  );

  it.skipIf(!BUILT)(
    'a record without the program and no BRIEF.md: one more "is none" line',
    () => {
      const dir = project();
      const without = cli(args, dir);
      putRecord(dir);
      const withIt = cli(args, dir);
      expectOneMoreLine(without, withIt, NONE_LINE);
    },
    SLOW
  );

  it.skipIf(!BUILT)(
    'no record: no such line, and no .eligian/ is created',
    () => {
      const dir = project();
      const run = cli(args, dir);
      expect(run.stderr).not.toMatch(ANY_LINE);
      expect(fs.existsSync(path.join(dir, '.eligian'))).toBe(false);
    },
    SLOW
  );
});

describe('read failures (FR-055)', () => {
  it.skipIf(!BUILT).each(COMMANDS)(
    '%s: an unparsable .eligian/programs.json, and a BRIEF.md that is a directory: stdout, exit code and stderr byte-identical to the run without them',
    (_name, args) => {
      const dir = project();
      const without = cli(args, dir);
      const record = path.join(dir, RECORD_FILE);
      fs.mkdirSync(path.dirname(record), { recursive: true });
      fs.writeFileSync(record, 'not json');
      expectIdentical(without, cli(args, dir));
      fs.rmSync(path.join(dir, '.eligian'), { recursive: true, force: true });
      fs.mkdirSync(path.join(dir, 'BRIEF.md'));
      expectIdentical(without, cli(args, dir));
    },
    SLOW
  );
});

describe('existing work (FR-053, FR-012 rows 3 and 4)', () => {
  const VIAS: readonly Via[] = ['first-run', 'accepted', 'brief', 'addition', 'adopted'];
  const KINDS: readonly BriefKind[] = ['open', 'complete', 'changed', 'other-key'];
  const CASES = VIAS.flatMap(via => KINDS.map(kind => [via, kind] as const));

  /** One project per case under one root, each with its own record; one `check` over all. */
  let root = '';
  let run: Run | undefined;
  beforeAll(() => {
    if (!BUILT) return;
    root = tempDir('eligian-warn-known-');
    for (const [via, kind] of CASES) {
      const dir = project(path.join(root, `${via}-${kind}`));
      putRecord(dir, via);
      putBrief(dir, kind);
    }
    run = cli(['check', '.', '--format', 'json'], root);
  }, SLOW);

  it.skipIf(!BUILT).each(CASES)(
    'a governed program listed in the record via %s, with a %s brief: no line',
    (via, kind) => {
      expect(run).toBeDefined();
      const program = `${via}-${kind}/main.eligian`;
      const report = JSON.parse(run?.stdout.toString('utf8') ?? '') as {
        files: { file: string }[];
      };
      expect(report.files.map(f => f.file.split(path.sep).join('/'))).toContainEqual(
        expect.stringContaining(program)
      );
      expect(run?.stderr).not.toContain(`eligian: ${program} `);
      expect(run?.stderr).not.toMatch(ANY_LINE);
    }
  );

  it.skipIf(!BUILT)(
    'the same open brief with no record: one line',
    () => {
      const dir = project();
      putBrief(dir, 'open');
      const lines = stderrLines(cli(['check', 'main.eligian', '--format', 'json'], dir).stderr);
      expect(lines.filter(line => ANY_LINE.test(line))).toEqual([
        'eligian: main.eligian — BRIEF.md is open; the open questions: eligian_brief {"action":"status","directory":"."}',
      ]);
    },
    SLOW
  );

  it.skipIf(!BUILT)(
    'SC-006 (b) terminal half: a brief approved with state dir A, ELIGIAN_STATE_DIR = B, the program in the record via first-run → no line; no record → exactly one line with state complete',
    () => {
      const known = project();
      putBrief(known, 'other-key');
      putRecord(known, 'first-run');
      expect(cli(['check', 'main.eligian'], known).stderr).not.toMatch(ANY_LINE);

      const bare = project();
      putBrief(bare, 'other-key');
      const lines = stderrLines(cli(['check', 'main.eligian'], bare).stderr);
      expect(lines.filter(line => ANY_LINE.test(line))).toEqual([
        'eligian: main.eligian — BRIEF.md is complete; the open questions: eligian_brief {"action":"status","directory":"."}',
      ]);
    },
    SLOW
  );
});

describe('dev', () => {
  /** `eligian dev main.eligian --port 0`, killed after its first stdout line. */
  async function devRun(dir: string): Promise<{ stdout: string; stderr: string }> {
    const child: ChildProcess = spawn(
      process.execPath,
      [BIN, 'dev', 'main.eligian', '--port', '0'],
      {
        cwd: dir,
        env: { ...process.env, ELIGIAN_STATE_DIR: freshStateDir() },
      }
    );
    let stdout = '';
    let stderr = '';
    child.stderr?.on('data', chunk => {
      stderr += chunk.toString();
    });
    const closed = new Promise<void>(resolve => child.on('close', () => resolve()));
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`no stdout line; stderr: ${stderr}`)),
        60_000
      );
      child.stdout?.on('data', chunk => {
        stdout += chunk.toString();
        if (stdout.includes('\n')) {
          clearTimeout(timer);
          resolve();
        }
      });
      child.on('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
    child.kill();
    await closed;
    return { stdout, stderr };
  }

  let run: { stdout: string; stderr: string } | undefined;
  let dir = '';
  beforeAll(async () => {
    if (!BUILT) return;
    dir = project();
    putBrief(dir, 'open');
    run = await devRun(dir);
  }, SLOW);

  it.skipIf(!BUILT)('the line is the first stderr line, printed once', () => {
    expect(run?.stdout ?? '').not.toBe('');
    const lines = stderrLines(run?.stderr ?? '');
    expect(lines[0]).toMatch(OPEN_LINE);
    expect(lines.filter(line => ANY_LINE.test(line))).toHaveLength(1);
  });

  it.skipIf(!BUILT)('no .eligian/programs.json after the run', () => {
    expect(fs.existsSync(path.join(dir, RECORD_FILE))).toBe(false);
  });
});

describe('no key (FR-055)', () => {
  it.skipIf(!BUILT)(
    'after every run above the state dir is still empty (no brief-key, no *.tmp)',
    () => {
      expect(stateDirs.length).toBeGreaterThan(0);
      for (const dir of stateDirs) expect(fs.readdirSync(dir)).toEqual([]);
    }
  );
});
