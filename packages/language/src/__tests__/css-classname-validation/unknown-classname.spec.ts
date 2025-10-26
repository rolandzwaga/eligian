import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { beforeAll, describe, expect, test } from 'vitest';
import { createEligianServices } from '../../eligian-module.js';
import type { Program } from '../../generated/ast.js';

describe('CSS className validation - Unknown className with suggestions', () => {
  let services: ReturnType<typeof createEligianServices>;
  let parse: ReturnType<typeof parseHelper<Program>>;

  beforeAll(async () => {
    services = createEligianServices(EmptyFileSystem);
    parse = parseHelper<Program>(services.Eligian);
  });

  async function parseAndValidate(code: string) {
    const document = await parse(code);
    await services.shared.workspace.DocumentBuilder.build([document], { validation: true });
    return {
      document,
      program: document.parseResult.value as Program,
      diagnostics: document.diagnostics ?? [],
      validationErrors: document.diagnostics?.filter(d => d.severity === 1) ?? [],
    };
  }

  test('should error when className does not exist with suggestion', async () => {
    // Populate CSS registry with class similar to "primry"
    const cssRegistry = services.Eligian.css.CSSRegistry;
    cssRegistry.updateCSSFile('./styles.css', {
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

      action testAction() [
        addClass("primry")
      ]

      timeline "test" in ".container" using raf {
        at 0s testAction()
      }
    `;
    const { validationErrors } = await parseAndValidate(code);

    const classNameErrors = validationErrors.filter(
      e => e.message.includes('Unknown CSS class') && e.message.includes('Did you mean')
    );
    expect(classNameErrors.length).toBeGreaterThan(0);
  });

  test('should suggest multiple similar class names', async () => {
    // Populate CSS registry with classes similar to "buton"
    const cssRegistry = services.Eligian.css.CSSRegistry;
    cssRegistry.updateCSSFile('./styles.css', {
      classes: new Set(['button', 'buttons', 'bottom']),
      ids: new Set(),
      classLocations: new Map(),
      idLocations: new Map(),
      classRules: new Map(),
      idRules: new Map(),
      errors: [],
    });

    const code = `
      styles "./styles.css"

      action testAction() [
        addClass("buton")
      ]

      timeline "test" in ".container" using raf {
        at 0s testAction()
      }
    `;
    const { validationErrors } = await parseAndValidate(code);

    const classNameErrors = validationErrors.filter(e => e.message.includes('Unknown CSS class'));
    expect(classNameErrors.length).toBeGreaterThan(0);

    // Should include "Did you mean" with suggestions
    const hasSuggestions = classNameErrors.some(e => e.message.includes('Did you mean'));
    expect(hasSuggestions).toBe(true);
  });

  test('should error without suggestion when no similar classes exist', async () => {
    // Populate CSS registry with classes that are very different
    const cssRegistry = services.Eligian.css.CSSRegistry;
    cssRegistry.updateCSSFile('./styles.css', {
      classes: new Set(['button', 'primary', 'secondary']),
      ids: new Set(),
      classLocations: new Map(),
      idLocations: new Map(),
      classRules: new Map(),
      idRules: new Map(),
      errors: [],
    });

    const code = `
      styles "./styles.css"

      action testAction() [
        addClass("xyz-nonexistent")
      ]

      timeline "test" in ".container" using raf {
        at 0s testAction()
      }
    `;
    const { validationErrors } = await parseAndValidate(code);

    const classNameErrors = validationErrors.filter(e => e.message.includes('Unknown CSS class'));
    expect(classNameErrors.length).toBeGreaterThan(0);

    // Should NOT include "Did you mean" (no similar classes)
    const hasSuggestions = classNameErrors.some(e => e.message.includes('Did you mean'));
    expect(hasSuggestions).toBe(false);
  });
});
