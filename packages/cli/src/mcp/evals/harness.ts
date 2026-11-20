/**
 * Spec 058 Phase 3 (FR-001, FR-003–FR-009, FR-023; plan D4): the eval harness's arguments, the
 * arm setup of an installed project, the step-6 budget, the majority verdict, the budgets written
 * after the first full run, the summary and the result-record schema.
 *
 * Plain TypeScript (plan D): no Effect services; only the arm setup is async (spec 059 P5: the
 * brief fixture's key is created with `ensureKey`). `evals/mcp/run.ts` and `gate.ts`
 * reach it through the build output `dist/evals/assert.mjs` (FR-083).
 */
import fs from 'node:fs';
import path from 'node:path';
import { Schema } from 'effect';
import { BRIEF_FILE } from '../brief/brief-file.js';
import { ASSERTION_KINDS, type AssertionResult } from './assert.js';
import { confirmBriefFixture, FIXTURE_CONFIRMATION } from './brief-fixture.js';
import { PERSONA_NAMES, type PersonaName } from './interview.js';
import type { Arm, RunMetrics } from './transcript.js';

export type { Arm } from './transcript.js';

const ARMS: readonly Arm[] = ['A1', 'A0', 'A-none'];

/** I-6: the aliases of --model */
export const MODELS: Readonly<Record<'sonnet' | 'opus', string>> = {
  sonnet: 'claude-sonnet-5-5',
  opus: 'claude-opus-5-5',
};

/** §6.2: the cases a summary counts passes out of */
const CASE_COUNT = 14;

// ---------------------------------------------------------------------------------------------
// Arguments (FR-001, FR-008, FR-023)

export interface HarnessArgs {
  readonly cases: readonly string[];
  readonly arms: readonly Arm[];
  readonly runs: number;
  readonly model?: string;
  readonly callBudget: 'off' | 'enforce';
  readonly writeBudgets?: string;
  /** Spec 059 FR-034: the interview eval's personas; present only in persona mode (P6) */
  readonly personas?: readonly PersonaName[];
  /** FR-039: the simulated user's model id; present only in persona mode, when given */
  readonly userModel?: string;
}

export const HARNESS_USAGE = `usage: pnpm evals:mcp [--case <id> ...] [--arm A0|A1|A-none ...] [--runs <n>] [--model <m>]
                      [--call-budget off|enforce]
       pnpm evals:mcp --write-budgets <run-id>
       pnpm evals:mcp --persona terse|detailed|vague ... [--runs <n>] [--model <m>] [--user-model <m>]

  --case <id>                 an eval case (evals/mcp/cases/<id>.json); repeat for several (default: every case)
  --arm A0|A1|A-none          the arm; repeat for several (default: A1)
                                A1      the MCP server + the AGENTS.md block
                                A0      the AGENTS.md block, the docs on disk and the CLI, no server
                                A-none  no AGENTS.md, no server, the docs removed from the package
  --runs <n>                  runs per case and arm (default: 1)
  --model <m>                 sonnet | opus | a pinned model id (default: the case's pinned "model")
  --call-budget off|enforce   step 6's tool-call budget (default: enforce; off for the first full run)
  --write-budgets <run-id>    set each case's "budget" from the passing Sonnet A1 runs of that run
  --persona terse|detailed|vague
                              the interview eval with that simulated user instead of the cases;
                              repeat for several (arm A1 only; not with --case or --write-budgets)
  --user-model <m>            the simulated user's model: sonnet | opus | a pinned model id
                              (default: sonnet; only with --persona)

Cases run serially. Writes evals/mcp/results/<run-id>/<case>/<arm>-<n>.json and summary.md;
--persona writes evals/mcp/results/<run-id>/interview/<persona>-<n>.json and summary.md.`;

const isArm = (value: string): value is Arm => (ARMS as readonly string[]).includes(value);
const isPersona = (value: string): value is PersonaName =>
  (PERSONA_NAMES as readonly string[]).includes(value);
const modelId = (value: string): string =>
  value === 'sonnet' || value === 'opus' ? MODELS[value] : value;

