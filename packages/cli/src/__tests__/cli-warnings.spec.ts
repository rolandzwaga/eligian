/**
 * Regression tests: warning-severity diagnostics must not fail compilation
 * (audit 2026-10-22, High: "Any warning, info or hint diagnostic aborts
 * compilation as a ValidationError").
 *
 * The fixture's only diagnostic is the timeline-validation warning
 * "Timeline provider 'raf' does not use a source file".
 *
 * Both the library API (compileFile) and the CLI binary are exercised; the CLI
 * test requires built dist output (same as cli.spec.ts).
 */

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compileFile } from '../compile-file.js';

const CLI_PATH = path.join(__dirname, '../../bin/cli.js');
const WARNING_FIXTURE = path.join(__dirname, '__fixtures__', 'warning-only.eligian');
const VALID_FIXTURE = path.join(__dirname, '__fixtures__', 'valid-simple.eligian');

describe('compileFile - warnings do not abort compilation', () => {
  it('compiles a file whose only diagnostic is a warning and returns the warning', async () => {
    const result = await compileFile(WARNING_FIXTURE);

    expect(result.config.timelines).toHaveLength(1);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatchObject({
      severity: 'warning',
      file: WARNING_FIXTURE,
      line: 13,
    });
    expect(result.warnings[0].message).toContain(
      "Timeline provider 'raf' does not use a source file"
    );
  });

  it('returns an empty warnings array for a clean file', async () => {
    const result = await compileFile(VALID_FIXTURE);

    expect(result.warnings).toEqual([]);
  });
});

describe('CLI - warnings do not abort compilation', () => {
  let tmpdir: string;

  beforeEach(async () => {
    tmpdir = await fsp.mkdtemp(path.join(os.tmpdir(), 'eligian-cli-warn-'));
  });

  afterEach(async () => {
    await fsp.rm(tmpdir, { recursive: true, force: true }).catch(() => {});
  });

  it('exits 0, writes output and prints the warning to stderr', () => {
    const outputFile = path.join(tmpdir, 'output.json');

    const run = spawnSync('node', [CLI_PATH, WARNING_FIXTURE, '-o', outputFile], {
      encoding: 'utf-8',
    });

    expect(run.status).toBe(0);
    expect(run.stderr).toContain('Warning:');
    expect(run.stderr).toContain("Timeline provider 'raf' does not use a source file");
    expect(run.stderr).toContain('warning-only.eligian:13:');
    expect(fs.existsSync(outputFile)).toBe(true);
    expect(JSON.parse(fs.readFileSync(outputFile, 'utf-8')).timelines).toHaveLength(1);
  });

  it('keeps stdout pure JSON when writing to stdout with warnings present', () => {
    const run = spawnSync('node', [CLI_PATH, WARNING_FIXTURE, '-o', '-'], { encoding: 'utf-8' });

    expect(run.status).toBe(0);
    expect(() => JSON.parse(run.stdout)).not.toThrow();
    expect(run.stderr).toContain('Warning:');
  });

  it('suppresses warnings with --quiet', () => {
    const run = spawnSync('node', [CLI_PATH, WARNING_FIXTURE, '--check', '--quiet'], {
      encoding: 'utf-8',
    });

    expect(run.status).toBe(0);
    expect(run.stderr).not.toContain('Warning:');
  });
});
