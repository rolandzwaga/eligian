import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Effect } from 'effect';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { beforeAll, describe, expect, test } from 'vitest';
import { createEligianServices } from '../../eligian-module.js';
import type { Program } from '../../generated/ast.js';
import { transformAST } from '../ast-transformer.js';

describe('AST Transformer', () => {
  let services: ReturnType<typeof createEligianServices>;
  let parse: ReturnType<typeof parseHelper<Program>>;

  beforeAll(async () => {
    services = createEligianServices(EmptyFileSystem);
    parse = parseHelper<Program>(services.Eligian);
  });

  /**
   * Helper: Parse DSL code
   */
  async function parseDSL(code: string): Promise<Program> {
    const document = await parse(code);
    if (document.parseResult.parserErrors.length > 0) {
      throw new Error(
        `Parse errors: ${document.parseResult.parserErrors.map(e => e.message).join(', ')}`
      );
    }
    return document.parseResult.value;
  }

  /**
   * Helper: Load fixture file
   */
  function _loadFixture(filename: string): string {
    const path = join(__dirname, '__fixtures__', filename);
    return readFileSync(path, 'utf-8');
  }

  describe('Timeline transformation (T050)', () => {
    test('should transform video timeline with source', async () => {
      const code = `
                timeline "test" using video from "test.mp4" {
                    at 0s..5s [
                        selectElement("#el")
                    ] [
                    ]
                }
            `;
      const program = await parseDSL(code);

      const result = await Effect.runPromise(transformAST(program));

      expect(result.timelines).toHaveLength(1);
      expect(result.timelines[0].type).toBe('video');
      expect(result.timelines[0].uri).toBe('test.mp4');
      expect(result.timelines[0].sourceLocation).toBeDefined();
      expect(result.timelines[0].sourceLocation.line).toBeGreaterThan(0);
    });

    test('should transform raf timeline without source', async () => {
      const code = `
                timeline "test" using raf {
                    at 0s..5s [
                        selectElement("#el")
                    ] [
                    ]
                }
            `;
      const program = await parseDSL(code);

      const result = await Effect.runPromise(transformAST(program));

      expect(result.timelines).toHaveLength(1);
      expect(result.timelines[0].type).toBe('raf');
      expect(result.timelines[0].uri).toBeUndefined();
    });
  });

  describe('Timeline Event transformation (T051)', () => {
    test('should transform inline endable action to TimelineAction', async () => {
      const code = `
                timeline "test" using raf {
                    at 0s..5s [
                        selectElement("#title")
                        addClass("visible")
                    ] [
                        selectElement("#title")
                        removeClass("visible")
                    ]
                }
            `;
      const program = await parseDSL(code);

      const result = await Effect.runPromise(transformAST(program));

      expect(result.timelines[0].timelineActions).toHaveLength(1);
      const action = result.timelines[0].timelineActions[0];
      expect(action.duration.start).toBe(0);
      expect(action.duration.end).toBe(5);
      expect(action.startOperations).toHaveLength(2);
      expect(action.endOperations).toHaveLength(2);
      expect(action.sourceLocation).toBeDefined();
    });

    test('should handle named action invocation', async () => {
      const code = `
                endable action fadeIn [
                    selectElement(".target")
                    addClass("visible")
                ] [
                    selectElement(".target")
                    removeClass("visible")
                ]

                timeline "test" using raf {
                    at 10s..20s {
                        fadeIn()
                    }
                }
            `;
      const program = await parseDSL(code);

      const result = await Effect.runPromise(transformAST(program));

      const action = result.timelines[0].timelineActions[0];
      expect(action.duration.start).toBe(10);
      expect(action.duration.end).toBe(20);
      // Named action invocations emit requestAction + startAction operations
      expect(action.startOperations).toHaveLength(2);
      expect(action.startOperations[0].systemName).toBe('requestAction');
      expect(action.startOperations[0].operationData?.systemName).toBe('fadeIn');
      expect(action.startOperations[1].systemName).toBe('startAction');
      expect(action.startOperations[1].operationData).toEqual({});
      // End operations: requestAction + endAction
      expect(action.endOperations).toHaveLength(2);
      expect(action.endOperations[0].systemName).toBe('requestAction');
      expect(action.endOperations[0].operationData?.systemName).toBe('fadeIn');
      expect(action.endOperations[1].systemName).toBe('endAction');
      expect(action.endOperations[1].operationData).toEqual({});
    });
  });

  describe('Action Definition transformation', () => {
    test('should transform endable action definition', async () => {
      const code = `
                endable action showHide [
                    selectElement("#box")
                    addClass("visible")
                ] [
                    selectElement("#box")
                    removeClass("visible")
                ]

                timeline "test" using raf {}
            `;
      const program = await parseDSL(code);

      const result = await Effect.runPromise(transformAST(program));

      expect(result.actions).toHaveLength(1);
      expect(result.actions[0].name).toBe('showHide');
      expect(result.actions[0].startOperations).toHaveLength(2);
      expect(result.actions[0].endOperations).toHaveLength(2);
    });

    test('should transform regular action definition', async () => {
      const code = `
                action highlight [
                    selectElement(".target")
                    addClass("highlight")
                ]

                timeline "test" using raf {}
            `;
      const program = await parseDSL(code);

      const result = await Effect.runPromise(transformAST(program));

      expect(result.actions).toHaveLength(1);
      expect(result.actions[0].name).toBe('highlight');
      expect(result.actions[0].startOperations).toHaveLength(2);
      expect(result.actions[0].endOperations).toHaveLength(0);
    });
  });

  describe('Operation Call transformation (T053)', () => {
    test('should transform operation with string argument', async () => {
      const code = `
                action test [
                    selectElement("#myId")
                ]
                timeline "test" using raf {}
            `;
      const program = await parseDSL(code);

      const result = await Effect.runPromise(transformAST(program));

      const operation = result.actions[0].startOperations[0];
      expect(operation.systemName).toBe('selectElement');
      // T223: Now uses named parameters from operation signature
      expect(operation.operationData?.selector).toBe('#myId');
    });

    test('should transform operation with object literal', async () => {
      const code = `
                action test [
                    selectElement("#el")
                    setStyle({ opacity: 0, color: "red" })
                ]
                timeline "test" using raf {}
            `;
      const program = await parseDSL(code);

      const result = await Effect.runPromise(transformAST(program));

      const operation = result.actions[0].startOperations[1];
      expect(operation.systemName).toBe('setStyle');
      // T223: Object literal mapped to 'properties' parameter
      expect(operation.operationData?.properties).toBeDefined();
      expect((operation.operationData?.properties as any)?.opacity).toBe(0);
      expect((operation.operationData?.properties as any)?.color).toBe('red');
    });

    test('should transform operation with multiple arguments', async () => {
      const code = `
                action test [
                    selectElement("#el")
                    animate({ opacity: 1 }, 500, "ease")
                ]
                timeline "test" using raf {}
            `;
      const program = await parseDSL(code);

      const result = await Effect.runPromise(transformAST(program));

      const operation = result.actions[0].startOperations[1];
      expect(operation.systemName).toBe('animate');
      // T223: Multiple arguments mapped to named parameters
      expect(operation.operationData?.animationProperties).toBeDefined();
      expect(operation.operationData?.animationDuration).toBe(500);
      expect(operation.operationData?.animationEasing).toBe('ease');
    });
  });

  describe('Expression transformation', () => {
    test('should transform property chain references', async () => {
      const code = `
                action test [
                    setData({ "operationdata.name": $context.currentItem })
                ]
                timeline "test" using raf {}
            `;
      const program = await parseDSL(code);

      const result = await Effect.runPromise(transformAST(program));

      const operation = result.actions[0].startOperations[0];
      // T223: setData takes 'properties' parameter which contains the object
      expect(operation.operationData?.properties).toBeDefined();
      expect((operation.operationData?.properties as any)?.['operationdata.name']).toBe(
        'context.currentItem'
      );
    });

    test('should evaluate binary expressions with numbers', async () => {
      const code = `
                action test [
                    wait(10)
                ]
                timeline "test" using raf {}
            `;
      const program = await parseDSL(code);

      const result = await Effect.runPromise(transformAST(program));

      const operation = result.actions[0].startOperations[0];
      expect(operation.systemName).toBe('wait');
      // T223: Now uses named parameter 'milliseconds'
      expect(operation.operationData?.milliseconds).toBe(10);
    });
  });

  describe('Time expression transformation (T054)', () => {
    test('should transform number literals in duration', async () => {
      const code = `
                timeline "test" using raf {
                    at 42s..100s [
                        selectElement("#el")
                    ] [
                    ]
                }
            `;
      const program = await parseDSL(code);

      const result = await Effect.runPromise(transformAST(program));

      const action = result.timelines[0].timelineActions[0];
      expect(action.duration.start).toBe(42);
      expect(action.duration.end).toBe(100);
    });
  });

  describe('transformAST (T055) - Full program transformation', () => {
    test('should transform simple program to complete IEngineConfiguration IR', async () => {
      const code = `
                timeline "test" using raf {
                    at 0s..5s [
                        selectElement("#el")
                    ] [
                    ]
                }
            `;
      const program = await parseDSL(code);

      const result = await Effect.runPromise(transformAST(program));

      // Check required IEngineConfiguration fields (Constitution VII: UUIDs)
      expect(result.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      ); // UUID v4
      expect(result.engine.systemName).toBe('Eligius');
      expect(result.containerSelector).toBe('body');
      expect(result.language).toBe('en-US');
      expect(result.layoutTemplate).toBe('default');
      expect(result.availableLanguages).toEqual([{ code: 'en', label: 'English' }]);

      // Check timelines
      expect(result.timelines).toHaveLength(1);
      expect(result.timelines[0].type).toBe('raf');
      expect(result.timelines[0].timelineActions).toHaveLength(1);

      // Check action layers
      expect(result.initActions).toEqual([]);
      expect(result.actions).toEqual([]);
      expect(result.eventActions).toEqual([]);

      // Check metadata
      expect(result.metadata).toBeDefined();
      expect(result.metadata?.dslVersion).toBe('1.0.0');
    });

    test('should transform complex program with multiple events', async () => {
      const code = `
                endable action intro [
                    selectElement("#title")
                    addClass("visible")
                ] [
                    selectElement("#title")
                    removeClass("visible")
                ]

                timeline "main" using video from "test.mp4" {
                    at 0s..5s {
                        intro()
                    }

                    at 5s..10s [
                        selectElement("#content")
                        addClass("visible")
                    ] [
                        selectElement("#content")
                        removeClass("visible")
                    ]

                    at 10s..15s [
                        selectElement("#footer")
                    ] [
                    ]
                }
            `;
      const program = await parseDSL(code);

      const result = await Effect.runPromise(transformAST(program));

      expect(result.timelines[0].type).toBe('video');
      expect(result.timelines[0].uri).toBe('test.mp4');
      expect(result.timelines[0].timelineActions).toHaveLength(3);
      expect(result.actions).toHaveLength(1); // intro action definition
    });

    test('should include source locations (T057)', async () => {
      const code = `
                timeline "test" using raf {
                    at 0s..5s [
                        selectElement("#el")
                    ] [
                    ]
                }
            `;
      const program = await parseDSL(code);

      const result = await Effect.runPromise(transformAST(program));

      // Check that source locations are included
      expect(result.sourceLocation).toBeDefined();
      expect(result.sourceLocation.line).toBeGreaterThan(0);
      expect(result.timelines[0].sourceLocation).toBeDefined();
      expect(result.timelines[0].timelineActions[0].sourceLocation).toBeDefined();
      expect(
        result.timelines[0].timelineActions[0].startOperations[0].sourceLocation
      ).toBeDefined();
    });

    test('should handle programs with no events gracefully', async () => {
      const code = 'timeline "test" using raf {}';
      const program = await parseDSL(code);

      const result = await Effect.runPromise(transformAST(program));

      expect(result.timelines[0].type).toBe('raf');
      expect(result.timelines[0].timelineActions).toHaveLength(0);
    });
  });

  describe('Error handling (T056)', () => {
    test('should fail when timeline is missing', async () => {
      const code = `
                endable action test [
                    selectElement("#el")
                ] [
                ]
            `;
      const program = await parseDSL(code);

      const result = Effect.runPromise(transformAST(program));

      // Effect wraps errors in FiberFailure, so check the message
      await expect(result).rejects.toThrow('InvalidTimeline');
    });

    test('should include error location in transform errors', async () => {
      const code = `
                action test [
                    selectElement("#el")
                ]
            `;
      const program = await parseDSL(code);

      try {
        await Effect.runPromise(transformAST(program));
        fail('Should have thrown');
      } catch (error: any) {
        // Effect wraps errors, check the message contains our error
        expect(error.message).toContain('TransformError');
        expect(error.message).toContain('InvalidTimeline');
      }
    });
  });

  describe('T218: Operation Validation in Transformer', () => {
    test('should fail transformation with unknown operation', async () => {
      const code = `
                action test [
                    unknownOperation("test")
                ]
                timeline "test" using raf {}
            `;
      const program = await parseDSL(code);

      const result = Effect.runPromise(transformAST(program));

      await expect(result).rejects.toThrow();
    });

    test('should fail transformation with too many parameters', async () => {
      const code = `
                action test [
                    addClass("visible", "extra", "tooMany")
                ]
                timeline "test" using raf {}
            `;
      const program = await parseDSL(code);

      const result = Effect.runPromise(transformAST(program));

      await expect(result).rejects.toThrow();
    });

    test('should fail transformation with too few parameters', async () => {
      const code = `
                action test [
                    addClass()
                ]
                timeline "test" using raf {}
            `;
      const program = await parseDSL(code);

      const result = Effect.runPromise(transformAST(program));

      await expect(result).rejects.toThrow();
    });

    test('should succeed with valid operation and parameter count', async () => {
      const code = `
                action test [
                    selectElement("#el")
                    addClass("visible")
                ]
                timeline "test" using raf {}
            `;
      const program = await parseDSL(code);

      const result = await Effect.runPromise(transformAST(program));

      expect(result.actions).toHaveLength(1);
      expect(result.actions[0].startOperations).toHaveLength(2);
    });

    test('should validate all operations in a sequence', async () => {
      const code = `
                action test [
                    selectElement("#el")
                    unknownOp()
                    addClass("visible")
                ]
                timeline "test" using raf {}
            `;
      const program = await parseDSL(code);

      const result = Effect.runPromise(transformAST(program));

      // Should fail on unknownOp
      await expect(result).rejects.toThrow();
    });

    test('should provide helpful error message for unknown operation', async () => {
      const code = `
                action test [
                    addClas("test")
                ]
                timeline "test" using raf {}
            `;
      const program = await parseDSL(code);

      try {
        await Effect.runPromise(transformAST(program));
        fail('Should have thrown');
      } catch (error: any) {
        // Should include suggestion for typo
        expect(error.message).toContain('addClas');
      }
    });
  });
});
