/**
 * `eligian fmt <patterns...> [--check | --write]` (audit feature idea #15).
 *
 * Formats .eligian files with the rules of the editor's Format Document.
 * - `--check` (the default): lists the files that are not formatted, with a
 *   diff of the lines that would change; exit code 1 when there are any.
 * - `--write`: rewrites those files.
 * Files with syntax errors are reported and left alone (exit code 2).
 * - `--format github`: each problem is also a GitHub Actions annotation.
 */
import * as fs from 'node:fs/promises';
import { formatSource } from '@eligian/language';
import { expandPatterns } from './check/check-command.js';
import { displayPath, escapeData, escapeProperty } from './check/reporters.js';

export interface FmtOptions {
  readonly write: boolean;
  readonly cwd: string;
  /** Also print GitHub Actions annotations (`--format github`) */
  readonly github?: boolean;
}

export const FMT_FORMATS = ['text', 'github'] as const;

export interface FmtOutcome {
  readonly output: string;
  readonly exitCode: number;
}

/** A minimal line diff (`-` removed, `+` added) with one line of context around changes. */
export function lineDiff(before: string, after: string): string {
  const a = before.split(/\r?\n/);
  const b = after.split(/\r?\n/);
  // Longest common subsequence table (files are small)
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0)
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const lines: Array<{ kind: ' ' | '-' | '+'; text: string; line: number }> = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      lines.push({ kind: ' ', text: a[i], line: i + 1 });
      i++;
      j++;
    } else if (i < a.length && (j === b.length || lcs[i + 1][j] >= lcs[i][j + 1])) {
      // Removed lines first, then the added ones
      lines.push({ kind: '-', text: a[i], line: i + 1 });
      i++;
    } else {
      lines.push({ kind: '+', text: b[j], line: i + 1 });
      j++;
    }
  }
  const changed = (index: number) => lines[index] !== undefined && lines[index].kind !== ' ';
  // Changed lines with one line of context on each side
  const keep = lines.map((_, index) => changed(index) || changed(index - 1) || changed(index + 1));
  const out: string[] = [];
  let skipped = false;
  lines.forEach((entry, index) => {
    if (!keep[index]) {
      skipped = true;
      return;
    }
    if (skipped || out.length === 0) out.push(`@@ line ${entry.line}`);
    skipped = false;
    out.push(`${entry.kind} ${entry.text}`);
  });
  return out.join('\n');
}

/** The first line (1-based) where `before` and `after` differ. */
export function firstDifference(before: string, after: string): number {
  const a = before.split(/\r?\n/);
  const b = after.split(/\r?\n/);
  let line = 0;
  while (line < a.length && line < b.length && a[line] === b[line]) line++;
  return line + 1;
}

const annotation = (file: string, line: number, title: string, message: string) =>
  `::error file=${escapeProperty(file)},line=${line},title=${escapeProperty(title)}::${escapeData(message)}`;

export interface FmtFileResult {
  /** The file, as given (absolute when it comes from `expandPatterns`) */
  readonly file: string;
  /** Formatted already (check mode) or now (after a write) */
  readonly formatted: boolean;
  /** Set when this call rewrote the file */
  readonly written?: boolean;
  /** Check mode, unformatted: `lineDiff(source, formatted)` */
  readonly lineDiff?: string;
  /** Check mode, unformatted: the first line that differs (for the GitHub annotation) */
  readonly firstDifference?: number;
  /** The first syntax error; the file is left untouched */
  readonly error?: string;
}

/**
 * Checks each file, or formats it with `write`. Files with syntax errors are
 * reported and never written. A failed write rejects with Node's fs error
 * (it carries `code` and `path`).
 */
export async function fmtFiles(
  files: readonly string[],
  options: { readonly write: boolean }
): Promise<FmtFileResult[]> {
  const results: FmtFileResult[] = [];
  for (const file of files) {
    const source = await fs.readFile(file, 'utf-8');
    const result = await formatSource(source);
    if (result.errors.length > 0) {
      results.push({ file, formatted: false, error: result.errors[0] });
    } else if (!result.changed) {
      results.push({ file, formatted: true });
    } else if (options.write) {
      await fs.writeFile(file, result.text, 'utf-8');
      results.push({ file, formatted: true, written: true });
    } else {
      results.push({
        file,
        formatted: false,
        lineDiff: lineDiff(source, result.text),
        firstDifference: firstDifference(source, result.text),
      });
    }
  }
  return results;
}

export async function runFmt(
  patterns: readonly string[],
  options: FmtOptions
): Promise<FmtOutcome> {
  const files = await expandPatterns(patterns, options.cwd);
  if (files.length === 0) {
    return { output: `No .eligian files match ${patterns.join(' ')}`, exitCode: 2 };
  }
  const out: string[] = [];
  let unformatted = 0;
  let failed = 0;
  for (const result of await fmtFiles(files, { write: options.write })) {
    const name = displayPath(result.file, options.cwd);
    if (result.error !== undefined) {
      failed++;
      if (options.github) {
        out.push(annotation(name, 1, 'Syntax error', `Not formatted: ${result.error}`));
      }
      out.push(`${name}: not formatted, it has syntax errors (${result.error})`);
      continue;
    }
    if (result.formatted && !result.written) continue;
    unformatted++;
    if (result.written) {
      out.push(`Formatted ${name}`);
    } else {
      if (options.github) {
        out.push(
          annotation(
            name,
            result.firstDifference ?? 1,
            'Not formatted',
            `Run 'eligian fmt --write ${name}'`
          )
        );
      }
      out.push(name, result.lineDiff ?? '', '');
    }
  }

  const count = (n: number) => `${n} file${n === 1 ? '' : 's'}`;
  if (failed > 0) {
    out.push(`${count(failed)} could not be formatted (syntax errors)`);
  }
  if (failed === files.length) {
    // nothing else to say
  } else if (options.write) {
    out.push(
      unformatted === 0 ? 'All files were formatted already' : `${count(unformatted)} formatted`
    );
  } else {
    out.push(
      unformatted === 0
        ? `All ${count(files.length - failed)} formatted`
        : `${count(unformatted)} would be reformatted (run 'eligian fmt --write')`
    );
  }
  const exitCode = failed > 0 ? 2 : !options.write && unformatted > 0 ? 1 : 0;
  return { output: out.join('\n'), exitCode };
}
