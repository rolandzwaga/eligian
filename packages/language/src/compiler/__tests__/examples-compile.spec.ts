/**
 * Every shipped example program compiles (audit 2026-10-22, medium #10 follow-up).
 *
 * Parsing alone is not enough: rejecting runtime arithmetic (`"#" + slideId`) left
 * examples/demo.eligian parsing fine but failing to compile. This compiles each
 * program under examples/ from its real path, so its CSS, layout, locales and
 * library imports are loaded from disk like the CLI does.
 *
 * Library files (`library name`) are not programs and are compiled through their
 * importers. Examples that demonstrate errors are listed in EXPECTED_FAILURES.
 */

import { readdirSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Effect } from 'effect';
import { describe, expect, test } from 'vitest';
import { formatError } from '../error-reporter.js';
import { compile } from '../pipeline.js';

const EXAMPLES_DIR = fileURLToPath(new URL('../../../../../examples', import.meta.url));

/** Example programs that exist to demonstrate a compile error (paths relative to examples/). */
const EXPECTED_FAILURES = new Set([
  'libraries/errors/broken-import.eligian',
  'libraries/errors/broken.eligian',
  'libraries/errors/missing-import.eligian',
  'libraries/nested/cycle-test.eligian',
]);

function listEligianFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : listEligianFiles(full);
    return entry.name.endsWith('.eligian') ? [full] : [];
  });
}

/** True for a library file: its first non-comment token is the `library` keyword. */
function isLibraryFile(source: string): boolean {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  return /^\s*library\s/.test(withoutComments);
}

const programs = listEligianFiles(EXAMPLES_DIR)
  .map(file => ({
    file,
    relative: path.relative(EXAMPLES_DIR, file).split(path.sep).join('/'),
    source: readFileSync(file, 'utf-8'),
  }))
  .filter(example => !isLibraryFile(example.source))
  .filter(example => !EXPECTED_FAILURES.has(example.relative));

describe('shipped example programs compile', () => {
  test('finds the main examples', () => {
    expect(programs.map(p => p.relative)).toEqual(
      expect.arrayContaining(['demo.eligian', 'eligian-tour/tour.eligian'])
    );
  });

  test.each(programs.map(p => [p.relative, p] as const))('%s', async (_name, example) => {
    const result = await Effect.runPromise(
      Effect.result(compile(example.source, { sourceUri: example.file }))
    );
    if (result._tag === 'Failure') {
      const formatted = formatError(result.failure, example.source, example.file);
      throw new Error(`${example.relative} failed to compile:\n${formatted.message}`);
    }
    expect(result.success.timelines.length).toBeGreaterThan(0);
  });
});
