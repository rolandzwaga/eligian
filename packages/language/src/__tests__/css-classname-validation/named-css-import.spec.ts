import { beforeAll, describe, expect, test } from 'vitest';
import {
  createTestContext,
  minimalProgram,
  setupCSSRegistry,
  type TestContext,
} from '../test-helpers.js';

/**
 * Audit finding #31: classes from named CSS imports are bundled into cssFiles
 * but were never registered for validation, giving false 'Unknown CSS class' errors.
 */
describe('CSS className validation - named CSS imports', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  const programWith = (importLine: string) =>
    `${importLine}\n${minimalProgram({ cssImport: false, actionBody: 'addClass("dark")' })}`;

  const unknownClassErrors = async (code: string) => {
    // Document URI is file:///1.eligian, so "./theme.css" resolves to file:///theme.css
    const { errors } = await ctx.parseAndValidate(code, 'file:///unrelated.css');
    return errors.filter(
      e => e.message.includes('Unknown CSS class') && e.message.includes("'dark'")
    );
  };

  test('named import with inferred css type registers its classes', async () => {
    setupCSSRegistry(ctx, 'file:///theme.css', { classes: ['dark'], ids: [] });
    expect(await unknownClassErrors(programWith('import theme from "./theme.css"'))).toHaveLength(
      0
    );
  });

  test('named import with explicit "as css" registers its classes', async () => {
    setupCSSRegistry(ctx, 'file:///theme.css', { classes: ['dark'], ids: [] });
    expect(
      await unknownClassErrors(programWith('import theme from "./theme.css" as css'))
    ).toHaveLength(0);
  });

  test('non-css named imports do not register css and still report unknown classes', async () => {
    setupCSSRegistry(ctx, 'file:///layout.html', { classes: ['dark'], ids: [] });
    expect(
      (await unknownClassErrors(programWith('import page from "./layout.html"'))).length
    ).toBeGreaterThan(0);
  });
});
