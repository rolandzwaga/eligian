/**
 * Spec 058 Phase 2 (FR-040–FR-046; plan D4): `eligian_smoke`, the smoke run as an MCP tool.
 *
 * The engine never runs in the server process (FR-041): the tool spawns its own `bin/cli.js`
 * (`smoke <files> --format ndjson …`, `shell: false`, cwd the project root) and builds its
 * result from the child's ndjson lines. The child's stderr, and any stdout line that is not
 * JSON, go to the server's stderr prefixed `smoke: ` (FR-044); nothing reaches the server's
 * stdout. An inline scenario (or a scenario file with extra `assertions`) is written to a temp
 * file that is removed on every path (`acquireUseRelease`). `timeoutMs` kills the child and
 * returns what was read so far, `partial: true` (FR-042); interrupting the call
 * (`notifications/cancelled`) kills the child through the `Effect.callback` canceler (FR-043).
 * No compiler lock: the child compiles in its own process (FR-046).
 *
 * `Tool` is `@stability unstable`; the server is built on it (roadmap §2, decision 1: `effect` is
 * pinned exactly).
 */
// @effect-diagnostics unstableApiUsage:off
import { type ChildProcess, spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { Effect, Schema } from 'effect';
import { isLibrary } from '../../check/check-command.js';
import {
  Assertion,
  parseScenario,
  Scenario,
  ScenarioStep,
  type ScenarioStepResult,
  type Snapshot,
} from '../../smoke/scenario.js';
import type { SmokeTimeline } from '../../smoke/smoke-runner.js';
import {
  type FileSmokeProblem,
  McpDiagnosticSchema,
  smokeToMcpDiagnostics,
} from '../diagnostics.js';
import { type ToolError, ToolFailure, ToolIoError, toToolError } from '../errors.js';
import { loadKnowledge } from '../knowledge/load.js';
import {
  type EffectAi,
  type ProjectRoot,
  projectRoot,
  resolveInputPath,
  resolveInputPatterns,
} from '../paths.js';

/** The test seams of FR-041. */
export interface SmokeToolOptions {
  /** The bin/cli.js the child runs; default the one beside the running bundle */
  readonly cliPath?: string;
  /** Called once the child is spawned (SC-008(4)) */
  readonly onSpawn?: (pid: number, scenarioFile?: string) => void;
}

/** What the handler receives from the server (plan C9), plus the smoke seams. */
export interface ToolContext {
  readonly ai: EffectAi;
  readonly cwd: string;
  readonly docsRoot: URL | string;
  readonly versions: { readonly compiler: string; readonly eligius: string };
  readonly requestId: string;
  readonly smoke?: SmokeToolOptions;
}

export const NAME = 'eligian_smoke' as const;

export const DESCRIPTION =
  'Smoke-play Eligian programs at runtime: compile each file and play every timeline on the ' +
  'real Eligius engine (headless jsdom), then replay an optional scenario (click, key, seek, ' +
  'navigate, wait, snapshot) and check its assertions. It runs in a child process ' +
  '(`eligian smoke --format ndjson`). A full presentation can take 40 s or more: pass `paths` ' +
  'for one file, or `timelines` for a subset. After `timeoutMs` (default 45000) the child is ' +
  'stopped and the result holds what was played so far, with `partial: true`. `ok: true` means ' +
  'no runtime error and not partial; with `strict` (the default) a selectElement that matches ' +
  'nothing is an error. A scenario is an array of steps, `{ steps, assertions }`, or the path of ' +
  'a scenario JSON file, and applies to one program file. Steps: `{ "seek": <s> }`, ' +
  '`{ "click": "<selector>" }`, `{ "key": "<key>", "in"?: "<selector>" }`, ' +
  '`{ "navigate": "<timeline>" }`, `{ "wait": <ms> }`, `{ "snapshot": "<label>" }`. Each step ' +
  'returns the active timeline, the position and a snapshot of every layout id (exists, ' +
  'classes, text, style, visible, controllers) plus `activeTimelineActions`; concise steps ' +
  'carry only the entries that changed since the previous step, `response_format: "detailed"` ' +
  'the full snapshots. Assertions: `{ after: <snapshot label | step index>, selector?: "#<id>", ' +
  'hasClass | notHasClass | text | visible | controllers | timeline | position }`, where ' +
  '`position` is seconds, `{ sameAs: <step> }` or `{ greaterThan: <step> }`; a failed one is a ' +
  "`scenario-assertion-failed` problem with `expected` and `actual`. Security: the program's " +
  'extensions module (`host.ts`) is user code; it is executed only inside the smoke child ' +
  'process, never in the server.';

export const KEYWORDS: readonly string[] = ['smoke', 'play', 'scenario', 'runtime', 'click'];

const DEFAULT_TIMEOUT_MS = 45_000;

export const Parameters = Schema.Struct({
  paths: Schema.Array(Schema.String).check(Schema.isMinLength(1)),
  strict: Schema.optionalKey(Schema.Boolean),
  timelines: Schema.optionalKey(Schema.Array(Schema.String)),
  scenario: Schema.optionalKey(Schema.Union([Schema.Array(ScenarioStep), Scenario, Schema.String])),
  assertions: Schema.optionalKey(Schema.Array(Assertion)),
  timeoutMs: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(1000))),
  stepTimeoutMs: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))),
  response_format: Schema.optionalKey(Schema.Literals(['concise', 'detailed'])),
});
type Params = typeof Parameters.Type;

