/**
 * Grammar and Parsing Tests
 *
 * Tests the Langium grammar to ensure it correctly parses valid DSL
 * programs and rejects invalid ones.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EmptyFileSystem } from 'langium';
import { parseDocument } from 'langium/test';
import { describe, expect, test } from 'vitest';
import { createEligianServices } from '../eligian-module.js';
import type {
  EndableActionDefinition,
  Program,
  RegularActionDefinition,
  Timeline,
} from '../generated/ast.js';

const services = createEligianServices(EmptyFileSystem).Eligian;

function loadFixture(filename: string): string {
  const path = join(__dirname, '__fixtures__', filename);
  return readFileSync(path, 'utf-8');
}

async function parseEligian(text: string): Promise<Program> {
  const document = await parseDocument(services, text);
  return document.parseResult.value as Program;
}

describe('Eligian Grammar - Parsing', () => {
  describe('Timeline parsing', () => {
    test('should parse video timeline with source', async () => {
      const program = await parseEligian('timeline "main" using video from "video.mp4" {}');

      expect(program.elements).toHaveLength(1);
      const timeline = program.elements[0] as Timeline;
      expect(timeline.$type).toBe('Timeline');
      expect(timeline.name).toBe('main');
      expect(timeline.provider).toBe('video');
      expect(timeline.source).toBe('video.mp4');
    });

    test('should parse audio timeline with source', async () => {
      const program = await parseEligian('timeline "audio" using audio from "audio.mp3" {}');

      expect(program.elements).toHaveLength(1);
      const timeline = program.elements[0] as Timeline;
      expect(timeline.$type).toBe('Timeline');
      expect(timeline.provider).toBe('audio');
      expect(timeline.source).toBe('audio.mp3');
    });

    test('should parse raf timeline without source', async () => {
      const program = await parseEligian('timeline "animation" using raf {}');

      expect(program.elements).toHaveLength(1);
      const timeline = program.elements[0] as Timeline;
      expect(timeline.$type).toBe('Timeline');
      expect(timeline.provider).toBe('raf');
    });

    test('should parse custom timeline', async () => {
      const program = await parseEligian('timeline "custom" using custom {}');

      expect(program.elements).toHaveLength(1);
      const timeline = program.elements[0] as Timeline;
      expect(timeline.$type).toBe('Timeline');
      expect(timeline.provider).toBe('custom');
    });
  });

  describe('Timeline event parsing', () => {
    test('should parse simple timeline event with inline endable action', async () => {
      const program = await parseEligian(`
        timeline "main" using raf {
          at 0s..5s [
            selectElement("#title")
            addClass("visible")
          ] [
            removeClass("visible")
          ]
        }
      `);

      expect(program.elements).toHaveLength(1);
      const timeline = program.elements[0] as Timeline;
      expect(timeline.events).toHaveLength(1);
      expect(timeline.events[0].timeRange).toBeDefined();
      expect(timeline.events[0].action.$type).toBe('InlineEndableAction');
    });

    test('should parse timeline event with named action invocation', async () => {
      const program = await parseEligian(`
        endable action fadeIn [
          selectElement(".target")
          addClass("visible")
        ] [
          removeClass("visible")
        ]

        timeline "main" using raf {
          at 0s..5s {
            fadeIn()
          }
        }
      `);

      expect(program.elements).toHaveLength(2);
      const timeline = program.elements[1] as Timeline;
      expect(timeline.events).toHaveLength(1);
      expect(timeline.events[0].action.$type).toBe('NamedActionInvocation');
    });

    test('should parse timeline event with time expressions', async () => {
      const program = await parseEligian(`
        timeline "main" using raf {
          at 5s + 2s..10s * 2s [
            selectElement("#content")
          ] [
          ]
        }
      `);

      const timeline = program.elements[0] as Timeline;
      expect(timeline.events).toHaveLength(1);
      expect(timeline.events[0].timeRange).toBeDefined();
    });

    test('should parse multiple timeline events', async () => {
      const program = await parseEligian(`
        timeline "main" using raf {
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

      const timeline = program.elements[0] as Timeline;
      expect(timeline.events).toHaveLength(3);
    });
  });

  describe('Operation call parsing', () => {
    test('should parse operation call with no arguments', async () => {
      const program = await parseEligian(`
        action test [
          wait()
        ]
      `);

      const action = program.elements[0] as RegularActionDefinition;
      expect(action.operations).toHaveLength(1);
      expect(action.operations[0].operationName).toBe('wait');
      expect(action.operations[0].args).toHaveLength(0);
    });

    test('should parse operation call with single argument', async () => {
      const program = await parseEligian(`
        action test [
          selectElement("#title")
        ]
      `);

      const action = program.elements[0] as RegularActionDefinition;
      expect(action.operations[0].operationName).toBe('selectElement');
      expect(action.operations[0].args).toHaveLength(1);
    });

    test('should parse operation call with multiple arguments', async () => {
      const program = await parseEligian(`
        action test [
          animate({ opacity: 1 }, 500, "ease")
        ]
      `);

      const action = program.elements[0] as RegularActionDefinition;
      expect(action.operations[0].operationName).toBe('animate');
      expect(action.operations[0].args).toHaveLength(3);
    });

    test('should parse operation call with object literal', async () => {
      const program = await parseEligian(`
        action test [
          setStyle({ opacity: 0, color: "red" })
        ]
      `);

      const action = program.elements[0] as RegularActionDefinition;
      expect(action.operations[0].operationName).toBe('setStyle');
      expect(action.operations[0].args).toHaveLength(1);
      expect(action.operations[0].args[0].$type).toBe('ObjectLiteral');
    });

    test('should parse operation call with property chain reference', async () => {
      const program = await parseEligian(`
        action test [
          setData({ "operationdata.name": $scope.currentItem })
        ]
      `);

      const action = program.elements[0] as RegularActionDefinition;
      expect(action.operations[0].operationName).toBe('setData');
      const objLiteral = action.operations[0].args[0] as any;
      expect(objLiteral.properties[0].value.$type).toBe('PropertyChainReference');
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

      expect(program.elements).toHaveLength(1);
      const action = program.elements[0] as RegularActionDefinition;
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

      const action = program.elements[0] as EndableActionDefinition;
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

      expect(program.elements).toHaveLength(2);
      expect(program.elements[0].$type).toBe('RegularActionDefinition');
      expect(program.elements[1].$type).toBe('EndableActionDefinition');
    });
  });

  describe('Expression parsing', () => {
    test('should parse string literals', async () => {
      const program = await parseEligian(`
        action test [
          selectElement("#title")
        ]
      `);

      const action = program.elements[0] as RegularActionDefinition;
      expect(action.operations[0].args[0].$type).toBe('StringLiteral');
    });

    test('should parse number literals', async () => {
      const program = await parseEligian(`
        action test [
          wait(500)
        ]
      `);

      const action = program.elements[0] as RegularActionDefinition;
      expect(action.operations[0].args[0].$type).toBe('NumberLiteral');
    });

    test('should parse boolean literals', async () => {
      const program = await parseEligian(`
        action test [
          setData({ "operationdata.flag": true })
        ]
      `);

      const action = program.elements[0] as RegularActionDefinition;
      const objLiteral = action.operations[0].args[0] as any;
      expect(objLiteral.properties[0].value.$type).toBe('BooleanLiteral');
    });

    test('should parse array literals', async () => {
      const program = await parseEligian(`
        action test [
          setData({ "operationdata.items": [1, 2, 3] })
        ]
      `);

      const action = program.elements[0] as RegularActionDefinition;
      const objLiteral = action.operations[0].args[0] as any;
      expect(objLiteral.properties[0].value.$type).toBe('ArrayLiteral');
    });

    test('should parse binary expressions', async () => {
      const program = await parseEligian(`
        action test [
          calc(10, "+", 5)
        ]
      `);

      const action = program.elements[0] as RegularActionDefinition;
      expect(action.operations[0].args).toHaveLength(3);
    });
  });

  describe('Fixture files', () => {
    test('should parse simple-timeline.eligian', async () => {
      const source = loadFixture('valid/simple-timeline.eligian');
      const program = await parseEligian(source);

      expect(program.elements.length).toBeGreaterThan(0);
      const timeline = program.elements.find((e: any) => e.$type === 'Timeline');
      expect(timeline).toBeDefined();
    });

    test('should parse action-definition.eligian', async () => {
      const source = loadFixture('valid/action-definition.eligian');
      const program = await parseEligian(source);

      const actions = program.elements.filter(
        (e: any) => e.$type === 'RegularActionDefinition' || e.$type === 'EndableActionDefinition'
      );
      expect(actions.length).toBeGreaterThan(0);
    });

    test('should parse video-annotation.eligian', async () => {
      const source = loadFixture('valid/video-annotation.eligian');
      const program = await parseEligian(source);

      const timeline = program.elements.find((e: any) => e.$type === 'Timeline') as Timeline;
      expect(timeline).toBeDefined();
      expect(timeline.provider).toBe('video');
    });

    test('should parse presentation.eligian', async () => {
      const source = loadFixture('valid/presentation.eligian');
      const program = await parseEligian(source);

      const actions = program.elements.filter(
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

        const action = program.elements[0] as RegularActionDefinition;
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

        const action = program.elements[0] as RegularActionDefinition;
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

        const action = program.elements[0] as RegularActionDefinition;
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

        const action = program.elements[0] as RegularActionDefinition;
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

        const action = program.elements[0] as RegularActionDefinition;
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

        const action = program.elements[0] as RegularActionDefinition;
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

        const action = program.elements[0] as RegularActionDefinition;
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

        const action = program.elements[0] as RegularActionDefinition;
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

        const action = program.elements[0] as RegularActionDefinition;
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

        const action = program.elements[0] as RegularActionDefinition;
        const ifStmt = action.operations[0] as any;
        expect(ifStmt.thenOps).toHaveLength(1);
        expect(ifStmt.thenOps[0].$type).toBe('ForStatement');
        expect(ifStmt.elseOps).toHaveLength(1);
        expect(ifStmt.elseOps[0].$type).toBe('OperationCall');
      });
    });
  });

  describe('Error recovery', () => {
    test('should handle syntax errors gracefully', async () => {
      const source = loadFixture('invalid/syntax-errors.eligian');
      const document = await parseDocument(services, source);

      // Should have parse errors
      expect(
        document.parseResult.lexerErrors.length + document.parseResult.parserErrors.length
      ).toBeGreaterThan(0);
    });
  });
});
