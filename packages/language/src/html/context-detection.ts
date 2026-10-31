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

import { type AstNode, AstUtils, CstUtils, GrammarUtils } from 'langium';
import type { CompletionContext } from 'langium/lsp';
import {
  isObjectLiteral,
  isObjectProperty,
  isOperationCall,
  type ObjectProperty,
} from '../generated/ast.js';
import { getOperationCallName } from '../utils/operation-call-utils.js';
import { type HTMLCompletionContext, HTMLCompletionContextType } from './context-types.js';

/** Leaves after which whitespace may still be a createElement completion position. */
const WHITESPACE_CONTEXT_LEAVES = new Set(['(', '{', ',']);

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

  let leafNode = CstUtils.findLeafNodeAtOffset(cstNode, offset);
  if (!leafNode) {
    // Whitespace is hidden, so it is a gap between leaves and no leaf matches.
    // Typical typing states are `{ | }`, `{ type: "text", | }` and a newline
    // inside the braces: use the closest leaf before the cursor, but only when
    // it is an opening delimiter or separator (`(`, `{`, `,`) so that e.g.
    // whitespace after a property value or colon is not misread as a new key.
    const before = CstUtils.findLeafNodeBeforeOffset(cstNode, offset);
    if (before && WHITESPACE_CONTEXT_LEAVES.has(before.text)) {
      leafNode = before;
    }
  }
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
      const bounds = extractStringBoundaries(text, argStart, argEnd);

      // A string argument only counts when the cursor is between its quotes
      // (`$cstNode.end` is exclusive and the quotes themselves are outside the
      // content). A non-string argument keeps the inclusive range so a cursor
      // directly after an identifier being typed still matches.
      const inside = bounds
        ? offset >= bounds.contentStart && offset <= bounds.contentEnd
        : offset >= argStart && offset <= argEnd;

      if (inside) {
        return {
          type: HTMLCompletionContextType.ElementName,
          partialText: bounds ? extractPartialText(text, offset, bounds) : '',
          stringContentStart: bounds?.contentStart,
          stringContentEnd: bounds?.contentEnd,
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

      // Strictly between the braces: `end` is exclusive, so `{}|` is outside.
      // An unterminated object (`{|` or `{ a: "x",|` while typing) has no `}`: parser
      // recovery ends its CST at the last real token, so the end offset itself is inside.
      const isClosed = GrammarUtils.findNodeForKeyword(thirdArg.$cstNode, '}') !== undefined;
      if (offset > objStart && (isClosed ? offset < objEnd : offset <= objEnd)) {
        // Extract element name from first argument
        const elementName = extractElementName(args[0], text);

        // Check if cursor is inside a property of this object
        const objectProperty = findPropertyOf(astNode, thirdArg);
        if (objectProperty) {
          // String key (`{ "aria-label": ... }`, `{ "data-x": ... }`): complete inside the quotes
          const keyNode = GrammarUtils.findNodeForProperty(objectProperty.$cstNode, 'key');
          if (keyNode) {
            const keyBounds = extractStringBoundaries(text, keyNode.offset, keyNode.end);
            if (keyBounds) {
              if (offset >= keyBounds.contentStart && offset <= keyBounds.contentEnd) {
                return {
                  type: HTMLCompletionContextType.AttributeName,
                  elementName,
                  partialText: extractPartialText(text, offset, keyBounds),
                  stringContentStart: keyBounds.contentStart,
                  stringContentEnd: keyBounds.contentEnd,
                };
              }
            } else if (offset >= keyNode.offset && offset <= keyNode.end) {
              // Identifier key being typed
              return { type: HTMLCompletionContextType.AttributeName, elementName };
            }
          }

          const valueNode = objectProperty.value?.$cstNode;
          if (valueNode) {
            const valueStart = valueNode.offset;
            const valueEnd = valueNode.end;
            const valueBounds = extractStringBoundaries(text, valueStart, valueEnd);
            const inValue = valueBounds
              ? offset >= valueBounds.contentStart && offset <= valueBounds.contentEnd
              : offset >= valueStart && offset <= valueEnd;

            if (inValue) {
              return {
                type: HTMLCompletionContextType.AttributeValue,
                elementName,
                attributeName: objectProperty.key,
                partialText: valueBounds ? extractPartialText(text, offset, valueBounds) : '',
                stringContentStart: valueBounds?.contentStart,
                stringContentEnd: valueBounds?.contentEnd,
              };
            }
          }

          // On a property but neither in its key nor in its value (colon, outside the
          // value's quotes): no HTML completion applies.
          return { type: HTMLCompletionContextType.None };
        }

        // Inside the braces but not in a property: AttributeName context
        return {
          type: HTMLCompletionContextType.AttributeName,
          elementName,
        };
      }
    }
  }

  // Cursor between the parens of a call that has no arguments yet
  if (args.length === 0) {
    const textBeforeCursor = text.substring(0, offset);
    if (/createElement\s*\(\s*$/.test(textBeforeCursor)) {
      return {
        type: HTMLCompletionContextType.ElementName,
        partialText: '',
      };
    }
  }

  return { type: HTMLCompletionContextType.None };
}

/**
 * Find the property of `object` that contains `node` (a nested object literal's own
 * properties resolve to the outer property that holds it).
 */
function findPropertyOf(node: AstNode, object: AstNode): ObjectProperty | undefined {
  let current: AstNode | undefined = node;
  while (current && current.$container !== object) {
    current = current.$container;
  }
  return current && isObjectProperty(current) ? current : undefined;
}

/**
 * Extract element name from the first argument of createElement
 *
 * @param arg - First argument AST node
 * @param text - Full document text
 * @returns Element name string or undefined
 */
function extractElementName(arg: AstNode | undefined, text: string): string | undefined {
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

/** Offsets of the characters between a string literal's quotes. */
interface StringBounds {
  contentStart: number;
  contentEnd: number;
}

/**
 * Extract string content boundaries (after opening quote, before closing quote).
 *
 * Only a node whose text is a quoted string qualifies; anything else (an identifier,
 * a number, an expression) yields undefined.
 *
 * @param text - Full document text
 * @param nodeStart - Node start offset
 * @param nodeEnd - Node end offset (exclusive)
 */
function extractStringBoundaries(
  text: string,
  nodeStart: number,
  nodeEnd: number
): StringBounds | undefined {
  const quote = text[nodeStart];
  if (quote !== '"' && quote !== "'") {
    return undefined;
  }
  // Closing quote is the last character; an unterminated string extends to the end.
  const closed = nodeEnd - nodeStart >= 2 && text[nodeEnd - 1] === quote;
  return {
    contentStart: nodeStart + 1,
    contentEnd: closed ? nodeEnd - 1 : nodeEnd,
  };
}

/**
 * Extract partial text typed by the user: the string content before the cursor.
 * The cursor is clamped into the content so it never reads outside the quotes.
 */
function extractPartialText(text: string, offset: number, bounds: StringBounds): string {
  const end = Math.min(Math.max(offset, bounds.contentStart), bounds.contentEnd);
  return text.substring(bounds.contentStart, end);
}
