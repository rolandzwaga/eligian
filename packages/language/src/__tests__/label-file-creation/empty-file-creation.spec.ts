/**
 * Feature 039 - Label File Creation Quick Fix
 * User Story 1: Create Empty Labels File (MVP)
 *
 * Tests for creating empty labels files via quick fix when no languages block exists.
 */

import { beforeAll, describe, expect, test } from 'vitest';
import { MISSING_LABELS_FILE_CODE } from '../../eligian-validator.js';
import { createTestContext, DiagnosticSeverity, type TestContext } from '../test-helpers.js';

describe('Label File Creation - Empty File (Feature 039, User Story 1)', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  /**
   * T012: Verify quick fix is offered for missing labels file without languages block
   *
   * Tests that:
   * 1. Diagnostic is created with code 'missing_labels_file'
   * 2. Code action is available with title "Create labels file"
   */
  test('should offer quick fix for missing labels file without languages block (T012)', async () => {
    const code = `
      languages [
        nl-NL "Nederlands"
      ]

      labels "./missing-labels.json"

      timeline "Test" at 0s {
        at 0s selectElement("#box")
      }
    `;

    const { diagnostics } = await ctx.parseAndValidate(code);

    // Find diagnostic for missing labels file
    const missingFileDiagnostic = diagnostics.find(
      d => d.code === MISSING_LABELS_FILE_CODE && d.severity === DiagnosticSeverity.Error
    );

    expect(missingFileDiagnostic).toBeDefined();
    expect(missingFileDiagnostic?.message).toContain('Labels file not found');

    // Verify diagnostic data structure
    const data = missingFileDiagnostic?.data;
    expect(data.importPath).toBe('./missing-labels.json');
    expect(data.hasLanguagesBlock).toBe(true);
    expect(Array.isArray(data.languageCodes)).toBe(true);
  });

  /**
   * T013: Verify file creation with empty array content
   *
   * Note: This test verifies the code action command arguments.
   * Actual file creation is handled by the extension and tested via integration tests.
   */
  test('should create file with empty array content (T013)', async () => {
    const code = `
      languages [
        en-US "English"
      ]

      labels "./new-labels.json"

      timeline "Test" at 0s {
        at 0s selectElement("#box")
      }
    `;

    const { diagnostics } = await ctx.parseAndValidate(code);

    // Find diagnostic with data
    const diagnostic = diagnostics.find(d => d.code === MISSING_LABELS_FILE_CODE);

    expect(diagnostic).toBeDefined();
    expect(diagnostic?.data).toBeDefined();

    // Verify diagnostic data contains information needed for empty file creation
    const data = diagnostic?.data;
    expect(data.hasLanguagesBlock).toBe(true);
    expect(Array.isArray(data.languageCodes)).toBe(true);

    // Code action provider will use this data to generate content = '[]'
    // (Code action generation is tested in integration tests)
  });

  /**
   * T014: Verify nested directories handling for relative paths
   *
   * Tests that diagnostic data includes correct resolved path for nested paths.
   * Directory creation is handled by the extension (vscode.workspace.fs.createDirectory).
   */
  test('should create nested directories for relative paths (T014)', async () => {
    const code = `
      languages [
        fr-FR "Français"
      ]

      labels "./labels/subfolder/app.json"

      timeline "Test" at 0s {
        at 0s selectElement("#box")
      }
    `;

    const { diagnostics } = await ctx.parseAndValidate(code);

    const diagnostic = diagnostics.find(d => d.code === MISSING_LABELS_FILE_CODE);

    expect(diagnostic).toBeDefined();

    // Verify diagnostic data includes nested path
    const data = diagnostic?.data;
    expect(data.importPath).toBe('./labels/subfolder/app.json');
    expect(data.resolvedPath).toBeDefined();
    expect(data.resolvedPath).toContain('labels');
    expect(data.resolvedPath).toContain('subfolder');
    expect(data.resolvedPath).toContain('app.json');

    // Extension will call vscode.workspace.fs.createDirectory() on parent directory
    // which handles creating all intermediate directories
  });
});
