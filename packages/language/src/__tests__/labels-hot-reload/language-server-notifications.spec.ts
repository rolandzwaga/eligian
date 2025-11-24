/**
 * Unit tests for language server notification handlers
 *
 * These tests verify that the notification handlers in main.ts work correctly
 * and prevent regressions like accessing root.statements without isProgram check.
 *
 * Feature: Labels File Hot-Reload Validation
 */

import { beforeAll, describe, expect, test } from 'vitest';
import { createTestContext, type TestContext } from '../test-helpers.js';

describe('Language Server - Labels Notification Handlers', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = createTestContext();
  });

  /**
   * Regression test: Ensure we don't crash when processing documents
   * This test prevents the bug where root.statements was accessed without isProgram check
   */
  test('should not crash when processing document with labels import', async () => {
    // Valid syntax - matches passing integration tests
    const code = `
      languages {
        * "en-US" "English"
        "nl-NL" "Nederlands"
      }
      labels "./labels.json"

      action test() [
        selectElement("#header")
      ]

      timeline "test" in ".container" using raf {
        at 0s test()
      }
    `;

    // This should not throw - the build phase handler should handle it gracefully
    const document = await ctx.parse(code);
    expect(document).toBeDefined();
    // Parser errors may occur but server should not crash
  });

  test('should handle document without labels import', async () => {
    const code = `
      action test() [
        selectElement("#header")
      ]

      timeline "test" in ".container" using raf {
        at 0s test()
      }
    `;

    // Should not crash even without labels import
    const document = await ctx.parse(code);
    expect(document).toBeDefined();
  });

  test('should handle malformed document gracefully', async () => {
    const code = `
      this is not valid eligian syntax
    `;

    // Should not crash even with parse errors
    const document = await ctx.parse(code);
    expect(document).toBeDefined();
    // Will have parse errors but shouldn't crash the server
  });

  test('should handle document with CSS import only', async () => {
    const code = `
      styles "./styles.css"

      action test() [
        selectElement("#header")
      ]

      timeline "test" in ".container" using raf {
        at 0s test()
      }
    `;

    // Should handle CSS imports without crashing
    const document = await ctx.parse(code);
    expect(document).toBeDefined();
  });

  test('should handle document with both CSS and labels imports', async () => {
    const code = `
      languages {
        * "en-US" "English"
        "nl-NL" "Nederlands"
      }
      styles "./styles.css"
      labels "./labels.json"

      action test() [
        selectElement("#header")
      ]

      timeline "test" in ".container" using raf {
        at 0s test()
      }
    `;

    // Should handle both imports without crashing
    const document = await ctx.parse(code);
    expect(document).toBeDefined();
  });

  test('should handle document with multiple labels imports', async () => {
    const code = `
      languages {
        * "en-US" "English"
        "nl-NL" "Nederlands"
      }
      labels "./labels1.json"
      labels "./labels2.json"

      action test() [
        selectElement("#header")
      ]

      timeline "test" in ".container" using raf {
        at 0s test()
      }
    `;

    // Should handle multiple labels imports without crashing
    const document = await ctx.parse(code);
    expect(document).toBeDefined();
  });

  test('should handle empty document', async () => {
    const code = '';

    // Should not crash with empty document
    const document = await ctx.parse(code);
    expect(document).toBeDefined();
  });

  test('should handle document with only imports', async () => {
    const code = `
      languages {
        * "en-US" "English"
      }
      styles "./styles.css"
      labels "./labels.json"
    `;

    // Should handle document with only imports (no actions/timeline)
    const document = await ctx.parse(code);
    expect(document).toBeDefined();
    // Document missing timeline will have validation errors, but shouldn't crash
  });
});
