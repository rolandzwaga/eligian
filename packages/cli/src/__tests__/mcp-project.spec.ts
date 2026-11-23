/**
 * Spec 058 Phase 2 (FR-020–FR-027, FR-005; SC-005): `eligian_project`, the project inventory.
 *
 * The handler is tested directly; the wire cases follow with the server registration (T028).
 * The fixture `__fixtures__/mcp/project/` seeds every set: four timelines (A and B share a
 * video file, C plays a missing audio file, D is a raf timeline in a container the layout
 * lacks, with `on enter`), an action whose parameter reaches `selectElement`, a layout, two CSS
 * files, a two-language `locales.json`, a library, a host module and a STORYBOARD.md. The
 * siblings cover the edge cases. The tool reads the fixture in place: the last case proves it
 * writes nothing and leaves no document in the shared workspace.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { getCompilerVersion, getOrCreateServices, STARTERS } from '@eligian/language';
import { Effect, Schema } from 'effect';
import { afterAll, afterEach, beforeAll, describe, expect, it, test, vi } from 'vitest';
import { compileFile } from '../compile-file.js';
import { makeRecordStore, writeRecordText } from '../mcp/brief/known-programs.js';
import { CompilerLockLive } from '../mcp/compiler-lock.js';
import type { EffectAi } from '../mcp/paths.js';
import type { ToolContext } from '../mcp/tools/check.js';
import { DESCRIPTION, handle, KEYWORDS, type Parameters, Success } from '../mcp/tools/project.js';
import { approvedBrief, snapshotFiles } from './brief-helpers.js';
import {
  type InMemoryServer,
  type JsonRpcResponse,
  spawnServer,
  startInMemoryServer,
} from './mcp-test-client.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(HERE, '__fixtures__', 'mcp', 'project');
const at = (...parts: string[]): string => path.join(FIXTURES, ...parts);
const versions = getCompilerVersion();

const tempDirs: string[] = [];
/** The brief key's directory of the handler cases and the servers (never the user's). */
const stateDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-project-state-')));
tempDirs.push(stateDir);
afterAll(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

/** Every file under `dir` (recursive). */
const filesUnder = (dir: string): string[] =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap(entry =>
      entry.isDirectory() ? filesUnder(path.join(dir, entry.name)) : [path.join(dir, entry.name)]
    );

/** sha256 and mtime of every fixture file. */
const fingerprint = (): Record<string, string> =>
  Object.fromEntries(
    filesUnder(FIXTURES).map(file => [
      file,
      `${createHash('sha256').update(fs.readFileSync(file)).digest('hex')} ${fs.statSync(file).mtimeMs}`,
    ])
  );

const documentCount = (): number =>
  getOrCreateServices().shared.workspace.LangiumDocuments.all.count();

describe('eligian_project', () => {
  let ai: EffectAi;

  beforeAll(async () => {
    ai = await import('effect/ai');
  });

  const context = (cwd: string): ToolContext => ({
    ai,
    cwd,
    docsRoot: cwd,
    versions,
    requestId: '1',
    gate: { record: makeRecordStore(), stateDir, noteBrief: () => {} },
  });

  const project = (params: typeof Parameters.Type, cwd = FIXTURES) =>
    Effect.runPromise(handle(params, context(cwd)).pipe(Effect.provide(CompilerLockLive)));

  const failure = (params: typeof Parameters.Type, cwd = FIXTURES) =>
    Effect.runPromise(
      handle(params, context(cwd)).pipe(Effect.flip, Effect.provide(CompilerLockLive))
    );

  /** The one program section of a file input. */
  const programOf = async (input: string, cwd = FIXTURES) => {
    const result = await project({ path: input }, cwd);
    expect(result.programs).toHaveLength(1);
    return result.programs[0]!;
  };

  it('names', async () => {
    const program = await programOf('main.eligian');
    expect(program.file).toBe(at('main.eligian'));
    expect(program.css).toEqual({
      classes: ['ghostc', 'lit', 'visible'],
      ids: ['banner', 'stage'],
    });
    expect(program.layout).toEqual({
      ids: ['stage', 'subtitle', 'title'],
      classes: ['frame', 'heading'],
    });
    expect(program.selectors).toEqual({
      classes: ['frame', 'ghostc', 'heading', 'lit', 'visible'],
      ids: ['banner', 'stage', 'subtitle', 'title'],
    });
    expect(program.locales).toEqual({
      languages: ['en-US', 'nl-NL'],
      keys: ['greeting', 'nav.about', 'nav.home'],
    });
    expect(program.host).toEqual({
      operations: [
        {
          name: 'trackEvent',
          parameters: [
            { name: 'eventName', type: 'string', optional: false },
            { name: 'weight', type: 'number', optional: true },
          ],
        },
      ],
      controllers: [
        { name: 'Confetti', parameters: [{ name: 'count', type: 'number', optional: false }] },
      ],
      functions: [{ name: 'formatPrice', parameters: [] }],
    });
    expect(program.files).toEqual([
      { path: at('main.eligian'), kind: 'entry', exists: true },
      { path: at('lib', 'anim.eligian'), kind: 'library', exists: true },
      { path: at('layout.html'), kind: 'layout', exists: true },
      { path: at('styles.css'), kind: 'styles', exists: true },
      { path: at('locales.json'), kind: 'locales', exists: true },
      { path: at('theme.css'), kind: 'asset', exists: true },
      { path: at('media', 'present.mp4'), kind: 'media', exists: true },
      { path: at('media', 'missing.mp3'), kind: 'media', exists: false },
      { path: at('host.ts'), kind: 'host', exists: true },
    ]);
  });

  it('no languages block → locales.languages []', async () => {
    const program = await programOf('no-languages/main.eligian');
    expect(program.locales).toEqual({ languages: [], keys: [] });
    expect(program.host).toEqual({ operations: [], controllers: [], functions: [] });
  });

  it('outline equals the expected tree', async () => {
    const program = await programOf('main.eligian');
    const event = (name: string, detail: string, line: number) => ({
      kind: 'Event',
      name,
      detail,
      line,
    });
    const mediaTimeline = (name: string, line: number, provider: string, from: string) => ({
      kind: 'Module',
      name: `timeline "${name}"`,
      detail: `${provider} · 0s..1s`,
      line,
      container: '#stage',
      provider,
      from,
      duration: 1,
      children: [event('at 0s..1s', name === 'C' ? 'fade' : 'highlight', line + 1)],
    });
    expect(program.outline).toEqual([
      { kind: 'Variable', name: 'theme', detail: 'import "./theme.css"', line: 12 },
      { kind: 'Constant', name: 'beat', detail: '2s', line: 21 },
      {
        kind: 'Function',
        name: 'highlight',
        detail: 'action(target)',
        line: 23,
        parameters: [{ name: 'target', role: 'selector' }],
      },
      { kind: 'Event', name: 'languageChanged', detail: 'on event "language-change"', line: 28 },
      mediaTimeline('A', 33, 'video', './media/present.mp4'),
      mediaTimeline('B', 37, 'video', './media/present.mp4'),
      mediaTimeline('C', 41, 'audio', './media/missing.mp3'),
      {
        kind: 'Module',
        name: 'timeline "D"',
        detail: 'raf · 0s..3s',
        line: 45,
        container: '.ghostc',
        provider: 'raf',
        duration: 3,
        children: [
          event('on enter', 'selectElement, addClass', 46),
          event('at 0s..2s', 'highlight', 50),
          event('at 2s..3s', 'fade', 51),
        ],
      },
    ]);
  });

  it('assets.problems is exactly the seeded three', async () => {
    const program = await programOf('main.eligian');
    expect(program.assets.problems.map(p => [p.code, p.path, p.line, p.column])).toEqual([
      ['media-from-duplicate', at('media', 'present.mp4'), 37, 43],
      ['media-file-missing', at('media', 'missing.mp3'), 41, 43],
      ['timeline-container-not-in-layout', undefined, 45, 17],
    ]);
    expect(program.assets.problems[0]!.message).toContain('"A"');
    expect(program.assets.problems[1]!.message).toContain('"C"');
    expect(program.assets.problems[2]!.message).toContain('.ghostc');
  });

  it('missing named asset import', async () => {
    const program = await programOf('missing-asset/main.eligian');
    const hint = at('missing-asset', 'hint.html');
    expect(program.assets.problems).toEqual([
      {
        code: 'import_file_not_found',
        message: expect.stringContaining('./hint.html'),
        path: hint,
        line: 2,
        column: 1,
      },
    ]);
    expect(program.files).toContainEqual({ path: hint, kind: 'asset', exists: false });
  });

  it('malformed locales.json → keys [] and one locales-parse-failed problem, no isError', async () => {
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-project-')));
    tempDirs.push(dir);
    fs.cpSync(at('bad-locales'), dir, { recursive: true });
    // Written here: Biome would refuse a committed invalid .json
    fs.writeFileSync(
      path.join(dir, 'locales.json'),
      '{\n  "en-US": {\n    "greeting": "Hello",\n  }\n}\n'
    );
    const program = await programOf('main.eligian', dir);
    expect(program.locales).toEqual({ languages: ['en-US'], keys: [] });
    expect(program.assets.problems).toEqual([
      {
        code: 'locales-parse-failed',
        message: expect.stringContaining('Failed to parse locales file'),
        path: path.join(dir, 'locales.json'),
        line: 7,
        column: 1,
      },
    ]);
  });

  it('storyboard counts ranged actions only', async () => {
    const program = await programOf('main.eligian');
    expect(program.storyboard?.timelines).toEqual([
      { timeline: 'D', beats: 2, timelineActions: 2 },
    ]);
    // The compile summary counts the raw timeline actions: the `on enter` lifecycle action too
    const compiled = await compileFile(at('main.eligian'));
    expect(compiled.config.timelines[3]!.timelineActions).toHaveLength(3);
  });

  it('unknown beat timeline and a 5-cell row are counted', async () => {
    const program = await programOf('main.eligian');
    expect(program.storyboard).toEqual({
      timelines: [{ timeline: 'D', beats: 2, timelineActions: 2 }],
      unknownTimelines: ['Ghost'],
      interactions: 1,
      ignoredRows: 1,
    });
  });

  it('storyboard on a non-compiling program gives timelineActions null', async () => {
    const program = await programOf('no-compile/main.eligian');
    expect(program.storyboard).toEqual({
      timelines: [{ timeline: 'main', beats: 1, timelineActions: null }],
      unknownTimelines: [],
      interactions: 0,
      ignoredRows: 0,
    });
    expect(program.outline).toContainEqual(
      expect.objectContaining({ name: 'timeline "main"', duration: null })
    );
  });

  it('no STORYBOARD.md → storyboard null', async () => {
    const program = await programOf('no-languages/main.eligian');
    expect(program.storyboard).toBeNull();
  });

  it('detailed ⊇ concise', async () => {
    const { header: conciseHeader, ...concise } = await project({ path: 'main.eligian' });
    const { header: detailedHeader, ...detailed } = await project({
      path: 'main.eligian',
      response_format: 'detailed',
    });
    expect(detailedHeader).toBe(conciseHeader);
    // The declared Success schema carries every key (the server encodes the result with it)
    for (const result of [concise, detailed]) {
      const full = { header: conciseHeader, ...result };
      expect(Schema.encodeUnknownSync(Success)(full)).toEqual(full);
    }
    expect(detailed).toMatchObject(concise);
    expect(concise).not.toHaveProperty('starters');
    expect(detailed.starters).toEqual(
      STARTERS.map(starter => ({ name: starter.name, description: starter.description }))
    );
    const program = detailed.programs[0]!;
    expect(program.files.find(f => f.kind === 'entry')?.bytes).toBe(
      fs.statSync(at('main.eligian')).size
    );
    expect(program.files.find(f => !f.exists)).not.toHaveProperty('bytes');
    expect(concise.programs[0]!.files.every(f => f.bytes === undefined)).toBe(true);
    expect(program.locales.keyLanguages).toEqual([
      { id: 'greeting', languageCodes: ['en-US', 'nl-NL'] },
      { id: 'nav.about', languageCodes: ['en-US'] },
      { id: 'nav.home', languageCodes: ['en-US', 'nl-NL'] },
    ]);
  });

  it('directory input', async () => {
    const two = await project({ path: 'dir-two' });
    expect(two.header).toContain(at('dir-two'));
    expect(two.files).toEqual([
      { path: at('dir-two', 'shared.eligian'), kind: 'library', exists: true },
    ]);
    expect(two.programs.map(p => p.file)).toEqual([
      at('dir-two', 'one.eligian'),
      at('dir-two', 'two.eligian'),
    ]);
    expect(two.programs[0]!.files).toContainEqual({
      path: at('dir-two', 'shared.eligian'),
      kind: 'library',
      exists: true,
    });

    const libs = await project({ path: 'dir-libs-only' });
    expect(libs.files).toEqual([
      { path: at('dir-libs-only', 'only.eligian'), kind: 'library', exists: true },
    ]);
    expect(libs.programs).toEqual([]);

    const empty = await failure({ path: 'dir-empty' });
    expect(empty._tag).toBe('ToolNotFound');

    // A file input lists its libraries in its own section only
    expect((await project({ path: 'main.eligian' })).files).toEqual([]);
    expect((await failure({ path: 'nope.eligian' }))._tag).toBe('ToolNotFound');
  });

  it('releases every document and writes nothing', async () => {
    const before = fingerprint();
    const count = documentCount();
    await project({ path: 'main.eligian', response_format: 'detailed' });
    await project({ path: 'no-compile/main.eligian' });
    await project({ path: 'dir-two' });
    expect(documentCount()).toBe(count);
    expect(fingerprint()).toEqual(before);
  });

  it('keywords', () => {
    expect(KEYWORDS).toEqual([
      'project',
      'inventory',
      'selectors',
      'css',
      'layout',
      'locales',
      'assets',
    ]);
    for (const keyword of KEYWORDS) expect(DESCRIPTION.slice(0, 200)).toContain(keyword);
    expect(DESCRIPTION).not.toMatch(/explain/);
  });
});

// ---------------------------------------------------------------------------------------------
// Spec 059 Phase 2 (FR-056, P17; SC-011): each program section's `brief`, through the server.

/** `__fixtures__/mcp/brief/gate/program/`: one timeline, the terse persona's S2 view `hours`. */
const GATE_PROGRAM = path.join(HERE, '__fixtures__', 'mcp', 'brief', 'gate', 'program');
const DOCS = path.join(HERE, '__fixtures__', 'mcp', 'docs-mini');
/** Building a brief through the persona takes a few seconds. */
const BRIEF_TIMEOUT = 120_000;
const built = fs.existsSync(path.resolve(HERE, '..', '..', 'dist', 'cli.mjs'));

const tempRoot = (prefix: string): string => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  tempDirs.push(dir);
  return dir;
};

