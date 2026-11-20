/**
 * Spec 058 Phase 2 (FR-040–FR-046, FR-002, FR-005; SC-008 (1)–(4), (6)–(9)): `eligian_smoke`,
 * the handler tested directly (tasks.md D3; the wire cases are T028's). The tool never plays in
 * the server process: it spawns `bin/cli.js smoke … --format ndjson` (the built bundle, so
 * `requireFreshBundle()` first) or, for the stderr and exit-code cases, a stub that stands in for
 * it. `onSpawn` hands the spec each child's pid and temp scenario file, so it can check that both
 * are gone once the call settles.
 */
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { getCompilerVersion } from '@eligian/language';
import { Effect, Fiber } from 'effect';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { makeRecordStore } from '../mcp/brief/known-programs.js';
import type { EffectAi } from '../mcp/paths.js';
import {
  DESCRIPTION,
  handle,
  KEYWORDS,
  NAME,
  type Parameters,
  type SmokeToolOptions,
  summarizeArgs,
  type ToolContext,
} from '../mcp/tools/smoke.js';
import { requireFreshBundle } from './fresh-bundle.js';
import { startInMemoryServer } from './mcp-test-client.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.resolve(HERE, '..', '..', 'bin', 'cli.js');
const MCP_FIXTURES = path.join(HERE, '__fixtures__', 'mcp');
const ROOT = path.join(MCP_FIXTURES, 'smoke-tool');
const STUB = path.join(ROOT, 'stub-cli.mjs');
const DOCS = path.join(MCP_FIXTURES, 'docs-mini');
const NEVER_REMOVED = path.join(MCP_FIXTURES, 'determinism', 'never-removed');

type Params = typeof Parameters.Type;
type Result = Effect.Success<ReturnType<typeof handle>>;

interface Spawned {
  readonly pid: number;
  readonly scenarioFile?: string;
}

/** `process.kill(pid, 0)` throws ESRCH: the child is gone. */
const expectDead = (pid: number) =>
  expect(() => process.kill(pid, 0)).toThrow(expect.objectContaining({ code: 'ESRCH' }));

/** A spawn recorder for `onSpawn`. */
const recorder = () => {
  const spawned: Spawned[] = [];
  let notify: ((value: Spawned) => void) | undefined;
  const first = new Promise<Spawned>(resolve => {
    notify = resolve;
  });
  const onSpawn = (pid: number, scenarioFile?: string) => {
    const value = { pid, ...(scenarioFile === undefined ? {} : { scenarioFile }) };
    spawned.push(value);
    notify?.(value);
  };
  return { spawned, first, onSpawn };
};

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/** The result without `header` (parallel calls are compared with their baselines). */
const withoutHeader = ({ header: _header, ...rest }: Result) => rest;

