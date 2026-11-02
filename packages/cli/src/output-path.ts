/**
 * Default output-path derivation for the CLI.
 *
 * The source `.eligian` file must never be used as an output target: the
 * previous `inputPath.replace(/\.eligian$/, '.json')` was a no-op for inputs
 * that did not end in a lowercase `.eligian` (e.g. `Foo.ELIGIAN`, `foo.txt`),
 * so the default output path equalled the input path and the source was
 * overwritten.
 */

import * as path from 'node:path';

const ELIGIAN_EXT = /\.eligian$/i;

/**
 * Derive a default output path from the input path by replacing a
 * (case-insensitive) `.eligian` extension with `newExt`, or appending `newExt`
 * when the input has no such extension.
 */
export function deriveDefaultOutputPath(inputPath: string, newExt: string): string {
  return ELIGIAN_EXT.test(inputPath) ? inputPath.replace(ELIGIAN_EXT, newExt) : inputPath + newExt;
}

/**
 * True when `outputPath` refers to the same file as `inputPath`.
 * `-` (stdout) never collides.
 */
export function isSamePath(inputPath: string, outputPath: string): boolean {
  if (outputPath === '-') return false;
  const a = path.resolve(inputPath);
  const b = path.resolve(outputPath);
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}
