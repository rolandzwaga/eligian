/**
 * Spec 058 Phase 1 (FR-004): the Node `Stdio` service for the MCP stdio transport
 * (`effect` 4.0.7 ships only `Stdio.make` and `Stdio.layerTest`), and the guard that
 * keeps stdout for protocol frames: everything else is routed to stderr.
 *
 * `Stdio` and `PlatformError` are `@stability unstable`; the MCP transport needs them
 * (roadmap §2, decision 1: `effect` is pinned exactly).
 */
// @effect-diagnostics unstableApiUsage:off
import { format } from 'node:util';
import { Effect, Layer, Logger, PlatformError, Sink, Stdio, Stream } from 'effect';

export interface CapturedStdout {
  readonly write: (chunk: string | Uint8Array) => boolean;
}

const CONSOLE_METHODS = ['log', 'info', 'debug', 'warn', 'error'] as const;

/** A sink that hands every chunk to `write`. */
const writerSink = (write: (chunk: string | Uint8Array) => unknown) =>
  // biome-ignore lint/suspicious/useIterableCallbackReturn: Sink.forEach, not Array#forEach: the callback returns the Effect to run
  Sink.forEach((chunk: string | Uint8Array) =>
    Effect.sync(() => {
      write(chunk);
    })
  );

let captured: CapturedStdout | undefined;

/**
 * Capture `process.stdout.write` for the transport, then route `console.log/info/debug/warn/error`
 * and `process.stdout.write` to stderr for the life of the process. Idempotent: a second call
 * returns the writer to the stdout captured by the first.
 *
 * Called by the server start only, never by in-process tests (it would capture vitest's console).
 */
export function redirectConsoleToStderr(): CapturedStdout {
  if (captured) return captured;
  const stdoutWrite = process.stdout.write;
  captured = { write: chunk => stdoutWrite.call(process.stdout, chunk) };

  // `process.stderr.write` is looked up on every call, so a later replacement is honoured.
  process.stdout.write = ((...args: unknown[]) =>
    Reflect.apply(process.stderr.write, process.stderr, args)) as typeof process.stdout.write;
  for (const method of CONSOLE_METHODS) {
    console[method] = (...args: unknown[]) => {
      process.stderr.write(`${format(...args)}\n`);
    };
  }
  return captured;
}

/** The `Stdio` service over `process.stdin` and the captured stdout writer. */
export function layerNodeStdio(stdout: CapturedStdout): Layer.Layer<Stdio.Stdio> {
  return Layer.succeed(
    Stdio.Stdio,
    Stdio.make({
      args: Effect.succeed(process.argv.slice(2)),
      stdin: Stream.fromAsyncIterable<Uint8Array, PlatformError.PlatformError>(
        process.stdin,
        cause =>
          PlatformError.systemError({
            _tag: 'Unknown',
            module: 'Stdio',
            method: 'stdin',
            description: 'reading standard input failed',
            cause,
          })
      ),
      stdout: () => writerSink(chunk => stdout.write(chunk)),
      stderr: () => writerSink(chunk => process.stderr.write(chunk)),
    })
  );
}

/** Effect's logger, to stderr (`console.error`). */
export const stderrLoggerLayer: Layer.Layer<never> = Logger.layer([
  Logger.withConsoleError(Logger.formatSimple),
]);
