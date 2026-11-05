/**
 * The eval gate (spec 058, roadmap §6.1; Phase 3 plan E): a thin wrapper over the eval library.
 * Runs the shipped CLI that is installed in a produced project
 * (`<dir>/node_modules/eligian/bin/cli.js`) through `runGateSteps` (steps 1–5: check, fmt --check,
 * smoke --strict --scenario --determinism, compile --eligian-map + the case's assertions, the
 * scenario's results), then step 6, the budget (`computeMetrics` + `budgetFailures`).
 *
 *   tsx evals/mcp/gate.ts <project dir> --case <id> [--transcript <file>] [--wall-ms <n>]
 *                         [--call-budget off|enforce]
 *
 * Prints one JSON line `{ pass, failures }`; exit 0 = pass, 1 = fail, 2 = usage error.
 *
 * The library is the build output `packages/cli/dist/evals/assert.mjs` (FR-083), loaded with a
 * dynamic `import()`. Runs under tsx, outside Biome and every tsconfig, and imports nothing from
 * `packages/**\/src`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const CASES_DIR = path.join(HERE, 'cases');
const EVAL_BUNDLE = path.resolve(HERE, '..', '..', 'packages', 'cli', 'dist', 'evals', 'assert.mjs');

export type Arm = 'A0' | 'A1' | 'A-none';
export type CallBudget = 'off' | 'enforce';

export interface EvalCase {
  readonly id: string;
  readonly prompt: string;
  readonly entry: string;
  readonly model: string;
  /** The scenario file beside the case, `<id>.scenario.json` */
  readonly scenario?: string;
  readonly assertions: readonly ({ readonly kind: string } & Readonly<Record<string, unknown>>)[];
  readonly fixtures?: readonly { readonly from: string; readonly to: string }[];
  readonly budget?: { readonly toolCalls: number; readonly fromRun: string; readonly model: string };
}

/** The library's `AssertionResult` (assert.ts), as the bundle returns it. */
export interface AssertionResult {
  readonly kind: string;
  readonly pass: boolean;
  readonly detail: string;
}

/** The library's `RunMetrics` (transcript.ts), as the bundle returns it. */
export interface RunMetrics {
  readonly rounds: number;
  readonly checkToolCalls: number;
  readonly checkBashCalls: number;
  readonly toolCalls: number;
  readonly transcriptToolChars: number;
  readonly toolChars: number;
  readonly channelChars: number;
  readonly operationsBeforeFirstUnknown: boolean;
  readonly hitUnknown: boolean;
  readonly explainCalled: boolean;
  readonly fmtCalled: boolean;
  readonly wallMs?: number;
}

export type GateStep = 1 | 2 | 3 | 4 | 5 | 6;

export interface GateResult {
  readonly pass: boolean;
  readonly failures: readonly string[];
  /** FR-005: the failures of each step 1–6; [] for a step that passed */
  readonly steps: readonly { readonly step: GateStep; readonly failures: readonly string[] }[];
  readonly assertions: readonly AssertionResult[];
  readonly checkCodes?: readonly string[];
  readonly metrics: RunMetrics;
}

/** The part of the eval bundle the gate uses (packages/cli/src/mcp/evals/assert.ts and its re-exports). */
interface EvalBundle {
  runGateSteps(options: {
    dir: string;
    cli: string;
    casesDir: string;
    evalCase: EvalCase;
  }): { failures: readonly string[]; checkCodes?: readonly string[]; assertions: readonly AssertionResult[] };
  computeMetrics(arm: Arm, events: readonly unknown[], log: readonly unknown[], wallMs?: number): RunMetrics;
  budgetFailures(metrics: RunMetrics, budget: EvalCase['budget'], mode: CallBudget): readonly string[];
  parseTranscript(text: string): unknown[];
  readMcpLog(file: string): unknown[];
}

/** The eval bundle; its absence is a named error that says how to build it. */
export async function loadEvalBundle(): Promise<EvalBundle> {
  if (!fs.existsSync(EVAL_BUNDLE)) {
    throw new Error(`${EVAL_BUNDLE} does not exist; run \`pnpm -C packages/cli build\` first`);
  }
  return (await import(pathToFileURL(EVAL_BUNDLE).href)) as EvalBundle;
}

export function loadCase(id: string): EvalCase {
  const file = path.join(CASES_DIR, `${id}.json`);
  if (!fs.existsSync(file)) throw new Error(`no eval case '${id}' (${file})`);
  return JSON.parse(fs.readFileSync(file, 'utf8')) as EvalCase;
}

