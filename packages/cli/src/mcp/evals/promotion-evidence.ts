/**
 * Spec 058 Phase 5 (FR-001, FR-001a, SC-020; plan A0-1, P20): the evidence for promoting review
 * codes to validators, counted from the `eligian_check` lines of the A1 telemetry logs.
 *
 * Plain synchronous TypeScript: no Effect, no I/O. The script `evals/mcp/promotion-evidence.ts`
 * reads the files and writes `baseline/promotion-evidence.md` with `renderPromotionEvidence`.
 * Which runs count is pinned by the caller (`pinned`), never inferred: only full runs named there
 * are counted. Every output is sorted and carries no timestamp, so a regeneration diffs cleanly.
 */
import { REVIEW_CODES, type ReviewCode } from '../../check/review.js';
import type { TelemetryLike } from './transcript.js';

export { REVIEW_CODES };

/** A telemetry line as read back, plus telemetry.ts's cut marker (`TelemetryLine.truncated`, P20). */
export type EvidenceLine = TelemetryLike & { readonly truncated?: unknown };

/** One new-format record `<run>/<case>/<arm>-<n>.json` and, for A1, its log (undefined: no .mcp.log). */
export interface EvidenceRecord {
  readonly runId: string;
  readonly caseId: string;
  /** 'A0' | 'A1' | 'A-none', from the file name */
  readonly arm: string;
  readonly n: number;
  readonly model: string;
  readonly lines: readonly EvidenceLine[] | undefined;
}

const CHECK_TOOL = 'eligian_check';
const A1 = 'A1';

/** FR-001b's "full run": every id in `caseIds` has at least one A1 record among `records` (one run's records). */
export function isFullRun(records: readonly EvidenceRecord[], caseIds: readonly string[]): boolean {
  return missingCases(records, caseIds).length === 0;
}