export function parseHarnessArgs(
  argv: readonly string[],
  knownCases: readonly string[]
): HarnessArgs | 'help' | string {
  const cases: string[] = [];
  const arms: Arm[] = [];
  let runs = 1;
  let model: string | undefined;
  let callBudget: 'off' | 'enforce' = 'enforce';
  let writeBudgets: string | undefined;
  const personas: PersonaName[] = [];
  let userModel: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--help' || arg === '-h') return 'help';
    if (
      arg !== '--case' &&
      arg !== '--arm' &&
      arg !== '--runs' &&
      arg !== '--model' &&
      arg !== '--call-budget' &&
      arg !== '--write-budgets' &&
      arg !== '--persona' &&
      arg !== '--user-model'
    ) {
      return `unknown argument: ${arg}`;
    }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) return `${arg} needs a value`;
    i++;
    if (arg === '--case') {
      if (!knownCases.includes(value)) {
        return `no eval case '${value}' (known: ${knownCases.join(', ')})`;
      }
      if (!cases.includes(value)) cases.push(value);
    } else if (arg === '--arm') {
      if (!isArm(value)) return `--arm takes A0, A1 or A-none (got ${value})`;
      if (!arms.includes(value)) arms.push(value);
    } else if (arg === '--runs') {
      if (!/^\d+$/.test(value) || Number(value) < 1) {
        return `--runs takes a positive integer (got ${value})`;
      }
      runs = Number(value);
    } else if (arg === '--model') {
      model = modelId(value);
    } else if (arg === '--call-budget') {
      if (value !== 'off' && value !== 'enforce') {
        return `--call-budget takes off or enforce (got ${value})`;
      }
      callBudget = value;
    } else if (arg === '--persona') {
      if (!isPersona(value)) {
        return `--persona takes ${PERSONA_NAMES.join(', ')} (got ${value})`;
      }
      if (!personas.includes(value)) personas.push(value);
    } else if (arg === '--user-model') {
      userModel = modelId(value);
    } else {
      writeBudgets = value;
    }
  }
  if (personas.length === 0) {
    if (userModel !== undefined) return '--user-model is only for the interview eval (--persona)';
  } else {
    // FR-034: the interview eval runs instead of the cases, on arm A1 only (§7.2).
    if (cases.length > 0) return '--persona runs the interview eval, not the cases: drop --case';
    if (writeBudgets !== undefined) return '--persona and --write-budgets do not go together';
    const other = arms.find(arm => arm !== 'A1');
    if (other !== undefined) return `--persona runs arm A1 only (got --arm ${other})`;
    return {
      cases: [],
      arms: ['A1'],
      runs,
      ...(model === undefined ? {} : { model }),
      callBudget,
      personas,
      ...(userModel === undefined ? {} : { userModel }),
    };
  }
  return {
    cases: cases.length > 0 ? cases : [...knownCases],
    arms: arms.length > 0 ? arms : ['A1'],
    runs,
    ...(model === undefined ? {} : { model }),
    callBudget,
    ...(writeBudgets === undefined ? {} : { writeBudgets }),
  };
}

// ---------------------------------------------------------------------------------------------
// Arms (FR-003, SC-006(3); spec 059 FR-029 to FR-031, FR-040)

/** Spec 059 FR-030 / FR-040: the arm A1 `Elicitation` hook, `evals/mcp/elicitation-hook.cjs`. */
export type ElicitationHookSpec =
  | { readonly mode: 'accept'; readonly script: string }
  | {
      readonly mode: 'persona';
      readonly script: string;
      readonly sheet: string;
      readonly conversation: string;
      /** The resolved --user-model id (FR-039, FR-040): the hook has no model of its own */
      readonly userModel: string;
    };

export interface ArmSetup {
  /** The file passed as --mcp-config */
  readonly mcpConfig: string;
  readonly allowedTools: string;
  /** Spec 059 FR-029: A1 only, `<scratch>/state` (outside the project) */
  readonly stateDir?: string;
  /** Spec 059 FR-029: a signed BRIEF.md was written */
  readonly briefFixture: boolean;
  /** The agent's extra environment; A1: ELIGIAN_MCP_LOG and ELIGIAN_STATE_DIR */
  readonly env: Readonly<Record<string, string>>;
}

