/**
 * Spec 058 Phase 1 (FR-009, FR-010, FR-053; plan C2-lock): one semaphore with one permit
 * per server around every tool section that touches the shared Langium services
 * (`eligian_check`, `eligian_fmt`, `eligian_operations` with `path`).
 *
 * Waiting for the permit stays interruptible, so a cancelled queued call leaves the queue
 * without running. Once acquired, the section is uninterruptible: `checkFiles` is a promise
 * that keeps mutating the shared services if abandoned, so the permit is released only
 * after it settled (FR-009).
 *
 * Spec 058 Phase 3 (FR-061; plan C3, P20): after every N completed sections the lock recycles
 * the shared Langium services (releases every workspace document, then drops the singleton),
 * inside the permit and uninterruptibly, before it releases the permit. The counter belongs to
 * each build of the lock, so every server counts only its own sections.
 */
import { getOrCreateServices, releaseWorkspaceDocuments, resetServices } from '@eligian/language';
import { Context, Effect, Exit, Layer, Semaphore } from 'effect';

export interface CompilerLockHooks {
  readonly onQueued?: (requestId: string, at: number) => void;
  readonly onAcquire?: (requestId: string, at: number) => void;
  readonly onRelease?: (requestId: string, at: number, completed: boolean) => void;
  /** Holds a section right after acquire until the promise resolves (tests) */
  readonly latch?: (requestId: string) => Promise<void>;
  /** After a recycle released the documents and reset the services; awaited inside the permit */
  readonly onRecycle?: (completedSections: number) => Promise<void>;
}

export interface CompilerLockOptions {
  /** Recycle after every N completed sections (default 100, roadmap §2) */
  readonly recycleAfter?: number;
  /** Default: {@link recycleCompilerServices} */
  readonly recycle?: () => void;
}

/** Completed sections between two recycles, by default (roadmap §2). */
const RECYCLE_AFTER = 100;

/**
 * Releases every document of the shared compiler workspace, then drops the services, so that
 * the next `getOrCreateServices()` builds a fresh set. Both on the root singleton (P1).
 */
export function recycleCompilerServices(): void {
  releaseWorkspaceDocuments(
    getOrCreateServices().shared.workspace.LangiumDocuments.all.map(document => document.uri)
  );
  resetServices();
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

const notifyRecycle = (
  onRecycle: CompilerLockHooks['onRecycle'],
  completedSections: number
): Effect.Effect<void> =>
  onRecycle === undefined
    ? Effect.void
    : Effect.tryPromise(() => onRecycle(completedSections)).pipe(Effect.orDie);

export const makeCompilerLock = (
  hooks: CompilerLockHooks = {},
  options: CompilerLockOptions = {}
): Effect.Effect<CompilerLock['Service']> =>
  Effect.map(Semaphore.make(1), semaphore => {
    const recycleAfter = options.recycleAfter ?? RECYCLE_AFTER;
    const recycle = options.recycle ?? recycleCompilerServices;
    // Per build of the lock (P20); the single permit serialises the increments
    let completed = 0;
    const countSection: Effect.Effect<void> = Effect.suspend(() => {
      completed += 1;
      return completed % recycleAfter === 0
        ? Effect.sync(recycle).pipe(Effect.andThen(notifyRecycle(hooks.onRecycle, completed)))
        : Effect.void;
    });
    return CompilerLock.of({
      run: (requestId, section) =>
        Effect.sync(() => hooks.onQueued?.(requestId, now())).pipe(
          Effect.andThen(
            semaphore.withPermits(1)(
              Effect.uninterruptible(
                Effect.sync(() => hooks.onAcquire?.(requestId, now())).pipe(
                  Effect.andThen(holdAt(hooks.latch, requestId)),
                  Effect.andThen(section),
                  // every acquired section counts, success or failure
                  Effect.onExit(() => countSection),
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
    });
  });

/** The production lock: no hooks, a recycle every 100 sections. */
export const CompilerLockLive: Layer.Layer<CompilerLock> = Layer.effect(
  CompilerLock,
  makeCompilerLock()
);

/** A lock that reports to `hooks` (tests: SC-005, SC-022, SC-015). */
export const compilerLockLayer = (
  hooks: CompilerLockHooks,
  options?: CompilerLockOptions
): Layer.Layer<CompilerLock> => Layer.effect(CompilerLock, makeCompilerLock(hooks, options));

/** No semaphore and no recycling: the SC-005 negative control (tests only). */
export const CompilerLockPassThrough: Layer.Layer<CompilerLock> = Layer.succeed(
  CompilerLock,
  CompilerLock.of({ run: (_requestId, section) => section })
);
