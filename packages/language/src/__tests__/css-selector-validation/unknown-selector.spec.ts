import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { beforeAll, describe, expect, test } from 'vitest';
import { createEligianServices } from '../../eligian-module.js';
import type { Program } from '../../generated/ast.js';

describe('CSS Selector Validation - Unknown Classes and IDs', () => {
  let services: ReturnType<typeof createEligianServices>;
  let parse: ReturnType<typeof parseHelper<Program>>;

  beforeAll(async () => {
    services = createEligianServices(EmptyFileSystem);
    parse = parseHelper<Program>(services.Eligian);
  });

  async function parseAndValidate(code: string) {
    const document = await parse(code);
    await services.shared.workspace.DocumentBuilder.build([document], { validation: true });
    const validationErrors = document.diagnostics ?? [];
    return { document, validationErrors };
  }

  test('should error when selector contains unknown class', async () => {
    const cssRegistry = services.Eligian.css.CSSRegistry;
    const cssFileUri = 'file:///styles.css';
    cssRegistry.updateCSSFile(cssFileUri, {
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

      action selectPrimary() [
        selectElement(".button.primary")
      ]

      timeline "test" in ".container" using raf {
        at 0s..1s selectPrimary()
      }
    `;

    const { validationErrors } = await parseAndValidate(code);
    const selectorErrors = validationErrors.filter(e =>
      e.message.includes('Unknown CSS class in selector')
    );
    expect(selectorErrors.length).toBeGreaterThan(0);
    expect(selectorErrors[0].message).toContain('primary');
  });

  test('should error when selector contains unknown ID', async () => {
    const cssRegistry = services.Eligian.css.CSSRegistry;
    const cssFileUri = 'file:///styles.css';
    cssRegistry.updateCSSFile(cssFileUri, {
      classes: new Set(),
      ids: new Set(['header']),
      classLocations: new Map(),
      idLocations: new Map(),
      classRules: new Map(),
      idRules: new Map(),
      errors: [],
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

    const { validationErrors } = await parseAndValidate(code);
    const selectorErrors = validationErrors.filter(e =>
      e.message.includes('Unknown CSS ID in selector')
    );
    expect(selectorErrors.length).toBeGreaterThan(0);
    expect(selectorErrors[0].message).toContain('footer');
  });

  test('should error for multiple unknown classes in selector', async () => {
    const cssRegistry = services.Eligian.css.CSSRegistry;
    const cssFileUri = 'file:///styles.css';
    cssRegistry.updateCSSFile(cssFileUri, {
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

      action selectMultiple() [
        selectElement(".button.primary.large")
      ]

      timeline "test" in ".container" using raf {
        at 0s..1s selectMultiple()
      }
    `;

    const { validationErrors } = await parseAndValidate(code);
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
    const cssRegistry = services.Eligian.css.CSSRegistry;
    const cssFileUri = 'file:///styles.css';
    cssRegistry.updateCSSFile(cssFileUri, {
      classes: new Set(['primary', 'secondary', 'button']),
      ids: new Set(),
      classLocations: new Map(),
      idLocations: new Map(),
      classRules: new Map(),
      idRules: new Map(),
      errors: [],
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

    const { validationErrors } = await parseAndValidate(code);
    const selectorErrors = validationErrors.filter(
      e => e.message.includes('Unknown CSS class in selector') && e.message.includes('Did you mean')
    );
    expect(selectorErrors.length).toBeGreaterThan(0);
    expect(selectorErrors[0].message).toContain('primry');
    expect(selectorErrors[0].message).toContain('primary');
  });

  test('should validate unknown classes in combinator selectors', async () => {
    const cssRegistry = services.Eligian.css.CSSRegistry;
    const cssFileUri = 'file:///styles.css';
    cssRegistry.updateCSSFile(cssFileUri, {
      classes: new Set(['parent']),
      ids: new Set(),
      classLocations: new Map(),
      idLocations: new Map(),
      classRules: new Map(),
      idRules: new Map(),
      errors: [],
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

    const { validationErrors } = await parseAndValidate(code);
    const selectorErrors = validationErrors.filter(e =>
      e.message.includes('Unknown CSS class in selector')
    );
    expect(selectorErrors.length).toBeGreaterThan(0);
    expect(selectorErrors[0].message).toContain('child');
  });
});
