/**
 * Spec 059 Phase 2 (FR-009, FR-037, FR-041, FR-047, FR-051, P20; SC-021; T035): every refusal
 * code of `eligian_brief` through the in-memory server, one case per code.
 *
 * Each case serves a temp project, lets the server's start-time scan settle (a plain `status`
 * on the root, which writes nothing), builds what the case needs through the server, then takes a
 * snapshot of every file of the project (`.eligian/` included) and asserts that the refused call
 * left each one byte-identical, with its mtime. The client announces elicitation and accepts every
 * dialog, so the two `accept-existing` cases that write are signed by the dialog.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { approvedBrief, snapshotFiles } from './brief-helpers.js';
import {
  type ElicitAnswer,
  type ElicitRequest,
  type InMemoryServer,
  startInMemoryServer,
} from './mcp-test-client.js';

const HERE = import.meta.dirname;
const EXAMPLES = path.resolve(HERE, '..', '..', '..', '..', 'examples');
const TOUR = path.join(EXAMPLES, 'eligian-tour');
const DOCS = path.join(HERE, '__fixtures__', 'mcp', 'docs-mini');
const PROGRAM = path.join(HERE, '__fixtures__', 'mcp', 'brief', 'gate', 'program');

/** A briefed project and a tour copy take a few seconds each. */
const SLOW = 120_000;

const RECORD = path.join('.eligian', 'programs.json');
const EMPTY_RECORD = `${JSON.stringify({ version: 1, programs: [] }, null, 2)}\n`;
const IDEA = 'A short presentation of the opening hours of the shop.';

const temps: string[] = [];
const servers: InMemoryServer[] = [];
let stateDir: string;

const tempDir = (prefix: string): string => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  temps.push(dir);
  return dir;
};

beforeAll(() => {
  stateDir = tempDir('eligian-refusals-state-');
});

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

/**
 * A server on `root` (its cwd) whose start-time scan has settled: every `eligian_brief` call waits
 * for the root's record (FR-003, FR-005), and a `status` with no idea writes no `BRIEF.md`.
 */
async function serve(root: string): Promise<Project> {
  const server = await startInMemoryServer(
    { cwd: root, docsRoot: DOCS, brief: { stateDir } },
    { elicitation: true, onElicit: accept }
  );
  servers.push(server);
  const project = { root, server };
  await brief(project, { action: 'status' });
  expect(fs.existsSync(path.join(root, RECORD))).toBe(true);
  return project;
}

/** `files` (relative path → text) in a fresh temp project. */
function projectWith(prefix: string, files: Readonly<Record<string, string>>): string {
  const root = tempDir(prefix);
  for (const [name, text] of Object.entries(files)) {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  }
  return root;
}

/** A copy of the gate's fixture program (`main.eligian`, timeline `hours`, layout, styles). */
function programCopy(prefix: string): string {
  const root = tempDir(prefix);
  fs.cpSync(PROGRAM, root, { recursive: true });
  return root;
}

const MAIN_TEXT = (): string => fs.readFileSync(path.join(PROGRAM, 'main.eligian'), 'utf8');

/** `programs` as the record of `root`, with the `.gitignore` the server would write. */
function putRecord(root: string, text: string): void {
  fs.mkdirSync(path.join(root, '.eligian'), { recursive: true });
  fs.writeFileSync(path.join(root, '.eligian', '.gitignore'), '*\n');
  fs.writeFileSync(path.join(root, RECORD), text);
}

interface Entry {
  readonly path: string;
  readonly timelines: readonly string[];
  readonly via: string;
}

const recordOf = (root: string): readonly Entry[] =>
  JSON.parse(fs.readFileSync(path.join(root, RECORD), 'utf8')).programs;

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

/** `call` refused with `code`; every file of the project is byte-identical afterwards. */
async function expectRefused(
  project: Project,
  code: string,
  call: () => Promise<any>
): Promise<any> {
  const before = snapshotFiles(project.root);
  const dialogs = project.server.elicitations().length;
  const reply = await call();
  expect(reply.refused?.code).toBe(code);
  expect(project.server.elicitations()).toHaveLength(dialogs);
  expect(snapshotFiles(project.root)).toEqual(before);
  return reply;
}

