/**
 * Spec 058 Phase 3 (FR-005, FR-007, FR-008; plan D3, P13): the `claude -p` transcript of an eval
 * run, its tool calls paired with their results, and the run metrics.
 *
 * Plain synchronous TypeScript (plan D): no Effect, no services. `parseTranscript`,
 * `isCheckBashCall` and `readMcpLog` moved here from `evals/mcp/gate.ts`; `toolCalls` counts
 * exactly as it did there, now as a projection of `toolEntries`.
 */
import fs from 'node:fs';

/** The arms of the eval (FR-002, FR-003); `harness.ts` re-exports it. */
export type Arm = 'A0' | 'A1' | 'A-none';

export interface ToolCall {
  readonly name: string;
  readonly input: Record<string, unknown>;
}

/** A tool call paired with its `tool_result` by `tool_use_id` (P13). */
export interface ToolEntry extends ToolCall {
  readonly id: string;
  /** The result text; for an array content, its items' `text` joined. Absent without a result. */
  readonly resultText?: string;
  /** The characters of the result: the string's length, or the sum of the items' text lengths */
  readonly resultChars: number;
  /** Spec 059 (P7): present only when the matching `tool_result` has `is_error: true` */
  readonly isError?: true;
}

/** A line of `ELIGIAN_MCP_LOG` (`telemetry.ts` `TelemetryLine`), as read back. */
export interface TelemetryLike {
  readonly tool?: unknown;
  readonly chars?: unknown;
  readonly args?: unknown;
  readonly result?: unknown;
}

export interface RunMetrics {
  /** checkToolCalls + checkBashCalls − 1 (Phase 1, `GateMetrics`) */
  readonly rounds: number;
  /** `eligian_check` lines in the telemetry log */
  readonly checkToolCalls: number;
  /** Bash calls that run `eligian check` / `cli.js check` */
  readonly checkBashCalls: number;
  /** `toolCalls(events).length` less the `eligian_brief` calls (spec 059 FR-032), the count the budget uses (FR-008) */
  readonly toolCalls: number;
  /** FR-005: every tool result of the transcript, the arm-neutral tokens-from-tools */
  readonly transcriptToolChars: number;
  /** FR-005: the sum of the telemetry `chars`; 0 without a server */
  readonly toolChars: number;
  /** FR-008: the characters of the arm's teaching channel */
  readonly channelChars: number;
  /** FR-007, I-11 */
  readonly operationsBeforeFirstUnknown: boolean;
  /** Whether the reference point of `operationsBeforeFirstUnknown` was such a diagnostic */
  readonly hitUnknown: boolean;
  readonly explainCalled: boolean;
  readonly fmtCalled: boolean;
  readonly wallMs?: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// ---------------------------------------------------------------------------------------------
// Transcript (claude -p --output-format json: one array; stream-json: one event per line)

export function parseTranscript(text: string): unknown[] {
  const trimmed = text.trim();
  if (trimmed === '') return [];
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return trimmed
      .split(/\r?\n/)
      .filter(line => line.trim() !== '')
      .flatMap(line => {
        try {
          return [JSON.parse(line) as unknown];
        } catch {
          return [];
        }
      });
  }
}

/** The `message.content` items of the events of one type. */
function contentItems(event: unknown, type: 'assistant' | 'user'): unknown[] {
  if (!isRecord(event) || event.type !== type || !isRecord(event.message)) return [];
  const content = event.message.content;
  return Array.isArray(content) ? content : [];
}

/** The text and size of a `tool_result` content: a string, or an array of `{ type, text }` items. */
function resultOf(content: unknown): { text: string; chars: number } {
  if (typeof content === 'string') return { text: content, chars: content.length };
  if (!Array.isArray(content)) return { text: '', chars: 0 };
  const texts = content.flatMap(item =>
    isRecord(item) && typeof item.text === 'string' ? [item.text] : []
  );
  const text = texts.join('');
  return { text, chars: text.length };
}

/**
 * The tool calls of the agent, in order (assistant `tool_use` items), each with the result that
 * a `user` event returned for its `tool_use_id`, wherever in the transcript it came.
 */
export function toolEntries(events: readonly unknown[]): ToolEntry[] {
  const results = new Map<string, { content: unknown; isError: boolean }>();
  for (const event of events) {
    for (const item of contentItems(event, 'user')) {
      if (isRecord(item) && item.type === 'tool_result' && typeof item.tool_use_id === 'string') {
        if (!results.has(item.tool_use_id)) {
          results.set(item.tool_use_id, { content: item.content, isError: item.is_error === true });
        }
      }
    }
  }
  const entries: ToolEntry[] = [];
  for (const event of events) {
    for (const item of contentItems(event, 'assistant')) {
      if (!isRecord(item) || item.type !== 'tool_use' || typeof item.name !== 'string') continue;
      const id = typeof item.id === 'string' ? item.id : '';
      const input = isRecord(item.input) ? item.input : {};
      const matched = results.get(id);
      if (matched === undefined) {
        entries.push({ id, name: item.name, input, resultChars: 0 });
        continue;
      }
      const result = resultOf(matched.content);
      entries.push({
        id,
        name: item.name,
        input,
        resultText: result.text,
        resultChars: result.chars,
        ...(matched.isError ? { isError: true as const } : {}),
      });
    }
  }
  return entries;
}

/** The tool calls of the agent, in order: the projection of `toolEntries` the budget counts. */
export function toolCalls(events: readonly unknown[]): ToolCall[] {
  return toolEntries(events).map(entry => ({ name: entry.name, input: entry.input }));
}

