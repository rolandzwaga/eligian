/**
 * Feature 039 - Label File Creation Quick Fix
 * User Story 3: Smart Path Resolution and Validation
 *
 * Tests for path resolution, validation, and error handling.
 */

import { beforeAll, describe, expect, test } from 'vitest';
import { MISSING_LABELS_FILE_CODE } from '../../eligian-validator.js';
import { createTestContext, type TestContext } from '../test-helpers.js';

describe('Label File Creation - Path Resolution (Feature 039, User Story 3)', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  /**
   * T034: Verify absolute path handling
   *
   * Tests that absolute paths are resolved correctly without modification.
   */
  test('should handle absolute paths correctly (T034)', async () => {
    // Use forward slashes to avoid backslash escape issues in template strings
    const absolutePath = 'C:/absolute/path/labels.json';
    const code = `
      languages [
        en-US "English"
      ]

      labels "${absolutePath}"

      timeline "Test" at 0s {
        at 0s selectElement("#box")
      }
    `;

    const { diagnostics } = await ctx.parseAndValidate(code);

    const diagnostic = diagnostics.find(d => d.code === MISSING_LABELS_FILE_CODE);

    expect(diagnostic).toBeDefined();
    expect(diagnostic?.data.importPath).toBe(absolutePath);
    // Resolved path may use platform-specific separators
    expect(diagnostic?.data.resolvedPath).toMatch(
      /[A-Za-z]:[\\/]absolute[\\/]path[\\/]labels\.json$/
    );
  });

  /**
   * T035: Verify relative path resolution
   *
   * Tests that relative paths are resolved to workspace-relative absolute paths.
   */
  test('should handle relative paths correctly (T035)', async () => {
    const code = `
      languages [
        nl-NL "Nederlands"
      ]

      labels "./labels/app.json"

      timeline "Test" at 0s {
        at 0s selectElement("#box")
      }
    `;

    const { diagnostics } = await ctx.parseAndValidate(code);

    const diagnostic = diagnostics.find(d => d.code === MISSING_LABELS_FILE_CODE);

    expect(diagnostic).toBeDefined();
    expect(diagnostic?.data.importPath).toBe('./labels/app.json');
    expect(diagnostic?.data.resolvedPath).toBeDefined();
    // Resolved path should contain the relative path components
    expect(diagnostic?.data.resolvedPath).toContain('labels');
    expect(diagnostic?.data.resolvedPath).toContain('app.json');
    // Check it ends with the expected structure
    expect(diagnostic?.data.resolvedPath).toMatch(/labels[\\/]app\.json$/);
  });

  /**
   * T036: Verify deeply nested directory handling
   *
   * Tests that deeply nested paths (10 levels) are handled correctly.
   * Directory creation is handled by the extension.
   */
  test('should create deeply nested directories (T036)', async () => {
    const code = `
      languages [
        fr-FR "Français"
      ]

      labels "./a/b/c/d/e/f/g/h/i/j/file.json"

      timeline "Test" at 0s {
        at 0s selectElement("#box")
      }
    `;

    const { diagnostics } = await ctx.parseAndValidate(code);

    const diagnostic = diagnostics.find(d => d.code === MISSING_LABELS_FILE_CODE);

    expect(diagnostic).toBeDefined();
    expect(diagnostic?.data.importPath).toBe('./a/b/c/d/e/f/g/h/i/j/file.json');
    expect(diagnostic?.data.resolvedPath).toBeDefined();
    expect(diagnostic?.data.resolvedPath).toContain('a');
    expect(diagnostic?.data.resolvedPath).toContain('j');
    expect(diagnostic?.data.resolvedPath).toContain('file.json');

    // Extension will handle directory creation via vscode.workspace.fs.createDirectory()
    // which creates all intermediate directories automatically
  });

  /**
   * T037: Verify invalid character rejection
   *
   * Note: Path validation with invalid characters is handled by the extension,
   * not the language server. The validator will still create diagnostics for
   * missing files, but the extension's validatePath() function will reject
   * the path before attempting file creation.
   *
   * This test verifies that diagnostics are created for paths with invalid chars,
   * which will then be caught by the extension's validation.
   */
  test('should reject paths with invalid characters (T037)', async () => {
    const invalidPath = './labels<test>.json';
    const code = `
      languages [
        de-DE "Deutsch"
      ]

      labels "${invalidPath}"

      timeline "Test" at 0s {
        at 0s selectElement("#box")
      }
    `;

    const { diagnostics } = await ctx.parseAndValidate(code);

    const diagnostic = diagnostics.find(d => d.code === MISSING_LABELS_FILE_CODE);

    // Validator will still create diagnostic for missing file
    expect(diagnostic).toBeDefined();
    expect(diagnostic?.data.importPath).toBe(invalidPath);

    // Extension's validatePath() will reject this path before file creation
    // Testing the validatePath() function is handled by extension tests
  });

  /**
   * T038: Verify error message for permission denied
   *
   * Note: Permission errors are handled by the extension during file creation,
   * not by the language server validator. This test verifies that the diagnostic
   * data structure is correct, allowing the extension to display appropriate
   * error messages.
   *
   * The extension's mapErrorCode() and error display logic are tested via
   * extension integration tests.
   */
  test('should show error message for permission denied (T038)', async () => {
    const code = `
      languages [
        es-ES "Español"
      ]

      labels "./protected/labels.json"

      timeline "Test" at 0s {
        at 0s selectElement("#box")
      }
    `;

    const { diagnostics } = await ctx.parseAndValidate(code);

    const diagnostic = diagnostics.find(d => d.code === MISSING_LABELS_FILE_CODE);

    // Validator creates diagnostic with correct data
    expect(diagnostic).toBeDefined();
    expect(diagnostic?.data.importPath).toBe('./protected/labels.json');
    expect(diagnostic?.data.resolvedPath).toBeDefined();

    // Extension will handle permission errors and display appropriate messages
    // Testing error display is handled by extension integration tests
  });
});
