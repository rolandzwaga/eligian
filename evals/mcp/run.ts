/**
 * The Phase 1 eval runner (spec 058 phase 1, FR-050): packs the CLI, installs the tarball into a
 * fresh project per case, lets `claude -p` work on the case with the installed `eligian mcp`
 * server, runs the gate (gate.ts) and writes the result JSON.
 *
 *   tsx evals/mcp/run.ts --case <id> [--case <id> …] --arm A1 [--model <m>]
 *
 * Runs locally under the user's Claude subscription (decision 9), under tsx, outside Biome and
 * every tsconfig, and imports nothing from `packages/**`.
 */

import { type SpawnSyncOptions, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CASES_DIR,
  type GateResult,
  loadCase,
  parseTranscript,
  runGate,
  toolCalls,
} from './gate.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const CLI_DIR = path.join(REPO, 'packages', 'cli');
const RESULTS_DIR = path.join(HERE, 'results');
const WINDOWS = process.platform === 'win32';
/** FR-050 step 4; the server is named `eligian` in .mcp.json. */
const ALLOWED_TOOLS = 'mcp__eligian__*,Bash(node *),Bash(npx eligian*)';
/** The agent is stopped after this long; the gate's budget is 15 min (FR-051 step 5). */
const AGENT_TIMEOUT_MS = 30 * 60 * 1000;

const USAGE = `usage: tsx evals/mcp/run.ts --case <id> [--case <id> ...] --arm A1 [--model <m>]

  --case <id>    an eval case (evals/mcp/cases/<id>.json); repeat for several
  --arm A1       the arm: A1 (MCP server + AGENTS.md block) is the only arm in Phase 1
  --model <m>    the claude model (default: the case's pinned "model")

Packs packages/cli once, then per case: a temp project with the tarball installed (npm), the
case's start files, .mcp.json (node <tmp>/node_modules/eligian/bin/cli.js mcp), AGENTS.md
from the package's dist/docs/agents-block.md, a claude -p run, the gate (gate.ts).
Writes evals/mcp/results/<run-id>/<case>.json. Exit 0 when every case passes.`;

interface Args {
  readonly cases: readonly string[];
  readonly arm: string;
  readonly model: string | undefined;
}

function parseArgs(argv: readonly string[]): Args | 'help' | string {
  const cases: string[] = [];
  let arm: string | undefined;
  let model: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') return 'help';
    const value = argv[i + 1];
    if (arg === '--case' || arg === '--arm' || arg === '--model') {
      if (value === undefined || value.startsWith('--')) return `${arg} needs a value`;
      i++;
      if (arg === '--case') cases.push(value);
      else if (arg === '--arm') arm = value;
      else model = value;
    } else {
      return `unknown argument: ${arg}`;
    }
  }
  if (cases.length === 0) return '--case is required';
  if (arm !== 'A1') return `--arm A1 is required (Phase 1 supports A1 only; got ${arm ?? 'none'})`;
  for (const id of cases) {
    if (!fs.existsSync(path.join(CASES_DIR, `${id}.json`))) return `no eval case '${id}'`;
  }
  return { cases, arm, model };
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

function pack(): string {
  const { version } = JSON.parse(fs.readFileSync(path.join(CLI_DIR, 'package.json'), 'utf8')) as {
    version: string;
  };
  const tarball = path.join(CLI_DIR, `eligian-${version}.tgz`);
  console.error(`run: pnpm -C packages/cli pack (eligian ${version})`);
  exec('pnpm', ['-C', 'packages/cli', 'pack'], { cwd: REPO, stdio: ['ignore', 'ignore', 'inherit'] });
  if (!fs.existsSync(tarball)) throw new Error(`pack did not produce ${tarball}`);
  return tarball;
}

interface CaseResult {
  readonly case: string;
  readonly arm: string;
  readonly runId: string;
  readonly model: string;
  readonly head: string;
  readonly treeClean: boolean;
  readonly projectDir: string;
  readonly pass: boolean;
  readonly failures: readonly string[];
  readonly rounds?: number;
  readonly checkToolCalls?: number;
  readonly checkBashCalls?: number;
  readonly toolCallCount?: number;
  readonly toolCallSequence?: readonly string[];
  readonly tokensFromTools?: number;
  readonly wallMs?: number;
  readonly agent?: {
    readonly exitCode: number | null;
    readonly isError?: boolean;
    readonly numTurns?: number;
    readonly durationMs?: number;
    readonly totalCostUsd?: number;
    readonly usage?: unknown;
  };
  readonly error?: string;
}

