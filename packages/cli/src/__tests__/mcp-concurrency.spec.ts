/**
 * Spec 058 Phase 1 (FR-009, FR-010; SC-005, SC-022; plan C12): the compiler lock and
 * cancellation, through the in-process server (`startInMemoryServer`).
 *
 * The fixtures (`__fixtures__/mcp/concurrency/`) are copied to a temp dir, the project root
 * of every server here. A: a layout program with a CSS-only id, checked with
 * `selectorNotInLayout: 'ids'`; B: another such program, checked with `'off'`; C: an
 * unformatted file for `eligian_fmt` (`write: false`); D: a second check fixture (SC-022).
 * The docs root is a minimal knowledge dir (no chunks, no overlays): these tests compare
 * results, not overlays.
 *
 * The lock hooks report the server's call id (C12): `'1'`, `'2'`, … per server, in the
 * order the handlers start. SC-022 runs its baselines on a separate server and sends each
 * request only after the previous one's hook fired, so call id `'1'` is JSON-RPC request 1.
 *
 * SC-005's negative control (`CompilerLockPassThrough`) showed no mismatch in 10 consecutive
 * local runs, so it is not a test here (tasks.md T044): it was run once by hand, output in
 * `specs/058-mcp-server/phase-1-mvp-server/baseline/sc005-negative-control.txt`. The overlap
 * metric (`calls wait on the lock`) stays mandatory.
 *
 * Spec 058 Phase 2 (SC-017): `eligian_check` (A), `eligian_compile` (B) and `eligian_project`
 * (D) fired at once, 20 iterations, on a server of their own. The call ids are paired with the
 * tools exactly (`pairedRecorder`), so the overlap metric is read per tool.
 *
 * Spec 058 Phase 3 (FR-062; SC-015(3), (5); plan C3): results are equal across a recycle of
 * the Langium services (a lock built with a small `recycleAfter`), compared without headers
 * and without ids (`withoutIds`).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Layer } from 'effect';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  type CompilerLock,
  type CompilerLockHooks,
  compilerLockLayer,
} from '../mcp/compiler-lock.js';
import { withoutIds } from '../mcp/config-fragment.js';
import { NAME as CHECK } from '../mcp/tools/check.js';
import { NAME as COMPILE } from '../mcp/tools/compile.js';
import { NAME as FMT } from '../mcp/tools/fmt.js';
import { NAME as OPERATIONS } from '../mcp/tools/operations.js';
import { NAME as PROJECT } from '../mcp/tools/project.js';
import {
  type InMemoryServer,
  type JsonRpcResponse,
  startInMemoryServer,
} from './mcp-test-client.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(HERE, '__fixtures__', 'mcp', 'concurrency');
const ITERATIONS = 20;

const CALL_A = { paths: ['a-layout/main.eligian'], selectorNotInLayout: 'ids' };
const CALL_B = { paths: ['b-plain/main.eligian'], selectorNotInLayout: 'off' };
const CALL_C = { paths: ['c-fmt/unformatted.eligian'], write: false };
const CALL_D = { paths: ['d-other/main.eligian'] };
/** SC-017: the compile and project calls, on fixtures other than check's A */
const CALL_COMPILE = { path: 'b-plain/main.eligian', response_format: 'detailed' };
const CALL_PROJECT = { path: 'd-other/main.eligian', response_format: 'detailed' };
/** FR-062: a compile call with `select` and the map */
const CALL_COMPILE_MAP = {
  path: 'b-plain/main.eligian',
  select: { timeline: 'other' },
  includeMap: true,
  response_format: 'detailed',
};

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

interface LockEvent {
  readonly kind: 'queued' | 'acquire' | 'release' | 'recycle';
  /** The call id; for a recycle, the completed section count */
  readonly id: string;
  readonly at: number;
  readonly completed?: boolean;
}

/** Hooks that record every event; `until` resolves once the events satisfy a predicate. */
function recorder(latch?: (requestId: string) => Promise<void>) {
  const events: LockEvent[] = [];
  const waiting: { test: (events: readonly LockEvent[]) => boolean; resolve: () => void }[] = [];
  const fire = (event: LockEvent) => {
    events.push(event);
    for (const waiter of [...waiting]) {
      if (waiter.test(events)) {
        waiting.splice(waiting.indexOf(waiter), 1);
        waiter.resolve();
      }
    }
  };
  const hooks: CompilerLockHooks = {
    onQueued: (id, at) => fire({ kind: 'queued', id, at }),
    onAcquire: (id, at) => fire({ kind: 'acquire', id, at }),
    onRelease: (id, at, completed) => fire({ kind: 'release', id, at, completed }),
    onRecycle: async count => fire({ kind: 'recycle', id: String(count), at: performance.now() }),
    ...(latch === undefined ? {} : { latch }),
  };
  const until = (test: (events: readonly LockEvent[]) => boolean): Promise<void> =>
    test(events)
      ? Promise.resolve()
      : new Promise<void>(resolve => {
          waiting.push({ test, resolve });
        });
  const of = (kind: LockEvent['kind'], id?: string) =>
    events.filter(event => event.kind === kind && (id === undefined || event.id === id));
  return {
    events,
    hooks,
    of,
    until,
    when: (kind: LockEvent['kind'], id: string) =>
      until(all => all.some(event => event.kind === kind && event.id === id)),
  };
}

