import { beforeAll, describe, expect, test } from 'vitest';
import {
  createTestContext,
  minimalProgram,
  setupCSSRegistry,
  type TestContext,
} from '../test-helpers.js';

describe('CSS Selector Validation - Invalid Syntax', () => {
  let ctx: TestContext;

  // Expensive setup - runs once per suite
  beforeAll(async () => {
    ctx = createTestContext();
  });

  test('should error for unclosed attribute selector', async () => {
    setupCSSRegistry(ctx, 'file:///styles.css', {
      classes: ['button', 'container'],
      ids: [],
    });

    const code = minimalProgram({
      actionName: 'selectInvalid',
      actionBody: 'selectElement(".button[")',
    });

    const { diagnostics: validationErrors } = await ctx.parseAndValidate(code);
    const syntaxErrors = validationErrors.filter(e =>
      e.message.includes('Invalid CSS selector syntax')
    );
    expect(syntaxErrors.length).toBeGreaterThan(0);
  });

  test('should error for unclosed pseudo-class', async () => {
    setupCSSRegistry(ctx, 'file:///styles.css', {
      classes: ['button', 'container'],
      ids: [],
    });

    const code = minimalProgram({
      actionName: 'selectInvalid',
      actionBody: 'selectElement(".button:not(")',
    });

    const { diagnostics: validationErrors } = await ctx.parseAndValidate(code);
    const syntaxErrors = validationErrors.filter(e =>
      e.message.includes('Invalid CSS selector syntax')
    );
    expect(syntaxErrors.length).toBeGreaterThan(0);
  });

  test('should error for unclosed string in attribute', async () => {
    setupCSSRegistry(ctx, 'file:///styles.css', {
      classes: ['input', 'container'],
      ids: [],
    });

    const code = minimalProgram({
      actionName: 'selectInvalid',
      actionBody: 'selectElement(".input[type=\'text]")',
    });

    const { diagnostics: validationErrors } = await ctx.parseAndValidate(code);
    const syntaxErrors = validationErrors.filter(e =>
      e.message.includes('Invalid CSS selector syntax')
    );
    expect(syntaxErrors.length).toBeGreaterThan(0);
  });
});
