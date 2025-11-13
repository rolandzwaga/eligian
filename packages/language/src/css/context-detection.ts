/**
 * CSS Context Detection for Code Completion
 *
 * This module detects when the cursor is in a position where CSS class or ID
 * completions should be shown (className parameters or selector strings).
 *
 * LIMITATION: Due to Langium framework constraints, CSS completions only work when
 * the cursor is BETWEEN parentheses (e.g., addClass(|)), not INSIDE existing string
 * literals (e.g., addClass(""|)). When completions are triggered between parens,
 * the inserted text includes quotes automatically (e.g., "className").
 */

import { AstUtils, CstUtils } from 'langium';
import type { CompletionContext } from 'langium/lsp';
import { isOperationCall } from '../generated/ast.js';
import { getOperationCallName } from '../utils/operation-call-utils.js';
import { isOffsetInStringLiteral } from '../utils/string-utils.js';

/**
 * Types of completion contexts for CSS
 */
export enum CompletionContextType {
  /** No CSS completion context */
  None = 'None',
  /** Cursor inside className parameter (addClass, removeClass, toggleClass) */
  ClassName = 'ClassName',
  /** Cursor after '.' in selector string */
  SelectorClass = 'SelectorClass',
  /** Cursor after '#' in selector string */
  SelectorID = 'SelectorID',
}

/**
 * Operations that accept className parameters
 */
const CLASS_NAME_OPERATIONS = new Set(['addClass', 'removeClass', 'toggleClass', 'hasClass']);

/**
 * Operations that accept selector parameters
 */
const SELECTOR_OPERATIONS = new Set([
  'selectElement',
  'selectElements',
  'querySelector',
  'querySelectorAll',
]);

/**
 * Detect if cursor is in a CSS completion context
 *
 * Returns:
 * - ClassName: If inside className parameter (e.g., addClass("|"))
 * - SelectorClass: If after '.' in selector (e.g., selectElement(".|"))
 * - SelectorID: If after '#' in selector (e.g., selectElement("#|"))
 * - None: Otherwise
 *
 * @param context - Langium completion context
 * @returns Type of CSS completion context
 */
export function detectCompletionContext(context: CompletionContext): CompletionContextType {
  const document = context.document;
  const offset = context.offset;

  // Find the AST node at cursor position
  const astNode = document.parseResult.value.$cstNode
    ? CstUtils.findLeafNodeAtOffset(document.parseResult.value.$cstNode, offset)?.astNode
    : undefined;

  if (!astNode) {
    return CompletionContextType.None;
  }

  // Check if we're inside an operation call
  const operationCall = AstUtils.getContainerOfType(astNode, isOperationCall);
  if (!operationCall) {
    return CompletionContextType.None;
  }

  const operationName = getOperationCallName(operationCall);

  // Check if inside className operation
  if (CLASS_NAME_OPERATIONS.has(operationName)) {
    // Check if cursor is inside a string literal argument
    const inString = isCursorInStringLiteral(context, offset);
    if (inString) {
      return CompletionContextType.ClassName;
    }

    // Also handle case where cursor is between parens but no string yet: addClass(|)
    // In this case, we're inside the operation call's arguments area
    // Check if we're in the first argument position (before any comma)
    const text = context.document.textDocument.getText();
    const textBeforeCursor = text.substring(0, offset);
    const lastOpenParen = textBeforeCursor.lastIndexOf('(');
    const lastCloseParen = textBeforeCursor.lastIndexOf(')');

    // If last paren before cursor is '(' (not ')'), we're inside the argument list
    if (lastOpenParen > lastCloseParen) {
      return CompletionContextType.ClassName;
    }
  }

  // Check if inside selector operation
  if (SELECTOR_OPERATIONS.has(operationName)) {
    // Check if cursor is in string literal and get the prefix character
    const prefixChar = getSelectorPrefixChar(context, offset);
    if (prefixChar === '.') {
      return CompletionContextType.SelectorClass;
    }
    if (prefixChar === '#') {
      return CompletionContextType.SelectorID;
    }
    // If no prefix but inside selector string, return None (could extend to suggest typing . or #)
  }

  return CompletionContextType.None;
}

/**
 * Check if cursor is inside a string literal
 *
 * @param context - Langium completion context
 * @param offset - Cursor offset
 * @returns True if cursor is between quotes
 */
function isCursorInStringLiteral(context: CompletionContext, offset: number): boolean {
  const text = context.document.textDocument.getText();
  return isOffsetInStringLiteral(text, offset);
}

/**
 * Get the selector prefix character before cursor (. or #)
 *
 * Returns:
 * - '.' if cursor is after dot (e.g., ".|" or ".button.|")
 * - '#' if cursor is after hash (e.g., "#|" or "#header.|")
 * - null if no prefix or not in string
 *
 * @param context - Langium completion context
 * @param offset - Cursor offset
 * @returns Prefix character or null
 */
function getSelectorPrefixChar(context: CompletionContext, offset: number): '.' | '#' | null {
  if (!isCursorInStringLiteral(context, offset)) {
    return null;
  }

  const text = context.document.textDocument.getText();

  // Strategy: Look backwards from cursor to find the nearest '.' or '#'
  // Cases to handle:
  // 1. ".|" - cursor right after dot → return '.'
  // 2. ".button|" - cursor after class name → return '.'
  // 3. ".button.|" - cursor after second dot → return '.'
  // 4. "div.button|" - cursor after tag+class → return '.' (we DO complete here)
  // 5. "#id|" - cursor after hash → return '#'

  // Look backwards for the nearest '.' or '#'
  for (let i = offset - 1; i >= 0; i--) {
    const char = text[i];

    // Found a prefix character
    if (char === '.' || char === '#') {
      return char as '.' | '#';
    }

    // If we hit a quote, we've gone outside the current string
    if (char === '"' || char === "'") {
      return null;
    }

    // If we hit whitespace or selector combinators, stop searching
    // This means the current word/token doesn't start with . or #
    if (char === ' ' || char === '>' || char === '+' || char === ',') {
      return null;
    }

    // If we hit alphanumeric or hyphen, keep looking backwards
    // This handles ".button|" and ".button.|" cases
    // (continue is implicit at end of loop)
  }

  return null;
}
