/**
 * Pipeline: Langium document error extraction
 *
 * Single source of truth for the three near-identical lexer / parser /
 * validation error checks that `parseSource` and `parseLibraryDocument` would
 * otherwise duplicate verbatim (D17). Only the user-facing strings differ
 * (top-level vs. library file context), captured via {@link DocumentErrorHints}.
 */

import { Effect } from 'effect';
import type { LangiumDocument } from 'langium';
import type { ParseError } from '../../errors/index.js';

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
 * Fail with a ParseError for the first lexer / parser / validation problem on a
 * built Langium document, or succeed (void) if there are none.
 *
 * Single source of truth for the three near-identical error checks that
 * `parseSource` and `parseLibraryDocument` previously duplicated verbatim (D17).
 */
export const extractDocumentErrors = (
  document: LangiumDocument,
  hints: DocumentErrorHints
): Effect.Effect<void, ParseError> =>
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

    if (document.diagnostics && document.diagnostics.length > 0) {
      const error = document.diagnostics[0];
      const range = error.range;
      return yield* Effect.fail({
        _tag: 'ParseError' as const,
        message: error.message,
        location: {
          line: range.start.line + 1, // Langium is 0-based
          column: range.start.character + 1,
          length: range.end.character - range.start.character,
        },
        hint: hints.diagnosticHint,
      });
    }
  });