/** Every file under `root` (`.eligian/` included) except the record store's `.tmp` files. */
const filesOf = (root: string) =>
  Object.fromEntries(
    Object.entries(snapshotFiles(root)).filter(([name]) => !name.endsWith('.tmp'))
  );

/** The `brief` of the one program section of an `eligian_project` payload. */
const projectBriefOf = (payload: { programs: { brief: unknown }[] }) => {
  expect(payload.programs).toHaveLength(1);
  return payload.programs[0]!.brief as Record<string, unknown>;
};

const servers: InMemoryServer[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) await server.close();
  vi.unstubAllEnvs();
});

/** An in-memory server on `cwd` with the test's state dir; closed after the case. */
const serve = async (
  cwd: string,
  brief: { readonly beforeScan?: () => Promise<void> } = {}
): Promise<InMemoryServer> => {
  const server = await startInMemoryServer({ cwd, docsRoot: DOCS, brief: { stateDir, ...brief } });
  servers.push(server);
  return server;
};

const projectCall = async (server: InMemoryServer, input = 'main.eligian') => {
  const result = await server.callTool('eligian_project', { path: input });
  expect(result.isError, JSON.stringify(result.payload)).toBe(false);
  return result.payload;
};

describe('brief section', () => {
  it('known unbriefed: { file: null, state: none, known: true, gate: runs }', async () => {
    const root = tempRoot('eligian-project-known-');
    fs.cpSync(GATE_PROGRAM, root, { recursive: true });
    const server = await serve(root);

    expect(projectBriefOf(await projectCall(server))).toEqual({
      file: null,
      state: 'none',
      next: expect.any(String),
      known: true,
      gate: 'runs',
    });
  });

  it(
    'governed open: state open, counts, gate brief-incomplete',
    async () => {
      const root = tempRoot('eligian-project-open-');
      const server = await serve(root);
      const status = await server.callTool('eligian_brief', {
        action: 'status',
        idea: 'A one-screen overview of our support hours.',
      });
      expect(status.isError).toBe(false);
      expect(status.payload.state).toBe('open');
      // Written after the start scan: not known, so the open brief decides
      fs.cpSync(GATE_PROGRAM, root, { recursive: true });

      const brief = projectBriefOf(await projectCall(server));
      expect(brief).toMatchObject({
        file: path.join(root, 'BRIEF.md'),
        state: 'open',
        known: false,
        gate: 'brief-incomplete',
      });
      // `eligian_brief` always reports fromCode; the section's counts carry it only when set
      const { fromCode, ...counts } = status.payload.counts;
      expect(brief.counts).toEqual(fromCode === 0 ? counts : { ...counts, fromCode });
      expect(brief.next).toContain('action: answer');
    },
    BRIEF_TIMEOUT
  );

  it(
    'approved: gate runs',
    async () => {
      const root = tempRoot('eligian-project-approved-');
      const server = await serve(root);
      await approvedBrief(server, root, { stateDir });
      fs.cpSync(GATE_PROGRAM, root, { recursive: true });

      expect(projectBriefOf(await projectCall(server))).toMatchObject({
        file: path.join(root, 'BRIEF.md'),
        state: 'approved',
        gate: 'runs',
      });
      // The same verdict as the gate's: the next check runs
      const check = await server.callTool('eligian_check', { paths: ['main.eligian'] });
      expect(check.isError, JSON.stringify(check.payload)).toBe(false);
    },
    BRIEF_TIMEOUT
  );

  it('writes nothing', async () => {
    const root = tempRoot('eligian-project-writes-');
    const server = await serve(root);
    const status = await server.callTool('eligian_brief', {
      action: 'status',
      idea: 'Support hours.',
    });
    expect(status.isError).toBe(false);
    fs.cpSync(GATE_PROGRAM, root, { recursive: true });
    fs.mkdirSync(path.join(root, 'more'));
    fs.copyFileSync(path.join(root, 'main.eligian'), path.join(root, 'more', 'second.eligian'));

    const before = filesOf(root);
    expect(Object.keys(before)).toContain('.eligian/programs.json');
    await projectCall(server);
    await projectCall(server, '.');
    expect(filesOf(root)).toEqual(before);
  });

  it('notes the first refused program, else the first (FR-057)', async () => {
    const root = tempRoot('eligian-project-note-');
    fs.cpSync(GATE_PROGRAM, root, { recursive: true });
    const ai = await import('effect/ai');
    const notes: unknown[] = [];
    const run = (input: string) =>
      Effect.runPromise(
        handle(
          { path: input },
          {
            ai,
            cwd: root,
            docsRoot: root,
            versions,
            requestId: '1',
            gate: { record: makeRecordStore(), stateDir, noteBrief: note => notes.push(note) },
          }
        ).pipe(Effect.provide(CompilerLockLive))
      );

    await run('main.eligian');
    expect(notes).toEqual([{ state: 'none' }]);

    // main.eligian known, z.eligian not
    fs.mkdirSync(path.join(root, '.eligian'));
    fs.writeFileSync(
      path.join(root, '.eligian', 'programs.json'),
      writeRecordText([
        {
          path: 'main.eligian',
          timelines: ['hours'],
          languages: [],
          extensions: false,
          via: 'first-run',
        },
      ])
    );
    fs.copyFileSync(path.join(root, 'main.eligian'), path.join(root, 'z.eligian'));
    notes.length = 0;
    const both = await run('.');
    expect(both.programs.map(p => [path.basename(p.file), p.brief.gate])).toEqual([
      ['main.eligian', 'runs'],
      ['z.eligian', 'brief-required'],
    ]);
    expect(notes).toEqual([{ state: 'none', gate: 'brief-required' }]);
  });
});

