import { beforeAll, describe, expect, test } from 'vitest';
import { createTestContext, setupCSSRegistry, type TestContext } from '../test-helpers.js';

describe('CSS Selector Validation - Invalid Syntax', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = createTestContext();
  });

  test('should error for unclosed attribute selector', async () => {
    setupCSSRegistry(ctx, 'file:///styles.css', {
      classes: ['button'],
      ids: [],
    });

    const code = `
      styles "./styles.css"

      action selectInvalid() [
        selectElement(".button[")
      ]

      timeline "test" in ".container" using raf {
        at 0s..1s selectInvalid()
      }
    `;

    const { diagnostics: validationErrors } = await ctx.parseAndValidate(code);
    const syntaxErrors = validationErrors.filter(e =>
      e.message.includes('Invalid CSS selector syntax')
    );
    expect(syntaxErrors.length).toBeGreaterThan(0);
  });

  test('should error for unclosed pseudo-class', async () => {
    setupCSSRegistry(ctx, 'file:///styles.css', {
      classes: ['button'],
      ids: [],
    });

    const code = `
      styles "./styles.css"

      action selectInvalid() [
        selectElement(".button:not(")
      ]

      timeline "test" in ".container" using raf {
        at 0s..1s selectInvalid()
      }
    `;

    const { diagnostics: validationErrors } = await ctx.parseAndValidate(code);
    const syntaxErrors = validationErrors.filter(e =>
      e.message.includes('Invalid CSS selector syntax')
    );
    expect(syntaxErrors.length).toBeGreaterThan(0);
  });

  test('should error for unclosed string in attribute', async () => {
    setupCSSRegistry(ctx, 'file:///styles.css', {
      classes: ['input'],
      ids: [],
    });

    const code = `
      styles "./styles.css"

      action selectInvalid() [
        selectElement(".input[type='text]")
      ]

      timeline "test" in ".container" using raf {
        at 0s..1s selectInvalid()
      }
    `;

    const { diagnostics: validationErrors } = await ctx.parseAndValidate(code);
    const syntaxErrors = validationErrors.filter(e =>
      e.message.includes('Invalid CSS selector syntax')
    );
    expect(syntaxErrors.length).toBeGreaterThan(0);
  });
});
