/**
 * The eval runner (spec 058; Phase 3 plan E, FR-001–FR-009, FR-023): packs the CLI once, then per
 * case × arm × run installs the tarball into a fresh project, prepares the arm, lets `claude -p`
 * work on the case, runs the gate (gate.ts), scores the rubric (A0 and A1) and writes
 * `results/<run-id>/<case>/<arm>-<n>.json` plus `summary.md`.
 *
 *   pnpm evals:mcp [--case <id> ...] [--arm A0|A1|A-none ...] [--runs <n>] [--model <m>]
 *                  [--call-budget off|enforce]
 *   pnpm evals:mcp --write-budgets <run-id>
 *   pnpm evals:mcp --persona terse|detailed|vague ... [--runs <n>] [--model <m>] [--user-model <m>]
 *
 * `--persona` runs the interview eval instead of the cases (spec 059 FR-034 to FR-043): per persona
 * × run a fresh project, the agent interviewed turn by turn by a simulated user (`claude -p
 * --resume`), each agent message judged, results under `results/<run-id>/interview/`. The turn
 * loop, the measures and the verdict are the bundle's `runInterview` (`interview.ts`); the runner
 * only injects the processes.
 *
 * Runs locally under the user's Claude subscription (decision 9), under tsx, outside Biome and
 * every tsconfig. It imports nothing from `packages/**\/src`: the arguments, the arm setup, the
 * metrics, the result schema, the summary and the budgets come from the build output
 * `packages/cli/dist/evals/assert.mjs` (FR-083), loaded by gate.ts's `loadEvalBundle`.
 */

import { type SpawnSyncOptions, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Schema } from 'effect';
import {
  type Arm,
  type AssertionResult,
  CASES_DIR,
  type EvalCase,
  type GateResult,
  type GateStep,
  loadCase,
  loadEvalBundle,
  type RunMetrics,
  runGate,
} from './gate.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const CLI_DIR = path.join(REPO, 'packages', 'cli');
const RESULTS_DIR = path.join(HERE, 'results');
const RUBRIC_FILE = path.join(HERE, 'rubric.md');
/** Spec 059 FR-042: the round-message judge's pinned prompt. */
const INTERVIEW_JUDGE_FILE = path.join(HERE, 'interview-judge.md');
/** Spec 059 FR-039: the simulated user's prompt (the hook script reads the same file, FR-040). */
const SIMULATED_USER_FILE = path.join(HERE, 'simulated-user.md');
/** Spec 059 FR-037: the persona sheets, `personas/<name>.json`. */
const PERSONAS_DIR = path.join(HERE, 'personas');
/** Spec 059 FR-030: the arm A1 `Elicitation` hook script. */
const HOOK_SCRIPT = path.join(HERE, 'elicitation-hook.cjs');
const WINDOWS = process.platform === 'win32';
/** The agent is stopped after this long; the gate's budget is 15 min (FR-008). */
const AGENT_TIMEOUT_MS = 30 * 60 * 1000;
const JUDGE_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_BUFFER = 512 * 1024 * 1024;
/** A result record's file name; the transcript and the log beside it have other suffixes. */
const RECORD_FILE = /^(A0|A1|A-none)-\d+\.json$/;

/** FR-005: harness.ts's RunRecord, as the bundle returns it. */
interface RunRecord {
  readonly runId: string;
  readonly case: string;
  readonly arm: Arm;
  readonly n: number;
  readonly model: string;
  readonly cliVersion: string;
  readonly aborted: boolean;
  readonly pass: boolean;
  readonly steps: readonly { readonly step: GateStep; readonly failures: readonly string[] }[];
  readonly toolSequence: readonly string[];
  readonly metrics: RunMetrics;
  readonly usage: {
    readonly input_tokens: number;
    readonly output_tokens: number;
    readonly [key: string]: unknown;
  } | null;
  readonly wallMs: number;
  readonly assertions: readonly AssertionResult[];
  readonly rubric: { readonly score: number; readonly model: string } | null;
  /** Spec 059 FR-031 / FR-032: the brief fixture written, and an approved brief after the agent */
  readonly brief?: { readonly fixture: boolean; readonly approved: boolean };
  /** Spec 059 FR-048: what every claude spawn of the run was started with */
  readonly isolation?: Isolation;
}

/** harness.ts's Isolation (spec 059 FR-048). */
interface Isolation {
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
}

/** harness.ts's ArmSetup (spec 059 FR-029). */
interface ArmSetup {
  readonly mcpConfig: string;
  readonly allowedTools: string;
  readonly stateDir?: string;
  readonly briefFixture: boolean;
  readonly env: Readonly<Record<string, string>>;
}

/**
 * harness.ts's ElicitationHookSpec: `accept` for the case runs (spec 059 FR-030), `persona` for
 * the interview (FR-040).
 */
type ElicitationHookSpec =
  | { readonly mode: 'accept'; readonly script: string }
  | {
      readonly mode: 'persona';
      readonly script: string;
      readonly sheet: string;
      readonly conversation: string;
      readonly userModel: string;
    };

/** interview.ts's PersonaName (spec 059 FR-037). */
type PersonaName = 'terse' | 'detailed' | 'vague';