/** A promise released by hand. */
function gate() {
  let open = () => {};
  const promise = new Promise<void>(resolve => {
    open = resolve;
  });
  return { promise, open: () => open() };
}

/**
 * A recorder that pairs every call id with its tool (SC-017). `callTool` sees no call id (C12),
 * so the latch, run right after each acquire, waits until every call whose section released
 * has answered. Between two acquires exactly one section releases and exactly one call answers
 * (a call answers only after its one section released), so the k-th release is the k-th
 * answer. Each call here runs one section; the test asserts that.
 */
function pairedRecorder() {
  const answered: string[] = [];
  const waiting: { count: number; resolve: () => void }[] = [];
  const rec = recorder(() => {
    const released = rec.of('release').length;
    return answered.length >= released
      ? Promise.resolve()
      : new Promise<void>(resolve => {
          waiting.push({ count: released, resolve });
        });
  });
  const answer = (tool: string) => {
    answered.push(tool);
    for (const waiter of [...waiting]) {
      if (answered.length >= waiter.count) {
        waiting.splice(waiting.indexOf(waiter), 1);
        waiter.resolve();
      }
    }
  };
  /** Call id → tool, by release order = answer order. */
  const toolOf = (): ReadonlyMap<string, string> =>
    new Map(rec.of('release').map((release, k) => [release.id, answered[k]]));
  return { ...rec, answer, answered: answered as readonly string[], toolOf };
}

/** The acquire / release interval of every call that released. */
const intervals = (events: readonly LockEvent[]) =>
  events
    .filter(event => event.kind === 'release')
    .map(release => ({
      id: release.id,
      start: events.find(event => event.kind === 'acquire' && event.id === release.id)!.at,
      end: release.at,
    }));

/**
 * In how many cases a call's `onQueued` lies inside another call's acquire / release interval;
 * `only` restricts the queued calls counted.
 */
const waitsOnTheLock = (events: readonly LockEvent[], only?: (id: string) => boolean): number => {
  const held = intervals(events);
  return events
    .filter(event => event.kind === 'queued' && (only === undefined || only(event.id)))
    .filter(queued =>
      held.some(other => other.id !== queued.id && other.start < queued.at && queued.at < other.end)
    ).length;
};

/** The payload without its header (SC-005 compares results, not headers). */
const withoutHeader = (payload: unknown): unknown => {
  const { header: _header, ...rest } = payload as { header: string };
  return rest;
};

/** The parsed payload of a `tools/call` response. */
const payloadOf = (response: JsonRpcResponse): unknown => {
  const result = response.result as { content: { text: string }[] };
  return JSON.parse(result.content[0].text);
};

const framesWithId = (server: InMemoryServer, id: number): unknown[] =>
  server
    .frames()
    .filter(
      frame => typeof frame === 'object' && frame !== null && 'id' in frame && frame.id === id
    );

let project: string;
let docsRoot: string;

beforeAll(() => {
  project = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-mcp-concurrency-')));
  fs.cpSync(FIXTURES, project, { recursive: true });
  docsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-mcp-concurrency-docs-'));
  fs.writeFileSync(path.join(docsRoot, 'index.json'), '[]');
  fs.writeFileSync(path.join(docsRoot, 'overlays.json'), '{"byCode":{},"bySource":{}}');
});

afterAll(() => {
  fs.rmSync(project, { recursive: true, force: true });
  fs.rmSync(docsRoot, { recursive: true, force: true });
});

const servers: InMemoryServer[] = [];

const start = async (lock?: Layer.Layer<CompilerLock>): Promise<InMemoryServer> => {
  const server = await startInMemoryServer({
    cwd: project,
    docsRoot,
    ...(lock === undefined ? {} : { lock }),
  });
  servers.push(server);
  return server;
};

afterEach(async () => {
  for (const server of servers.splice(0)) await server.close();
});