const LIBRARY = [
  'library helpers',
  '',
  'action lightUp(selector: string) [',
  '  selectElement(selector)',
  '  addClass("lit")',
  ']',
  '',
].join('\n');

// ---------------------------------------------------------------------------------------------

describe('governed-by-brief', () => {
  it(
    'accept-existing on a program beside a BRIEF.md holding a main brief',
    async () => {
      const root = programCopy('eligian-refusals-governed-');
      putRecord(root, EMPTY_RECORD);
      const project = await serve(root);
      const started = await brief(project, { action: 'status', idea: IDEA });
      expect(started.state).toBe('open');
      const reply = await expectRefused(project, 'governed-by-brief', () =>
        brief(project, { action: 'accept-existing', paths: ['main.eligian'] })
      );
      expect(reply.accepted).toBeUndefined();
    },
    SLOW
  );
});

describe('addition-not-briefed', () => {
  it(
    'accept-existing on a known program with an appended timeline, with scope and round',
    async () => {
      const root = tempDir('eligian-refusals-tour-');
      fs.cpSync(TOUR, root, { recursive: true });
      const project = await serve(root);
      expect(recordOf(root).some(entry => entry.path === 'tour.eligian')).toBe(true);
      fs.appendFileSync(path.join(root, 'tour.eligian'), timelineText('Outro'));
      const reply = await expectRefused(project, 'addition-not-briefed', () =>
        brief(project, { action: 'accept-existing', paths: ['tour.eligian'] })
      );
      const scope = { addition: 'view', name: 'Outro' };
      expect(reply.refused.scope).toEqual(scope);
      expect(reply.refused.round.length).toBeGreaterThan(0);
      expect(reply.accepted).toBeUndefined();
      // The round is the first round of that addition's interview (a status with the scope).
      const interview = await brief(project, { action: 'status', scope });
      expect(interview.scope).toEqual(scope);
      expect(reply.refused.round).toEqual(interview.round);
    },
    SLOW
  );
});

describe('not-an-addition', () => {
  it(
    'an addition scope naming an S2 view',
    async () => {
      const root = programCopy('eligian-refusals-s2-');
      putRecord(root, EMPTY_RECORD);
      const project = await serve(root);
      await approvedBrief(project.server, root, { stateDir, root });
      const reply = await expectRefused(project, 'not-an-addition', () =>
        brief(project, { action: 'status', scope: { addition: 'view', name: 'hours' } })
      );
      expect(reply.next).toContain('"hours"');
      expect(reply.scope).toBeUndefined();
    },
    SLOW
  );

  it.each([
    [{ addition: 'view', name: 'a:b' }, '1 to 64 characters'],
    [{ addition: 'view', name: ' Outro' }, 'leading or trailing space'],
    [{ addition: 'view', name: 'x'.repeat(65) }, '1 to 64 characters'],
    [{ addition: 'language', name: 'german' }, 'language code'],
  ] as const)(
    'P20: %o → not-an-addition, the message names the rule, no section created',
    async (scope, rule) => {
      const root = programCopy('eligian-refusals-p20-');
      const project = await serve(root);
      const reply = await expectRefused(project, 'not-an-addition', () =>
        brief(project, { action: 'status', scope })
      );
      expect(reply.next).toContain(rule);
      expect(reply.next).toContain(JSON.stringify(scope.name));
      expect(fs.existsSync(path.join(root, 'BRIEF.md'))).toBe(false);
    },
    SLOW
  );
});

describe('brief-not-approved', () => {
  it(
    'an addition-scope status beside an open main brief of a new presentation',
    async () => {
      const root = projectWith('eligian-refusals-open-', {});
      const project = await serve(root);
      await brief(project, { action: 'status', idea: IDEA });
      const reply = await expectRefused(project, 'brief-not-approved', () =>
        brief(project, { action: 'status', scope: { addition: 'view', name: 'Outro' } })
      );
      expect(reply.state).toBe('open');
      expect(fs.readFileSync(path.join(root, 'BRIEF.md'), 'utf8')).not.toContain('## Addition:');
    },
    SLOW
  );
});

