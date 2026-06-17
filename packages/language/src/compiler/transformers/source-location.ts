/**
 * Source-location helpers for AST transformation.
 *
 * Extracted verbatim from `ast-transformer.ts` as part of the W2 decomposition
 * (CODE_ANALYSIS).
 */
import { Effect } from 'effect';
import type { TransformError } from '../../errors/index.js';
import type { Program } from '../../generated/ast.js';
import type { SourceLocation } from '../types/common.js';

/**
 * Helper to extract source location from any AST node
 */
export function getSourceLocation(node: any): SourceLocation {
  const cstNode = node.$cstNode;
  if (cstNode) {
    return {
      file: undefined,
      line: cstNode.range.start.line + 1, // Langium uses 0-based, we use 1-based
      column: cstNode.range.start.character + 1,
      length: cstNode.range.end.offset - cstNode.range.start.offset,
    };
  }

  // Fallback if CST node not available
  return {
    file: undefined,
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
