/**
 * Feature 037: Languages block required when locales are imported
 *
 * Tests validation that enforces:
 * - Locales import requires a languages block to be present
 * - Error shown on locales import statement if no languages block
 */

import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import {
  CSS_FIXTURES,
  createTestContext,
  DiagnosticSeverity,
  setupCSSRegistry,
  type TestContext,
} from './test-helpers.js';

describe('Locales import requires languages block (Feature 037/045)', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  beforeEach(() => {
    setupCSSRegistry(ctx, 'file:///styles.css', CSS_FIXTURES.common);
  });

  test('should error when locales import present without languages block', async () => {
    const code = `
      locales "./locales.json"
      styles "./styles.css"

      action test() [
        wait(100)
      ]

      timeline "Test" in "#container" using raf {
        at 0s..1s test()
      }
    `;

    const { diagnostics } = await ctx.parseAndValidate(code);

    // Should have error about missing languages block
    const errors = diagnostics.filter(
      d =>
        d.severity === DiagnosticSeverity.Error &&
        d.message.includes('Locales import requires a languages block')
    );

    expect(errors.length).toBeGreaterThan(0);
  });

  test('should NOT error when locales import present WITH languages block', async () => {
    const code = `
      languages {
        "en-US" "English"
      }

      locales "./locales.json"
      styles "./styles.css"

      action test() [
        wait(100)
      ]

      timeline "Test" in "#container" using raf {
        at 0s..1s test()
      }
    `;

    const { diagnostics } = await ctx.parseAndValidate(code);

    // Should NOT have error about missing languages block
    const errors = diagnostics.filter(
      d =>
        d.severity === DiagnosticSeverity.Error &&
        d.message.includes('Locales import requires a languages block')
    );

    expect(errors).toHaveLength(0);
  });

  test('should NOT error when no locales import (no languages block)', async () => {
    const code = `
      styles "./styles.css"

      action test() [
        wait(100)
      ]

      timeline "Test" in "#container" using raf {
        at 0s..1s test()
      }
    `;

    const { diagnostics } = await ctx.parseAndValidate(code);

    // Should NOT have error (no locales import, no requirement for languages)
    const errors = diagnostics.filter(
      d =>
        d.severity === DiagnosticSeverity.Error &&
        d.message.includes('Locales import requires a languages block')
    );

    expect(errors).toHaveLength(0);
  });

  test('should error on multiple locales imports without languages block', async () => {
    const code = `
      locales "./locales1.json"
      locales "./locales2.json"
      styles "./styles.css"

      action test() [
        wait(100)
      ]

      timeline "Test" in "#container" using raf {
        at 0s..1s test()
      }
    `;

    const { diagnostics } = await ctx.parseAndValidate(code);

    // Should have errors on BOTH locales imports
    const errors = diagnostics.filter(
      d =>
        d.severity === DiagnosticSeverity.Error &&
        d.message.includes('Locales import requires a languages block')
    );

    expect(errors.length).toBe(2); // One error per locales import
  });
});