/** interview.ts's PersonaSheet; the runner only hands it back to the bundle. */
interface PersonaSheet {
  readonly opening: string;
  readonly [key: string]: unknown;
}

/** interview.ts's InterviewRecord (spec 059 Key entities): the fields the runner reads. */
interface InterviewRecord {
  readonly persona: PersonaName;
  readonly n: number;
  readonly endReason: 'approved' | 'turn-limit' | 'time-limit' | 'aborted';
  readonly aborted: boolean;
  readonly approved: boolean;
  readonly pass: boolean;
  readonly [key: string]: unknown;
}

/** interview.ts's InterviewRun (plan §9). */
interface InterviewRun {
  readonly runId: string;
  readonly persona: PersonaName;
  readonly n: number;
  readonly sheet: PersonaSheet;
  readonly model: string;
  readonly userModel: string;
  readonly cliVersion: string;
  readonly projectDir: string;
  readonly stateDir: string;
  readonly scratch: string;
  /** results/<run-id>/interview */
  readonly outDir: string;
  readonly mcpLog: string;
  readonly isolation: Isolation;
  readonly prompts: { readonly simulatedUser: string; readonly judge: string };
}

/** interview.ts's InterviewDeps (plan §9): every process the turn loop starts. */
interface InterviewDeps {
  readonly agentTurn: (input: {
    readonly message: string;
    readonly sessionId: string | undefined;
    readonly turn: number;
  }) => Promise<{ readonly stdout: string; readonly started: boolean; readonly wallMs: number }>;
  readonly userReply: (prompt: string) => Promise<string | undefined>;
  readonly judge: (prompt: string) => Promise<string | undefined>;
  readonly parseTranscript: (text: string) => unknown[];
}

/** harness.ts's HarnessArgs. */
interface HarnessArgs {
  readonly cases: readonly string[];
  readonly arms: readonly Arm[];
  readonly runs: number;
  readonly model?: string;
  readonly callBudget: 'off' | 'enforce';
  readonly writeBudgets?: string;
  /** Spec 059 FR-034: present only in persona mode */
  readonly personas?: readonly PersonaName[];
  /** FR-039: the resolved --user-model id, when given */
  readonly userModel?: string;
}

/** The part of the eval bundle the runner uses (packages/cli/src/mcp/evals/{harness,transcript,gate-steps,interview}.ts). */
interface RunBundle {
  readonly HARNESS_USAGE: string;
  /** I-6: the aliases of --model; `sonnet` is the default agent and user model of the interview */
  readonly MODELS: Readonly<Record<'sonnet' | 'opus', string>>;
  parseHarnessArgs(
    argv: readonly string[],
    knownCases: readonly string[]
  ): HarnessArgs | 'help' | string;
  prepareArmProject(
    arm: Arm,
    project: {
      dir: string;
      cli: string;
      mcpLog: string;
      scratch: string;
      hook?: ElicitationHookSpec;
      brief?: { fixture: string; caseId: string; now?: Date };
    }
  ): Promise<ArmSetup>;
  agentIsolation(installedPlugins?: readonly string[]): Isolation;
  caseAgentArgv(o: {
    prompt: string;
    setup: Pick<ArmSetup, 'mcpConfig' | 'allowedTools'>;
    model: string;
    isolation: Isolation;
  }): string[];
  interviewTurnArgv(o: {
    message: string;
    sessionId: string | undefined;
    setup: Pick<ArmSetup, 'mcpConfig' | 'allowedTools'>;
    model: string;
    isolation: Isolation;
  }): string[];
  noToolsArgv(o: { model: string; mcpConfig: string; isolation: Isolation }): string[];
  spawnEnv(o: {
    base: NodeJS.ProcessEnv;
    setup?: { env: Readonly<Record<string, string>> };
    isolation: Isolation;
  }): Record<string, string | undefined>;
  briefStateOf(
    projectDir: string,
    stateDir: string
  ): Promise<'none' | 'open' | 'complete' | 'confirmed' | 'approved'>;
  materialiseFixtures(evalCase: EvalCase, casesDir: string, dir: string): readonly string[];
  parseTranscript(text: string): unknown[];
  toolCalls(events: readonly unknown[]): { name: string }[];
  computeMetrics(
    arm: Arm,
    events: readonly unknown[],
    log: readonly unknown[],
    wallMs?: number
  ): RunMetrics;
  readMcpLog(file: string): unknown[];
  caseVerdict(runs: readonly RunRecord[]): { pass: boolean; passed: number; denominator: number };
  renderSummary(records: readonly RunRecord[]): string;
  writeBudgets(records: readonly RunRecord[], casesDir: string, runId: string): readonly string[];
  readonly RunRecordSchema: Schema.Codec<RunRecord>;
  // Spec 059 FR-034 to FR-043 (interview.ts)
  readonly PERSONA_NAMES: readonly PersonaName[];
  parsePersonaSheet(json: unknown): PersonaSheet | string;
  runInterview(run: InterviewRun, deps: InterviewDeps): Promise<InterviewRecord>;
  renderInterviewSummary(records: readonly InterviewRecord[], isolation: Isolation): string;
  interviewVerdict(records: readonly InterviewRecord[]): {
    pass: boolean;
    passed: number;
    of: number;
  };
}