describe('eligian_smoke', () => {
  let ai: EffectAi;
  let stateDir: string;
  const versions = getCompilerVersion();

  beforeAll(async () => {
    requireFreshBundle();
    ai = await import('effect/ai');
    stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-mcp-smoke-state-'));
  });

  afterAll(() => {
    fs.rmSync(stateDir, { recursive: true, force: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const context = (smoke: SmokeToolOptions = {}): ToolContext => ({
    ai,
    cwd: ROOT,
    docsRoot: DOCS,
    versions,
    requestId: '1',
    smoke: { cliPath: BIN, ...smoke },
    // Spec 059 FR-058 move (1): the fixture programs exist before the first call scans the dir.
    gate: { record: makeRecordStore(), stateDir, noteBrief: () => {} },
  });

  const run = (params: Params, smoke?: SmokeToolOptions) =>
    Effect.runPromise(handle(params, context(smoke)));

  const fail = (params: Params, smoke?: SmokeToolOptions) =>
    Effect.runPromise(Effect.flip(handle(params, context(smoke))));

  it('matches the CLI json', async () => {
    const result = await run({ paths: ['a/main.eligian'] });

    const cli = await new Promise<string>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [BIN, 'smoke', 'a/main.eligian', '--strict', '--format', 'json'],
        { cwd: ROOT }
      );
      let stdout = '';
      child.stdout.setEncoding('utf-8');
      child.stdout.on('data', (chunk: string) => {
        stdout += chunk;
      });
      child.on('error', reject);
      child.on('close', () => resolve(stdout));
    });
    const [file] = JSON.parse(cli) as {
      timelines: { name: string; boundaries: number }[];
      problems: { code: string; message: string; location?: { line: number } }[];
    }[];

    expect(file.problems.length).toBeGreaterThan(0);
    expect(result.problems.map(p => ({ code: p.code, line: p.line, message: p.message }))).toEqual(
      file.problems.map(p => ({ code: p.code, line: p.location?.line ?? 1, message: p.message }))
    );
    expect(result.problems.every(p => p.source === 'smoke')).toBe(true);
    expect(result.files).toEqual([
      { file: path.join(ROOT, 'a', 'main.eligian'), timelines: file.timelines },
    ]);
    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty('partial');
    expect(result.header).toBe(
      `eligian ${versions.compiler} · eligius ${versions.eligius} · eligian_smoke · ${path.join(ROOT, 'a', 'main.eligian')}`
    );
  }, 60_000);

  it('timeoutMs 10000 → partial within 20 s, ≥ 1 timeline', async () => {
    const started = Date.now();
    // SC-008(2) ruling 2026-11-05: the first timeline line arrives 1.6–2.6 s after spawn
    // (compile, jsdom, engine), so 1000 ms can never hold a timeline; under the full suite's
    // load it arrives after 5 s (T053 ruling), so 10000 leaves headroom there too. The walk
    // alone ends well within 10 s, so a scenario of two waits (each under the 10 s step
    // timeout) keeps the child busy until the kill, whatever the load. The bound is twice the
    // timeout: under the full suite's load the spawn, the kill and the settle took 5 s more
    const result = await run({
      paths: ['long/main.eligian'],
      scenario: [{ wait: 9000 }, { wait: 9000 }],
      timeoutMs: 10_000,
    });
    expect(Date.now() - started).toBeLessThan(20_000);
    expect(result.ok).toBe(false);
    expect(result.partial).toBe(true);
    expect(result.problems.filter(p => p.code === 'smoke-timeout')).toEqual([
      expect.objectContaining({
        code: 'smoke-timeout',
        severity: 'error',
        file: path.join(ROOT, 'long', 'main.eligian'),
        line: 1,
        column: 1,
      }),
    ]);
    expect(result.files.flatMap(f => f.timelines).length).toBeGreaterThanOrEqual(1);
  }, 60_000);

  it('interrupting the handle kills the child', async () => {
    const spawns = recorder();
    const fiber = Effect.runFork(
      handle({ paths: ['long/main.eligian'] }, context({ onSpawn: spawns.onSpawn }))
    );
    const { pid } = await spawns.first;
    await Effect.runPromise(Fiber.interrupt(fiber));
    expectDead(pid);
  }, 60_000);

  it('wire cancel: notifications/cancelled kills the child, no frame for that id within 2 s', async () => {
    const spawns = recorder();
    const server = await startInMemoryServer({
      cwd: ROOT,
      docsRoot: DOCS,
      smoke: { cliPath: BIN, onSpawn: spawns.onSpawn },
    });
    try {
      const initialized = await server.request(
        'initialize',
        {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 'mcp-smoke.spec', version: '0' },
        },
        1
      );
      expect(initialized.error).toBeUndefined();
      await server.notify('notifications/initialized');

      void server.request(
        'tools/call',
        { name: NAME, arguments: { paths: ['long/main.eligian'] } },
        2
      );
      const { pid } = await spawns.first;
      await server.notify('notifications/cancelled', { requestId: 2 });
      await sleep(2000);

      const framesForCall = server
        .frames()
        .filter(
          frame => typeof frame === 'object' && frame !== null && 'id' in frame && frame.id === 2
        );
      expect(framesForCall).toEqual([]);
      expect(spawns.spawned).toHaveLength(1);
      expectDead(pid);
    } finally {
      await server.close();
    }
  }, 60_000);

  it('temp file gone and pid dead in 4 cases', async () => {
    const scenario = [{ wait: 10 }];
    const cases: [string, Params, 'success' | 'interrupt'][] = [
      ['success', { paths: ['b/main.eligian'], scenario }, 'success'],
      ['child exit 1', { paths: ['a/main.eligian'], scenario }, 'success'],
      ['timeout', { paths: ['long/main.eligian'], scenario, timeoutMs: 1000 }, 'success'],
      ['interruption', { paths: ['long/main.eligian'], scenario }, 'interrupt'],
    ];
    for (const [name, params, how] of cases) {
      const spawns = recorder();
      if (how === 'interrupt') {
        const fiber = Effect.runFork(handle(params, context({ onSpawn: spawns.onSpawn })));
        await spawns.first;
        await Effect.runPromise(Fiber.interrupt(fiber));
      } else {
        const result = await run(params, { onSpawn: spawns.onSpawn });
        if (name === 'success') expect(result.ok, name).toBe(true);
        if (name === 'child exit 1') expect(result.ok, name).toBe(false);
        if (name === 'timeout') expect(result.partial, name).toBe(true);
      }
      expect(spawns.spawned, name).toHaveLength(1);
      const [{ pid, scenarioFile }] = spawns.spawned;
      expect(scenarioFile, name).toBeDefined();
      expect(fs.existsSync(scenarioFile!), name).toBe(false);
      expectDead(pid);
    }
  }, 120_000);

  it('concise vs detailed steps', async () => {
    // The step positions of the two runs must be equal (FR-005), so the last step is a snapshot
    // (no macrotask after the seek's): a `wait` lets the playing timeline's 100 ms ticks advance
    // by the wall clock, and 50 ms (+ the 5 ms settle) sat on the rounding edge of one tick
    const params: Params = {
      paths: ['removal/main.eligian'],
      scenario: [{ snapshot: 'start' }, { seek: 1.5 }, { snapshot: 'after' }],
    };
    const concise = await run(params);
    const detailed = await run({ ...params, response_format: 'detailed' });

    // Every top-level key but steps: concise ⊆ detailed
    for (const [key, value] of Object.entries(concise)) {
      if (key === 'header' || key === 'steps') continue;
      expect(detailed[key as keyof Result], key).toEqual(value);
    }
    expect(concise.steps).toHaveLength(3);
    expect(detailed.steps).toHaveLength(3);
    concise.steps.forEach((step, i) => {
      const full = detailed.steps[i];
      const { snapshot: _a, ...fields } = step;
      const { snapshot: _b, ...fullFields } = full;
      expect(fields, `step ${i}`).toEqual(fullFields);
      for (const [key, value] of Object.entries(step.snapshot)) {
        expect(value, `step ${i} ${key}`).toEqual(full.snapshot[key]);
      }
      if (i === 0) {
        expect(Object.keys(step.snapshot).sort()).toEqual(Object.keys(full.snapshot).sort());
        return;
      }
      for (const key of Object.keys(full.snapshot)) {
        if (key in step.snapshot) continue;
        expect(full.snapshot[key], `step ${i} ${key}`).toEqual(detailed.steps[i - 1].snapshot[key]);
      }
      expect(step.snapshot).toHaveProperty('activeTimelineActions');
    });

    // The removed element is a change: concise step 1 carries it, with exists false
    expect(concise.steps[1].snapshot.gone).toEqual(expect.objectContaining({ exists: false }));
    expect(concise.steps[1].snapshot).not.toHaveProperty('keep');
    expect(concise.steps[2].snapshot).not.toHaveProperty('gone');
    expect(
      isDeepStrictEqual(detailed.steps[0].snapshot.gone, detailed.steps[1].snapshot.gone)
    ).toBe(false);
  }, 60_000);

  it('parallel calls: two pids, results equal baselines', async () => {
    const baselineA = await run({ paths: ['a/main.eligian'] });
    const baselineB = await run({ paths: ['b/main.eligian'] });

    const spawns = recorder();
    const [a, b] = await Promise.all([
      run({ paths: ['a/main.eligian'] }, { onSpawn: spawns.onSpawn }),
      run({ paths: ['b/main.eligian'] }, { onSpawn: spawns.onSpawn }),
    ]);
    expect(spawns.spawned).toHaveLength(2);
    expect(spawns.spawned[0].pid).not.toBe(spawns.spawned[1].pid);
    expect(withoutHeader(a)).toEqual(withoutHeader(baselineA));
    expect(withoutHeader(b)).toEqual(withoutHeader(baselineB));
  }, 120_000);

  it('child stderr prefixed', async () => {
    const writes: string[] = [];
    vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: string | Uint8Array) => {
      writes.push(String(chunk));
      return true;
    }) as typeof process.stderr.write);
    const result = await run({ paths: ['b/main.eligian'] }, { cliPath: STUB });

    // Every write that carries a child line is exactly `smoke: <line>`
    const childLines = writes.filter(
      text => text.includes('stub stderr') || text.includes('this line is not json')
    );
    expect(childLines.map(text => text.trimEnd()).sort()).toEqual([
      'smoke: stub stderr one',
      'smoke: stub stderr two',
      'smoke: this line is not json',
    ]);
    const text = JSON.stringify(result);
    expect(text).not.toContain('stub stderr');
    expect(text).not.toContain('this line is not json');
    expect(result.ok).toBe(true);
    expect(result.files).toEqual([
      {
        file: path.join(ROOT, 'b', 'main.eligian'),
        timelines: [{ name: 'B1', boundaries: 2 }],
      },
    ]);
  }, 60_000);

  it('assertions without scenario: io, no spawn', async () => {
    const spawns = recorder();
    const error = await fail(
      { paths: ['b/main.eligian'], assertions: [{ after: 0, timeline: 'B1' }] },
      { onSpawn: spawns.onSpawn }
    );
    expect(error._tag).toBe('ToolIoError');
    expect(error.message).toContain('assertions need a scenario');
    expect(spawns.spawned).toEqual([]);
  });

  it('scenario with two programs: io naming the files, onSpawn never called', async () => {
    const spawns = recorder();
    const error = await fail(
      { paths: ['a/main.eligian', 'b/main.eligian'], scenario: [{ wait: 10 }] },
      { onSpawn: spawns.onSpawn }
    );
    expect(error._tag).toBe('ToolIoError');
    expect(error.message).toContain(path.join(ROOT, 'a', 'main.eligian'));
    expect(error.message).toContain(path.join(ROOT, 'b', 'main.eligian'));
    expect(spawns.spawned).toEqual([]);
  });

  it('string scenario: missing file → not-found; invalid → io', async () => {
    const spawns = recorder();
    const missing = await fail(
      { paths: ['b/main.eligian'], scenario: 'no-such-scenario.json' },
      { onSpawn: spawns.onSpawn }
    );
    expect(missing._tag).toBe('ToolNotFound');
    const invalid = await fail(
      { paths: ['b/main.eligian'], scenario: 'invalid-scenario.json' },
      { onSpawn: spawns.onSpawn }
    );
    expect(invalid._tag).toBe('ToolIoError');
    expect(invalid.message).toContain('scenario');
    expect(spawns.spawned).toEqual([]);
  });

  it('child exit 2 → io with the child stderr', async () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(
      (() => true) as typeof process.stderr.write
    );
    const error = await fail(
      { paths: ['b/main.eligian'], timelines: ['__exit2__'] },
      { cliPath: STUB }
    );
    expect(error._tag).toBe('ToolIoError');
    expect(error.message).toContain('eligian smoke: stub usage error');
  });

  it('determinism:true reaches the child', async () => {
    // FR-034 / SC-009(6): the flag goes to the child as `--determinism`; the fixture's range adds
    // a class its end block never removes, so a straight seek past it differs from linear play
    const nondeterministic = (result: Result) =>
      result.problems.filter(p => p.code === 'position-nondeterministic');
    const params: Params = { paths: ['main.eligian'] };
    const inFixture: ToolContext = { ...context(), cwd: NEVER_REMOVED };
    const withFlag = await Effect.runPromise(handle({ ...params, determinism: true }, inFixture));
    const without = await Effect.runPromise(handle(params, inFixture));
    expect(nondeterministic(withFlag)).toHaveLength(1);
    expect(nondeterministic(without)).toEqual([]);
  }, 120_000);

  it('summarizeArgs records determinism', () => {
    expect(summarizeArgs({ paths: ['main.eligian'], determinism: true })).toEqual(
      expect.objectContaining({ determinism: true })
    );
  });

  it('description carries the security note and the paths/timelines advice', () => {
    expect(DESCRIPTION.length).toBeLessThanOrEqual(16_384);
    for (const keyword of KEYWORDS) {
      expect(DESCRIPTION.slice(0, 200).toLowerCase(), keyword).toContain(keyword.toLowerCase());
    }
    expect(DESCRIPTION).toContain('host.ts');
    expect(DESCRIPTION).toMatch(/user code/i);
    expect(DESCRIPTION).toMatch(/only inside the smoke child/i);
    expect(DESCRIPTION).toContain('`paths`');
    expect(DESCRIPTION).toContain('`timelines`');
  });
});
