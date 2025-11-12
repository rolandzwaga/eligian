import { beforeAll, describe, expect, test } from 'vitest';
import {
  createTestContext,
  minimalProgram,
  setupCSSRegistry,
  type TestContext,
} from '../test-helpers.js';

describe('CSS Selector Validation - Valid Selectors', () => {
  let ctx: TestContext;

  // Expensive setup - runs once per suite
  beforeAll(async () => {
    ctx = createTestContext();
  });

  test('should not error when selector classes exist in CSS', async () => {
    setupCSSRegistry(ctx, 'file:///styles.css', {
      classes: ['button', 'primary', 'large', 'container'],
      ids: ['header', 'footer'],
    });

    const code = minimalProgram({
      actionName: 'selectButton',
      actionBody: 'selectElement(".button.primary")',
    });

    const { diagnostics: validationErrors } = await ctx.parseAndValidate(code);
    const selectorErrors = validationErrors.filter(
      e => e.message.toLowerCase().includes('selector') || e.message.toLowerCase().includes('class')
    );
    expect(selectorErrors.length).toBe(0);
  });

  test('should not error when selector IDs exist in CSS', async () => {
    setupCSSRegistry(ctx, 'file:///styles.css', {
      classes: ['active', 'container'],
      ids: ['header', 'nav'],
    });

    // Keep original inline code - complex ID validation scenario
    const code = `
      styles "./styles.css"

      action selectNav() [
        selectElement("#nav.active")
      ]

      timeline "test" in ".container" using raf {
        at 0s..1s selectNav()
      }
    `;

    const { diagnostics: validationErrors } = await ctx.parseAndValidate(code);
    const selectorErrors = validationErrors.filter(
      e =>
        e.message.toLowerCase().includes('selector') ||
        e.message.toLowerCase().includes('class') ||
        e.message.toLowerCase().includes('id')
    );
    expect(selectorErrors.length).toBe(0);
  });

  test('should ignore pseudo-classes and validate only classes', async () => {
    setupCSSRegistry(ctx, 'file:///styles.css', {
      classes: ['button', 'container'],
      ids: [],
    });

    const code = minimalProgram({
      actionName: 'selectHoveredButton',
      actionBody: 'selectElement(".button:hover:active")',
    });

    const { diagnostics: validationErrors } = await ctx.parseAndValidate(code);
    const selectorErrors = validationErrors.filter(
      e => e.message.toLowerCase().includes('selector') || e.message.toLowerCase().includes('class')
    );
    expect(selectorErrors.length).toBe(0);
  });

  test('should validate all classes in combinator selectors', async () => {
    setupCSSRegistry(ctx, 'file:///styles.css', {
      classes: ['parent', 'child', 'sibling', 'container'],
      ids: [],
    });

    const code = minimalProgram({
      actionName: 'selectNested',
      actionBody: 'selectElement(".parent > .child + .sibling")',
    });

    const { diagnostics: validationErrors } = await ctx.parseAndValidate(code);
    const selectorErrors = validationErrors.filter(
      e => e.message.toLowerCase().includes('selector') || e.message.toLowerCase().includes('class')
    );
    expect(selectorErrors.length).toBe(0);
  });

  test('should error when no CSS files imported (all classes/IDs are invalid)', async () => {
    const code = minimalProgram({
      cssImport: false,
      actionName: 'selectAnything',
      actionBody: 'selectElement(".any-class-name")',
    });

    const { diagnostics: validationErrors } = await ctx.parseAndValidate(code);
    const selectorErrors = validationErrors.filter(
      e => e.message.toLowerCase().includes('selector') || e.message.toLowerCase().includes('class')
    );
    // Should have at least 2 errors: selectElement(".any-class-name") and timeline container ".container"
    expect(selectorErrors.length).toBeGreaterThanOrEqual(2);
  });

  test('should handle attribute selectors (attributes ignored)', async () => {
    setupCSSRegistry(ctx, 'file:///styles.css', {
      classes: ['input', 'container'],
      ids: [],
    });

    const code = minimalProgram({
      actionName: 'selectInput',
      actionBody: 'selectElement(".input[type=\'text\'][required]")',
    });

    const { diagnostics: validationErrors } = await ctx.parseAndValidate(code);
    const selectorErrors = validationErrors.filter(
      e => e.message.toLowerCase().includes('selector') || e.message.toLowerCase().includes('class')
    );
    expect(selectorErrors.length).toBe(0);
  });
});