/** Holds until `release()`; `entered` resolves when it is first called. */
function holdSeam() {
  let enter = () => {};
  let release = () => {};
  const entered = new Promise<void>(resolve => {
    enter = resolve;
  });
  const released = new Promise<void>(resolve => {
    release = resolve;
  });
  return {
    seam: () => {
      enter();
      return released;
    },
    entered,
    release,
  };
}

/** Whether `promise` is still pending after `ms`. */
async function pendingAfter(promise: Promise<unknown>, ms: number): Promise<boolean> {
  let settled = false;
  promise.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    }
  );
  await new Promise(resolve => setTimeout(resolve, ms));
  return !settled;
}

describe('never scans (P17)', () => {
  it('first call while beforeScan holds the start scan: it waits, then reports known: true; the tool itself writes nothing', async () => {
    const root = tempRoot('eligian-project-held-');
    fs.cpSync(GATE_PROGRAM, root, { recursive: true });
    const held = holdSeam();
    const server = await serve(root, { beforeScan: held.seam });
    await held.entered;

    const call = projectCall(server);
    expect(await pendingAfter(call, 300)).toBe(true);
    expect(fs.existsSync(path.join(root, '.eligian'))).toBe(false);
    held.release();
    expect(projectBriefOf(await call)).toMatchObject({
      file: null,
      state: 'none',
      known: true,
      gate: 'runs',
    });

    // The record is the start scan's own write; another call adds nothing
    const record = JSON.parse(
      fs.readFileSync(path.join(root, '.eligian', 'programs.json'), 'utf8')
    );
    expect(record.programs.map((entry: { path: string }) => entry.path)).toEqual(['main.eligian']);
    const before = filesOf(root);
    await projectCall(server);
    expect(filesOf(root)).toEqual(before);
  });

  test.skipIf(!built)(
    'first call on an unscanned announced root (spawned, roots client): known: true, gate equal to the next eligian_check verdict, no .eligian/ under that root',
    async () => {
      const cwd = tempRoot('eligian-project-cwd-');
      const announced = tempRoot('eligian-project-announced-');
      fs.cpSync(GATE_PROGRAM, announced, { recursive: true });
      const server = spawnServer({ cwd, env: { ...process.env, ELIGIAN_STATE_DIR: stateDir } });
      // As roots-client.mjs (mcp-paths.spec.ts:234): every roots/list names the announced root
      server.onFrame(frame => {
        const request = frame as { readonly method?: string; readonly id?: string | number };
        if (request.method === 'roots/list' && request.id !== undefined) {
          server.send({
            jsonrpc: '2.0',
            id: request.id,
            result: { roots: [{ uri: pathToFileURL(announced).href }] },
          });
        }
      });
      const call = async (name: string, args: Record<string, unknown>) => {
        const response: JsonRpcResponse = await server.request('tools/call', {
          name,
          arguments: args,
        });
        expect(response.error).toBeUndefined();
        const result = response.result as { content: { text: string }[]; isError?: boolean };
        return { isError: result.isError === true, payload: JSON.parse(result.content[0]!.text) };
      };
      try {
        const init = await server.request('initialize', {
          protocolVersion: '2025-11-25',
          capabilities: { roots: { listChanged: false } },
          clientInfo: { name: 'project-roots', version: '0' },
        });
        expect(init.error).toBeUndefined();
        server.notify('notifications/initialized');

        const project = await call('eligian_project', { path: 'main.eligian' });
        expect(project.isError, JSON.stringify(project.payload)).toBe(false);
        expect(project.payload.root).toBe(announced);
        expect(projectBriefOf(project.payload)).toMatchObject({ known: true, gate: 'runs' });
        expect(fs.existsSync(path.join(announced, '.eligian'))).toBe(false);

        // `runs`: the next check is not refused
        const check = await call('eligian_check', { paths: ['main.eligian'] });
        expect(check.isError, JSON.stringify(check.payload)).toBe(false);
      } finally {
        await server.close();
      }
    },
    60_000
  );

  it('FR-062 cwd (the home directory): known: false, gate brief-required, no .eligian/', async () => {
    const home = tempRoot('eligian-project-home-');
    fs.cpSync(GATE_PROGRAM, home, { recursive: true });
    vi.stubEnv('HOME', home);
    vi.stubEnv('USERPROFILE', home);
    expect(os.homedir()).toBe(home);
    const server = await serve(home);

    expect(projectBriefOf(await projectCall(server))).toMatchObject({
      file: null,
      state: 'none',
      known: false,
      gate: 'brief-required',
    });
    expect(fs.existsSync(path.join(home, '.eligian'))).toBe(false);
  });
});
