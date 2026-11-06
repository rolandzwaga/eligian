/**
 * Spec 058 Phase 1 (FR-004, FR-006, SC-002, SC-019): an MCP server over stdio writes nothing
 * to stdout but protocol frames. `redirectConsoleToStderr` captures the original
 * `process.stdout.write` for the transport and routes every other writer to stderr.
 *
 * The unit tests stub the streams and `console` with recorders and restore them in
 * `finally`, so vitest's own console is untouched after each test. The noise and crash runs
 * spawn `bin/cli.js mcp` with a preload (`__fixtures__/mcp/noise.mjs`, `crash.mjs`) that
 * fires once the trigger file exists; they need the built CLI. The defect run is in-process:
 * a compiler lock whose `run` dies makes `eligian_check` hit the tool boundary (plan C10).
 * Spec 058 Phase 2 (SC-008(5)): an `eligian_smoke` call through the spawned server, with the
 * default `cliPath`, leaves stdout pure NDJSON.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Effect, Layer, Stdio, Stream } from 'effect';
import { afterAll, describe, expect, it, test, vi } from 'vitest';
import { CompilerLock } from '../mcp/compiler-lock.js';
import { layerNodeStdio, redirectConsoleToStderr, stderrLoggerLayer } from '../mcp/stdio.js';
import { spawnServer, startInMemoryServer } from './mcp-test-client.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(HERE, '__fixtures__', 'mcp');
const NOISE_PROJECT = path.join(FIXTURES, 'noise-project');
const SMOKE_PROJECT = path.join(FIXTURES, 'smoke-tool');
const built = fs.existsSync(path.resolve(HERE, '..', '..', 'dist', 'cli.mjs'));

const NOISE_SENTINELS = [
  'NOISE-SENTINEL-console.log',
  'NOISE-SENTINEL-console.info',
  'NOISE-SENTINEL-console.debug',
  'NOISE-SENTINEL-stdout.write',
];
const INITIALIZE = {
  protocolVersion: '2025-11-25',
  capabilities: {},
  clientInfo: { name: 'mcp-stdout-spec', version: '0' },
};
/** SC-019: red until the CLI version is 1.1.0 (T055) */
const HEADER = /^eligian 1\.1\.0 · eligius \d+\.\d+\.\d+ · eligian_check · /;

const tempDirs: string[] = [];
/** A path in a new temp dir; the test creates the file (the preloads' trigger). */
const triggerPath = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-noise-'));
  tempDirs.push(dir);
  return path.join(dir, 'trigger');
};

