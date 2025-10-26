/**
 * CSS Hover Target Detection
 *
 * This module detects when the user hovers over a CSS class or ID name
 * in the Eligian DSL, enabling hover tooltips with CSS definitions.
 */

import type { AstNode } from 'langium';
import { AstUtils } from 'langium';
import type { HoverParams } from 'vscode-languageserver-protocol';
import { isOperationCall, isStringLiteral } from '../generated/ast.js';
import { getOperationCallName } from '../utils/operation-call-utils.js';
import { parseSelector } from './selector-parser.js';

/**
 * Type of CSS identifier being hovered
 */
export type CSSIdentifierType = 'class' | 'id';

/**
 * Hover target information
 */
export interface HoverTarget {
  /** Type of CSS identifier */
  type: CSSIdentifierType;
  /** Name of the class or ID (without . or # prefix) */
  name: string;
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
 * Detect hover target for CSS definitions
 *
 * Returns:
 * - HoverTarget if hovering over a CSS class or ID name
 * - undefined if not hovering over CSS identifier
 *
 * Logic:
 * 1. Find the AST node at hover position
 * 2. Check if inside operation call (className or selector operation)
 * 3. If className operation: return class name
 * 4. If selector operation: parse selector and identify hovered class/ID
 *
 * @param node - AST node at hover position
 * @param params - LSP hover parameters
 * @returns Hover target or undefined
 */
export function detectHoverTarget(node: AstNode, params: HoverParams): HoverTarget | undefined {
  // Check if we're inside an operation call
  const operationCall = AstUtils.getContainerOfType(node, isOperationCall);
  if (!operationCall) {
    return undefined;
  }

  const operationName = getOperationCallName(operationCall);

  // Check if it's a className operation
  if (CLASS_NAME_OPERATIONS.has(operationName)) {
    return detectClassNameHover(node, operationCall);
  }

  // Check if it's a selector operation
  if (SELECTOR_OPERATIONS.has(operationName)) {
    return detectSelectorHover(node, params);
  }

  return undefined;
}

/**
 * Detect hover target in className operation
 *
 * For addClass("button"), hovering over "button" returns { type: 'class', name: 'button' }
 *
 * @param node - AST node at hover position
 * @param operationCall - The operation call containing the node
 * @returns Hover target or undefined
 */
function detectClassNameHover(node: AstNode, _operationCall: any): HoverTarget | undefined {
  // Find the string literal argument
  const stringLiteral = AstUtils.getContainerOfType(node, isStringLiteral);
  if (!stringLiteral || !stringLiteral.value) {
    return undefined;
  }

  // Return the class name (className operations only accept single class)
  return {
    type: 'class',
    name: stringLiteral.value,
  };
}

/**
 * Detect hover target in selector operation
 *
 * For selectElement(".button.primary"), hovering over "button" returns { type: 'class', name: 'button' }
 * For selectElement("#header"), hovering over "header" returns { type: 'id', name: 'header' }
 *
 * Strategy:
 * - Parse selector string to extract all classes and IDs with their positions
 * - Determine which identifier is at the hover position
 *
 * @param node - AST node at hover position
 * @param params - LSP hover parameters
 * @returns Hover target or undefined
 */
function detectSelectorHover(node: AstNode, _params: HoverParams): HoverTarget | undefined {
  // Find the string literal containing the selector
  const stringLiteral = AstUtils.getContainerOfType(node, isStringLiteral);
  if (!stringLiteral || !stringLiteral.value) {
    return undefined;
  }

  const selector = stringLiteral.value;

  // Parse the selector to extract classes and IDs
  const { classes, ids } = parseSelector(selector);

  // Get the hover position within the string
  // NOTE: This is a simplified approach - proper implementation would need
  // to calculate exact character offsets within the string literal
  // For now, we'll return the first class if any classes exist, first ID if any IDs exist

  // If selector contains classes, assume hovering over a class
  if (classes.length > 0) {
    // TODO: Proper implementation should determine which specific class based on cursor position
    // For now, return first class (this is a simplification)
    return {
      type: 'class',
      name: classes[0],
    };
  }

  // If selector contains IDs, assume hovering over an ID
  if (ids.length > 0) {
    return {
      type: 'id',
      name: ids[0],
    };
  }

  return undefined;
}

/**
 * Calculate which CSS identifier is at a specific position within a selector string
 *
 * This is a helper for precise hover target detection in complex selectors.
 * For example, in ".button.primary", we need to know if hovering over "button" or "primary".
 *
 * Algorithm:
 * 1. Parse selector to get all classes/IDs with their string positions
 * 2. Calculate which identifier spans the hover offset
 * 3. Return that identifier
 *
 * NOTE: This is a placeholder for future enhancement. Current implementation
 * returns first identifier of each type, which works for simple cases.
 *
 * @param selector - Selector string (e.g., ".button.primary #header")
 * @param offsetInString - Character offset within the string
 * @returns Hover target or undefined
 */
export function findIdentifierAtOffset(
  selector: string,
  offsetInString: number
): HoverTarget | undefined {
  // TODO: Implement precise offset-based detection
  // For now, this is a stub that will be enhanced in User Story 2 implementation

  // Parse selector
  const { classes, ids } = parseSelector(selector);

  // Simplified: return first class if offset is in first half, first ID if in second half
  // Proper implementation would calculate exact character positions
  const midpoint = selector.length / 2;

  if (classes.length > 0 && offsetInString < midpoint) {
    return {
      type: 'class',
      name: classes[0],
    };
  }

  if (ids.length > 0) {
    return {
      type: 'id',
      name: ids[0],
    };
  }

  return undefined;
}
