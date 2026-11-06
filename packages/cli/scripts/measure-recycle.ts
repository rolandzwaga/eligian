/**
 * Recycle measurement (spec 058 phase 5, FR-022, FR-023, FR-025; plan D2). Drives the in-process
 * server (`startInMemoryServer`) through the FR-022 tool mix, with its rotation, on a realistic
 * project, once per recycle interval N plus a "never" reference row, and runs one
 * `eligian_fmt`-only run. The lock is the production `makeCompilerLock` (through
 * `compilerLockLayer`, which only adds the counting hooks). Sections are counted by `onAcquire`
 * and must equal the calls.
 *
 * Every row, and the fmt-only run, runs in its own child process on a fresh copy of the project
 * (P19): the Langium services and the formatter's set are module singletons, so rows sharing one
 * process would free or inherit each other's documents. The parent spawns the children, reads
 * their row files and writes the table to `--out` (P13); progress goes to stderr. The script
 * never sets `ELIGIAN_MCP_LOG`.
 *
 * `@eligian/language` resolves to its `dist/` (P11): run `pnpm build` first.
 *
 * Run: `pnpm -C packages/cli run measure:recycle -- --out <file>`
 *   (= `node --expose-gc --import tsx scripts/measure-recycle.ts`)
 *   [--project <dir>] [--entry <file>] [--calls 500] [--n 25,50,100,200] [--fmt-calls 500]
 *   internal: --row <never|N|fmt> --docs-root <dir> --row-out <file>
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startInMemoryServer } from '../src/__tests__/mcp-test-client.js';
import { copyProject, heapAfterGc, mixCall, toolMix } from '../src/__tests__/mcp-tool-mix.js';
import { compilerLockLayer } from '../src/mcp/compiler-lock.js';
import { NAME as FMT } from '../src/mcp/tools/fmt.js';

const MB = 1024 * 1024;
const CEILING_MB = 25;
const RATIO_LIMIT = 3;
const FMT_RECYCLE_AFTER = 100;
const FMT_CHECKPOINT = 100;
const ISOLATION =
  'isolation: every row and the fmt-only run ran in its own node process on a fresh copy of the project (P19)';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(here, '..', '..', '..');

interface CallLine {
  readonly i: number;
  readonly tool: string;
  readonly ms: number;
  readonly triggered: boolean;
  readonly afterRecycle: boolean;
}

interface MixRow {
  readonly kind: 'mix';
  readonly row: string;
  readonly heapBefore: number;
  readonly heapAfter: number;
  readonly sections: number;
  readonly recycles: readonly number[];
  readonly base: Readonly<Record<string, number | null>>;
  readonly medianPost: number | null;
  readonly medianTrig: number | null;
  readonly medianMs: number;
  readonly p95Ms: number;
  readonly calls: readonly CallLine[];
}

interface FmtRow {
  readonly kind: 'fmt';
  readonly calls: number;
  readonly checkpoints: readonly { readonly calls: number; readonly heap: number }[];
  readonly metric: number;
}

/** A row's child failed: the parent stops with its exit code, after removing its temp dirs. */
class ChildExit {
  constructor(readonly code: number) {}
}

function fail(message: string): never {
  process.stderr.write(`measure-recycle: ${message}\n`);
  process.exit(1);
}

/** `--name value` pairs; a bare `--` (pnpm's separator) is skipped. */
function parseArgs(argv: readonly string[]): Map<string, string> {
  const args = new Map<string, string>();
  for (let at = 0; at < argv.length; at++) {
    const token = argv[at];
    if (token === '--') continue;
    if (!token.startsWith('--') || at + 1 >= argv.length) fail(`unexpected argument ${token}`);
    args.set(token.slice(2), argv[++at]);
  }
  return args;
}

function intArg(args: Map<string, string>, name: string, fallback: number, min: number): number {
  const raw = args.get(name);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min) fail(`--${name} takes an integer of at least ${min}`);
  return n;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Nearest-rank p95. */
function p95(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(0.95 * sorted.length) - 1)];
}

const fixed = (value: number | null, digits: number): string =>
  value === null ? 'n/a' : value.toFixed(digits);

const gc = (globalThis as { gc?: () => void }).gc;
if (gc === undefined) fail('run with node --expose-gc');
const collect = gc;