const TimelineSchema = Schema.Struct({
  name: Schema.String,
  boundaries: Schema.Int,
  skipped: Schema.optionalKey(Schema.String),
});

const FileSchema = Schema.Struct({
  file: Schema.String,
  timelines: Schema.Array(TimelineSchema),
});

const StepSchema = Schema.Struct({
  index: Schema.Int,
  step: ScenarioStep,
  label: Schema.optionalKey(Schema.String),
  timeline: Schema.String,
  position: Schema.Finite,
  snapshot: Schema.Record(Schema.String, Schema.Unknown),
});

export const Success = Schema.Struct({
  header: Schema.String,
  ok: Schema.Boolean,
  files: Schema.Array(FileSchema),
  steps: Schema.Array(StepSchema),
  problems: Schema.Array(McpDiagnosticSchema),
  partial: Schema.optionalKey(Schema.Boolean),
});
type SmokeSuccess = typeof Success.Type;

export const summarizeArgs = (params: Params): Readonly<Record<string, unknown>> => ({
  paths: params.paths.length,
  strict: params.strict ?? true,
  ...(params.timelines === undefined ? {} : { timelines: params.timelines.length }),
  ...(params.scenario === undefined
    ? {}
    : { scenario: typeof params.scenario === 'string' ? 'file' : 'inline' }),
  ...(params.assertions === undefined ? {} : { assertions: params.assertions.length }),
  timeoutMs: params.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  response_format: params.response_format ?? 'concise',
});

export const makeTool = (ai: EffectAi) =>
  ai.Tool.make(NAME, {
    description: DESCRIPTION,
    parameters: Parameters,
    success: Success,
    failure: ToolFailure,
  })
    .annotate(ai.Tool.Readonly, true)
    .annotate(ai.Tool.Meta, { 'anthropic/maxResultSizeChars': 200000 });

const header = (context: ToolContext, resolvedPath: string): string =>
  `eligian ${context.versions.compiler} · eligius ${context.versions.eligius} · ${NAME} · ${resolvedPath}`;

/** The `bin/cli.js` beside the running bundle (`dist/cli.mjs` → `bin/cli.js`). */
const defaultCliPath = (): string => fileURLToPath(new URL('../bin/cli.js', import.meta.url));

/** How the child gets its scenario: none, a file as is, or a temp file to write. */
type ScenarioSource =
  | { readonly kind: 'none' }
  | { readonly kind: 'file'; readonly file: string }
  | { readonly kind: 'temp'; readonly scenario: Scenario };

const usage = (message: string, file?: string): ToolIoError =>
  new ToolIoError({ message, ...(file === undefined ? {} : { path: file }) });

const checked = (json: unknown, file?: string): Effect.Effect<Scenario, ToolIoError> => {
  const parsed = parseScenario(json);
  return parsed.ok ? Effect.succeed(parsed.scenario) : Effect.fail(usage(parsed.message, file));
};

/** The scenario with the call's extra assertions appended. */
const withAssertions = (scenario: Scenario, assertions: Params['assertions']): unknown => ({
  ...scenario,
  ...(assertions === undefined
    ? {}
    : { assertions: [...(scenario.assertions ?? []), ...assertions] }),
});

/** FR-040: the scenario input, checked before anything is spawned. */
const scenarioSource = (
  params: Params,
  root: ProjectRoot
): Effect.Effect<ScenarioSource, ToolError> =>
  Effect.gen(function* () {
    const input = params.scenario;
    if (input === undefined) return { kind: 'none' } as const;
    if (typeof input === 'string') {
      const file = yield* resolveInputPath(root, input);
      const text = yield* Effect.tryPromise({
        try: () => fs.promises.readFile(file, 'utf8'),
        catch: toToolError('read', file),
      });
      const json = yield* Effect.try({
        try: (): unknown => JSON.parse(text),
        catch: cause =>
          usage(`the scenario ${file} is not JSON: ${(cause as Error).message}`, file),
      });
      const scenario = yield* checked(json, file);
      if (params.assertions === undefined) return { kind: 'file', file } as const;
      return {
        kind: 'temp',
        scenario: yield* checked(withAssertions(scenario, params.assertions), file),
      } as const;
    }
    const inline: Scenario = Array.isArray(input) ? { steps: input } : (input as Scenario);
    return {
      kind: 'temp',
      scenario: yield* checked(withAssertions(inline, params.assertions)),
    } as const;
  });

