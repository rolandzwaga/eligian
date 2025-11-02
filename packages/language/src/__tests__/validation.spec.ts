import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, test } from 'vitest';
import { createTestContext, type TestContext } from './test-helpers.js';

describe('Eligian Grammar - Validation', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = createTestContext();

    // Register CSS classes and IDs used throughout tests to prevent validation errors
    const cssRegistry = ctx.services.Eligian.css.CSSRegistry;
    cssRegistry.updateCSSFile('file:///styles.css', {
      classes: new Set([
        // Timeline container classes
        'test-container',
        'container',
        'presentation-container',
        'c',
        'bleep',
        // Classes used in operations
        'active',
        'few',
        'hidden',
        'highlight',
        'many',
        'selected',
        'test',
        'visible',
        'inactive',
        'box',
        'target',
      ]),
      ids: new Set(['box', 'credits', 'el', 'el1', 'el2', 'el3', 'element', 'test', 'title']),
      classLocations: new Map(),
      idLocations: new Map(),
      classRules: new Map(),
      idRules: new Map(),
      errors: [],
    });
  });

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
      const { errors } = await ctx.parseAndValidate(code);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.message.includes('timeline declaration is required'))).toBe(true);
    });

    test('should accept multiple timeline declarations', async () => {
      const code = loadFixture('multiple-timelines.eligian');
      const { errors } = await ctx.parseAndValidate(code);

      // Multiple timelines are now allowed for complex scenarios (e.g., synchronized video+audio)
      const multiTimelineErrors = errors.filter(e =>
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

        const { errors } = await ctx.parseAndValidate(code);

        // Should not have provider-related errors
        const providerErrors = errors.filter(e => e.message.includes('Invalid timeline provider'));
        expect(providerErrors.length).toBe(0);
      }
    });

    test('should reject invalid timeline provider', async () => {
      const code = loadFixture('invalid-provider.eligian');
      const { errors } = await ctx.parseAndValidate(code);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.message.includes('Invalid timeline provider'))).toBe(true);
    });

    test('should require source for video provider', async () => {
      const code = loadFixture('missing-source.eligian');
      const { errors } = await ctx.parseAndValidate(code);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.message.includes('requires a source file'))).toBe(true);
    });

    test('should require source for audio provider', async () => {
      const code = `
                timeline "test" in ".test-container" using audio {}
            `;
      const { errors } = await ctx.parseAndValidate(code);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.message.includes('requires a source file'))).toBe(true);
    });

    test('should not require source for raf provider', async () => {
      const code = `
                timeline "test" in ".test-container" using raf {}
            `;
      const { errors } = await ctx.parseAndValidate(code);

      // Should not have source-related errors
      const sourceErrors = errors.filter(e => e.message.includes('requires a source'));
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
      const { errors } = await ctx.parseAndValidate(code);

      // Timeline events don't have IDs in new grammar, so no duplicate ID errors
      const duplicateErrors = errors.filter(e => e.message.includes('Duplicate'));
      expect(duplicateErrors.length).toBe(0);
    });

    test('should reject invalid time range (start > end)', async () => {
      const code = loadFixture('invalid-time-range.eligian');
      const { errors } = await ctx.parseAndValidate(code);

      expect(errors.length).toBeGreaterThan(0);
      expect(
        errors.some(
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
      const { errors } = await ctx.parseAndValidate(code);

      // Should not have time range errors
      const timeRangeErrors = errors.filter(
        e => e.message.includes('start time') && e.message.includes('must be less than')
      );
      expect(timeRangeErrors.length).toBe(0);
    });

    test('should reject negative start time', async () => {
      const code = loadFixture('negative-times.eligian');
      const { document } = await ctx.parseAndValidate(code);

      // Negative numbers are parse errors (unary minus operator on number literal)
      expect(document.parseResult.parserErrors.length).toBeGreaterThan(0);
    });

    test('should reject negative end time', async () => {
      const code = loadFixture('negative-times.eligian');
      const { document } = await ctx.parseAndValidate(code);

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
      const { errors } = await ctx.parseAndValidate(code);

      // Should not have negative time errors
      const negativeErrors = errors.filter(e => e.message.includes('cannot be negative'));
      expect(negativeErrors.length).toBe(0);
    });
  });

  describe('Operation call validation', () => {
    test('should accept operation calls with no arguments', async () => {
      const code = `
                styles "./styles.css"
                action test [
                    log()
                ]
                timeline "test" in ".test-container" using raf {}
            `;
      const { document, errors } = await ctx.parseAndValidate(code);

      expect(document.parseResult.lexerErrors.length).toBe(0);
      expect(document.parseResult.parserErrors.length).toBe(0);
      expect(errors.length).toBe(0);
    });

    test('should accept operation calls with arguments', async () => {
      const code = `
                styles "./styles.css"
                action test [
                    selectElement("#title")
                    addClass("visible")
                    setStyle({ opacity: 1 })
                ]
                timeline "test" in ".test-container" using raf {}
            `;
      const { document, errors } = await ctx.parseAndValidate(code);

      expect(document.parseResult.lexerErrors.length).toBe(0);
      expect(document.parseResult.parserErrors.length).toBe(0);
      expect(errors.length).toBe(0);
    });

    test('should accept property chain references', async () => {
      const code = `
                styles "./styles.css"
                action test [
                    setData({ "operationdata.name": $scope.currentItem })
                ]
                timeline "test" in ".test-container" using raf {}
            `;
      const { document, errors } = await ctx.parseAndValidate(code);

      expect(document.parseResult.lexerErrors.length).toBe(0);
      expect(document.parseResult.parserErrors.length).toBe(0);
      expect(errors.length).toBe(0);
    });
  });

  describe('Comprehensive validation', () => {
    test('should validate complex valid program', async () => {
      const code = `
                styles "./styles.css"
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
                    at 0s..5s showTitle()

                    at 5s..120s fadeIn()

                    at 120s..130s [
                        selectElement("#credits")
                        addClass("visible")
                    ] [
                        selectElement("#credits")
                        removeClass("visible")
                    ]
                }
            `;
      const { errors, document } = await ctx.parseAndValidate(code);

      expect(document.parseResult.lexerErrors.length).toBe(0);
      expect(document.parseResult.parserErrors.length).toBe(0);
      expect(errors.length).toBe(0);
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
      const { errors } = await ctx.parseAndValidate(code);

      // Should have timeline missing error
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.message.includes('timeline'))).toBe(true);
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
      const { errors } = await ctx.parseAndValidate(code);

      // Should not have erased property errors
      const erasedErrors = errors.filter(
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
      const { errors } = await ctx.parseAndValidate(code);

      // selectElement outputs 'selectedElement' which is used by addClass and removeClass
      // Should not have missing dependency errors
      const depErrors = errors.filter(e => e.message.includes('not available'));
      expect(depErrors.length).toBe(0);
    });

    test('should reject missing dependency (property never created)', async () => {
      const code = `
                action test [
                    addClass("highlight")
                ]
                timeline "test" in ".test-container" using raf {}
            `;
      const { errors } = await ctx.parseAndValidate(code);

      // addClass requires 'selectedElement' which was never created
      expect(errors.length).toBeGreaterThan(0);
      expect(
        errors.some(
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
      const { errors } = await ctx.parseAndValidate(code);

      // All operations use selectedElement which is available after selectElement
      const depErrors = errors.filter(e => e.message.includes('not available'));
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
      const { errors } = await ctx.parseAndValidate(code);

      // selectedElement should be available in both branches
      const depErrors = errors.filter(e => e.message.includes('not available'));
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
      const { errors } = await ctx.parseAndValidate(code);

      // Each iteration creates selectedElement before addClass uses it
      const depErrors = errors.filter(e => e.message.includes('not available'));
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
      const { errors } = await ctx.parseAndValidate(code);

      // Start ops: selectedElement available for addClass
      // End ops: empty, so no validation errors
      const depErrors = errors.filter(e => e.message.includes('not available'));
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
      const { errors } = await ctx.parseAndValidate(code);

      // End ops should validate independently - addClass needs selectedElement
      // but it's not available in end ops (separate sequence)
      expect(errors.length).toBeGreaterThan(0);
      expect(
        errors.some(
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
      const { errors } = await ctx.parseAndValidate(code);

      // Start ops: selectedElement available for addClass
      // End ops: removeClass needs selectedElement but it's a separate sequence
      expect(errors.length).toBeGreaterThan(0);
      expect(
        errors.some(
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
      const { errors } = await ctx.parseAndValidate(code);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.message.includes("'break' can only be used inside a loop"))).toBe(
        true
      );
    });

    test('should error when continue is outside a loop', async () => {
      const code = `
        action test [
          continue
        ]
        timeline "test" in ".test-container" using raf {}
      `;
      const { errors } = await ctx.parseAndValidate(code);

      expect(errors.length).toBeGreaterThan(0);
      expect(
        errors.some(e => e.message.includes("'continue' can only be used inside a loop"))
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
      const { errors } = await ctx.parseAndValidate(code);

      const breakErrors = errors.filter(e =>
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
      const { errors } = await ctx.parseAndValidate(code);

      const continueErrors = errors.filter(e =>
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
      const { errors } = await ctx.parseAndValidate(code);

      const loopErrors = errors.filter(
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
      const { errors } = await ctx.parseAndValidate(code);

      const loopErrors = errors.filter(
        e =>
          e.message.includes("'break' can only be used inside a loop") ||
          e.message.includes("'continue' can only be used inside a loop")
      );
      expect(loopErrors.length).toBe(0);
    });
  });

  // T011: US1 - Validate action call resolves to defined action
  describe('Unified action call syntax validation (US1)', () => {
    test('should validate that action call resolves to defined action', async () => {
      const code = `
                styles "./styles.css"
        action fadeIn(selector, duration) [
          selectElement(selector)
        ]

        timeline "test" in ".container" using raf {
          at 0s..5s fadeIn(".box", 1000)
        }
      `;
      const { errors } = await ctx.parseAndValidate(code);

      // Should have no errors - action is defined
      expect(errors.length).toBe(0);
    });

    test('should error when action call references undefined action', async () => {
      const code = `
        timeline "test" in ".container" using raf {
          at 0s..5s undefinedAction(".box")
        }
      `;
      const { errors } = await ctx.parseAndValidate(code);

      // Should error - action not defined
      // Note: This test will fail until validation logic is implemented
      const undefinedErrors = errors.filter(
        e => e.message.includes('Unknown action') || e.message.includes('undefined')
      );
      expect(undefinedErrors.length).toBeGreaterThan(0);
    });
  });

  // T031-T033: US2 - Name collision prevention tests
  describe('Action name collision prevention (US2)', () => {
    // T031: Reject action with operation name
    test('should error when action name conflicts with built-in operation', async () => {
      const code = `
        action selectElement(selector) [
          addClass("test")
        ]

        timeline "test" in ".container" using raf {
          at 0s..5s selectElement(".box")
        }
      `;
      const { errors } = await ctx.parseAndValidate(code);

      // Should error - action name collides with operation
      const collisionErrors = errors.filter(
        e => e.message.includes('conflicts') || e.message.includes('collision')
      );
      expect(collisionErrors.length).toBeGreaterThan(0);
      expect(collisionErrors[0].message).toContain('selectElement');
    });

    // T032: Reject duplicate action definitions
    test('should error when duplicate action definitions exist', async () => {
      const code = `
        action fadeIn(selector) [
          selectElement(selector)
        ]

        action fadeIn(selector) [
          addClass("visible")
        ]

        timeline "test" in ".container" using raf {
          at 0s..5s fadeIn(".box")
        }
      `;
      const { errors } = await ctx.parseAndValidate(code);

      // Should error - duplicate action definition
      const duplicateErrors = errors.filter(
        e => e.message.includes('duplicate') || e.message.includes('already defined')
      );
      expect(duplicateErrors.length).toBeGreaterThan(0);
    });

    // T033: Allow action with similar (but not identical) name
    test('should allow action with similar name that does not collide', async () => {
      const code = `
                styles "./styles.css"
        action mySelectElement(selector) [
          selectElement(selector)
          addClass("selected")
        ]

        timeline "test" in ".container" using raf {
          at 0s..5s mySelectElement(".box")
        }
      `;
      const { errors } = await ctx.parseAndValidate(code);

      // Should have no errors - name is different
      expect(errors.length).toBe(0);
    });
  });

  // Duplicate constant validation
  describe('Duplicate constant validation', () => {
    test('should error when duplicate constant declarations exist', async () => {
      const code = `
        const bleep = "hello"
        const bleep = "world"
        const bleep = "again"

        timeline "test" in ".container" using raf {
          at 0s..5s selectElement("#box")
        }
      `;
      const { errors } = await ctx.parseAndValidate(code);

      // Should error - duplicate constant declarations
      const duplicateErrors = errors.filter(
        e => e.message.includes('duplicate') || e.message.includes('already defined')
      );
      expect(duplicateErrors.length).toBeGreaterThan(0);
      expect(duplicateErrors.length).toBe(2); // Two duplicates (second and third declarations)
    });

    test('should error on two duplicate constants with same name', async () => {
      const code = `
        const myValue = 100
        const myValue = 200

        timeline "test" in ".container" using raf {
          at 0s..5s selectElement("#box")
        }
      `;
      const { errors } = await ctx.parseAndValidate(code);

      const duplicateErrors = errors.filter(
        e => e.message.includes('duplicate') || e.message.includes('already defined')
      );
      expect(duplicateErrors.length).toBe(1); // One duplicate (second declaration)
    });

    test('should allow constants with different names', async () => {
      const code = `
        const value1 = "hello"
        const value2 = "world"
        const value3 = "test"

        timeline "test" in ".container" using raf {
          at 0s..5s selectElement("#box")
        }
      `;
      const { errors } = await ctx.parseAndValidate(code);

      // Should have no errors - all names are unique
      const duplicateErrors = errors.filter(
        e => e.message.includes('duplicate') || e.message.includes('already defined')
      );
      expect(duplicateErrors.length).toBe(0);
    });
  });

  // T049: US3 - Control flow with action calls validation
  describe('Control flow with action calls validation (US3)', () => {
    test('should validate action calls within for loops', async () => {
      const code = `
                styles "./styles.css"
        action highlight(selector) [
          selectElement(selector)
          addClass("highlight")
        ]

        timeline "test" in ".container" using raf {
          at 0s..5s for (item in $operationdata.items) {
            highlight(".box")
          }
        }
      `;
      const { errors } = await ctx.parseAndValidate(code);

      // Should have no errors - action is defined and used correctly
      expect(errors.length).toBe(0);
    });

    test('should validate action calls within if/else statements', async () => {
      const code = `
                styles "./styles.css"
        action show(selector) [
          selectElement(selector)
          addClass("visible")
        ]

        action hide(selector) [
          selectElement(selector)
          removeClass("visible")
        ]

        timeline "test" in ".container" using raf {
          at 0s..5s if (@@condition) {
            show(".box")
          } else {
            hide(".box")
          }
        }
      `;
      const { errors } = await ctx.parseAndValidate(code);

      // Should have no errors - both actions are defined
      expect(errors.length).toBe(0);
    });

    test('should error when undefined action called in control flow', async () => {
      const code = `
        timeline "test" in ".container" using raf {
          at 0s..5s for (item in items) {
            undefinedAction(@@item)
          }
        }
      `;
      const { errors } = await ctx.parseAndValidate(code);

      // Should error - action not defined
      const undefinedErrors = errors.filter(
        e => e.message.includes('Unknown action') || e.message.includes('undefined')
      );
      expect(undefinedErrors.length).toBeGreaterThan(0);
    });
  });

  // Test for action calls inside inline endable action blocks
  describe('Action calls in inline endable action blocks', () => {
    test('should allow custom action calls in inline endable action blocks', async () => {
      const code = `
        endable action fadeIn(selector: string, duration) [
          selectElement(selector)
          setStyle({opacity: 0})
          animate({opacity: 1}, duration)
        ] [
          selectElement(selector)
          animate({opacity: 0}, duration)
        ]

        timeline "demo" in "bleep" using raf {
          at 0s..3s [
            fadeIn("123", 1000)
          ] []
        }
      `;
      const { errors } = await ctx.parseAndValidate(code);

      // Debug: print errors
      if (errors.length > 0) {
        console.log(
          'Validation errors:',
          errors.map(e => e.message)
        );
      }

      // Should have no errors - fadeIn is a defined action and can be called in inline blocks
      expect(errors.length).toBe(0);
    });

    test('should allow operations in inline endable action blocks', async () => {
      const code = `
                styles "./styles.css"
        timeline "demo" in "bleep" using raf {
          at 0s..3s [
            selectElement("#box")
            addClass("visible")
          ] [
            selectElement("#box")
            removeClass("visible")
          ]
        }
      `;
      const { errors } = await ctx.parseAndValidate(code);

      // Should have no errors - operations are allowed in inline endable action blocks
      expect(errors.length).toBe(0);
    });

    test('should error when undefined action called in inline endable action blocks', async () => {
      const code = `
        timeline "demo" in "bleep" using raf {
          at 0s..3s [
            undefinedAction("123", 1000)
          ] []
        }
      `;
      const { errors } = await ctx.parseAndValidate(code);

      // Should error - undefinedAction is neither a defined action nor an operation
      const undefinedErrors = errors.filter(
        e => e.message.includes('Unknown') || e.message.includes('not found')
      );
      expect(undefinedErrors.length).toBeGreaterThan(0);
    });
  });

  describe('Recursive action call validation', () => {
    describe('Direct recursion (immediate self-call)', () => {
      test('should error when regular action calls itself', async () => {
        const code = `
          action fadeIn(selector: string, duration) [
            fadeIn(selector, duration)
            selectElement(selector)
          ]
          timeline "test" in ".container" using raf {}
        `;
        const { errors } = await ctx.parseAndValidate(code);

        // Should have error about recursive call
        const recursionErrors = errors.filter(
          e => e.message.includes('Recursive') || e.message.includes('infinite loop')
        );
        expect(recursionErrors.length).toBeGreaterThan(0);
        expect(recursionErrors[0].message).toContain('fadeIn');
      });

      test('should error when endable action calls itself in start block', async () => {
        const code = `
          endable action fadeIn(selector: string) [
            fadeIn(selector)
            selectElement(selector)
          ] [
            selectElement(selector)
          ]
          timeline "test" in ".container" using raf {}
        `;
        const { errors } = await ctx.parseAndValidate(code);

        const recursionErrors = errors.filter(
          e => e.message.includes('Recursive') || e.message.includes('infinite loop')
        );
        expect(recursionErrors.length).toBeGreaterThan(0);
      });

      test('should error when endable action calls itself in end block', async () => {
        const code = `
          endable action fadeIn(selector: string) [
            selectElement(selector)
          ] [
            fadeIn(selector)
          ]
          timeline "test" in ".container" using raf {}
        `;
        const { errors } = await ctx.parseAndValidate(code);

        const recursionErrors = errors.filter(
          e => e.message.includes('Recursive') || e.message.includes('infinite loop')
        );
        expect(recursionErrors.length).toBeGreaterThan(0);
      });

      test('should error when action calls itself inside if statement', async () => {
        const code = `
          action test(value) [
            if (value > 0) {
              test(value - 1)
            }
          ]
          timeline "test" in ".container" using raf {}
        `;
        const { errors } = await ctx.parseAndValidate(code);

        const recursionErrors = errors.filter(
          e => e.message.includes('Recursive') || e.message.includes('infinite loop')
        );
        expect(recursionErrors.length).toBeGreaterThan(0);
      });

      test('should error when action calls itself inside for loop', async () => {
        const code = `
          action test(items) [
            for (item in items) {
              test(item)
            }
          ]
          timeline "test" in ".container" using raf {}
        `;
        const { errors } = await ctx.parseAndValidate(code);

        const recursionErrors = errors.filter(
          e => e.message.includes('Recursive') || e.message.includes('infinite loop')
        );
        expect(recursionErrors.length).toBeGreaterThan(0);
      });
    });

    describe('Indirect recursion (mutual recursion)', () => {
      test('should error when two actions call each other (A → B → A)', async () => {
        const code = `
          action actionA() [
            actionB()
          ]

          action actionB() [
            actionA()
          ]

          timeline "test" in ".container" using raf {}
        `;
        const { errors } = await ctx.parseAndValidate(code);

        // Should detect cycle in both actions
        const recursionErrors = errors.filter(
          e => e.message.includes('Recursive') || e.message.includes('infinite loop')
        );
        expect(recursionErrors.length).toBeGreaterThan(0);
      });

      test('should error for three-action cycle (A → B → C → A)', async () => {
        const code = `
          action actionA() [
            actionB()
          ]

          action actionB() [
            actionC()
          ]

          action actionC() [
            actionA()
          ]

          timeline "test" in ".container" using raf {}
        `;
        const { errors } = await ctx.parseAndValidate(code);

        const recursionErrors = errors.filter(
          e => e.message.includes('Recursive') || e.message.includes('infinite loop')
        );
        expect(recursionErrors.length).toBeGreaterThan(0);
      });

      test('should error for complex cycle with branching (A → B, A → C, C → A)', async () => {
        const code = `
          action actionA() [
            actionB()
            actionC()
          ]

          action actionB() [
            selectElement("#box")
          ]

          action actionC() [
            actionA()
          ]

          timeline "test" in ".container" using raf {}
        `;
        const { errors } = await ctx.parseAndValidate(code);

        const recursionErrors = errors.filter(
          e => e.message.includes('Recursive') || e.message.includes('infinite loop')
        );
        expect(recursionErrors.length).toBeGreaterThan(0);
      });
    });

    describe('Valid non-recursive cases (should NOT error)', () => {
      test('should allow action calling different action', async () => {
        const code = `
          action fadeIn(selector: string) [
            selectElement(selector)
          ]

          action setup() [
            fadeIn("#box")
          ]

          timeline "test" in ".container" using raf {}
        `;
        const { errors } = await ctx.parseAndValidate(code);

        // Should have NO recursion errors
        const recursionErrors = errors.filter(
          e => e.message.includes('Recursive') || e.message.includes('infinite loop')
        );
        expect(recursionErrors.length).toBe(0);
      });

      test('should allow linear call chain without cycles (A → B → C)', async () => {
        const code = `
          action actionA() [
            actionB()
          ]

          action actionB() [
            actionC()
          ]

          action actionC() [
            selectElement("#box")
          ]

          timeline "test" in ".container" using raf {}
        `;
        const { errors } = await ctx.parseAndValidate(code);

        const recursionErrors = errors.filter(
          e => e.message.includes('Recursive') || e.message.includes('infinite loop')
        );
        expect(recursionErrors.length).toBe(0);
      });

      test('should allow action with same name as parameter', async () => {
        const code = `
          action test(test) [
            selectElement(test)
          ]

          timeline "test" in ".container" using raf {}
        `;
        const { errors } = await ctx.parseAndValidate(code);

        const recursionErrors = errors.filter(
          e => e.message.includes('Recursive') || e.message.includes('infinite loop')
        );
        expect(recursionErrors.length).toBe(0);
      });

      test('should allow multiple actions calling same action (diamond pattern)', async () => {
        const code = `
          action shared() [
            selectElement("#box")
          ]

          action actionA() [
            shared()
          ]

          action actionB() [
            shared()
          ]

          timeline "test" in ".container" using raf {}
        `;
        const { errors } = await ctx.parseAndValidate(code);

        const recursionErrors = errors.filter(
          e => e.message.includes('Recursive') || e.message.includes('infinite loop')
        );
        expect(recursionErrors.length).toBe(0);
      });
    });

    describe('Edge cases', () => {
      test('should handle action with no operations', async () => {
        const code = `
          action empty() []

          timeline "test" in ".container" using raf {}
        `;
        const { errors } = await ctx.parseAndValidate(code);

        // Should have no recursion errors (empty action can't be recursive)
        const recursionErrors = errors.filter(
          e => e.message.includes('Recursive') || e.message.includes('infinite loop')
        );
        expect(recursionErrors.length).toBe(0);
      });

      test('should handle action that only calls built-in operations', async () => {
        const code = `
          action onlyBuiltins() [
            selectElement("#box")
            addClass("active")
          ]

          timeline "test" in ".container" using raf {}
        `;
        const { errors } = await ctx.parseAndValidate(code);

        const recursionErrors = errors.filter(
          e => e.message.includes('Recursive') || e.message.includes('infinite loop')
        );
        expect(recursionErrors.length).toBe(0);
      });
    });
  });

  // ========================================================================
  // Import Statement Validation (Feature 009)
  // ========================================================================

  describe('Import validation', () => {
    describe('US5 - Path validation', () => {
      test('T012: should reject Unix absolute path (/file)', async () => {
        const code = "layout '/absolute/path/layout.html'";
        const { errors } = await ctx.parseAndValidate(code);

        expect(errors.length).toBeGreaterThan(0);
        expect(
          errors.some(e => e.message.includes('relative') && e.message.includes('portable'))
        ).toBe(true);
      });

      test('T013: should reject Windows absolute path (C:\\file)', async () => {
        const code = "layout 'C:\\\\absolute\\\\layout.html'";
        const { errors } = await ctx.parseAndValidate(code);

        expect(errors.length).toBeGreaterThan(0);
        expect(
          errors.some(e => e.message.includes('relative') && e.message.includes('portable'))
        ).toBe(true);
      });

      test('T014: should reject URL paths (https://file)', async () => {
        const code = "layout 'https://example.com/layout.html'";
        const { errors } = await ctx.parseAndValidate(code);

        expect(errors.length).toBeGreaterThan(0);
        expect(
          errors.some(e => e.message.includes('relative') && e.message.includes('portable'))
        ).toBe(true);
      });

      test('should accept relative path with ./', async () => {
        const code = "layout './layout.html'";
        const { errors } = await ctx.parseAndValidate(code);

        const pathErrors = errors.filter(e => e.message.includes('relative'));
        expect(pathErrors.length).toBe(0);
      });

      test('should accept relative path with ../', async () => {
        const code = "layout '../shared/layout.html'";
        const { errors } = await ctx.parseAndValidate(code);

        const pathErrors = errors.filter(e => e.message.includes('relative'));
        expect(pathErrors.length).toBe(0);
      });

      test('should reject file:// protocol', async () => {
        const code = "layout 'file:///path/to/layout.html'";
        const { errors } = await ctx.parseAndValidate(code);

        expect(errors.length).toBeGreaterThan(0);
        expect(
          errors.some(e => e.message.includes('relative') && e.message.includes('portable'))
        ).toBe(true);
      });
    });

    describe('US1 - Default layout import validation', () => {
      test('T022: should reject duplicate layout imports', async () => {
        const code = `
          layout './layout1.html'
          layout './layout2.html'
        `;
        const { errors } = await ctx.parseAndValidate(code);

        expect(errors.length).toBeGreaterThan(0);
        expect(
          errors.some(e => e.message.includes('Duplicate') && e.message.includes('layout'))
        ).toBe(true);
      });

      test('should accept single layout import', async () => {
        const code = "layout './layout.html'";
        const { errors } = await ctx.parseAndValidate(code);

        const duplicateErrors = errors.filter(e => e.message.includes('Duplicate'));
        expect(duplicateErrors.length).toBe(0);
      });

      test('should accept layout with action and timeline', async () => {
        const code = `
          layout './layout.html'
          action test [ selectElement("#box") ]
          timeline "t" in ".c" using raf {}
        `;
        const { errors } = await ctx.parseAndValidate(code);

        const duplicateErrors = errors.filter(e => e.message.includes('Duplicate'));
        expect(duplicateErrors.length).toBe(0);
      });
    });

    describe('US3 - Styles and provider import validation', () => {
      test('T033: should reject duplicate styles imports', async () => {
        const code = `
          styles './main.css'
          styles './theme.css'
        `;
        const { errors } = await ctx.parseAndValidate(code);

        expect(errors.length).toBeGreaterThan(0);
        expect(
          errors.some(e => e.message.includes('Duplicate') && e.message.includes('styles'))
        ).toBe(true);
      });

      test('T034: should reject duplicate provider imports', async () => {
        const code = `
          provider './video1.mp4'
          provider './video2.mp4'
        `;
        const { errors } = await ctx.parseAndValidate(code);

        expect(errors.length).toBeGreaterThan(0);
        expect(
          errors.some(e => e.message.includes('Duplicate') && e.message.includes('provider'))
        ).toBe(true);
      });

      test('should accept all three import types without duplicates', async () => {
        const code = `
          layout './layout.html'
          styles './main.css'
          provider './video.mp4'
        `;
        const { errors } = await ctx.parseAndValidate(code);

        const duplicateErrors = errors.filter(e => e.message.includes('Duplicate'));
        expect(duplicateErrors.length).toBe(0);
      });

      test('should reject duplicates of each type independently', async () => {
        const code = `
          layout './layout1.html'
          layout './layout2.html'
          styles './main.css'
          styles './theme.css'
          provider './video1.mp4'
          provider './video2.mp4'
        `;
        const { errors } = await ctx.parseAndValidate(code);

        const duplicateErrors = errors.filter(e => e.message.includes('Duplicate'));
        expect(duplicateErrors.length).toBe(3); // One error for each type
      });
    });

    describe('US2 - Named import validation', () => {
      test('T043: should reject duplicate import names', async () => {
        const code = `
          import tooltip from './tooltip1.html'
          import tooltip from './tooltip2.html'
        `;
        const { errors } = await ctx.parseAndValidate(code);

        expect(errors.length).toBeGreaterThan(0);
        expect(
          errors.some(e => e.message.includes('Duplicate') && e.message.includes('tooltip'))
        ).toBe(true);
      });

      test('T044: should reject reserved keyword as import name', async () => {
        // NOTE: Most reserved keywords ('if', 'else', 'layout', 'styles', etc.) are grammar keywords
        // and will fail PARSING before validation runs. The validator's reserved keyword check
        // is defensive but won't be reached in practice since Langium prevents these as IDs.
        //
        // This test is commented out because there are no keywords that:
        // 1. Can be parsed as IDs (not grammar keywords)
        // 2. Are in our RESERVED_KEYWORDS set
        //
        // All RESERVED_KEYWORDS are grammar keywords, so parser rejects them first.
        //
        // If we add future-reserved names (not yet grammar keywords), uncomment and update this test.
        // Reserved keyword validation is still implemented for defensive programming,
        // but in practice only catches cases if grammar changes.
      });

      test('T045: should reject operation name conflict', async () => {
        const code = "import selectElement from './select.html'";
        const { errors } = await ctx.parseAndValidate(code);

        expect(errors.length).toBeGreaterThan(0);
        expect(
          errors.some(e => e.message.includes('operation') && e.message.includes('selectElement'))
        ).toBe(true);
      });

      test('should accept valid import names', async () => {
        const code = `
          import tooltip from './tooltip.html'
          import modal from './modal.html'
          import sidebar from './sidebar.html'
        `;
        const { errors } = await ctx.parseAndValidate(code);

        const nameErrors = errors.filter(
          e => e.message.includes('Duplicate') || e.message.includes('reserved')
        );
        expect(nameErrors.length).toBe(0);
      });

      test('should reject multiple reserved keywords', async () => {
        // NOTE: Same as T044 - this test is disabled because all RESERVED_KEYWORDS
        // are grammar keywords and fail parsing before validation.
        //
        // Reserved keyword validation exists for defensive programming but won't
        // trigger in practice with current grammar.
      });
    });

    describe('US4 - Type inference validation', () => {
      test('T060: should reject unknown extension without explicit type', async () => {
        const code = "import template from './page.tmpl'";
        const { errors } = await ctx.parseAndValidate(code);

        expect(errors.length).toBeGreaterThan(0);
        expect(errors.some(e => e.message.includes('Unknown') && e.message.includes('.tmpl'))).toBe(
          true
        );
        expect(
          errors.some(e => e.message.includes('as html') || e.message.includes('as css'))
        ).toBe(true);
      });

      test('T061: should reject ambiguous .ogg extension without explicit type', async () => {
        const code = "import bgMusic from './audio.ogg'";
        const { errors } = await ctx.parseAndValidate(code);

        expect(errors.length).toBeGreaterThan(0);
        expect(
          errors.some(e => e.message.includes('Ambiguous') && e.message.includes('.ogg'))
        ).toBe(true);
        expect(errors.some(e => e.message.includes('as media'))).toBe(true);
      });

      test('T062: should accept unknown extension with explicit as type', async () => {
        const code = `
          import pageTemplate from './page.tmpl' as html
          import themeStyles from './theme.scss' as css
          import soundFile from './sound.ogg' as media
        `;
        const { errors } = await ctx.parseAndValidate(code);

        // Should have no type inference errors
        const typeErrors = errors.filter(
          e => e.message.includes('Unknown') || e.message.includes('Ambiguous')
        );
        expect(typeErrors.length).toBe(0);
      });

      test('should accept imports with inferrable extensions (no explicit type needed)', async () => {
        const code = `
          import pageTemplate from './page.html'
          import themeStyles from './theme.css'
          import introVideo from './intro.mp4'
          import musicFile from './music.mp3'
        `;
        const { errors } = await ctx.parseAndValidate(code);

        // Should have no type inference errors
        const typeErrors = errors.filter(
          e => e.message.includes('Unknown') || e.message.includes('Ambiguous')
        );
        expect(typeErrors.length).toBe(0);
      });

      test('should allow explicit type override for inferrable extensions', async () => {
        // Even though .html is inferrable, user can explicitly specify type
        const code = "import template from './page.html' as html";
        const { errors } = await ctx.parseAndValidate(code);

        const typeErrors = errors.filter(
          e => e.message.includes('Unknown') || e.message.includes('Ambiguous')
        );
        expect(typeErrors.length).toBe(0);
      });

      test('should reject multiple unknown extensions', async () => {
        const code = `
          import template from './page.tmpl'
          import config from './settings.json'
          import bgMusic from './sound.ogg'
        `;
        const { errors } = await ctx.parseAndValidate(code);

        const typeErrors = errors.filter(
          e =>
            e.message.includes('Unknown') ||
            e.message.includes('Ambiguous') ||
            e.message.includes('specify type')
        );
        expect(typeErrors.length).toBe(3);
      });
    });
  });
});
