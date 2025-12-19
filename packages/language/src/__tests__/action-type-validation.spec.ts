import { beforeAll, describe, expect, test } from 'vitest';
import { createTestContext, type TestContext } from './test-helpers.js';

describe('Action Call Type Validation', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  test('should validate action call argument types', async () => {
    const document = await ctx.parse(`
      action test(name: string) [
        selectElement(name)
      ]

      timeline "t" in "#c" using raf {
        at 0s..1s test("hello")
        at 1s..2s test(123)
      }
    `);

    // Check for parsing errors
    expect(document.parseResult.lexerErrors).toHaveLength(0);
    expect(document.parseResult.parserErrors).toHaveLength(0);

    // Build the document (this triggers validation)
    await ctx.services.shared.workspace.DocumentBuilder.build([document]);

    // Get validation diagnostics
    const diagnostics =
      await ctx.services.Eligian.validation.DocumentValidator.validateDocument(document);

    // Filter for type-related errors (excluding CSS validation errors)
    const typeErrors = diagnostics.filter(
      d =>
        (d.message.includes('type') ||
          d.message.includes('number') ||
          d.message.includes('string') ||
          d.message.includes('match')) &&
        !d.message.includes('CSS')
    );

    // We expect at least one type error for test(123) - parameter type mismatch
    // The Typir type system (Feature 021) catches this: number is not assignable to string
    expect(typeErrors.length).toBeGreaterThan(0);
    expect(typeErrors[0].message).toContain('number');
    expect(typeErrors[0].message).toContain('string');
  });

  // NOTE: Removed 2 tests that had no meaningful assertions:
  // - "should create function type for action with typed parameter" - only console.log, no expect()
  // - "should match action calls to function types" - assigned _typeErrors but never asserted
  // The test above already covers type validation (type mismatch detection).
});
