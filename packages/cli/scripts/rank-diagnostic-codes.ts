/**
 * The overlay selection (spec 058 phase 1, FR-040, FR-055; plan "Overlay
 * selection"). Checks the CLI and language fixture corpus and the examples
 * under the strict check (`selectorNotInLayout: 'ids'`, Eligius lint, review),
 * counts the codes produced and writes `diagnostic-code-ranking.json`:
 *
 * - `counts`: every code with its number of diagnostics, by count (descending),
 *   ties by code;
 * - `caseCodes`: the codes the start states of eval cases 13 (`fix-dataflow`)
 *   and 14 (`fix-selectors`) produce under the same check, sorted;
 * - `selection`: `caseCodes`, then the highest counted codes, up to 30.
 *
 * Deterministic: one check per file, sequential, sorted output, `\n` line
 * endings, no timestamps, and only committed fixtures (the directories that
 * other specs create and delete while they run are excluded).
 *
 * Run with tsx: `tsx scripts/rank-diagnostic-codes.ts`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkPaths, expandPatterns } from '../src/check/check-command.js';

export interface DiagnosticCodeRanking {
  readonly counts: { code: string; count: number }[];
  readonly caseCodes: string[];
  readonly selection: string[];
}

/** The number of codes that get an overlay (FR-040). */
export const SELECTION_SIZE = 30;

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');

/** The ranking's output file. */
export const RANKING_FILE = path.join(here, 'diagnostic-code-ranking.json');

const CORPUS = [
  'packages/cli/src/__tests__/__fixtures__/**/*.eligian',
  // Written and deleted by cli-library.spec.ts / cli-library-errors.spec.ts
  // while they run: not part of the committed corpus (they would make the
  // ranking depend on test timing when mcp-knowledge.spec.ts recomputes it)
  '!packages/cli/src/__tests__/__fixtures__/library-tests/**',
  '!packages/cli/src/__tests__/__fixtures__/library-error-tests/**',
  'packages/language/src/**/__fixtures__/**/*.eligian',
  'examples/**/*.eligian',
];

const CASES = [
  'evals/mcp/cases/fix-dataflow/start/**/*.eligian',
  'evals/mcp/cases/fix-selectors/start/**/*.eligian',
];

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Every code the strict check reports over `patterns`, once per diagnostic. */
async function codesOf(patterns: readonly string[]): Promise<string[]> {
  const files = await expandPatterns(patterns, repoRoot);
  const codes: string[] = [];
  for (const file of files) {
    const results = await checkPaths([file], {
      selectorNotInLayout: 'ids',
      lint: true,
      review: true,
    });
    for (const result of results) for (const d of result.diagnostics) codes.push(d.code);
  }
  return codes;
}

export async function rankDiagnosticCodes(): Promise<DiagnosticCodeRanking> {
  const tally = new Map<string, number>();
  for (const code of await codesOf(CORPUS)) tally.set(code, (tally.get(code) ?? 0) + 1);
  const counts = [...tally.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count || byText(a.code, b.code));

  const caseCodes = [...new Set(await codesOf(CASES))].sort(byText);

  const selection = [...caseCodes];
  for (const { code } of counts) {
    if (selection.length >= SELECTION_SIZE) break;
    if (!selection.includes(code)) selection.push(code);
  }

  return { counts, caseCodes, selection };
}

/** The ranking as the committed file holds it. */
export const rankingText = (ranking: DiagnosticCodeRanking): string =>
  `${JSON.stringify(ranking, null, 2)}\n`;

// ---------------------------------------------------------------------------
// Command line: tsx scripts/rank-diagnostic-codes.ts

const isMain = (): boolean => {
  const script = process.argv[1];
  if (script === undefined) return false;
  const self = fileURLToPath(import.meta.url);
  const same = (a: string, b: string): boolean =>
    process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
  return same(path.resolve(script), self) || same(path.resolve(script), self.replace(/\.ts$/, ''));
};

if (isMain()) {
  const started = Date.now();
  rankDiagnosticCodes().then(
    ranking => {
      fs.writeFileSync(RANKING_FILE, rankingText(ranking));
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      process.stdout.write(
        `rank-diagnostic-codes: ${ranking.counts.length} codes, ${ranking.selection.length} selected, ${seconds} s -> ${RANKING_FILE}\n`
      );
    },
    (error: unknown) => {
      process.stderr.write(
        `rank-diagnostic-codes: ${error instanceof Error ? error.message : String(error)}\n`
      );
      process.exitCode = 1;
    }
  );
}
