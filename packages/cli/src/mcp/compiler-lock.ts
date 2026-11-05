/**
 * Spec 058 Phase 1 (FR-009, FR-010, FR-053; plan C2-lock): one semaphore with one permit
 * per server around every tool section that touches the shared Langium services
 * (`eligian_check`, `eligian_fmt`, `eligian_operations` with `path`).
 *
 * Waiting for the permit stays interruptible, so a cancelled queued call leaves the queue
 * without running. Once acquired, the section is uninterruptible: `checkFiles` is a promise
 * that keeps mutating the shared services if abandoned, so the permit is released only
 * after it settled (FR-009).
 */
import { Context, Effect, Exit, Layer, Semaphore } from 'effect';

export interface CompilerLockHooks {
  readonly onQueued?: (requestId: string, at: number) => void;
  readonly onAcquire?: (requestId: string, at: number) => void;
  readonly onRelease?: (requestId: string, at: number, completed: boolean) => void;
  /** Holds a section right after acquire until the promise resolves (tests) */
  readonly latch?: (requestId: string) => Promise<void>;
}

export class CompilerLock extends Context.Service<
  CompilerLock,
  {
    /** Runs `section` under the lock; `requestId` is the per-server call id (telemetry, C12). */
    readonly run: <A, E, R>(
      requestId: string,
      section: Effect.Effect<A, E, R>
    ) => Effect.Effect<A, E, R>;
  }
>()('eligian/mcp/CompilerLock') {}

const now = (): number => performance.now();

const holdAt = (latch: CompilerLockHooks['latch'], requestId: string): Effect.Effect<void> =>
  latch === undefined ? Effect.void : Effect.tryPromise(() => latch(requestId)).pipe(Effect.orDie);

export const makeCompilerLock = (
  hooks: CompilerLockHooks = {}
): Effect.Effect<CompilerLock['Service']> =>
  Effect.map(Semaphore.make(1), semaphore =>
    CompilerLock.of({
      run: (requestId, section) =>
        Effect.sync(() => hooks.onQueued?.(requestId, now())).pipe(
          Effect.andThen(
            semaphore.withPermits(1)(
              Effect.uninterruptible(
                Effect.sync(() => hooks.onAcquire?.(requestId, now())).pipe(
                  Effect.andThen(holdAt(hooks.latch, requestId)),
                  Effect.andThen(section),
                  Effect.onExit(exit =>
                    Effect.sync(() =>
                      hooks.onRelease?.(requestId, now(), !Exit.hasInterrupts(exit))
                    )
                  )
                )
              )
            )
          )
        ),
    })
  );

/** The production lock: no hooks. */
export const CompilerLockLive: Layer.Layer<CompilerLock> = Layer.effect(
  CompilerLock,
  makeCompilerLock()
);

/** A lock that reports to `hooks` (tests: SC-005, SC-022). */
export const compilerLockLayer = (hooks: CompilerLockHooks): Layer.Layer<CompilerLock> =>
  Layer.effect(CompilerLock, makeCompilerLock(hooks));

/** No semaphore: the SC-005 negative control (tests only). */
export const CompilerLockPassThrough: Layer.Layer<CompilerLock> = Layer.succeed(
  CompilerLock,
  CompilerLock.of({ run: (_requestId, section) => section })
);
