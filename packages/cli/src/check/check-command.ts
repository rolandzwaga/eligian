/**
 * `eligian check <patterns...>`: report every diagnostic of the matched files.
 *
 * Exit codes: 0 when clean (warnings allowed up to --max-warnings),
 * 1 when there are errors or too many warnings, 2 for usage errors
 * (nothing matched, invalid options).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { checkFiles } from '@eligian/language';
import { Effect } from 'effect';
import { glob } from 'tinyglobby';
import { CHECK_FORMATS, type CheckFormat, formatResults, summarize } from './reporters.js';

export interface CheckOptions {
  readonly format: CheckFormat;
  /** Fail when there are more warnings than this. */
  readonly maxWarnings?: number;
  /** Count warnings as errors (same as --max-warnings 0). */
  readonly warningsAsErrors: boolean;
  readonly cwd: string;
  readonly version: string;
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

  const results = await Effect.runPromise(checkFiles(files));
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
