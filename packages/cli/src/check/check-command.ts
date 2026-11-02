/**
 * `eligian check <patterns...>`: report every diagnostic of the matched files.
 *
 * Exit codes: 0 when clean (warnings allowed up to --max-warnings),
 * 1 when there are errors or too many warnings, 2 for usage errors
 * (nothing matched, invalid options).
 *
 * With `lint`, every program without errors is also compiled and checked by
 * Eligius' configuration lint (see lint.ts).
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
import { glob } from 'tinyglobby';
import { lintFile } from './lint.js';
import { CHECK_FORMATS, type CheckFormat, formatResults, summarize } from './reporters.js';

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
}

export interface CheckOutcome {
  /** Report text for stdout (empty for usage errors). */
  readonly output: string;
  /** Message for stderr, if any. */
  readonly error?: string;
  readonly exitCode: 0 | 1 | 2;
}

/** Whether a source is a library file (`library name` after any comments). */
export function isLibrary(source: string): boolean {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  return /^\s*library\b/.test(code);
}

/** Parse --format; undefined when it is not a known format. */
export function parseCheckFormat(value: string): CheckFormat | undefined {
  return (CHECK_FORMATS as readonly string[]).includes(value) ? (value as CheckFormat) : undefined;
}

/** Parse --max-warnings: a non-negative whole number; undefined otherwise. */
export function parseMaxWarnings(value: string): number | undefined {
  return /^\d+$/.test(value.trim()) ? Number(value.trim()) : undefined;
}

/**
 * Expand patterns to .eligian files. A pattern naming an existing file is used
 * as is (any extension); a directory means every .eligian file below it;
 * anything else is a glob (`examples/**\/*.eligian`). A pattern starting with
 * `!` excludes the files it matches. node_modules is skipped.
 */
export async function expandPatterns(patterns: readonly string[], cwd: string): Promise<string[]> {
  // `!pattern` excludes matches of the other patterns
  const excludes = patterns.filter(p => p.startsWith('!')).map(p => toGlobPath(p.slice(1)));
  const files = new Set<string>();
  for (const pattern of patterns.filter(p => !p.startsWith('!'))) {
    const absolute = path.resolve(cwd, pattern);
    const stat = fs.statSync(absolute, { throwIfNoEntry: false });
    if (stat?.isFile() && excludes.length === 0) {
      files.add(absolute);
      continue;
    }
    const globPattern = stat?.isDirectory()
      ? `${toGlobPath(path.relative(cwd, absolute)) || '.'}/**/*.eligian`
      : stat?.isFile()
        ? toGlobPath(path.relative(cwd, absolute))
        : toGlobPath(pattern);
    const matches = await glob(globPattern, {
      cwd,
      absolute: true,
      onlyFiles: true,
      ignore: ['**/node_modules/**', ...excludes],
    });
    for (const match of matches) files.add(path.resolve(match));
  }
  return [...files].sort();
}

/** Globs use forward slashes, also on Windows. */
const toGlobPath = (p: string) => p.split(path.sep).join('/');

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

  const checked = await Effect.runPromise(
    checkFiles(files, { selectorNotInLayout: options.selectorNotInLayout })
  );
  const results = options.lint ? await withLint(checked) : checked;
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

/**
 * Add the Eligius lint findings of every program without errors (libraries
 * are linted through the programs that import them). A finding in an
 * imported library goes to that library's result, which is added when the
 * library was not checked itself.
 */
async function withLint(results: readonly CheckFileResult[]): Promise<CheckFileResult[]> {
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
      for (const diagnostic of await lintFile(result.file)) add(diagnostic);
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
      ? { ...result, diagnostics: [...result.diagnostics, ...added].sort(byLine) }
      : result;
  });
  const unchecked = [...extra.entries()]
    .filter(([file]) => !results.some(r => r.file === file))
    .map(([file, diagnostics]) => ({ file, diagnostics: [...diagnostics].sort(byLine) }));
  return [...merged, ...unchecked];
}
