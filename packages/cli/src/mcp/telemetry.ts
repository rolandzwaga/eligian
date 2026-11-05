/**
 * Spec 058 Phase 1 (FR-008; plan C5, C12): one JSON line per tool call on stderr, also appended
 * to the `ELIGIAN_MCP_LOG` file when set, and the per-server call id the lock hooks report.
 *
 * Telemetry never changes a tool result: a failed write is swallowed, and a failed append turns
 * file logging off for that server after one warning line on stderr.
 */
import { appendFileSync } from 'node:fs';
import { Cause, Effect, Exit, Option } from 'effect';

export interface TelemetryLine {
  readonly t: string;
  readonly tool: string;
  readonly ms: number;
  readonly chars: number;
  readonly ok: boolean;
  readonly args: Readonly<Record<string, unknown>>;
}

export interface Telemetry {
  readonly withTelemetry: <A, E, R>(
    tool: string,
    args: Readonly<Record<string, unknown>>,
    run: (requestId: string) => Effect.Effect<A, E, R>
  ) => Effect.Effect<A, E, R>;
}

/** A telemetry write that failed; always swallowed, never reaches a tool result. */
interface TelemetryWriteFailed {
  readonly _tag: 'TelemetryWriteFailed';
  readonly message: string;
}

const writeFailed = (error: unknown): TelemetryWriteFailed => ({
  _tag: 'TelemetryWriteFailed',
  message: error instanceof Error ? error.message : String(error),
});

/** The JSON length of a payload; 0 when there is none or it does not serialise. */
function charsOf(payload: unknown): number {
  try {
    return JSON.stringify(payload)?.length ?? 0;
  } catch {
    return 0;
  }
}

/** The success value or the typed failure; nothing for a defect or an interruption. */
function payloadOf<A, E>(exit: Exit.Exit<A, E>): unknown {
  if (Exit.isSuccess(exit)) return exit.value;
  return Option.getOrUndefined(Cause.findErrorOption(exit.cause));
}

const writeStderr = (text: string) =>
  Effect.try({
    try: () => {
      process.stderr.write(text);
    },
    catch: writeFailed,
  }).pipe(Effect.ignore);

/** One per server (makeServerLayer): its own call counter and log-file state. */
export function makeTelemetry(logFile: string | undefined): Telemetry {
  let calls = 0;
  let fileLogging = logFile !== undefined;

  const appendToLog = (text: string) =>
    logFile === undefined || !fileLogging
      ? Effect.void
      : Effect.try({
          try: () => appendFileSync(logFile, text),
          catch: writeFailed,
        }).pipe(
          Effect.catch(failure => {
            fileLogging = false;
            return writeStderr(
              `eligian mcp: telemetry log ${logFile} is not writable, file logging off: ${failure.message}\n`
            );
          })
        );

  return {
    withTelemetry: (tool, args, run) =>
      Effect.suspend(() => {
        calls += 1;
        const requestId = String(calls);
        const start = Date.now();
        return run(requestId).pipe(
          Effect.onExit(exit =>
            Effect.try({
              try: () => {
                const line: TelemetryLine = {
                  t: new Date(start).toISOString(),
                  tool,
                  ms: Date.now() - start,
                  chars: charsOf(payloadOf(exit)),
                  ok: Exit.isSuccess(exit),
                  args,
                };
                return `${JSON.stringify(line)}\n`;
              },
              catch: writeFailed,
            }).pipe(
              Effect.andThen(text => Effect.andThen(writeStderr(text), appendToLog(text))),
              Effect.ignore
            )
          )
        );
      }),
  };
}
