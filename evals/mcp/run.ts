/**
 * The eval runner (spec 058; Phase 3 plan E, FR-001–FR-009, FR-023): packs the CLI once, then per
 * case × arm × run installs the tarball into a fresh project, prepares the arm, lets `claude -p`
 * work on the case, runs the gate (gate.ts), scores the rubric (A0 and A1) and writes
 * `results/<run-id>/<case>/<arm>-<n>.json` plus `summary.md`.
 *
 *   pnpm evals:mcp [--case <id> ...] [--arm A0|A1|A-none ...] [--runs <n>] [--model <m>]
 *                  [--call-budget off|enforce]
 *   pnpm evals:mcp --write-budgets <run-id>
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
}

/** harness.ts's HarnessArgs. */
interface HarnessArgs {
  readonly cases: readonly string[];
  readonly arms: readonly Arm[];
  readonly runs: number;
  readonly model?: string;
  readonly callBudget: 'off' | 'enforce';
  readonly writeBudgets?: string;
}

/** The part of the eval bundle the runner uses (packages/cli/src/mcp/evals/{harness,transcript,gate-steps}.ts). */
interface RunBundle {
  readonly HARNESS_USAGE: string;
  parseHarnessArgs(
    argv: readonly string[],
    knownCases: readonly string[]
  ): HarnessArgs | 'help' | string;
  prepareArmProject(
    arm: Arm,
    project: { dir: string; cli: string; mcpLog: string; scratch: string }
  ): { mcpConfig: string; allowedTools: string };
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
}

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
// The rubric (FR-009): rubric.md is the pinned judge prompt; its frontmatter pins the judge model.

interface Rubric {
  readonly model: string;
  readonly prompt: string;
}

function loadRubric(): Rubric {
  if (!fs.existsSync(RUBRIC_FILE)) throw new Error(`the rubric ${RUBRIC_FILE} does not exist`);
  const text = fs.readFileSync(RUBRIC_FILE, 'utf8').replace(/\r\n/g, '\n');
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  const model = match ? /^judge-model:\s*(\S+)\s*$/m.exec(match[1])?.[1] : undefined;
  if (!match || model === undefined) {
    throw new Error(`${RUBRIC_FILE} needs a frontmatter line \`judge-model: <model id>\``);
  }
  return { model, prompt: match[2].trim() };
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
    const judgeDir = path.join(project.scratch, 'judge');
    fs.mkdirSync(judgeDir, { recursive: true });
    const mcpConfig = path.join(judgeDir, 'mcp-empty.json');
    fs.writeFileSync(mcpConfig, `${JSON.stringify({ mcpServers: {} }, null, 2)}\n`);
    // The prompt goes in on stdin (no shell, no command-line length limit); `--tools ""` disables
    // every built-in tool.
    const result = spawnSync(
      'claude',
      [
        '-p',
        '--output-format',
        'json',
        '--model',
        rubric.model,
        '--strict-mcp-config',
        '--mcp-config',
        mcpConfig,
        '--tools',
        '',
      ],
      {
        cwd: judgeDir,
        input: prompt,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'inherit'],
        maxBuffer: MAX_BUFFER,
        timeout: JUDGE_TIMEOUT_MS,
      }
    );
    if (result.error || result.status !== 0) {
      console.error(`run: judge failed (${result.error?.message ?? `exit ${result.status}`})`);
      return null;
    }
    const text = finalResult(lib.parseTranscript(result.stdout))?.result;
    const scores =
      typeof text === 'string' ? [...text.matchAll(/^\s*SCORE:\s*([1-5])\s*$/gm)] : [];
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
    // 3. The arm, after the install (A-none deletes the installed docs).
    const setup = lib.prepareArmProject(arm, { dir, cli, mcpLog, scratch });
    // 4. The agent (claude.exe on Windows: no shell, so the prompt needs no quoting).
    const started = Date.now();
    const agent = spawnSync(
      'claude',
      [
        '-p',
        evalCase.prompt,
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
      ],
      {
        cwd: dir,
        encoding: 'utf8',
        env: arm === 'A1' ? { ...process.env, ELIGIAN_MCP_LOG: mcpLog } : process.env,
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
      ? judge(lib, ctx.rubric, { dir, entry: evalCase.entry, scratch })
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
  };
  // SC-006(4): every record written decodes as a RunRecord.
  Schema.decodeUnknownSync(lib.RunRecordSchema)(record);
  fs.writeFileSync(`${outBase}.json`, `${JSON.stringify(record, null, 2)}\n`);
  const verdict = aborted ? 'ABORTED' : record.pass ? 'PASS' : 'FAIL';
  console.error(`run: ${tag} ${verdict} → ${path.relative(REPO, `${outBase}.json`)}`);
  return record;
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
  const records: RunRecord[] = [];
  let tarball: string | undefined;
  try {
    const rubric = args.arms.some(arm => arm !== 'A-none') ? loadRubric() : undefined;
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
    };
    const provenance = `HEAD ${head}${treeClean ? '' : ' (uncommitted changes)'}, eligian ${packed.version}, call budget ${args.callBudget}`;
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