function missingCases(records: readonly EvidenceRecord[], caseIds: readonly string[]): string[] {
  const covered = new Set(records.filter(r => r.arm === A1).map(r => r.caseId));
  return [...new Set(caseIds)].filter(id => !covered.has(id)).sort(compareText);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

/** The keys of `result.codes` when it is a non-null object, else none. */
function codesOf(line: EvidenceLine): ReadonlySet<string> {
  const codes = isRecord(line.result) ? line.result.codes : undefined;
  return new Set(isRecord(codes) ? Object.keys(codes) : []);
}

/** The `result.codes` keys of each `eligian_check` line, in call order, with the line's cut marker. */
export function checkCodesInOrder(
  lines: readonly EvidenceLine[]
): readonly { readonly codes: ReadonlySet<string>; readonly truncated: boolean }[] {
  return lines
    .filter(line => line.tool === CHECK_TOOL)
    .map(line => ({ codes: codesOf(line), truncated: line.truncated === true }));
}

/** FR-001 (b) for one record: check lines reporting `code` that are followed by a later check line. */
export function roundsWhileReported(lines: readonly EvidenceLine[], code: string): number {
  const checks = checkCodesInOrder(lines);
  return checks.slice(0, -1).filter(check => check.codes.has(code)).length;
}

export type CheckNeeds = 'ast-and-files' | 'compiled-config' | 'install';

export const CHECK_NEEDS: Readonly<Record<ReviewCode, CheckNeeds>> = {
  'controller-imbalance': 'compiled-config',
  'class-never-removed': 'compiled-config',
  'media-file-missing': 'ast-and-files',
  'media-from-duplicate': 'ast-and-files',
  'timeline-container-not-in-layout': 'ast-and-files',
  'media-timeline-first-without-start-gesture': 'ast-and-files',
  'entry-timeline-without-enter': 'ast-and-files',
  'host-operation-in-block-without-select': 'compiled-config',
  'lottie-web-not-installed': 'install',
};

const EDITOR_COST: Readonly<Record<CheckNeeds, string>> = {
  'ast-and-files': 'a validator on every validation',
  'compiled-config': 'one in-memory compile per clean program after validation (the I-2 channel)',
  install: 'not a program check: never promoted',
};

const NEVER_PROMOTED: ReviewCode = 'lottie-web-not-installed';

export interface CodeEvidence {
  readonly code: ReviewCode;
  /** column (a) */
  readonly runsWithCode: number | 'no data';
  /** column (b) */
  readonly rounds: number | 'no data';
  readonly roundsPerRun: readonly { readonly run: string; readonly rounds: number }[];
  /** column (c) */
  readonly needs: CheckNeeds;
  /** column (d) */
  readonly editorCost: string;
  readonly promote: boolean | 'rule not applied';
}

export interface PromotionEvidence {
  /** Pinned run ids that are full: the only runs whose A1 records are counted */
  readonly counted: readonly string[];
  /** The models of each counted run's A1 records, sorted, '' left out (FR-001: run ids, model, arm) */
  readonly countedModels: readonly { readonly run: string; readonly models: readonly string[] }[];
  /** Pinned run ids that are not counted: 'no records', or 'not a full run: no A1 record for <case ids>' */
  readonly rejected: readonly { readonly run: string; readonly reason: string }[];
  /** A1 records of counted runs without a .mcp.log, each listed as "no data" (FR-001) */
  readonly noData: readonly { readonly run: string; readonly caseId: string; readonly n: number }[];
  /** Counted check lines marked `truncated`: when > 0, columns (a) and (b) are lower bounds (P20) */
  readonly truncatedLines: number;
  /** counted.length > 0 */
  readonly ruleApplies: boolean;
  /** the 9 REVIEW_CODES, in REVIEW_CODES order */
  readonly rows: readonly CodeEvidence[];
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function selectRuns(
  records: readonly EvidenceRecord[],
  caseIds: readonly string[],
  pinned: readonly string[]
): Pick<PromotionEvidence, 'counted' | 'rejected'> {
  const counted: string[] = [];
  const rejected: { run: string; reason: string }[] = [];
  for (const run of [...new Set(pinned)].sort(compareText)) {
    const own = records.filter(r => r.runId === run);
    const missing = missingCases(own, caseIds);
    if (own.length === 0) rejected.push({ run, reason: 'no records' });
    else if (missing.length > 0)
      rejected.push({ run, reason: `not a full run: no A1 record for ${missing.join(', ')}` });
    else counted.push(run);
  }
  return { counted, rejected };
}

function compareRecords(a: EvidenceRecord, b: EvidenceRecord): number {
  return compareText(a.runId, b.runId) || compareText(a.caseId, b.caseId) || a.n - b.n;
}

/**
 * FR-001's table. Run selection is decided here, not in the script. Only A1 records are counted,
 * and only when their `runId` is in `pinned` and `isFullRun` holds over all of that run's records.
 * Every other record (unpinned runs, partial runs, A0 / A-none) adds nothing.
 * With `pinned` undefined or empty, nothing is counted: every row reads 'no data' and
 * 'rule not applied' (FR-001a).
 */
export function promotionEvidence(input: {
  readonly records: readonly EvidenceRecord[];
  readonly caseIds: readonly string[];
  readonly pinned: readonly string[] | undefined;
}): PromotionEvidence {
  const { counted, rejected } = selectRuns(input.records, input.caseIds, input.pinned ?? []);
  const countedSet = new Set(counted);
  const a1 = input.records
    .filter(r => r.arm === A1 && countedSet.has(r.runId))
    .sort(compareRecords);
  const countedModels = counted.map(run => ({
    run,
    models: [...new Set(a1.filter(r => r.runId === run && r.model !== '').map(r => r.model))].sort(
      compareText
    ),
  }));
  const noData = a1
    .filter(r => r.lines === undefined)
    .map(r => ({ run: r.runId, caseId: r.caseId, n: r.n }));
  const logged = a1.flatMap(r => (r.lines === undefined ? [] : [{ run: r.runId, lines: r.lines }]));
  const truncatedLines = logged.reduce(
    (sum, r) => sum + checkCodesInOrder(r.lines).filter(c => c.truncated).length,
    0
  );
  const ruleApplies = counted.length > 0;
  const rows = REVIEW_CODES.map((code): CodeEvidence => {
    const needs = CHECK_NEEDS[code];
    const editorCost = EDITOR_COST[needs];
    if (logged.length === 0) {
      return {
        code,
        runsWithCode: 'no data',
        rounds: 'no data',
        roundsPerRun: [],
        needs,
        editorCost,
        promote: ruleApplies ? false : 'rule not applied',
      };
    }
    const runsWithCode = logged.filter(r =>
      checkCodesInOrder(r.lines).some(c => c.codes.has(code))
    ).length;
    const roundsPerRun = counted.map(run => ({
      run,
      rounds: logged
        .filter(r => r.run === run)
        .reduce((sum, r) => sum + roundsWhileReported(r.lines, code), 0),
    }));
    const rounds = roundsPerRun.reduce((sum, r) => sum + r.rounds, 0);
    const promote = code !== NEVER_PROMOTED && (runsWithCode >= 2 || rounds >= 1);
    return { code, runsWithCode, rounds, roundsPerRun, needs, editorCost, promote };
  });
  return { counted, countedModels, rejected, noData, truncatedLines, ruleApplies, rows };
}

const HEADER =
  '| code | (a) A1 runs with the code | (b) rounds while reported | (c) check needs | (d) editor cost | promote |';

function countCell(value: number | 'no data', lowerBound: boolean): string {
  return value === 'no data' ? 'no data' : lowerBound ? `≥ ${value}` : String(value);
}

function roundsCell(row: CodeEvidence, lowerBound: boolean): string {
  const total = countCell(row.rounds, lowerBound);
  if (row.roundsPerRun.length === 0) return total;
  return `${total} (${row.roundsPerRun.map(r => `${r.run}: ${r.rounds}`).join(', ')})`;
}

function promoteCell(row: CodeEvidence): string {
  if (row.promote === 'rule not applied') return 'rule not applied';
  if (row.code === NEVER_PROMOTED) return 'no: never promoted (about the install)';
  if (row.runsWithCode === 'no data') return 'no: no data';
  return row.promote ? 'yes' : 'no: stays a review code';
}

function modelsText(models: readonly string[]): string {
  if (models.length === 0) return 'model not recorded';
  return `${models.length === 1 ? 'model' : 'models'} ${models.join(', ')}`;
}

/**
 * The markdown file, in this order: the scanned runs (each with its format and arms); the pinned
 * runs (counted, or rejected with the reason); one "no data" line per entry of `noData`; the
 * truncation note; the table; the rule.
 */
export function renderPromotionEvidence(input: {
  readonly scanned: readonly { readonly run: string; readonly note: string }[];
  readonly evidence: PromotionEvidence;
}): string {
  const { evidence } = input;
  const lowerBound = evidence.truncatedLines > 0;
  const scanned = [...input.scanned].sort((a, b) => compareText(a.run, b.run));
  const pinned = [
    ...evidence.countedModels.map(({ run, models }) => ({
      run,
      text: `- ${run}: counted (arm A1; ${modelsText(models)})`,
    })),
    ...evidence.rejected.map(r => ({ run: r.run, text: `- ${r.run}: rejected (${r.reason})` })),
  ].sort((a, b) => compareText(a.run, b.run));
  const lines = [
    '# Promotion evidence (FR-001)',
    '',
    'Generated by `pnpm evals:mcp:evidence`; regenerate it, do not edit it by hand (FR-001a).',
    'Only A1 runs are tabulated: A0 runs check through Bash and keep no telemetry log.',
    '',
    '## Scanned runs',
    '',
    ...(scanned.length === 0 ? ['- none exist'] : scanned.map(s => `- ${s.run}: ${s.note}`)),
    '',
    '## Pinned runs',
    '',
    ...(pinned.length === 0
      ? ['- none pinned: no run is counted (`--runs <id,...>`)']
      : pinned.map(p => p.text)),
    '',
    '## Records without a log',
    '',
    ...(evidence.noData.length === 0
      ? ['- none']
      : evidence.noData.map(d => `- ${d.run} ${d.caseId} A1-${d.n}: no data (no .mcp.log)`)),
    '',
    '## Truncation',
    '',
    lowerBound
      ? `${evidence.truncatedLines} counted check lines were truncated (\`telemetry.ts:79-98\`): columns (a) and (b) are lower bounds; a row below the rule may be under-counted, so check those rows by hand.`
      : 'No counted check line was truncated.',
    '',
    '## Table',
    '',
    HEADER,
    '|---|---|---|---|---|---|',
    ...evidence.rows.map(
      row =>
        `| \`${row.code}\` | ${countCell(row.runsWithCode, lowerBound)} | ${roundsCell(row, lowerBound)} | ${row.needs} | ${row.editorCost} | ${promoteCell(row)} |`
    ),
    '',
    '## Rule',
    '',
    'A code is promoted if and only if column (a) is at least 2 A1 runs or column (b) is at least 1 round (FR-001b). `lottie-web-not-installed` is never promoted; a code with "no data" is not promoted.',
    evidence.ruleApplies
      ? `Rule applied over the counted runs: ${evidence.counted.join(', ')}.`
      : 'Status: rule not applied: no pinned full run is counted, so every promotion stays blocked (FR-001a).',
    '',
  ];
  return lines.join('\n');
}
