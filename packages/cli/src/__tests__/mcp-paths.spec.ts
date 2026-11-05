/**
 * Spec 058 Phase 1 (FR-007, FR-008, FR-058, SC-021; plan C4, C5): the project root and the path
 * policy. Tool inputs resolve against the first announced MCP root (else the server cwd) and
 * must lie under it; the imports of a program are not inspected here.
 *
 * `telemetry` and `paths at the server` run the whole server: in-process through
 * `startInMemoryServer` (docs generated into a temp dir once), and spawned for the roots cases,
 * through the raw NDJSON client `__fixtures__/mcp/roots-client.mjs` (`effect/ai`'s McpClient
 * cannot advertise roots). The spawned runs need the built CLI (`test.skipIf(!built)`).
 */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { getCompilerVersion } from '@eligian/language';
import { Effect, Exit } from 'effect';
import { afterAll, afterEach, beforeAll, describe, expect, it, test, vi } from 'vitest';
import { generateKnowledge } from '../../scripts/generate-knowledge.js';
import { runCheck } from '../check/check-command.js';
import { ToolNotFound } from '../mcp/errors.js';
import {
  type EffectAi,
  isInside,
  type ProjectRoot,
  projectRoot,
  resolveInputPath,
  resolveInputPatterns,
} from '../mcp/paths.js';
import type { TelemetryLine } from '../mcp/telemetry.js';
import {
  BIN,
  type InMemoryServer,
  startInMemoryServer,
  type ToolCallResult,
} from './mcp-test-client.js';

const win32 = process.platform === 'win32';

/** The typed failure of an effect that must fail. */
const failureOf = async <A, E>(effect: Effect.Effect<A, E>): Promise<E> => {
  const exit = await Effect.runPromiseExit(effect);
  if (Exit.isSuccess(exit)) throw new Error(`expected a failure, got ${String(exit.value)}`);
  const reason = exit.cause.reasons.find(r => r._tag === 'Fail');
  if (reason?._tag !== 'Fail') throw new Error('expected a typed failure');
  return reason.error;
};