interface IterationRun {
  readonly baselines: readonly unknown[];
  readonly iterations: readonly (readonly unknown[])[];
  readonly mismatches: readonly string[];
}

/**
 * Sequential baselines of the calls first (default: A, B and the fmt call), then `ITERATIONS`
 * times the calls at once, on one server with `lock`. A call that fails counts as a mismatch.
 * `answered` hears every call's tool as it answers (SC-017's pairing).
 */
async function runIterations(
  lock: Layer.Layer<CompilerLock>,
  calls: readonly (readonly [string, unknown])[] = [
    [CHECK, CALL_A],
    [CHECK, CALL_B],
    [FMT, CALL_C],
  ],
  answered: (tool: string) => void = () => {}
): Promise<IterationRun> {
  const server = await start(lock);
  const call = ([name, args]: readonly [string, unknown]): Promise<unknown> =>
    server
      .callTool(name, args)
      .then(
        result => (result.isError ? { isError: result.payload } : withoutHeader(result.payload)),
        (error: unknown) => ({ rejected: String(error) })
      )
      .finally(() => answered(name));

  const baselines: unknown[] = [];
  for (const each of calls) baselines.push(await call(each));

  const iterations: unknown[][] = [];
  const mismatches: string[] = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const results = await Promise.all(calls.map(call));
    iterations.push(results);
    results.forEach((result, n) => {
      if (JSON.stringify(result) !== JSON.stringify(baselines[n])) {
        mismatches.push(`iteration ${i}, call ${n} (${calls[n][0]})`);
      }
    });
  }
  return { baselines, iterations, mismatches };
}

describe('the compiler lock', () => {
  const locked = recorder();
  let lockedRun: Promise<IterationRun> | undefined;
  /** The 20 locked iterations, run once for the two tests that read them. */
  const lockedIterations = () => {
    lockedRun ??= runIterations(compilerLockLayer(locked.hooks));
    return lockedRun;
  };

  it('concurrent checks equal sequential ones (20 iterations)', async () => {
    const run = await lockedIterations();

    // the baselines are what SC-005 says they are
    const [a, b, c] = run.baselines as {
      diagnostics?: { code: string }[];
      files?: { formatted: boolean }[];
    }[];
    expect(a.diagnostics!.map(d => d.code)).toContain('selector_not_in_layout');
    expect(b.diagnostics!.map(d => d.code)).not.toContain('selector_not_in_layout');
    expect(c.files!.map(f => f.formatted)).toEqual([false]);

    expect(run.iterations).toHaveLength(ITERATIONS);
    expect(run.mismatches).toEqual([]);
    for (const results of run.iterations) expect(results).toEqual(run.baselines);
  }, 180_000);

  it('calls wait on the lock', async () => {
    await lockedIterations();

    expect(waitsOnTheLock(locked.events)).toBeGreaterThanOrEqual(1);
    // and no two sections ever overlapped
    const held = intervals(locked.events).sort((x, y) => x.start - y.start);
    for (let i = 1; i < held.length; i++) {
      expect(held[i].start).toBeGreaterThanOrEqual(held[i - 1].end);
    }
  }, 180_000);

  const paired = pairedRecorder();
  let pairedRun: Promise<IterationRun> | undefined;
  /** SC-017: the 20 iterations of check, compile and project, run once for the two tests. */
  const pairedIterations = () => {
    pairedRun ??= runIterations(
      compilerLockLayer(paired.hooks),
      [
        [CHECK, CALL_A],
        [COMPILE, CALL_COMPILE],
        [PROJECT, CALL_PROJECT],
      ],
      paired.answer
    );
    return pairedRun;
  };

  it('check, compile and project at once equal sequential (20 iterations)', async () => {
    const run = await pairedIterations();

    // the baselines are real results, not failures
    const [checked, compiled, inspected] = run.baselines as {
      diagnostics?: { code: string }[];
      ok?: boolean;
      summary?: unknown;
      programs?: unknown[];
    }[];
    expect(checked.diagnostics!.map(d => d.code)).toContain('selector_not_in_layout');
    expect(compiled.ok).toBe(true);
    expect(compiled.summary).toBeDefined();
    expect(inspected.programs).toHaveLength(1);

    expect(run.iterations).toHaveLength(ITERATIONS);
    expect(run.mismatches).toEqual([]);
    for (const results of run.iterations) expect(results).toEqual(run.baselines);
  }, 180_000);

  it('compile and project wait on the lock', async () => {
    await pairedIterations();

    // one section per call, every call paired with its tool
    const calls = (1 + ITERATIONS) * 3;
    expect(paired.of('queued')).toHaveLength(calls);
    expect(new Set(paired.of('acquire').map(event => event.id)).size).toBe(calls);
    expect(paired.of('release')).toHaveLength(calls);
    expect(paired.answered).toHaveLength(calls);
    const toolOf = paired.toolOf();
    const callsOf = (tool: string) => [...toolOf.values()].filter(each => each === tool);
    expect(callsOf(CHECK)).toHaveLength(1 + ITERATIONS);
    expect(callsOf(COMPILE)).toHaveLength(1 + ITERATIONS);
    expect(callsOf(PROJECT)).toHaveLength(1 + ITERATIONS);

    const waits = (tool: string) => waitsOnTheLock(paired.events, id => toolOf.get(id) === tool);
    expect(waits(COMPILE)).toBeGreaterThanOrEqual(1);
    expect(waits(PROJECT)).toBeGreaterThanOrEqual(1);
    // and no two sections ever overlapped
    const held = intervals(paired.events).sort((x, y) => x.start - y.start);
    for (let i = 1; i < held.length; i++) {
      expect(held[i].start).toBeGreaterThanOrEqual(held[i - 1].end);
    }
  }, 180_000);

  it('the three locked tools share one lock', async () => {
    const hold = gate();
    let first: string | undefined;
    const rec = recorder(id => {
      if (first !== undefined) return Promise.resolve();
      first = id;
      return hold.promise;
    });
    const server = await start(compilerLockLayer(rec.hooks));

    const answers = Promise.all([
      server.callTool(CHECK, CALL_A),
      server.callTool(FMT, CALL_C),
      server.callTool(OPERATIONS, { names: ['addClass'], path: 'a-layout/main.eligian' }),
    ]);
    await rec.until(events => events.filter(event => event.kind === 'queued').length === 3);
    // give a second permit holder the chance to show up, if there were one
    await sleep(200);

    expect(rec.of('acquire').map(event => event.id)).toEqual([first]);
    const others = rec.of('queued').filter(event => event.id !== first);
    expect(others).toHaveLength(2);

    hold.open();
    const results = await answers;

    expect(results.map(result => result.isError)).toEqual([false, false, false]);
    const held = intervals(rec.events);
    expect(held).toHaveLength(3);
    for (const other of others) {
      const acquired = rec.of('acquire', other.id)[0];
      expect(acquired.at).toBeGreaterThanOrEqual(rec.of('release', first)[0].at);
    }
    for (const x of held) {
      for (const y of held) {
        if (x.id === y.id) continue;
        expect(x.end <= y.start || y.end <= x.start).toBe(true);
      }
    }
  }, 60_000);
});