/** The interview names the bundle must export; a stale build lacks them (spec 059 FR-034). */
const INTERVIEW_EXPORTS = [
  'PERSONA_NAMES',
  'parsePersonaSheet',
  'runInterview',
  'renderInterviewSummary',
  'interviewVerdict',
  'interviewTurnArgv',
  'MODELS',
] as const;

const message = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** The case ids: `cases/<id>.json`, the scenarios beside them excluded. */
function knownCases(): string[] {
  return fs
    .readdirSync(CASES_DIR)
    .filter(file => file.endsWith('.json') && !file.endsWith('.scenario.json'))
    .map(file => file.slice(0, -'.json'.length))
    .sort();
}

/** Runs a command; on Windows through the shell (pnpm / npm are .cmd shims), args quoted. */
function exec(command: string, args: readonly string[], options: SpawnSyncOptions = {}) {
  const quoted = WINDOWS ? args.map(arg => (/[\s"&|<>^()]/.test(arg) ? `"${arg}"` : arg)) : args;
  const result = spawnSync(command, quoted, {
    encoding: 'utf8',
    shell: WINDOWS,
    stdio: ['ignore', 'pipe', 'inherit'],
    ...options,
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed (${result.error?.message ?? `exit ${result.status}`})\n${String(result.stdout ?? '').trim()}`
    );
  }
  return String(result.stdout ?? '');
}

/**
 * Spec 059 FR-048 (plan "Isolation", P2): the ids of the installed plugins, read once per run with
 * `claude plugin list --json` (an array of objects with an `id`). A failure gives no ids and a
 * warning, printed to stderr and recorded in the summary.
 */
function installedPlugins(lib: RunBundle): { ids: string[]; warning?: string } {
  const result = spawnSync('claude', ['plugin', 'list', '--json'], {
    encoding: 'utf8',
    env: lib.spawnEnv({ base: process.env, isolation: lib.agentIsolation() }),
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: MAX_BUFFER,
    timeout: JUDGE_TIMEOUT_MS,
  });
  let failure: string;
  if (result.error || result.status !== 0) {
    failure = result.error?.message ?? `exit ${result.status}`;
  } else {
    try {
      const list = JSON.parse(String(result.stdout)) as unknown;
      if (Array.isArray(list)) {
        return {
          ids: list
            .map(entry => (entry as { id?: unknown } | null)?.id)
            .filter((id): id is string => typeof id === 'string' && id !== ''),
        };
      }
      failure = 'the output is not a JSON array';
    } catch (error) {
      failure = message(error);
    }
  }
  const warning = `Warning: \`claude plugin list --json\` failed (${failure}); no plugin was disabled by id.`;
  console.error(`run: ${warning}`);
  return { ids: [], warning };
}

function git(args: readonly string[]): string {
  return spawnSync('git', args, { cwd: REPO, encoding: 'utf8' }).stdout.trim();
}

function readVersion(packageJson: string): string {
  return (JSON.parse(fs.readFileSync(packageJson, 'utf8')) as { version: string }).version;
}

/** Packs packages/cli once per run (its prepack is the production build). */
function pack(): { tarball: string; version: string } {
  const version = readVersion(path.join(CLI_DIR, 'package.json'));
  const tarball = path.join(CLI_DIR, `eligian-${version}.tgz`);
  console.error(`run: pnpm -C packages/cli pack (eligian ${version})`);
  exec('pnpm', ['-C', 'packages/cli', 'pack'], {
    cwd: REPO,
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  if (!fs.existsSync(tarball)) throw new Error(`pack did not produce ${tarball}`);
  return { tarball, version };
}

// ---------------------------------------------------------------------------------------------
// The pinned judge prompts: rubric.md (FR-009) and interview-judge.md (spec 059 FR-042); each
// one's frontmatter pins its judge model.

interface PinnedPrompt {
  readonly model: string;
  readonly prompt: string;
}

/** The rubric of FR-009. */
type Rubric = PinnedPrompt;

function loadPinnedPrompt(file: string): PinnedPrompt {
  if (!fs.existsSync(file)) throw new Error(`the judge prompt ${file} does not exist`);
  const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  const model = match ? /^judge-model:\s*(\S+)\s*$/m.exec(match[1])?.[1] : undefined;
  if (!match || model === undefined) {
    throw new Error(`${file} needs a frontmatter line \`judge-model: <model id>\``);
  }
  return { model, prompt: match[2].trim() };
}

/**
 * A `claude -p` with no tools and no server (the rubric judge of FR-009; spec 059: the simulated
 * user, FR-039, and the round-message judge, FR-042): the prompt on stdin (no shell, no
 * command-line length limit), `--tools ""` (every built-in tool off), run in `dir` (created, with an
 * empty `mcp-empty.json`) and isolated as the agent is (FR-048). Gives the final `result` text.
 */
function askWithoutTools(
  lib: RunBundle,
  o: { model: string; isolation: Isolation; dir: string; prompt: string }
): { text: string } | { failure: string } {
  fs.mkdirSync(o.dir, { recursive: true });
  const mcpConfig = path.join(o.dir, 'mcp-empty.json');
  fs.writeFileSync(mcpConfig, `${JSON.stringify({ mcpServers: {} }, null, 2)}\n`);
  const result = spawnSync(
    'claude',
    lib.noToolsArgv({ model: o.model, mcpConfig, isolation: o.isolation }),
    {
      cwd: o.dir,
      input: o.prompt,
      encoding: 'utf8',
      env: lib.spawnEnv({ base: process.env, isolation: o.isolation }),
      stdio: ['pipe', 'pipe', 'inherit'],
      maxBuffer: MAX_BUFFER,
      timeout: JUDGE_TIMEOUT_MS,
    }
  );
  if (result.error || result.status !== 0) {
    return { failure: result.error?.message ?? `exit ${result.status}` };
  }
  const text = finalResult(lib.parseTranscript(result.stdout))?.result;
  return typeof text === 'string' ? { text } : { failure: 'the output has no result text' };
}

/** A fenced block whose fence is longer than any backtick run in the text. */
function fence(text: string, lang: string): string {
  const longest = Math.max(0, ...[...text.matchAll(/`+/g)].map(run => run[0].length));
  const ticks = '`'.repeat(Math.max(3, longest + 1));
  return `${ticks}${lang}\n${text.trimEnd()}\n${ticks}`;
}

/** The transcript's final `result` event; undefined when it has none. */
function finalResult(events: readonly unknown[]): Record<string, unknown> | undefined {
  return events.findLast(
    event =>
      typeof event === 'object' && event !== null && (event as { type?: unknown }).type === 'result'
  ) as Record<string, unknown> | undefined;
}

/**
 * FR-009: a second `claude -p` over rubric.md + STORYBOARD.md + the entry, with no tools and no
 * server. The score is the integer on the last `SCORE: n` line; any failure gives null. It never
 * gates.
 */
function judge(
  lib: RunBundle,
  rubric: Rubric,
  isolation: Isolation,
  project: { dir: string; entry: string; scratch: string }
): RunRecord['rubric'] {
  try {
    const read = (file: string, absent: string) => {
      const full = path.join(project.dir, file);
      return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : absent;
    };
    const prompt = [
      rubric.prompt,
      '## STORYBOARD.md',
      fence(read('STORYBOARD.md', '(the project has no STORYBOARD.md)'), 'markdown'),
      `## ${project.entry}`,
      fence(read(project.entry, `(the project has no ${project.entry})`), 'eligian'),
      '',
    ].join('\n\n');
    const answer = askWithoutTools(lib, {
      model: rubric.model,
      isolation,
      dir: path.join(project.scratch, 'judge'),
      prompt,
    });
    if ('failure' in answer) {
      console.error(`run: judge failed (${answer.failure})`);
      return null;
    }
    const scores = [...answer.text.matchAll(/^\s*SCORE:\s*([1-5])\s*$/gm)];
    const last = scores.at(-1);
    if (last === undefined) {
      console.error('run: the judge answered without a SCORE: line');
      return null;
    }
    return { score: Number(last[1]), model: rubric.model };
  } catch (error) {
    console.error(`run: judge failed (${message(error)})`);
    return null;
  }
}

// ---------------------------------------------------------------------------------------------
// One run (FR-003–FR-005)

interface RunContext {
  readonly lib: RunBundle;
  readonly args: HarnessArgs;
  readonly runId: string;
  readonly outDir: string;
  readonly tarball: string;
  readonly packedVersion: string;
  readonly rubric: Rubric | undefined;
  /** Spec 059 FR-048: read once per run from the installed plugins */
  readonly isolation: Isolation;
}

/** FR-005: the final `result` event's usage, other keys kept; null without input / output tokens. */
function usageOf(final: Record<string, unknown> | undefined): RunRecord['usage'] {
  const usage = final?.usage as Record<string, unknown> | undefined;
  return typeof usage?.input_tokens === 'number' && typeof usage.output_tokens === 'number'
    ? (usage as RunRecord['usage'])
    : null;
}

async function runOnce(ctx: RunContext, id: string, arm: Arm, n: number): Promise<RunRecord> {
  const { lib, args } = ctx;
  const evalCase = loadCase(id);
  const model = args.model ?? evalCase.model;
  const tag = `${id} ${arm} #${n}`;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `eligian-eval-${id}-${arm}-${n}-`));
  // Outside the project: the arm's empty-server config, the telemetry log, the judge's directory.
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), `eligian-eval-scratch-${id}-${arm}-${n}-`));
  const mcpLog = path.join(scratch, 'mcp.log');
  const outBase = path.join(ctx.outDir, id, `${arm}-${n}`);
  fs.mkdirSync(path.dirname(outBase), { recursive: true });
  console.error(`run: ${tag} in ${dir}`);

  const setupFailures: string[] = [];
  let cliVersion = ctx.packedVersion;
  let events: unknown[] = [];
  let wallMs = 0;
  let setup: ArmSetup | undefined;
  try {
    // 1. A project with the tarball installed.
    exec('npm', ['init', '-y'], { cwd: dir });
    exec('npm', ['install', ctx.tarball], { cwd: dir });
    const installed = path.join(dir, 'node_modules', 'eligian');
    const cli = path.join(installed, 'bin', 'cli.js');
    cliVersion = readVersion(path.join(installed, 'package.json'));
    // 2. The case's start files (a case without a start directory starts empty) and its
    //    fixtures; a missing fixture is a named step-1 failure (Edge cases), and the run goes on.
    const start = path.join(CASES_DIR, id, 'start');
    if (fs.existsSync(start)) fs.cpSync(start, dir, { recursive: true });
    setupFailures.push(
      ...lib.materialiseFixtures(evalCase, CASES_DIR, dir).map(failure => `setup: ${failure}`)
    );
    // 3. The arm, after the install (A-none deletes the installed docs). A1 also gets the accept
    //    hook and, for a case with `cases/<id>/brief.md`, that brief signed as confirmed
    //    (spec 059 FR-029, FR-030); the A1 env carries ELIGIAN_MCP_LOG and ELIGIAN_STATE_DIR.
    const fixture = path.join(CASES_DIR, id, 'brief.md');
    setup = await lib.prepareArmProject(arm, {
      dir,
      cli,
      mcpLog,
      scratch,
      ...(arm === 'A1'
        ? {
            hook: { mode: 'accept', script: HOOK_SCRIPT },
            ...(fs.existsSync(fixture)
              ? { brief: { fixture: fs.readFileSync(fixture, 'utf8'), caseId: id } }
              : {}),
          }
        : {}),
    });
    // 4. The agent (claude.exe on Windows: no shell, so the prompt needs no quoting), isolated
    //    (spec 059 FR-048).
    const started = Date.now();
    const agent = spawnSync(
      'claude',
      lib.caseAgentArgv({ prompt: evalCase.prompt, setup, model, isolation: ctx.isolation }),
      {
        cwd: dir,
        encoding: 'utf8',
        env: lib.spawnEnv({ base: process.env, setup, isolation: ctx.isolation }),
        stdio: ['ignore', 'pipe', 'inherit'],
        maxBuffer: MAX_BUFFER,
        timeout: AGENT_TIMEOUT_MS,
      }
    );
    wallMs = Date.now() - started;
    if (agent.error) console.error(`run: ${tag}: claude: ${agent.error.message}`);
    const stdout = String(agent.stdout ?? '');
    fs.writeFileSync(`${outBase}.transcript.json`, stdout);
    events = lib.parseTranscript(stdout);
  } catch (error) {
    setupFailures.push(`setup: ${message(error)}`);
  }
  if (fs.existsSync(mcpLog)) fs.copyFileSync(mcpLog, `${outBase}.mcp.log`);
  const elicitations = path.join(scratch, 'elicitations.log');
  if (fs.existsSync(elicitations)) fs.copyFileSync(elicitations, `${outBase}.elicitations.log`);

  // Spec 059 FR-031: whether the brief was approved by the end of the run (A1 only).
  let approved = false;
  if (arm === 'A1' && setup?.stateDir !== undefined) {
    try {
      approved = (await lib.briefStateOf(dir, setup.stateDir)) === 'approved';
    } catch (error) {
      console.error(`run: ${tag}: brief state: ${message(error)}`);
    }
  }

  // 5. A run whose transcript has no `result` event is aborted (Edge cases).
  const final = finalResult(events);
  const aborted = final === undefined;

  // 6. The gate, steps 1–6.
  let gate: Pick<GateResult, 'pass' | 'steps' | 'assertions' | 'metrics'>;
  try {
    gate = await runGate({
      dir,
      caseId: id,
      transcript: events,
      wallMs,
      callBudget: args.callBudget,
      arm,
      mcpLog,
    });
  } catch (error) {
    gate = {
      pass: false,
      steps: ([1, 2, 3, 4, 5, 6] as const).map(step => ({
        step,
        failures: step === 1 ? [`gate: ${message(error)}`] : [],
      })),
      assertions: [],
      metrics: lib.computeMetrics(arm, events, lib.readMcpLog(mcpLog), wallMs),
    };
  }
  const steps = gate.steps.map(entry =>
    entry.step === 1 ? { step: entry.step, failures: [...setupFailures, ...entry.failures] } : entry
  );

  // 7. The rubric: A0 and A1 only, never for an aborted run; it never gates (FR-009).
  const rubric =
    arm !== 'A-none' && !aborted && ctx.rubric !== undefined
      ? judge(lib, ctx.rubric, ctx.isolation, { dir, entry: evalCase.entry, scratch })
      : null;

  const record: RunRecord = {
    runId: ctx.runId,
    case: id,
    arm,
    n,
    model,
    cliVersion,
    aborted,
    pass: !aborted && setupFailures.length === 0 && gate.pass,
    steps,
    toolSequence: lib.toolCalls(events).map(call => call.name),
    metrics: gate.metrics,
    usage: usageOf(final),
    wallMs,
    assertions: gate.assertions,
    rubric,
    brief: { fixture: setup?.briefFixture ?? false, approved },
    isolation: ctx.isolation,
  };
  // SC-006(4): every record written decodes as a RunRecord.
  Schema.decodeUnknownSync(lib.RunRecordSchema)(record);
  fs.writeFileSync(`${outBase}.json`, `${JSON.stringify(record, null, 2)}\n`);
  const verdict = aborted ? 'ABORTED' : record.pass ? 'PASS' : 'FAIL';
  console.error(`run: ${tag} ${verdict} → ${path.relative(REPO, `${outBase}.json`)}`);
  return record;
}

// ---------------------------------------------------------------------------------------------
// The interview eval (spec 059 FR-034 to FR-043, plan §12)

interface InterviewContext {
  readonly lib: RunBundle;
  readonly args: HarnessArgs;
  readonly personas: readonly PersonaName[];
  readonly runId: string;
  /** results/<run-id>/interview */
  readonly outDir: string;
  readonly tarball: string;
  readonly isolation: Isolation;
  /** The agent under test; the simulated user (FR-039, default MODELS.sonnet) */
  readonly model: string;
  readonly userModel: string;
  readonly sheets: ReadonlyMap<PersonaName, { readonly file: string; readonly sheet: PersonaSheet }>;
  readonly judgePrompt: PinnedPrompt;
  readonly simulatedUser: string;
}

/** FR-037: `personas/<name>.json`, decoded by the bundle's `parsePersonaSheet`; a bad sheet throws. */
function loadPersonaSheet(
  lib: RunBundle,
  persona: PersonaName
): { file: string; sheet: PersonaSheet } {
  const file = path.join(PERSONAS_DIR, `${persona}.json`);
  if (!fs.existsSync(file)) throw new Error(`the persona sheet ${file} does not exist`);
  let json: unknown;
  try {
    json = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`${file} is not JSON: ${message(error)}`);
  }
  const sheet = lib.parsePersonaSheet(json);
  if (typeof sheet === 'string') throw new Error(`${file}: ${sheet}`);
  return { file, sheet };
}

/** FR-039: `simulated-user.md`, a plain prompt (no frontmatter: its model is --user-model). */
function loadSimulatedUser(): string {
  if (!fs.existsSync(SIMULATED_USER_FILE)) {
    throw new Error(`the simulated user's prompt ${SIMULATED_USER_FILE} does not exist`);
  }
  return fs.readFileSync(SIMULATED_USER_FILE, 'utf8').replace(/\r\n/g, '\n').trim();
}

/**
 * One interview run (FR-035): a fresh project with the tarball installed, arm A1 with the
 * persona-mode `Elicitation` hook (FR-040), then the bundle's turn loop with the three processes
 * injected. A failure before the loop is printed and gives no record (the verdict counts it).
 */
async function interviewOnce(
  ctx: InterviewContext,
  persona: PersonaName,
  n: number
): Promise<InterviewRecord | undefined> {
  const { lib, isolation } = ctx;
  const tag = `interview ${persona} #${n}`;
  const { file: sheetFile, sheet } = ctx.sheets.get(persona)!;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `eligian-interview-${persona}-${n}-`));
  // Outside the project: the state directory, the telemetry and hook logs, the conversation,
  // and the simulated user's and the judge's directories.
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), `eligian-interview-scratch-${persona}-${n}-`));
  const mcpLog = path.join(scratch, 'mcp.log');
  const outBase = path.join(ctx.outDir, `${persona}-${n}`);
  console.error(`run: ${tag} in ${dir}`);
  try {
    exec('npm', ['init', '-y'], { cwd: dir });
    exec('npm', ['install', ctx.tarball], { cwd: dir });
    const installed = path.join(dir, 'node_modules', 'eligian');
    const cli = path.join(installed, 'bin', 'cli.js');
    const cliVersion = readVersion(path.join(installed, 'package.json'));
    // FR-035: no BRIEF.md; FR-040: the hook asks the simulated user for both sign-offs.
    const setup = await lib.prepareArmProject('A1', {
      dir,
      cli,
      mcpLog,
      scratch,
      hook: {
        mode: 'persona',
        script: HOOK_SCRIPT,
        sheet: sheetFile,
        conversation: path.join(scratch, 'interview', 'conversation.json'),
        userModel: ctx.userModel,
      },
    });
    if (setup.stateDir === undefined) throw new Error('arm A1 gave no state directory');
    const run: InterviewRun = {
      runId: ctx.runId,
      persona,
      n,
      sheet,
      model: ctx.model,
      userModel: ctx.userModel,
      cliVersion,
      projectDir: dir,
      stateDir: setup.stateDir,
      scratch,
      outDir: ctx.outDir,
      mcpLog,
      isolation,
      prompts: { simulatedUser: ctx.simulatedUser, judge: ctx.judgePrompt.prompt },
    };
    const ask = (who: string, model: string, cwd: string) => async (prompt: string) => {
      const answer = askWithoutTools(lib, { model, isolation, dir: cwd, prompt });
      if ('text' in answer) return answer.text;
      console.error(`run: ${tag}: ${who} failed (${answer.failure})`);
      return undefined;
    };
    const deps: InterviewDeps = {
      // FR-035: turn 1 sends the opening as a plain message; later turns resume the session.
      agentTurn: async ({ message: text, sessionId, turn }) => {
        console.error(`run: ${tag} turn ${turn}`);
        const started = Date.now();
        const agent = spawnSync(
          'claude',
          lib.interviewTurnArgv({ message: text, sessionId, setup, model: ctx.model, isolation }),
          {
            cwd: dir,
            encoding: 'utf8',
            env: lib.spawnEnv({ base: process.env, setup, isolation }),
            stdio: ['ignore', 'pipe', 'inherit'],
            maxBuffer: MAX_BUFFER,
            timeout: AGENT_TIMEOUT_MS,
          }
        );
        if (agent.error) console.error(`run: ${tag} turn ${turn}: claude: ${agent.error.message}`);
        return {
          stdout: String(agent.stdout ?? ''),
          // spawnSync gives pid 0 when the process could not be started (FR-035 "aborted").
          started: (agent.pid ?? 0) > 0,
          wallMs: Date.now() - started,
        };
      },
      userReply: ask('the simulated user', ctx.userModel, path.join(scratch, 'user')),
      judge: ask('the round-message judge', ctx.judgePrompt.model, path.join(scratch, 'judge')),
      parseTranscript: text => lib.parseTranscript(text),
    };
    const record = await lib.runInterview(run, deps);
    const verdict = record.aborted ? 'ABORTED' : record.pass ? 'PASS' : 'FAIL';
    console.error(
      `run: ${tag} ${verdict} (${record.endReason}) → ${path.relative(REPO, `${outBase}.json`)}`
    );
    return record;
  } catch (error) {
    console.error(`run: ${tag}: setup failed: ${message(error)}`);
    return undefined;
  } finally {
    if (fs.existsSync(mcpLog)) fs.copyFileSync(mcpLog, `${outBase}.mcp.log`);
    const elicitations = path.join(scratch, 'elicitations.log');
    if (fs.existsSync(elicitations)) fs.copyFileSync(elicitations, `${outBase}.elicitations.log`);
  }
}

