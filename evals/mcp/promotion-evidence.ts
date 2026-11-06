/**
 * The promotion evidence (spec 058 Phase 5, FR-001, FR-001a, SC-020; plan A0-2): walks
 * `evals/mcp/results/*\/`, reads the A1 telemetry logs, and writes the FR-001 table with the eval
 * library's `promotionEvidence` + `renderPromotionEvidence` (packages/cli/src/mcp/evals/promotion-evidence.ts).
 *
 *   pnpm evals:mcp:evidence [-- --runs <id,...>] [--out <file>]
 *
 * `--runs` (comma-separated, no default) pins the full runs that are counted; nothing is inferred.
 * A pinned run that is missing or not full is printed on stderr as `<run>: <reason>` and the script
 * exits 1 without writing. `--out` defaults to
 * `specs/058-mcp-server/phase-5-hardening-reach/baseline/promotion-evidence.md`.
 * Exit 0 = written, 1 = a rejected pinned run, 2 = usage error or no eval bundle.
 *
 * Needs a fresh `pnpm -C packages/cli build`: the library is the build output
 * `packages/cli/dist/evals/assert.mjs`, loaded by gate.ts's `loadEvalBundle`. Runs under tsx,
 * outside Biome and every tsconfig (like run.ts), and imports nothing from `packages/**\/src`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CASES_DIR, loadEvalBundle } from './gate.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const RESULTS_DIR = path.join(HERE, 'results');
const DEFAULT_OUT = path.join(
  REPO,
  'specs',
  '058-mcp-server',
  'phase-5-hardening-reach',
  'baseline',
  'promotion-evidence.md'
);

const ONE_CASE_NOTE = 'one-case harness record (Phases 1–2), no telemetry log';
const NO_TELEMETRY_NOTE = 'no telemetry by design (A0 checks through Bash)';
/** A new-format record file `<arm>-<n>.json` (the transcript beside it is `<arm>-<n>.transcript.json`). */
const RECORD_FILE = /^(A0|A1|A-none)-(\d+)\.json$/;

/** The library's `EvidenceRecord` (promotion-evidence.ts). */
interface EvidenceRecord {
  readonly runId: string;
  readonly caseId: string;
  readonly arm: string;
  readonly n: number;
  readonly model: string;
  readonly lines: readonly unknown[] | undefined;
}

interface PromotionEvidence {
  readonly rejected: readonly { readonly run: string; readonly reason: string }[];
}

/** The part of the eval bundle this script uses (assert.ts and its re-exports). */
interface EvidenceBundle {
  readMcpLog(file: string): unknown[];
  promotionEvidence(input: {
    readonly records: readonly EvidenceRecord[];
    readonly caseIds: readonly string[];
    readonly pinned: readonly string[] | undefined;
  }): PromotionEvidence;
  renderPromotionEvidence(input: {
    readonly scanned: readonly { readonly run: string; readonly note: string }[];
    readonly evidence: PromotionEvidence;
  }): string;
}

const USAGE = 'usage: pnpm evals:mcp:evidence [-- --runs <id,...>] [--out <file>]';

const message = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const isDirectory = (file: string): boolean => fs.statSync(file).isDirectory();

/** The case ids: `cases/<id>.json`, the scenarios beside them excluded (run.ts's `knownCases`). */
function knownCases(): string[] {
  return fs
    .readdirSync(CASES_DIR)
    .filter(file => file.endsWith('.json') && !file.endsWith('.scenario.json'))
    .map(file => file.slice(0, -'.json'.length))
    .sort(compareText);
}

/** `--runs <id,...>` and `--out <file>`; a string is the usage error. */
function parseArgs(
  argv: readonly string[]
): { readonly pinned: readonly string[] | undefined; readonly out: string } | string {
  let pinned: string[] | undefined;
  let out = DEFAULT_OUT;
  const args = argv.filter(arg => arg !== '--');
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const value = args[i + 1];
    if (arg === '--runs' || arg === '--out') {
      if (value === undefined || value.startsWith('--')) return `${arg} needs a value`;
      i++;
      if (arg === '--out') out = path.resolve(value);
      else {
        const ids = value.split(',').map(id => id.trim());
        if (ids.some(id => id === '')) return `--runs takes comma-separated run ids, not '${value}'`;
        pinned = [...(pinned ?? []), ...ids];
      }
    } else return `unknown argument '${arg}'`;
  }
  return { pinned, out };
}

