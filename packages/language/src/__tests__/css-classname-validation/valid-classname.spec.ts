import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { beforeAll, describe, expect, test } from 'vitest';
import { createEligianServices } from '../../eligian-module.js';
import type { Program } from '../../generated/ast.js';

describe('CSS className validation - Valid className parameters', () => {
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

  test('should not error when className exists in imported CSS', async () => {
    // Populate CSS registry with test data
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

      action addButton() [
        addClass("button")
      ]

      timeline "test" in ".container" using raf {
        at 0s addButton()
      }
    `;
    const { validationErrors } = await parseAndValidate(code);

    // Should have no className-related errors
    const classNameErrors = validationErrors.filter(
      e => e.message.toLowerCase().includes('class') && e.message.toLowerCase().includes('unknown')
    );
    expect(classNameErrors.length).toBe(0);
  });

  test('should not error when no CSS files are imported', async () => {
    // Without CSS imports, className validation is skipped
    const code = `
      action testAction() [
        addClass("any-class-name")
      ]

      timeline "test" in ".container" using raf {
        at 0s testAction()
      }
    `;
    const { validationErrors } = await parseAndValidate(code);

    // No CSS imports = no validation = no errors
    const classNameErrors = validationErrors.filter(
      e => e.message.toLowerCase().includes('class') && e.message.toLowerCase().includes('unknown')
    );
    expect(classNameErrors.length).toBe(0);
  });

  test('should not error for className in multiple CSS files', async () => {
    // Populate CSS registry with test data for both files
    const cssRegistry = services.Eligian.css.CSSRegistry;
    cssRegistry.updateCSSFile('./styles.css', {
      classes: new Set(['container', 'header']),
      ids: new Set(),
      classLocations: new Map(),
      idLocations: new Map(),
      classRules: new Map(),
      idRules: new Map(),
      errors: [],
    });
    cssRegistry.updateCSSFile('./theme.css', {
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
      styles "./theme.css"

      action testAction() [
        addClass("button")
      ]

      timeline "test" in ".container" using raf {
        at 0s testAction()
      }
    `;
    const { validationErrors } = await parseAndValidate(code);

    const classNameErrors = validationErrors.filter(
      e => e.message.toLowerCase().includes('class') && e.message.toLowerCase().includes('unknown')
    );
    expect(classNameErrors.length).toBe(0);
  });
});