/** The step a `runGateSteps` failure belongs to: its `step N` prefix; a missing scenario is step 3, setup step 1. */
function stepOf(failure: string): GateStep {
  const match = /^step ([1-5])\b/.exec(failure);
  if (match) return Number(match[1]) as GateStep;
  return failure.startsWith('scenario file not found') ? 3 : 1;
}

export interface GateOptions {
  readonly dir: string;
  readonly caseId: string;
  readonly transcript?: readonly unknown[];
  readonly wallMs?: number;
  /** FR-008: default enforce (a case without a budget fails step 6) */
  readonly callBudget?: CallBudget;
  /** The arm the run used, for `channelChars` (FR-008); default A1 */
  readonly arm?: Arm;
  /** The ELIGIAN_MCP_LOG file; default `<dir>/mcp.log` */
  readonly mcpLog?: string;
}

export async function runGate(options: GateOptions): Promise<GateResult> {
  const lib = await loadEvalBundle();
  const dir = path.resolve(options.dir);
  const evalCase = loadCase(options.caseId);
  const cli = path.join(dir, 'node_modules', 'eligian', 'bin', 'cli.js');

  const stepsResult = lib.runGateSteps({ dir, cli, casesDir: CASES_DIR, evalCase });
  const metrics = lib.computeMetrics(
    options.arm ?? 'A1',
    options.transcript ?? [],
    lib.readMcpLog(options.mcpLog ?? path.join(dir, 'mcp.log')),
    options.wallMs
  );
  const budget = lib
    .budgetFailures(metrics, evalCase.budget, options.callBudget ?? 'enforce')
    .map(failure => `step 6 (budget): ${failure}`);

  const steps = ([1, 2, 3, 4, 5, 6] as const).map(step => ({
    step,
    failures:
      step === 6 ? budget : stepsResult.failures.filter(failure => stepOf(failure) === step),
  }));
  const failures = [...stepsResult.failures, ...budget];
  return {
    pass: failures.length === 0,
    failures,
    steps,
    assertions: stepsResult.assertions,
    checkCodes: stepsResult.checkCodes,
    metrics,
  };
}

const USAGE = `usage: tsx evals/mcp/gate.ts <project dir> --case <id> [--transcript <file>] [--wall-ms <n>] [--call-budget off|enforce]

  <project dir>         a produced project with the eligian tarball installed (node_modules/eligian)
  --case <id>           the eval case (evals/mcp/cases/<id>.json)
  --transcript <file>   the claude -p output (json or stream-json), for the metrics
  --wall-ms <n>         the agent's wall clock, for the 15 min budget
  --call-budget <mode>  enforce (default) or off: the tool-call budget of the case (FR-008);
                        off for the first full run, which has no budgets yet

Needs the eval bundle: pnpm -C packages/cli build.
Prints one JSON line { pass, failures }; exit 0 = pass, 1 = fail, 2 = usage error.`;

async function main(argv: readonly string[]): Promise<number> {
  let dir: string | undefined;
  let caseId: string | undefined;
  let transcriptFile: string | undefined;
  let wallMs: number | undefined;
  let callBudget: CallBudget = 'enforce';
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      console.log(USAGE);
      return 0;
    }
    if (arg === '--case') caseId = argv[++i];
    else if (arg === '--transcript') transcriptFile = argv[++i];
    else if (arg === '--wall-ms') wallMs = Number(argv[++i]);
    else if (arg === '--call-budget') {
      const mode = argv[++i];
      if (mode !== 'off' && mode !== 'enforce') {
        console.error(`--call-budget must be off or enforce, not ${mode}\n\n${USAGE}`);
        return 2;
      }
      callBudget = mode;
    } else if (dir === undefined && !arg.startsWith('--')) dir = arg;
    else {
      console.error(`unknown argument: ${arg}\n\n${USAGE}`);
      return 2;
    }
  }
  if (dir === undefined || caseId === undefined || (wallMs !== undefined && !(wallMs >= 0))) {
    console.error(USAGE);
    return 2;
  }
  try {
    const lib = await loadEvalBundle();
    const transcript = transcriptFile
      ? lib.parseTranscript(fs.readFileSync(transcriptFile, 'utf8'))
      : undefined;
    const result = await runGate({ dir, caseId, transcript, wallMs, callBudget });
    console.log(JSON.stringify({ pass: result.pass, failures: result.failures }));
    return result.pass ? 0 : 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main(process.argv.slice(2)).then(code => {
    process.exitCode = code;
  });
}