/** Ratios of the latencies at the recycles to their tool's `base(t)` (FR-022). */
function recycleRatios(calls: readonly CallLine[], base: Readonly<Record<string, number | null>>) {
  const ratio = (call: CallLine): number | null => {
    const b = base[call.tool];
    return b === null || b === undefined || b === 0 ? null : call.ms / b;
  };
  const present = (values: (number | null)[]): number[] =>
    values.filter((value): value is number => value !== null);
  return {
    post: present(calls.filter(call => call.afterRecycle).map(ratio)),
    trig: present(calls.filter(call => call.triggered).map(ratio)),
  };
}

async function runMixRow(args: Map<string, string>, row: string): Promise<MixRow> {
  const project = args.get('project') ?? fail('--project is required for a row');
  const docsRoot = args.get('docs-root') ?? fail('--docs-root is required for a row');
  const entry = args.get('entry') ?? 'tour.eligian';
  const calls = intArg(args, 'calls', 500, 1);
  const recycleAfter = row === 'never' ? Number.MAX_SAFE_INTEGER : Number(row);
  if (!Number.isInteger(recycleAfter) || recycleAfter < 1) fail(`unknown row ${row}`);

  let sections = 0;
  const recycles: number[] = [];
  const server = await startInMemoryServer({
    cwd: project,
    docsRoot,
    lock: compilerLockLayer(
      {
        onAcquire: () => {
          sections++;
        },
        onRecycle: async completed => {
          recycles.push(completed);
        },
      },
      { recycleAfter }
    ),
  });
  const mix = toolMix(entry);
  const lines: CallLine[] = [];
  // Ruling of 2026-11-06 (T020): the first round of the mix (one call per tool) loads the
  // compiler, the docs, the operation registry and the formatter once; heap growth is measured
  // from after that warm-up, so it is session growth. The warm-up calls count toward `calls`.
  let heapBefore = Number.NaN;
  let previousTriggered = false;
  for (let i = 0; i < calls; i++) {
    if (i === mix.length) heapBefore = heapAfterGc(collect) / MB;
    const call = mixCall(mix, i, recycles.length);
    const recyclesBefore = recycles.length;
    const start = performance.now();
    const { isError, payload } = await server.callTool(call.name, call.args);
    const ms = performance.now() - start;
    if (isError) fail(`row ${row}, call ${i} (${call.name}) failed: ${JSON.stringify(payload)}`);
    const triggered = recycles.length > recyclesBefore;
    lines.push({ i, tool: call.name, ms, triggered, afterRecycle: previousTriggered });
    previousTriggered = triggered;
    if ((i + 1) % 100 === 0) process.stderr.write(`measure-recycle: row ${row}: ${i + 1} calls\n`);
  }
  if (Number.isNaN(heapBefore))
    fail(`row ${row}: --calls must exceed the warm-up round (${mix.length})`);
  const heapAfter = heapAfterGc(collect) / MB;
  await server.close();
  if (sections !== calls) fail(`sections (${sections}) ≠ calls (${calls}) on ${project}`);

  const base: Record<string, number | null> = {};
  for (const { name } of mix) {
    base[name] = median(
      lines
        .filter(line => line.tool === name && !line.triggered && !line.afterRecycle)
        .map(line => line.ms)
    );
  }
  const { post, trig } = recycleRatios(lines, base);
  const latencies = lines.map(line => line.ms);
  return {
    kind: 'mix',
    row,
    heapBefore,
    heapAfter,
    sections,
    recycles,
    base,
    medianPost: median(post),
    medianTrig: median(trig),
    medianMs: median(latencies) ?? 0,
    p95Ms: p95(latencies),
    calls: lines,
  };
}

async function runFmtRow(args: Map<string, string>): Promise<FmtRow> {
  const project = args.get('project') ?? fail('--project is required for a row');
  const docsRoot = args.get('docs-root') ?? fail('--docs-root is required for a row');
  const entry = args.get('entry') ?? 'tour.eligian';
  const calls = intArg(args, 'calls', 500, 2 * FMT_CHECKPOINT);
  const server = await startInMemoryServer({
    cwd: project,
    docsRoot,
    lock: compilerLockLayer({}, { recycleAfter: FMT_RECYCLE_AFTER }),
  });
  const checkpoints: { calls: number; heap: number }[] = [];
  for (let i = 1; i <= calls; i++) {
    const { isError, payload } = await server.callTool(FMT, { paths: [entry], write: false });
    if (isError) fail(`fmt call ${i} failed: ${JSON.stringify(payload)}`);
    if (i % FMT_CHECKPOINT === 0) {
      checkpoints.push({ calls: i, heap: heapAfterGc(collect) / MB });
      process.stderr.write(`measure-recycle: fmt: ${i} calls\n`);
    }
  }
  await server.close();
  const first = checkpoints[0];
  const last = checkpoints[checkpoints.length - 1];
  return {
    kind: 'fmt',
    calls,
    checkpoints,
    metric: (last.heap - first.heap) / (last.calls / FMT_CHECKPOINT - 1),
  };
}

