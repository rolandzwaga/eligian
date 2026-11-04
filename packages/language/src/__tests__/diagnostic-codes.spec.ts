/**
 * Coded diagnostics (spec 058, Phase 0: FR-003, FR-004, FR-004a, FR-005, FR-006, FR-008, FR-009;
 * SC-001, SC-017).
 *
 * Every diagnostic `checkFiles` reports carries a code from the diagnostic code registry. Set (c)
 * is `__fixtures__/diagnostic-codes/`: one fixture per validator site, Typir rule file, parser and
 * linker case, each yielding its exact code.
 *
 * `checkFiles` shares one Langium workspace (check.ts: the selectorNotInLayout setting, the added
 * and released documents), so every call is awaited before the next: never concurrently.
 */

import { readdirSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import type { CheckDiagnostic, CheckFileResult } from '../compiler/pipeline/check.js';
import { checkFiles } from '../compiler/pipeline.js';
import { DIAGNOSTIC_CODES, type DiagnosticSource, isDiagnosticCode } from '../validators/codes.js';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '../../../..');
const fixturesDir = path.join(testDir, '__fixtures__', 'diagnostic-codes');

/** Corpus timeout: `checkFiles` runs over every fixture and example, one file at a time. */
const CORPUS_TIMEOUT = 300_000;

/** SC-001 set (a) roots, then set (b) (as in baseline/snapshot-diagnostics.ts, T003). */
const CORPUS_ROOTS = [
  'packages/language/src/__tests__/__fixtures__',
  'packages/language/src/compiler/__tests__/__fixtures__',
  'packages/cli/src/__tests__/__fixtures__',
  'examples',
];

/** Fixture directories of other Phase 0 tasks, outside the T003 file list. */
const EXCLUDED_DIRS = new Set(['check-codes', 'runtime-claims']);

/** Never part of the sets (installed packages, build output). */
const SKIPPED_DIRS = new Set(['node_modules', 'dist']);

function collectEligianFiles(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name) || SKIPPED_DIRS.has(entry.name)) continue;
      collectEligianFiles(full, out);
    } else if (entry.isFile() && entry.name.endsWith('.eligian')) {
      out.push(path.resolve(full));
    }
  }
}

/** Sets (a)+(b) (the T003 file list) plus set (c), sorted. */
function corpusFiles(): string[] {
  const files: string[] = [];
  for (const root of CORPUS_ROOTS) collectEligianFiles(path.join(repoRoot, root), files);
  return files.sort();
}

/** Set (c): the fixtures of this spec. */
function setCFiles(): string[] {
  return readdirSync(fixturesDir)
    .filter(name => name.endsWith('.eligian'))
    .map(name => path.resolve(fixturesDir, name))
    .sort();
}

/** `checkFiles` over each file in turn, awaiting each call before the next. */
async function checkSequentially(files: readonly string[]): Promise<CheckFileResult[]> {
  const results: CheckFileResult[] = [];
  for (const file of files) {
    results.push(...(await Effect.runPromise(checkFiles([file]))));
  }
  return results;
}

const fixtureCache = new Map<string, readonly CheckDiagnostic[]>();

/** The diagnostics of one set-(c) fixture (checked once, then cached). */
async function fixtureDiagnostics(fixture: string): Promise<readonly CheckDiagnostic[]> {
  const file = path.resolve(fixturesDir, fixture);
  const cached = fixtureCache.get(file);
  if (cached) return cached;
  const [result] = await Effect.runPromise(checkFiles([file]));
  expect(path.resolve(result.file)).toBe(file);
  fixtureCache.set(file, result.diagnostics);
  return result.diagnostics;
}

const describeDiagnostic = (d: CheckDiagnostic): string =>
  `${path.relative(repoRoot, d.file).split(path.sep).join('/')}:${d.line}:${d.column} ` +
  `[${d.code ?? 'no code'}] ${d.message.split('\n')[0]}`;

