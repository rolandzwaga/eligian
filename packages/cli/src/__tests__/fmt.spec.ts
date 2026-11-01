/**
 * `eligian fmt` (audit idea #15).
 */
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { firstDifference, lineDiff, runFmt } from '../fmt.js';

const CLI_PATH = path.join(__dirname, '../../bin/cli.js');
const MESSY = 'action a(sel) [\nselectElement( sel )\n]\n';
const FORMATTED = 'action a(sel) [\n  selectElement(sel)\n]\n';

describe('eligian fmt (audit idea #15)', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-fmt-'));
    fs.writeFileSync(path.join(dir, 'messy.eligian'), MESSY);
    fs.writeFileSync(path.join(dir, 'clean.eligian'), FORMATTED);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('--check lists unformatted files with a diff and exits 1; nothing is written', async () => {
    const outcome = await runFmt(['.'], { write: false, cwd: dir });

    expect(outcome.exitCode).toBe(1);
    expect(outcome.output).toContain('messy.eligian');
    expect(outcome.output).not.toContain('clean.eligian');
    expect(outcome.output).toContain('- selectElement( sel )');
    expect(outcome.output).toContain('+   selectElement(sel)');
    expect(outcome.output).toContain("1 file would be reformatted (run 'eligian fmt --write')");
    expect(fs.readFileSync(path.join(dir, 'messy.eligian'), 'utf-8')).toBe(MESSY);
  });

  it('--write formats the files; a second run finds nothing to do', async () => {
    const written = await runFmt(['.'], { write: true, cwd: dir });
    expect(written.exitCode).toBe(0);
    expect(written.output).toContain('Formatted messy.eligian');
    expect(fs.readFileSync(path.join(dir, 'messy.eligian'), 'utf-8')).toBe(FORMATTED);

    const checked = await runFmt(['.'], { write: false, cwd: dir });
    expect(checked).toEqual({ output: 'All 2 files formatted', exitCode: 0 });
  });

  it('leaves files with syntax errors alone and exits 2', async () => {
    fs.writeFileSync(path.join(dir, 'broken.eligian'), 'action a( [');
    const outcome = await runFmt(['broken.eligian'], { write: true, cwd: dir });
    expect(outcome.exitCode).toBe(2);
    expect(outcome.output).toContain('broken.eligian: not formatted, it has syntax errors');
    expect(fs.readFileSync(path.join(dir, 'broken.eligian'), 'utf-8')).toBe('action a( [');
  });

  it('runs from the real CLI entry', () => {
    const run = spawnSync('node', [CLI_PATH, 'fmt', '--check', dir], { encoding: 'utf-8' });
    expect(run.status).toBe(1);
    expect(run.stdout).toContain('1 file would be reformatted');
    const both = spawnSync('node', [CLI_PATH, 'fmt', '--check', '--write', dir], {
      encoding: 'utf-8',
    });
    expect(both.status).toBe(2);
  });

  it('--format github: an annotation per unformatted file, at its first changed line', async () => {
    fs.writeFileSync(path.join(dir, 'broken.eligian'), 'action a( [');
    const outcome = await runFmt(['.'], { write: false, cwd: dir, github: true });
    expect(outcome.output).toContain(
      "::error file=messy.eligian,line=2,title=Not formatted::Run 'eligian fmt --write messy.eligian'"
    );
    expect(outcome.output).toMatch(
      /^::error file=broken\.eligian,line=1,title=Syntax error::Not formatted: /m
    );
    // The diff is still printed for the log
    expect(outcome.output).toContain('+   selectElement(sel)');
    const plain = await runFmt(['.'], { write: false, cwd: dir });
    expect(plain.output).not.toContain('::error');
  });

  it('--format must be text or github', () => {
    const run = spawnSync('node', [CLI_PATH, 'fmt', dir, '--format', 'json'], {
      encoding: 'utf-8',
    });
    expect(run.status).toBe(2);
    expect(run.stderr).toContain('--format must be one of text, github');
    const github = spawnSync('node', [CLI_PATH, 'fmt', '.', '--format', 'github'], {
      encoding: 'utf-8',
      cwd: dir,
    });
    expect(github.status).toBe(1);
    expect(github.stdout).toContain('::error file=messy.eligian,line=2');
  });

  it('firstDifference is the first changed line (1-based)', () => {
    expect(firstDifference('a\nb\nc', 'a\nB\nc')).toBe(2);
    expect(firstDifference('a\r\nb', 'a\nb\nc')).toBe(3);
  });

  it('lineDiff shows changed lines with one line of context', () => {
    expect(lineDiff('a\nb\nc\nd\ne', 'a\nb\nC\nd\ne')).toBe(
      ['@@ line 2', '  b', '- c', '+ C', '  d'].join('\n')
    );
  });
});
