import { beforeAll, describe, expect, test } from 'vitest';
import { createTestContext, setupCSSRegistry, type TestContext } from '../test-helpers.js';

describe('CSS Selector Validation - Unknown Classes and IDs', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = createTestContext();
  });

  test('should error when selector contains unknown class', async () => {
    setupCSSRegistry(ctx, 'file:///styles.css', {
      classes: ['button'],
      ids: [],
    });

    const code = `
      styles "./styles.css"

      action selectPrimary() [
        selectElement(".button.primary")
      ]

      timeline "test" in ".container" using raf {
        at 0s..1s selectPrimary()
      }
    `;

    const { diagnostics: validationErrors } = await ctx.parseAndValidate(code);
    const selectorErrors = validationErrors.filter(e =>
      e.message.includes('Unknown CSS class in selector')
    );
    expect(selectorErrors.length).toBeGreaterThan(0);
    expect(selectorErrors[0].message).toContain('primary');
  });

  test('should error when selector contains unknown ID', async () => {
    setupCSSRegistry(ctx, 'file:///styles.css', {
      classes: [],
      ids: ['header'],
    });

    const code = `
      styles "./styles.css"

      action selectFooter() [
        selectElement("#footer")
      ]

      timeline "test" in ".container" using raf {
        at 0s..1s selectFooter()
      }
    `;

    const { diagnostics: validationErrors } = await ctx.parseAndValidate(code);
    const selectorErrors = validationErrors.filter(e =>
      e.message.includes('Unknown CSS ID in selector')
    );
    expect(selectorErrors.length).toBeGreaterThan(0);
    expect(selectorErrors[0].message).toContain('footer');
  });

  test('should error for multiple unknown classes in selector', async () => {
    setupCSSRegistry(ctx, 'file:///styles.css', {
      classes: ['button'],
      ids: [],
    });

    const code = `
      styles "./styles.css"

      action selectMultiple() [
        selectElement(".button.primary.large")
      ]

      timeline "test" in ".container" using raf {
        at 0s..1s selectMultiple()
      }
    `;

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
      classes: ['primary', 'secondary', 'button'],
      ids: [],
    });

    const code = `
      styles "./styles.css"

      action selectTypo() [
        selectElement(".primry")
      ]

      timeline "test" in ".container" using raf {
        at 0s..1s selectTypo()
      }
    `;

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
      classes: ['parent'],
      ids: [],
    });

    const code = `
      styles "./styles.css"

      action selectNested() [
        selectElement(".parent > .child")
      ]

      timeline "test" in ".container" using raf {
        at 0s..1s selectNested()
      }
    `;

    const { diagnostics: validationErrors } = await ctx.parseAndValidate(code);
    const selectorErrors = validationErrors.filter(e =>
      e.message.includes('Unknown CSS class in selector')
    );
    expect(selectorErrors.length).toBeGreaterThan(0);
    expect(selectorErrors[0].message).toContain('child');
  });
});
