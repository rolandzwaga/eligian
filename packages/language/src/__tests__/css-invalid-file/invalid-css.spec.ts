/**
 * T025 [US4] Integration tests for invalid CSS file handling
 *
 * Tests that CSS files with syntax errors are handled gracefully:
 * - Error shown at CSS import statement
 * - Classes from invalid CSS are not available
 * - Fixing CSS file makes classes available again
 * - Multiple CSS files where one is invalid (valid files still work)
 */

import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { describe, expect, it } from 'vitest';
import { createEligianServices } from '../../eligian-module.js';
import type { Program } from '../../generated/ast.js';

const services = createEligianServices(EmptyFileSystem).Eligian;
const parse = parseHelper<Program>(services);

/**
 * Helper to parse and validate an Eligian document.
 * CRITICAL: Must trigger validation phase explicitly.
 */
async function parseAndValidate(code: string) {
  const document = await parse(code);
  // CRITICAL: Trigger validation phase
  await services.shared.workspace.DocumentBuilder.build([document], { validation: true });
  const validationErrors = document.diagnostics ?? [];
  return { document, validationErrors };
}

describe('Invalid CSS File Handling (T025)', () => {
  it('should show error when importing CSS file with syntax errors', async () => {
    // Register invalid CSS file in registry
    // NOTE: CSS files are stored with the same path as used in import statements
    const cssRegistry = services.css.CSSRegistry;
    cssRegistry.updateCSSFile('./styles.css', {
      classes: new Set(),
      ids: new Set(),
      classLocations: new Map(),
      idLocations: new Map(),
      classRules: new Map(),
      idRules: new Map(),
      errors: [
        {
          message: 'Unclosed block',
          filePath: './styles.css',
          line: 5,
          column: 10,
        },
      ],
    });

    const code = `
      styles "./styles.css"

      timeline "Test" at 0s {
        at 0s selectElement("#test")
      }
    `;

    const { validationErrors } = await parseAndValidate(code);

    // Should have error at CSS import statement
    const cssFileErrors = validationErrors.filter(e => e.code === 'invalid_css_file');
    expect(cssFileErrors.length).toBeGreaterThan(0);
    expect(cssFileErrors[0].message).toContain('syntax errors');
    expect(cssFileErrors[0].message).toContain('line 5');
    expect(cssFileErrors[0].message).toContain('column 10');
  });

  it('should indicate CSS file is invalid rather than "unknown class"', async () => {
    // Register invalid CSS file
    const cssRegistry = services.css.CSSRegistry;
    cssRegistry.updateCSSFile('./broken.css', {
      classes: new Set(), // No classes available due to syntax error
      ids: new Set(),
      classLocations: new Map(),
      idLocations: new Map(),
      classRules: new Map(),
      idRules: new Map(),
      errors: [
        {
          message: 'Unclosed comment',
          filePath: './broken.css',
          line: 1,
          column: 1,
        },
      ],
    });

    const code = `
      styles "./broken.css"

      timeline "Test" at 0s {
        at 0s selectElement("#test") {
          addClass("button")
        }
      }
    `;

    const { validationErrors } = await parseAndValidate(code);

    // Should show CSS file error, not unknown class error
    const cssFileErrors = validationErrors.filter(e => e.code === 'invalid_css_file');
    expect(cssFileErrors.length).toBeGreaterThan(0);
  });

  it('should make classes available after CSS file is fixed', async () => {
    const cssRegistry = services.css.CSSRegistry;

    // Initial state: CSS file has errors
    cssRegistry.updateCSSFile('./styles.css', {
      classes: new Set(),
      ids: new Set(),
      classLocations: new Map(),
      idLocations: new Map(),
      classRules: new Map(),
      idRules: new Map(),
      errors: [
        {
          message: 'Unclosed block',
          filePath: './styles.css',
          line: 1,
          column: 1,
        },
      ],
    });

    const code = `
      styles "./styles.css"

      timeline "Test" at 0s {
        at 0s selectElement("#test") {
          addClass("button")
        }
      }
    `;

    const { document, validationErrors: errors1 } = await parseAndValidate(code);

    // Should have CSS file error
    const cssFileErrors1 = errors1.filter(e => e.code === 'invalid_css_file');
    expect(cssFileErrors1.length).toBeGreaterThan(0);

    // Fix CSS file - update registry with valid CSS
    cssRegistry.updateCSSFile('./styles.css', {
      classes: new Set(['button']),
      ids: new Set(),
      classLocations: new Map([
        [
          'button',
          {
            filePath: './styles.css',
            startLine: 1,
            startColumn: 1,
            endLine: 1,
            endColumn: 20,
          },
        ],
      ]),
      idLocations: new Map(),
      classRules: new Map([['button', '.button { color: blue; }']]),
      idRules: new Map(),
      errors: [], // No errors
    });

    // Re-validate document
    await services.shared.workspace.DocumentBuilder.build([document], { validation: true });
    const errors2 = document.diagnostics ?? [];

    // CSS file error should disappear
    const cssFileErrors2 = errors2.filter(e => e.code === 'invalid_css_file');
    expect(cssFileErrors2.length).toBe(0);

    // Class should be available (no unknown class error)
    const unknownClassErrors = errors2.filter(e => e.code === 'unknown_css_class');
    expect(unknownClassErrors.length).toBe(0);
  });

  it('should handle multiple CSS files where one is invalid', async () => {
    const cssRegistry = services.css.CSSRegistry;

    // Valid CSS file
    cssRegistry.updateCSSFile('./valid.css', {
      classes: new Set(['valid-class']),
      ids: new Set(),
      classLocations: new Map([
        [
          'valid-class',
          {
            filePath: './valid.css',
            startLine: 1,
            startColumn: 1,
            endLine: 1,
            endColumn: 20,
          },
        ],
      ]),
      idLocations: new Map(),
      classRules: new Map([['valid-class', '.valid-class { color: blue; }']]),
      idRules: new Map(),
      errors: [],
    });

    // Invalid CSS file
    cssRegistry.updateCSSFile('./invalid.css', {
      classes: new Set(),
      ids: new Set(),
      classLocations: new Map(),
      idLocations: new Map(),
      classRules: new Map(),
      idRules: new Map(),
      errors: [
        {
          message: 'Unclosed brace',
          filePath: './invalid.css',
          line: 3,
          column: 5,
        },
      ],
    });

    const code = `
      styles "./valid.css"
      styles "./invalid.css"

      timeline "Test" at 0s {
        at 0s selectElement("#test") {
          addClass("valid-class")
        }
      }
    `;

    const { validationErrors } = await parseAndValidate(code);

    // Should have error for invalid CSS file
    const cssFileErrors = validationErrors.filter(e => e.code === 'invalid_css_file');
    expect(cssFileErrors.length).toBe(1);
    expect(cssFileErrors[0].message).toContain('invalid.css');

    // Should NOT have unknown class error for valid-class
    const unknownClassErrors = validationErrors.filter(
      e => e.code === 'unknown_css_class' && e.message.includes('valid-class')
    );
    expect(unknownClassErrors.length).toBe(0);
  });

  it('should handle multiple invalid CSS files', async () => {
    const cssRegistry = services.css.CSSRegistry;

    // First invalid CSS file
    cssRegistry.updateCSSFile('./broken1.css', {
      classes: new Set(),
      ids: new Set(),
      classLocations: new Map(),
      idLocations: new Map(),
      classRules: new Map(),
      idRules: new Map(),
      errors: [
        {
          message: 'Unclosed block',
          filePath: './broken1.css',
          line: 1,
          column: 1,
        },
      ],
    });

    // Second invalid CSS file
    cssRegistry.updateCSSFile('./broken2.css', {
      classes: new Set(),
      ids: new Set(),
      classLocations: new Map(),
      idLocations: new Map(),
      classRules: new Map(),
      idRules: new Map(),
      errors: [
        {
          message: 'Unclosed comment',
          filePath: './broken2.css',
          line: 5,
          column: 10,
        },
      ],
    });

    const code = `
      styles "./broken1.css"
      styles "./broken2.css"

      timeline "Test" at 0s {
        at 0s selectElement("#test")
      }
    `;

    const { validationErrors } = await parseAndValidate(code);

    // Should have errors for both CSS files
    const cssFileErrors = validationErrors.filter(e => e.code === 'invalid_css_file');
    expect(cssFileErrors.length).toBe(2);

    // Check both errors are present
    const broken1Error = cssFileErrors.find(e => e.message.includes('broken1.css'));
    const broken2Error = cssFileErrors.find(e => e.message.includes('broken2.css'));
    expect(broken1Error).toBeDefined();
    expect(broken2Error).toBeDefined();
  });

  it('should include error details from CSS parser in message', async () => {
    const cssRegistry = services.css.CSSRegistry;

    cssRegistry.updateCSSFile('./styles.css', {
      classes: new Set(),
      ids: new Set(),
      classLocations: new Map(),
      idLocations: new Map(),
      classRules: new Map(),
      idRules: new Map(),
      errors: [
        {
          message: 'Unclosed block at end of file',
          filePath: './styles.css',
          line: 10,
          column: 5,
        },
      ],
    });

    const code = `
      styles "./styles.css"

      timeline "Test" at 0s {
        at 0s selectElement("#test")
      }
    `;

    const { validationErrors } = await parseAndValidate(code);

    const cssFileErrors = validationErrors.filter(e => e.code === 'invalid_css_file');
    expect(cssFileErrors.length).toBe(1);

    // Error message should include line, column, and original error message
    expect(cssFileErrors[0].message).toContain('line 10');
    expect(cssFileErrors[0].message).toContain('column 5');
    expect(cssFileErrors[0].message).toContain('Unclosed block');
  });
});
