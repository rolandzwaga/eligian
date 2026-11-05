/**
 * The review pass (spec 058, FR-030, SC-007): `controller-imbalance` and
 * `class-never-removed` over one compiled program, located at source.
 */
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { type CheckDiagnostic, checkFiles, type QuickFix } from '@eligian/language';
import { Effect } from 'effect';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkPaths, isLibrary } from '../check/check-command.js';
import { REVIEW_CODES, reviewConfig } from '../check/review.js';
import { compileFile } from '../compile-file.js';

const FIXTURES = path.join(__dirname, '__fixtures__', 'mcp', 'review');
const fixture = (name: string) => path.join(FIXTURES, `${name}.eligian`);
const TOUR = path.resolve(__dirname, '../../../../examples/eligian-tour');
const CLI = path.resolve(__dirname, '..', '..', 'bin', 'cli.js');
const built = fs.existsSync(path.resolve(__dirname, '..', '..', 'dist', 'cli.mjs'));

const review = async (file: string): Promise<CheckDiagnostic[]> =>
  reviewConfig(await compileFile(file), file);

/** The 0-based offset of a 1-based line / column in `source`. */
function offsetOf(source: string, line: number, column: number): number {
  let offset = 0;
  for (let current = 1; current < line; current++) offset = source.indexOf('\n', offset) + 1;
  return offset + column - 1;
}

/** Apply a quick fix mechanically: replace its range with `newText` (FR-011). */
function applyQuickFix(source: string, fix: QuickFix): string {
  const start = offsetOf(source, fix.line, fix.column);
  const end = offsetOf(source, fix.endLine, fix.endColumn);
  return source.slice(0, start) + fix.newText + source.slice(end);
}

