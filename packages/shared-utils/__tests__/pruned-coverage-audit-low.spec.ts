/**
 * Regression test for audit low finding #74: tools/pruned-coverage.ts read the wrong summary path
 * and swallowed failures. Uses --report-only so no test suite is run.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const tool = join(root, 'tools', 'pruned-coverage.ts');

const metric = (covered: number, total: number) => ({
  total,
  covered,
  skipped: 0,
  pct: total === 0 ? 100 : (covered / total) * 100,
});
const fileMetrics = (branches: number) => ({
  statements: metric(5, 10),
  branches: metric(0, branches),
  functions: metric(1, 2),
  lines: metric(5, 10),
});

function run(...extra: string[]) {
  return spawnSync('pnpm', ['exec', 'tsx', tool, '--report-only', ...extra], {
    cwd: root,
    encoding: 'utf-8',
    shell: true,
  });
}

describe('audit #74: pruned-coverage tool', () => {
  it('prints a table without NaN for directories that have zero branches', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pruned-cov-'));
    const summaryFile = join(dir, 'coverage-summary.json');
    const sep = process.platform === 'win32' ? '\\' : '/';
    const summary = {
      total: fileMetrics(0),
      [['', 'proj', 'src', 'a', 'x.ts'].join(sep)]: fileMetrics(0),
    };
    writeFileSync(summaryFile, JSON.stringify(summary));

    const result = run('--summary', summaryFile);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('All files');
    expect(result.stdout).toContain('x.ts');
    expect(result.stdout).not.toContain('NaN');
  });

  it('reports and fails when the summary file is missing', () => {
    const result = run('--summary', join(tmpdir(), 'definitely-missing-summary.json'));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Failed to read coverage summary');
    expect(result.stderr).toContain('definitely-missing-summary.json');
  });

  it('defaults to the language package summary path, not the cwd', () => {
    const source = readFileSync(tool, 'utf-8');
    expect(source).toContain("'packages',");
    expect(source).toContain("'coverage-summary.json'");
    expect(source).not.toContain("readFile('coverage/");
  });
});