describe('recycling', () => {
  /** A successful call's payload without its header and ids. */
  const comparable = async (
    server: InMemoryServer,
    [name, args]: readonly [string, unknown]
  ): Promise<unknown> => {
    const result = await server.callTool(name, args);
    expect(result.isError, JSON.stringify(result.payload)).toBe(false);
    return withoutIds(withoutHeader(result.payload));
  };

  /** Where `event` sits in `events`. */
  const indexOf = (events: readonly LockEvent[], kind: LockEvent['kind'], id: string): number =>
    events.findIndex(event => event.kind === kind && event.id === id);

  it('results are equal across a recycle', async () => {
    const rec = recorder();
    const server = await start(compilerLockLayer(rec.hooks, { recycleAfter: 3 }));
    const calls: readonly (readonly [string, unknown])[] = [
      [CHECK, CALL_A],
      [COMPILE, CALL_COMPILE_MAP],
      [PROJECT, CALL_PROJECT],
    ];

    // sections 1–3 on one service set, the recycle after section 3, sections 4–6 on a fresh set
    const before: unknown[] = [];
    for (const each of calls) before.push(await comparable(server, each));
    expect(rec.of('recycle').map(event => event.id)).toEqual(['3']);
    const after: unknown[] = [];
    for (const each of calls) after.push(await comparable(server, each));
    expect(rec.of('recycle').map(event => event.id)).toEqual(['3', '6']);

    // the results are real ones
    const [checked, compiled, inspected] = before as {
      diagnostics?: { code: string }[];
      ok?: boolean;
      fragment?: unknown;
      map?: unknown;
      programs?: unknown[];
    }[];
    expect(checked.diagnostics!.map(d => d.code)).toContain('selector_not_in_layout');
    expect(compiled.ok).toBe(true);
    expect(compiled.fragment).toBeDefined();
    expect(compiled.map).toBeDefined();
    expect(inspected.programs).toHaveLength(1);

    expect(after).toEqual(before);
  }, 60_000);

  it('two concurrent calls straddling the recycle equal their sequential baselines', async () => {
    const pair: readonly (readonly [string, unknown])[] = [
      [CHECK, CALL_A],
      [COMPILE, CALL_COMPILE_MAP],
    ];
    // the baselines on a server of their own (default lock, no recycle in reach)
    const baselineServer = await start();
    const baselines: unknown[] = [];
    for (const each of pair) baselines.push(await comparable(baselineServer, each));

    // after the first, every section waits until all three calls queued: the pair is in flight
    // together
    const rec: ReturnType<typeof recorder> = recorder(() =>
      rec.of('acquire').length === 1
        ? Promise.resolve()
        : rec.until(events => events.filter(event => event.kind === 'queued').length >= 3)
    );
    const server = await start(compilerLockLayer(rec.hooks, { recycleAfter: 2 }));
    // section 1; the pair then runs sections 2 and 3, with the recycle between them
    await comparable(server, [CHECK, CALL_D]);
    const results = await Promise.all(pair.map(each => comparable(server, each)));

    const recycles = rec.of('recycle');
    expect(recycles.map(event => event.id)).toEqual(['2']);
    const [, second, third] = rec.of('acquire');
    const recycleAt = indexOf(rec.events, 'recycle', '2');
    expect(indexOf(rec.events, 'acquire', second!.id)).toBeLessThan(recycleAt);
    expect(recycleAt).toBeLessThan(indexOf(rec.events, 'acquire', third!.id));
    // the two calls were in flight together: the second queued before the first released
    expect(indexOf(rec.events, 'queued', third!.id)).toBeLessThan(
      indexOf(rec.events, 'release', second!.id)
    );

    expect(results).toEqual(baselines);
  }, 60_000);
});