describe('paths', () => {
  let base: string;
  let rootDir: string;
  let outsideDir: string;
  let root: ProjectRoot;
  let ai: EffectAi;

  beforeAll(async () => {
    ai = await import('effect/ai');
    base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-mcp-paths-')));
    rootDir = path.join(base, 'project');
    outsideDir = path.join(base, 'outside');
    fs.mkdirSync(path.join(rootDir, 'sub'), { recursive: true });
    fs.mkdirSync(outsideDir, { recursive: true });
    fs.writeFileSync(path.join(rootDir, 'main.eligian'), '');
    fs.writeFileSync(path.join(rootDir, 'sub', 'file.eligian'), '');
    fs.writeFileSync(path.join(outsideDir, 'other.eligian'), '');
    root = { root: rootDir, from: 'cwd' };
  });

  afterAll(() => {
    fs.rmSync(base, { recursive: true, force: true });
  });

  it('isInside', () => {
    const r = path.resolve('/projects/app');
    expect(isInside(r, path.join(r, 'main.eligian'))).toBe(true);
    expect(isInside(r, path.join(r, 'a', 'b.eligian'))).toBe(true);
    expect(isInside(r, r)).toBe(true);
    expect(isInside(r, path.resolve(r, '..', 'other', 'x.eligian'))).toBe(false);
    expect(isInside(r, path.resolve('/projects/app-other/x.eligian'))).toBe(false);
    // a name that starts with two dots is still inside
    expect(isInside(r, path.join(r, '..notes.eligian'))).toBe(true);
    if (win32) {
      expect(isInside('C:\\projects\\app', 'D:\\projects\\app\\main.eligian')).toBe(false);
      expect(isInside('C:\\Projects\\App', 'c:\\projects\\app\\main.eligian')).toBe(true);
    }
  });

  it('resolveInputPath: relative to the root', async () => {
    const file = path.join(rootDir, 'sub', 'file.eligian');
    expect(await Effect.runPromise(resolveInputPath(root, 'main.eligian'))).toBe(
      path.join(rootDir, 'main.eligian')
    );
    expect(await Effect.runPromise(resolveInputPath(root, 'sub/file.eligian'))).toBe(file);
    expect(await Effect.runPromise(resolveInputPath(root, file))).toBe(file);
  });

  it('outside the root is not-found naming the root', async () => {
    const outside = path.join(outsideDir, 'other.eligian');
    for (const input of ['../outside/other.eligian', outside]) {
      const error = await failureOf(resolveInputPath(root, input));
      expect(error).toBeInstanceOf(ToolNotFound);
      expect(error.message).toContain(rootDir);
      expect(error.path).toBe(outside);
    }
  });

  test.runIf(win32)('backslash path', async () => {
    const file = path.join(rootDir, 'sub', 'file.eligian');
    expect(await Effect.runPromise(resolveInputPath(root, 'sub\\file.eligian'))).toBe(file);
    // the drive letter in either case
    const lowerDrive = `${rootDir.charAt(0).toLowerCase()}${rootDir.slice(1)}\\sub\\file.eligian`;
    const resolved = await Effect.runPromise(resolveInputPath(root, lowerDrive));
    expect(resolved.toLowerCase()).toBe(file.toLowerCase());
    expect(await Effect.runPromise(resolveInputPatterns(root, ['sub\\file.eligian']))).toEqual([
      file,
    ]);
  });

  it('resolveInputPatterns: files, directories and globs under the root', async () => {
    const main = path.join(rootDir, 'main.eligian');
    const file = path.join(rootDir, 'sub', 'file.eligian');
    expect(await Effect.runPromise(resolveInputPatterns(root, ['.']))).toEqual([main, file]);
    expect(await Effect.runPromise(resolveInputPatterns(root, ['sub/*.eligian']))).toEqual([file]);
    expect(await Effect.runPromise(resolveInputPatterns(root, ['.', '!sub/**']))).toEqual([main]);
  });

  it('resolveInputPatterns: no match is not-found', async () => {
    const error = await failureOf(resolveInputPatterns(root, ['nothing/**/*.eligian']));
    expect(error).toBeInstanceOf(ToolNotFound);
    expect(error.message).toContain('nothing/**/*.eligian');
    expect(error.message).toContain(rootDir);
  });

  it('an absolute input outside the root fails before any glob', async () => {
    const outside = path.join(outsideDir, 'other.eligian');
    const error = await failureOf(resolveInputPatterns(root, ['main.eligian', outside]));
    expect(error).toBeInstanceOf(ToolNotFound);
    expect(error.message).toContain(rootDir);
    expect(error.path).toBe(outside);
    // a relative input that leaves the root fails the same way
    const relative = await failureOf(resolveInputPatterns(root, ['../outside/**/*.eligian']));
    expect(relative).toBeInstanceOf(ToolNotFound);
    expect(relative.message).toContain(rootDir);
  });

  it('projectRoot without an McpServerClient is cwd', async () => {
    expect(await Effect.runPromise(projectRoot(ai, rootDir))).toEqual({
      root: rootDir,
      from: 'cwd',
    });
  });

  describe('projectRoot with an McpServerClient', () => {
    type Client = EffectAi['McpSchema']['McpServerClient']['Service'];
    type ReverseClient = Effect.Success<Client['getClient']>;

    const withClient = (
      clientCapabilities: Client['clientCapabilities'],
      listRoots: ReverseClient['listRoots']
    ) => {
      const reverse: ReverseClient = {
        listRoots,
        createMessage: () => Effect.die('unused'),
        elicit: () => Effect.die('unused'),
      };
      // only clientCapabilities and getClient are read by projectRoot
      const client = {
        clientId: 1,
        protocolVersion: '2025-11-25',
        clientCapabilities,
        clientInfo: { name: 'test', version: '0' },
        initializePayload: {},
        getClient: Effect.succeed(reverse),
      } as unknown as Client;
      return projectRoot(ai, rootDir).pipe(
        Effect.provideService(ai.McpSchema.McpServerClient, client)
      );
    };
    const rootsResult = (uris: readonly string[]) =>
      new ai.McpSchema.ListRootsResult({
        roots: uris.map(uri => new ai.McpSchema.Root({ uri })),
      });

    it('the first announced root, asked with params {}', async () => {
      const requests: unknown[] = [];
      const result = await Effect.runPromise(
        withClient({ roots: { listChanged: true } }, request => {
          requests.push(request);
          return Effect.succeed(
            rootsResult([pathToFileURL(outsideDir).href, pathToFileURL(rootDir).href])
          );
        })
      );
      expect(result).toEqual({ root: outsideDir, from: 'roots' });
      // listRoots() sends "params": null, which real clients drop (spike S1)
      expect(requests).toEqual([{}]);
    });

    it('no roots capability, an empty list, a failure, a non-file root: cwd, silently', async () => {
      const cwd = { root: rootDir, from: 'cwd' };
      let asked = false;
      const noCapability = withClient({}, () => {
        asked = true;
        return Effect.succeed(rootsResult([]));
      });
      expect(await Effect.runPromise(noCapability)).toEqual(cwd);
      expect(asked).toBe(false);

      const empty = withClient({ roots: {} }, () => Effect.succeed(rootsResult([])));
      expect(await Effect.runPromise(empty)).toEqual(cwd);

      const failed = withClient({ roots: {} }, () =>
        Effect.fail(
          new ai.McpSchema.McpReverseOperationError({ operation: 'roots/list', cause: 'boom' })
        )
      );
      expect(await Effect.runPromise(failed)).toEqual(cwd);

      const notFile = withClient({ roots: {} }, () =>
        Effect.succeed(rootsResult(['https://example.com/x']))
      );
      expect(await Effect.runPromise(notFile)).toEqual(cwd);
    });
  });
});

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(HERE, '__fixtures__', 'mcp');
/** `outside/inner/main.eligian` imports `../shared.css`: the stylesheet lies outside the root */
const OUTSIDE = path.join(FIXTURES, 'outside');
const INNER = path.join(OUTSIDE, 'inner');
const ROOTS_CLIENT = path.join(FIXTURES, 'roots-client.mjs');
const built = fs.existsSync(path.resolve(HERE, '..', '..', 'dist', 'cli.mjs'));

