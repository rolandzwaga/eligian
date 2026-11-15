/**
 * The operation overlay selection (spec 058 phase 2, FR-073, Interpretation
 * I-9; plan F3). Counts the source call sites that resolve to registry
 * operations over the `check:examples` corpus (the root package.json globs, so
 * without `examples/demo.eligian`) and the `.eligian` files of the four
 * starters, and writes `operation-ranking.json`:
 *
 * - `counts`: every counted operation with its number of call sites, by count
 *   (descending), ties by name;
 * - `selection`: every counted operation, at most 25 (ruling 2026-11-05, T036: the
 *   examples and starters use 13 distinct registry operations today, so the
 *   selection is what the corpus uses, not padded to 25).
 *
 * A call counts when its name has a registry signature
 * (`getOperationSignature(name)`, so no host operations) and no action of that
 * name is callable from the call site (`calledAction`, on documents linked by
 * `withLoadedDocuments`, libraries included).
 *
 * Deterministic: sorted output, `\n` line endings, no timestamps, and only
 * committed sources (the starters are written to a temp dir for the run).
 *
 * Run with tsx: `tsx scripts/rank-operations.ts`.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getOperationSignature,
  STARTERS,
  starterFiles,
  withLoadedDocuments,
} from '@eligian/language';
import { calledAction } from '@eligian/language/mcp';
import { type AstNode, AstUtils } from 'langium';
import { expandPatterns } from '../src/check/check-command.js';

export interface OperationRanking {
  readonly counts: { name: string; count: number }[];
  readonly selection: string[];
}

/** The number of operations that get an overlay (FR-073). */
export const OPERATION_SELECTION_SIZE = 25;

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');

/** The ranking's output file. */
export const OPERATION_RANKING_FILE = path.join(here, 'operation-ranking.json');

/** The root `check:examples` globs (package.json). */
const CORPUS = [
  'examples/**/*.eligian',
  '!examples/libraries/errors/**',
  '!examples/libraries/nested/cycle-*.eligian',
  '!examples/demo.eligian',
];

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** The `.eligian` files of every starter, written under `dir`; their absolute paths. */
function writeStarters(dir: string): string[] {
  const files: string[] = [];
  for (const starter of STARTERS) {
    const texts = starterFiles(starter.name);
    for (const name of Object.keys(texts).filter(name => name.endsWith('.eligian'))) {
      const file = path.join(dir, starter.name, name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, texts[name]);
      files.push(file);
    }
  }
  return files;
}

/** The grammar's `OperationCall` (the generated type is not exported). */
type OperationCall = Parameters<typeof calledAction>[0];

const isOperationCall = (node: AstNode): node is OperationCall => node.$type === 'OperationCall';

export async function rankOperations(): Promise<OperationRanking> {
  const startersDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-rank-operations-'));
  try {
    const files = [...(await expandPatterns(CORPUS, repoRoot)), ...writeStarters(startersDir)];
    const tally = await withLoadedDocuments(files, loaded => {
      const counted = new Map<string, number>();
      for (const file of files) {
        const document = loaded.documentOf(file);
        if (document === undefined) throw new Error(`${file}: not loaded`);
        const { lexerErrors, parserErrors, value } = document.parseResult;
        if (lexerErrors.length > 0 || parserErrors.length > 0) {
          throw new Error(`${file}: syntax errors`);
        }
        for (const node of AstUtils.streamAst(value)) {
          if (!isOperationCall(node)) continue;
          const name = node.operationName.$refText;
          if (getOperationSignature(name) === undefined) continue;
          if (calledAction(node) !== undefined) continue;
          counted.set(name, (counted.get(name) ?? 0) + 1);
        }
      }
      return counted;
    });
    const counts = [...tally.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || byText(a.name, b.name));
    const selection = counts.slice(0, OPERATION_SELECTION_SIZE).map(({ name }) => name);
    return { counts, selection };
  } finally {
    fs.rmSync(startersDir, { recursive: true, force: true });
  }
}

/** The ranking as the committed file holds it. */
export const rankingText = (ranking: OperationRanking): string =>
  `${JSON.stringify(ranking, null, 2)}\n`;

// ---------------------------------------------------------------------------
// Command line: tsx scripts/rank-operations.ts

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
  rankOperations().then(
    ranking => {
      fs.writeFileSync(OPERATION_RANKING_FILE, rankingText(ranking));
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      process.stdout.write(
        `rank-operations: ${ranking.counts.length} operations, ${ranking.selection.length} selected, ${seconds} s -> ${OPERATION_RANKING_FILE}\n`
      );
    },
    (error: unknown) => {
      process.stderr.write(
        `rank-operations: ${error instanceof Error ? error.message : String(error)}\n`
      );
      process.exitCode = 1;
    }
  );
}