function runCase(
  id: string,
  tarball: string,
  base: Pick<CaseResult, 'arm' | 'runId' | 'head' | 'treeClean'>,
  modelOverride: string | undefined
): CaseResult {
  const evalCase = loadCase(id);
  const model = modelOverride ?? evalCase.model;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `eligian-eval-${id}-`));
  const common = { ...base, case: id, model, projectDir: dir };
  console.error(`run: ${id} in ${dir}`);
  try {
    // 1. A project with the tarball installed.
    exec('npm', ['init', '-y'], { cwd: dir });
    exec('npm', ['install', tarball], { cwd: dir });
    const cli = path.join(dir, 'node_modules', 'eligian', 'bin', 'cli.js');
    // 2. The case's start files; a case without a start directory starts empty (phase 2 FR-091).
    const start = path.join(CASES_DIR, id, 'start');
    if (fs.existsSync(start)) fs.cpSync(start, dir, { recursive: true });
    // 3. .mcp.json and the arm's AGENTS.md.
    const mcpLog = path.join(dir, 'mcp.log');
    const mcpConfig = path.join(dir, '.mcp.json');
    fs.writeFileSync(
      mcpConfig,
      `${JSON.stringify(
        {
          mcpServers: {
            eligian: { command: 'node', args: [cli, 'mcp'], env: { ELIGIAN_MCP_LOG: mcpLog } },
          },
        },
        null,
        2
      )}\n`
    );
    const agentsBlock = path.join(dir, 'node_modules', 'eligian', 'dist', 'docs', 'agents-block.md');
    if (!fs.existsSync(agentsBlock)) throw new Error(`the package has no ${agentsBlock}`);
    fs.copyFileSync(agentsBlock, path.join(dir, 'AGENTS.md'));
    // 4. The agent (claude.exe on Windows: no shell, so the prompt needs no quoting).
    const started = Date.now();
    const agent = spawnSync(
      'claude',
      [
        '-p',
        evalCase.prompt,
        '--mcp-config',
        mcpConfig,
        '--strict-mcp-config',
        '--permission-mode',
        'acceptEdits',
        '--allowedTools',
        ALLOWED_TOOLS,
        '--output-format',
        'json',
        '--model',
        model,
      ],
      {
        cwd: dir,
        encoding: 'utf8',
        env: { ...process.env, ELIGIAN_MCP_LOG: mcpLog },
        stdio: ['ignore', 'pipe', 'inherit'],
        maxBuffer: 512 * 1024 * 1024,
        timeout: AGENT_TIMEOUT_MS,
      }
    );
    const wallMs = Date.now() - started;
    if (agent.error) throw new Error(`claude: ${agent.error.message}`);
    fs.writeFileSync(path.join(dir, 'claude-transcript.json'), agent.stdout);
    const transcript = parseTranscript(agent.stdout);
    const calls = toolCalls(transcript);
    const final = transcript.findLast(
      event => (event as { type?: string })?.type === 'result'
    ) as
      | {
          is_error?: boolean;
          num_turns?: number;
          duration_ms?: number;
          total_cost_usd?: number;
          usage?: unknown;
        }
      | undefined;
    // 5. The gate.
    const gate: GateResult = runGate({ dir, caseId: id, transcript, wallMs });
    // 6. The result.
    return {
      ...common,
      pass: gate.pass,
      failures: gate.failures,
      rounds: gate.metrics.rounds,
      checkToolCalls: gate.metrics.checkToolCalls,
      checkBashCalls: gate.metrics.checkBashCalls,
      toolCallCount: calls.length,
      toolCallSequence: calls.map(call => call.name),
      tokensFromTools: gate.metrics.toolChars,
      wallMs,
      agent: {
        exitCode: agent.status,
        isError: final?.is_error,
        numTurns: final?.num_turns,
        durationMs: final?.duration_ms,
        totalCostUsd: final?.total_cost_usd,
        usage: final?.usage,
      },
    };
  } catch (error) {
    return {
      ...common,
      pass: false,
      failures: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function main(argv: readonly string[]): number {
  const args = parseArgs(argv);
  if (args === 'help') {
    console.log(USAGE);
    return 0;
  }
  if (typeof args === 'string') {
    console.error(`${args}\n\n${USAGE}`);
    return 2;
  }
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  // Recorded before packing, so the tarball itself never counts as a change.
  const head = git(['rev-parse', 'HEAD']);
  const treeClean = git(['status', '--porcelain', '--', '.', ':!evals/mcp/results']) === '';
  const outDir = path.join(RESULTS_DIR, runId);
  let tarball: string | undefined;
  let allPass = true;
  try {
    tarball = pack();
    fs.mkdirSync(outDir, { recursive: true });
    for (const id of args.cases) {
      const result = runCase(id, tarball, { arm: args.arm, runId, head, treeClean }, args.model);
      const file = path.join(outDir, `${id}.json`);
      fs.writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`);
      console.error(`run: ${id} ${result.pass ? 'PASS' : 'FAIL'} → ${path.relative(REPO, file)}`);
      allPass &&= result.pass;
    }
  } catch (error) {
    console.error(`run: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  } finally {
    if (tarball) fs.rmSync(tarball, { force: true });
  }
  return allPass ? 0 : 1;
}

process.exitCode = main(process.argv.slice(2));
