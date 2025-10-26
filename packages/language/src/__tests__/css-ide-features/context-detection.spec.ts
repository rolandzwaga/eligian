/**
 * Unit tests for CSS context detection module
 *
 * These tests verify that detectCompletionContext correctly identifies when
 * the cursor is in a position where CSS completions should be shown.
 *
 * Test Coverage:
 * - ClassName context (inside addClass, removeClass, toggleClass parameters)
 * - SelectorClass context (after '.' in selectElement selectors)
 * - SelectorID context (after '#' in selectElement selectors)
 * - None context (outside CSS-related operations)
 */

import { EmptyFileSystem } from 'langium';
import { expandToString as s } from 'langium/generate';
import type { CompletionContext } from 'langium/lsp';
import { parseHelper } from 'langium/test';
import { describe, expect, it } from 'vitest';
import { CompletionContextType, detectCompletionContext } from '../../css/context-detection.js';
import { createEligianServices } from '../../eligian-module.js';
import type { Program } from '../../generated/ast.js';

const services = createEligianServices(EmptyFileSystem);
const parse = parseHelper<Program>(services.Eligian);

describe('CSS Context Detection', () => {
  describe('ClassName context', () => {
    it('should detect cursor inside addClass() string parameter', async () => {
      const text = s`
        action test [
          addClass("<|>")
        ]
      `;

      const context = await createCompletionContext(text);
      const result = detectCompletionContext(context);

      expect(result).toBe(CompletionContextType.ClassName);
    });

    it('should detect cursor inside removeClass() string parameter', async () => {
      const text = s`
        action test [
          removeClass("bu<|>tton")
        ]
      `;

      const context = await createCompletionContext(text);
      const result = detectCompletionContext(context);

      expect(result).toBe(CompletionContextType.ClassName);
    });

    it('should detect cursor inside toggleClass() string parameter', async () => {
      const text = s`
        action test [
          toggleClass("active<|>")
        ]
      `;

      const context = await createCompletionContext(text);
      const result = detectCompletionContext(context);

      expect(result).toBe(CompletionContextType.ClassName);
    });

    it('should detect cursor inside hasClass() string parameter', async () => {
      const text = s`
        action test [
          hasClass("visible<|>")
        ]
      `;

      const context = await createCompletionContext(text);
      const result = detectCompletionContext(context);

      expect(result).toBe(CompletionContextType.ClassName);
    });
  });

  describe('SelectorClass context', () => {
    it('should detect cursor after dot in selectElement selector', async () => {
      const text = s`
        action test [
          selectElement(".<|>")
        ]
      `;

      const context = await createCompletionContext(text);
      const result = detectCompletionContext(context);

      expect(result).toBe(CompletionContextType.SelectorClass);
    });

    it('should detect cursor after dot with partial class name', async () => {
      const text = s`
        action test [
          selectElement(".butt<|>")
        ]
      `;

      const context = await createCompletionContext(text);
      const result = detectCompletionContext(context);

      expect(result).toBe(CompletionContextType.SelectorClass);
    });

    it('should detect cursor after second dot in compound selector', async () => {
      const text = s`
        action test [
          selectElement(".button.<|>")
        ]
      `;

      const context = await createCompletionContext(text);
      const result = detectCompletionContext(context);

      expect(result).toBe(CompletionContextType.SelectorClass);
    });

    it('should detect cursor in querySelector with dot', async () => {
      const text = s`
        action test [
          querySelector(".<|>active")
        ]
      `;

      const context = await createCompletionContext(text);
      const result = detectCompletionContext(context);

      expect(result).toBe(CompletionContextType.SelectorClass);
    });
  });

  describe('SelectorID context', () => {
    it('should detect cursor after hash in selectElement selector', async () => {
      const text = s`
        action test [
          selectElement("#<|>")
        ]
      `;

      const context = await createCompletionContext(text);
      const result = detectCompletionContext(context);

      expect(result).toBe(CompletionContextType.SelectorID);
    });

    it('should detect cursor after hash with partial ID name', async () => {
      const text = s`
        action test [
          selectElement("#head<|>")
        ]
      `;

      const context = await createCompletionContext(text);
      const result = detectCompletionContext(context);

      expect(result).toBe(CompletionContextType.SelectorID);
    });

    it('should detect cursor in querySelectorAll with hash', async () => {
      const text = s`
        action test [
          querySelectorAll("#<|>container")
        ]
      `;

      const context = await createCompletionContext(text);
      const result = detectCompletionContext(context);

      expect(result).toBe(CompletionContextType.SelectorID);
    });
  });

  describe('None context', () => {
    it('should return None when cursor is outside string literal', async () => {
      const text = s`
        action test [
          <|>addClass("button")
        ]
      `;

      const context = await createCompletionContext(text);
      const result = detectCompletionContext(context);

      expect(result).toBe(CompletionContextType.None);
    });

    it('should return None when cursor is in non-CSS operation', async () => {
      const text = s`
        action test [
          animate({opacity: "<|>1"}, 500)
        ]
      `;

      const context = await createCompletionContext(text);
      const result = detectCompletionContext(context);

      expect(result).toBe(CompletionContextType.None);
    });

    it('should return None when not inside any operation', async () => {
      const text = s`
        <|>action test [
          addClass("button")
        ]
      `;

      const context = await createCompletionContext(text);
      const result = detectCompletionContext(context);

      expect(result).toBe(CompletionContextType.None);
    });

    it('should return None when cursor is in selector without prefix', async () => {
      const text = s`
        action test [
          selectElement("div<|>")
        ]
      `;

      const context = await createCompletionContext(text);
      const result = detectCompletionContext(context);

      // No CSS completion when not after . or #
      expect(result).toBe(CompletionContextType.None);
    });
  });
});

/**
 * Create a mock CompletionContext for testing
 *
 * Parses text with cursor marker (<|>), creates document, and builds
 * a CompletionContext that can be passed to detectCompletionContext.
 *
 * @param text - Text with cursor marker <|>
 * @returns CompletionContext for testing
 */
async function createCompletionContext(text: string): Promise<CompletionContext> {
  // Find cursor marker
  const cursorIndex = text.indexOf('<|>');
  if (cursorIndex === -1) {
    throw new Error('No cursor marker <|> found in test text');
  }

  // Remove cursor marker
  const cleanText = text.replace('<|>', '');

  // Parse document
  const document = await parse(cleanText);

  // Calculate position from offset
  const position = document.textDocument.positionAt(cursorIndex);

  // Create mock CompletionContext
  // CompletionContext requires: document, textDocument, offset, position, node, tokenOffset
  const context: CompletionContext = {
    document,
    textDocument: document.textDocument,
    offset: cursorIndex,
    position,
    // @ts-expect-error - Simplified mock for testing (node/tokenOffset not critical for our logic)
    node: undefined,
    tokenOffset: cursorIndex,
  };

  return context;
}
