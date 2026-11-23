/**
 * The file helpers of `eligian check`, kept apart from the check command so that a module that
 * only needs to find `.eligian` files does not load the compiler (spec 059 Phase 2, FR-002).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { glob } from 'tinyglobby';

/** Whether a source is a library file (`library name` after any comments). */
export function isLibrary(source: string): boolean {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  return /^\s*library\b/.test(code);
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
export const toGlobPath = (p: string) => p.split(path.sep).join('/');