describe('adopt-program', () => {
  it(
    'an empty directory',
    async () => {
      const root = projectWith('eligian-refusals-adopt-empty-', {});
      fs.mkdirSync(path.join(root, 'empty'));
      const project = await serve(root);
      const reply = await expectRefused(project, 'adopt-program', () =>
        brief(project, { action: 'status', scope: 'adopt' }, path.join(root, 'empty'))
      );
      expect(reply.next).toContain('No program to adopt');
    },
    SLOW
  );

  it(
    'a directory with two programs',
    async () => {
      const root = projectWith('eligian-refusals-adopt-two-', {
        'a.eligian': MAIN_TEXT(),
        'b.eligian': MAIN_TEXT(),
        'lib.eligian': LIBRARY,
      });
      const project = await serve(root);
      const reply = await expectRefused(project, 'adopt-program', () =>
        brief(project, { action: 'status', scope: 'adopt' })
      );
      expect(reply.next).toContain('2 programs');
      expect(reply.next).toContain('a.eligian, b.eligian');
    },
    SLOW
  );

  it(
    'a program with a timeline named a:b, the reply naming it',
    async () => {
      const root = programCopy('eligian-refusals-adopt-name-');
      fs.writeFileSync(
        path.join(root, 'main.eligian'),
        MAIN_TEXT().replace('timeline "hours"', 'timeline "a:b"')
      );
      const project = await serve(root);
      const reply = await expectRefused(project, 'adopt-program', () =>
        brief(project, { action: 'status', scope: 'adopt' })
      );
      expect(reply.next).toContain('"a:b"');
      expect(reply.next).toContain('cannot be view names');
    },
    SLOW
  );
});

describe('adopt-briefed', () => {
  it(
    'adopting where a non-adopted main brief exists',
    async () => {
      const root = programCopy('eligian-refusals-adopt-briefed-');
      const project = await serve(root);
      await brief(project, { action: 'status', idea: IDEA });
      const reply = await expectRefused(project, 'adopt-briefed', () =>
        brief(project, { action: 'status', scope: 'adopt' })
      );
      expect(reply.next).toContain('already holds the brief of a new presentation');
      expect(fs.readFileSync(path.join(root, 'BRIEF.md'), 'utf8')).not.toContain('- scope: adopt');
    },
    SLOW
  );
});

describe('accept-existing writes', () => {
  it(
    'accept-existing on a glob matching a library and a program writes only the program and lists the library in skipped',
    async () => {
      const root = programCopy('eligian-refusals-accept-glob-');
      fs.writeFileSync(path.join(root, 'lib.eligian'), LIBRARY);
      putRecord(root, EMPTY_RECORD);
      const project = await serve(root);
      const before = snapshotFiles(root);
      const reply = await brief(project, { action: 'accept-existing', paths: ['*.eligian'] });
      expect(reply.refused).toBeUndefined();
      expect(reply.accepted).toEqual(['main.eligian']);
      expect(reply.skipped).toEqual([{ path: 'lib.eligian', reason: 'library' }]);
      expect(reply.signoff).toEqual({ mode: 'elicitation' });
      expect(recordOf(root).map(entry => [entry.path, entry.via])).toEqual([
        ['main.eligian', 'accepted'],
      ]);
      // Only the record changed.
      const after = snapshotFiles(root);
      const { [RECORD.split(path.sep).join('/')]: _record, ...rest } = after;
      const { [RECORD.split(path.sep).join('/')]: _was, ...was } = before;
      expect(rest).toEqual(was);
    },
    SLOW
  );

  it(
    "a second accept-existing after a timeline rename replaces the entry's timelines",
    async () => {
      const root = programCopy('eligian-refusals-accept-rename-');
      putRecord(root, EMPTY_RECORD);
      const project = await serve(root);
      const first = await brief(project, { action: 'accept-existing', paths: ['main.eligian'] });
      expect(first.accepted).toEqual(['main.eligian']);
      expect(recordOf(root).find(e => e.path === 'main.eligian')?.timelines).toEqual(['hours']);
      fs.writeFileSync(
        path.join(root, 'main.eligian'),
        MAIN_TEXT().replace('timeline "hours"', 'timeline "opening hours"')
      );
      const second = await brief(project, { action: 'accept-existing', paths: ['main.eligian'] });
      expect(second.refused).toBeUndefined();
      expect(second.accepted).toEqual(['main.eligian']);
      const entry = recordOf(root).find(e => e.path === 'main.eligian');
      expect(entry?.timelines).toEqual(['opening hours']);
      expect(entry?.via).toBe('accepted');
    },
    SLOW
  );
});