let tempCounter = 0;

const writeScenario = (scenario: Scenario): Effect.Effect<string, ToolError> =>
  Effect.suspend(() => {
    const file = path.join(os.tmpdir(), `eligian-scenario-${process.pid}-${tempCounter++}.json`);
    return Effect.tryPromise({
      try: () => fs.promises.writeFile(file, JSON.stringify(scenario), 'utf8'),
      catch: toToolError('write', file),
    }).pipe(Effect.as(file));
  });

const removeScenario = (file: string): Effect.Effect<void> =>
  Effect.tryPromise({
    try: () => fs.promises.rm(file, { force: true }),
    catch: toToolError('write', file),
  }).pipe(Effect.ignore);

/** One parsed stdout line of `eligian smoke --format ndjson`. */
interface NdjsonLine {
  readonly type: string;
  readonly [key: string]: unknown;
}

interface ChildOutcome {
  readonly lines: readonly NdjsonLine[];
  readonly exitCode: number | null;
  readonly timedOut: boolean;
  readonly stderr: string;
}

/** Kills the child (unless it already exited) and resolves once it has exited. */
const killAndWait = (child: ChildProcess): Promise<void> =>
  new Promise(resolve => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }
    child.once('exit', () => resolve());
    child.kill();
  });

/** Calls `onLine` with each complete line of the stream; returns the flush of the rest. */
const splitLines = (
  stream: NodeJS.ReadableStream,
  onLine: (line: string) => void
): (() => void) => {
  let rest = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk: string) => {
    rest += chunk;
    let newline = rest.indexOf('\n');
    while (newline !== -1) {
      onLine(rest.slice(0, newline).replace(/\r$/, ''));
      rest = rest.slice(newline + 1);
      newline = rest.indexOf('\n');
    }
  });
  return () => {
    if (rest !== '') onLine(rest);
    rest = '';
  };
};

const toStderr = (line: string): void => {
  process.stderr.write(`smoke: ${line}\n`);
};

const parseLine = (line: string): NdjsonLine | undefined => {
  try {
    const value: unknown = JSON.parse(line);
    return typeof value === 'object' &&
      value !== null &&
      typeof (value as { type?: unknown }).type === 'string'
      ? (value as NdjsonLine)
      : undefined;
  } catch {
    return undefined;
  }
};

/**
 * The child run (FR-041–FR-044). The returned canceler kills the child and waits for its exit,
 * so an interrupted call leaves no process behind.
 */