afterAll(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

/** Every line of `stdout` is a JSON-RPC 2.0 frame, and no line is left unterminated. */
function expectOnlyFrames(stdout: string): void {
  expect(stdout === '' || stdout.endsWith('\n')).toBe(true);
  for (const line of stdout.split('\n').filter(l => l.trim() !== '')) {
    let frame: unknown;
    expect(() => {
      frame = JSON.parse(line);
    }, line).not.toThrow();
    expect((frame as { jsonrpc?: unknown }).jsonrpc, line).toBe('2.0');
  }
}

/** The spawned child's raw stdout, and a promise for its streams having closed. */
function recordStdout(child: ReturnType<typeof spawnServer>['child']) {
  let stdout = '';
  child.stdout.on('data', (chunk: string) => {
    stdout += chunk;
  });
  const closed = new Promise<void>(resolve => child.on('close', () => resolve()));
  return { stdout: () => stdout, closed };
}

type Writer = typeof process.stdout.write;
const CONSOLE_METHODS = ['log', 'info', 'debug', 'warn', 'error'] as const;

/** Replaces both stream writers and the console methods with recorders, runs `body`, restores. */
function withRecordedStreams(body: (stdout: string[], stderr: string[]) => void): void {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const originalStdoutWrite = process.stdout.write;
  const originalStderrWrite = process.stderr.write;
  const originalConsole = CONSOLE_METHODS.map(method => console[method]);
  const recorder = (into: string[]): Writer =>
    ((chunk: string | Uint8Array) => {
      into.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8'));
      return true;
    }) as Writer;
  process.stdout.write = recorder(stdout);
  process.stderr.write = recorder(stderr);
  try {
    body(stdout, stderr);
  } finally {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
    CONSOLE_METHODS.forEach((method, i) => {
      console[method] = originalConsole[i];
    });
  }
}

describe('stdout carries only protocol frames', () => {
  it('redirectConsoleToStderr routes every writer', () => {
    withRecordedStreams((stdout, stderr) => {
      const captured = redirectConsoleToStderr();

      console.log('L');
      console.info('I');
      console.debug('D');
      console.warn('W');
      console.error('E');
      process.stdout.write('S');

      const err = stderr.join('');
      for (const sentinel of ['L', 'I', 'D', 'W', 'E', 'S']) {
        expect(err).toContain(sentinel);
      }
      expect(stdout).toEqual([]);

      captured.write('F');
      expect(stdout).toEqual(['F']);
      expect(err).not.toContain('F');

      // Idempotent: a second call returns a writer to the same original stdout.
      redirectConsoleToStderr().write('G');
      expect(stdout).toEqual(['F', 'G']);
      console.log('H');
      expect(stdout).toEqual(['F', 'G']);
      expect(stderr.join('')).toContain('H');
    });
  });

  it('layerNodeStdio writes stdout to the captured writer and stderr to process.stderr', async () => {
    const frames: string[] = [];
    const stderr: string[] = [];
    const originalStderrWrite = process.stderr.write;
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderr.push(String(chunk));
      return true;
    }) as Writer;
    try {
      const program = Effect.gen(function* () {
        const stdio = yield* Stdio.Stdio;
        yield* Stream.run(Stream.make('frame-1\n', 'frame-2\n'), stdio.stdout());
        yield* Stream.run(Stream.make('log\n'), stdio.stderr());
        return yield* stdio.args;
      });
      const args = await Effect.runPromise(
        program.pipe(
          Effect.provide(
            layerNodeStdio({
              write: chunk => {
                frames.push(String(chunk));
                return true;
              },
            })
          )
        )
      );
      expect(frames).toEqual(['frame-1\n', 'frame-2\n']);
      expect(stderr).toEqual(['log\n']);
      expect(args).toEqual(process.argv.slice(2));
    } finally {
      process.stderr.write = originalStderrWrite;
    }
  });

  it('stderrLoggerLayer logs through console.error, never console.log', async () => {
    const errors: unknown[][] = [];
    const logs: unknown[][] = [];
    const originalError = console.error;
    const originalLog = console.log;
    console.error = (...args: unknown[]) => {
      errors.push(args);
    };
    console.log = (...args: unknown[]) => {
      logs.push(args);
    };
    try {
      await Effect.runPromise(
        Effect.logError('stderr-sentinel').pipe(Effect.provide(stderrLoggerLayer))
      );
    } finally {
      console.error = originalError;
      console.log = originalLog;
    }
    expect(logs).toEqual([]);
    expect(errors.map(args => args.join(' ')).join('\n')).toContain('stderr-sentinel');
  });
});

