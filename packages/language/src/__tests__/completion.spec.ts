/**
 * Completion Tests
 *
 * Tests the Eligian completion provider to ensure it provides correct
 * completions based on cursor context.
 */

import { EmptyFileSystem } from 'langium';
import type { CompletionList } from 'langium/lsp';
import { expectCompletion } from 'langium/test';
import { describe, expect, it } from 'vitest';
import { createEligianServices } from '../eligian-module.js';

const services = createEligianServices(EmptyFileSystem).Eligian;
const completion = expectCompletion(services);

describe('Eligian Completion Provider', () => {
  describe('User Story 1: Operation Name Completion', () => {
    it('should provide operation completions inside action block', async () => {
      await completion({
        text: `
          action fadeIn [
            se<|>
          ]
        `,
        index: 0,
        assert: (completions: CompletionList) => {
          // Should have operation completions
          expect(completions.items.length).toBeGreaterThan(0);

          // Check if selectElement is present
          const selectElement = completions.items.find(item => item.label === 'selectElement');
          expect(selectElement).toBeDefined();
          expect(selectElement?.kind).toBe(3); // CompletionItemKind.Function = 3
          expect(selectElement?.documentation).toBeDefined();
        },
      });
    });

    it('should filter operations by partial match', async () => {
      await completion({
        text: `
          action test [
            sel<|>
          ]
        `,
        index: 0,
        assert: (completions: CompletionList) => {
          // Should find selectElement when typing "sel"
          const selectElement = completions.items.find(item => item.label === 'selectElement');
          expect(selectElement).toBeDefined();
        },
      });
    });

    it('should provide alphabetically sorted operations', async () => {
      await completion({
        text: `
          action test [
            a<|>
          ]
        `,
        index: 0,
        assert: (completions: CompletionList) => {
          // Get only operation completions (kind = Function)
          const operations = completions.items.filter(item => item.kind === 3);

          // Check that operations are sorted alphabetically
          const operationNames = operations.map(op => op.label);
          const sortedNames = [...operationNames].sort();
          expect(operationNames).toEqual(sortedNames);
        },
      });
    });

    it('should NOT include filtered operations (break, continue, if, else, for)', async () => {
      await completion({
        text: `
          action test [
            f<|>
          ]
        `,
        index: 0,
        assert: (completions: CompletionList) => {
          // Filtered operations should NOT appear
          const filteredOperations = [
            'breakForEach',
            'continueForEach',
            'ifCondition',
            'elseCondition',
            'forEach',
          ];

          for (const filtered of filteredOperations) {
            const found = completions.items.find(item => item.label === filtered);
            expect(found).toBeUndefined();
          }
        },
      });
    });

    it('should include operation descriptions in documentation', async () => {
      await completion({
        text: `
          action test [
            se<|>
          ]
        `,
        index: 0,
        assert: (completions: CompletionList) => {
          // Find selectElement operation
          const selectElement = completions.items.find(item => item.label === 'selectElement');
          expect(selectElement).toBeDefined();

          // Should have documentation with description
          expect(selectElement?.documentation).toBeDefined();

          // Documentation should be a string or MarkupContent
          if (typeof selectElement?.documentation === 'string') {
            expect(selectElement.documentation.length).toBeGreaterThan(0);
          } else if (selectElement?.documentation && 'value' in selectElement.documentation) {
            expect(selectElement.documentation.value.length).toBeGreaterThan(0);
          }
        },
      });
    });

    it('should show CompletionItemKind.Function for operations', async () => {
      await completion({
        text: `
          action test [
            se<|>
          ]
        `,
        index: 0,
        assert: (completions: CompletionList) => {
          // Find selectElement operation
          const selectElement = completions.items.find(item => item.label === 'selectElement');
          expect(selectElement).toBeDefined();
          expect(selectElement?.kind).toBe(3); // CompletionItemKind.Function = 3
        },
      });
    });
  });

  describe('User Story 2: Custom Action Name Completion', () => {
    it('should provide custom action completions alongside operations', async () => {
      await completion({
        text: `
          action fadeIn(selector, duration) [
            selectElement(selector)
            animate({opacity: 1}, duration)
          ]

          action fadeOut(selector, duration) [
            selectElement(selector)
            animate({opacity: 0}, duration)
          ]

          action main [
            fa<|>
          ]
        `,
        index: 0,
        assert: (completions: CompletionList) => {
          // Should have both operations and custom actions
          expect(completions.items.length).toBeGreaterThan(0);

          // Check if fadeIn custom action is present
          const fadeIn = completions.items.find(item => item.label === 'fadeIn');
          expect(fadeIn).toBeDefined();
          expect(fadeIn?.kind).toBe(7); // CompletionItemKind.Class = 7

          // Check if fadeOut custom action is present
          const fadeOut = completions.items.find(item => item.label === 'fadeOut');
          expect(fadeOut).toBeDefined();
          expect(fadeOut?.kind).toBe(7); // CompletionItemKind.Class = 7
        },
      });
    });

    it('should show parameter signature in detail for custom actions', async () => {
      await completion({
        text: `
          action fadeIn(selector, duration) [
            selectElement(selector)
          ]

          action main [
            fa<|>
          ]
        `,
        index: 0,
        assert: (completions: CompletionList) => {
          // Find fadeIn custom action
          const fadeIn = completions.items.find(item => item.label === 'fadeIn');
          expect(fadeIn).toBeDefined();

          // Should have parameter signature in detail
          expect(fadeIn?.detail).toBeDefined();
          expect(fadeIn?.detail).toContain('selector');
          expect(fadeIn?.detail).toContain('duration');
        },
      });
    });

    it('should support forward references (action defined after cursor)', async () => {
      await completion({
        text: `
          action main [
            fa<|>
          ]

          action fadeIn(selector) [
            selectElement(selector)
          ]
        `,
        index: 0,
        assert: (completions: CompletionList) => {
          // Should find fadeIn even though it's defined after the cursor
          const fadeIn = completions.items.find(item => item.label === 'fadeIn');
          expect(fadeIn).toBeDefined();
          expect(fadeIn?.kind).toBe(7); // CompletionItemKind.Class = 7
        },
      });
    });

    it('should distinguish custom actions from operations using CompletionItemKind', async () => {
      await completion({
        text: `
          action customAction [
            selectElement(".box")
          ]

          action main [
            cu<|>
          ]
        `,
        index: 0,
        assert: (completions: CompletionList) => {
          // Custom actions should have CompletionItemKind.Class (7)
          const customAction = completions.items.find(item => item.label === 'customAction');
          expect(customAction).toBeDefined();
          expect(customAction?.kind).toBe(7); // CompletionItemKind.Class = 7

          // Operations should have CompletionItemKind.Function (3)
          const operations = completions.items.filter(item => item.kind === 3);
          expect(operations.length).toBeGreaterThan(0);
        },
      });
    });

    it('should handle actions with no parameters', async () => {
      await completion({
        text: `
          action initialize [
            selectElement(".app")
          ]

          action main [
            init<|>
          ]
        `,
        index: 0,
        assert: (completions: CompletionList) => {
          // Find initialize action
          const initialize = completions.items.find(item => item.label === 'initialize');
          expect(initialize).toBeDefined();
          expect(initialize?.kind).toBe(7); // CompletionItemKind.Class = 7

          // Should have detail even with no parameters
          expect(initialize?.detail).toBeDefined();
        },
      });
    });
  });

  describe('Keyword Filtering', () => {
    it('should NOT show break/continue keywords outside of loops', async () => {
      await completion({
        text: `
          timeline "Test" in ".eligius" using raf {
            at 0s..5s [
              selectElement(".test")
              se<|>
            ] [
              removeElement()
            ]
          }
        `,
        index: 0,
        assert: (completions: CompletionList) => {
          // break and continue should NOT appear (not in a loop)
          const breakKeyword = completions.items.find(item => item.label === 'break');
          const continueKeyword = completions.items.find(item => item.label === 'continue');

          expect(breakKeyword).toBeUndefined();
          expect(continueKeyword).toBeUndefined();
        },
      });
    });

    it('should show break keyword inside loops', async () => {
      await completion({
        text: `
          action processItems [
            for (item in items) {
              selectElement(".item")
              br<|>
            }
          ]
        `,
        index: 0,
        assert: (completions: CompletionList) => {
          // break SHOULD appear (inside a loop)
          const breakKeyword = completions.items.find(item => item.label === 'break');
          expect(breakKeyword).toBeDefined();
        },
      });
    });

    it('should show continue keyword inside loops', async () => {
      await completion({
        text: `
          action processItems [
            for (item in items) {
              selectElement(".item")
              co<|>
            }
          ]
        `,
        index: 0,
        assert: (completions: CompletionList) => {
          // continue SHOULD appear (inside a loop)
          const continueKeyword = completions.items.find(item => item.label === 'continue');
          expect(continueKeyword).toBeDefined();
        },
      });
    });

    it('should NOT show break/continue in regular action (no loop)', async () => {
      await completion({
        text: `
          action fadeIn [
            selectElement(".box")
            an<|>
          ]
        `,
        index: 0,
        assert: (completions: CompletionList) => {
          // break and continue should NOT appear
          const breakKeyword = completions.items.find(item => item.label === 'break');
          const continueKeyword = completions.items.find(item => item.label === 'continue');

          expect(breakKeyword).toBeUndefined();
          expect(continueKeyword).toBeUndefined();
        },
      });
    });
  });

  describe('User Story 5: Variable Reference Completion', () => {
    it('should provide variable completions after @@', async () => {
      await completion({
        text: `
          action test [
            for (item in items) {
              log(@@<|>)
            }
          ]
        `,
        index: 0,
        assert: (completions: CompletionList) => {
          // Should have variable completions
          expect(completions.items.length).toBeGreaterThan(0);

          // Check if loop variables are present
          const loopIndex = completions.items.find(item => item.label === 'loopIndex');
          const currentItem = completions.items.find(item => item.label === 'currentItem');

          expect(loopIndex).toBeDefined();
          expect(loopIndex?.kind).toBe(6); // CompletionItemKind.Variable = 6
          expect(loopIndex?.detail).toBe('number');

          expect(currentItem).toBeDefined();
          expect(currentItem?.kind).toBe(6);
          expect(currentItem?.detail).toBe('any');
        },
      });
    });

    it('should provide context-aware variable completions (loop variables only in loops)', async () => {
      await completion({
        text: `
          action test [
            for (item in items) {
              log(@@loop<|>)
            }
          ]
        `,
        index: 0,
        assert: (completions: CompletionList) => {
          // Inside loop - should have loop variables
          const loopIndex = completions.items.find(item => item.label === 'loopIndex');
          const loopLength = completions.items.find(item => item.label === 'loopLength');

          expect(loopIndex).toBeDefined();
          expect(loopLength).toBeDefined();
        },
      });
    });

    it('should NOT provide loop variables outside of loops', async () => {
      await completion({
        text: `
          action test [
            log(@@loop<|>)
          ]
        `,
        index: 0,
        assert: (completions: CompletionList) => {
          // Outside loop - should NOT have loop variables
          const loopIndex = completions.items.find(item => item.label === 'loopIndex');
          const loopLength = completions.items.find(item => item.label === 'loopLength');
          const currentItem = completions.items.find(item => item.label === 'currentItem');

          expect(loopIndex).toBeUndefined();
          expect(loopLength).toBeUndefined();
          expect(currentItem).toBeUndefined();
        },
      });
    });

    it('should provide always-available variables in any context', async () => {
      await completion({
        text: `
          action test [
            log(@@<|>)
          ]
        `,
        index: 0,
        assert: (completions: CompletionList) => {
          // Should have always-available variables (currentIndex, eventbus, etc.)
          const currentIndex = completions.items.find(item => item.label === 'currentIndex');
          const eventbus = completions.items.find(item => item.label === 'eventbus');

          expect(currentIndex).toBeDefined();
          expect(currentIndex?.kind).toBe(6);
          expect(currentIndex?.detail).toBe('number');

          expect(eventbus).toBeDefined();
          expect(eventbus?.kind).toBe(6);
          expect(eventbus?.detail).toBe('IEventbus');
        },
      });
    });

    it('should include documentation for variables', async () => {
      await completion({
        text: `
          action test [
            for (item in items) {
              log(@@loop<|>)
            }
          ]
        `,
        index: 0,
        assert: (completions: CompletionList) => {
          // Find loopIndex variable
          const loopIndex = completions.items.find(item => item.label === 'loopIndex');
          expect(loopIndex).toBeDefined();

          // Should have documentation
          expect(loopIndex?.documentation).toBeDefined();

          // Documentation should be a string or MarkupContent
          if (typeof loopIndex?.documentation === 'string') {
            expect(loopIndex.documentation.length).toBeGreaterThan(0);
          } else if (loopIndex?.documentation && 'value' in loopIndex.documentation) {
            expect(loopIndex.documentation.value.length).toBeGreaterThan(0);
          }
        },
      });
    });

    it('should show CompletionItemKind.Variable for system variables', async () => {
      await completion({
        text: `
          action test [
            log(@@event<|>)
          ]
        `,
        index: 0,
        assert: (completions: CompletionList) => {
          // Find eventbus variable
          const eventbus = completions.items.find(item => item.label === 'eventbus');
          expect(eventbus).toBeDefined();
          expect(eventbus?.kind).toBe(6); // CompletionItemKind.Variable = 6
        },
      });
    });

    it('should provide @@item when cursor is inside operation call in loop', async () => {
      await completion({
        text: `
          action animateItems(items) [
            for (item in items) {
              selectElement(<|>)
            }
          ]
        `,
        index: 0,
        assert: (completions: CompletionList) => {
          // Inside operation call parameter position in a loop
          // Should show system property references starting with @@

          // We expect to see suggestions for referencing variables
          // The user needs to type @@ to trigger variable completions
          // So at this position, we should show:
          // 1. Parameter references (items - the action parameter)
          // 2. NOT operation names (those are for statement position, not expression position)
          // 3. Possibly literal values (strings, numbers, booleans)

          // Should NOT show operations (those are statements, not expressions)
          const operations = completions.items.filter(item => item.kind === 3); // CompletionItemKind.Function
          expect(operations.length).toBe(0);

          // Should show the parameter 'items'
          const itemsParam = completions.items.find(item => item.label === 'items');
          expect(itemsParam).toBeDefined();
        },
      });
    });

    it('should provide @@currentItem completion when typing @@ inside operation call in loop', async () => {
      await completion({
        text: `
          action animateItems(items) [
            for (item in items) {
              selectElement(@@<|>)
            }
          ]
        `,
        index: 0,
        assert: (completions: CompletionList) => {
          // When user types @@, should show loop variables
          const currentItem = completions.items.find(item => item.label === 'currentItem');
          const loopIndex = completions.items.find(item => item.label === 'loopIndex');

          expect(currentItem).toBeDefined();
          expect(currentItem?.kind).toBe(6); // CompletionItemKind.Variable

          expect(loopIndex).toBeDefined();
          expect(loopIndex?.kind).toBe(6);
        },
      });
    });

    it('should provide loop variable name (@@item) when typing @@ inside loop', async () => {
      await completion({
        text: `
          action animateItems(items) [
            for (item in items) {
              selectElement(@@<|>)
            }
          ]
        `,
        index: 0,
        assert: (completions: CompletionList) => {
          // Should show the loop variable name 'item' (alias for @@currentItem)
          const loopVar = completions.items.find(item => item.label === 'item');

          expect(loopVar).toBeDefined();
          expect(loopVar?.kind).toBe(6); // CompletionItemKind.Variable
          expect(loopVar?.detail).toContain('loop variable');
        },
      });
    });

    it('should proactively suggest @@item inside operation parameters WITHOUT typing @@', async () => {
      await completion({
        text: `
          action animateItems(items) [
            for (item in items) {
              selectElement(<|>)
            }
          ]
        `,
        index: 0,
        assert: (completions: CompletionList) => {
          // Should proactively show @@item (with @@ prefix in label)
          const loopVar = completions.items.find(item => item.label === '@@item');

          expect(loopVar).toBeDefined();
          expect(loopVar?.kind).toBe(6); // CompletionItemKind.Variable
          expect(loopVar?.detail).toContain('loop variable');

          // Should also show other system properties
          const currentItem = completions.items.find(item => item.label === '@@currentItem');
          expect(currentItem).toBeDefined();
        },
      });
    });
  });
});
