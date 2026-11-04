/**
 * SC-016 diagnostic snapshot (spec 058, Phase 0).
 *
 * Runs `checkFiles` one file at a time over the SC-001 sets (a)+(b) and writes
 * every diagnostic without its `code` to `diagnostics-<before|after>.json`,
 * sorted, so that the before and after runs can be compared with `diff`.
 *
 * Usage (from the repo root): pnpm exec tsx specs/058-mcp-server/phase-0-foundation/baseline/snapshot-diagnostics.ts before|after
 */
import { readdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Effect } from 'effect';
import { checkFiles } from '../../../../packages/language/src/compiler/pipeline/check.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../..');

/** SC-001 set (a) roots, then set (b). */
const ROOTS = [
  'packages/language/src/__tests__/__fixtures__',
  'packages/language/src/compiler/__tests__/__fixtures__',
  'packages/cli/src/__tests__/__fixtures__',
  'examples',
];

/** Fixture directories that later Phase 0 tasks add: excluded so before and after see one file set. */
const EXCLUDED_DIRS = new Set(['diagnostic-codes', 'check-codes', 'runtime-claims']);

/** Never part of the sets (build output, installed packages). */
const SKIPPED_DIRS = new Set(['node_modules', 'dist']);

const toRepoPath = (file: string): string => path.relative(repoRoot, file).split(path.sep).join('/');

function collect(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name) || SKIPPED_DIRS.has(entry.name)) continue;
      collect(full, out);
    } else if (entry.isFile() && entry.name.endsWith('.eligian')) {
      out.push(full);
    }
  }
}

interface SnapshotDiagnostic {
  readonly file: string;
  readonly severity: string;
  readonly message: string;
  readonly line: number;
  readonly column: number;
  readonly endLine: number;
  readonly endColumn: number;
}

const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const compare = (a: SnapshotDiagnostic, b: SnapshotDiagnostic): number =>
  compareText(a.file, b.file) ||
  a.line - b.line ||
  a.column - b.column ||
  a.endLine - b.endLine ||
  a.endColumn - b.endColumn ||
  compareText(a.severity, b.severity) ||
  compareText(a.message, b.message);

async function main(): Promise<void> {
  const which = process.argv[2];
  if (which !== 'before' && which !== 'after') {
    process.stderr.write('usage: snapshot-diagnostics.ts before|after\n');
    process.exit(2);
  }

  const files: string[] = [];
  for (const root of ROOTS) collect(path.join(repoRoot, root), files);
  files.sort((a, b) => compareText(toRepoPath(a), toRepoPath(b)));

  const diagnostics: SnapshotDiagnostic[] = [];
  // Sequential: checkFiles shares one Langium workspace (check.ts:73-82, :162-164, :223)
  for (const file of files) {
    const results = await Effect.runPromise(checkFiles([file]));
    for (const result of results) {
      for (const d of result.diagnostics) {
        diagnostics.push({
          file: toRepoPath(d.file),
          severity: d.severity,
          message: d.message,
          line: d.line,
          column: d.column,
          endLine: d.endLine,
          endColumn: d.endColumn,
        });
      }
    }
  }
  diagnostics.sort(compare);

  const out = path.join(here, `diagnostics-${which}.json`);
  writeFileSync(out, `${JSON.stringify(diagnostics, null, 2)}\n`);
  process.stderr.write(`files: ${files.length}\ndiagnostics: ${diagnostics.length}\n`);
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
  process.exit(1);
});
