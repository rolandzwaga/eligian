/**
 * Library Hover Tests (Feature 023 - User Story 4)
 *
 * Tests that IDE hover functionality works correctly for imported actions:
 * - Shows JSDoc documentation when hovering over imported action calls
 * - Shows parameter information and types
 */

import { beforeAll, describe, expect, test } from 'vitest';
import type { HoverParams } from 'vscode-languageserver';
import {
  createLibraryDocument,
  createTestContextWithMockFS,
  type TestContext,
} from '../__tests__/test-helpers.js';
import { EligianHoverProvider } from '../eligian-hover-provider.js';

describe('Library Hover', () => {
  let ctx: TestContext;
  let provider: EligianHoverProvider;

  beforeAll(async () => {
    // Use mock file system to enable cross-document references
    ctx = createTestContextWithMockFS();

    // Create hover provider
    provider = new EligianHoverProvider(
      ctx.services.Eligian.css.CSSRegistry,
      ctx.services.Eligian.labels.LabelRegistry,
      ctx.services.Eligian
    );

    // Create library document with documented actions
    await createLibraryDocument(
      ctx,
      `
        library hoverLib

        /**
         * Fades in an element over a specified duration
         * @param selector CSS selector for target element
         * @param duration Animation duration in milliseconds
         */
        action fadeIn(selector: string, duration: number) [
          selectElement(selector)
          animate({opacity: 1}, duration)
        ]

        /**
         * Slides in an element from the left
         * @param selector CSS selector for target element
         */
        action slideIn(selector: string) [
          selectElement(selector)
          animate({transform: "translateX(0)"}, 500)
        ]
      `,
      'file:///test/hoverLib.eligian'
    );
  });

  // T063: Test hover on imported action shows JSDoc
  test('hover on imported action shows JSDoc documentation', async () => {
    const code = `
      import { fadeIn } from "./hoverLib.eligian"

      timeline "Test" in ".container" using raf {
        at 0s..2s fadeIn("#box", 1000)
      }
    `;

    const document = await ctx.parse(code, { documentUri: 'file:///test/hover-test.eligian' });
    await ctx.services.shared.workspace.DocumentBuilder.build([document], {
      validation: true,
    });

    // Get hover position (on "fadeIn" in timeline)
    const hoverPosition = code.indexOf('fadeIn("#box"');
    const lines = code.substring(0, hoverPosition).split('\n');
    const line = lines.length - 1;
    const character = lines[lines.length - 1].length;

    // Get hover information
    const params: HoverParams = {
      textDocument: { uri: document.uri.toString() },
      position: { line, character },
    };
    const hover = await provider.getHoverContent(document, params);

    expect(hover).toBeDefined();
    expect(hover?.contents).toBeDefined();

    // Hover should contain JSDoc documentation
    const hoverText =
      typeof hover?.contents === 'string'
        ? hover.contents
        : 'value' in hover!.contents
          ? hover!.contents.value
          : '';

    expect(hoverText).toContain('fadeIn');
    expect(hoverText).toContain('Fades in an element');
    expect(hoverText).toContain('selector');
    expect(hoverText).toContain('duration');
  });
});
