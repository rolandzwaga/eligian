/**
 * Spec 058 Phase 1 (FR-008; plan C5, C12): one JSON line per tool call on stderr, also appended
 * to the `ELIGIAN_MCP_LOG` file when set, and the per-server call id the lock hooks report.
 *
 * Telemetry never changes a tool result: a failed write is swallowed, and a failed append turns
 * file logging off for that server after one warning line on stderr.
 *
 * Phase 3 (FR-007; plan C2, P10): a success may add a `result` summary (`summarizeResult`, e.g. the
 * diagnostic codes of a check), and `telemetryText` keeps every line within 1,000 chars.
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
  /** What the success returned, summarized by the tool (Phase 3 C2) */
  readonly result?: Readonly<Record<string, unknown>>;
  /** Set when `result.codes` was cut to fit the line (telemetryText) */
  readonly truncated?: true;
}

export interface Telemetry {
  readonly withTelemetry: <A, E, R>(
    tool: string,
    args: Readonly<Record<string, unknown>>,
    run: (requestId: string) => Effect.Effect<A, E, R>,
    summarizeResult?: (value: A) => Readonly<Record<string, unknown>>
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

/** The most characters of one telemetry line, without its newline (FR-007). */
export const MAX_LINE_CHARS = 1000;

/** The numeric entries of `codes`, largest count first (ties by code); none when it is not a record. */
function rankedCodes(codes: unknown): [string, number][] {
  if (typeof codes !== 'object' || codes === null || Array.isArray(codes)) return [];
  return Object.entries(codes)
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
    .sort(([a, x], [b, y]) => y - x || (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * The JSON text of a line, at most MAX_LINE_CHARS: a `result.codes` that does not fit is cut to
 * the most codes that fit, the largest counts kept, and the line is marked `truncated: true`. A
 * line that fits is returned as is. (Only `result.codes` grows with the input; `args` are
 * summaries.)
 */
export function telemetryText(line: TelemetryLine): string {
  const text = JSON.stringify(line);
  const ranked = rankedCodes(line.result?.codes);
  if (text.length <= MAX_LINE_CHARS || ranked.length === 0) return text;
  const cut = (kept: number): string =>
    JSON.stringify({
      ...line,
      result: { ...line.result, codes: Object.fromEntries(ranked.slice(0, kept)) },
      truncated: true,
    } satisfies TelemetryLine);
  // the cut text grows with `kept`: the most codes that fit, by bisection
  let low = 0;
  let high = ranked.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (cut(middle).length <= MAX_LINE_CHARS) low = middle;
    else high = middle - 1;
  }
  return cut(low);
}

/** The summary of a success; none for a failure or when the summarizer throws. */
function resultOf<A, E>(
  exit: Exit.Exit<A, E>,
  summarizeResult: ((value: A) => Readonly<Record<string, unknown>>) | undefined
): Readonly<Record<string, unknown>> | undefined {
  if (summarizeResult === undefined || !Exit.isSuccess(exit)) return undefined;
  try {
    return summarizeResult(exit.value);
  } catch {
    return undefined;
  }
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
    withTelemetry: (tool, args, run, summarizeResult) =>
      Effect.suspend(() => {
        calls += 1;
        const requestId = String(calls);
        const start = Date.now();
        return run(requestId).pipe(
          Effect.onExit(exit =>
            Effect.try({
              try: () => {
                const result = resultOf(exit, summarizeResult);
                const line: TelemetryLine = {
                  t: new Date(start).toISOString(),
                  tool,
                  ms: Date.now() - start,
                  chars: charsOf(payloadOf(exit)),
                  ok: Exit.isSuccess(exit),
                  args,
                  ...(result === undefined ? {} : { result }),
                };
                return `${telemetryText(line)}\n`;
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