describe('stdout carries only protocol frames (server runs)', () => {
  test.skipIf(!built)(
    'with console noise after initialize',
    async () => {
      const trigger = triggerPath();
      const server = spawnServer({
        preload: path.join(FIXTURES, 'noise.mjs'),
        env: { ...process.env, ELIGIAN_NOISE_TRIGGER: trigger },
        cwd: NOISE_PROJECT,
      });
      const recorded = recordStdout(server.child);
      try {
        const initialize = await server.request('initialize', INITIALIZE);
        expect(initialize.result).toBeDefined();

        // the redirect is installed by now: the preload writes once the trigger exists
        fs.writeFileSync(trigger, '');
        await vi.waitFor(
          () => {
            for (const sentinel of NOISE_SENTINELS) expect(server.stderr()).toContain(sentinel);
          },
          { timeout: 10_000, interval: 50 }
        );

        server.notify('notifications/initialized');
        const tools = await server.request('tools/list');
        expect(tools.error).toBeUndefined();

        // Phase 4 SC-013: the resource and prompt methods answer in frames too
        const resources = await server.request('resources/list');
        expect(resources.error).toBeUndefined();
        expect(JSON.stringify(resources.result)).toContain('eligian://docs/storyboard');
        const storyboard = await server.request('resources/read', {
          uri: 'eligian://docs/storyboard',
        });
        expect(storyboard.error).toBeUndefined();
        const missing = await server.request('resources/read', { uri: 'eligian://docs/nope' });
        expect(missing.error).toBeDefined();
        const prompt = await server.request('prompts/get', {
          name: 'new-presentation',
          arguments: { idea: 'x' },
        });
        expect(prompt.error).toBeUndefined();

        const check = await server.request('tools/call', {
          name: 'eligian_check',
          arguments: { paths: [NOISE_PROJECT] },
        });
        expect(check.error).toBeUndefined();
        const result = check.result as { content: { text: string }[]; isError?: boolean };
        const text = result.content[0].text;
        const payload = JSON.parse(text);
        expect(result.isError, text).not.toBe(true);
        // the fixture ran through Langium, Typir, the Eligius lint and the review pass
        const codes = (payload.diagnostics as { code: string }[]).map(d => d.code);
        expect(codes).toContain('controller-imbalance');
        expect(codes.some(code => code.startsWith('eligius-'))).toBe(true);

        await server.close();
        await recorded.closed;

        expectOnlyFrames(recorded.stdout());
        for (const sentinel of NOISE_SENTINELS) {
          expect(recorded.stdout()).not.toContain(sentinel);
          expect(server.stderr()).toContain(sentinel);
        }
        const telemetry = server
          .stderr()
          .split('\n')
          .filter(line => line.startsWith('{"t":'))
          .map(line => JSON.parse(line) as { tool: string });
        expect(telemetry.some(line => line.tool === 'eligian_check')).toBe(true);

        // SC-019: a planned red until T055 bumps the CLI version to 1.1.0
        expect(payload.header).toMatch(HEADER);
        expect(text.startsWith('{"header":"eligian 1.1.0 · ')).toBe(true);
      } finally {
        server.child.kill();
      }
    },
    60_000
  );

  // SC-008(5): the smoke child's stdout is read by the tool, never passed through
  test.skipIf(!built)(
    'stdout stays pure NDJSON during an eligian_smoke call (default cliPath)',
    async () => {
      const server = spawnServer({ cwd: SMOKE_PROJECT });
      const recorded = recordStdout(server.child);
      try {
        const initialize = await server.request('initialize', INITIALIZE);
        expect(initialize.result).toBeDefined();
        server.notify('notifications/initialized');

        const smoke = await server.request('tools/call', {
          name: 'eligian_smoke',
          arguments: { paths: [path.join(SMOKE_PROJECT, 'a', 'main.eligian')] },
        });
        expect(smoke.error).toBeUndefined();
        const result = smoke.result as { content: { text: string }[]; isError?: boolean };
        const text = result.content[0].text;
        expect(result.isError, text).not.toBe(true);
        // a timeline came back: the default cliPath (the bundle's bin/cli.js) resolved
        const payload = JSON.parse(text) as { files: { timelines: unknown[] }[] };
        const timelines = payload.files.flatMap(file => file.timelines);
        expect(timelines.length, text).toBeGreaterThanOrEqual(1);

        await server.close();
        await recorded.closed;

        expectOnlyFrames(recorded.stdout());
      } finally {
        server.child.kill();
      }
    },
    60_000
  );

  test.skipIf(!built)(
    'an uncaught exception goes to stderr',
    async () => {
      const trigger = triggerPath();
      const server = spawnServer({
        preload: path.join(FIXTURES, 'crash.mjs'),
        env: { ...process.env, ELIGIAN_NOISE_TRIGGER: trigger },
        cwd: NOISE_PROJECT,
      });
      const recorded = recordStdout(server.child);
      try {
        const initialize = await server.request('initialize', INITIALIZE);
        expect(initialize.result).toBeDefined();

        fs.writeFileSync(trigger, '');
        const exit = await server.exited;
        await recorded.closed;

        expect(exit.code).not.toBeNull();
        expect(exit.code).not.toBe(0);
        expect(server.stderr()).toContain('CRASH-SENTINEL uncaught exception from the preload');
        expect(recorded.stdout()).not.toContain('CRASH-SENTINEL');
        expectOnlyFrames(recorded.stdout());
      } finally {
        server.child.kill();
      }
    },
    60_000
  );

  it('a tool defect is logged to stderr and answered as kind internal', async () => {
    const dyingLock = Layer.succeed(
      CompilerLock,
      CompilerLock.of({ run: () => Effect.die(new Error('LOCK-DEFECT-SENTINEL')) })
    );
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const server = await startInMemoryServer({
      cwd: NOISE_PROJECT,
      docsRoot: path.join(FIXTURES, 'docs-mini'),
      lock: dyingLock,
    });
    try {
      const result = await server.callTool('eligian_check', {
        paths: [path.join(NOISE_PROJECT, 'main.eligian')],
      });

      // (a) a declared failure of kind internal, in FR-005's shape
      const raw = result.raw as { content: { text: string }[] };
      expect(result.isError).toBe(true);
      expect(raw.content[0].text.startsWith('{"header":')).toBe(true);
      expect(result.payload.error.kind).toBe('internal');
      expect(result.payload.error.message).toContain('LOCK-DEFECT-SENTINEL');

      // (b) the recorded stdout holds JSON-RPC frames only
      const frames = server.frames();
      expect(frames.length).toBeGreaterThan(0);
      for (const frame of frames) {
        expect(typeof frame).toBe('object');
        expect((frame as { jsonrpc?: unknown }).jsonrpc).toBe('2.0');
      }

      // (c) the defect reached console.error (stderr), and console.log was never called
      const logged = error.mock.calls
        .map(args => args.map(arg => (arg instanceof Error ? arg.stack : String(arg))).join(' '))
        .join('\n');
      expect(logged).toContain('LOCK-DEFECT-SENTINEL');
      expect(log).not.toHaveBeenCalled();
    } finally {
      await server.close();
      error.mockRestore();
      log.mockRestore();
    }
  });
});
