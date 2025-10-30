/**
 * JSDoc Extractor - Extract JSDoc from Langium AST Nodes
 *
 * Uses Langium's CommentProvider to extract and parse JSDoc comments.
 * This is the compiler-side logic following the Validation Pattern (Constitution X).
 */

import type { AstNode, CommentProvider } from 'langium';
import { type JSDocComment, parseJSDoc } from './jsdoc-parser.js';

/**
 * Extract JSDoc from an action definition using CommentProvider
 *
 * @param actionDef Action definition AST node
 * @param commentProvider Langium's CommentProvider service
 * @returns Parsed JSDoc structure, or null if no documentation
 *
 * This function:
 * - Uses CommentProvider.getComment() to extract raw comment text
 * - Delegates parsing to the pure parseJSDoc function
 * - Returns null if no comment or parsing fails
 * - Does NOT validate param names (that's the validator's job)
 */
export function extractJSDoc(
  actionDef: AstNode,
  commentProvider: CommentProvider
): JSDocComment | null {
  // Use CommentProvider to get the comment text
  const commentText = commentProvider.getComment(actionDef);

  // No comment = no documentation
  if (!commentText) {
    return null;
  }

  // Empty comment = no documentation
  if (commentText.trim().length === 0) {
    return null;
  }

  // Delegate to parser (pure function from language package)
  // parseJSDoc filters out non-JSDoc comments (/** vs /*)
  return parseJSDoc(commentText);
}