/** A declared failure on the wire (FR-005, FR-006): its `error`, after the shape checks. */
const expectFailure = (result: ToolCallResult, kind: string) => {
  const raw = result.raw as { content: { type: string; text: string }[] };
  expect(result.isError).toBe(true);
  expect(raw.content[0].text.startsWith('{"header":')).toBe(true);
  expect(result.payload.error.kind).toBe(kind);
  return result.payload.error as { kind: string; message: string; path?: string };
};

/** Every file below `dir` (relative, `/`-separated) with the sha256 of its bytes, sorted. */
const snapshotDir = (dir: string): [string, string][] =>
  fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .map((entry): [string, string] => {
      const file = path.join(entry.parentPath, entry.name);
      return [
        path.relative(dir, file).split(path.sep).join('/'),
        createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
      ];
    })
    .sort(([a], [b]) => a.localeCompare(b));

interface ReportedDiagnostic {
  readonly code?: string;
  readonly severity: string;
  readonly message: string;
  readonly line: number;
  readonly column: number;
}

/** The fields both reports carry for each diagnostic (the CLI JSON and the tool's). */
const comparable = (d: ReportedDiagnostic): ReportedDiagnostic => ({
  code: d.code,
  severity: d.severity,
  message: d.message,
  line: d.line,
  column: d.column,
});