/**
 * FR-034: every persona × run serially; `summary.md` (the interview table and the provenance) is
 * rewritten after every run. True when every persona passes by FR-043's majority, a run that
 * failed before its loop counting as a failed run.
 */
async function runInterviews(ctx: InterviewContext, summary: string, provenance: string) {
  const { lib, args } = ctx;
  const records: InterviewRecord[] = [];
  const setupFailures: string[] = [];
  fs.mkdirSync(ctx.outDir, { recursive: true });
  for (const persona of ctx.personas) {
    for (let n = 1; n <= args.runs; n++) {
      const record = await interviewOnce(ctx, persona, n);
      if (record === undefined) {
        setupFailures.push(`${persona} #${n}: no record (the setup failed; counted as a fail)`);
      } else {
        records.push(record);
      }
      const failures =
        setupFailures.length === 0
          ? ''
          : `\n\nRuns without a record:\n\n${setupFailures.map(line => `- ${line}`).join('\n')}`;
      fs.writeFileSync(
        summary,
        `${lib.renderInterviewSummary(records, ctx.isolation).trimEnd()}${failures}\n\n${provenance}\n`
      );
    }
  }
  // FR-043: a strict majority of the persona's runs, over every run started (aborted runs and runs
  // without a record included).
  return ctx.personas.every(
    persona =>
      lib.interviewVerdict(records.filter(record => record.persona === persona)).passed >
      args.runs / 2
  );
}

