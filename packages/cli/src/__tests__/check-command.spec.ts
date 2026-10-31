/**
 * `eligian check`: pattern expansion, report formats and exit codes.
 */
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { CheckFileResult } from '@eligian/language';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  expandPatterns,
  parseCheckFormat,
  parseMaxWarnings,
  runCheck,
} from '../check/check-command.js';
import { formatGithub, formatJson, formatSarif, summaryLine } from '../check/reporters.js';

const CLI = path.resolve(__dirname, '..', '..', 'bin', 'cli.js');

describe('eligian check', () => {
  let dir: string;
  const write = (name: string, content: string) => {
    const file = path.join(dir, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    return file;
  };

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-check-cli-'));
    write('s.css', '.c {} .on {} #a {}');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const CLEAN = `styles "./s.css"
timeline "t" in ".c" using raf { at 0s..1s [ selectElement("#a") addClass("on") ] [] }
`;
  const WARNING = `styles "./s.css"\ntimeline "t" in ".c" using raf {}\n`;
  const TWO_ERRORS = `styles "./s.css"
action a() [ selectElement("#a") addClass("nope") ]
timeline "t" in ".c" using raf { at 0s..1s a() at 1s..2s [ selectElement("#a") addClass("bad") ] [] }
`;

  const options = (overrides: Partial<Parameters<typeof runCheck>[1]> = {}) => ({
    format: 'json' as const,
    warningsAsErrors: false,
    cwd: dir,
    version: '0.0.0-test',
    ...overrides,
  });

  describe('pattern expansion', () => {
    it('expands globs, directories and file names, with ! excludes, sorted and unique', async () => {
      write('a.eligian', CLEAN);
      write('sub/b.eligian', CLEAN);
      write('sub/skip.eligian', CLEAN);
      write('node_modules/pkg/c.eligian', CLEAN);
      write('notes.txt', '');

      const files = await expandPatterns(
        ['**/*.eligian', 'sub', 'a.eligian', '!sub/skip.eligian'],
        dir
      );

      expect(files.map(f => path.relative(dir, f).split(path.sep).join('/'))).toEqual([
        'a.eligian',
        'sub/b.eligian',
      ]);
    });
  });

  describe('exit codes', () => {
    it('is 0 for clean files and 1 when any file has an error, reporting every error', async () => {
      write('clean.eligian', CLEAN);
      write('broken.eligian', TWO_ERRORS);

      const clean = await runCheck(['clean.eligian'], options());
      const broken = await runCheck(['*.eligian'], options());

      expect(clean.exitCode).toBe(0);
      expect(broken.exitCode).toBe(1);
      const report = JSON.parse(broken.output);
      expect(report.summary).toEqual({ files: 2, errors: 2, warnings: 0, infos: 0, hints: 0 });
      expect(report.files.map((f: { file: string }) => f.file)).toEqual([
        'broken.eligian',
        'clean.eligian',
      ]);
    });

    it('allows warnings unless --max-warnings or --warnings-as-errors says otherwise', async () => {
      write('w.eligian', WARNING);

      expect((await runCheck(['w.eligian'], options())).exitCode).toBe(0);
      expect((await runCheck(['w.eligian'], options({ maxWarnings: 1 }))).exitCode).toBe(0);
      const strict = await runCheck(['w.eligian'], options({ maxWarnings: 0 }));
      expect(strict.exitCode).toBe(1);
      expect(strict.error).toBe('Too many warnings: 1 (maximum 0)');
      expect((await runCheck(['w.eligian'], options({ warningsAsErrors: true }))).exitCode).toBe(1);
    });

    it('is 2 when nothing matches', async () => {
      const outcome = await runCheck(['missing/**/*.eligian'], options());
      expect(outcome).toEqual({
        output: '',
        error: 'No files matched: missing/**/*.eligian',
        exitCode: 2,
      });
    });
  });

  describe('option parsing', () => {
    it('accepts the known formats and whole-number warning limits only', () => {
      expect(['pretty', 'json', 'sarif', 'github'].map(parseCheckFormat)).toEqual([
        'pretty',
        'json',
        'sarif',
        'github',
      ]);
      expect(parseCheckFormat('xml')).toBeUndefined();
      expect(parseMaxWarnings('0')).toBe(0);
      expect(parseMaxWarnings(' 12 ')).toBe(12);
      expect(['-1', '1.5', 'ten', ''].map(parseMaxWarnings)).toEqual([
        undefined,
        undefined,
        undefined,
        undefined,
      ]);
    });
  });

  describe('formats', () => {
    const results: CheckFileResult[] = [
      {
        file: '/work/src/a.eligian',
        diagnostics: [
          {
            file: '/work/src/a.eligian',
            severity: 'error',
            message: 'Bad: 100%\nsecond line',
            line: 3,
            column: 5,
            endLine: 3,
            endColumn: 9,
            code: 'some_code',
          },
          {
            file: '/work/src/a.eligian',
            severity: 'info',
            message: 'Note, here',
            line: 1,
            column: 1,
            endLine: 1,
            endColumn: 2,
          },
        ],
      },
    ];
    const cwd = '/work';

    it('github: workflow commands with escaped data and properties', () => {
      expect(formatGithub(results, cwd).split('\n')).toEqual([
        '::error file=src/a.eligian,line=3,col=5,endLine=3,endColumn=9,title=some_code::Bad: 100%25%0Asecond line',
        '::notice file=src/a.eligian,line=1,col=1,endLine=1,endColumn=2::Note, here',
        '1 file, 1 error, 0 warnings, 1 info',
      ]);
    });

    it('sarif: a 2.1.0 log with one rule per code and mapped levels', () => {
      const log = JSON.parse(formatSarif(results, cwd, '1.2.3'));
      expect(log.version).toBe('2.1.0');
      const run = log.runs[0];
      expect(run.tool.driver).toMatchObject({ name: 'eligian', version: '1.2.3' });
      expect(run.tool.driver.rules).toEqual([{ id: 'eligian' }, { id: 'some_code' }]);
      expect(
        run.results.map((r: { ruleId: string; level: string }) => [r.ruleId, r.level])
      ).toEqual([
        ['some_code', 'error'],
        ['eligian', 'note'],
      ]);
      expect(run.results[0].locations[0].physicalLocation).toEqual({
        artifactLocation: { uri: 'src/a.eligian' },
        region: { startLine: 3, startColumn: 5, endLine: 3, endColumn: 9 },
      });
    });

    it('json: relative files and a summary', () => {
      const report = JSON.parse(formatJson(results, cwd));
      expect(report.files[0].file).toBe('src/a.eligian');
      expect(report.files[0].diagnostics[0]).not.toHaveProperty('file');
      expect(report.summary).toEqual({ files: 1, errors: 1, warnings: 0, infos: 1, hints: 0 });
    });

    it('summary line pluralizes', () => {
      expect(summaryLine({ files: 1, errors: 0, warnings: 2, infos: 0, hints: 0 })).toBe(
        '1 file, 0 errors, 2 warnings'
      );
    });
  });

  describe('command line', () => {
    it('runs `check` and keeps `eligian <input>` as the compile command', () => {
      const input = write('cli.eligian', CLEAN);
      write('bad.eligian', TWO_ERRORS);

      const check = spawnSync(process.execPath, [CLI, 'check', '*.eligian', '--format', 'github'], {
        cwd: dir,
        encoding: 'utf-8',
      });
      expect(check.status).toBe(1);
      expect(check.stdout).toContain('::error file=bad.eligian,line=2');
      expect(check.stdout).toContain('2 files, 2 errors, 0 warnings');

      const compile = spawnSync(process.execPath, [CLI, input, '-o', '-'], { encoding: 'utf-8' });
      expect(compile.status).toBe(0);
      expect(JSON.parse(compile.stdout).timelines).toHaveLength(1);

      const badFormat = spawnSync(
        process.execPath,
        [CLI, 'check', 'cli.eligian', '--format', 'xml'],
        {
          cwd: dir,
          encoding: 'utf-8',
        }
      );
      expect(badFormat.status).toBe(2);
    }, 60000);
  });
});