describe('the server', () => {
  let base: string;
  let docsRoot: string;
  const servers: InMemoryServer[] = [];

  const start = async (cwd: string): Promise<InMemoryServer> => {
    const server = await startInMemoryServer({ cwd, docsRoot });
    servers.push(server);
    return server;
  };

  /** A fresh copy of `outside/` under the temp base. */
  const copyOutside = (name: string): string => {
    const target = path.join(base, name);
    fs.cpSync(OUTSIDE, target, { recursive: true });
    return target;
  };

  beforeAll(async () => {
    base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-mcp-server-paths-')));
    docsRoot = path.join(base, 'docs');
    await generateKnowledge({ outDir: docsRoot });
  }, 300_000);

  afterEach(async () => {
    for (const server of servers.splice(0)) await server.close();
  });

  afterAll(() => {
    fs.rmSync(base, { recursive: true, force: true });
  });

  describe('telemetry', () => {
    const previous = process.env.ELIGIAN_MCP_LOG;

    afterEach(() => {
      if (previous === undefined) delete process.env.ELIGIAN_MCP_LOG;
      else process.env.ELIGIAN_MCP_LOG = previous;
      vi.restoreAllMocks();
    });

    it('N calls append N lines', async () => {
      const log = path.join(base, 'telemetry.ndjson');
      process.env.ELIGIAN_MCP_LOG = log;
      const server = await start(INNER);

      const N = 3;
      for (let i = 0; i < N; i++) {
        const result = await server.callTool('eligian_operations', { names: ['addClass'] });
        expect(result.isError).toBe(false);
      }

      const lines = fs.readFileSync(log, 'utf8').split('\n').filter(Boolean);
      expect(lines).toHaveLength(N);
      for (const text of lines) {
        const line = JSON.parse(text) as TelemetryLine;
        expect(Object.keys(line).sort()).toEqual(['args', 'chars', 'ms', 'ok', 't', 'tool']);
        expect(line.tool).toBe('eligian_operations');
        expect(line.ok).toBe(true);
        expect(line.chars).toBeGreaterThan(0);
      }
    });

    it('an unwritable log file changes no result', async () => {
      const log = path.join(base, 'no-such-dir', 'telemetry.ndjson');
      process.env.ELIGIAN_MCP_LOG = log;
      const stderr: string[] = [];
      vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: string | Uint8Array) => {
        stderr.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8'));
        return true;
      }) as typeof process.stderr.write);
      const server = await start(INNER);

      const first = await server.callTool('eligian_operations', { names: ['addClass'] });
      const second = await server.callTool('eligian_operations', { names: ['addClass'] });

      expect(first.isError).toBe(false);
      expect(second.isError).toBe(false);
      expect(second.payload).toEqual(first.payload);
      const telemetry = stderr
        .filter(chunk => chunk.startsWith('{"t":'))
        .map(chunk => JSON.parse(chunk) as TelemetryLine);
      expect(telemetry.map(line => [line.tool, line.ok])).toEqual([
        ['eligian_operations', true],
        ['eligian_operations', true],
      ]);
      // one warning naming the file, then file logging is off
      const warnings = stderr.filter(chunk => chunk.includes('is not writable'));
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain(log);
      expect(fs.existsSync(log)).toBe(false);
    });
  });

  describe('paths at the server', () => {
    const execFileAsync = promisify(execFile);

    interface RootsRun {
      readonly rootsRequests: number;
      readonly ms: number;
      readonly result: { readonly content: { text: string }[]; readonly isError?: boolean };
    }

    /** `roots-client.mjs` in `cwd` (the spawned server's cwd): its one line of output. */
    const runRootsClient = async (
      cwd: string,
      mode: 'ok' | 'error' | 'silent',
      input: string,
      root?: string
    ): Promise<RootsRun> => {
      const args = [ROOTS_CLIENT, '--bin', BIN, '--roots', mode, '--path', input];
      if (root !== undefined) args.push('--root', root);
      const { stdout } = await execFileAsync(process.execPath, args, { cwd });
      return JSON.parse(stdout.trim()) as RootsRun;
    };

    /** The `eligian_check` payload of a spawned run, after the not-isError check. */
    const checkPayload = (run: RootsRun) => {
      expect(run.result.isError).not.toBe(true);
      return JSON.parse(run.result.content[0].text) as {
        header: string;
        root: string;
        files: { file: string }[];
      };
    };

    test.skipIf(!built)(
      'announced root',
      async () => {
        // the spawn cwd holds no main.eligian: only the announced root resolves it
        const spawnCwd = path.join(base, 'announced-cwd');
        fs.mkdirSync(spawnCwd);
        const root = path.join(copyOutside('announced'), 'inner');
        const file = path.join(root, 'main.eligian');

        const run = await runRootsClient(spawnCwd, 'ok', 'main.eligian', root);

        expect(run.rootsRequests).toBeGreaterThanOrEqual(1);
        const payload = checkPayload(run);
        expect(payload.root).toBe(root);
        expect(payload.files.map(f => f.file)).toEqual([file]);
        expect(payload.header.endsWith(` · eligian_check · ${file}`)).toBe(true);
      },
      60_000
    );

    test.skipIf(!built)(
      'roots/list fails',
      async () => {
        const spawnCwd = path.join(copyOutside('roots-fail'), 'inner');
        const file = path.join(spawnCwd, 'main.eligian');

        // run 1: roots/list is answered with a JSON-RPC error -32603
        const errored = await runRootsClient(spawnCwd, 'error', 'main.eligian');
        // run 2: roots/list is never answered; the server waits out its 2 s timeout
        const silent = await runRootsClient(spawnCwd, 'silent', 'main.eligian');
        expect(silent.ms).toBeGreaterThanOrEqual(2000);

        for (const run of [errored, silent]) {
          expect(run.rootsRequests).toBeGreaterThanOrEqual(1);
          const payload = checkPayload(run);
          expect(payload.root).toBe(spawnCwd);
          expect(payload.files.map(f => f.file)).toEqual([file]);
        }
      },
      60_000
    );

    it('no roots', async () => {
      const server = await start(INNER);

      const result = await server.callTool('eligian_check', { paths: ['main.eligian'] });

      expect(result.isError).toBe(false);
      expect(result.payload.root).toBe(INNER);
      expect(result.payload.files.map((f: { file: string }) => f.file)).toEqual([
        path.join(INNER, 'main.eligian'),
      ]);
      // the client announced no roots, so none were asked for
      const asked = server
        .frames()
        .filter(frame => (frame as { method?: string }).method === 'roots/list');
      expect(asked).toEqual([]);
    });

    it('outside the root', async () => {
      const server = await start(INNER);
      // an existing program, so the refusal is the root's
      const outside = path.join(FIXTURES, 'noise-project', 'main.eligian');
      expect(fs.existsSync(outside)).toBe(true);

      const check = expectFailure(
        await server.callTool('eligian_check', { paths: [outside] }),
        'not-found'
      );
      const operations = expectFailure(
        await server.callTool('eligian_operations', { names: ['addClass'], path: outside }),
        'not-found'
      );

      for (const error of [check, operations]) {
        expect(error.message).toContain(INNER);
        expect(error.path).toBe(outside);
      }
    });

    it('imports outside the root equal the CLI', async () => {
      const file = path.join(INNER, 'main.eligian');
      const outcome = await runCheck([file], {
        format: 'json',
        warningsAsErrors: false,
        maxWarnings: 0,
        selectorNotInLayout: 'ids',
        lint: true,
        review: true,
        cwd: INNER,
        version: getCompilerVersion().compiler,
      });
      const report = JSON.parse(outcome.output) as {
        files: { diagnostics: ReportedDiagnostic[] }[];
      };
      const cli = report.files.flatMap(f => f.diagnostics).map(comparable);

      const server = await start(INNER);
      const result = await server.callTool('eligian_check', { paths: ['main.eligian'] });
      const tool = (result.payload.diagnostics as ReportedDiagnostic[]).map(comparable);

      expect(result.isError).toBe(false);
      expect(tool).toEqual(cli);
      // the stylesheet outside the root was read: its classes are the suggestions
      expect(tool.map(d => d.code)).toEqual(['unknown_css_class']);
      expect(tool[0].message).toContain('Did you mean: lit?');
      // no refusal of the import and nothing on its line (`styles "../shared.css"`)
      expect(tool.some(d => d.line === 4)).toBe(false);
    });

    it('read-only tools change nothing', async () => {
      const copy = copyOutside('read-only');
      const before = snapshotDir(copy);
      const server = await start(path.join(copy, 'inner'));

      const calls: [string, unknown][] = [
        ['eligian_docs', {}],
        ['eligian_operations', { names: ['addClass'], path: 'main.eligian' }],
        ['eligian_check', { paths: ['main.eligian'] }],
        ['eligian_fmt', { paths: ['main.eligian'], write: false }],
      ];
      for (const [name, args] of calls) {
        const result = await server.callTool(name, args);
        expect(result.isError, name).toBe(false);
      }

      expect(before.map(([file]) => file)).toEqual([
        'inner/layout.html',
        'inner/main.eligian',
        'shared.css',
      ]);
      expect(snapshotDir(copy)).toEqual(before);
    });
  });
});
