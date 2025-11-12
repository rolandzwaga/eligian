import { beforeAll, describe, expect, test } from 'vitest';
import {
  createTestContext,
  minimalProgram,
  setupCSSRegistry,
  type TestContext,
} from '../test-helpers.js';

describe('CSS className validation - Unknown className with suggestions', () => {
  let ctx: TestContext;

  // Expensive setup - runs once per suite
  beforeAll(async () => {
    ctx = createTestContext();
  });

  test('should error when className does not exist with suggestion', async () => {
    // Populate CSS registry with class similar to "primry"
    // NOTE: Document URI is file:///1.eligian, so "./styles.css" resolves to "file:///styles.css"
    const cssFileUri = 'file:///styles.css';
    setupCSSRegistry(ctx, cssFileUri, {
      classes: ['primary', 'secondary', 'button'],
      ids: [],
    });

    const code = minimalProgram({
      actionBody: 'addClass("primry")',
    });
    const { errors: validationErrors } = await ctx.parseAndValidate(code, cssFileUri);

    const classNameErrors = validationErrors.filter(
      e => e.message.includes('Unknown CSS class') && e.message.includes('Did you mean')
    );
    expect(classNameErrors.length).toBeGreaterThan(0);
  });

  test('should suggest multiple similar class names', async () => {
    // Populate CSS registry with classes similar to "buton"
    const cssFileUri = 'file:///test/styles.css';
    setupCSSRegistry(ctx, cssFileUri, {
      classes: ['button', 'buttons', 'bottom'],
      ids: [],
    });

    const code = minimalProgram({
      actionBody: 'addClass("buton")',
    });
    const { errors: validationErrors } = await ctx.parseAndValidate(code, cssFileUri);

    const classNameErrors = validationErrors.filter(e => e.message.includes('Unknown CSS class'));
    expect(classNameErrors.length).toBeGreaterThan(0);

    // Should include "Did you mean" with suggestions
    const hasSuggestions = classNameErrors.some(e => e.message.includes('Did you mean'));
    expect(hasSuggestions).toBe(true);
  });

  test('should error without suggestion when no similar classes exist', async () => {
    // Populate CSS registry with classes that are very different
    const cssFileUri = 'file:///test/styles.css';
    setupCSSRegistry(ctx, cssFileUri, {
      classes: ['button', 'primary', 'secondary'],
      ids: [],
    });

    const code = minimalProgram({
      actionBody: 'addClass("xyz-nonexistent")',
    });
    const { errors: validationErrors } = await ctx.parseAndValidate(code, cssFileUri);

    const classNameErrors = validationErrors.filter(e => e.message.includes('Unknown CSS class'));
    expect(classNameErrors.length).toBeGreaterThan(0);

    // Should NOT include "Did you mean" (no similar classes)
    const hasSuggestions = classNameErrors.some(e => e.message.includes('Did you mean'));
    expect(hasSuggestions).toBe(false);
  });
});