/** FR-050 step 4 (Phase 1 `run.ts`); the server is named `eligian` in .mcp.json. */
const ALLOWED_TOOLS_A1 = 'mcp__eligian__*,Bash(node *),Bash(npx eligian*)';
/** FR-003: A0 and A-none drop `mcp__eligian__*`. */
const ALLOWED_TOOLS_NO_SERVER = 'Bash(node *),Bash(npx eligian*)';

const writeJson = (file: string, value: unknown): void =>
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);

const isInside = (dir: string, file: string): boolean => {
  const relative = path.relative(path.resolve(dir), path.resolve(file));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};

/** A hook command argument: quoted when it holds a space (FR-030). */
const quoted = (value: string): string => (/\s/.test(value) ? `"${value}"` : value);

/**
 * Spec 059 FR-030 / FR-040: the hook's command line, `node <script> <mode> <log>`, plus for
 * `persona` the sheet, the conversation and the user model on its own argv (Claude Code runs the
 * hook in its own environment, so nothing reaches it through an inherited variable).
 */
export function elicitationHookCommand(spec: ElicitationHookSpec, log: string): string {
  const parts = ['node', quoted(spec.script), spec.mode, quoted(log)];
  if (spec.mode === 'persona') {
    parts.push(
      '--sheet',
      quoted(spec.sheet),
      '--conversation',
      quoted(spec.conversation),
      '--user-model',
      spec.userModel
    );
  }
  return parts.join(' ');
}

/**
 * SC-006(3): prepares an installed project for its arm, so it is called after `npm install`. The
 * function does every file operation itself, and the runner only passes the returned values to
 * `claude -p`.
 * A1: writes <dir>/.mcp.json (with ELIGIAN_STATE_DIR = <scratch>/state) and <dir>/AGENTS.md;
 * with `brief`, the fixture signed as a confirmed <dir>/BRIEF.md (spec 059 FR-029); with `hook`,
 * <dir>/.claude/settings.json holding the one `Elicitation` hook (FR-030, FR-040). A0: writes
 * <dir>/AGENTS.md, and the empty-server config in `scratch`. A-none: writes the empty-server
 * config in `scratch`, and deletes <dir>/node_modules/eligian/dist/docs. A0 and A-none ignore
 * `hook` and `brief`.
 * `scratch` is outside `dir`, so no arm except A1 has a .mcp.json in the project, and the state
 * directory is outside it too.
 */
export async function prepareArmProject(
  arm: Arm,
  project: {
    readonly dir: string;
    readonly cli: string;
    readonly mcpLog: string;
    readonly scratch: string;
    /** A1 only */
    readonly hook?: ElicitationHookSpec;
    /** A1 only: the case's `brief.md` text */
    readonly brief?: { readonly fixture: string; readonly caseId: string; readonly now?: Date };
  }
): Promise<ArmSetup> {
  const { dir, cli, mcpLog, scratch } = project;
  if (isInside(dir, scratch)) {
    throw new Error(`the scratch dir must be outside the project: ${scratch} is in ${dir}`);
  }
  const docs = path.join(dir, 'node_modules', 'eligian', 'dist', 'docs');
  const copyAgentsBlock = () => {
    const block = path.join(docs, 'agents-block.md');
    if (!fs.existsSync(block)) throw new Error(`the package has no ${block}`);
    fs.copyFileSync(block, path.join(dir, 'AGENTS.md'));
  };

  if (arm === 'A1') {
    fs.mkdirSync(scratch, { recursive: true });
    const stateDir = path.join(scratch, 'state');
    const env = { ELIGIAN_MCP_LOG: mcpLog, ELIGIAN_STATE_DIR: stateDir };
    const mcpConfig = path.join(dir, '.mcp.json');
    writeJson(mcpConfig, {
      mcpServers: { eligian: { command: 'node', args: [cli, 'mcp'], env } },
    });
    copyAgentsBlock();
    const { brief, hook } = project;
    if (brief !== undefined) {
      const signed = await confirmBriefFixture(
        brief.fixture,
        dir,
        stateDir,
        brief.now ?? new Date(),
        FIXTURE_CONFIRMATION(brief.caseId)
      );
      if ('error' in signed) throw new Error(`brief fixture of ${brief.caseId}: ${signed.error}`);
      fs.writeFileSync(path.join(dir, BRIEF_FILE), signed.text);
    }
    if (hook !== undefined) {
      const command = elicitationHookCommand(hook, path.join(scratch, 'elicitations.log'));
      fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
      writeJson(path.join(dir, '.claude', 'settings.json'), {
        hooks: {
          Elicitation: [
            {
              hooks: [
                { type: 'command', command, ...(hook.mode === 'persona' ? { timeout: 180 } : {}) },
              ],
            },
          ],
        },
      });
    }
    return {
      mcpConfig,
      allowedTools: ALLOWED_TOOLS_A1,
      stateDir,
      briefFixture: brief !== undefined,
      env,
    };
  }

  fs.mkdirSync(scratch, { recursive: true });
  const mcpConfig = path.join(scratch, 'mcp-empty.json');
  writeJson(mcpConfig, { mcpServers: {} });
  if (arm === 'A0') copyAgentsBlock();
  else fs.rmSync(docs, { recursive: true, force: true });
  return { mcpConfig, allowedTools: ALLOWED_TOOLS_NO_SERVER, briefFixture: false, env: {} };
}