const CHECK_COMMAND = /(?:\beligian|cli\.js)["']?\s+check\b/;

/**
 * `CHECK_COMMAND` widened to every invocation of the CLI (FR-008): a subcommand, an option, or an
 * `.eligian` file (the default `compile`). `eligian` must not follow `.`, `-` or a word character,
 * so `main.eligian` is never taken for the CLI.
 */
const CLI_COMMAND =
  /(?:(?<![.\w-])eligian|cli\.js)["']?\s+(?:(?:check|compile|dev|smoke|init|agents|fmt|mcp)\b|-|[^\s|;&]+\.eligian\b)/;

const FMT_COMMAND = /(?:(?<![.\w-])eligian|cli\.js)["']?\s+fmt\b/;

const bashCommand = (call: ToolCall): string =>
  call.name === 'Bash' ? String(call.input.command ?? '') : '';

export function isCheckBashCall(call: ToolCall): boolean {
  return call.name === 'Bash' && CHECK_COMMAND.test(String(call.input.command ?? ''));
}

export function isCliBashCall(call: ToolCall): boolean {
  return CLI_COMMAND.test(bashCommand(call));
}

/** The JSON lines of ELIGIAN_MCP_LOG (`{ t, tool, ms, chars, ok, args, result? }`); other lines skipped. */
export function readMcpLog(file: string): TelemetryLike[] {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .flatMap(line => {
      try {
        const parsed = JSON.parse(line) as unknown;
        return isRecord(parsed) ? [parsed as TelemetryLike] : [];
      } catch {
        return [];
      }
    });
}

// ---------------------------------------------------------------------------------------------
// Metrics

const MCP = 'mcp__eligian__';
const OPERATIONS_INDEX = 'operations-index';
const OPERATIONS_INDEX_FILE = 'generated/operations-index.md';
const DOCS_DIR = 'node_modules/eligian/dist/docs';
/** `validators/codes.ts`: the diagnostics that FR-007's reference point looks for */
const UNKNOWN_CODES = ['unknown_operation', 'missing-action-dependency'] as const;

const slashes = (value: string): string => value.replace(/\\/g, '/');

const isCheckEntry = (entry: ToolEntry): boolean =>
  entry.name === `${MCP}eligian_check` || isCheckBashCall(entry);

/** `eligian_docs` returned the `operations-index` chunk in `cards`, `bodies` or `hits`. */
function docsReturnedIndex(entry: ToolEntry): boolean {
  if (entry.name !== `${MCP}eligian_docs` || entry.resultText === undefined) return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(entry.resultText);
  } catch {
    return entry.resultText.includes(`"id":"${OPERATIONS_INDEX}"`);
  }
  if (!isRecord(parsed)) return false;
  return ['cards', 'bodies', 'hits'].some(key => {
    const items = parsed[key];
    return (
      Array.isArray(items) && items.some(item => isRecord(item) && item.id === OPERATIONS_INDEX)
    );
  });
}

/** A `Read` / `Bash` / `Grep` call that names `generated/operations-index.md`. */
function readIndexFile(entry: ToolEntry): boolean {
  if (entry.name !== 'Read' && entry.name !== 'Bash' && entry.name !== 'Grep') return false;
  return Object.values(entry.input).some(
    value => typeof value === 'string' && slashes(value).includes(OPERATIONS_INDEX_FILE)
  );
}

const taughtOperations = (entry: ToolEntry): boolean =>
  entry.name === `${MCP}eligian_operations` || docsReturnedIndex(entry) || readIndexFile(entry);

/** A0 / A-none: a `Read` / `Grep` / `Glob` of the docs on disk, or a Bash call of the CLI (FR-008). */
function inDocsChannel(entry: ToolEntry): boolean {
  if (entry.name === 'Read' || entry.name === 'Grep' || entry.name === 'Glob') {
    const target = entry.input.file_path ?? entry.input.path;
    return typeof target === 'string' && slashes(target).includes(DOCS_DIR);
  }
  return isCliBashCall(entry);
}

const sum = (values: readonly number[]): number => values.reduce((total, n) => total + n, 0);

export function computeMetrics(
  arm: Arm,
  events: readonly unknown[],
  log: readonly TelemetryLike[],
  wallMs?: number
): RunMetrics {
  const entries = toolEntries(events);
  const checkToolCalls = log.filter(line => line.tool === 'eligian_check').length;
  const checkBashCalls = entries.filter(isCheckBashCall).length;
  const toolChars = sum(log.map(line => (typeof line.chars === 'number' ? line.chars : 0)));
  const transcriptToolChars = sum(entries.map(entry => entry.resultChars));
  const channelChars =
    arm === 'A1' ? toolChars : sum(entries.filter(inDocsChannel).map(e => e.resultChars));

  // I-11: the first check result with the diagnostic, else the first check, else the end of the run
  const unknownAt = entries.findIndex(
    entry =>
      isCheckEntry(entry) && UNKNOWN_CODES.some(code => entry.resultText?.includes(code) === true)
  );
  const firstCheck = entries.findIndex(isCheckEntry);
  const reference = unknownAt !== -1 ? unknownAt : firstCheck !== -1 ? firstCheck : entries.length;

  return {
    rounds: checkToolCalls + checkBashCalls - 1,
    checkToolCalls,
    checkBashCalls,
    toolCalls: entries.filter(e => e.name !== `${MCP}eligian_brief`).length,
    transcriptToolChars,
    toolChars,
    channelChars,
    operationsBeforeFirstUnknown: entries.slice(0, reference).some(taughtOperations),
    hitUnknown: unknownAt !== -1,
    explainCalled: entries.some(
      entry => entry.name === `${MCP}eligian_compile` && entry.input.explain === true
    ),
    fmtCalled: entries.some(
      entry => entry.name === `${MCP}eligian_fmt` || FMT_COMMAND.test(bashCommand(entry))
    ),
    ...(wallMs === undefined ? {} : { wallMs }),
  };
}
