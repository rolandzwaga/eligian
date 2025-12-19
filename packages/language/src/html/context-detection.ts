/**
 * HTML Context Detection for createElement Completion
 *
 * This module detects when the cursor is in a position where HTML element,
 * attribute, or attribute value completions should be shown in createElement calls.
 *
 * createElement signature: createElement(elementName, text?, attributes?)
 * - elementName (arg 0): Required - HTML element tag name
 * - text (arg 1): Optional - Text content for the element
 * - attributes (arg 2): Optional - Object with HTML attributes
 *
 * Context Types:
 * - ElementName: Inside first parameter string - createElement("|")
 * - AttributeName: Inside third parameter object - createElement("div", "", { | })
 * - AttributeValue: Inside property value string - createElement("div", "", { type: "|" })
 * - None: Not in a createElement context
 */

import { AstUtils, CstUtils } from 'langium';
import type { CompletionContext } from 'langium/lsp';
import { isObjectLiteral, isObjectProperty, isOperationCall } from '../generated/ast.js';
import { getOperationCallName } from '../utils/operation-call-utils.js';
import { type HTMLCompletionContext, HTMLCompletionContextType } from './context-types.js';

/**
 * Detect if cursor is in an HTML completion context for createElement
 *
 * @param context - Langium completion context
 * @returns HTMLCompletionContext with type and relevant extracted data
 */