// ---------------------------------------------------------------------------------------------
// Isolation and the claude argv (spec 059 FR-048, SC-023; plan "Isolation", §10, P2)

/** What every harness `claude -p` is started with; each run record carries it. */
export interface Isolation {
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
}

/** The variable that hands the isolation (its JSON) to `elicitation-hook.cjs persona`. */
export const ISOLATION_ENV = 'ELIGIAN_EVAL_ISOLATION';

/**
 * FR-048: project settings only (no user settings, so no user hooks), every installed plugin off
 * by id (a plugin with no user-scope entry stays enabled, P2) and no auto memory.
 */
export function agentIsolation(installedPlugins: readonly string[] = []): Isolation {
  const plugins =
    installedPlugins.length === 0
      ? []
      : [
          '--settings',
          JSON.stringify({
            enabledPlugins: Object.fromEntries(installedPlugins.map(id => [id, false])),
          }),
        ];
  return {
    args: ['--setting-sources', 'project,local', ...plugins],
    env: { CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1' },
  };
}

/** The flags of an agent spawn after `-p <prompt>` (spec 058 `run.ts`, in that order). */
const agentFlags = (
  setup: Pick<ArmSetup, 'mcpConfig' | 'allowedTools'>,
  model: string
): string[] => [
  '--mcp-config',
  setup.mcpConfig,
  '--strict-mcp-config',
  '--permission-mode',
  'acceptEdits',
  '--allowedTools',
  setup.allowedTools,
  '--output-format',
  'json',
  '--model',
  model,
];

/** A case's agent: the isolation args, then the prompt and the agent flags. */
export function caseAgentArgv(o: {
  readonly prompt: string;
  readonly setup: Pick<ArmSetup, 'mcpConfig' | 'allowedTools'>;
  readonly model: string;
  readonly isolation: Isolation;
}): string[] {
  return [...o.isolation.args, '-p', o.prompt, ...agentFlags(o.setup, o.model)];
}

/** One interview agent turn (FR-035): as a case's agent, resuming the session from turn 2. */
export function interviewTurnArgv(o: {
  readonly message: string;
  readonly sessionId: string | undefined;
  readonly setup: Pick<ArmSetup, 'mcpConfig' | 'allowedTools'>;
  readonly model: string;
  readonly isolation: Isolation;
}): string[] {
  return [
    ...o.isolation.args,
    '-p',
    o.message,
    ...agentFlags(o.setup, o.model),
    ...(o.sessionId === undefined ? [] : ['--resume', o.sessionId]),
  ];
}

/**
 * The rubric judge, the simulated user and the round-message judge: the prompt goes in on stdin,
 * no MCP server and `--tools ""` (every built-in tool off).
 */
export function noToolsArgv(o: {
  readonly model: string;
  readonly mcpConfig: string;
  readonly isolation: Isolation;
}): string[] {
  return [
    ...o.isolation.args,
    '-p',
    '--output-format',
    'json',
    '--model',
    o.model,
    '--strict-mcp-config',
    '--mcp-config',
    o.mcpConfig,
    '--tools',
    '',
  ];
}

/** SC-023: the environment of every claude spawn; `run.ts` builds no spawn env any other way. */
export function spawnEnv(o: {
  readonly base: NodeJS.ProcessEnv;
  readonly setup?: { readonly env: Readonly<Record<string, string>> };
  readonly isolation: Isolation;
}): Record<string, string | undefined> {
  return {
    ...o.base,
    ...(o.setup?.env ?? {}),
    ...o.isolation.env,
    [ISOLATION_ENV]: JSON.stringify(o.isolation),
  };
}

// ---------------------------------------------------------------------------------------------
// Budget (FR-008, FR-023)

export interface Budget {
  readonly toolCalls: number;
  readonly fromRun: string;
  readonly model: string;
}

/** §6.1 step 6 (Phase 1 `gate.ts` BUDGET); `channelChars` replaces `toolChars` (FR-008). */
const LIMITS = { rounds: 2, wallMs: 15 * 60 * 1000, channelChars: 80_000 } as const;

/** Step 6: one budget for every arm (FR-008); the tool-call check only under `enforce`. */
export function budgetFailures(
  metrics: RunMetrics,
  budget: Budget | undefined,
  mode: 'off' | 'enforce'
): readonly string[] {
  const failures: string[] = [];
  if (metrics.rounds > LIMITS.rounds) {
    failures.push(
      `rounds ${metrics.rounds} > ${LIMITS.rounds} (${metrics.checkToolCalls} eligian_check + ${metrics.checkBashCalls} CLI checks - 1)`
    );
  }
  if (metrics.wallMs !== undefined && metrics.wallMs > LIMITS.wallMs) {
    failures.push(`wall clock ${metrics.wallMs} ms > ${LIMITS.wallMs} ms`);
  }
  if (metrics.channelChars > LIMITS.channelChars) {
    failures.push(`channelChars ${metrics.channelChars} > ${LIMITS.channelChars}`);
  }
  if (mode === 'enforce') {
    if (budget === undefined) {
      failures.push('no tool-call budget');
    } else {
      const limit = Math.floor(1.5 * budget.toolCalls);
      if (metrics.toolCalls > limit) failures.push(`tool calls ${metrics.toolCalls} > ${limit}`);
    }
  }
  return failures;
}

/**
 * FR-023, I-9: the median tool-call count of the passing, non-aborted, pinned-Sonnet A1 runs
 * (the lower middle value for an even count); undefined when there are none.
 */
export function medianBudget(runs: readonly RunRecord[], fromRun: string): Budget | undefined {
  const counts = runs
    .filter(run => run.arm === 'A1' && run.pass && !run.aborted && run.model === MODELS.sonnet)
    .map(run => run.metrics.toolCalls)
    .sort((a, b) => a - b);
  if (counts.length === 0) return undefined;
  return {
    toolCalls: counts[Math.floor((counts.length - 1) / 2)]!,
    fromRun,
    model: MODELS.sonnet,
  };
}

/**
 * FR-023, `--write-budgets <run-id>`: for each case file `<casesDir>/<id>.json`, sets
 * `budget = medianBudget(records of that case, runId)` when it is defined. Returns the files it
 * changed.
 */
export function writeBudgets(
  records: readonly RunRecord[],
  casesDir: string,
  runId: string
): readonly string[] {
  const changed: string[] = [];
  const caseIds = [...new Set(records.map(run => run.case))];
  for (const id of caseIds) {
    const file = path.join(casesDir, `${id}.json`);
    const budget = medianBudget(
      records.filter(run => run.case === id),
      runId
    );
    if (budget === undefined || !fs.existsSync(file)) continue;
    const before = fs.readFileSync(file, 'utf8');
    // An existing key keeps its position; a new one is appended last.
    const parsed = JSON.parse(before) as Record<string, unknown>;
    const after = `${JSON.stringify({ ...parsed, budget }, null, 2)}\n`;
    if (after === before) continue;
    fs.writeFileSync(file, after);
    changed.push(file);
  }
  return changed;
}

// ---------------------------------------------------------------------------------------------
// Verdict and summary (FR-006)

/** FR-006: a strict majority of the non-aborted runs; aborted runs are not in the denominator. */
export function caseVerdict(runs: readonly RunRecord[]): {
  pass: boolean;
  passed: number;
  denominator: number;
} {
  const counted = runs.filter(run => !run.aborted);
  const passed = counted.filter(run => run.pass).length;
  return { pass: passed > counted.length / 2, passed, denominator: counted.length };
}

const mean = (values: readonly number[]): string =>
  values.length === 0
    ? 'n/a'
    : (values.reduce((total, n) => total + n, 0) / values.length).toFixed(1);

const fraction = (count: number, of: number): string =>
  `${count} of ${of} (${of === 0 ? 'n/a' : `${Math.round((100 * count) / of)}%`})`;

const means = (runs: readonly RunRecord[]): string =>
  `rounds ${mean(runs.map(r => r.metrics.rounds))}, ` +
  `tool calls ${mean(runs.map(r => r.metrics.toolCalls))}, ` +
  `transcriptToolChars ${mean(runs.map(r => r.metrics.transcriptToolChars))}`;

function armSection(arm: Arm, records: readonly RunRecord[]): string[] {
  const runs = records.filter(run => !run.aborted);
  const passing = runs.filter(run => run.pass);
  const hit = runs.filter(run => run.metrics.hitUnknown);
  const taught = (list: readonly RunRecord[]) =>
    list.filter(run => run.metrics.operationsBeforeFirstUnknown).length;
  const scores = runs.flatMap(run => (run.rubric === null ? [] : [run.rubric.score]));
  const caseIds = [...new Set(records.map(run => run.case))];
  const verdicts = caseIds.map(id => ({
    id,
    ...caseVerdict(records.filter(run => run.case === id)),
  }));
  return [
    `## ${arm}`,
    '',
    `- runs: ${records.length}, aborted ${records.length - runs.length}`,
    `- cases passed: ${verdicts.filter(v => v.pass).length} of ${CASE_COUNT}`,
    `- means over all runs (aborted excluded, n = ${runs.length}): ${means(runs)}`,
    `- means over passing runs (n = ${passing.length}): ${means(passing)}`,
    `- means of toolChars ${mean(runs.map(r => r.metrics.toolChars))}, ` +
      `channelChars ${mean(runs.map(r => r.metrics.channelChars))}`,
    `- operationsBeforeFirstUnknown: ${fraction(taught(runs), runs.length)}; ` +
      `over the hitUnknown runs: ${fraction(taught(hit), hit.length)}`,
    `- fmtCalled: ${fraction(runs.filter(r => r.metrics.fmtCalled).length, runs.length)}`,
    `- explainCalled: ${fraction(runs.filter(r => r.metrics.explainCalled).length, runs.length)}`,
    `- rubric mean: ${mean(scores)} (${scores.length} scored)`,
    '',
    '| case | passed | verdict |',
    '| --- | --- | --- |',
    ...verdicts.map(
      v => `| ${v.id} | ${v.passed} of ${v.denominator} | ${v.pass ? 'pass' : 'fail'} |`
    ),
    '',
  ];
}

/** Spec 059 FR-048: `Isolation: claude <args> with <env>`. */
const isolationLine = (isolation: Isolation): string =>
  `Isolation: claude ${isolation.args.join(' ')} with ${Object.entries(isolation.env)
    .map(([name, value]) => `${name}=${value}`)
    .join(' ')}`;

/** FR-006: `results/<run-id>/summary.md`, one section per arm present (A1, A0, A-none). */
export function renderSummary(records: readonly RunRecord[]): string {
  const runIds = [...new Set(records.map(run => run.runId))];
  const lines = ['# Eval summary', '', `Runs: ${runIds.join(', ') || 'none'}`, ''];
  // Spec 059 FR-048: printed once, from the first record that carries it.
  const isolation = records.find(run => run.isolation !== undefined)?.isolation;
  if (isolation !== undefined) lines.push(isolationLine(isolation), '');
  for (const arm of ARMS) {
    const ofArm = records.filter(run => run.arm === arm);
    if (ofArm.length > 0) lines.push(...armSection(arm, ofArm));
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------------------------
// The result record (FR-005, SC-006(4))

/** FR-005: one result JSON, results/<run-id>/<case>/<arm>-<n>.json. Every field is required (except spec 059's `brief` and `isolation`, P6); a not-applicable one is null, never absent. */
export interface RunRecord {
  readonly runId: string;
  readonly case: string;
  readonly arm: Arm;
  readonly n: number;
  /** The resolved model id and the CLI version of the tarball (SC-006(4)) */
  readonly model: string;
  readonly cliVersion: string;
  /** No `result` event in the transcript (Edge cases) */
  readonly aborted: boolean;
  readonly pass: boolean;
  /** FR-005: the failures of each gate step 1–6; [] for a step that passed or was skipped */
  readonly steps: readonly {
    readonly step: 1 | 2 | 3 | 4 | 5 | 6;
    readonly failures: readonly string[];
  }[];
  /** FR-005: the tool-call sequence, tool names in call order (toolCalls(events)); metrics.toolCalls counts it less the eligian_brief calls (spec 059 FR-032) */
  readonly toolSequence: readonly string[];
  /** FR-005 / FR-007: rounds, tool calls, transcriptToolChars, toolChars, channelChars and the FR-007 metrics */
  readonly metrics: RunMetrics;
  /** FR-005: the final `result` event's usage (input and output tokens, other keys kept); null when the run has none */
  readonly usage: {
    readonly input_tokens: number;
    readonly output_tokens: number;
    readonly [key: string]: unknown;
  } | null;
  /** FR-005: the wall time */
  readonly wallMs: number;
  /** FR-005: the detail of each assertion; [] when step 4 did not compile */
  readonly assertions: readonly AssertionResult[];
  /** FR-009: null when the judge did not run (A-none, or a failed judge call) */
  readonly rubric: { readonly score: number; readonly model: string } | null;
  /**
   * Spec 059 FR-029 / FR-030: whether a signed BRIEF.md was written and whether the brief ended
   * `approved`. Optional so the records of earlier runs still decode (P6); written on every run.
   */
  readonly brief?: { readonly fixture: boolean; readonly approved: boolean };
  /** Spec 059 FR-048: the isolation the run's `claude -p` spawns had; optional as `brief` (P6) */
  readonly isolation?: Isolation;
}

const RunMetricsSchema = Schema.Struct({
  rounds: Schema.Finite,
  checkToolCalls: Schema.Finite,
  checkBashCalls: Schema.Finite,
  toolCalls: Schema.Finite,
  transcriptToolChars: Schema.Finite,
  toolChars: Schema.Finite,
  channelChars: Schema.Finite,
  operationsBeforeFirstUnknown: Schema.Boolean,
  hitUnknown: Schema.Boolean,
  explainCalled: Schema.Boolean,
  fmtCalled: Schema.Boolean,
  wallMs: Schema.optionalKey(Schema.Finite),
});

/**
 * Decodes a RunRecord; every key above is required (SC-006(4)) but `brief` and `isolation`
 * (optional keys, spec 059 P6), and only usage and rubric may be null. The assertion kinds are read lazily: `assert.ts` re-exports this module (T031).
 */
export const RunRecordSchema: Schema.Codec<RunRecord> = Schema.Struct({
  runId: Schema.String,
  case: Schema.String,
  arm: Schema.Literals(ARMS),
  n: Schema.Finite,
  model: Schema.String,
  cliVersion: Schema.String,
  aborted: Schema.Boolean,
  pass: Schema.Boolean,
  steps: Schema.Array(
    Schema.Struct({
      step: Schema.Literals([1, 2, 3, 4, 5, 6]),
      failures: Schema.Array(Schema.String),
    })
  ),
  toolSequence: Schema.Array(Schema.String),
  metrics: RunMetricsSchema,
  usage: Schema.NullOr(
    Schema.StructWithRest(
      Schema.Struct({ input_tokens: Schema.Finite, output_tokens: Schema.Finite }),
      [Schema.Record(Schema.String, Schema.Unknown)]
    )
  ),
  wallMs: Schema.Finite,
  assertions: Schema.Array(
    Schema.Struct({
      kind: Schema.suspend(() => Schema.Literals(ASSERTION_KINDS)),
      pass: Schema.Boolean,
      detail: Schema.String,
    })
  ),
  rubric: Schema.NullOr(Schema.Struct({ score: Schema.Finite, model: Schema.String })),
  brief: Schema.optionalKey(Schema.Struct({ fixture: Schema.Boolean, approved: Schema.Boolean })),
  isolation: Schema.optionalKey(
    Schema.Struct({
      args: Schema.Array(Schema.String),
      env: Schema.Record(Schema.String, Schema.String),
    })
  ),
});
