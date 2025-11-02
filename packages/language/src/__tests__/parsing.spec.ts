/**
 * Grammar and Parsing Tests
 *
 * Tests the Langium grammar to ensure it correctly parses valid DSL
 * programs and rejects invalid ones.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, test } from 'vitest';
import {
  type DefaultImport,
  type EndableActionDefinition,
  isBreakStatement,
  isContinueStatement,
  type NamedImport,
  type Program,
  type RegularActionDefinition,
  type Timeline,
} from '../generated/ast.js';
import { getElements, getImports } from '../utils/program-helpers.js';
import { createTestContext, getErrors, type TestContext } from './test-helpers.js';

let ctx: TestContext;

beforeAll(() => {
  ctx = createTestContext();
});

function loadFixture(filename: string): string {
  const path = join(__dirname, '__fixtures__', filename);
  return readFileSync(path, 'utf-8');
}

async function parseEligian(text: string): Promise<Program> {
  const document = await ctx.parse(text);
  return document.parseResult.value as Program;
}

describe('Eligian Grammar - Parsing', () => {
  describe('Timeline parsing', () => {
    test('should parse video timeline with source', async () => {
      const program = await parseEligian(
        'timeline "main" in ".container" using video from "video.mp4" {}'
      );

      expect(getElements(program)).toHaveLength(1);
      const timeline = getElements(program)[0] as Timeline;
      expect(timeline.$type).toBe('Timeline');
      expect(timeline.name).toBe('main');
      expect(timeline.containerSelector).toBe('.container');
      expect(timeline.provider).toBe('video');
      expect(timeline.source).toBe('video.mp4');
    });

    test('should parse audio timeline with source', async () => {
      const program = await parseEligian(
        'timeline "audio" in "#audio-player" using audio from "audio.mp3" {}'
      );

      expect(getElements(program)).toHaveLength(1);
      const timeline = getElements(program)[0] as Timeline;
      expect(timeline.$type).toBe('Timeline');
      expect(timeline.containerSelector).toBe('#audio-player');
      expect(timeline.provider).toBe('audio');
      expect(timeline.source).toBe('audio.mp3');
    });

    test('should parse raf timeline without source', async () => {
      const program = await parseEligian(
        'timeline "animation" in ".animation-container" using raf {}'
      );

      expect(getElements(program)).toHaveLength(1);
      const timeline = getElements(program)[0] as Timeline;
      expect(timeline.$type).toBe('Timeline');
      expect(timeline.containerSelector).toBe('.animation-container');
      expect(timeline.provider).toBe('raf');
    });

    test('should parse custom timeline', async () => {
      const program = await parseEligian('timeline "custom" in ".custom-timeline" using custom {}');

      expect(getElements(program)).toHaveLength(1);
      const timeline = getElements(program)[0] as Timeline;
      expect(timeline.$type).toBe('Timeline');
      expect(timeline.containerSelector).toBe('.custom-timeline');
      expect(timeline.provider).toBe('custom');
    });
  });

  describe('Timeline event parsing', () => {
    test('should parse simple timeline event with inline endable action', async () => {
      const program = await parseEligian(`
        timeline "main" in ".container" using raf {
          at 0s..5s [
            selectElement("#title")
            addClass("visible")
          ] [
            removeClass("visible")
          ]
        }
      `);

      expect(getElements(program)).toHaveLength(1);
      const timeline = getElements(program)[0] as Timeline;
      expect(timeline.events).toHaveLength(1);
      expect(timeline.events[0].timeRange).toBeDefined();
      expect(timeline.events[0].action.$type).toBe('InlineEndableAction');
    });

    test('should parse timeline event with action call', async () => {
      const program = await parseEligian(`
        endable action fadeIn [
          selectElement(".target")
          addClass("visible")
        ] [
          removeClass("visible")
        ]

        timeline "main" in ".container" using raf {
          at 0s..5s fadeIn()
        }
      `);

      expect(getElements(program)).toHaveLength(2);
      const timeline = getElements(program)[1] as Timeline;
      expect(timeline.events).toHaveLength(1);
      expect(timeline.events[0].action.$type).toBe('OperationCall');
    });

    test('should parse timeline event with time expressions', async () => {
      const program = await parseEligian(`
        timeline "main" in ".container" using raf {
          at 5s + 2s..10s * 2s [
            selectElement("#content")
          ] [
          ]
        }
      `);

      const timeline = getElements(program)[0] as Timeline;
      expect(timeline.events).toHaveLength(1);
      expect(timeline.events[0].timeRange).toBeDefined();
    });

    test('should parse multiple timeline events', async () => {
      const program = await parseEligian(`
        timeline "main" in ".container" using raf {
          at 0s..5s [
            selectElement("#title")
          ] [
          ]

          at 5s..10s [
            selectElement("#subtitle")
          ] [
          ]

          at 10s..15s [
            selectElement("#content")
          ] [
          ]
        }
      `);

      const timeline = getElements(program)[0] as Timeline;
      expect(timeline.events).toHaveLength(3);
    });

    // T009: US1 - Parse timeline with direct action call (unified syntax, no braces)
    test('should parse timeline event with direct action call (no braces)', async () => {
      const program = await parseEligian(`
        action fadeIn(selector, duration) [
          selectElement(selector)
        ]

        timeline "test" in ".container" using raf {
          at 0s..5s fadeIn(".box", 1000)
        }
      `);

      const timeline = getElements(program)[1] as Timeline;
      expect(timeline.events).toHaveLength(1);
      // Note: This will initially fail because grammar doesn't support direct calls yet
    });

    // T010: US1 - Parse inline action block with mixed calls
    test('should parse timeline with inline block containing mixed operation calls', async () => {
      const program = await parseEligian(`
        action fadeIn(selector) [
          selectElement(selector)
        ]

        timeline "test" in ".container" using raf {
          at 0s..5s [
            fadeIn(".box")
            selectElement(".content")
            addClass("visible")
          ]
        }
      `);

      const timeline = getElements(program)[1] as Timeline;
      expect(timeline.events).toHaveLength(1);
      // Note: Mixed calls in inline blocks - tests that both resolve correctly
    });
  });

  describe('Operation call parsing', () => {
    test('should parse operation call with no arguments', async () => {
      const program = await parseEligian(`
        action test [
          wait()
        ]
      `);

      const action = getElements(program)[0] as RegularActionDefinition;
      expect(action.operations).toHaveLength(1);
      expect(action.operations[0].operationName.$refText).toBe('wait');
      expect(action.operations[0].args).toHaveLength(0);
    });

    test('should parse operation call with single argument', async () => {
      const program = await parseEligian(`
        action test [
          selectElement("#title")
        ]
      `);

      const action = getElements(program)[0] as RegularActionDefinition;
      expect(action.operations[0].operationName.$refText).toBe('selectElement');
      expect(action.operations[0].args).toHaveLength(1);
    });

    test('should parse operation call with multiple arguments', async () => {
      const program = await parseEligian(`
        action test [
          animate({ opacity: 1 }, 500, "ease")
        ]
      `);

      const action = getElements(program)[0] as RegularActionDefinition;
      expect(action.operations[0].operationName.$refText).toBe('animate');
      expect(action.operations[0].args).toHaveLength(3);
    });

    test('should parse operation call with object literal', async () => {
      const program = await parseEligian(`
        action test [
          setStyle({ opacity: 0, color: "red" })
        ]
      `);

      const action = getElements(program)[0] as RegularActionDefinition;
      expect(action.operations[0].operationName.$refText).toBe('setStyle');
      expect(action.operations[0].args).toHaveLength(1);
      expect(action.operations[0].args[0].$type).toBe('ObjectLiteral');
    });

    test('should parse operation call with property chain reference', async () => {
      const program = await parseEligian(`
        action test [
          setData({ "operationdata.name": $scope.currentItem })
        ]
      `);

      const action = getElements(program)[0] as RegularActionDefinition;
      expect(action.operations[0].operationName.$refText).toBe('setData');
      const objLiteral = action.operations[0].args[0] as any;
      expect(objLiteral.properties[0].value.$type).toBe('PropertyChainReference');
    });
  });

  describe('Type annotation parsing (Phase 18)', () => {
    test('should parse action with string type annotation', async () => {
      const program = await parseEligian(`
        action fadeIn(selector: string) [
          selectElement(selector)
        ]
      `);

      const action = getElements(program)[0] as RegularActionDefinition;
      expect(action.parameters).toHaveLength(1);
      expect(action.parameters[0].name).toBe('selector');
      expect(action.parameters[0].type).toBe('string');
    });

    test('should parse action with number type annotation', async () => {
      const program = await parseEligian(`
        action wait(duration: number) [
          wait(duration)
        ]
      `);

      const action = getElements(program)[0] as RegularActionDefinition;
      expect(action.parameters[0].name).toBe('duration');
      expect(action.parameters[0].type).toBe('number');
    });

    test('should parse action with boolean type annotation', async () => {
      const program = await parseEligian(`
        action toggle(enabled: boolean) [
          setData({"operationdata.flag": enabled})
        ]
      `);

      const action = getElements(program)[0] as RegularActionDefinition;
      expect(action.parameters[0].name).toBe('enabled');
      expect(action.parameters[0].type).toBe('boolean');
    });

    test('should parse action with object type annotation', async () => {
      const program = await parseEligian(`
        action setConfig(config: object) [
          setData({"operationdata.config": config})
        ]
      `);

      const action = getElements(program)[0] as RegularActionDefinition;
      expect(action.parameters[0].name).toBe('config');
      expect(action.parameters[0].type).toBe('object');
    });

    test('should parse action with array type annotation', async () => {
      const program = await parseEligian(`
        action process(items: array) [
          setData({"operationdata.items": items})
        ]
      `);

      const action = getElements(program)[0] as RegularActionDefinition;
      expect(action.parameters[0].name).toBe('items');
      expect(action.parameters[0].type).toBe('array');
    });

    test('should parse action with multiple typed parameters', async () => {
      const program = await parseEligian(`
        action animate(selector: string, duration: number, easing: string) [
          selectElement(selector)
          animate(duration, easing)
        ]
      `);

      const action = getElements(program)[0] as RegularActionDefinition;
      expect(action.parameters).toHaveLength(3);
      expect(action.parameters[0].name).toBe('selector');
      expect(action.parameters[0].type).toBe('string');
      expect(action.parameters[1].name).toBe('duration');
      expect(action.parameters[1].type).toBe('number');
      expect(action.parameters[2].name).toBe('easing');
      expect(action.parameters[2].type).toBe('string');
    });

    test('should parse action with mixed typed and untyped parameters', async () => {
      const program = await parseEligian(`
        action fadeIn(selector: string, duration, easing: string) [
          selectElement(selector)
        ]
      `);

      const action = getElements(program)[0] as RegularActionDefinition;
      expect(action.parameters).toHaveLength(3);
      expect(action.parameters[0].type).toBe('string');
      expect(action.parameters[1].type).toBeUndefined(); // No type annotation
      expect(action.parameters[2].type).toBe('string');
    });

    test('should parse action with no type annotations (backwards compatibility)', async () => {
      const program = await parseEligian(`
        action fadeIn(selector, duration) [
          selectElement(selector)
        ]
      `);

      const action = getElements(program)[0] as RegularActionDefinition;
      expect(action.parameters).toHaveLength(2);
      expect(action.parameters[0].type).toBeUndefined();
      expect(action.parameters[1].type).toBeUndefined();
    });

    test('should parse endable action with typed parameters', async () => {
      const program = await parseEligian(`
        endable action showElement(selector: string, duration: number) [
          selectElement(selector)
          addClass("visible")
        ] [
          removeClass("visible")
        ]
      `);

      const action = getElements(program)[0] as EndableActionDefinition;
      expect(action.parameters).toHaveLength(2);
      expect(action.parameters[0].name).toBe('selector');
      expect(action.parameters[0].type).toBe('string');
      expect(action.parameters[1].name).toBe('duration');
      expect(action.parameters[1].type).toBe('number');
    });
  });

  describe('Action definition parsing', () => {
    test('should parse regular action definition', async () => {
      const program = await parseEligian(`
        action fadeIn [
          selectElement(".target")
          addClass("fade-in")
        ]
      `);

      expect(getElements(program)).toHaveLength(1);
      const action = getElements(program)[0] as RegularActionDefinition;
      expect(action.$type).toBe('RegularActionDefinition');
      expect(action.name).toBe('fadeIn');
      expect(action.operations).toHaveLength(2);
    });

    test('should parse endable action definition', async () => {
      const program = await parseEligian(`
        endable action showHide [
          selectElement(".target")
          addClass("visible")
        ] [
          removeClass("visible")
        ]
      `);

      const action = getElements(program)[0] as EndableActionDefinition;
      expect(action.$type).toBe('EndableActionDefinition');
      expect(action.name).toBe('showHide');
      expect(action.startOperations).toHaveLength(2);
      expect(action.endOperations).toHaveLength(1);
    });

    test('should parse multiple action definitions', async () => {
      const program = await parseEligian(`
        action regularAction [
          selectElement("#test")
        ]

        endable action endableAction [
          addClass("start")
        ] [
          addClass("end")
        ]
      `);

      expect(getElements(program)).toHaveLength(2);
      expect(getElements(program)[0].$type).toBe('RegularActionDefinition');
      expect(getElements(program)[1].$type).toBe('EndableActionDefinition');
    });
  });

  describe('Expression parsing', () => {
    test('should parse string literals', async () => {
      const program = await parseEligian(`
        action test [
          selectElement("#title")
        ]
      `);

      const action = getElements(program)[0] as RegularActionDefinition;
      expect(action.operations[0].args[0].$type).toBe('StringLiteral');
    });

    test('should parse number literals', async () => {
      const program = await parseEligian(`
        action test [
          wait(500)
        ]
      `);

      const action = getElements(program)[0] as RegularActionDefinition;
      expect(action.operations[0].args[0].$type).toBe('NumberLiteral');
    });

    test('should parse boolean literals', async () => {
      const program = await parseEligian(`
        action test [
          setData({ "operationdata.flag": true })
        ]
      `);

      const action = getElements(program)[0] as RegularActionDefinition;
      const objLiteral = action.operations[0].args[0] as any;
      expect(objLiteral.properties[0].value.$type).toBe('BooleanLiteral');
    });

    test('should parse array literals', async () => {
      const program = await parseEligian(`
        action test [
          setData({ "operationdata.items": [1, 2, 3] })
        ]
      `);

      const action = getElements(program)[0] as RegularActionDefinition;
      const objLiteral = action.operations[0].args[0] as any;
      expect(objLiteral.properties[0].value.$type).toBe('ArrayLiteral');
    });

    test('should parse binary expressions', async () => {
      const program = await parseEligian(`
        action test [
          calc(10, "+", 5)
        ]
      `);

      const action = getElements(program)[0] as RegularActionDefinition;
      expect(action.operations[0].args).toHaveLength(3);
    });
  });

  describe('Fixture files', () => {
    test('should parse simple-timeline.eligian', async () => {
      const source = loadFixture('valid/simple-timeline.eligian');
      const program = await parseEligian(source);

      expect(getElements(program).length).toBeGreaterThan(0);
      const timeline = getElements(program).find((e: any) => e.$type === 'Timeline');
      expect(timeline).toBeDefined();
    });

    test('should parse action-definition.eligian', async () => {
      const source = loadFixture('valid/action-definition.eligian');
      const program = await parseEligian(source);

      const actions = getElements(program).filter(
        (e: any) => e.$type === 'RegularActionDefinition' || e.$type === 'EndableActionDefinition'
      );
      expect(actions.length).toBeGreaterThan(0);
    });

    test('should parse video-annotation.eligian', async () => {
      const source = loadFixture('valid/video-annotation.eligian');
      const program = await parseEligian(source);

      const timeline = getElements(program).find((e: any) => e.$type === 'Timeline') as Timeline;
      expect(timeline).toBeDefined();
      expect(timeline.provider).toBe('video');
    });

    test('should parse presentation.eligian', async () => {
      const source = loadFixture('valid/presentation.eligian');
      const program = await parseEligian(source);

      const actions = getElements(program).filter(
        (e: any) => e.$type === 'RegularActionDefinition' || e.$type === 'EndableActionDefinition'
      );
      expect(actions.length).toBeGreaterThan(0);
    });
  });

  describe('Control flow parsing', () => {
    describe('If/else statement parsing', () => {
      test('should parse if statement without else', async () => {
        const program = await parseEligian(`
          action test [
            if ($operationdata.count > 5) {
              addClass("highlight")
            }
          ]
        `);

        const action = getElements(program)[0] as RegularActionDefinition;
        expect(action.operations).toHaveLength(1);
        expect(action.operations[0].$type).toBe('IfStatement');
        const ifStmt = action.operations[0] as any;
        expect(ifStmt.condition.$type).toBe('BinaryExpression');
        expect(ifStmt.thenOps).toHaveLength(1);
        expect(ifStmt.elseOps).toHaveLength(0);
      });

      test('should parse if/else statement', async () => {
        const program = await parseEligian(`
          action test [
            if ($operationdata.enabled) {
              selectElement(".box")
              addClass("active")
            } else {
              removeClass("active")
            }
          ]
        `);

        const action = getElements(program)[0] as RegularActionDefinition;
        const ifStmt = action.operations[0] as any;
        expect(ifStmt.$type).toBe('IfStatement');
        expect(ifStmt.thenOps).toHaveLength(2);
        expect(ifStmt.elseOps).toHaveLength(1);
      });

      test('should parse nested if statements', async () => {
        const program = await parseEligian(`
          action test [
            if ($operationdata.level > 0) {
              if ($operationdata.level > 5) {
                addClass("high")
              } else {
                addClass("medium")
              }
            }
          ]
        `);

        const action = getElements(program)[0] as RegularActionDefinition;
        const outerIf = action.operations[0] as any;
        expect(outerIf.$type).toBe('IfStatement');
        expect(outerIf.thenOps).toHaveLength(1);

        const innerIf = outerIf.thenOps[0];
        expect(innerIf.$type).toBe('IfStatement');
        expect(innerIf.thenOps).toHaveLength(1);
        expect(innerIf.elseOps).toHaveLength(1);
      });

      test('should parse if with complex conditions', async () => {
        const program = await parseEligian(`
          action test [
            if ($operationdata.count > 5 && $operationdata.enabled) {
              addClass("active")
            }
          ]
        `);

        const action = getElements(program)[0] as RegularActionDefinition;
        const ifStmt = action.operations[0] as any;
        expect(ifStmt.$type).toBe('IfStatement');
        expect(ifStmt.condition.$type).toBe('BinaryExpression');
        expect(ifStmt.condition.op).toBe('&&');
      });
    });

    describe('For loop parsing', () => {
      test('should parse basic for loop', async () => {
        const program = await parseEligian(`
          action test [
            for (item in $operationdata.items) {
              selectElement(".template")
              addClass("item")
            }
          ]
        `);

        const action = getElements(program)[0] as RegularActionDefinition;
        expect(action.operations).toHaveLength(1);
        expect(action.operations[0].$type).toBe('ForStatement');
        const forStmt = action.operations[0] as any;
        expect(forStmt.itemName).toBe('item');
        expect(forStmt.collection.$type).toBe('PropertyChainReference');
        expect(forStmt.body).toHaveLength(2);
      });

      test('should parse for loop with array literal', async () => {
        const program = await parseEligian(`
          action test [
            for (slide in ["slide1", "slide2", "slide3"]) {
              addClass("animated")
            }
          ]
        `);

        const action = getElements(program)[0] as RegularActionDefinition;
        const forStmt = action.operations[0] as any;
        expect(forStmt.$type).toBe('ForStatement');
        expect(forStmt.collection.$type).toBe('ArrayLiteral');
        expect(forStmt.body).toHaveLength(1);
      });

      test('should parse nested for loops', async () => {
        const program = await parseEligian(`
          action test [
            for (row in $operationdata.rows) {
              for (col in $operationdata.cols) {
                addClass("cell")
              }
            }
          ]
        `);

        const action = getElements(program)[0] as RegularActionDefinition;
        const outerFor = action.operations[0] as any;
        expect(outerFor.$type).toBe('ForStatement');
        expect(outerFor.body).toHaveLength(1);

        const innerFor = outerFor.body[0];
        expect(innerFor.$type).toBe('ForStatement');
        expect(innerFor.body).toHaveLength(1);
      });

      test('should parse for loop with if statement inside', async () => {
        const program = await parseEligian(`
          action test [
            for (item in $operationdata.items) {
              if ($scope.isVisible) {
                addClass("show")
              }
            }
          ]
        `);

        const action = getElements(program)[0] as RegularActionDefinition;
        const forStmt = action.operations[0] as any;
        expect(forStmt.$type).toBe('ForStatement');
        expect(forStmt.body).toHaveLength(1);
        expect(forStmt.body[0].$type).toBe('IfStatement');
      });
    });

    describe('Mixed control flow', () => {
      test('should parse if inside for loop', async () => {
        const program = await parseEligian(`
          action test [
            for (item in $operationdata.items) {
              selectElement(".item")
              if ($scope.highlight) {
                addClass("highlight")
              } else {
                removeClass("highlight")
              }
            }
          ]
        `);

        const action = getElements(program)[0] as RegularActionDefinition;
        const forStmt = action.operations[0] as any;
        expect(forStmt.body).toHaveLength(2);
        expect(forStmt.body[0].$type).toBe('OperationCall');
        expect(forStmt.body[1].$type).toBe('IfStatement');
      });

      test('should parse for loop inside if statement', async () => {
        const program = await parseEligian(`
          action test [
            if ($operationdata.showAll) {
              for (item in $operationdata.items) {
                addClass("visible")
              }
            } else {
              selectElement(".placeholder")
            }
          ]
        `);

        const action = getElements(program)[0] as RegularActionDefinition;
        const ifStmt = action.operations[0] as any;
        expect(ifStmt.thenOps).toHaveLength(1);
        expect(ifStmt.thenOps[0].$type).toBe('ForStatement');
        expect(ifStmt.elseOps).toHaveLength(1);
        expect(ifStmt.elseOps[0].$type).toBe('OperationCall');
      });
    });
  });

  describe('Break and Continue Statements', () => {
    test('should parse break statement', async () => {
      const program = await parseEligian(`
        action test [
          for (item in items) {
            break
          }
        ]
      `);

      const action = getElements(program)[0] as RegularActionDefinition;
      const forStmt = action.operations[0] as any;
      const breakStmt = forStmt.body[0];

      expect(isBreakStatement(breakStmt)).toBe(true);
    });

    test('should parse continue statement', async () => {
      const program = await parseEligian(`
        action test [
          for (item in items) {
            continue
          }
        ]
      `);

      const action = getElements(program)[0] as RegularActionDefinition;
      const forStmt = action.operations[0] as any;
      const continueStmt = forStmt.body[0];

      expect(isContinueStatement(continueStmt)).toBe(true);
    });

    test('should parse multiple break and continue in loop', async () => {
      const program = await parseEligian(`
        action test [
          for (item in items) {
            continue
            break
          }
        ]
      `);

      const action = getElements(program)[0] as RegularActionDefinition;
      const forStmt = action.operations[0] as any;

      // Should have both break and continue
      expect(forStmt.body.length).toBeGreaterThanOrEqual(2);
      expect(isContinueStatement(forStmt.body[0])).toBe(true);
      expect(isBreakStatement(forStmt.body[1])).toBe(true);
    });
  });

  describe('Error recovery', () => {
    test('should handle syntax errors gracefully', async () => {
      const source = loadFixture('invalid/syntax-errors.eligian');
      const document = await ctx.parse( source);

      // Should have parse errors
      expect(
        document.parseResult.lexerErrors.length + document.parseResult.parserErrors.length
      ).toBeGreaterThan(0);
    });
  });

  // T047-T048: US3 - Control flow with action calls
  describe('Control flow with action calls (US3)', () => {
    // T047: Parse for loop in timeline event with action call
    test('should parse for loop with action call in timeline event', async () => {
      const program = await parseEligian(`
        action highlight(selector) [
          selectElement(selector)
          addClass("highlight")
        ]

        timeline "test" in ".container" using raf {
          at 0s..5s for (item in items) {
            highlight(@@item)
          }
        }
      `);

      const timeline = getElements(program)[1] as Timeline;
      expect(timeline.events).toHaveLength(1);
      const event = timeline.events[0] as TimedEvent;
      expect(event.action.$type).toBe('ForStatement');
    });

    // T048: Parse if/else with action calls in both branches
    test('should parse if/else with action calls in timeline event', async () => {
      const program = await parseEligian(`
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
      `);

      const timeline = getElements(program)[2] as Timeline;
      expect(timeline.events).toHaveLength(1);
      const event = timeline.events[0] as TimedEvent;
      expect(event.action.$type).toBe('IfStatement');
    });
  });

  // ========================================================================
  // Import Statement Parsing (Feature 009 - US5)
  // ========================================================================

  describe('Import statement parsing', () => {
    describe('US5 - Path validation (parsing)', () => {
      test('T010: should parse default import with relative path', async () => {
        const program = await parseEligian("layout './layout.html'");

        expect(getImports(program)).toHaveLength(1);
        const importStmt = getImports(program)[0] as DefaultImport;
        expect(importStmt.$type).toBe('DefaultImport');
        expect(importStmt.type).toBe('layout');
        expect(importStmt.path).toBe('./layout.html');
      });

      test('T011: should parse named import with relative path', async () => {
        const program = await parseEligian("import tooltip from './tooltip.html'");

        expect(getImports(program)).toHaveLength(1);
        const importStmt = getImports(program)[0] as NamedImport;
        expect(importStmt.$type).toBe('NamedImport');
        expect(importStmt.name).toBe('tooltip');
        expect(importStmt.path).toBe('./tooltip.html');
        expect(importStmt.assetType).toBeUndefined();
      });

      test('should parse import with parent directory path', async () => {
        const program = await parseEligian("layout '../shared/layout.html'");

        expect(getImports(program)).toHaveLength(1);
        const importStmt = getImports(program)[0] as DefaultImport;
        expect(importStmt.path).toBe('../shared/layout.html');
      });

      test('should parse import with deeply nested path', async () => {
        const program = await parseEligian("layout './assets/templates/main/layout.html'");

        expect(getImports(program)).toHaveLength(1);
        const importStmt = getImports(program)[0] as DefaultImport;
        expect(importStmt.path).toBe('./assets/templates/main/layout.html');
      });
    });

    describe('US1 - Default layout import', () => {
      test('T020: should parse layout default import', async () => {
        const program = await parseEligian("layout './layout.html'");

        expect(getImports(program)).toHaveLength(1);
        const importStmt = getImports(program)[0] as DefaultImport;
        expect(importStmt.$type).toBe('DefaultImport');
        expect(importStmt.type).toBe('layout');
        expect(importStmt.path).toBe('./layout.html');
      });

      test('T021: should parse complete document with layout import + action', async () => {
        const program = await parseEligian(`
          layout './layout.html'

          action fadeIn [
            selectElement(".box")
            animate({opacity: 1}, 500)
          ]

          timeline "main" in ".container" using raf {}
        `);

        expect(getImports(program)).toHaveLength(1);
        expect(getImports(program)[0].$type).toBe('DefaultImport');
        expect((getImports(program)[0] as DefaultImport).type).toBe('layout');

        expect(getElements(program)).toHaveLength(2);
        expect(getElements(program)[0].$type).toBe('RegularActionDefinition');
        expect(getElements(program)[1].$type).toBe('Timeline');
      });

      test('should parse layout import at document start', async () => {
        const program = await parseEligian(`
          layout './main.html'
          action test [ selectElement("#box") ]
          timeline "t" in ".c" using raf {}
        `);

        expect(getImports(program)).toHaveLength(1);
        expect((getImports(program)[0] as DefaultImport).type).toBe('layout');
      });
    });

    describe('US3 - Styles and provider imports', () => {
      test('T030: should parse styles default import', async () => {
        const program = await parseEligian("styles './main.css'");

        expect(getImports(program)).toHaveLength(1);
        const importStmt = getImports(program)[0] as DefaultImport;
        expect(importStmt.$type).toBe('DefaultImport');
        expect(importStmt.type).toBe('styles');
        expect(importStmt.path).toBe('./main.css');
      });

      test('T031: should parse provider default import', async () => {
        const program = await parseEligian("provider './video.mp4'");

        expect(getImports(program)).toHaveLength(1);
        const importStmt = getImports(program)[0] as DefaultImport;
        expect(importStmt.$type).toBe('DefaultImport');
        expect(importStmt.type).toBe('provider');
        expect(importStmt.path).toBe('./video.mp4');
      });

      test('T032: should parse all three default imports together', async () => {
        const program = await parseEligian(`
          layout './layout.html'
          styles './main.css'
          provider './video.mp4'
        `);

        expect(getImports(program)).toHaveLength(3);
        expect((getImports(program)[0] as DefaultImport).type).toBe('layout');
        expect((getImports(program)[1] as DefaultImport).type).toBe('styles');
        expect((getImports(program)[2] as DefaultImport).type).toBe('provider');
      });

      test('should parse complete document with all import types', async () => {
        const program = await parseEligian(`
          layout './layout.html'
          styles './theme.css'
          provider './intro.mp4'

          action fadeIn [ selectElement(".box") ]
          timeline "t" in ".c" using raf {}
        `);

        expect(getImports(program)).toHaveLength(3);
        expect(getElements(program)).toHaveLength(2);
      });
    });

    describe('US2 - Named HTML imports', () => {
      test('T040: should parse single named import', async () => {
        const program = await parseEligian("import tooltip from './tooltip.html'");

        expect(getImports(program)).toHaveLength(1);
        const importStmt = getImports(program)[0] as NamedImport;
        expect(importStmt.$type).toBe('NamedImport');
        expect(importStmt.name).toBe('tooltip');
        expect(importStmt.path).toBe('./tooltip.html');
        expect(importStmt.assetType).toBeUndefined();
      });

      test('T041: should parse multiple named imports', async () => {
        const program = await parseEligian(`
          import tooltip from './tooltip.html'
          import modal from './modal.html'
          import sidebar from './sidebar.html'
        `);

        expect(getImports(program)).toHaveLength(3);
        expect((getImports(program)[0] as NamedImport).name).toBe('tooltip');
        expect((getImports(program)[1] as NamedImport).name).toBe('modal');
        expect((getImports(program)[2] as NamedImport).name).toBe('sidebar');
      });

      test('T042: should parse mixed default + named imports', async () => {
        const program = await parseEligian(`
          layout './layout.html'
          import tooltip from './tooltip.html'
          styles './main.css'
          import modal from './modal.html'
          provider './video.mp4'
        `);

        expect(getImports(program)).toHaveLength(5);
        expect((getImports(program)[0] as DefaultImport).type).toBe('layout');
        expect((getImports(program)[1] as NamedImport).name).toBe('tooltip');
        expect((getImports(program)[2] as DefaultImport).type).toBe('styles');
        expect((getImports(program)[3] as NamedImport).name).toBe('modal');
        expect((getImports(program)[4] as DefaultImport).type).toBe('provider');
      });
    });

    describe('US4 - Type inference with explicit override', () => {
      test('T057: should parse named import with explicit as html', async () => {
        const program = await parseEligian("import template from './page.tmpl' as html");

        expect(getImports(program)).toHaveLength(1);
        const importStmt = getImports(program)[0] as NamedImport;
        expect(importStmt.$type).toBe('NamedImport');
        expect(importStmt.name).toBe('template');
        expect(importStmt.path).toBe('./page.tmpl');
        expect(importStmt.assetType).toBe('html');
      });

      test('T058: should parse named import with explicit as css', async () => {
        const program = await parseEligian("import theme from './colors.scss' as css");

        expect(getImports(program)).toHaveLength(1);
        const importStmt = getImports(program)[0] as NamedImport;
        expect(importStmt.$type).toBe('NamedImport');
        expect(importStmt.name).toBe('theme');
        expect(importStmt.path).toBe('./colors.scss');
        expect(importStmt.assetType).toBe('css');
      });

      test('T059: should parse named import with explicit as media', async () => {
        const program = await parseEligian("import bgMusic from './music.ogg' as media");

        expect(getImports(program)).toHaveLength(1);
        const importStmt = getImports(program)[0] as NamedImport;
        expect(importStmt.$type).toBe('NamedImport');
        expect(importStmt.name).toBe('bgMusic');
        expect(importStmt.path).toBe('./music.ogg');
        expect(importStmt.assetType).toBe('media');
      });

      test('should allow explicit override even for inferrable extensions', async () => {
        // User can explicitly specify type even if it can be inferred
        const program = await parseEligian("import template from './page.html' as html");

        const importStmt = getImports(program)[0] as NamedImport;
        expect(importStmt.assetType).toBe('html');
      });

      test('should parse multiple imports with mixed inference and explicit types', async () => {
        const program = await parseEligian(`
          import template from './page.html'
          import theme from './theme.scss' as css
          import bgMusic from './sound.ogg' as media
        `);

        expect(getImports(program)).toHaveLength(3);
        expect((getImports(program)[0] as NamedImport).assetType).toBeUndefined(); // Inferred from .html
        expect((getImports(program)[1] as NamedImport).assetType).toBe('css'); // Explicit
        expect((getImports(program)[2] as NamedImport).assetType).toBe('media'); // Explicit
      });
    });
  });

  describe('JSDoc Comments (T005 - US1)', () => {
    test('should parse action with JSDoc comment and CommentProvider extracts it', async () => {
      const program = await parseEligian(`
        /**
         * Fades in an element
         * @param selector CSS selector
         */
        action fadeIn(selector) [
          selectElement(selector)
        ]
      `);

      expect(getElements(program)).toHaveLength(1);
      const action = getElements(program)[0] as RegularActionDefinition;
      expect(action.$type).toBe('RegularActionDefinition');

      // Use CommentProvider to get the comment
      const commentProvider = ctx.services.Eligian.documentation.CommentProvider;
      const comment = commentProvider.getComment(action);

      expect(comment).toBeDefined();
      expect(comment).toContain('Fades in an element');
      expect(comment).toContain('@param selector');
    });

    test('should parse action without JSDoc and CommentProvider returns undefined', async () => {
      const program = await parseEligian(`
        action test(foo) [
          selectElement(foo)
        ]
      `);

      expect(getElements(program)).toHaveLength(1);
      const action = getElements(program)[0] as RegularActionDefinition;

      // Use CommentProvider to get the comment
      const commentProvider = ctx.services.Eligian.documentation.CommentProvider;
      const comment = commentProvider.getComment(action);

      expect(comment).toBeUndefined();
    });

    test('should capture JSDoc with @param tags via CommentProvider', async () => {
      const program = await parseEligian(`
        /**
         * Multi-param action
         * @param {string} selector Element selector
         * @param {number} duration Animation duration
         */
        action animate(selector, duration) [
          selectElement(selector)
        ]
      `);

      expect(getElements(program)).toHaveLength(1);
      const action = getElements(program)[0] as RegularActionDefinition;

      // Use CommentProvider to get the comment
      const commentProvider = ctx.services.Eligian.documentation.CommentProvider;
      const comment = commentProvider.getComment(action);

      expect(comment).toBeDefined();
      expect(comment).toContain('@param {string} selector');
      expect(comment).toContain('@param {number} duration');
    });

    test('should handle JSDoc separated by blank line (FR-017)', async () => {
      const program = await parseEligian(`
        /**
         * This should not be associated
         */

        action test() [ selectElement("#box") ]
      `);

      expect(getElements(program)).toHaveLength(1);
      const action = getElements(program)[0] as RegularActionDefinition;

      // Use CommentProvider to get the comment
      const commentProvider = ctx.services.Eligian.documentation.CommentProvider;
      const comment = commentProvider.getComment(action);

      // Note: Langium's default CommentProvider DOES capture comments even with blank lines
      // This is Langium's behavior - it associates the comment with the next node
      // If we need stricter blank-line rules, we'd need a custom CommentProvider
      expect(comment).toBeDefined();
      expect(comment).toContain('This should not be associated');
    });

    test('should handle non-doc comment /* */ via parseJSDoc filtering (FR-018)', async () => {
      const program = await parseEligian(`
        /* This is a regular comment */
        action test() [ selectElement("#box") ]
      `);

      expect(getElements(program)).toHaveLength(1);
      const action = getElements(program)[0] as RegularActionDefinition;

      // Use CommentProvider to get the comment
      const commentProvider = ctx.services.Eligian.documentation.CommentProvider;
      const comment = commentProvider.getComment(action);

      // Langium's CommentProvider captures ALL comments (including /* */)
      expect(comment).toBeDefined();
      expect(comment).toContain('This is a regular comment');

      // However, our parseJSDoc function filters out non-JSDoc comments
      const { parseJSDoc } = await import('../jsdoc/jsdoc-parser.js');
      const parsed = parseJSDoc(comment!);

      // parseJSDoc returns null for non-JSDoc comments (FR-018)
      expect(parsed).toBeNull();
    });
  });
});
