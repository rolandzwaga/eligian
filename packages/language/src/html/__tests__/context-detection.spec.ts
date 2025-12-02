/**
 * HTML Context Detection Tests (Feature 043)
 *
 * Tests for detecting cursor context in createElement operations.
 * Used to determine what type of completions to show.
 */

import { beforeAll, describe, expect, test } from 'vitest';
import { createTestContext, type TestContext } from '../../__tests__/test-helpers.js';
import { detectHTMLCompletionContext } from '../context-detection.js';
import { HTMLCompletionContextType } from '../context-types.js';

describe('HTML Context Detection (Feature 043, Phase 2)', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  describe('None context', () => {
    test('should return None when not in createElement call (T006.1)', async () => {
      const code = `
        timeline "Test" at 0s {
          at 0s selectElement("#box")
        }
      `;
      const result = await parseAndDetectContext(ctx, code, 'selectElement');
      expect(result.type).toBe(HTMLCompletionContextType.None);
    });

    test('should return None when in other operation (T006.2)', async () => {
      const code = `
        timeline "Test" at 0s {
          at 0s addClass("button")
        }
      `;
      const result = await parseAndDetectContext(ctx, code, 'addClass');
      expect(result.type).toBe(HTMLCompletionContextType.None);
    });
  });

  describe('ElementName context', () => {
    test('should detect ElementName when cursor in first parameter string (T006.3)', async () => {
      // Cursor is inside the first parameter of createElement
      const code = `
        action test [
          createElement("div")
        ]
        timeline "Test" at 0s {
          at 0s test()
        }
      `;
      const result = await parseAndDetectContext(ctx, code, 'createElement');
      expect(result.type).toBe(HTMLCompletionContextType.ElementName);
    });

    test('should detect ElementName with partial text (T006.4)', async () => {
      const code = `
        action test [
          createElement("bu")
        ]
        timeline "Test" at 0s {
          at 0s test()
        }
      `;
      // Position cursor after "bu" (inside the string)
      const result = await parseAndDetectContextAtOffset(ctx, code, 'createElement("bu');
      expect(result.type).toBe(HTMLCompletionContextType.ElementName);
      expect(result.partialText).toBe('bu');
    });

    test('should detect ElementName with empty string (T006.5)', async () => {
      const code = `
        action test [
          createElement("")
        ]
        timeline "Test" at 0s {
          at 0s test()
        }
      `;
      const result = await parseAndDetectContext(ctx, code, 'createElement');
      expect(result.type).toBe(HTMLCompletionContextType.ElementName);
      expect(result.partialText).toBe('');
    });
  });

  describe('AttributeName context', () => {
    test('should detect AttributeName when cursor in third parameter object (T006.6)', async () => {
      // createElement signature: createElement(elementName, text?, attributes?)
      // Attributes is the THIRD argument
      const code = `
        action test [
          createElement("div", "", { id: "test" })
        ]
        timeline "Test" at 0s {
          at 0s test()
        }
      `;
      const result = await parseAndDetectContextAtOffset(ctx, code, '{ id');
      expect(result.type).toBe(HTMLCompletionContextType.AttributeName);
      expect(result.elementName).toBe('div');
    });

    test('should extract element name for attribute context (T006.7)', async () => {
      // createElement signature: createElement(elementName, text?, attributes?)
      const code = `
        action test [
          createElement("input", "", { type: "text" })
        ]
        timeline "Test" at 0s {
          at 0s test()
        }
      `;
      const result = await parseAndDetectContextAtOffset(ctx, code, '{ type');
      expect(result.type).toBe(HTMLCompletionContextType.AttributeName);
      expect(result.elementName).toBe('input');
    });
  });

  describe('AttributeValue context', () => {
    test('should detect AttributeValue when cursor in property value (T006.8)', async () => {
      // createElement signature: createElement(elementName, text?, attributes?)
      const code = `
        action test [
          createElement("input", "", { type: "text" })
        ]
        timeline "Test" at 0s {
          at 0s test()
        }
      `;
      const result = await parseAndDetectContextAtOffset(ctx, code, 'type: "text');
      expect(result.type).toBe(HTMLCompletionContextType.AttributeValue);
      expect(result.elementName).toBe('input');
      expect(result.attributeName).toBe('type');
    });

    test('should extract attribute name for value context (T006.9)', async () => {
      // createElement signature: createElement(elementName, text?, attributes?)
      const code = `
        action test [
          createElement("a", "", { target: "_blank" })
        ]
        timeline "Test" at 0s {
          at 0s test()
        }
      `;
      const result = await parseAndDetectContextAtOffset(ctx, code, 'target: "_blank');
      expect(result.type).toBe(HTMLCompletionContextType.AttributeValue);
      expect(result.attributeName).toBe('target');
      expect(result.partialText).toBe('_blank');
    });
  });
});

/**
 * Helper to parse code and detect context at createElement operation
 */
async function parseAndDetectContext(
  ctx: TestContext,
  code: string,
  operationName: string
): Promise<ReturnType<typeof detectHTMLCompletionContext>> {
  const document = await ctx.parse(code);

  // Find the operation in the parsed document and create a mock context
  const offset = code.indexOf(operationName) + operationName.length + 2; // After opening paren and quote

  return detectHTMLCompletionContext({
    document,
    offset,
    textDocument: document.textDocument,
    node: document.parseResult.value,
  } as any);
}

/**
 * Helper to parse code and detect context at a specific text position
 */
async function parseAndDetectContextAtOffset(
  ctx: TestContext,
  code: string,
  textToFind: string
): Promise<ReturnType<typeof detectHTMLCompletionContext>> {
  const document = await ctx.parse(code);
  const offset = code.indexOf(textToFind) + textToFind.length;

  return detectHTMLCompletionContext({
    document,
    offset,
    textDocument: document.textDocument,
    node: document.parseResult.value,
  } as any);
}