/** The FR-023 rule over the numeric rows. */
function decision(rows: readonly MixRow[], candidates: readonly number[]): string {
  const set = `{${candidates.join(',')}}`;
  const numeric = rows.filter(row => row.row !== 'never');
  const meets = (row: MixRow): boolean =>
    row.heapAfter - row.heapBefore <= CEILING_MB &&
    row.medianPost !== null &&
    row.medianPost <= RATIO_LIMIT &&
    row.medianTrig !== null &&
    row.medianTrig <= RATIO_LIMIT;
  const passing = numeric.filter(meets).sort((a, b) => Number(b.row) - Number(a.row));
  if (passing.length > 0) {
    return `chosen N = ${passing[0].row} (largest of ${set} with growth ≤ ${CEILING_MB} MB and median post ≤ ${RATIO_LIMIT} and median trig ≤ ${RATIO_LIMIT})`;
  }
  const lowest = [...numeric].sort(
    (a, b) => a.heapAfter - a.heapBefore - (b.heapAfter - b.heapBefore)
  )[0];
  const reasons = numeric
    .map(
      row =>
        `${row.row}: growth ${(row.heapAfter - row.heapBefore).toFixed(2)} MB, median post ${fixed(row.medianPost, 2)}, median trig ${fixed(row.medianTrig, 2)}`
    )
    .join('; ');
  return `chosen N = ${lowest.row} (lowest growth: no N of ${set} has growth ≤ ${CEILING_MB} MB and median post ≤ ${RATIO_LIMIT} and median trig ≤ ${RATIO_LIMIT}; ${reasons})`;
}

function render(
  options: { project: string; entry: string; calls: number; candidates: readonly number[] },
  rows: readonly MixRow[],
  fmt: FmtRow
): string {
  const out: string[] = [
    `# Recycle measurement (spec 058 phase 5, FR-022 / FR-023 / FR-025)`,
    `date: ${new Date().toISOString()}`,
    `node: ${process.version}`,
    `platform: ${process.platform}`,
    `project: ${options.project}`,
    `entry: ${options.entry}`,
    `calls per row: ${options.calls} (tool mix with rotation, FR-022); fmt-only calls: ${fmt.calls}`,
    ISOLATION,
    'heap before: after the warm-up round (one call per tool, counted in the calls), so growth is session growth (ruling of 2026-11-06, T020)',
    '',
    '| N | heap before MB | heap after MB | growth MB | sections | recycles | median post | median trig | median ms | p95 ms |',
    '|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (const row of rows) {
    out.push(
      `| ${row.row} | ${row.heapBefore.toFixed(2)} | ${row.heapAfter.toFixed(2)} | ${(row.heapAfter - row.heapBefore).toFixed(2)} | ${row.sections} | ${row.recycles.length} | ${fixed(row.medianPost, 2)} | ${fixed(row.medianTrig, 2)} | ${row.medianMs.toFixed(1)} | ${row.p95Ms.toFixed(1)} |`
    );
  }
  out.push('', 'base(t) (median ms of the calls that neither triggered nor followed a recycle):');
  for (const row of rows) {
    const bases = Object.entries(row.base)
      .map(([tool, ms]) => `${tool} ${fixed(ms, 1)}`)
      .join(', ');
    out.push(
      `- ${row.row}: ${bases}; recycles at ${row.recycles.length === 0 ? '-' : row.recycles.join(', ')}`
    );
  }
  out.push(
    '',
    `fmt-only run (${fmt.calls} × ${FMT} write: false, recycle every ${FMT_RECYCLE_AFTER} sections):`
  );
  for (const checkpoint of fmt.checkpoints) {
    out.push(`- heapUsed after ${checkpoint.calls} calls: ${checkpoint.heap.toFixed(2)} MB`);
  }
  out.push(
    `fmt metric: ${fmt.metric.toFixed(3)} MB per 100 calls ((heap after the last 100 − heap after the first 100) ÷ (calls ÷ 100 − 1))`,
    '',
    `decision (FR-023): ${decision(rows, options.candidates)}`,
    `verdict (FR-025): ${fmt.metric > 1 ? '> 1 MB per 100: reset required' : '≤ 1 MB per 100: no change'}`,
    '',
    'raw (i tool ms flags):'
  );
  for (const row of rows) {
    out.push(`## row ${row.row}`);
    for (const call of row.calls) {
      const flags =
        [call.triggered ? 'triggered' : '', call.afterRecycle ? 'afterRecycle' : '']
          .filter(flag => flag !== '')
          .join(',') || '-';
      out.push(`${call.i} ${call.tool} ${call.ms.toFixed(1)} ${flags}`);
    }
  }
  out.push('');
  return out.join('\n');
}

