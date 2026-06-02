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
import { CLASS_NAME_OPERATIONS, SELECTOR_OPERATIONS } from './css-operations.js';
import { parseSelectorIdentifiers } from './selector-parser.js';

/**
 * Type of CSS identifier being hovered
 */
type CSSIdentifierType = 'class' | 'id';

/**
 * Hover target information
 */
interface HoverTarget {
  /** Type of CSS identifier */
  type: CSSIdentifierType;
  /** Name of the class or ID (without . or # prefix) */
  name: string;
}

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
    return detectClassNameHover(node);
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
 * @returns Hover target or undefined
 */
function detectClassNameHover(node: AstNode): HoverTarget | undefined {
  // Find the string literal argument
  const stringLiteral = AstUtils.getContainerOfType(node, isStringLiteral);
  if (!stringLiteral?.value) {
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
function detectSelectorHover(node: AstNode, params: HoverParams): HoverTarget | undefined {
  // Find the string literal containing the selector
  const stringLiteral = AstUtils.getContainerOfType(node, isStringLiteral);
  if (!stringLiteral?.value) {
    return undefined;
  }

  const selector = stringLiteral.value;
  const identifiers = parseSelectorIdentifiers(selector);
  if (identifiers.length === 0) {
    return undefined;
  }

  // Translate the cursor's document position into an offset relative to the start
  // of the selector string value (skipping the opening quote). When this succeeds
  // we can resolve the exact identifier under the cursor in compound selectors.
  const cstNode = stringLiteral.$cstNode;
  const textDocument = AstUtils.getDocument(node)?.textDocument;
  if (cstNode && textDocument) {
    const cursorOffset = textDocument.offsetAt(params.position);
    const offsetInString = cursorOffset - (cstNode.offset + 1); // +1 skips opening quote
    const hovered = findIdentifierAtOffset(selector, offsetInString);
    if (hovered) {
      return hovered;
    }
  }

  // Fallback: position unavailable — return the first identifier so hover still works.
  const first = identifiers[0];
  return { type: first.type, name: first.name };
}

/**
 * Calculate which CSS identifier is at a specific position within a selector string
 *
 * This is a helper for precise hover target detection in complex selectors.
 * For example, in ".button.primary", we need to know if hovering over "button" or "primary".
 *
 * Algorithm:
 * 1. Parse selector to get all classes/IDs with their string positions
 * 2. Return the identifier whose source span contains the hover offset
 *
 * @param selector - Selector string (e.g., ".button.primary #header")
 * @param offsetInString - Character offset within the string
 * @returns Hover target or undefined if the offset is not over an identifier
 */
export function findIdentifierAtOffset(
  selector: string,
  offsetInString: number
): HoverTarget | undefined {
  const identifiers = parseSelectorIdentifiers(selector);

  const hovered = identifiers.find(id => offsetInString >= id.start && offsetInString < id.end);

  return hovered ? { type: hovered.type, name: hovered.name } : undefined;
}