describe('cancellation', () => {
  let baselineD: unknown;

  /** `initialize` with an id that is not 1 or 2, so the tool calls get those. */
  const initialize = async (server: InMemoryServer): Promise<void> => {
    const response = await server.request(
      'initialize',
      {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'mcp-concurrency', version: '0' },
      },
      1000
    );
    expect(response.error).toBeUndefined();
    await server.notify('notifications/initialized');
  };

  const callCheck = (server: InMemoryServer, args: unknown, id: number) =>
    server.request('tools/call', { name: CHECK, arguments: args }, id);

  beforeAll(async () => {
    // on a separate server, so the server under test numbers its calls from '1' (C12)
    const server = await startInMemoryServer({ cwd: project, docsRoot });
    try {
      const result = await server.callTool(CHECK, CALL_D);
      expect(result.isError).toBe(false);
      baselineD = result.payload;
    } finally {
      await server.close();
    }
  }, 60_000);

  it('a cancelled running check sends no response and the next waits until it settled', async () => {
    const hold = gate();
    const rec = recorder(id => (id === '1' ? hold.promise : Promise.resolve()));
    const server = await start(compilerLockLayer(rec.hooks));
    await initialize(server);

    void callCheck(server, CALL_A, 1);
    await rec.when('acquire', '1');
    await server.notify('notifications/cancelled', { requestId: 1 });
    const second = callCheck(server, CALL_D, 2);
    await rec.when('queued', '2');
    hold.open();
    const response = await second;
    await sleep(2000);

    // (a) no response for request 1
    expect(framesWithId(server, 1)).toEqual([]);
    // (b) request 1's section completed before request 2's began
    const released = rec.of('release', '1');
    expect(released).toHaveLength(1);
    expect(released[0].completed).toBe(true);
    expect(rec.of('acquire', '2')[0].at).toBeGreaterThanOrEqual(released[0].at);
    // (c) request 2 equals its sequential baseline
    expect(payloadOf(response)).toEqual(baselineD);
  }, 60_000);

  it('a cancelled queued check never runs', async () => {
    const hold = gate();
    const rec = recorder(id => (id === '1' ? hold.promise : Promise.resolve()));
    const server = await start(compilerLockLayer(rec.hooks));
    await initialize(server);

    const first = callCheck(server, CALL_A, 1);
    await rec.when('acquire', '1');
    void callCheck(server, CALL_D, 2);
    await rec.when('queued', '2');
    await server.notify('notifications/cancelled', { requestId: 2 });
    // a later request is answered only after the cancellation was read
    await server.request('ping', undefined, 3);
    hold.open();
    const response = await first;
    await sleep(2000);

    expect(response.error).toBeUndefined();
    expect((response.result as { isError?: boolean }).isError).not.toBe(true);
    expect(rec.of('acquire', '2')).toEqual([]);
    expect(framesWithId(server, 2)).toEqual([]);
  }, 60_000);
});