const spawnSmoke = (
  cliPath: string,
  args: readonly string[],
  cwd: string,
  timeoutMs: number,
  onSpawn: SmokeToolOptions['onSpawn'],
  scenarioFile: string | undefined
): Effect.Effect<ChildOutcome, ToolError> =>
  Effect.callback<ChildOutcome, ToolError>(resume => {
    const lines: NdjsonLine[] = [];
    const stderr: string[] = [];
    let timedOut = false;
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const flushOut = splitLines(child.stdout!, line => {
      if (line === '') return;
      const parsed = parseLine(line);
      if (parsed) lines.push(parsed);
      else toStderr(line);
    });
    const flushErr = splitLines(child.stderr!, line => {
      stderr.push(line);
      toStderr(line);
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    child.once('error', error => {
      clearTimeout(timer);
      resume(Effect.fail(toToolError('read', cliPath)(error)));
    });
    child.once('close', exitCode => {
      clearTimeout(timer);
      // After a kill the last line may be cut off: only complete lines count (FR-042)
      if (!timedOut) flushOut();
      flushErr();
      resume(Effect.succeed({ lines, exitCode, timedOut, stderr: stderr.join('\n') }));
    });
    if (child.pid !== undefined) onSpawn?.(child.pid, scenarioFile);
    return Effect.promise(() => {
      clearTimeout(timer);
      return killAndWait(child);
    });
  });

/** The concise steps (FR-005, FR-045): per step, the snapshot entries that changed. */
const conciseSteps = (steps: readonly ScenarioStepResult[]): ScenarioStepResult[] =>
  steps.map((step, i) => {
    if (i === 0) return step;
    const previous = steps[i - 1].snapshot;
    const snapshot: Record<string, Snapshot[string]> = {};
    for (const [key, value] of Object.entries(step.snapshot)) {
      if (key === 'activeTimelineActions' || !isDeepStrictEqual(previous[key], value)) {
        snapshot[key] = value;
      }
    }
    return { ...step, snapshot };
  });

/** Strips the ndjson `type` and `file` keys. */
const fieldsOf = <T>(line: NdjsonLine): T => {
  const { type: _type, file: _file, ...fields } = line;
  return fields as T;
};

export const handle = (
  params: Params,
  context: ToolContext
): Effect.Effect<SmokeSuccess, ToolError> =>
  Effect.gen(function* () {
    const root = yield* projectRoot(context.ai, context.cwd);
    const files = yield* resolveInputPatterns(root, params.paths);
    const knowledge = yield* loadKnowledge(context.docsRoot);
    if (params.assertions !== undefined && params.scenario === undefined) {
      return yield* usage('assertions need a scenario: they are evaluated against its steps');
    }
    const programs: string[] = [];
    for (const file of files) {
      const text = yield* Effect.tryPromise({
        try: () => fs.promises.readFile(file, 'utf8'),
        catch: toToolError('read', file),
      });
      if (!isLibrary(text)) programs.push(file);
    }
    if (params.scenario !== undefined && programs.length > 1) {
      return yield* usage(
        `a scenario applies to one program file; these paths match ${programs.length}: ` +
          programs.join(', ')
      );
    }
    const source = yield* scenarioSource(params, root);

    const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const cliPath = context.smoke?.cliPath ?? defaultCliPath();
    const run = (scenarioFile: string | undefined) =>
      spawnSmoke(
        cliPath,
        [
          'smoke',
          ...files,
          '--format',
          'ndjson',
          ...((params.strict ?? true) ? ['--strict'] : []),
          ...(params.timelines ?? []).flatMap(name => ['--timeline', name]),
          ...(scenarioFile === undefined ? [] : ['--scenario', scenarioFile]),
          ...(params.stepTimeoutMs === undefined
            ? []
            : ['--step-timeout-ms', String(params.stepTimeoutMs)]),
        ],
        root.root,
        timeoutMs,
        context.smoke?.onSpawn,
        scenarioFile
      );
    const outcome =
      source.kind === 'temp'
        ? yield* Effect.acquireUseRelease(writeScenario(source.scenario), run, removeScenario)
        : yield* run(source.kind === 'file' ? source.file : undefined);

    if (outcome.exitCode === 2 && !outcome.timedOut) {
      return yield* usage(`eligian smoke exited 2: ${outcome.stderr.trim()}`);
    }
    if (!outcome.timedOut && !outcome.lines.some(line => line.type === 'summary')) {
      return yield* usage(
        `eligian smoke exited ${outcome.exitCode} without a summary: ${outcome.stderr.trim()}`
      );
    }

    const resultFiles: { file: string; timelines: SmokeTimeline[] }[] = [];
    const steps: ScenarioStepResult[] = [];
    const problems: FileSmokeProblem[] = [];
    for (const line of outcome.lines) {
      const file = typeof line.file === 'string' ? line.file : undefined;
      if (line.type === 'file' && file !== undefined) {
        resultFiles.push({ file, timelines: [] });
      } else if (line.type === 'timeline') {
        const entry = resultFiles.find(f => f.file === file) ?? resultFiles[resultFiles.length - 1];
        entry?.timelines.push(fieldsOf<SmokeTimeline>(line));
      } else if (line.type === 'step') {
        steps.push(fieldsOf<ScenarioStepResult>(line));
      } else if (line.type === 'problem') {
        problems.push({ ...fieldsOf<FileSmokeProblem>(line), file: file ?? programs[0] });
      }
    }
    if (outcome.timedOut) {
      problems.push({
        code: 'smoke-timeout',
        severity: 'error',
        message: `eligian_smoke stopped the run after ${timeoutMs} ms; the result holds what was played before`,
        file: programs[0] ?? files[0],
      });
    }
    const diagnostics = smokeToMcpDiagnostics(problems, knowledge.overlays, file =>
      fs.readFileSync(file, 'utf8')
    );
    return {
      header: header(context, files.length === 1 ? files[0] : root.root),
      ok: !outcome.timedOut && diagnostics.every(d => d.severity !== 'error'),
      files: resultFiles,
      steps: params.response_format === 'detailed' ? steps : conciseSteps(steps),
      problems: diagnostics,
      ...(outcome.timedOut ? { partial: true } : {}),
    };
  });
