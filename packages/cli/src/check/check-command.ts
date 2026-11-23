/**
 * `eligian check <patterns...>`: report every diagnostic of the matched files.
 *
 * Exit codes: 0 when clean (warnings allowed up to --max-warnings),
 * 1 when there are errors or too many warnings, 2 for usage errors
 * (nothing matched, invalid options).
 *
 * With `lint`, every program without errors is also compiled and checked by
 * Eligius' configuration lint (see lint.ts); with `review`, by the review
 * pass (see review.ts). `checkPaths` is the check `eligian_check` shares.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  type CheckDiagnostic,
  type CheckFileResult,
  checkFiles,
  type SelectorNotInLayout,
} from '@eligian/language';
import { Effect } from 'effect';
import { compileFile } from '../compile-file.js';
import { expandPatterns, isLibrary } from './files.js';
import { lintCompiled } from './lint.js';
import { CHECK_FORMATS, type CheckFormat, formatResults, summarize } from './reporters.js';
import { reviewConfig } from './review.js';

export { expandPatterns, isLibrary } from './files.js';

export interface CheckOptions {
  readonly format: CheckFormat;
  /** Fail when there are more warnings than this. */
  readonly maxWarnings?: number;
  /** Count warnings as errors (same as --max-warnings 0). */
  readonly warningsAsErrors: boolean;
  readonly cwd: string;
  readonly version: string;
  /** Warn about selector names in the CSS but not in the layout HTML (default: off) */
  readonly selectorNotInLayout?: SelectorNotInLayout;
  /** Also run Eligius' configuration lint over the compiled programs */
  readonly lint?: boolean;
  /** Also run the review pass (controller balance, classes never removed) over them */
  readonly review?: boolean;
}

export interface CheckOutcome {
  /** Report text for stdout (empty for usage errors). */
  readonly output: string;
  /** Message for stderr, if any. */
  readonly error?: string;
  readonly exitCode: 0 | 1 | 2;
}

/** Parse --format; undefined when it is not a known format. */
export function parseCheckFormat(value: string): CheckFormat | undefined {
  return (CHECK_FORMATS as readonly string[]).includes(value) ? (value as CheckFormat) : undefined;
}

/** Parse --max-warnings: a non-negative whole number; undefined otherwise. */
export function parseMaxWarnings(value: string): number | undefined {
  return /^\d+$/.test(value.trim()) ? Number(value.trim()) : undefined;
}

export async function runCheck(
  patterns: readonly string[],
  options: CheckOptions
): Promise<CheckOutcome> {
  const files = await expandPatterns(patterns, options.cwd);
  if (files.length === 0) {
    return {
      output: '',
      error: `No files matched: ${patterns.join(' ')}`,
      exitCode: 2,
    };
  }

  const results = await checkPaths(files, {
    selectorNotInLayout: options.selectorNotInLayout,
    lint: options.lint ?? false,
    review: options.review ?? false,
  });
  const summary = summarize(results);
  const output = formatResults(options.format, results, options.cwd, options.version);

  const maxWarnings = options.warningsAsErrors ? 0 : options.maxWarnings;
  const tooManyWarnings = maxWarnings !== undefined && summary.warnings > maxWarnings;
  const failed = summary.errors > 0 || tooManyWarnings;

  return {
    output,
    error:
      tooManyWarnings && summary.errors === 0
        ? `Too many warnings: ${summary.warnings} (maximum ${maxWarnings})`
        : undefined,
    exitCode: failed ? 1 : 0,
  };
}

/** The checks that need a compiled program. */
export interface CompiledChecks {
  /** Eligius' configuration lint (lint.ts) */
  readonly lint: boolean;
  /** The review pass (review.ts) */
  readonly review: boolean;
}

/** checkFiles + withCompiledChecks: the check `eligian check` and `eligian_check` share. */
export async function checkPaths(
  files: readonly string[],
  options: {
    readonly selectorNotInLayout?: SelectorNotInLayout;
    readonly lint: boolean;
    readonly review: boolean;
  }
): Promise<CheckFileResult[]> {
  const checked = await Effect.runPromise(
    checkFiles(files, { selectorNotInLayout: options.selectorNotInLayout })
  );
  return withCompiledChecks(checked, { lint: options.lint, review: options.review });
}

/**
 * For every program without errors (libraries are checked through the
 * programs that import them): compile it once and add the Eligius lint
 * findings and the review warnings. A finding in an imported library goes to
 * that library's result, which is added when the library was not checked
 * itself. A program that checks clean but does not compile gets a
 * `compile-failed` error.
 */
export async function withCompiledChecks(
  results: readonly CheckFileResult[],
  checks: CompiledChecks
): Promise<CheckFileResult[]> {
  if (!checks.lint && !checks.review) return [...results];
  const extra = new Map<string, CheckDiagnostic[]>();
  const add = (diagnostic: CheckDiagnostic) => {
    // Library locations come from document URIs (a lower-case drive on Windows)
    const owner =
      [...results.map(r => r.file), ...extra.keys()].find(
        file => path.relative(file, diagnostic.file) === ''
      ) ?? diagnostic.file;
    extra.set(owner, [...(extra.get(owner) ?? []), { ...diagnostic, file: owner }]);
  };
  for (const result of results) {
    if (result.diagnostics.some(d => d.severity === 'error')) continue;
    if (isLibrary(await fs.promises.readFile(result.file, 'utf-8'))) continue;
    try {
      const compiled = await compileFile(result.file);
      const found = [
        ...(checks.lint ? lintCompiled(result.file, compiled) : []),
        ...(checks.review ? reviewConfig(compiled, result.file) : []),
      ];
      for (const diagnostic of found) add(diagnostic);
    } catch (error) {
      add({
        file: result.file,
        severity: 'error',
        message: `checks clean but does not compile: ${error instanceof Error ? error.message : String(error)}`,
        line: 1,
        column: 1,
        endLine: 1,
        endColumn: 2,
        code: 'compile-failed',
      });
    }
  }
  const byLine = (a: CheckDiagnostic, b: CheckDiagnostic) => a.line - b.line || a.column - b.column;
  const merged = results.map(result => {
    const added = extra.get(result.file);
    return added
      ? {
          ...result,
          diagnostics: [...result.diagnostics, ...withoutReported(added, result.diagnostics)].sort(
            byLine
          ),
        }
      : result;
  });
  const unchecked = [...extra.entries()]
    .filter(([file]) => !results.some(r => r.file === file))
    .map(([file, diagnostics]) => ({ file, diagnostics: [...diagnostics].sort(byLine) }));
  return [...merged, ...unchecked];
}

/**
 * The review warnings minus the container warnings the validation already
 * reports (spec 058 FR-050, I-4): `selector_not_in_layout` and
 * `timeline-container-not-in-layout` both range the timeline's `in` selector.
 */
function withoutReported(
  added: readonly CheckDiagnostic[],
  validated: readonly CheckDiagnostic[]
): CheckDiagnostic[] {
  return added.filter(
    d =>
      d.code !== 'timeline-container-not-in-layout' ||
      !validated.some(
        v => v.code === 'selector_not_in_layout' && v.line === d.line && v.column === d.column
      )
  );
}
