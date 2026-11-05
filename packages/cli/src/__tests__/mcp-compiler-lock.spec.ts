/**
 * Spec 058 Phase 1 (FR-009, FR-010, FR-053; plan C2-lock): the `CompilerLock` serialises
 * the sections that touch the shared Langium services. Waiting for the permit stays
 * interruptible (a cancelled queued call leaves the queue); an acquired section runs to
 * the end. The hooks and the latch are the test seam; `CompilerLockPassThrough` is the
 * SC-005 negative control.
 */
import { Effect, Exit, Fiber } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  CompilerLock,
  type CompilerLockHooks,
  CompilerLockPassThrough,
  compilerLockLayer,
  makeCompilerLock,
} from '../mcp/compiler-lock.js';

interface LockEvent {
  readonly kind: 'queued' | 'acquire' | 'release';
  readonly id: string;
  readonly at: number;
  readonly completed?: boolean;
}

/** Hooks that record every event, plus a promise per (kind, id) that resolves when it fires. */
function recorder(latch?: (requestId: string) => Promise<void>) {
  const events: LockEvent[] = [];
  const waiters = new Map<string, () => void>();
  const promises = new Map<string, Promise<void>>();
  const signal = (key: string) => {
    if (!promises.has(key)) {
      promises.set(key, new Promise<void>(resolve => waiters.set(key, resolve)));
    }
    return promises.get(key)!;
  };
  const fire = (event: LockEvent) => {
    events.push(event);
    signal(`${event.kind}:${event.id}`);
    waiters.get(`${event.kind}:${event.id}`)!();
  };
  const hooks: CompilerLockHooks = {
    onQueued: (id, at) => fire({ kind: 'queued', id, at }),
    onAcquire: (id, at) => fire({ kind: 'acquire', id, at }),
    onRelease: (id, at, completed) => fire({ kind: 'release', id, at, completed }),
    ...(latch ? { latch } : {}),
  };
  const of = (kind: LockEvent['kind'], id: string) =>
    events.filter(event => event.kind === kind && event.id === id);
  return {
    events,
    hooks,
    of,
    when: (kind: LockEvent['kind'], id: string) => signal(`${kind}:${id}`),
  };
}

/** A latch per request id, released by hand. */
function manualLatch() {
  const releases = new Map<string, () => void>();
  const latches = new Map<string, Promise<void>>();
  const get = (id: string) => {
    if (!latches.has(id)) {
      latches.set(id, new Promise<void>(resolve => releases.set(id, resolve)));
    }
    return latches.get(id)!;
  };
  return {
    latch: (id: string) => get(id),
    release: (id: string) => {
      get(id);
      releases.get(id)!();
    },
  };
}

const sleepSection = Effect.sleep('50 millis');

const intervalsOverlap = (
  a: { start: number; end: number },
  b: { start: number; end: number }
): boolean => a.start < b.end && b.start < a.end;

