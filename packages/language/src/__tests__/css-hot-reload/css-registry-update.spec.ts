import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { beforeAll, describe, expect, test } from 'vitest';
import { createEligianServices } from '../../eligian-module.js';
import type { Program } from '../../generated/ast.js';

/**
 * Integration tests for CSS hot-reload validation
 *
 * These tests verify that validation updates correctly when the CSS registry
 * is updated (simulating CSS file changes detected by the file watcher).
 *
 * User Story 3: Real-time Validation on CSS File Changes
 * Feature 013 (CSS Class and ID Validation)
 */
describe('CSS Hot-Reload - Registry Update Validation', () => {
  let services: ReturnType<typeof createEligianServices>;
  let parse: ReturnType<typeof parseHelper<Program>>;

  beforeAll(async () => {
    services = createEligianServices(EmptyFileSystem);
    parse = parseHelper<Program>(services.Eligian);
  });

  async function parseAndValidate(code: string) {
    const document = await parse(code);
    // CRITICAL: Trigger validation phase
    await services.shared.workspace.DocumentBuilder.build([document], { validation: true });
    const validationErrors = document.diagnostics ?? [];
    return { document, validationErrors };
  }

  test('should show error before CSS update, no error after CSS update (className)', async () => {
    // Setup: Register CSS with only 'button' class
    const cssRegistry = services.Eligian.css.CSSRegistry;
    cssRegistry.updateCSSFile('./styles.css', {
      classes: new Set(['button']),
      ids: new Set(),
      classLocations: new Map(),
      idLocations: new Map(),
      classRules: new Map(),
      idRules: new Map(),
      errors: [],
    });

    const code = `
      styles "./styles.css"

      action test() [
        addClass("new-class")
      ]

      timeline "test" in ".container" using raf {
        at 0s test()
      }
    `;

    // First validation: should have error for 'new-class'
    const { document, validationErrors: errors1 } = await parseAndValidate(code);
    const unknownClassErrors1 = errors1.filter(e => e.data?.code === 'unknown_css_class');
    expect(unknownClassErrors1.length).toBeGreaterThan(0);
    expect(unknownClassErrors1[0].message).toContain('new-class');

    // Simulate CSS file update: add 'new-class'
    cssRegistry.updateCSSFile('./styles.css', {
      classes: new Set(['button', 'new-class']),
      ids: new Set(),
      classLocations: new Map(),
      idLocations: new Map(),
      classRules: new Map(),
      idRules: new Map(),
      errors: [],
    });

    // Re-validate the same document
    await services.shared.workspace.DocumentBuilder.build([document], { validation: true });
    const errors2 = document.diagnostics ?? [];
    const unknownClassErrors2 = errors2.filter(e => e.code === 'unknown-css-class');

    // Error should disappear
    expect(unknownClassErrors2.length).toBe(0);
  });

  test('should show error after CSS update removes class (className)', async () => {
    // Setup: Register CSS with 'button' and 'primary' classes
    const cssRegistry = services.Eligian.css.CSSRegistry;
    cssRegistry.updateCSSFile('./styles.css', {
      classes: new Set(['button', 'primary']),
      ids: new Set(),
      classLocations: new Map(),
      idLocations: new Map(),
      classRules: new Map(),
      idRules: new Map(),
      errors: [],
    });

    const code = `
      styles "./styles.css"

      action test() [
        addClass("primary")
      ]

      timeline "test" in ".container" using raf {
        at 0s test()
      }
    `;

    // First validation: should have NO errors
    const { document, validationErrors: errors1 } = await parseAndValidate(code);
    const unknownClassErrors1 = errors1.filter(e => e.code === 'unknown-css-class');
    expect(unknownClassErrors1.length).toBe(0);

    // Simulate CSS file update: remove 'primary'
    cssRegistry.updateCSSFile('./styles.css', {
      classes: new Set(['button']),
      ids: new Set(),
      classLocations: new Map(),
      idLocations: new Map(),
      classRules: new Map(),
      idRules: new Map(),
      errors: [],
    });

    // Re-validate the same document
    await services.shared.workspace.DocumentBuilder.build([document], { validation: true });
    const errors2 = document.diagnostics ?? [];
    const unknownClassErrors2 = errors2.filter(e => e.data?.code === 'unknown_css_class');

    // Error should appear
    expect(unknownClassErrors2.length).toBeGreaterThan(0);
    expect(unknownClassErrors2[0].message).toContain('primary');
  });

  test('should show error before CSS update, no error after CSS update (selector)', async () => {
    // Setup: Register CSS with only '.button' class
    const cssRegistry = services.Eligian.css.CSSRegistry;
    cssRegistry.updateCSSFile('./styles.css', {
      classes: new Set(['button']),
      ids: new Set(),
      classLocations: new Map(),
      idLocations: new Map(),
      classRules: new Map(),
      idRules: new Map(),
      errors: [],
    });

    const code = `
      styles "./styles.css"

      action test() [
        selectElement(".button.primary")
      ]

      timeline "test" in ".container" using raf {
        at 0s test()
      }
    `;

    // First validation: should have error for 'primary' in selector
    const { document, validationErrors: errors1 } = await parseAndValidate(code);
    const unknownClassErrors1 = errors1.filter(
      e => e.message.includes('Unknown CSS class in selector') && e.message.includes('primary')
    );
    expect(unknownClassErrors1.length).toBeGreaterThan(0);

    // Simulate CSS file update: add 'primary'
    cssRegistry.updateCSSFile('./styles.css', {
      classes: new Set(['button', 'primary']),
      ids: new Set(),
      classLocations: new Map(),
      idLocations: new Map(),
      classRules: new Map(),
      idRules: new Map(),
      errors: [],
    });

    // Re-validate the same document
    await services.shared.workspace.DocumentBuilder.build([document], { validation: true });
    const errors2 = document.diagnostics ?? [];
    const unknownClassErrors2 = errors2.filter(e =>
      e.message.includes('Unknown CSS class in selector')
    );

    // Error should disappear
    expect(unknownClassErrors2.length).toBe(0);
  });

  test('should update validation for multiple documents importing same CSS', async () => {
    // Setup: Register CSS with only 'button' class
    const cssRegistry = services.Eligian.css.CSSRegistry;
    cssRegistry.updateCSSFile('./shared.css', {
      classes: new Set(['button']),
      ids: new Set(),
      classLocations: new Map(),
      idLocations: new Map(),
      classRules: new Map(),
      idRules: new Map(),
      errors: [],
    });

    const code1 = `
      styles "./shared.css"

      action test1() [
        addClass("primary")
      ]

      timeline "test1" in ".container" using raf {
        at 0s..1s test1()
      }
    `;

    const code2 = `
      styles "./shared.css"

      action test2() [
        addClass("primary")
      ]

      timeline "test2" in ".container" using raf {
        at 0s..1s test2()
      }
    `;

    // Parse and validate both documents
    const { document: doc1, validationErrors: errors1 } = await parseAndValidate(code1);
    const { document: doc2, validationErrors: errors2 } = await parseAndValidate(code2);

    // Both should have errors for 'primary'
    const unknownClass1 = errors1.filter(e => e.data?.code === 'unknown_css_class');
    const unknownClass2 = errors2.filter(e => e.data?.code === 'unknown_css_class');
    expect(unknownClass1.length).toBeGreaterThan(0);
    expect(unknownClass2.length).toBeGreaterThan(0);

    // Simulate CSS file update: add 'primary' to shared.css
    cssRegistry.updateCSSFile('./shared.css', {
      classes: new Set(['button', 'primary']),
      ids: new Set(),
      classLocations: new Map(),
      idLocations: new Map(),
      classRules: new Map(),
      idRules: new Map(),
      errors: [],
    });

    // Re-validate both documents
    await services.shared.workspace.DocumentBuilder.build([doc1], { validation: true });
    await services.shared.workspace.DocumentBuilder.build([doc2], { validation: true });

    // Both should have no errors now
    const errors1After = doc1.diagnostics?.filter(e => e.data?.code === 'unknown_css_class') ?? [];
    const errors2After = doc2.diagnostics?.filter(e => e.data?.code === 'unknown_css_class') ?? [];
    expect(errors1After.length).toBe(0);
    expect(errors2After.length).toBe(0);
  });

  // Feature 013 US4 T026: Invalid CSS validation implemented
  test('should show error when CSS has syntax errors', async () => {
    // Setup: Register CSS with parse errors
    const cssRegistry = services.Eligian.css.CSSRegistry;
    cssRegistry.updateCSSFile('./broken.css', {
      classes: new Set(), // No classes available when CSS has errors
      ids: new Set(),
      classLocations: new Map(),
      idLocations: new Map(),
      classRules: new Map(),
      idRules: new Map(),
      errors: [
        {
          line: 5,
          column: 10,
          message: 'Unclosed block',
          source: '.button { color: red',
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

    const { validationErrors } = await parseAndValidate(code);

    // Should have error about CSS file issues (at import statement)
    const cssFileErrors = validationErrors.filter(e => e.data?.code === 'invalid_css_file');
    expect(cssFileErrors.length).toBeGreaterThan(0);
    expect(cssFileErrors[0].message).toContain('syntax errors');
  });

  // Feature 013 US4 T026: Invalid CSS validation implemented
  test('should make classes available after CSS is fixed', async () => {
    // Setup: Register CSS with parse errors
    const cssRegistry = services.Eligian.css.CSSRegistry;
    cssRegistry.updateCSSFile('./fixable.css', {
      classes: new Set(),
      ids: new Set(),
      classLocations: new Map(),
      idLocations: new Map(),
      classRules: new Map(),
      idRules: new Map(),
      errors: [
        {
          line: 5,
          column: 10,
          message: 'Unclosed block',
          source: '.button { color: red',
        },
      ],
    });

    const code = `
      styles "./fixable.css"

      action test() [
        addClass("button")
      ]

      timeline "test" in ".container" using raf {
        at 0s test()
      }
    `;

    // First validation: should have CSS file error (not unknown class error)
    const { document, validationErrors: errors1 } = await parseAndValidate(code);
    const cssFileErrors1 = errors1.filter(e => e.data?.code === 'invalid_css_file');
    expect(cssFileErrors1.length).toBeGreaterThan(0);

    // Simulate CSS file fix: valid CSS now
    cssRegistry.updateCSSFile('./fixable.css', {
      classes: new Set(['button']),
      ids: new Set(),
      classLocations: new Map(),
      idLocations: new Map(),
      classRules: new Map(),
      idRules: new Map(),
      errors: [], // No errors now
    });

    // Re-validate
    await services.shared.workspace.DocumentBuilder.build([document], { validation: true });
    const errors2 = document.diagnostics ?? [];
    const cssFileErrors2 = errors2.filter(e => e.data?.code === 'invalid_css_file');
    const unknownClassErrors2 = errors2.filter(e => e.data?.code === 'unknown_css_class');

    // CSS file error should disappear
    expect(cssFileErrors2.length).toBe(0);
    // No unknown class error since class is now available
    expect(unknownClassErrors2.length).toBe(0);
  });
});