export function detectHTMLCompletionContext(context: CompletionContext): HTMLCompletionContext {
  const document = context.document;
  const offset = context.offset;

  // Find the AST node at cursor position
  const cstNode = document.parseResult.value.$cstNode;
  if (!cstNode) {
    return { type: HTMLCompletionContextType.None };
  }

  const leafNode = CstUtils.findLeafNodeAtOffset(cstNode, offset);
  if (!leafNode?.astNode) {
    return { type: HTMLCompletionContextType.None };
  }

  const astNode = leafNode.astNode;

  // Check if we're inside an operation call
  const operationCall = AstUtils.getContainerOfType(astNode, isOperationCall);
  if (!operationCall) {
    return { type: HTMLCompletionContextType.None };
  }

  // Check if this is a createElement operation
  const operationName = getOperationCallName(operationCall);
  if (operationName !== 'createElement') {
    return { type: HTMLCompletionContextType.None };
  }

  const text = context.document.textDocument.getText();
  const args = operationCall.args;

  // Check if cursor is in the first argument (element name)
  if (args.length >= 1) {
    const firstArg = args[0];
    if (firstArg.$cstNode) {
      const argStart = firstArg.$cstNode.offset;
      const argEnd = firstArg.$cstNode.end;

      if (offset >= argStart && offset <= argEnd) {
        // Inside first argument - ElementName context
        const partialText = extractPartialText(text, offset, argStart, argEnd);
        const stringBounds = extractStringBoundaries(text, argStart, argEnd);
        return {
          type: HTMLCompletionContextType.ElementName,
          partialText,
          stringContentStart: stringBounds?.contentStart,
          stringContentEnd: stringBounds?.contentEnd,
        };
      }
    }
  }

  // Check if cursor is in the third argument (attributes object)
  // createElement signature: createElement(elementName, text?, attributes?)
  if (args.length >= 3) {
    const thirdArg = args[2];

    if (isObjectLiteral(thirdArg) && thirdArg.$cstNode) {
      const objStart = thirdArg.$cstNode.offset;
      const objEnd = thirdArg.$cstNode.end;

      if (offset >= objStart && offset <= objEnd) {
        // Extract element name from first argument
        const elementName = extractElementName(args[0], text);

        // Check if cursor is inside a property value
        const objectProperty = AstUtils.getContainerOfType(astNode, isObjectProperty);
        if (objectProperty?.value?.$cstNode) {
          const valueStart = objectProperty.value.$cstNode.offset;
          const valueEnd = objectProperty.value.$cstNode.end;

          if (offset >= valueStart && offset <= valueEnd) {
            // Inside property value - AttributeValue context
            const attributeName = objectProperty.key;
            const partialText = extractPartialText(text, offset, valueStart, valueEnd);
            const stringBounds = extractStringBoundaries(text, valueStart, valueEnd);
            return {
              type: HTMLCompletionContextType.AttributeValue,
              elementName,
              attributeName,
              partialText,
              stringContentStart: stringBounds?.contentStart,
              stringContentEnd: stringBounds?.contentEnd,
            };
          }
        }

        // Inside object but not in a value - AttributeName context
        return {
          type: HTMLCompletionContextType.AttributeName,
          elementName,
        };
      }
    }
  }

  // Check if cursor is between parens but no arguments yet
  const textBeforeCursor = text.substring(0, offset);
  const callMatch = textBeforeCursor.match(/createElement\s*\(\s*$/);
  if (callMatch) {
    return {
      type: HTMLCompletionContextType.ElementName,
      partialText: '',
    };
  }

  return { type: HTMLCompletionContextType.None };
}

/**
 * Extract element name from the first argument of createElement
 *
 * @param arg - First argument AST node
 * @param text - Full document text
 * @returns Element name string or undefined
 */
function extractElementName(arg: any, text: string): string | undefined {
  if (!arg?.$cstNode) {
    return undefined;
  }

  const argText = text.substring(arg.$cstNode.offset, arg.$cstNode.end);

  // Remove quotes from string literal
  const match = argText.match(/^["'](.*)["']$/);
  if (match) {
    return match[1];
  }

  return undefined;
}

/**
 * Extract string content boundaries (after opening quote, before closing quote)
 *
 * @param text - Full document text
 * @param argStart - Argument start offset
 * @param argEnd - Argument end offset
 * @returns Object with contentStart and contentEnd, or undefined if not a string
 */
function extractStringBoundaries(
  text: string,
  argStart: number,
  argEnd: number
): { contentStart: number; contentEnd: number } | undefined {
  const argText = text.substring(argStart, argEnd);

  // Find opening quote
  let quoteChar = '"';
  let openQuoteIndex = argText.indexOf('"');
  if (openQuoteIndex === -1) {
    openQuoteIndex = argText.indexOf("'");
    quoteChar = "'";
  }
  if (openQuoteIndex === -1) {
    return undefined;
  }

  // Find closing quote
  let closeQuoteIndex = argText.indexOf(quoteChar, openQuoteIndex + 1);
  if (closeQuoteIndex === -1) {
    // No closing quote - content extends to end
    closeQuoteIndex = argText.length;
  }

  return {
    contentStart: argStart + openQuoteIndex + 1, // After opening quote
    contentEnd: argStart + closeQuoteIndex, // Before closing quote
  };
}

/**
 * Extract partial text typed by user (text before cursor within quotes)
 *
 * @param text - Full document text
 * @param offset - Cursor offset
 * @param argStart - Argument start offset
 * @param argEnd - Argument end offset
 * @returns Partial text string
 */
function extractPartialText(
  text: string,
  offset: number,
  argStart: number,
  argEnd: number
): string {
  const argText = text.substring(argStart, argEnd);

  // Find the opening quote
  const openQuoteIndex = argText.indexOf('"');
  if (openQuoteIndex === -1) {
    // Try single quote
    const singleQuoteIndex = argText.indexOf("'");
    if (singleQuoteIndex === -1) {
      return '';
    }
    // Calculate relative position within the string
    const relativeOffset = offset - argStart - singleQuoteIndex - 1;
    const closeQuoteIndex = argText.indexOf("'", singleQuoteIndex + 1);
    if (closeQuoteIndex === -1) {
      return argText.substring(singleQuoteIndex + 1);
    }
    return argText.substring(singleQuoteIndex + 1, singleQuoteIndex + 1 + relativeOffset);
  }

  // Calculate relative position within the string
  const relativeOffset = offset - argStart - openQuoteIndex - 1;
  const closeQuoteIndex = argText.indexOf('"', openQuoteIndex + 1);
  if (closeQuoteIndex === -1) {
    return argText.substring(openQuoteIndex + 1);
  }

  // Return text from opening quote to cursor position
  const endPos = Math.min(openQuoteIndex + 1 + relativeOffset, closeQuoteIndex);
  return argText.substring(openQuoteIndex + 1, endPos);
}
