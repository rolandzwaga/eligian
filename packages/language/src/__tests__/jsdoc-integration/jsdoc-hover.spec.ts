/**
 * JSDoc Hover Integration Tests (T021 - US3)
 *
 * Tests hover documentation display for action invocations with JSDoc comments.
 * These tests verify that:
 * - Hovering over an action call shows the action's JSDoc documentation
 * - Markdown formatting is preserved
 * - Graceful degradation when JSDoc is missing or malformed
 */

import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Hover, HoverParams } from 'vscode-languageserver';
import { EligianHoverProvider } from '../../eligian-hover-provider.js';
import { createEligianServices } from '../../eligian-module.js';
import type { Program } from '../../generated/ast.js';

describe('JSDoc Hover (T021 - US3)', () => {
  const services = createEligianServices(EmptyFileSystem).Eligian;
  const parse = parseHelper<Program>(services);
  let provider: EligianHoverProvider;

  // Expensive setup - runs once per suite
  beforeAll(() => {
    provider = new EligianHoverProvider(
      services.css.CSSRegistry,
      services.labels.LabelRegistry,
      services
    );
  });

  /**
   * Helper to parse document and get hover at cursor position marked by |
   */
  async function getHoverAtCursor(code: string): Promise<Hover | undefined> {
    // Find cursor position BEFORE removing |
    const cursorIndex = code.indexOf('|');
    if (cursorIndex === -1) {
      throw new Error('No cursor position marked with | in test code');
    }

    // Remove cursor marker for parsing
    const cleanCode = code.replace('|', '');
    const document = await parse(cleanCode);

    // Get position using the original cursor index
    const position = document.textDocument.positionAt(cursorIndex);

    const params: HoverParams = {
      textDocument: { uri: document.uri.toString() },
      position,
    };

    return provider.getHoverContent(document, params);
  }

  it('should display JSDoc with description and @param tags on hover', async () => {
    const code = `
      /**
       * Fades in an element over a specified duration
       * @param selector CSS selector for target element
       * @param duration Animation duration in milliseconds
       */
      action fadeIn(selector: string, duration: number) [
        selectElement(selector)
        animate({opacity: 1}, duration)
      ]

      timeline "Test" in ".container" using raf {
        at 0s..5s fade|In("#box", 1000)
      }
    `;

    const hover = await getHoverAtCursor(code);

    expect(hover).toBeDefined();
    expect(hover?.contents).toBeDefined();

    if (hover?.contents && typeof hover.contents === 'object' && 'value' in hover.contents) {
      expect(hover.contents.kind).toBe('markdown');
      const markdown = hover.contents.value;

      // Verify JSDoc content is displayed
      expect(markdown).toContain('Fades in an element over a specified duration');
      expect(markdown).toContain('selector');
      expect(markdown).toContain('CSS selector for target element');
      expect(markdown).toContain('duration');
      expect(markdown).toContain('Animation duration in milliseconds');
    }
  });

  it('should display JSDoc with description only (no @param tags)', async () => {
    const code = `
      /**
       * Resets the animation state to initial values
       */
      action reset() [
        selectElement("body")
      ]

      timeline "Test" in ".container" using raf {
        at 0s..5s rese|t()
      }
    `;

    const hover = await getHoverAtCursor(code);

    expect(hover).toBeDefined();
    if (hover?.contents && typeof hover.contents === 'object' && 'value' in hover.contents) {
      const markdown = hover.contents.value;
      expect(markdown).toContain('Resets the animation state to initial values');
      // Should NOT contain Parameters section since no @param tags
      expect(markdown).not.toContain('**Parameters:**');
    }
  });

  it('should show signature only when action has no JSDoc', async () => {
    const code = `
      action noDoc(foo: string) [
        selectElement(foo)
      ]

      timeline "Test" in ".container" using raf {
        at 0s..5s noDo|c("test")
      }
    `;

    const hover = await getHoverAtCursor(code);

    // Should fall back to baseline behavior (signature only, no JSDoc)
    // This tests graceful degradation when JSDoc is missing
    expect(hover).toBeDefined();
    if (hover?.contents && typeof hover.contents === 'object' && 'value' in hover.contents) {
      const markdown = hover.contents.value;
      // Should show action name but no JSDoc content
      expect(markdown).toContain('noDoc');
    }
  });

  it('should handle malformed JSDoc gracefully', async () => {
    const code = `
      /**
       * Broken documentation
       * @param {string selector - Missing closing brace
       */
      action broken(selector: string) [
        selectElement(selector)
      ]

      timeline "Test" in ".container" using raf {
        at 0s..5s broke|n("test")
      }
    `;

    const hover = await getHoverAtCursor(code);

    // Should gracefully degrade to signature only, not throw errors
    expect(hover).toBeDefined();
  });

  it('should preserve markdown formatting in JSDoc', async () => {
    const code = `
      /**
       * Applies **bold** and *italic* formatting
       *
       * Use \`code spans\` for technical terms
       * @param value The value to display
       */
      action display(value: string) [
        selectElement(value)
      ]

      timeline "Test" in ".container" using raf {
        at 0s..5s displa|y("test")
      }
    `;

    const hover = await getHoverAtCursor(code);

    expect(hover).toBeDefined();
    if (hover?.contents && typeof hover.contents === 'object' && 'value' in hover.contents) {
      const markdown = hover.contents.value;
      // Markdown should be preserved in output
      expect(markdown).toContain('**bold**');
      expect(markdown).toContain('*italic*');
      expect(markdown).toContain('`code spans`');
    }
  });

  it('should complete hover request within 300ms (performance test)', async () => {
    const code = `
      /**
       * Performance test action with many parameters
       * @param p1 Parameter 1
       * @param p2 Parameter 2
       * @param p3 Parameter 3
       * @param p4 Parameter 4
       * @param p5 Parameter 5
       */
      action perfTest(p1: string, p2: string, p3: string, p4: string, p5: string) [
        selectElement(p1)
      ]

      timeline "Test" in ".container" using raf {
        at 0s..5s perfTes|t("a", "b", "c", "d", "e")
      }
    `;

    const startTime = performance.now();
    const hover = await getHoverAtCursor(code);
    const endTime = performance.now();

    const duration = endTime - startTime;

    expect(hover).toBeDefined();
    expect(duration).toBeLessThan(300); // SC-005: Hover timing < 300ms
  });
});
