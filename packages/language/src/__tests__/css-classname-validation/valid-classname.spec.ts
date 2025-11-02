import { beforeAll, describe, expect, test } from 'vitest';
import { CSS_FIXTURES, createTestContext, setupCSSRegistry, type TestContext } from '../test-helpers.js';

describe('CSS className validation - Valid className parameters', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = createTestContext();
  })

  test('should not error when className exists in imported CSS', async () => {
    // Populate CSS registry with test data
    setupCSSRegistry(ctx, 'file:///styles.css', {
      classes: ['button', 'primary', 'secondary', 'container'],
      ids: [],
    });

    const code = `
      styles "./styles.css"

      action addButton() [
        addClass("button")
      ]

      timeline "test" in ".container" using raf {
        at 0s addButton()
      }
    `;
    const { errors: validationErrors } = await ctx.parseAndValidate(code);

    // Should have no className-related errors
    const classNameErrors = validationErrors.filter(
      e => e.message.toLowerCase().includes('class') && e.message.toLowerCase().includes('unknown')
    );
    expect(classNameErrors.length).toBe(0);
  });

  test('should error when no CSS files are imported (all classes are invalid)', async () => {
    // Without CSS imports, ALL CSS classes/IDs are invalid (no external CSS in Eligian)
    const code = `
      action testAction() [
        addClass("any-class-name")
      ]

      timeline "test" in ".container" using raf {
        at 0s testAction()
      }
    `;
    const { errors: validationErrors } = await ctx.parseAndValidate(code);

    // No CSS imports = all classes invalid = errors expected
    const classNameErrors = validationErrors.filter(
      e => e.message.toLowerCase().includes('class') && e.message.toLowerCase().includes('unknown')
    );
    // Should have at least 2 errors: addClass("any-class-name") and timeline container ".container"
    expect(classNameErrors.length).toBeGreaterThanOrEqual(2);
  });

  test('should not error for className in multiple CSS files', async () => {
    // Populate CSS registry with test data for both files
    setupCSSRegistry(ctx, 'file:///styles.css', {
      classes: ['container', 'header'],
      ids: [],
    });
    setupCSSRegistry(ctx, 'file:///theme.css', {
      classes: ['button', 'primary'],
      ids: [],
    });

    const code = `
      styles "./styles.css"
      styles "./theme.css"

      action testAction() [
        addClass("button")
      ]

      timeline "test" in ".container" using raf {
        at 0s testAction()
      }
    `;
    const { errors: validationErrors } = await ctx.parseAndValidate(code);

    const classNameErrors = validationErrors.filter(
      e => e.message.toLowerCase().includes('class') && e.message.toLowerCase().includes('unknown')
    );
    expect(classNameErrors.length).toBe(0);
  });
});