describe('CompilerLock', () => {
  it('serialises sections', async () => {
    const rec = recorder();
    await Effect.runPromise(
      Effect.gen(function* () {
        const lock = yield* CompilerLock;
        yield* Effect.all([lock.run('1', sleepSection), lock.run('2', sleepSection)], {
          concurrency: 'unbounded',
        });
      }).pipe(Effect.provide(compilerLockLayer(rec.hooks)))
    );
    const interval = (id: string) => ({
      start: rec.of('acquire', id)[0]!.at,
      end: rec.of('release', id)[0]!.at,
    });
    expect(intervalsOverlap(interval('1'), interval('2'))).toBe(false);
  });

  it('hooks report queued, acquire, release(completed) per id', async () => {
    const rec = recorder();
    const lock = Effect.runSync(makeCompilerLock(rec.hooks));
    await Effect.runPromise(
      Effect.all([lock.run('1', sleepSection), lock.run('2', sleepSection)], {
        concurrency: 'unbounded',
      })
    );
    for (const id of ['1', '2']) {
      const [queued, acquire, release] = [
        rec.of('queued', id),
        rec.of('acquire', id),
        rec.of('release', id),
      ];
      expect(queued).toHaveLength(1);
      expect(acquire).toHaveLength(1);
      expect(release).toHaveLength(1);
      expect(release[0]!.completed).toBe(true);
      expect(queued[0]!.at).toBeLessThanOrEqual(acquire[0]!.at);
      expect(acquire[0]!.at).toBeLessThanOrEqual(release[0]!.at);
    }
    expect(rec.events.map(event => event.kind)).toHaveLength(6);
  });

  it('the latch holds a section after acquire', async () => {
    const gate = manualLatch();
    const rec = recorder(gate.latch);
    const lock = Effect.runSync(makeCompilerLock(rec.hooks));
    let ran = false;
    const fiber = Effect.runFork(
      lock.run(
        '1',
        Effect.sync(() => {
          ran = true;
          return 42;
        })
      )
    );
    await rec.when('acquire', '1');
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(ran).toBe(false);
    expect(rec.of('release', '1')).toHaveLength(0);

    gate.release('1');
    expect(await Effect.runPromise(Fiber.join(fiber))).toBe(42);
    expect(ran).toBe(true);
    expect(rec.of('release', '1')[0]!.completed).toBe(true);
  });

  it('a queued call interrupted leaves the queue and never acquires', async () => {
    const gate = manualLatch();
    const rec = recorder(gate.latch);
    const lock = Effect.runSync(makeCompilerLock(rec.hooks));
    let secondRan = false;

    const first = Effect.runFork(lock.run('1', Effect.void));
    await rec.when('acquire', '1');
    const second = Effect.runFork(
      lock.run(
        '2',
        Effect.sync(() => {
          secondRan = true;
        })
      )
    );
    await rec.when('queued', '2');

    await Effect.runPromise(Fiber.interrupt(second));
    const secondExit = await Effect.runPromise(Fiber.await(second));
    expect(Exit.hasInterrupts(secondExit)).toBe(true);

    gate.release('1');
    gate.release('3');
    await Effect.runPromise(Fiber.join(first));
    await Effect.runPromise(lock.run('3', Effect.void));

    expect(secondRan).toBe(false);
    expect(rec.of('acquire', '2')).toHaveLength(0);
    expect(rec.of('release', '2')).toHaveLength(0);
    expect(rec.of('acquire', '3')).toHaveLength(1);
  });

  it('an acquired section runs to the end when interrupted', async () => {
    const gate = manualLatch();
    const rec = recorder(gate.latch);
    const lock = Effect.runSync(makeCompilerLock(rec.hooks));
    let sideEffect = false;

    const first = Effect.runFork(
      lock.run(
        '1',
        Effect.sleep('20 millis').pipe(
          Effect.andThen(
            Effect.sync(() => {
              sideEffect = true;
            })
          )
        )
      )
    );
    await rec.when('acquire', '1');
    // Fiber.interrupt waits for the uninterruptible section, so it is not awaited yet.
    const interrupting = Effect.runPromise(Fiber.interrupt(first));
    const second = Effect.runFork(lock.run('2', Effect.void));
    await rec.when('queued', '2');

    gate.release('1');
    gate.release('2');
    await interrupting;
    await Effect.runPromise(Fiber.join(second));

    expect(sideEffect).toBe(true);
    const release1 = rec.of('release', '1');
    expect(release1).toHaveLength(1);
    expect(release1[0]!.completed).toBe(true);
    expect(rec.of('acquire', '2')[0]!.at).toBeGreaterThanOrEqual(release1[0]!.at);
  });

  it('PassThrough does not serialise', async () => {
    const intervals = new Map<string, { start: number; end: number }>();
    const timed = (id: string) =>
      Effect.sync(() => performance.now()).pipe(
        Effect.flatMap(start =>
          sleepSection.pipe(
            Effect.andThen(
              Effect.sync(() => {
                intervals.set(id, { start, end: performance.now() });
              })
            )
          )
        )
      );
    await Effect.runPromise(
      Effect.gen(function* () {
        const lock = yield* CompilerLock;
        yield* Effect.all([lock.run('1', timed('1')), lock.run('2', timed('2'))], {
          concurrency: 'unbounded',
        });
      }).pipe(Effect.provide(CompilerLockPassThrough))
    );
    expect(intervalsOverlap(intervals.get('1')!, intervals.get('2')!)).toBe(true);
  });
});