// ---------------------------------------------------------------------------------------------
// --write-budgets <run-id> (FR-023): read and decode that run's records; writeBudgets rewrites.

function readRecords(lib: RunBundle, runId: string): RunRecord[] {
  if (runId !== path.basename(runId) || runId === '.' || runId === '..') {
    throw new Error(`--write-budgets takes a run id (a directory of ${RESULTS_DIR}), not ${runId}`);
  }
  const runDir = path.join(RESULTS_DIR, runId);
  if (!fs.existsSync(runDir) || !fs.statSync(runDir).isDirectory()) {
    throw new Error(`no results for run '${runId}': ${runDir} does not exist`);
  }
  const files = (fs.readdirSync(runDir, { recursive: true }) as string[])
    .filter(file => RECORD_FILE.test(path.basename(file)))
    .sort()
    .map(file => path.join(runDir, file));
  if (files.length === 0) {
    throw new Error(`no result records (<case>/<arm>-<n>.json) in ${runDir}`);
  }
  const decode = Schema.decodeUnknownSync(lib.RunRecordSchema);
  return files.map(file => {
    try {
      return decode(JSON.parse(fs.readFileSync(file, 'utf8')));
    } catch (error) {
      throw new Error(`${file} is not a result record: ${message(error)}`);
    }
  });
}

