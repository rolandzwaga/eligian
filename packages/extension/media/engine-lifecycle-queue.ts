/**
 * engine-lifecycle-queue.ts - Serializes Eligius engine lifecycle work in the webview
 *
 * The webview's `message` listener is async and the browser does not wait for
 * one handler to finish before dispatching the next event. Without
 * serialization, a second 'initialize' destroys and replaces the engine while
 * the first is still in `await engine.init()`, which makes the first throw (a
 * spurious error toast) and lets an older config finish last.
 *
 * This queue runs initialize/destroy strictly one after another and skips an
 * initialize that was superseded by a later request before it started, so the
 * engine always ends up built from the most recent config.
 *
 * Constitution Principle I: Simplicity & Documentation
 */

export interface EngineLifecycleHandlers<TConfig> {
  initialize(config: TConfig): Promise<void>;
  destroy(): Promise<void>;
}

export interface EngineLifecycleQueue<TConfig> {
  /** Queue an engine (re)initialization. Resolves once it ran or was skipped. */
  initialize(config: TConfig): Promise<void>;
  /** Queue an engine destruction. Resolves once it ran. */
  destroy(): Promise<void>;
}

/**
 * Create a queue that serializes engine lifecycle operations.
 *
 * - Operations never overlap: each starts after the previous one settled.
 * - An initialize that has not started yet is skipped when another operation
 *   (initialize or destroy) was queued after it; only the latest wins.
 * - A failing operation does not block the ones queued after it.
 */
export function createEngineLifecycleQueue<TConfig>(
  handlers: EngineLifecycleHandlers<TConfig>
): EngineLifecycleQueue<TConfig> {
  let tail: Promise<void> = Promise.resolve();
  let latestRequest = 0;

  const enqueue = (task: (request: number) => Promise<void>): Promise<void> => {
    const request = ++latestRequest;
    const run = tail.then(() => task(request));
    tail = run.catch(() => undefined);
    return run;
  };

  return {
    initialize: config =>
      enqueue(async request => {
        if (request !== latestRequest) {
          return; // Superseded by a newer request queued behind it
        }
        await handlers.initialize(config);
      }),
    destroy: () => enqueue(() => handlers.destroy()),
  };
}
