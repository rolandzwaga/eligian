/**
 * Regression tests: non-error Langium diagnostics (warning / info / hint) must
 * NOT abort compilation (audit 2026-10-22, High: "Any warning, info or hint
 * diagnostic aborts compilation as a ValidationError").
 *
 * - extractDocumentErrors only fails on Error-severity diagnostics, and fails on
 *   the first *error* even when a warning precedes it in the diagnostics array.
 * - extractDocumentWarnings exposes the non-error diagnostics so callers (CLI)
 *   can print them without failing the build.
 */

import { Cause, Effect, Exit, Option } from 'effect';
import type { LangiumDocument } from 'langium';
import { describe, expect, test } from 'vitest';
import { DiagnosticSeverity } from 'vscode-languageserver-protocol';
import {
  type DocumentErrorHints,
  extractDocumentErrors,
  extractDocumentWarnings,
} from '../pipeline/document-errors.js';
import { compile, getProgramWarnings, parseSource } from '../pipeline.js';

const hints: DocumentErrorHints = {
  lexerMessagePrefix: 'Lexer error: ',
  lexerHint: 'lexer',
  parserHint: 'parser',
  diagnosticHint: 'Semantic validation failed',
};

type FakeDiagnostic = {
  message: string;
  severity?: DiagnosticSeverity;
  line?: number;
  character?: number;
};

const fakeDocument = (diagnostics: FakeDiagnostic[]): LangiumDocument =>
  ({
    parseResult: { lexerErrors: [], parserErrors: [], value: {} },
    diagnostics: diagnostics.map(d => ({
      message: d.message,
      severity: d.severity,
      range: {
        start: { line: d.line ?? 0, character: d.character ?? 0 },
        end: { line: d.line ?? 0, character: (d.character ?? 0) + 3 },
      },
    })),
  }) as unknown as LangiumDocument;

const failureOf = <E>(exit: Exit.Exit<unknown, E>): E => {
  if (!Exit.isFailure(exit)) throw new Error('expected failure');
  return Option.getOrThrow(Cause.findErrorOption(exit.cause));
};

/** Valid program whose only diagnostic is the "provider does not use a source" warning. */
const WARNING_ONLY_SOURCE = `styles "./styles.css"
timeline "main" in ".test-container" using raf from "x.mp4" {
  at 0s..5s [
    selectElement("#title")
  ] [
  ]
}`;

describe('extractDocumentErrors severity filtering', () => {
  test('succeeds when the document only has warning / info / hint diagnostics', async () => {
    const doc = fakeDocument([
      { message: 'a warning', severity: DiagnosticSeverity.Warning },
      { message: 'an info', severity: DiagnosticSeverity.Information },
      { message: 'a hint', severity: DiagnosticSeverity.Hint },
    ]);

    const exit = await Effect.runPromiseExit(extractDocumentErrors(doc, hints));

    expect(Exit.isSuccess(exit)).toBe(true);
  });

  test('fails on the first error even when a warning precedes it', async () => {
    const doc = fakeDocument([
      { message: 'a warning', severity: DiagnosticSeverity.Warning, line: 0 },
      { message: 'the real error', severity: DiagnosticSeverity.Error, line: 4, character: 2 },
    ]);

    const error = failureOf(await Effect.runPromiseExit(extractDocumentErrors(doc, hints)));

    expect(error._tag).toBe('ValidationError');
    expect(error.message).toBe('the real error');
    expect(error.location).toEqual({ line: 5, column: 3, length: 3 });
  });

  test('treats a diagnostic without severity as an error (LSP default)', async () => {
    const doc = fakeDocument([{ message: 'no severity' }]);

    const error = failureOf(await Effect.runPromiseExit(extractDocumentErrors(doc, hints)));

    expect(error.message).toBe('no severity');
  });
});

describe('extractDocumentWarnings', () => {
  test('returns non-error diagnostics with severity label and 1-based location', () => {
    const doc = fakeDocument([
      { message: 'w', severity: DiagnosticSeverity.Warning, line: 1, character: 4 },
      { message: 'e', severity: DiagnosticSeverity.Error },
      { message: 'i', severity: DiagnosticSeverity.Information },
      { message: 'h', severity: DiagnosticSeverity.Hint },
      { message: 'default error' },
    ]);

    expect(extractDocumentWarnings(doc)).toEqual([
      { severity: 'warning', message: 'w', location: { line: 2, column: 5, length: 3 } },
      { severity: 'info', message: 'i', location: { line: 1, column: 1, length: 3 } },
      { severity: 'hint', message: 'h', location: { line: 1, column: 1, length: 3 } },
    ]);
  });

  test('returns an empty array for a document without diagnostics', () => {
    expect(extractDocumentWarnings(fakeDocument([]))).toEqual([]);
  });
});

describe('pipeline: warnings do not abort compilation', () => {
  test('parseSource succeeds for a program whose only diagnostic is a warning', async () => {
    const exit = await Effect.runPromiseExit(parseSource(WARNING_ONLY_SOURCE));

    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      const warnings = getProgramWarnings(exit.value);
      expect(warnings).toHaveLength(1);
      expect(warnings[0].severity).toBe('warning');
      expect(warnings[0].message).toContain("Timeline provider 'raf' does not use a source file");
      expect(warnings[0].location.line).toBe(2);
    }
  });

  test('compile produces output for a program whose only diagnostic is a warning', async () => {
    const config = await Effect.runPromise(compile(WARNING_ONLY_SOURCE));

    expect(config.timelines).toHaveLength(1);
  });
});