describe('reviewConfig', () => {
  let tmp: string;

  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-review-'));
    fs.cpSync(FIXTURES, tmp, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  /** Fix a temp copy of `name`, then review and check it again. */
  async function fixAndRecheck(name: string, fix: QuickFix) {
    const file = path.join(tmp, `${name}.eligian`);
    const fixed = applyQuickFix(fs.readFileSync(file, 'utf-8'), fix);
    fs.writeFileSync(file, fixed);
    const findings = await review(file);
    const [checked] = await Effect.runPromise(checkFiles([file]));
    return {
      fixed,
      findings,
      errors: checked!.diagnostics.filter(d => d.severity === 'error'),
    };
  }

  it('exports the review codes', () => {
    expect(REVIEW_CODES).toEqual(['controller-imbalance', 'class-never-removed']);
  });

  describe('controller-imbalance', () => {
    it('with on leave', async () => {
      const file = fixture('imbalance-with-leave');
      const source = fs.readFileSync(file, 'utf-8');
      const findings = await review(file);

      expect(findings).toHaveLength(1);
      const [finding] = findings;
      expect(finding).toMatchObject({
        file,
        severity: 'warning',
        code: 'controller-imbalance',
        line: 5,
        column: 3,
      });
      expect(finding!.message).toContain('ProgressbarController');
      const fix = finding!.data!.quickFix!;
      // An insertion just before the `on leave` block's `]` (line 12)
      expect([fix.line, fix.column]).toEqual([fix.endLine, fix.endColumn]);
      expect(fix.line).toBe(12);
      expect(source[offsetOf(source, fix.line, fix.column)]).toBe(']');
      expect(fix.newText).toContain('selectElement("#bar")');
      expect(fix.newText).toContain('removeControllerFromElement("ProgressbarController")');

      const { fixed, findings: after, errors } = await fixAndRecheck('imbalance-with-leave', fix);
      expect(fixed).toContain(
        '  on leave [\n    selectElement("#box")\n    removeClass("lit")\n' +
          '    selectElement("#bar")\n    removeControllerFromElement("ProgressbarController")\n  ]\n'
      );
      expect(after).toEqual([]);
      expect(errors).toEqual([]);
    });

    it('without on leave', async () => {
      const file = fixture('imbalance-without-leave');
      const source = fs.readFileSync(file, 'utf-8');
      const findings = await review(file);

      expect(findings).toHaveLength(1);
      expect(findings[0]).toMatchObject({ severity: 'warning', code: 'controller-imbalance' });
      const fix = findings[0]!.data!.quickFix!;
      // An insertion just before the timeline's closing `}`
      expect([fix.line, fix.column]).toEqual([fix.endLine, fix.endColumn]);
      expect(source[offsetOf(source, fix.line, fix.column)]).toBe('}');
      expect(fix.line).toBe(source.trimEnd().split('\n').length);

      const {
        fixed,
        findings: after,
        errors,
      } = await fixAndRecheck('imbalance-without-leave', fix);
      expect(fixed).toContain(
        '  ]\n  on leave [\n    selectElement("#bar")\n' +
          '    removeControllerFromElement("ProgressbarController")\n  ]\n}\n'
      );
      expect(after).toEqual([]);
      expect(errors).toEqual([]);
    });

    it('removal without add: warning, no quickFix', async () => {
      const findings = await review(fixture('removal-without-add'));

      expect(findings).toHaveLength(1);
      expect(findings[0]).toMatchObject({ severity: 'warning', code: 'controller-imbalance' });
      expect(findings[0]!.data).toBeUndefined();
    });

    it('quick fix re-checked through checkPaths', async () => {
      const options = { lint: true, review: true } as const;
      const [before] = await checkPaths([fixture('imbalance-without-leave')], options);
      const imbalance = before!.diagnostics.find(d => d.code === 'controller-imbalance');
      expect(imbalance?.data?.quickFix).toBeDefined();

      // A fresh copy beside the fixture's layout and CSS, so the other tests' edits do not count
      const file = path.join(tmp, 'imbalance-without-leave.recheck.eligian');
      const source = fs.readFileSync(fixture('imbalance-without-leave'), 'utf-8');
      fs.writeFileSync(file, applyQuickFix(source, imbalance!.data!.quickFix!));
      const [after] = await checkPaths([file], options);

      expect(after!.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
      expect(
        after!.diagnostics.filter(d => (REVIEW_CODES as readonly unknown[]).includes(d.code))
      ).toEqual([]);
    });
  });

  describe('class-never-removed', () => {
    it('literal addClass never removed', async () => {
      const file = fixture('literal-never-removed');
      const findings = await review(file);

      expect(findings).toEqual([
        expect.objectContaining({
          file,
          severity: 'warning',
          code: 'class-never-removed',
          message:
            'addClass("lit") on "#box" is never removed in timeline "main": remove it in the end block, a later range or on leave',
          line: 7,
          column: 5,
        }),
      ]);
    });

    it('on enter add without on leave removal', async () => {
      const findings = await review(fixture('enter-without-leave-removal'));

      expect(findings).toEqual([
        expect.objectContaining({
          code: 'class-never-removed',
          message:
            'addClass("is-active") on "#panel" is never removed in timeline "main": remove it in the end block, a later range or on leave',
          line: 7,
        }),
      ]);
    });

    it('removed in the same action end block', async () => {
      expect(await review(fixture('removed-end-block'))).toEqual([]);
    });

    it('removed in the end block of an endable action called with a range', async () => {
      // `at 0s..2s light()` ends the action (requestAction + endAction) when the range ends
      expect(await review(fixture('removed-endable-action'))).toEqual([]);
    });

    it('removed in a later range', async () => {
      expect(await review(fixture('removed-later-range'))).toEqual([]);
    });

    it('toggled later', async () => {
      expect(await review(fixture('toggled-later'))).toEqual([]);
    });

    it('removed in on leave', async () => {
      expect(await review(fixture('removed-on-leave'))).toEqual([]);
    });

    it('on enter add paired with on leave removal', async () => {
      expect(await review(fixture('enter-paired-with-leave'))).toEqual([]);
    });

    it('parameterised showView / hideView calls', async () => {
      expect(await review(fixture('parameterised-views'))).toEqual([]);
    });

    it('non-literal selector on the add or the removal suppresses', async () => {
      expect(await review(fixture('non-literal-selector'))).toEqual([]);
    });
  });

  describe('the tour', () => {
    it('has no review finding', async () => {
      const files = ['presentation.eligian', 'tour.eligian'].map(name => path.join(TOUR, name));
      // Libraries are reviewed through the programs that import them, as `eligian check` does
      const programs = files.filter(file => !isLibrary(fs.readFileSync(file, 'utf-8')));
      expect(programs).toEqual([path.join(TOUR, 'tour.eligian')]);
      for (const file of programs) {
        expect(await review(file)).toEqual([]);
      }
    });

    it.skipIf(!built)(
      'the tour checks clean with the defaults',
      () => {
        const files = fs
          .readdirSync(TOUR)
          .filter(name => name.endsWith('.eligian'))
          .map(name => path.join(TOUR, name));
        expect(files.length).toBeGreaterThan(0);
        const result = spawnSync(
          process.execPath,
          [CLI, 'check', ...files, '--max-warnings', '0'],
          { encoding: 'utf-8' }
        );
        expect(result.stdout).toContain('0 errors, 0 warnings');
        expect(result.status).toBe(0);
      },
      60000
    );
  });
});
