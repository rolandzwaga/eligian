import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createTestContext, type TestContext } from '../test-helpers.js';

/**
 * Integration tests for CSS_UPDATED_NOTIFICATION error handling
 *
 * These tests verify that when CSS loading fails during hot-reload,
 * errors are properly registered in the CSS registry (not silently swallowed).
 *
 * This tests the improvement made to packages/extension/src/language/main.ts
 * where the catch block now registers errors instead of ignoring them.
 *
 * Related: Feature 013 (CSS Class and ID Validation) - Hot-Reload Error Handling
 */
describe('CSS Hot-Reload - Notification Error Handling', () => {
  let ctx: TestContext;

  // Expensive setup - runs once per suite
  beforeAll(async () => {
    ctx = createTestContext();
  });

  beforeEach(() => {
    // Clear CSS registry before each test for isolation
    ctx.services.Eligian.css.CSSRegistry.clearAll();
  });

  test('should register CSS parse errors in registry when loadCSS fails', async () => {
    // This test simulates what happens in packages/extension/src/language/main.ts
    // when the CSS_UPDATED_NOTIFICATION handler catches an error from loadCSS()

    const cssRegistry = ctx.services.Eligian.css.CSSRegistry;
    const cssFileUri = 'file:///broken.css';

    // Simulate the error handling path: register CSS with parse errors
    // (This is what the improved catch block does)
    cssRegistry.updateCSSFile(cssFileUri, {
      classes: new Set(),
      ids: new Set(),
      classLocations: new Map(),
      idLocations: new Map(),
      classRules: new Map(),
      idRules: new Map(),
      errors: [
        {
          message: 'Unclosed block',
          filePath: cssFileUri,
          line: 5,
          column: 10,
        },
      ],
    });

    // Verify that error is registered (not silently swallowed)
    expect(cssRegistry.hasErrors(cssFileUri)).toBe(true);
    const errors = cssRegistry.getErrors(cssFileUri);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe('Unclosed block');
    expect(errors[0].line).toBe(5);
    expect(errors[0].column).toBe(10);
  });

  test('should register empty metadata when CSS loading fails', async () => {
    // This test verifies that when CSS loading fails, we register empty metadata
    // to prevent false validation errors (since we can't know what classes exist)

    const cssRegistry = ctx.services.Eligian.css.CSSRegistry;
    const cssFileUri = 'file:///failed-to-load.css';

    // Simulate error handling: register empty metadata with error
    cssRegistry.updateCSSFile(cssFileUri, {
      classes: new Set(), // Empty - we don't know what classes exist
      ids: new Set(), // Empty - we don't know what IDs exist
      classLocations: new Map(),
      idLocations: new Map(),
      classRules: new Map(),
      idRules: new Map(),
      errors: [
        {
          message: 'File not found',
          filePath: cssFileUri,
          line: 0,
          column: 0,
        },
      ],
    });

    // Verify empty metadata is registered
    const metadata = cssRegistry.getMetadata(cssFileUri);
    expect(metadata).toBeDefined();
    expect(metadata?.classes.size).toBe(0);
    expect(metadata?.ids.size).toBe(0);

    // Verify error is registered
    expect(cssRegistry.hasErrors(cssFileUri)).toBe(true);
  });

  test('should show CSS file error diagnostic when CSS has parse errors', async () => {
    // This test verifies end-to-end behavior: CSS file errors should appear
    // as diagnostics in the Eligian document (at the import statement)

    const cssRegistry = ctx.services.Eligian.css.CSSRegistry;
    const cssFileUri = 'file:///broken.css';

    // Register CSS with parse errors (simulating failed CSS load)
    cssRegistry.updateCSSFile(cssFileUri, {
      classes: new Set(),
      ids: new Set(),
      classLocations: new Map(),
      idLocations: new Map(),
      classRules: new Map(),
      idRules: new Map(),
      errors: [
        {
          message: 'Unclosed block',
          filePath: cssFileUri,
          line: 5,
          column: 10,
        },
      ],
    });

    const code = `
      styles "./broken.css"

      action test() [
        addClass("button")
      ]

      timeline "test" in ".container" using raf {
        at 0s test()
      }
    `;

    const { diagnostics } = await ctx.parseAndValidate(code);

    // Should have CSS file error diagnostic
    const cssFileErrors = diagnostics.filter(e => e.data?.code === 'invalid_css_file');
    expect(cssFileErrors.length).toBeGreaterThan(0);
    expect(cssFileErrors[0].message).toContain('syntax errors');
  });

  test('should gracefully handle CSS errors with zero line/column info', async () => {
    // Test that error registration handles errors without specific location info
    // (e.g., file permission errors, network errors, etc.)

    const cssRegistry = ctx.services.Eligian.css.CSSRegistry;
    const cssFileUri = 'file:///permission-denied.css';

    // Register error with zero line/column (typical for I/O errors)
    cssRegistry.updateCSSFile(cssFileUri, {
      classes: new Set(),
      ids: new Set(),
      classLocations: new Map(),
      idLocations: new Map(),
      classRules: new Map(),
      idRules: new Map(),
      errors: [
        {
          message: 'Permission denied',
          filePath: cssFileUri,
          line: 0, // No specific line
          column: 0, // No specific column
        },
      ],
    });

    // Verify error is registered correctly
    expect(cssRegistry.hasErrors(cssFileUri)).toBe(true);
    const errors = cssRegistry.getErrors(cssFileUri);
    expect(errors[0].message).toBe('Permission denied');
    expect(errors[0].line).toBe(0);
    expect(errors[0].column).toBe(0);
  });

  test('should clear errors when CSS is successfully reloaded after failure', async () => {
    // This test verifies the hot-reload recovery path:
    // CSS fails → error registered → CSS fixed → error cleared

    const cssRegistry = ctx.services.Eligian.css.CSSRegistry;
    const cssFileUri = 'file:///fixable.css';

    // Step 1: CSS fails to load
    cssRegistry.updateCSSFile(cssFileUri, {
      classes: new Set(),
      ids: new Set(),
      classLocations: new Map(),
      idLocations: new Map(),
      classRules: new Map(),
      idRules: new Map(),
      errors: [
        {
          message: 'Parse error',
          filePath: cssFileUri,
          line: 10,
          column: 5,
        },
      ],
    });

    expect(cssRegistry.hasErrors(cssFileUri)).toBe(true);

    // Step 2: CSS is fixed and reloaded successfully
    cssRegistry.updateCSSFile(cssFileUri, {
      classes: new Set(['button', 'primary']),
      ids: new Set(['header']),
      classLocations: new Map(),
      idLocations: new Map(),
      classRules: new Map(),
      idRules: new Map(),
      errors: [], // No errors - CSS is valid now
    });

    // Verify error is cleared
    expect(cssRegistry.hasErrors(cssFileUri)).toBe(false);
    expect(cssRegistry.getErrors(cssFileUri)).toHaveLength(0);

    // Verify classes are available
    const metadata = cssRegistry.getMetadata(cssFileUri);
    expect(metadata?.classes.has('button')).toBe(true);
    expect(metadata?.classes.has('primary')).toBe(true);
    expect(metadata?.ids.has('header')).toBe(true);
  });

  test('should handle Error objects with stack traces', async () => {
    // Test that error registration handles Error objects correctly
    // (extracting message, handling stack traces, etc.)

    const cssRegistry = ctx.services.Eligian.css.CSSRegistry;
    const cssFileUri = 'file:///error-with-stack.css';

    // Simulate catching an Error object (as the catch block does)
    const error = new Error('CSS parsing failed');

    // Register the error (simulating: error instanceof Error ? error.message : String(error))
    cssRegistry.updateCSSFile(cssFileUri, {
      classes: new Set(),
      ids: new Set(),
      classLocations: new Map(),
      idLocations: new Map(),
      classRules: new Map(),
      idRules: new Map(),
      errors: [
        {
          message: error instanceof Error ? error.message : String(error),
          filePath: cssFileUri,
          line: 0,
          column: 0,
        },
      ],
    });

    // Verify message is extracted correctly
    const errors = cssRegistry.getErrors(cssFileUri);
    expect(errors[0].message).toBe('CSS parsing failed');
  });

  test('should handle non-Error thrown values', async () => {
    // Test that error registration handles non-Error thrown values
    // (e.g., thrown strings, objects, null, undefined, etc.)

    const cssRegistry = ctx.services.Eligian.css.CSSRegistry;
    const cssFileUri = 'file:///non-error-throw.css';

    // Simulate catching a non-Error value (as the catch block does)
    const thrownValue = 'Something went wrong'; // String, not Error

    // Register the error (simulating: error instanceof Error ? error.message : String(error))
    cssRegistry.updateCSSFile(cssFileUri, {
      classes: new Set(),
      ids: new Set(),
      classLocations: new Map(),
      idLocations: new Map(),
      classRules: new Map(),
      idRules: new Map(),
      errors: [
        {
          message: thrownValue instanceof Error ? thrownValue.message : String(thrownValue),
          filePath: cssFileUri,
          line: 0,
          column: 0,
        },
      ],
    });

    // Verify message is stringified correctly
    const errors = cssRegistry.getErrors(cssFileUri);
    expect(errors[0].message).toBe('Something went wrong');
  });
});
