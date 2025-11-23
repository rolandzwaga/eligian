/**
 * Feature 037: Languages block required when labels are imported
 *
 * Tests validation that enforces:
 * - Labels import requires a languages block to be present
 * - Error shown on labels import statement if no languages block
 */

import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import {
  CSS_FIXTURES,
  createTestContext,
  DiagnosticSeverity,
  setupCSSRegistry,
  type TestContext,
} from './test-helpers.js';

describe('Labels import requires languages block (Feature 037)', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  beforeEach(() => {
    setupCSSRegistry(ctx, 'file:///styles.css', CSS_FIXTURES.common);
  });

  test('should error when labels import present without languages block', async () => {
    const code = `
      labels "./labels.json"
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
        d.message.includes('Labels import requires a languages block')
    );

    expect(errors.length).toBeGreaterThan(0);
  });

  test('should NOT error when labels import present WITH languages block', async () => {
    const code = `
      languages {
        "en-US" "English"
      }

      labels "./labels.json"
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
        d.message.includes('Labels import requires a languages block')
    );

    expect(errors).toHaveLength(0);
  });

  test('should NOT error when no labels import (no languages block)', async () => {
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

    // Should NOT have error (no labels import, no requirement for languages)
    const errors = diagnostics.filter(
      d =>
        d.severity === DiagnosticSeverity.Error &&
        d.message.includes('Labels import requires a languages block')
    );

    expect(errors).toHaveLength(0);
  });

  test('should error on multiple labels imports without languages block', async () => {
    const code = `
      labels "./labels1.json"
      labels "./labels2.json"
      styles "./styles.css"

      action test() [
        wait(100)
      ]

      timeline "Test" in "#container" using raf {
        at 0s..1s test()
      }
    `;

    const { diagnostics } = await ctx.parseAndValidate(code);

    // Should have errors on BOTH labels imports
    const errors = diagnostics.filter(
      d =>
        d.severity === DiagnosticSeverity.Error &&
        d.message.includes('Labels import requires a languages block')
    );

    expect(errors.length).toBe(2); // One error per labels import
  });
});
