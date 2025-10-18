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

      expect(result.config.timelines).toHaveLength(1);
      expect(result.config.timelines[0].type).toBe('mediaplayer');
      expect(result.config.timelines[0].uri).toBe('test.mp4');
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

      expect(result.config.timelines).toHaveLength(1);
      expect(result.config.timelines[0].type).toBe('animation');
      expect(result.config.timelines[0].uri).toBe('test');
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

      expect(result.config.timelines[0].timelineActions).toHaveLength(1);
      const action = result.config.timelines[0].timelineActions[0];
      expect(action.duration.start).toBe(0);
      expect(action.duration.end).toBe(5);
      expect(action.startOperations).toHaveLength(2);
      expect(action.endOperations).toHaveLength(2);
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

      const action = result.config.timelines[0].timelineActions[0];
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

      expect(result.config.actions).toHaveLength(1);
      expect(result.config.actions[0].name).toBe('showHide');
      expect(result.config.actions[0].startOperations).toHaveLength(2);
      expect(result.config.actions[0].endOperations).toHaveLength(2);
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

      expect(result.config.actions).toHaveLength(1);
      expect(result.config.actions[0].name).toBe('highlight');
      expect(result.config.actions[0].startOperations).toHaveLength(2);
      expect(result.config.actions[0].endOperations).toHaveLength(0);
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

      const operation = result.config.actions[0].startOperations[0];
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

      const operation = result.config.actions[0].startOperations[1];
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

      const operation = result.config.actions[0].startOperations[1];
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
                    setData({ "operationdata.name": $scope.currentItem })
                ]
                timeline "test" using raf {}
            `;
      const program = await parseDSL(code);

      const result = await Effect.runPromise(transformAST(program));

      const operation = result.config.actions[0].startOperations[0];
      // T223: setData takes 'properties' parameter which contains the object
      expect(operation.operationData?.properties).toBeDefined();
      expect((operation.operationData?.properties as any)?.['operationdata.name']).toBe(
        'scope.currentItem'
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

      const operation = result.config.actions[0].startOperations[0];
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

      const action = result.config.timelines[0].timelineActions[0];
      expect(action.duration.start).toBe(42);
      expect(action.duration.end).toBe(100);
    });

    test('should transform relative time expressions (T189)', async () => {
      const code = `
                timeline "test" using raf {
                    at 0s..3s [
                        selectElement("#intro")
                    ] []

                    at +0s..+5s [
                        selectElement("#main")
                    ] []
                }
            `;
      const program = await parseDSL(code);

      const result = await Effect.runPromise(transformAST(program));

      const actions = result.config.timelines[0].timelineActions;
      expect(actions).toHaveLength(2);

      // First event: 0s..3s (absolute times)
      expect(actions[0].duration.start).toBe(0);
      expect(actions[0].duration.end).toBe(3);

      // Second event: +0s..+5s (relative to previous end: 3 + 0 = 3, 3 + 5 = 8)
      expect(actions[1].duration.start).toBe(3);
      expect(actions[1].duration.end).toBe(8);
    });

    test('should support mixed absolute and relative times (T189)', async () => {
      const code = `
                timeline "test" using raf {
                    at 0s..5s [
                        selectElement("#first")
                    ] []

                    at +2s..+7s [
                        selectElement("#second")
                    ] []
                }
            `;
      const program = await parseDSL(code);

      const result = await Effect.runPromise(transformAST(program));

      const actions = result.config.timelines[0].timelineActions;

      // First: 0s..5s
      expect(actions[0].duration.start).toBe(0);
      expect(actions[0].duration.end).toBe(5);

      // Second: +2s..+7s relative to 5 → 7..12
      expect(actions[1].duration.start).toBe(7);
      expect(actions[1].duration.end).toBe(12);
    });
  });

  describe('Sequence syntax (T190)', () => {
    test('should transform sequence block to sequential timeline events', async () => {
      const code = `
                endable action intro() [
                    selectElement("#intro")
                ] []

                endable action main() [
                    selectElement("#main")
                ] []

                endable action outro() [
                    selectElement("#outro")
                ] []

                timeline "test" using raf {
                    sequence {
                        intro() for 5s
                        main() for 10s
                        outro() for 3s
                    }
                }
            `;
      const program = await parseDSL(code);

      const result = await Effect.runPromise(transformAST(program));

      const actions = result.config.timelines[0].timelineActions;
      expect(actions).toHaveLength(3);

      // First: intro() for 5s → 0-5s
      expect(actions[0].duration.start).toBe(0);
      expect(actions[0].duration.end).toBe(5);
      expect(actions[0].startOperations[0].operationData?.systemName).toBe('intro');

      // Second: main() for 10s → 5-15s
      expect(actions[1].duration.start).toBe(5);
      expect(actions[1].duration.end).toBe(15);
      expect(actions[1].startOperations[0].operationData?.systemName).toBe('main');

      // Third: outro() for 3s → 15-18s
      expect(actions[2].duration.start).toBe(15);
      expect(actions[2].duration.end).toBe(18);
      expect(actions[2].startOperations[0].operationData?.systemName).toBe('outro');
    });

    test('should support sequence with parameterized actions', async () => {
      const code = `
                endable action fadeIn(selector, duration) [
                    selectElement($operationdata.selector)
                ] []

                timeline "test" using raf {
                    sequence {
                        fadeIn(".title", 1000) for 2s
                        fadeIn(".content", 500) for 3s
                    }
                }
            `;
      const program = await parseDSL(code);

      const result = await Effect.runPromise(transformAST(program));

      const actions = result.config.timelines[0].timelineActions;
      expect(actions).toHaveLength(2);

      // First: fadeIn(".title", 1000) for 2s → 0-2s
      expect(actions[0].duration.start).toBe(0);
      expect(actions[0].duration.end).toBe(2);
      expect(actions[0].startOperations[1].operationData?.actionOperationData).toEqual({
        selector: '.title',
        duration: 1000,
      });

      // Second: fadeIn(".content", 500) for 3s → 2-5s
      expect(actions[1].duration.start).toBe(2);
      expect(actions[1].duration.end).toBe(5);
      expect(actions[1].startOperations[1].operationData?.actionOperationData).toEqual({
        selector: '.content',
        duration: 500,
      });
    });

    test('should support mixing sequence blocks with regular timed events', async () => {
      const code = `
                endable action step1() [
                    selectElement("#step1")
                ] []

                endable action step2() [
                    selectElement("#step2")
                ] []

                timeline "test" using raf {
                    sequence {
                        step1() for 3s
                        step2() for 2s
                    }

                    at 10s..15s [
                        selectElement("#manual")
                    ] []
                }
            `;
      const program = await parseDSL(code);

      const result = await Effect.runPromise(transformAST(program));

      const actions = result.config.timelines[0].timelineActions;
      expect(actions).toHaveLength(3);

      // Sequence items: 0-3s, 3-5s
      expect(actions[0].duration.start).toBe(0);
      expect(actions[0].duration.end).toBe(3);

      expect(actions[1].duration.start).toBe(3);
      expect(actions[1].duration.end).toBe(5);

      // Regular timed event: 10-15s
      expect(actions[2].duration.start).toBe(10);
      expect(actions[2].duration.end).toBe(15);
    });
  });

  describe('Stagger syntax (T192)', () => {
    test('should transform stagger block with action call to multiple timeline events', async () => {
      const code = `
                endable action fadeIn(selector) [
                    selectElement($operationdata.selector)
                    addClass("visible")
                ] []

                timeline "test" using raf {
                    stagger 200ms [".item-1", ".item-2", ".item-3"] with fadeIn() for 2s
                }
            `;
      const program = await parseDSL(code);

      const result = await Effect.runPromise(transformAST(program));

      const actions = result.config.timelines[0].timelineActions;
      expect(actions).toHaveLength(3);

      // First item: starts at 0s (0 + 0*200ms), ends at 2s
      expect(actions[0].duration.start).toBe(0);
      expect(actions[0].duration.end).toBe(2);
      // Check that selector is passed via actionOperationData
      expect(actions[0].startOperations[1].operationData?.actionOperationData).toEqual({
        selector: '.item-1',
      });

      // Second item: starts at 0.2s (0 + 1*200ms), ends at 2.2s
      expect(actions[1].duration.start).toBe(0.2);
      expect(actions[1].duration.end).toBe(2.2);
      expect(actions[1].startOperations[1].operationData?.actionOperationData).toEqual({
        selector: '.item-2',
      });

      // Third item: starts at 0.4s (0 + 2*200ms), ends at 2.4s
      expect(actions[2].duration.start).toBe(0.4);
      expect(actions[2].duration.end).toBe(2.4);
      expect(actions[2].startOperations[1].operationData?.actionOperationData).toEqual({
        selector: '.item-3',
      });
    });

    test('should transform stagger block with inline operations', async () => {
      const code = `
                timeline "test" using raf {
                    stagger 100ms [".box-1", ".box-2"] for 1s [
                        selectElement(@@currentItem)
                        addClass("active")
                    ] [
                        selectElement(@@currentItem)
                        removeClass("active")
                    ]
                }
            `;
      const program = await parseDSL(code);

      const result = await Effect.runPromise(transformAST(program));

      const actions = result.config.timelines[0].timelineActions;
      expect(actions).toHaveLength(2);

      // First item: 0s-1s
      expect(actions[0].duration.start).toBe(0);
      expect(actions[0].duration.end).toBe(1);
      // Should have operations with @@currentItem reference compiled to scope.currentItem
      expect(actions[0].startOperations).toHaveLength(2);
      expect(actions[0].endOperations).toHaveLength(2);

      // Second item: 0.1s-1.1s (100ms delay)
      expect(actions[1].duration.start).toBe(0.1);
      expect(actions[1].duration.end).toBe(1.1);
    });

    test('should support stagger after other timeline events', async () => {
      const code = `
                endable action show(selector) [
                    selectElement($operationdata.selector)
                ] []

                timeline "test" using raf {
                    at 0s..5s [
                        selectElement("#intro")
                    ] []

                    stagger 300ms [".card-1", ".card-2"] with show() for 1s
                }
            `;
      const program = await parseDSL(code);

      const result = await Effect.runPromise(transformAST(program));

      const actions = result.config.timelines[0].timelineActions;
      expect(actions).toHaveLength(3);

      // First regular event: 0-5s
      expect(actions[0].duration.start).toBe(0);
      expect(actions[0].duration.end).toBe(5);

      // Stagger starts after previous event ends (at 5s)
      // First stagger item: 5s-6s
      expect(actions[1].duration.start).toBe(5);
      expect(actions[1].duration.end).toBe(6);

      // Second stagger item: 5.3s-6.3s (5 + 300ms delay)
      expect(actions[2].duration.start).toBe(5.3);
      expect(actions[2].duration.end).toBe(6.3);
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
      expect(result.config.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      ); // UUID v4
      expect(result.config.engine.systemName).toBe('EligiusEngine');
      expect(result.config.containerSelector).toBe('body');
      expect(result.config.language).toBe('en-US');
      expect(result.config.layoutTemplate).toBe('default');
      expect(result.config.availableLanguages).toHaveLength(1);
      expect(result.config.availableLanguages[0].id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
      expect(result.config.availableLanguages[0].languageCode).toBe('en-US');
      expect(result.config.availableLanguages[0].label).toBe('English');

      // Check timelines
      expect(result.config.timelines).toHaveLength(1);
      expect(result.config.timelines[0].type).toBe('animation');
      expect(result.config.timelines[0].timelineActions).toHaveLength(1);

      // Check action layers
      expect(result.config.initActions).toEqual([]);
      expect(result.config.actions).toEqual([]);
      expect(result.config.eventActions).toEqual([]);

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

      expect(result.config.timelines[0].type).toBe('mediaplayer');
      expect(result.config.timelines[0].uri).toBe('test.mp4');
      expect(result.config.timelines[0].timelineActions).toHaveLength(3);
      expect(result.config.actions).toHaveLength(1); // intro action definition
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

      // Check that source locations are included in SourceMap
      expect(result.sourceMap.root).toBeDefined();
      expect(result.sourceMap.root.line).toBeGreaterThan(0);

      // Check that timeline IDs are tracked in SourceMap
      const timelineId = result.config.timelines[0].id;
      expect(result.sourceMap.timelines.has(timelineId)).toBe(true);

      // Check that timeline action IDs are tracked in SourceMap
      const actionId = result.config.timelines[0].timelineActions[0].id;
      expect(result.sourceMap.timelineActions.has(actionId)).toBe(true);
    });

    test('should handle programs with no events gracefully', async () => {
      const code = 'timeline "test" using raf {}';
      const program = await parseDSL(code);

      const result = await Effect.runPromise(transformAST(program));

      expect(result.config.timelines[0].type).toBe('animation');
      expect(result.config.timelines[0].timelineActions).toHaveLength(0);
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

      expect(result.config.actions).toHaveLength(1);
      expect(result.config.actions[0].startOperations).toHaveLength(2);
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

  describe('Break and Continue Statement Transformation', () => {
    test('should transform break to breakForEach operation', async () => {
      const code = `
        action test [
          for (item in ["a", "b", "c"]) {
            break
          }
        ]
        timeline "test" using raf {}
      `;
      const program = await parseDSL(code);

      const result = await Effect.runPromise(transformAST(program));

      const action = result.config.actions[0];
      const breakOp = action.startOperations.find(op => op.systemName === 'breakForEach');

      expect(breakOp).toBeDefined();
      expect(breakOp?.operationData).toEqual({});
      expect(breakOp?.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    test('should transform continue to continueForEach operation', async () => {
      const code = `
        action test [
          for (item in ["a", "b", "c"]) {
            continue
          }
        ]
        timeline "test" using raf {}
      `;
      const program = await parseDSL(code);

      const result = await Effect.runPromise(transformAST(program));

      const action = result.config.actions[0];
      const continueOp = action.startOperations.find(op => op.systemName === 'continueForEach');

      expect(continueOp).toBeDefined();
      expect(continueOp?.operationData).toEqual({});
      expect(continueOp?.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    test('should transform conditional break and continue inside loops', async () => {
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
        timeline "test" using raf {}
      `;
      const program = await parseDSL(code);

      const result = await Effect.runPromise(transformAST(program));

      const action = result.config.actions[0];
      const continueOp = action.startOperations.find(op => op.systemName === 'continueForEach');
      const breakOp = action.startOperations.find(op => op.systemName === 'breakForEach');

      expect(continueOp).toBeDefined();
      expect(continueOp?.operationData).toEqual({});

      expect(breakOp).toBeDefined();
      expect(breakOp?.operationData).toEqual({});
    });
  });

  describe('BUG-001: Reference expressions in operation arguments', () => {
    // BUG-001 FIX (T325): Removed .failing() - tests should now pass
    test('should handle @@loopVar in for-loop operations', async () => {
      const code = `
        action test() [
          for (item in ["intro", "main", "outro"]) {
            selectElement(@@item)
          }
        ]
        timeline "test" using raf {}
      `;
      const program = await parseDSL(code);

      const result = await Effect.runPromise(transformAST(program));

      // Find the forEach operation
      const action = result.config.actions[0];
      const forEachOp = action.startOperations.find(op => op.systemName === 'forEach');
      expect(forEachOp).toBeDefined();

      // Find the selectElement operation inside the forEach body
      const selectOp = action.startOperations.find(op => op.systemName === 'selectElement');
      expect(selectOp).toBeDefined();

      // ❌ BUG: This currently produces {} but should have selector
      expect(selectOp?.operationData).toEqual({
        selector: '$scope.currentItem', // @@item should be aliased to currentItem
      });
    });

    test('should handle @varName in action operations', async () => {
      const code = `
        action test() [
          const selector = "#box"
          selectElement(@selector)
        ]
        timeline "test" using raf {}
      `;
      const program = await parseDSL(code);

      const result = await Effect.runPromise(transformAST(program));

      const action = result.config.actions[0];
      const selectOp = action.startOperations.find(op => op.systemName === 'selectElement');

      // ❌ BUG: This currently produces {} but should have selector
      expect(selectOp?.operationData).toEqual({
        selector: '$scope.variables.selector', // @selector → $scope.variables.selector
      });
    });

    test('should handle parameter references in action operations', async () => {
      const code = `
        action test(selector, duration) [
          selectElement(selector)
          animate({opacity: 1}, duration)
        ]
        timeline "test" using raf {}
      `;
      const program = await parseDSL(code);

      const result = await Effect.runPromise(transformAST(program));

      const action = result.config.actions[0];
      const selectOp = action.startOperations.find(op => op.systemName === 'selectElement');
      const animateOp = action.startOperations.find(op => op.systemName === 'animate');

      // ❌ BUG: These currently produce {} but should have proper references
      expect(selectOp?.operationData).toEqual({
        selector: '$operationdata.selector', // selector → $operationdata.selector
      });

      expect(animateOp?.operationData?.animationDuration).toBe('$operationdata.duration');
    });
  });
});