async function runParent(args: Map<string, string>): Promise<void> {
  const outFile = args.get('out') ?? fail('--out <file> is required');
  const project = path.resolve(args.get('project') ?? path.join(REPO, 'examples', 'eligian-tour'));
  const entry = args.get('entry') ?? 'tour.eligian';
  const calls = intArg(args, 'calls', 500, 1);
  const fmtCalls = intArg(args, 'fmt-calls', 500, 2 * FMT_CHECKPOINT);
  if (fmtCalls % FMT_CHECKPOINT !== 0) fail(`--fmt-calls takes a multiple of ${FMT_CHECKPOINT}`);
  const candidates = (args.get('n') ?? '25,50,100,200').split(',').map(Number);
  if (candidates.some(n => !Number.isInteger(n) || n < 1)) fail('--n takes positive integers');

  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-recycle-'));
  const copies: string[] = [];
  try {
    // Empty docs: the measurement is about the compiler services, not the overlays
    const docsRoot = path.join(work, 'docs');
    fs.mkdirSync(docsRoot);
    fs.writeFileSync(path.join(docsRoot, 'index.json'), '[]');
    fs.writeFileSync(path.join(docsRoot, 'overlays.json'), '{"byCode":{},"bySource":{}}');

    const child = (row: string, rowCalls: number): unknown => {
      const copy = copyProject(project);
      copies.push(copy);
      const rowFile = path.join(work, `row-${row}.json`);
      process.stderr.write(`measure-recycle: row ${row} (${rowCalls} calls) in ${copy}\n`);
      const result = spawnSync(
        process.execPath,
        [
          ...process.execArgv,
          fileURLToPath(import.meta.url),
          '--row',
          row,
          '--project',
          copy,
          '--entry',
          entry,
          '--docs-root',
          docsRoot,
          '--calls',
          String(rowCalls),
          '--row-out',
          rowFile,
        ],
        { stdio: ['ignore', 'ignore', 'inherit'] }
      );
      if (result.status !== 0) {
        process.stderr.write(`measure-recycle: row ${row} exited ${result.status}\n`);
        throw new ChildExit(result.status ?? 1);
      }
      return JSON.parse(fs.readFileSync(rowFile, 'utf8'));
    };

    const rows = ['never', ...candidates.map(String)].map(row => child(row, calls) as MixRow);
    const fmt = child('fmt', fmtCalls) as FmtRow;
    const label = path.relative(REPO, project).split(path.sep).join('/') || '.';
    const text = render({ project: label, entry, calls, candidates }, rows, fmt);
    const target = path.resolve(outFile);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text);
    process.stderr.write(`measure-recycle: wrote ${target}\n`);
  } finally {
    for (const copy of copies) fs.rmSync(copy, { recursive: true, force: true });
    fs.rmSync(work, { recursive: true, force: true });
  }
}

const args = parseArgs(process.argv.slice(2));
const row = args.get('row');
if (row === undefined) {
  try {
    await runParent(args);
  } catch (error) {
    if (error instanceof ChildExit) process.exit(error.code);
    throw error;
  }
} else {
  const rowOut = args.get('row-out') ?? fail('--row-out is required for a row');
  const result = row === 'fmt' ? await runFmtRow(args) : await runMixRow(args, row);
  fs.writeFileSync(rowOut, JSON.stringify(result));
  process.exit(0);
}
