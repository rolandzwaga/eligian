/**
 * Integration Tests: Timeline Container CSS Validation (Feature 013 extension)
 *
 * Tests CSS registry validation for timeline container selectors:
 * - Container selector classes must exist in imported CSS
 * - Container selector IDs must exist in imported CSS
 * - Provides "Did you mean?" suggestions for typos
 * - Validates complex selectors with multiple classes
 *
 * Per Constitution Principle II: Integration tests MUST be isolated in separate files.
 */

import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { beforeEach, describe, expect, test } from 'vitest';
import { createEligianServices } from '../eligian-module.js';
import type { Program } from '../generated/ast.js';
import { DiagnosticSeverity } from './test-helpers.js';

describe('Timeline Container CSS Validation (Integration)', () => {
  const services = createEligianServices(EmptyFileSystem).Eligian;
  const parse = parseHelper<Program>(services);

  // Helper to parse and validate DSL code
  async function parseAndValidate(code: string) {
    const document = await parse(code);
    await services.shared.workspace.DocumentBuilder.build([document], { validation: true });

    return {
      document,
      program: document.parseResult.value,
      diagnostics: document.diagnostics ?? [],
      validationErrors:
        document.diagnostics?.filter(d => d.severity === DiagnosticSeverity.Error) ?? [],
      validationWarnings:
        document.diagnostics?.filter(d => d.severity === DiagnosticSeverity.Warning) ?? [],
    };
  }

  beforeEach(() => {
    // Clear CSS registry before each test (per isolation requirement)
    const cssRegistry = services.css.CSSRegistry;
    cssRegistry.clearAll();
  });

  // Note: Tests for unknown classes/IDs are covered by existing CSS selector validation tests
  // This test suite focuses on validating that timeline container selectors receive the same validation

  // Test 1: Timeline container with valid CSS class
  test('should NOT error on timeline container with valid CSS class', async () => {
    // Register CSS metadata manually
    const cssRegistry = services.css.CSSRegistry;
    const cssFileUri = 'file:///__fixtures__/css/test.css';
    cssRegistry.updateCSSFile(cssFileUri, {
      classes: new Set(['app-container']),
      ids: new Set(['box']),
      classLocations: new Map([
        [
          'app-container',
          { filePath: cssFileUri, startLine: 1, startColumn: 1, endLine: 1, endColumn: 25 },
        ],
      ]),
      idLocations: new Map([
        ['box', { filePath: cssFileUri, startLine: 2, startColumn: 1, endLine: 2, endColumn: 15 }],
      ]),
      classRules: new Map([['app-container', '.app-container { }']]),
      idRules: new Map([['box', '#box { }']]),
      errors: [],
    });

    const code = `
      styles "./__fixtures__/css/test.css"

      action testAction() [
        selectElement("#box")
      ]

      timeline "Test" in ".app-container" using raf {
        at 0s..5s testAction()
      }
    `;

    const { validationErrors } = await parseAndValidate(code);

    const cssErrors = validationErrors.filter(
      e =>
        e.data?.code === 'unknown_css_class_in_selector' ||
        e.data?.code === 'unknown_css_id_in_selector'
    );
    expect(cssErrors.length).toBe(0);
  });

  // Test 2: Timeline container with valid CSS ID
  test('should NOT error on timeline container with valid CSS ID', async () => {
    // Register CSS metadata manually
    const cssRegistry = services.css.CSSRegistry;
    const cssFileUri = 'file:///__fixtures__/css/test.css';
    cssRegistry.updateCSSFile(cssFileUri, {
      classes: new Set(),
      ids: new Set(['app', 'box']),
      classLocations: new Map(),
      idLocations: new Map([
        ['app', { filePath: cssFileUri, startLine: 1, startColumn: 1, endLine: 1, endColumn: 15 }],
        ['box', { filePath: cssFileUri, startLine: 2, startColumn: 1, endLine: 2, endColumn: 15 }],
      ]),
      classRules: new Map(),
      idRules: new Map([
        ['app', '#app { }'],
        ['box', '#box { }'],
      ]),
      errors: [],
    });

    const code = `
      styles "./__fixtures__/css/test.css"

      action testAction() [
        selectElement("#box")
      ]

      timeline "Test" in "#app" using raf {
        at 0s..5s testAction()
      }
    `;

    const { validationErrors } = await parseAndValidate(code);

    const cssErrors = validationErrors.filter(
      e =>
        e.data?.code === 'unknown_css_class_in_selector' ||
        e.data?.code === 'unknown_css_id_in_selector'
    );
    expect(cssErrors.length).toBe(0);
  });

  // Test 3: Timeline container with complex selector (multiple classes)
  test('should validate complex timeline container selector with multiple classes', async () => {
    // Register CSS metadata manually
    const cssRegistry = services.css.CSSRegistry;
    const cssFileUri = 'file:///__fixtures__/css/test.css';
    cssRegistry.updateCSSFile(cssFileUri, {
      classes: new Set(['container', 'primary']),
      ids: new Set(['box']),
      classLocations: new Map([
        [
          'container',
          { filePath: cssFileUri, startLine: 1, startColumn: 1, endLine: 1, endColumn: 20 },
        ],
        [
          'primary',
          { filePath: cssFileUri, startLine: 2, startColumn: 1, endLine: 2, endColumn: 18 },
        ],
      ]),
      idLocations: new Map([
        ['box', { filePath: cssFileUri, startLine: 3, startColumn: 1, endLine: 3, endColumn: 15 }],
      ]),
      classRules: new Map([
        ['container', '.container { }'],
        ['primary', '.primary { }'],
      ]),
      idRules: new Map([['box', '#box { }']]),
      errors: [],
    });

    const code = `
      styles "./__fixtures__/css/test.css"

      action testAction() [
        selectElement("#box")
      ]

      timeline "Test" in ".container.primary" using raf {
        at 0s..5s testAction()
      }
    `;

    const { validationErrors } = await parseAndValidate(code);

    const cssErrors = validationErrors.filter(
      e =>
        e.data?.code === 'unknown_css_class_in_selector' ||
        e.data?.code === 'unknown_css_id_in_selector'
    );
    expect(cssErrors.length).toBe(0);
  });

  // Test 4: Error when no CSS imported - all classes are invalid
  test('should error when no CSS is imported (no valid classes exist)', async () => {
    const code = `
      action testAction() [
        selectElement("#box")
      ]

      timeline "Test" in ".container" using raf {
        at 0s..5s testAction()
      }
    `;

    const { validationErrors } = await parseAndValidate(code);

    // Should error on both timeline container selector AND operation selector
    const cssErrors = validationErrors.filter(
      e =>
        e.data?.code === 'unknown_css_class_in_selector' ||
        e.data?.code === 'unknown_css_id_in_selector'
    );
    // At minimum, should error on timeline container (.container) and operation selector (#box)
    expect(cssErrors.length).toBeGreaterThanOrEqual(2);

    // Check timeline container error
    const timelineError = cssErrors.find(e => e.message.includes('container'));
    expect(timelineError).toBeDefined();

    // Check operation selector error
    const operationError = cssErrors.find(e => e.message.includes('box'));
    expect(operationError).toBeDefined();
  });
});