// ---------------------------------------------------------------------------------------------

/**
 * `--persona` (FR-034): the prompts, the sheets and the bundle's interview exports are checked
 * before anything is packed; then one isolation and one tarball for every run (FR-048). Exit 0
 * when every persona passes (FR-043), 1 otherwise, 2 for a stale bundle.
 */
async function interviewMain(
  lib: RunBundle,
  args: HarnessArgs,
  personas: readonly PersonaName[],
  run: { runId: string; head: string; treeClean: boolean; outDir: string }
): Promise<number> {
  const missing = INTERVIEW_EXPORTS.filter(name => lib[name] === undefined);
  if (missing.length > 0) {
    console.error(
      `run: the eval bundle has no ${missing.join(', ')}: rebuild it with \`pnpm -C packages/cli build\``
    );
    return 2;
  }
  let tarball: string | undefined;
  try {
    const judgePrompt = loadPinnedPrompt(INTERVIEW_JUDGE_FILE);
    const simulatedUser = loadSimulatedUser();
    const sheets = new Map(personas.map(persona => [persona, loadPersonaSheet(lib, persona)]));
    const plugins = installedPlugins(lib);
    const isolation = lib.agentIsolation(plugins.ids);
    const packed = pack();
    tarball = packed.tarball;
    const ctx: InterviewContext = {
      lib,
      args,
      personas,
      runId: run.runId,
      outDir: path.join(run.outDir, 'interview'),
      tarball,
      isolation,
      model: args.model ?? lib.MODELS.sonnet,
      userModel: args.userModel ?? lib.MODELS.sonnet,
      sheets,
      judgePrompt,
      simulatedUser,
    };
    const provenance = `HEAD ${run.head}${run.treeClean ? '' : ' (uncommitted changes)'}, eligian ${packed.version}, agent ${ctx.model}, simulated user ${ctx.userModel}, judge ${judgePrompt.model}${plugins.warning === undefined ? '' : `\n\n${plugins.warning}`}`;
    const summary = path.join(run.outDir, 'summary.md');
    const allPass = await runInterviews(ctx, summary, provenance);
    console.error(`run: summary → ${path.relative(REPO, summary)}`);
    return allPass ? 0 : 1;
  } catch (error) {
    console.error(`run: ${message(error)}`);
    return 1;
  } finally {
    if (tarball) fs.rmSync(tarball, { force: true });
  }
}

