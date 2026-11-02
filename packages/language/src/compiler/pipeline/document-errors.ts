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
  /**
   * Path of the document's file, set on every error location. Pass it for an
   * imported library so error reporters print `file:line:col` and do not render
   * the library's line/column against the main program's source. Leave it unset
   * for the program being compiled.
   */
  readonly file?: string;
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

const toSourceLocation = (
  diagnostic: Diagnostic,
  textDocument: LangiumDocument['textDocument'] | undefined
): SourceLocation => {
  const { start, end } = diagnostic.range;
  // Offset-based length works for multi-line ranges; without a text document
  // (synthetic documents) only a single-line range has a computable length.
  const length = textDocument
    ? textDocument.offsetAt(end) - textDocument.offsetAt(start)
    : end.line === start.line
      ? end.character - start.character
      : 0;
  return {
    line: start.line + 1, // Langium is 0-based
    column: start.character + 1,
    length: Math.max(0, length),
  };
};

/** Minimal shape of a Chevrotain token as used for error locations. */
type TokenPosition = {
  readonly startOffset: number;
  readonly endOffset?: number;
  readonly startLine?: number;
  readonly startColumn?: number;
  readonly endLine?: number;
  readonly endColumn?: number;
};

const isFiniteNumber = (value: number | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * 1-based location of the end of the document (used when a parser error has no
 * real token at all, e.g. an unexpected end of input with only hidden tokens).
 */
const endOfDocument = (document: LangiumDocument): SourceLocation => {
  const textDocument = document.textDocument;
  if (!textDocument) {
    return { line: 1, column: 1, length: 0 };
  }
  const position = textDocument.positionAt(textDocument.getText().length);
  return { line: position.line + 1, column: position.character + 1, length: 0 };
};

/**
 * Location of a Chevrotain parser error.
 *
 * For an unexpected end of input, Chevrotain reports a virtual EOF token whose
 * positions are all `NaN` (and `NaN ?? 1` stays `NaN`). Like Langium's
 * DefaultDocumentValidator, point just after the `previousToken` instead, and
 * fall back to the end of the document when that is unusable too.
 */
const parserErrorLocation = (
  error: { readonly token: TokenPosition; readonly previousToken?: TokenPosition },
  document: LangiumDocument
): SourceLocation => {
  const { token } = error;
  if (isFiniteNumber(token.startOffset)) {
    // Chevrotain's endOffset is inclusive.
    const length = isFiniteNumber(token.endOffset) ? token.endOffset - token.startOffset + 1 : 0;
    return {
      line: isFiniteNumber(token.startLine) ? token.startLine : 1,
      column: isFiniteNumber(token.startColumn) ? token.startColumn : 1,
      length: Math.max(0, length),
    };
  }

  const previous = error.previousToken;
  if (
    previous &&
    isFiniteNumber(previous.startOffset) &&
    isFiniteNumber(previous.endLine) &&
    isFiniteNumber(previous.endColumn)
  ) {
    // endColumn is the 1-based column of the token's last character, so the
    // position right after the token is endColumn + 1.
    return { line: previous.endLine, column: previous.endColumn + 1, length: 0 };
  }

  return endOfDocument(document);
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
      location: toSourceLocation(diagnostic, document?.textDocument),
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
    const located = (location: SourceLocation): SourceLocation =>
      hints.file === undefined ? location : { file: hints.file, ...location };

    if (document.parseResult.lexerErrors.length > 0) {
      const error = document.parseResult.lexerErrors[0];
      return yield* Effect.fail({
        _tag: 'ParseError' as const,
        message: `${hints.lexerMessagePrefix}${error.message}`,
        location: located({
          line: isFiniteNumber(error.line) ? error.line : 1,
          column: isFiniteNumber(error.column) ? error.column : 1,
          length: isFiniteNumber(error.length) ? error.length : 0,
        }),
        hint: hints.lexerHint,
      });
    }

    if (document.parseResult.parserErrors.length > 0) {
      const error = document.parseResult.parserErrors[0];
      return yield* Effect.fail({
        _tag: 'ParseError' as const,
        message: error.message,
        location: located(parserErrorLocation(error, document)),
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
        location: located(toSourceLocation(error, document.textDocument)),
        hint: hints.diagnosticHint,
      });
    }
  });
