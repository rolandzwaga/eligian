/**
 * Pruned coverage report (`pnpm test:coverage`).
 *
 * Runs the coverage-enabled test suite, then prints a compact per-directory table from the
 * language package's `coverage-summary.json` (the only package that writes one).
 *
 * Flags:
 *   --report-only        skip running the tests, just print the table from an existing summary
 *   --summary <file>     read the summary from <file> instead of the language package's default
 */
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultSummaryPath = resolve(
  repoRoot,
  'packages',
  'language',
  'coverage',
  'coverage-summary.json'
);

const args = process.argv.slice(2);
const reportOnly = args.includes('--report-only');
const summaryFlag = args.indexOf('--summary');
const summaryPath =
  summaryFlag !== -1 && args[summaryFlag + 1] ? resolve(args[summaryFlag + 1]) : defaultSummaryPath;

/** Percentage string; a directory with nothing to cover (total 0) reports 100.00, not NaN. */
function pct(covered: number, total: number): string {
  return (total === 0 ? 100 : (covered / total) * 100).toFixed(2);
}

async function printReport(): Promise<void> {
  const summaryData = await readFile(summaryPath, 'utf-8');
  const summary = JSON.parse(summaryData);

  // Helper to remove cwd + src from path
  const stripPath = (path: string): string => {
    const parts = path.split(sep);
    const srcIndex = parts.indexOf('src');
    if (srcIndex !== -1) {
      return parts.slice(srcIndex + 1).join(sep);
    }
    return path;
  };

  // Group files by directory
  const grouped = new Map<string, Array<[string, any]>>();

  for (const [file, metrics] of Object.entries(summary) as Array<[string, any]>) {
    if (file === 'total') continue;

    const strippedPath = stripPath(file);
    const dir = dirname(strippedPath);

    if (!grouped.has(dir)) {
      grouped.set(dir, []);
    }
    grouped.get(dir)!.push([strippedPath, metrics]);
  }

  const rows: Array<[string, string, string, string, string, string]> = [];

  // Add total row first
  if (summary.total) {
    const metrics = summary.total;
    rows.push([
      'All files',
      metrics.statements.pct.toFixed(2),
      metrics.branches.pct.toFixed(2),
      metrics.functions.pct.toFixed(2),
      metrics.lines.pct.toFixed(2),
      '',
    ]);
  }

  // Add grouped rows
  for (const [dir, files] of Array.from(grouped.entries()).sort()) {
    // Add directory header row (calculate aggregate for directory)
    const dirMetrics = files.reduce(
      (acc, [_, m]) => ({
        statements: {
          covered: acc.statements.covered + m.statements.covered,
          total: acc.statements.total + m.statements.total,
        },
        branches: {
          covered: acc.branches.covered + m.branches.covered,
          total: acc.branches.total + m.branches.total,
        },
        functions: {
          covered: acc.functions.covered + m.functions.covered,
          total: acc.functions.total + m.functions.total,
        },
        lines: {
          covered: acc.lines.covered + m.lines.covered,
          total: acc.lines.total + m.lines.total,
        },
      }),
      {
        statements: { covered: 0, total: 0 },
        branches: { covered: 0, total: 0 },
        functions: { covered: 0, total: 0 },
        lines: { covered: 0, total: 0 },
      }
    );

    rows.push([
      ` ${dir}`,
      pct(dirMetrics.statements.covered, dirMetrics.statements.total),
      pct(dirMetrics.branches.covered, dirMetrics.branches.total),
      pct(dirMetrics.functions.covered, dirMetrics.functions.total),
      pct(dirMetrics.lines.covered, dirMetrics.lines.total),
      '',
    ]);

    // Add file rows
    for (const [file, metrics] of files.sort()) {
      const filename = file.split(sep).pop()!;
      rows.push([
        `  ${filename}`,
        metrics.statements.pct.toFixed(2),
        metrics.branches.pct.toFixed(2),
        metrics.functions.pct.toFixed(2),
        metrics.lines.pct.toFixed(2),
        '',
      ]);
    }
  }

  const colWidths = [
    Math.max(35, ...rows.map(r => r[0].length)),
    9,
    10,
    9,
    9,
    Math.max(19, ...rows.map(r => r[5].length)),
  ] as const;

  const separator = colWidths.map(w => '-'.repeat(w)).join('|');
  const header = [
    'File'.padEnd(colWidths[0]),
    '% Stmts'.padStart(colWidths[1]),
    '% Branch'.padStart(colWidths[2]),
    '% Funcs'.padStart(colWidths[3]),
    '% Lines'.padStart(colWidths[4]),
    'Uncovered Line #s'.padStart(colWidths[5]),
  ].join('|');

  console.log(separator);
  console.log(header);
  console.log(separator);

  for (const row of rows) {
    const line = [
      row[0].padEnd(colWidths[0]),
      row[1].padStart(colWidths[1]),
      row[2].padStart(colWidths[2]),
      row[3].padStart(colWidths[3]),
      row[4].padStart(colWidths[4]),
      row[5].padStart(colWidths[5]),
    ].join('|');
    console.log(line);
  }

  console.log(separator);
}

async function reportOrFail(): Promise<void> {
  try {
    await printReport();
  } catch (error) {
    console.error(`Failed to read coverage summary (${summaryPath}):`, error);
    process.exit(1);
  }
}

if (reportOnly) {
  await reportOrFail();
} else {
  // Run the coverage-enabled suite from the repo root. Output is buffered (to keep the report
  // table clean) but printed in full when the run fails so failures are never hidden.
  const chunks: Buffer[] = [];
  const child = spawn('pnpm', ['run', 'test:coverage:ci'], {
    cwd: repoRoot,
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: true,
  });

  child.stdout?.on('data', (chunk: Buffer) => chunks.push(chunk));
  child.stderr?.on('data', (chunk: Buffer) => chunks.push(chunk));

  child.on('error', error => {
    console.error('Failed to start the coverage run:', error);
    process.exit(1);
  });

  child.on('close', async code => {
    if (code !== 0) {
      process.stderr.write(Buffer.concat(chunks));
      console.error(`\nCoverage run failed with exit code ${code ?? 'unknown'}.`);
      process.exit(code ?? 1);
    }
    await reportOrFail();
    process.exit(0);
  });
}
