import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { beforeAll, describe, expect, test } from 'vitest';
import { createEligianServices } from '../eligian-module.js';
import type { Program } from '../generated/ast.js';

describe('Eligian Grammar - Validation', () => {
  let services: ReturnType<typeof createEligianServices>;
  let parse: ReturnType<typeof parseHelper<Program>>;

  beforeAll(async () => {
    services = createEligianServices(EmptyFileSystem);
    parse = parseHelper<Program>(services.Eligian);
  });

  /**
   * Helper: Parse DSL code and return validation diagnostics
   */
  async function parseAndValidate(code: string) {
    const document = await parse(code);

    // Manually trigger validation
    await services.shared.workspace.DocumentBuilder.build([document], { validation: true });

    return {
      document,
      diagnostics: document.diagnostics ?? [],
      validationErrors: document.diagnostics?.filter(d => d.severity === 1) ?? [], // 1 = Error
    };
  }

  /**
   * Helper: Load fixture file
   */
  function loadFixture(filename: string): string {
    const path = join(__dirname, '__fixtures__', 'invalid', filename);
    return readFileSync(path, 'utf-8');
  }

  describe('Timeline validation (T036, T042, T043)', () => {
    test('should require exactly one timeline declaration', async () => {
      const code = `
                endable action test [
                    selectElement("#element")
                ] [
                ]
            `;
      const { validationErrors } = await parseAndValidate(code);

      expect(validationErrors.length).toBeGreaterThan(0);
      expect(
        validationErrors.some(e => e.message.includes('timeline declaration is required'))
      ).toBe(true);
    });

    test('should reject multiple timeline declarations', async () => {
      const code = loadFixture('multiple-timelines.eligian');
      const { validationErrors } = await parseAndValidate(code);

      expect(validationErrors.length).toBeGreaterThan(0);
      expect(
        validationErrors.some(e => e.message.includes('Only one timeline declaration is allowed'))
      ).toBe(true);
    });

    test('should accept valid timeline providers', async () => {
      const validProviders = ['video', 'audio', 'raf', 'custom'];

      for (const provider of validProviders) {
        const code =
          provider === 'video' || provider === 'audio'
            ? `timeline "test" using ${provider} from "test.mp4" {}`
            : `timeline "test" using ${provider} {}`;

        const { validationErrors } = await parseAndValidate(code);

        // Should not have provider-related errors
        const providerErrors = validationErrors.filter(e =>
          e.message.includes('Invalid timeline provider')
        );
        expect(providerErrors.length).toBe(0);
      }
    });

    test('should reject invalid timeline provider', async () => {
      const code = loadFixture('invalid-provider.eligian');
      const { validationErrors } = await parseAndValidate(code);

      expect(validationErrors.length).toBeGreaterThan(0);
      expect(validationErrors.some(e => e.message.includes('Invalid timeline provider'))).toBe(
        true
      );
    });

    test('should require source for video provider', async () => {
      const code = loadFixture('missing-source.eligian');
      const { validationErrors } = await parseAndValidate(code);

      expect(validationErrors.length).toBeGreaterThan(0);
      expect(validationErrors.some(e => e.message.includes('requires a source file'))).toBe(true);
    });

    test('should require source for audio provider', async () => {
      const code = `
                timeline "test" using audio {}
            `;
      const { validationErrors } = await parseAndValidate(code);

      expect(validationErrors.length).toBeGreaterThan(0);
      expect(validationErrors.some(e => e.message.includes('requires a source file'))).toBe(true);
    });

    test('should not require source for raf provider', async () => {
      const code = `
                timeline "test" using raf {}
            `;
      const { validationErrors } = await parseAndValidate(code);

      // Should not have source-related errors
      const sourceErrors = validationErrors.filter(e => e.message.includes('requires a source'));
      expect(sourceErrors.length).toBe(0);
    });
  });

  describe('Timeline event validation (T038, T039)', () => {
    test('should accept unique timeline events (no IDs)', async () => {
      const code = `
                timeline "test" using raf {
                    at 0s..5s [
                        selectElement("#el1")
                    ] [
                    ]
                    at 5s..10s [
                        selectElement("#el2")
                    ] [
                    ]
                    at 10s..15s [
                        selectElement("#el3")
                    ] [
                    ]
                }
            `;
      const { validationErrors } = await parseAndValidate(code);

      // Timeline events don't have IDs in new grammar, so no duplicate ID errors
      const duplicateErrors = validationErrors.filter(e => e.message.includes('Duplicate'));
      expect(duplicateErrors.length).toBe(0);
    });

    test('should reject invalid time range (start > end)', async () => {
      const code = loadFixture('invalid-time-range.eligian');
      const { validationErrors } = await parseAndValidate(code);

      expect(validationErrors.length).toBeGreaterThan(0);
      expect(
        validationErrors.some(
          e =>
            e.message.includes('start time') && e.message.includes('must be less than or equal to')
        )
      ).toBe(true);
    });

    test('should accept valid time range (start <= end)', async () => {
      const code = `
                timeline "test" using raf {
                    at 0s..10s [
                        selectElement("#el")
                    ] [
                    ]
                    at 5s..5s [
                        selectElement("#el2")
                    ] [
                    ]
                }
            `;
      const { validationErrors } = await parseAndValidate(code);

      // Should not have time range errors
      const timeRangeErrors = validationErrors.filter(
        e => e.message.includes('start time') && e.message.includes('must be less than')
      );
      expect(timeRangeErrors.length).toBe(0);
    });

    test('should reject negative start time', async () => {
      const code = loadFixture('negative-times.eligian');
      const { document } = await parseAndValidate(code);

      // Negative numbers are parse errors (unary minus operator on number literal)
      expect(document.parseResult.parserErrors.length).toBeGreaterThan(0);
    });

    test('should reject negative end time', async () => {
      const code = loadFixture('negative-times.eligian');
      const { document } = await parseAndValidate(code);

      // Negative numbers are parse errors
      expect(document.parseResult.parserErrors.length).toBeGreaterThan(0);
    });

    test('should accept non-negative times', async () => {
      const code = `
                timeline "test" using raf {
                    at 0s..10s [
                        selectElement("#el")
                    ] [
                    ]
                    at 100s..200s [
                        selectElement("#el2")
                    ] [
                    ]
                }
            `;
      const { validationErrors } = await parseAndValidate(code);

      // Should not have negative time errors
      const negativeErrors = validationErrors.filter(e => e.message.includes('cannot be negative'));
      expect(negativeErrors.length).toBe(0);
    });
  });

  describe('Operation call validation', () => {
    test('should accept operation calls with no arguments', async () => {
      const code = `
                action test [
                    log()
                ]
                timeline "test" using raf {}
            `;
      const { document, validationErrors } = await parseAndValidate(code);

      expect(document.parseResult.lexerErrors.length).toBe(0);
      expect(document.parseResult.parserErrors.length).toBe(0);
      expect(validationErrors.length).toBe(0);
    });

    test('should accept operation calls with arguments', async () => {
      const code = `
                action test [
                    selectElement("#title")
                    addClass("visible")
                    setStyle({ opacity: 1 })
                ]
                timeline "test" using raf {}
            `;
      const { document, validationErrors } = await parseAndValidate(code);

      expect(document.parseResult.lexerErrors.length).toBe(0);
      expect(document.parseResult.parserErrors.length).toBe(0);
      expect(validationErrors.length).toBe(0);
    });

    test('should accept property chain references', async () => {
      const code = `
                action test [
                    setData({ "operationdata.name": $scope.currentItem })
                ]
                timeline "test" using raf {}
            `;
      const { document, validationErrors } = await parseAndValidate(code);

      expect(document.parseResult.lexerErrors.length).toBe(0);
      expect(document.parseResult.parserErrors.length).toBe(0);
      expect(validationErrors.length).toBe(0);
    });
  });

  describe('Comprehensive validation', () => {
    test('should validate complex valid program', async () => {
      const code = `
                endable action fadeIn [
                    selectElement(".target")
                    setStyle({ opacity: 0 })
                    animate({ opacity: 1 }, 500)
                ] [
                    setStyle({ opacity: 0 })
                ]

                endable action showTitle [
                    selectElement("#title")
                    addClass("visible")
                ] [
                    removeClass("visible")
                ]

                timeline "presentation" using video from "presentation.mp4" {
                    at 0s..5s {
                        showTitle()
                    }

                    at 5s..120s {
                        fadeIn()
                    }

                    at 120s..130s [
                        selectElement("#credits")
                        addClass("visible")
                    ] [
                        removeClass("visible")
                    ]
                }
            `;
      const { validationErrors, document } = await parseAndValidate(code);

      expect(document.parseResult.lexerErrors.length).toBe(0);
      expect(document.parseResult.parserErrors.length).toBe(0);
      expect(validationErrors.length).toBe(0);
    });

    test('should accumulate multiple validation errors', async () => {
      const code = `
                // Missing timeline
                endable action test [
                    selectElement("#test")
                ] [
                ]

                // No timeline declaration
            `;
      const { validationErrors } = await parseAndValidate(code);

      // Should have timeline missing error
      expect(validationErrors.length).toBeGreaterThan(0);
      expect(validationErrors.some(e => e.message.includes('timeline'))).toBe(true);
    });
  });
});
