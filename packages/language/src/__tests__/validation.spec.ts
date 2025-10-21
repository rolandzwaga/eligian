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
      program: document.parseResult.value as Program,
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

    test('should accept multiple timeline declarations', async () => {
      const code = loadFixture('multiple-timelines.eligian');
      const { validationErrors } = await parseAndValidate(code);

      // Multiple timelines are now allowed for complex scenarios (e.g., synchronized video+audio)
      const multiTimelineErrors = validationErrors.filter(e =>
        e.message.includes('Only one timeline declaration is allowed')
      );
      expect(multiTimelineErrors.length).toBe(0);
    });

    test('should accept valid timeline providers', async () => {
      const validProviders = ['video', 'audio', 'raf', 'custom'];

      for (const provider of validProviders) {
        const code =
          provider === 'video' || provider === 'audio'
            ? `timeline "test" in ".test-container" using ${provider} from "test.mp4" {}`
            : `timeline "test" in ".test-container" using ${provider} {}`;

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
                timeline "test" in ".test-container" using audio {}
            `;
      const { validationErrors } = await parseAndValidate(code);

      expect(validationErrors.length).toBeGreaterThan(0);
      expect(validationErrors.some(e => e.message.includes('requires a source file'))).toBe(true);
    });

    test('should not require source for raf provider', async () => {
      const code = `
                timeline "test" in ".test-container" using raf {}
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
                timeline "test" in ".test-container" using raf {
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
                timeline "test" in ".test-container" using raf {
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
                timeline "test" in ".test-container" using raf {
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
                timeline "test" in ".test-container" using raf {}
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
                timeline "test" in ".test-container" using raf {}
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
                timeline "test" in ".test-container" using raf {}
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
                    selectElement(".target")
                    setStyle({ opacity: 0 })
                ]

                endable action showTitle [
                    selectElement("#title")
                    addClass("visible")
                ] [
                    selectElement("#title")
                    removeClass("visible")
                ]

                timeline "presentation" in ".presentation-container" using video from "presentation.mp4" {
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
                        selectElement("#credits")
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

  describe('Erased property validation (T254-T255)', () => {
    test('should accept valid property usage (property used before any operation)', async () => {
      const code = `
                action test [
                    selectElement("#test")
                    addClass("highlight")
                ]
                timeline "test" in ".test-container" using raf {}
            `;
      const { validationErrors } = await parseAndValidate(code);

      // Should not have erased property errors
      const erasedErrors = validationErrors.filter(
        e => e.message.includes('not available') || e.message.includes('erased')
      );
      expect(erasedErrors.length).toBe(0);
    });

    test('should accept property created by output then used as dependency', async () => {
      const code = `
                action test [
                    selectElement("#test")
                    addClass("active")
                    removeClass("inactive")
                ]
                timeline "test" in ".test-container" using raf {}
            `;
      const { validationErrors } = await parseAndValidate(code);

      // selectElement outputs 'selectedElement' which is used by addClass and removeClass
      // Should not have missing dependency errors
      const depErrors = validationErrors.filter(e => e.message.includes('not available'));
      expect(depErrors.length).toBe(0);
    });

    test('should reject missing dependency (property never created)', async () => {
      const code = `
                action test [
                    addClass("highlight")
                ]
                timeline "test" in ".test-container" using raf {}
            `;
      const { validationErrors } = await parseAndValidate(code);

      // addClass requires 'selectedElement' which was never created
      expect(validationErrors.length).toBeGreaterThan(0);
      expect(
        validationErrors.some(
          e =>
            e.message.includes('selectedElement') &&
            e.message.includes('not available') &&
            e.message.includes('ensure it is created')
        )
      ).toBe(true);
    });

    test('should handle multiple operations in sequence', async () => {
      const code = `
                action test [
                    selectElement("#box")
                    addClass("visible")
                    setStyle({ opacity: 1 })
                    removeClass("hidden")
                ]
                timeline "test" in ".test-container" using raf {}
            `;
      const { validationErrors } = await parseAndValidate(code);

      // All operations use selectedElement which is available after selectElement
      const depErrors = validationErrors.filter(e => e.message.includes('not available'));
      expect(depErrors.length).toBe(0);
    });

    test('should validate nested operations in if statement', async () => {
      const code = `
                action test [
                    selectElement("#box")
                    if ($operationdata.count > 5) {
                        addClass("many")
                    } else {
                        addClass("few")
                    }
                ]
                timeline "test" in ".test-container" using raf {}
            `;
      const { validationErrors } = await parseAndValidate(code);

      // selectedElement should be available in both branches
      const depErrors = validationErrors.filter(e => e.message.includes('not available'));
      expect(depErrors.length).toBe(0);
    });

    test('should validate nested operations in for loop', async () => {
      const code = `
                action test [
                    for (item in $operationdata.items) {
                        selectElement(item)
                        addClass("active")
                    }
                ]
                timeline "test" in ".test-container" using raf {}
            `;
      const { validationErrors } = await parseAndValidate(code);

      // Each iteration creates selectedElement before addClass uses it
      const depErrors = validationErrors.filter(e => e.message.includes('not available'));
      expect(depErrors.length).toBe(0);
    });

    test('should validate endable actions start operations', async () => {
      const code = `
                endable action test [
                    selectElement("#box")
                    addClass("visible")
                ] [
                ]
                timeline "test" in ".test-container" using raf {}
            `;
      const { validationErrors } = await parseAndValidate(code);

      // Start ops: selectedElement available for addClass
      // End ops: empty, so no validation errors
      const depErrors = validationErrors.filter(e => e.message.includes('not available'));
      expect(depErrors.length).toBe(0);
    });

    test('should validate endable actions end operations', async () => {
      const code = `
                endable action test [
                    selectElement("#box")
                ] [
                    addClass("hidden")
                ]
                timeline "test" in ".test-container" using raf {}
            `;
      const { validationErrors } = await parseAndValidate(code);

      // End ops should validate independently - addClass needs selectedElement
      // but it's not available in end ops (separate sequence)
      expect(validationErrors.length).toBeGreaterThan(0);
      expect(
        validationErrors.some(
          e => e.message.includes('selectedElement') && e.message.includes('not available')
        )
      ).toBe(true);
    });

    test('should validate inline endable actions', async () => {
      const code = `
                timeline "test" in ".test-container" using raf {
                    at 0s..5s [
                        selectElement("#box")
                        addClass("visible")
                    ] [
                        removeClass("visible")
                    ]
                }
            `;
      const { validationErrors } = await parseAndValidate(code);

      // Start ops: selectedElement available for addClass
      // End ops: removeClass needs selectedElement but it's a separate sequence
      expect(validationErrors.length).toBeGreaterThan(0);
      expect(
        validationErrors.some(
          e => e.message.includes('selectedElement') && e.message.includes('not available')
        )
      ).toBe(true);
    });
  });

  describe('Break and Continue Statement Validation', () => {
    test('should error when break is outside a loop', async () => {
      const code = `
        action test [
          break
        ]
        timeline "test" in ".test-container" using raf {}
      `;
      const { validationErrors } = await parseAndValidate(code);

      expect(validationErrors.length).toBeGreaterThan(0);
      expect(
        validationErrors.some(e => e.message.includes("'break' can only be used inside a loop"))
      ).toBe(true);
    });

    test('should error when continue is outside a loop', async () => {
      const code = `
        action test [
          continue
        ]
        timeline "test" in ".test-container" using raf {}
      `;
      const { validationErrors } = await parseAndValidate(code);

      expect(validationErrors.length).toBeGreaterThan(0);
      expect(
        validationErrors.some(e => e.message.includes("'continue' can only be used inside a loop"))
      ).toBe(true);
    });

    test('should allow break inside a for loop', async () => {
      const code = `
        action test [
          for (item in ["a", "b", "c"]) {
            break
          }
        ]
        timeline "test" in ".test-container" using raf {}
      `;
      const { validationErrors } = await parseAndValidate(code);

      const breakErrors = validationErrors.filter(e =>
        e.message.includes("'break' can only be used inside a loop")
      );
      expect(breakErrors.length).toBe(0);
    });

    test('should allow continue inside a for loop', async () => {
      const code = `
        action test [
          for (item in ["a", "b", "c"]) {
            continue
          }
        ]
        timeline "test" in ".test-container" using raf {}
      `;
      const { validationErrors } = await parseAndValidate(code);

      const continueErrors = validationErrors.filter(e =>
        e.message.includes("'continue' can only be used inside a loop")
      );
      expect(continueErrors.length).toBe(0);
    });

    test('should allow break/continue inside nested if in loop', async () => {
      const code = `
        action test [
          for (item in ["a", "b", "c"]) {
            if ($operationdata.skip) {
              continue
            }
            if ($operationdata.stop) {
              break
            }
          }
        ]
        timeline "test" in ".test-container" using raf {}
      `;
      const { validationErrors } = await parseAndValidate(code);

      const loopErrors = validationErrors.filter(
        e =>
          e.message.includes("'break' can only be used inside a loop") ||
          e.message.includes("'continue' can only be used inside a loop")
      );
      expect(loopErrors.length).toBe(0);
    });

    test('should handle multiple break/continue in same loop', async () => {
      const code = `
        action test [
          for (item in ["a", "b", "c"]) {
            continue
            break
          }
        ]
        timeline "test" in ".test-container" using raf {}
      `;
      const { validationErrors } = await parseAndValidate(code);

      const loopErrors = validationErrors.filter(
        e =>
          e.message.includes("'break' can only be used inside a loop") ||
          e.message.includes("'continue' can only be used inside a loop")
      );
      expect(loopErrors.length).toBe(0);
    });
  });
});
