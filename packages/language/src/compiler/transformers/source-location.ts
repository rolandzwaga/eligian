/**
 * Source-location helpers for AST transformation.
 *
 * Extracted verbatim from `ast-transformer.ts` as part of the W2 decomposition
 * (CODE_ANALYSIS).
 */
import { Effect } from 'effect';
import type { TransformError } from '../../errors/index.js';
import { isLibrary, type Program } from '../../generated/ast.js';
import type { SourceLocation } from '../types/common.js';

/**
 * File path of the document a node belongs to, but only when that document is
 * an imported library (not the program being compiled).
 *
 * Library actions are transformed alongside the main program, so their errors
 * carry the library's line/column. Without the file those locations were
 * rendered against the main source (wrong snippet, nothing naming the library).
 * Main-program locations keep `file` unset so their formatting is unchanged
 * and error reporters render them against the main source as before.
 */
function getLibraryFile(node: any): string | undefined {
  let root = node;
  while (root?.$container) {
    root = root.$container;
  }
  if (!isLibrary(root)) {
    return undefined;
  }
  const uri = root.$document?.uri;
  if (!uri) {
    return undefined;
  }
  return uri.scheme === 'file' ? uri.fsPath : uri.toString();
}

/**
 * Helper to extract source location from any AST node.
 *
 * `file` is set only for nodes from an imported library document (see
 * {@link getLibraryFile}); for main-program nodes it is `undefined`.
 */
export function getSourceLocation(node: any): SourceLocation {
  const cstNode = node?.$cstNode;
  if (cstNode) {
    return {
      file: getLibraryFile(node),
      line: cstNode.range.start.line + 1, // Langium uses 0-based, we use 1-based
      column: cstNode.range.start.character + 1,
      // LSP ranges carry no offsets; the CST node itself does.
      length: cstNode.length,
    };
  }

  // Fallback if CST node not available
  return {
    file: getLibraryFile(node),
    line: 1,
    column: 1,
    length: 0,
  };
}

/**
 * T024: Helper to get Program from any AST node
 */
export function getProgram(node: any): Effect.Effect<Program, TransformError> {
  let current = node;
  while (current) {
    if (current.$type === 'Program') {
      return Effect.succeed(current as Program);
    }
    current = current.$container;
  }

  return Effect.fail({
    _tag: 'TransformError' as const,
    kind: 'ValidationError' as const,
    message: 'Could not find Program root',
    location: getSourceLocation(node),
  });
}
