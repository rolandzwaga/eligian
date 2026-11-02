/**
 * `eligian init` (audit idea #12): writes a starter project, never overwrites
 * without --force, and every starter checks without errors or warnings, also
 * with the stricter 'not in layout' setting (so they stay in sync with the
 * grammar and the validators).
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { STARTERS, starterFiles } from '@eligian/language';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCheck } from '../check/check-command.js';
import { runInit, titleFromDirectory } from '../init.js';

describe('eligian init', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-init-'));
  });

  afterEach(() => {
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  const read = (file: string) => fs.readFileSync(path.join(cwd, file), 'utf-8');

  it('writes the starter into a new directory, titled after it', async () => {
    const outcome = await runInit('my-talk', { template: 'chapters', force: false, cwd });
    expect(outcome.exitCode).toBe(0);
    expect(outcome.output).toContain('Created my-talk/ (Chapters starter)');
    expect(outcome.output).toContain('cd my-talk');
    for (const file of Object.keys(starterFiles('chapters'))) {
      expect(fs.existsSync(path.join(cwd, 'my-talk', file))).toBe(true);
    }
    expect(JSON.parse(read('my-talk/locales.json'))['en-US'].hub.title).toBe('My Talk');
    expect(JSON.parse(read('my-talk/package.json')).name).toBe('my-talk');
  });

  it('never overwrites existing files without --force', async () => {
    fs.writeFileSync(path.join(cwd, 'main.eligian'), 'keep me');
    const refused = await runInit('.', { template: 'blank', force: false, cwd });
    expect(refused.exitCode).toBe(1);
    expect(refused.output).toContain('main.eligian');
    expect(read('main.eligian')).toBe('keep me');
    // Nothing else was written either
    expect(fs.existsSync(path.join(cwd, 'layout.html'))).toBe(false);

    const forced = await runInit('.', { template: 'blank', force: true, title: 'Talk', cwd });
    expect(forced.exitCode).toBe(0);
    expect(read('main.eligian')).toContain('timeline "Talk"');
  });

  it('rejects an unknown template', async () => {
    const outcome = await runInit('x', { template: 'slides', force: false, cwd });
    expect(outcome.exitCode).toBe(2);
    expect(outcome.output).toContain('blank, chapters, video, library');
  });

  it('derives a title from the directory name', () => {
    expect(titleFromDirectory('my-first_talk')).toBe('My First Talk');
  });

  describe.each(STARTERS.map(starter => starter.name))('the %s starter', name => {
    it('checks without errors or warnings', async () => {
      expect((await runInit('.', { template: name, force: false, cwd })).exitCode).toBe(0);
      const outcome = await runCheck(['**/*.eligian'], {
        format: 'json',
        warningsAsErrors: true,
        selectorNotInLayout: 'ids',
        cwd,
        version: 'test',
      });
      const report = JSON.parse(outcome.output);
      expect(report.files.flatMap((f: { diagnostics: unknown[] }) => f.diagnostics)).toEqual([]);
      expect(outcome.exitCode).toBe(0);
    }, 30000);
  });
});
