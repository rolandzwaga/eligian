import { beforeAll, describe, expect, test } from 'vitest';
import {
  createTestContext,
  minimalProgram,
  setupCSSRegistry,
  type TestContext,
} from '../test-helpers.js';

describe('CSS Selector Validation - Unknown Classes and IDs', () => {
  let ctx: TestContext;

  // Expensive setup - runs once per suite
  beforeAll(async () => {
    ctx = createTestContext();
  });

  test('should error when selector contains unknown class', async () => {
    setupCSSRegistry(ctx, 'file:///styles.css', {
      classes: ['button', 'container'],
      ids: [],
    });

    const code = minimalProgram({
      actionName: 'selectPrimary',
      actionBody: 'selectElement(".button.primary")',
    });

    const { diagnostics: validationErrors } = await ctx.parseAndValidate(code);
    const selectorErrors = validationErrors.filter(e =>
      e.message.includes('Unknown CSS class in selector')
    );
    expect(selectorErrors.length).toBeGreaterThan(0);
    expect(selectorErrors[0].message).toContain('primary');
  });

  test('should error when selector contains unknown ID', async () => {
    setupCSSRegistry(ctx, 'file:///styles.css', {
      classes: ['container'],
      ids: ['header'],
    });

    const code = minimalProgram({
      actionName: 'selectFooter',
      actionBody: 'selectElement("#footer")',
    });

    const { diagnostics: validationErrors } = await ctx.parseAndValidate(code);
    const selectorErrors = validationErrors.filter(e =>
      e.message.includes('Unknown CSS ID in selector')
    );
    expect(selectorErrors.length).toBeGreaterThan(0);
    expect(selectorErrors[0].message).toContain('footer');
  });

  test('should error for multiple unknown classes in selector', async () => {
    setupCSSRegistry(ctx, 'file:///styles.css', {
      classes: ['button', 'container'],
      ids: [],
    });

    const code = minimalProgram({
      actionName: 'selectMultiple',
      actionBody: 'selectElement(".button.primary.large")',
    });

    const { diagnostics: validationErrors } = await ctx.parseAndValidate(code);
    const selectorErrors = validationErrors.filter(e =>
      e.message.includes('Unknown CSS class in selector')
    );
    // Should have 2 errors: 'primary' and 'large'
    expect(selectorErrors.length).toBe(2);

    const classNames = selectorErrors.map(e => {
      const match = e.message.match(/'([^']+)'/);
      return match ? match[1] : null;
    });
    expect(classNames).toContain('primary');
    expect(classNames).toContain('large');
  });

  test('should provide suggestions for similar class names', async () => {
    setupCSSRegistry(ctx, 'file:///styles.css', {
      classes: ['primary', 'secondary', 'button', 'container'],
      ids: [],
    });

    const code = minimalProgram({
      actionName: 'selectTypo',
      actionBody: 'selectElement(".primry")',
    });

    const { diagnostics: validationErrors } = await ctx.parseAndValidate(code);
    const selectorErrors = validationErrors.filter(
      e => e.message.includes('Unknown CSS class in selector') && e.message.includes('Did you mean')
    );
    expect(selectorErrors.length).toBeGreaterThan(0);
    expect(selectorErrors[0].message).toContain('primry');
    expect(selectorErrors[0].message).toContain('primary');
  });

  test('should validate unknown classes in combinator selectors', async () => {
    setupCSSRegistry(ctx, 'file:///styles.css', {
      classes: ['parent', 'container'],
      ids: [],
    });

    const code = minimalProgram({
      actionName: 'selectNested',
      actionBody: 'selectElement(".parent > .child")',
    });

    const { diagnostics: validationErrors } = await ctx.parseAndValidate(code);
    const selectorErrors = validationErrors.filter(e =>
      e.message.includes('Unknown CSS class in selector')
    );
    expect(selectorErrors.length).toBeGreaterThan(0);
    expect(selectorErrors[0].message).toContain('child');
  });
});
