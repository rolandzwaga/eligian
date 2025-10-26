import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { beforeAll, describe, expect, test } from 'vitest';
import { createEligianServices } from '../../eligian-module.js';
import type { Program } from '../../generated/ast.js';

describe('CSS Selector Validation - Valid Selectors', () => {
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

  test('should not error when selector classes exist in CSS', async () => {
    const cssRegistry = services.Eligian.css.CSSRegistry;
    cssRegistry.updateCSSFile('./styles.css', {
      classes: new Set(['button', 'primary', 'large']),
      ids: new Set(['header', 'footer']),
      classLocations: new Map(),
      idLocations: new Map(),
      classRules: new Map(),
      idRules: new Map(),
      errors: [],
    });

    const code = `
      styles "./styles.css"

      action selectButton() [
        selectElement(".button.primary")
      ]

      timeline "test" in ".container" using raf {
        at 0s..1s selectButton()
      }
    `;

    const { validationErrors } = await parseAndValidate(code);
    const selectorErrors = validationErrors.filter(
      e => e.message.toLowerCase().includes('selector') || e.message.toLowerCase().includes('class')
    );
    expect(selectorErrors.length).toBe(0);
  });

  test('should not error when selector IDs exist in CSS', async () => {
    const cssRegistry = services.Eligian.css.CSSRegistry;
    cssRegistry.updateCSSFile('./styles.css', {
      classes: new Set(['active']),
      ids: new Set(['header', 'nav']),
      classLocations: new Map(),
      idLocations: new Map(),
      classRules: new Map(),
      idRules: new Map(),
      errors: [],
    });

    const code = `
      styles "./styles.css"

      action selectNav() [
        selectElement("#nav.active")
      ]

      timeline "test" in ".container" using raf {
        at 0s..1s selectNav()
      }
    `;

    const { validationErrors } = await parseAndValidate(code);
    const selectorErrors = validationErrors.filter(
      e =>
        e.message.toLowerCase().includes('selector') ||
        e.message.toLowerCase().includes('class') ||
        e.message.toLowerCase().includes('id')
    );
    expect(selectorErrors.length).toBe(0);
  });

  test('should ignore pseudo-classes and validate only classes', async () => {
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

      action selectHoveredButton() [
        selectElement(".button:hover:active")
      ]

      timeline "test" in ".container" using raf {
        at 0s..1s selectHoveredButton()
      }
    `;

    const { validationErrors } = await parseAndValidate(code);
    const selectorErrors = validationErrors.filter(
      e => e.message.toLowerCase().includes('selector') || e.message.toLowerCase().includes('class')
    );
    expect(selectorErrors.length).toBe(0);
  });

  test('should validate all classes in combinator selectors', async () => {
    const cssRegistry = services.Eligian.css.CSSRegistry;
    cssRegistry.updateCSSFile('./styles.css', {
      classes: new Set(['parent', 'child', 'sibling']),
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
        selectElement(".parent > .child + .sibling")
      ]

      timeline "test" in ".container" using raf {
        at 0s..1s selectNested()
      }
    `;

    const { validationErrors } = await parseAndValidate(code);
    const selectorErrors = validationErrors.filter(
      e => e.message.toLowerCase().includes('selector') || e.message.toLowerCase().includes('class')
    );
    expect(selectorErrors.length).toBe(0);
  });

  test('should not error when no CSS files imported (opt-in validation)', async () => {
    const code = `
      action selectAnything() [
        selectElement(".any-class-name")
      ]

      timeline "test" in ".container" using raf {
        at 0s..1s selectAnything()
      }
    `;

    const { validationErrors } = await parseAndValidate(code);
    const selectorErrors = validationErrors.filter(
      e => e.message.toLowerCase().includes('selector') || e.message.toLowerCase().includes('class')
    );
    expect(selectorErrors.length).toBe(0);
  });

  test('should handle attribute selectors (attributes ignored)', async () => {
    const cssRegistry = services.Eligian.css.CSSRegistry;
    cssRegistry.updateCSSFile('./styles.css', {
      classes: new Set(['input']),
      ids: new Set(),
      classLocations: new Map(),
      idLocations: new Map(),
      classRules: new Map(),
      idRules: new Map(),
      errors: [],
    });

    const code = `
      styles "./styles.css"

      action selectInput() [
        selectElement(".input[type='text'][required]")
      ]

      timeline "test" in ".container" using raf {
        at 0s..1s selectInput()
      }
    `;

    const { validationErrors } = await parseAndValidate(code);
    const selectorErrors = validationErrors.filter(
      e => e.message.toLowerCase().includes('selector') || e.message.toLowerCase().includes('class')
    );
    expect(selectorErrors.length).toBe(0);
  });
});