async function main(argv: readonly string[]): Promise<number> {
  let lib: RunBundle;
  try {
    lib = (await loadEvalBundle()) as unknown as RunBundle;
  } catch (error) {
    console.error(`run: ${message(error)}`);
    return 2;
  }
  const args = lib.parseHarnessArgs(argv, knownCases());
  if (args === 'help') {
    console.log(lib.HARNESS_USAGE);
    return 0;
  }
  if (typeof args === 'string') {
    console.error(`${args}\n\n${lib.HARNESS_USAGE}`);
    return 2;
  }

  if (args.writeBudgets !== undefined) {
    try {
      const records = readRecords(lib, args.writeBudgets);
      const changed = lib.writeBudgets(records, CASES_DIR, args.writeBudgets);
      console.error(
        `run: ${records.length} records of ${args.writeBudgets}; budgets written to ${changed.length} case files`
      );
      for (const file of changed) console.log(path.relative(REPO, file));
      return 0;
    } catch (error) {
      console.error(`run: ${message(error)}`);
      return 1;
    }
  }

  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  // Recorded before packing, so the tarball itself never counts as a change.
  const head = git(['rev-parse', 'HEAD']);
  const treeClean = git(['status', '--porcelain', '--', '.', ':!evals/mcp/results']) === '';
  const outDir = path.join(RESULTS_DIR, runId);
  // Spec 059 FR-034: --persona runs the interview eval instead of the cases.
  if (args.personas !== undefined) {
    return interviewMain(lib, args, args.personas, { runId, head, treeClean, outDir });
  }
  const records: RunRecord[] = [];
  let tarball: string | undefined;
  try {
    const rubric = args.arms.some(arm => arm !== 'A-none')
      ? loadPinnedPrompt(RUBRIC_FILE)
      : undefined;
    // Spec 059 FR-048: one isolation for every claude spawn of the run.
    const plugins = installedPlugins(lib);
    const isolation = lib.agentIsolation(plugins.ids);
    const packed = pack();
    tarball = packed.tarball;
    fs.mkdirSync(outDir, { recursive: true });
    const ctx: RunContext = {
      lib,
      args,
      runId,
      outDir,
      tarball,
      packedVersion: packed.version,
      rubric,
      isolation,
    };
    const provenance = `HEAD ${head}${treeClean ? '' : ' (uncommitted changes)'}, eligian ${packed.version}, call budget ${args.callBudget}${plugins.warning === undefined ? '' : `\n\n${plugins.warning}`}`;
    // Cases run serially (FR-001); the summary is rewritten after every run.
    for (const id of args.cases) {
      for (const arm of args.arms) {
        for (let n = 1; n <= args.runs; n++) {
          records.push(await runOnce(ctx, id, arm, n));
          fs.writeFileSync(
            path.join(outDir, 'summary.md'),
            `${lib.renderSummary(records).trimEnd()}\n\n${provenance}\n`
          );
        }
      }
    }
  } catch (error) {
    console.error(`run: ${message(error)}`);
    return 1;
  } finally {
    if (tarball) fs.rmSync(tarball, { force: true });
  }
  console.error(`run: summary → ${path.relative(REPO, path.join(outDir, 'summary.md'))}`);
  // Exit 0 when every case passes, by FR-006's majority, for every arm.
  const allPass = args.cases.every(id =>
    args.arms.every(
      arm => lib.caseVerdict(records.filter(r => r.case === id && r.arm === arm)).pass
    )
  );
  return allPass ? 0 : 1;
}

process.exitCode = await main(process.argv.slice(2));