/** One run directory: its new-format records and its scan note (format and arms). */
function scanRun(
  lib: EvidenceBundle,
  runId: string
): { readonly records: EvidenceRecord[]; readonly note: string } {
  const runDir = path.join(RESULTS_DIR, runId);
  const entries = fs.readdirSync(runDir).sort(compareText);
  const oneCase = entries.filter(
    entry => entry.endsWith('.json') && !isDirectory(path.join(runDir, entry))
  );
  const records: EvidenceRecord[] = [];
  for (const caseId of entries.filter(entry => isDirectory(path.join(runDir, entry)))) {
    const caseDir = path.join(runDir, caseId);
    for (const file of fs.readdirSync(caseDir).sort(compareText)) {
      const match = RECORD_FILE.exec(file);
      if (!match) continue;
      const arm = match[1];
      const n = Number(match[2]);
      const base = path.join(caseDir, `${arm}-${n}`);
      const json = JSON.parse(fs.readFileSync(path.join(caseDir, file), 'utf8')) as {
        model?: unknown;
      };
      const log = `${base}.mcp.log`;
      // DV6: readMcpLog returns [] for a missing file, so the absence is decided here.
      const lines = arm === 'A1' && fs.existsSync(log) ? lib.readMcpLog(log) : undefined;
      records.push({ runId, caseId, arm, n, model: String(json.model ?? ''), lines });
    }
  }

  const parts: string[] = [];
  if (oneCase.length > 0) {
    parts.push(`${ONE_CASE_NOTE} (${oneCase.map(f => f.slice(0, -'.json'.length)).join(', ')})`);
  }
  if (records.length > 0) {
    const arms = [...new Set(records.map(r => r.arm))].sort(compareText);
    const counts = arms.map(arm => {
      const own = records.filter(r => r.arm === arm);
      const logged = own.filter(r => r.lines !== undefined).length;
      return arm === 'A1'
        ? `A1 × ${own.length} (${logged} with .mcp.log)`
        : `${arm} × ${own.length}`;
    });
    parts.push(`case/arm-n records: ${counts.join(', ')}`);
    if (arms.some(arm => arm !== 'A1')) parts.push(`A0 / A-none: ${NO_TELEMETRY_NOTE}`);
  }
  if (parts.length === 0) parts.push('no records');
  return { records, note: parts.join('; ') };
}

async function main(argv: readonly string[]): Promise<number> {
  const args = parseArgs(argv);
  if (typeof args === 'string') {
    console.error(`promotion-evidence: ${args}\n${USAGE}`);
    return 2;
  }
  let lib: EvidenceBundle;
  try {
    lib = (await loadEvalBundle()) as unknown as EvidenceBundle;
  } catch (error) {
    console.error(`promotion-evidence: ${message(error)}`);
    return 2;
  }

  const runIds = fs.existsSync(RESULTS_DIR)
    ? fs
        .readdirSync(RESULTS_DIR)
        .filter(entry => isDirectory(path.join(RESULTS_DIR, entry)))
        .sort(compareText)
    : [];
  const scanned: { run: string; note: string }[] = [];
  const records: EvidenceRecord[] = [];
  for (const run of runIds) {
    const result = scanRun(lib, run);
    scanned.push({ run, note: result.note });
    records.push(...result.records);
  }

  // No selection here: promotionEvidence decides which pinned runs count (plan A0-1).
  const evidence = lib.promotionEvidence({ records, caseIds: knownCases(), pinned: args.pinned });
  if (evidence.rejected.length > 0) {
    for (const { run, reason } of evidence.rejected) console.error(`${run}: ${reason}`);
    console.error('promotion-evidence: nothing written');
    return 1;
  }

  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, lib.renderPromotionEvidence({ scanned, evidence }));
  console.error(
    `promotion-evidence: ${scanned.length} runs scanned, ${records.length} records → ${path.relative(REPO, args.out)}`
  );
  return 0;
}

process.exitCode = await main(process.argv.slice(2));
