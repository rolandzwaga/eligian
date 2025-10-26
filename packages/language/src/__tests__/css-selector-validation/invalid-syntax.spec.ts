import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { beforeAll, describe, expect, test } from 'vitest';
import { createEligianServices } from '../../eligian-module.js';
import type { Program } from '../../generated/ast.js';

describe('CSS Selector Validation - Invalid Syntax', () => {
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

  test('should error for unclosed attribute selector', async () => {
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

      action selectInvalid() [
        selectElement(".button[")
      ]

      timeline "test" in ".container" using raf {
        at 0s..1s selectInvalid()
      }
    `;

    const { validationErrors } = await parseAndValidate(code);
    const syntaxErrors = validationErrors.filter(e =>
      e.message.includes('Invalid CSS selector syntax')
    );
    expect(syntaxErrors.length).toBeGreaterThan(0);
  });

  test('should error for unclosed pseudo-class', () => {
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

      action selectInvalid() [
        selectElement(".button:not(")
      ]

      timeline "test" in ".container" using raf {
        at 0s..1s selectInvalid()
      }
    `;

    parseAndValidate(code).then(({ validationErrors }) => {
      const syntaxErrors = validationErrors.filter(e =>
        e.message.includes('Invalid CSS selector syntax')
      );
      expect(syntaxErrors.length).toBeGreaterThan(0);
    });
  });

  test('should error for unclosed string in attribute', async () => {
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

      action selectInvalid() [
        selectElement(".input[type='text]")
      ]

      timeline "test" in ".container" using raf {
        at 0s..1s selectInvalid()
      }
    `;

    const { validationErrors } = await parseAndValidate(code);
    const syntaxErrors = validationErrors.filter(e =>
      e.message.includes('Invalid CSS selector syntax')
    );
    expect(syntaxErrors.length).toBeGreaterThan(0);
  });
});
