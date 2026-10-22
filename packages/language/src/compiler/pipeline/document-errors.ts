/**
 * Pipeline: Langium document error extraction
 *
 * Single source of truth for the three near-identical lexer / parser /
 * validation error checks that `parseSource` and `parseLibraryDocument` would
 * otherwise duplicate verbatim (D17). Only the user-facing strings differ
 * (top-level vs. library file context), captured via {@link DocumentErrorHints}.
 *
 * Only Error-severity validation diagnostics are fatal. Warnings, info and hints
 * are exposed separately through {@link extractDocumentWarnings} so callers (the
 * CLI) can report them without failing the build.
 */

import { Effect } from 'effect';
import type { LangiumDocument } from 'langium';
import { type Diagnostic, DiagnosticSeverity } from 'vscode-languageserver-protocol';
import type { ParseError, SourceLocation, ValidationError } from '../../errors/index.js';

/**
 * Per-call message/hint customization for {@link extractDocumentErrors}.
 *
 * The location-computing logic is identical across `parseSource` and
 * `parseLibraryDocument`; only the user-facing strings differ (top-level vs.
 * library file context).
 */
export interface DocumentErrorHints {
  /** Prefix prepended to the lexer error message (e.g. `Lexer error: `). */
  readonly lexerMessagePrefix: string;
  readonly lexerHint: string;
  readonly parserHint: string;
  readonly diagnosticHint: string;
}

/**
 * A non-fatal Langium diagnostic (warning / info / hint) on a built document.
 *
 * These never abort compilation; callers such as the CLI surface them to the
 * user alongside a successful result.
 */
export interface DocumentWarning {
  readonly severity: 'warning' | 'info' | 'hint';
  readonly message: string;
  /** 1-based line / column (Langium ranges are 0-based). */
  readonly location: SourceLocation;
}

/**
 * True for diagnostics that must fail compilation. A diagnostic without a
 * severity is treated as an error (Langium and VS Code both default it to Error).
 */
const isErrorDiagnostic = (diagnostic: Diagnostic): boolean =>
  diagnostic.severity === undefined || diagnostic.severity === DiagnosticSeverity.Error;

const toSourceLocation = (diagnostic: Diagnostic): SourceLocation => {
  const range = diagnostic.range;
  return {
    line: range.start.line + 1, // Langium is 0-based
    column: range.start.character + 1,
    length: range.end.character - range.start.character,
  };
};

const severityLabel = (severity: DiagnosticSeverity | undefined): DocumentWarning['severity'] => {
  switch (severity) {
    case DiagnosticSeverity.Information:
      return 'info';
    case DiagnosticSeverity.Hint:
      return 'hint';
    default:
      return 'warning';
  }
};

/**
 * Collect the non-error (warning / info / hint) diagnostics of a built Langium
 * document, in document order. Error diagnostics are reported (fatally) by
 * {@link extractDocumentErrors} instead.
 */
export const extractDocumentWarnings = (
  document: LangiumDocument | undefined
): ReadonlyArray<DocumentWarning> =>
  (document?.diagnostics ?? [])
    .filter(diagnostic => !isErrorDiagnostic(diagnostic))
    .map(diagnostic => ({
      severity: severityLabel(diagnostic.severity),
      message: diagnostic.message,
      location: toSourceLocation(diagnostic),
    }));

/**
 * Fail with a ParseError for the first lexer / parser problem, or with a
 * ValidationError for the first Error-severity validation diagnostic, on a
 * built Langium document; succeed (void) if there are none. Warning / info /
 * hint diagnostics are ignored here (see {@link extractDocumentWarnings}).
 *
 * Single source of truth for the three near-identical error checks that
 * `parseSource` and `parseLibraryDocument` previously duplicated verbatim (D17).
 */
export const extractDocumentErrors = (
  document: LangiumDocument,
  hints: DocumentErrorHints
): Effect.Effect<void, ParseError | ValidationError> =>
  Effect.gen(function* () {
    if (document.parseResult.lexerErrors.length > 0) {
      const error = document.parseResult.lexerErrors[0];
      return yield* Effect.fail({
        _tag: 'ParseError' as const,
        message: `${hints.lexerMessagePrefix}${error.message}`,
        location: {
          line: error.line ?? 1,
          column: error.column ?? 1,
          length: error.length ?? 0,
        },
        hint: hints.lexerHint,
      });
    }

    if (document.parseResult.parserErrors.length > 0) {
      const error = document.parseResult.parserErrors[0];
      return yield* Effect.fail({
        _tag: 'ParseError' as const,
        message: error.message,
        location: {
          line: error.token.startLine ?? 1,
          column: error.token.startColumn ?? 1,
          length: error.token.endOffset ? error.token.endOffset - error.token.startOffset : 0,
        },
        hint: hints.parserHint,
      });
    }

    // Validation diagnostics are semantic failures, not parse failures: tag them
    // ValidationError so they format as "Validation Error" (not "Parse Error") and
    // receive validation hints rather than parse hints (B3/B4 in cli/KNOWN_ISSUES).
    // Only Error-severity diagnostics are fatal; a warning listed first must
    // neither abort compilation nor mask the real error that follows it.
    const error = document.diagnostics?.find(isErrorDiagnostic);
    if (error) {
      return yield* Effect.fail({
        _tag: 'ValidationError' as const,
        kind: 'SemanticValidation' as const,
        message: error.message,
        location: toSourceLocation(error),
        hint: hints.diagnosticHint,
      });
    }
  });
