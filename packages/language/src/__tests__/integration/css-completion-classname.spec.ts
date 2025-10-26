/**
 * Integration Test: CSS Class Completion in className Parameters (US1)
 *
 * T009: End-to-end test for CSS class autocomplete in addClass/removeClass/toggleClass
 *
 * IMPORTANT: One integration test per file (Constitution Principle II)
 * Rationale: Test environment state cannot be reliably reset between integration tests
 *
 * LIMITATION: These tests use addClass(<|>) syntax (cursor between parens) instead of
 * addClass("<|>") (cursor inside quotes). The latter doesn't work due to Langium
 * framework constraints. When cursor is between parens, completions insert quoted text:
 * addClass() → addClass("className")
 */

import { EmptyFileSystem } from 'langium';
import type { CompletionList } from 'langium/lsp';
import { expectCompletion, parseHelper } from 'langium/test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { CSSRegistryService } from '../../css/css-registry.js';
import { createEligianServices } from '../../eligian-module.js';
import type { Program } from '../../generated/ast.js';

describe('CSS Completion Integration: className Parameters', () => {
  let services: ReturnType<typeof createEligianServices>;
  let cssRegistry: CSSRegistryService;
  let completion: ReturnType<typeof expectCompletion>;
  let _parse: ReturnType<typeof parseHelper<Program>>;

  beforeAll(() => {
    // Create services
    services = createEligianServices(EmptyFileSystem);
    completion = expectCompletion(services.Eligian);
    _parse = parseHelper<Program>(services.Eligian);

    // Get CSS registry service
    cssRegistry = services.Eligian.css.CSSRegistry;
  });

  beforeEach(async () => {
    // For each test, pre-populate the CSS registry
    // We need to register CSS for the documents that expectCompletion creates
    // Since we don't know the exact URI in advance, we'll register for multiple possible URIs

    const mockCSSUri = 'file:///test.css';

    // Register CSS file with classes
    cssRegistry.updateCSSFile(mockCSSUri, {
      classes: new Set(['button', 'primary', 'active', 'btn-large', 'is-hidden']),
      ids: new Set(),
      classLocations: new Map(),
      idLocations: new Map(),
      classRules: new Map(),
      idRules: new Map(),
      errors: [],
    });

    // Register CSS imports for potential document URIs that the test helper might create
    // The parseHelper generates URIs like file:///1.eligian, file:///2.eligian, etc.
    for (let i = 1; i <= 20; i++) {
      cssRegistry.registerImports(`file:///${i}.eligian`, [mockCSSUri]);
    }
  });

  it('should provide CSS class completions in addClass() parameter', async () => {
    await completion({
      text: `
        styles "./test.css"

        action test [
          addClass(<|>)
        ]
      `,
      index: 0,
      assert: (completions: CompletionList) => {
        const labels = completions.items.map(item => item.label);

        // Should include CSS classes from imported file
        expect(labels).toContain('button');
        expect(labels).toContain('primary');
        expect(labels).toContain('active');
        expect(labels).toContain('btn-large');
        expect(labels).toContain('is-hidden');

        // Completions should insert WITH quotes (verified by checking insertText)
        const buttonItem = completions.items.find(item => item.label === 'button');
        expect(buttonItem).toBeDefined();
        expect(buttonItem?.insertText).toBe('"button"');
      },
    });
  });

  it('should provide CSS class completions in removeClass() parameter', async () => {
    await completion({
      text: `
        styles "./test.css"

        action test [
          removeClass(<|>)
        ]
      `,
      index: 0,
      assert: (completions: CompletionList) => {
        const labels = completions.items.map(item => item.label);

        expect(labels).toContain('button');
        expect(labels).toContain('primary');
      },
    });
  });

  it('should provide CSS class completions in toggleClass() parameter', async () => {
    await completion({
      text: `
        styles "./test.css"

        action test [
          toggleClass(<|>)
        ]
      `,
      index: 0,
      assert: (completions: CompletionList) => {
        const labels = completions.items.map(item => item.label);

        expect(labels).toContain('active');
      },
    });
  });

  it('should show "CSS class" in detail text', async () => {
    await completion({
      text: `
        styles "./test.css"

        action test [
          addClass(<|>)
        ]
      `,
      index: 0,
      assert: (completions: CompletionList) => {
        // Find a CSS class completion item
        const buttonItem = completions.items.find(item => item.label === 'button');

        expect(buttonItem).toBeDefined();
        expect(buttonItem?.detail).toBe('CSS class');
      },
    });
  });

  it('should rank CSS completions first using sortText', async () => {
    await completion({
      text: `
        styles "./test.css"

        action test [
          addClass(<|>)
        ]
      `,
      index: 0,
      assert: (completions: CompletionList) => {
        // Find CSS completion items
        const cssItems = completions.items.filter(item => item.detail === 'CSS class');

        // All CSS items should have sortText starting with "0_"
        for (const item of cssItems) {
          expect(item.sortText).toMatch(/^0_/);
        }

        // Verify specific sortText values
        const buttonItem = cssItems.find(item => item.label === 'button');
        expect(buttonItem?.sortText).toBe('0_button');
      },
    });
  });

  it('should provide completions with typed prefix', async () => {
    await completion({
      text: `
        styles "./test.css"

        action test [
          addClass(btn<|>)
        ]
      `,
      index: 0,
      assert: (completions: CompletionList) => {
        const labels = completions.items.map(item => item.label);

        // Should include classes starting with "btn"
        expect(labels).toContain('btn-large');

        // Note: Langium's completion filtering happens automatically based on text before cursor
        // Our provider generates all completions, Langium filters them
      },
    });
  });

  it('should not provide CSS completions when no CSS files imported', async () => {
    // Clear all CSS imports from registry before this test
    // This simulates a document without "styles" imports
    // Note: We can't clear the entire registry because beforeEach runs before each test,
    // but we can clear imports for future document URIs that haven't been created yet
    // Instead, we'll test with a much higher document number that hasn't been pre-registered

    await completion({
      text: `
        action test [
          addClass(<|>)
        ]
      `,
      index: 100, // Use higher index to get a document URI beyond our pre-registration (1-20)
      assert: (completions: CompletionList) => {
        // Should not include CSS class completions
        // (No "styles" import in this document, and we used index beyond pre-registration)
        const cssItems = completions.items.filter(item => item.detail === 'CSS class');

        // Should be empty or very few items (none from our mock CSS)
        expect(cssItems.length).toBe(0);
      },
    });
  });

  it('should not provide CSS completions outside string literals', async () => {
    await completion({
      text: `
        styles "./test.css"

        action test [
          <|>addClass("button")
        ]
      `,
      index: 0,
      assert: (completions: CompletionList) => {
        // Cursor is before operation name, not in string literal
        // Should not show CSS class completions here
        const cssItems = completions.items.filter(item => item.detail === 'CSS class');

        expect(cssItems.length).toBe(0);
      },
    });
  });
});
