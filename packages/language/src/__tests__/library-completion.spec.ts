/**
 * Library Completion Tests (Feature 023 - User Story 4)
 *
 * Tests that IDE auto-completion works correctly for imported actions:
 * - Suggests public actions from library files
 * - Excludes private actions from suggestions
 * - Shows action documentation in completion items
 */

import { beforeAll, describe, expect, test } from 'vitest';
import {
  createLibraryDocument,
  createTestContextWithMockFS,
  type TestContext,
} from '../__tests__/test-helpers.js';

describe('Library Completion', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    // Use mock file system to enable cross-document references
    ctx = createTestContextWithMockFS();

    // Create library document with mixed public and private actions
    await createLibraryDocument(
      ctx,
      `
        library completionLib

        /**
         * Fades in an element
         * @param selector CSS selector for target element
         */
        action fadeIn(selector: string) [
          selectElement(selector)
          animate({opacity: 1}, 1000)
        ]

        /**
         * Internal helper for fading
         */
        private action fadeHelper(selector: string) [
          selectElement(selector)
        ]

        /**
         * Slides in an element
         * @param selector CSS selector for target element
         */
        action slideIn(selector: string) [
          selectElement(selector)
          animate({transform: "translateX(0)"}, 500)
        ]
      `,
      'file:///test/completionLib.eligian'
    );
  });

  // T060: Test auto-completion suggests public actions from library
  test('auto-completion suggests public actions from library', async () => {
    const code = `
      import { | } from "./completionLib.eligian"

      timeline "Test" in ".container" using raf {
        at 0s..2s fadeIn("#box")
      }
    `;

    const document = await ctx.parse(code.replace('|', ''), {
      documentUri: 'file:///test/completion-test.eligian',
    });
    await ctx.services.shared.workspace.DocumentBuilder.build([document], {
      validation: true,
    });

    // Get completion position (inside import braces)
    const cursorPosition = code.indexOf('|');
    const lines = code.substring(0, cursorPosition).split('\n');
    const line = lines.length - 1;
    const character = lines[lines.length - 1].length;

    // Get completion items
    const completionProvider = ctx.services.Eligian.lsp.CompletionProvider;
    const completions = await completionProvider?.getCompletion(document, {
      textDocument: { uri: document.uri.toString() },
      position: { line, character },
    });

    if (!completions) {
      throw new Error('No completion provider available');
    }

    const completionLabels = completions.items.map(item => item.label);

    // Public actions should be suggested
    expect(completionLabels).toContain('fadeIn');
    expect(completionLabels).toContain('slideIn');

    // Private actions should NOT be suggested (tested in T061)
  });

  // T061: Test auto-completion excludes private actions
  test('auto-completion excludes private actions', async () => {
    const code = `
      import { | } from "./completionLib.eligian"

      timeline "Test" in ".container" using raf {
        at 0s..2s fadeIn("#box")
      }
    `;

    const document = await ctx.parse(code.replace('|', ''), {
      documentUri: 'file:///test/completion-test2.eligian',
    });
    await ctx.services.shared.workspace.DocumentBuilder.build([document], {
      validation: true,
    });

    // Get completion position (inside import braces)
    const cursorPosition = code.indexOf('|');
    const lines = code.substring(0, cursorPosition).split('\n');
    const line = lines.length - 1;
    const character = lines[lines.length - 1].length;

    // Get completion items
    const completionProvider = ctx.services.Eligian.lsp.CompletionProvider;
    const completions = await completionProvider?.getCompletion(document, {
      textDocument: { uri: document.uri.toString() },
      position: { line, character },
    });

    if (!completions) {
      throw new Error('No completion provider available');
    }

    const completionLabels = completions.items.map(item => item.label);

    // Private actions should NOT be suggested
    expect(completionLabels).not.toContain('fadeHelper');
  });

  // T062: Test auto-completion shows action documentation
  test('auto-completion shows action documentation', async () => {
    const code = `
      import { | } from "./completionLib.eligian"

      timeline "Test" in ".container" using raf {
        at 0s..2s fadeIn("#box")
      }
    `;

    const document = await ctx.parse(code.replace('|', ''), {
      documentUri: 'file:///test/completion-test3.eligian',
    });
    await ctx.services.shared.workspace.DocumentBuilder.build([document], {
      validation: true,
    });

    // Get completion position (inside import braces)
    const cursorPosition = code.indexOf('|');
    const lines = code.substring(0, cursorPosition).split('\n');
    const line = lines.length - 1;
    const character = lines[lines.length - 1].length;

    // Get completion items
    const completionProvider = ctx.services.Eligian.lsp.CompletionProvider;
    const completions = await completionProvider?.getCompletion(document, {
      textDocument: { uri: document.uri.toString() },
      position: { line, character },
    });

    if (!completions) {
      throw new Error('No completion provider available');
    }

    // Find fadeIn completion item
    const fadeInItem = completions.items.find(item => item.label === 'fadeIn');
    expect(fadeInItem).toBeDefined();

    // Should have documentation from JSDoc comment
    expect(fadeInItem?.documentation).toBeDefined();
    if (typeof fadeInItem?.documentation === 'object' && fadeInItem.documentation !== null) {
      expect(fadeInItem.documentation.value).toContain('Fades in an element');
    } else if (typeof fadeInItem?.documentation === 'string') {
      expect(fadeInItem.documentation).toContain('Fades in an element');
    }
  });
});