/** `[fixture, code, source]`: the fixture yields a diagnostic with exactly `code`. */
const CASES: readonly (readonly [string, string, DiagnosticSource])[] = [
  // The FR-003 validator sites
  ['timeline-provider-invalid.eligian', 'timeline-provider-invalid', 'validator'], // timeline-validator.ts:64
  ['timeline-source-required.eligian', 'timeline-source-required', 'validator'], // :84
  ['timeline-scroll-duration-required.eligian', 'timeline-scroll-duration-required', 'validator'], // :117
  [
    'timeline-scroll-selector-not-scroll.eligian',
    'timeline-scroll-selector-not-scroll',
    'validator',
  ], // :120
  ['timeline-duration-relative.eligian', 'timeline-duration-relative', 'validator'], // :129
  ['timeline-duration-not-positive.eligian', 'timeline-duration-not-positive', 'validator'], // :135
  ['event-ends-after-timeline.eligian', 'event-ends-after-timeline', 'validator'], // :146
  ['break-outside-loop.eligian', 'break-outside-loop', 'validator'], // action-validator.ts:355
  ['continue-outside-loop.eligian', 'continue-outside-loop', 'validator'], // :369
  ['operation-in-timeline-event.eligian', 'operation-in-timeline-event', 'validator'], // operation-existence-validator.ts:80
  ['unknown-action-in-timeline-event.eligian', 'unknown-action-in-timeline-event', 'validator'], // :92
  ['css-import-error.eligian', 'css-import-error', 'validator'], // asset-import-validator.ts:126 (CssImportError)
  ['locales-without-languages.eligian', 'locales-without-languages', 'validator'], // :255
  ['locales-parse-failed.eligian', 'locales-parse-failed', 'validator'], // :319
  ['timeline-required.eligian', 'timeline-required', 'validator'], // structure-validator.ts:20
  // The data-variable sites, with their existing codes
  ['label-id-without-locales.eligian', 'no_labels_import', 'validator'], // label-parameter-validator.ts:206
  ['set-data-target.eligian', 'invalid_setdata_target', 'validator'], // set-data-validator.ts:52
  // One per Eligian Typir rule file
  ['constant-cycle.eligian', 'constant-cycle', 'type'], // constant-validation.ts
  ['if-condition-not-boolean.eligian', 'if-condition-not-boolean', 'type'], // control-flow-validation.ts
  ['event-start-negative.eligian', 'event-start-negative', 'type'], // event-validation.ts
  ['import-duplicate-default.eligian', 'import-duplicate-default', 'type'], // import-validation.ts
  ['languages-missing-default.eligian', 'languages-missing-default', 'type'], // languages-validation.ts
  ['timeline-empty.eligian', 'timeline-empty', 'type'], // timeline-validation.ts
  // Typir core, linker, lexer, parser
  ['type-mismatch.eligian', 'type-mismatch', 'type'],
  ['unresolved-reference.eligian', 'unresolved-reference', 'linker'],
  ['lexer-error.eligian', 'syntax-error', 'parser'],
  ['parser-error.eligian', 'syntax-error', 'parser'],
];

describe('every checked diagnostic carries a registry code', () => {
  it(
    'fixture corpora and examples: no uncoded, no unregistered code',
    async () => {
      const files = corpusFiles();
      expect(files).toEqual(expect.arrayContaining(setCFiles()));

      const results = await checkSequentially(files);

      const offenders = results
        .flatMap(result => result.diagnostics)
        .filter(d => d.code === undefined || !isDiagnosticCode(d.code))
        .map(describeDiagnostic);
      expect(offenders).toEqual([]);
    },
    CORPUS_TIMEOUT
  );
});

describe('coded fixtures', () => {
  it.each(CASES)('%s → %s', async (fixture, code, source) => {
    const diagnostics = await fixtureDiagnostics(fixture);

    expect(diagnostics.map(d => d.code)).toContain(code);
    expect(DIAGNOSTIC_CODES.find(e => e.code === code)!.source).toBe(source);
  });

  // Plan R8: an asset error whose path matches no import node is reported on the program. Every
  // asset error carries its import's path (compiler-integration.ts), so no fixture reaches the
  // site: asset-import-validator-codes.spec.ts covers it with a unit test of the validator.

  it('a nonexistent path → file-unreadable', async () => {
    const file = path.resolve(fixturesDir, 'does-not-exist.eligian');

    const [result] = await Effect.runPromise(checkFiles([file]));

    expect(path.resolve(result.file)).toBe(file);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].code).toBe('file-unreadable');
    expect(DIAGNOSTIC_CODES.find(e => e.code === 'file-unreadable')!.source).toBe('compiler');
  });

  it('video without from → exactly one diagnostic', async () => {
    const diagnostics = await fixtureDiagnostics('video-without-from.eligian');

    expect(diagnostics.map(describeDiagnostic)).toHaveLength(1);
    expect(diagnostics[0].code).toBe('timeline-source-required');
  });

  it('raf with from → exactly one warning, timeline-source-unused', async () => {
    const diagnostics = await fixtureDiagnostics('raf-with-from.eligian');

    expect(diagnostics.map(describeDiagnostic)).toHaveLength(1);
    expect(diagnostics[0].severity).toBe('warning');
    expect(diagnostics[0].code).toBe('timeline-source-unused');
  });

  it(
    'no Typir prefix in any set-(c) message',
    async () => {
      for (const file of setCFiles()) {
        for (const d of await fixtureDiagnostics(path.basename(file))) {
          expect(d.message, describeDiagnostic(d)).not.toMatch(/^While validating /);
        }
      }
    },
    CORPUS_TIMEOUT
  );
});
