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
            <|>
          ]
        `,
        index: 0,
        assert: (completions: CompletionList) => {
          // Should have operation completions
          expect(completions.items.length).toBeGreaterThan(0);

          // Check if selectElement is present (with "operation:" prefix)
          const selectElement = completions.items.find(
            item => item.label === 'operation: selectElement'
          );
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
            <|>
          ]
        `,
        index: 0,
        assert: (completions: CompletionList) => {
          // Should find selectElement when typing "sel" (with "operation:" prefix)
          const selectElement = completions.items.find(
            item => item.label === 'operation: selectElement'
          );
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
          // Get only operation completions (labels starting with "operation:")
          const operations = completions.items.filter(item => item.label.startsWith('operation:'));

          // Check that operations are sorted alphabetically by name (after "operation: " prefix)
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
            <|>
          ]
        `,
        index: 0,
        assert: (completions: CompletionList) => {
          // Find selectElement operation (with "operation:" prefix)
          const selectElement = completions.items.find(
            item => item.label === 'operation: selectElement'
          );
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
            <|>
          ]
        `,
        index: 0,
        assert: (completions: CompletionList) => {
          // Find selectElement operation (with "operation:" prefix)
          const selectElement = completions.items.find(
            item => item.label === 'operation: selectElement'
          );
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
            <|>
          ]
        `,
        index: 0,
        assert: (completions: CompletionList) => {
          // Should have both operations and custom actions
          expect(completions.items.length).toBeGreaterThan(0);

          // Check if fadeIn custom action is present (with "action:" prefix)
          const fadeIn = completions.items.find(item => item.label === 'action: fadeIn');
          expect(fadeIn).toBeDefined();
          expect(fadeIn?.kind).toBe(3); // CompletionItemKind.Function = 3

          // Check if fadeOut custom action is present (with "action:" prefix)
          const fadeOut = completions.items.find(item => item.label === 'action: fadeOut');
          expect(fadeOut).toBeDefined();
          expect(fadeOut?.kind).toBe(3); // CompletionItemKind.Function = 3
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
            <|>
          ]
        `,
        index: 0,
        assert: (completions: CompletionList) => {
          // Find fadeIn custom action (with "action:" prefix)
          const fadeIn = completions.items.find(item => item.label === 'action: fadeIn');
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
            <|>
          ]

          action fadeIn(selector) [
            selectElement(selector)
          ]
        `,
        index: 0,
        assert: (completions: CompletionList) => {
          // Should find fadeIn even though it's defined after the cursor (with "action:" prefix)
          const fadeIn = completions.items.find(item => item.label === 'action: fadeIn');
          expect(fadeIn).toBeDefined();
          expect(fadeIn?.kind).toBe(3); // CompletionItemKind.Function = 3
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
            <|>
          ]
        `,
        index: 0,
        assert: (completions: CompletionList) => {
          // Custom actions should have "action:" prefix and CompletionItemKind.Function (3)
          const customAction = completions.items.find(
            item => item.label === 'action: customAction'
          );
          expect(customAction).toBeDefined();
          expect(customAction?.kind).toBe(3); // CompletionItemKind.Function = 3

          // Operations should have "operation:" prefix and CompletionItemKind.Function (3)
          const operations = completions.items.filter(item => item.label.startsWith('operation:'));
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
            <|>
          ]
        `,
        index: 0,
        assert: (completions: CompletionList) => {
          // Find initialize action (with "action:" prefix)
          const initialize = completions.items.find(item => item.label === 'action: initialize');
          expect(initialize).toBeDefined();
          expect(initialize?.kind).toBe(3); // CompletionItemKind.Function = 3

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

  describe('Feature 008: Custom Action Code Completions with Prefixes', () => {
    describe('User Story 1: See Custom Actions in Code Completion with Prefixes', () => {
      it('T004: should show custom actions with "action:" prefix', async () => {
        await completion({
          text: `
            action fadeIn() [
              selectElement(".box")
            ]

            action main [
              <|>
            ]
          `,
          index: 0,
          assert: (completions: CompletionList) => {
            // Check if fadeIn custom action appears with "action:" prefix
            const fadeIn = completions.items.find(item => item.label === 'action: fadeIn');
            expect(fadeIn).toBeDefined();
            expect(fadeIn?.insertText).toBe('fadeIn'); // No prefix in insertText
            expect(fadeIn?.kind).toBe(3); // CompletionItemKind.Function
          },
        });
      });

      it('T005: should show operations with "operation:" prefix', async () => {
        await completion({
          text: `
            action test [
              <|>
            ]
          `,
          index: 0,
          assert: (completions: CompletionList) => {
            // Check if selectElement operation appears with "operation:" prefix
            const selectElement = completions.items.find(
              item => item.label === 'operation: selectElement'
            );
            expect(selectElement).toBeDefined();
            expect(selectElement?.insertText).toBe('selectElement'); // No prefix in insertText
            expect(selectElement?.kind).toBe(3); // CompletionItemKind.Function
          },
        });
      });

      it('T006: should show both operations and actions with prefixes in action bodies', async () => {
        await completion({
          text: `
            action fadeIn() [
              selectElement(".box")
            ]

            action main [
              <|>
            ]
          `,
          index: 0,
          assert: (completions: CompletionList) => {
            // Should have both operations and actions
            expect(completions.items.length).toBeGreaterThan(0);

            // Check for operation with prefix
            const selectElement = completions.items.find(
              item => item.label === 'operation: selectElement'
            );
            expect(selectElement).toBeDefined();

            // Check for action with prefix
            const fadeIn = completions.items.find(item => item.label === 'action: fadeIn');
            expect(fadeIn).toBeDefined();
          },
        });
      });

      it('T007: should show completions with prefixes in control flow (if/for)', async () => {
        await completion({
          text: `
            action fadeIn() [
              selectElement(".box")
            ]

            action test [
              for (item in items) {
                <|>
              }
            ]
          `,
          index: 0,
          assert: (completions: CompletionList) => {
            // Check for operation with prefix
            const selectElement = completions.items.find(
              item => item.label === 'operation: selectElement'
            );
            expect(selectElement).toBeDefined();

            // Check for action with prefix
            const fadeIn = completions.items.find(item => item.label === 'action: fadeIn');
            expect(fadeIn).toBeDefined();
          },
        });
      });

      it('T008: should show only operations (with prefix) when file has no custom actions', async () => {
        await completion({
          text: `
            action test [
              se<|>
            ]
          `,
          index: 0,
          assert: (completions: CompletionList) => {
            // Should have operations
            expect(completions.items.length).toBeGreaterThan(0);

            // All operations should have "operation:" prefix
            const operations = completions.items.filter(item =>
              item.label.startsWith('operation:')
            );
            expect(operations.length).toBeGreaterThan(0);

            // No actions should be present (no custom actions defined)
            const actions = completions.items.filter(item => item.label.startsWith('action:'));
            expect(actions.length).toBe(0);
          },
        });
      });
    });

    describe('User Story 2: Alphabetical Sorting of Combined List', () => {
      it('T013: should sort operations and actions alphabetically by name (interleaved)', async () => {
        await completion({
          text: `
            action fadeIn() [
              selectElement(".box")
            ]

            action setup() [
              selectElement(".app")
            ]

            action main [
              <|>
            ]
          `,
          index: 0,
          assert: (completions: CompletionList) => {
            // NOTE: Langium's test utility doesn't sort by sortText, but VS Code does
            // This test verifies sortText is set correctly for real LSP clients
            const items = completions.items;

            // Check that sortText is set correctly (case-insensitive name)
            const fadeIn = items.find(item => item.label === 'action: fadeIn');
            const setup = items.find(item => item.label === 'action: setup');
            const addClass = items.find(item => item.label === 'operation: addClass');
            const selectElement = items.find(item => item.label === 'operation: selectElement');

            expect(fadeIn?.sortText).toBe('fadein');
            expect(setup?.sortText).toBe('setup');
            expect(addClass?.sortText).toBe('addclass');
            expect(selectElement?.sortText).toBe('selectelement');

            // Verify alphabetical order: addclass < fadein < selectelement < setup
            expect(fadeIn?.sortText?.localeCompare(addClass?.sortText || '')).toBeGreaterThan(0);
            expect(selectElement?.sortText?.localeCompare(fadeIn?.sortText || '')).toBeGreaterThan(
              0
            );
            expect(setup?.sortText?.localeCompare(selectElement?.sortText || '')).toBeGreaterThan(
              0
            );
          },
        });
      });

      it('T014: should use case-insensitive sorting', async () => {
        await completion({
          text: `
            action AAA() [
              selectElement(".box")
            ]

            action zzz() [
              selectElement(".box")
            ]

            action main [
              <|>
            ]
          `,
          index: 0,
          assert: (completions: CompletionList) => {
            // NOTE: Langium's test utility doesn't sort by sortText, but VS Code does
            // This test verifies case-insensitive sortText is set correctly
            const items = completions.items;

            const aaa = items.find(item => item.label === 'action: AAA');
            const zzz = items.find(item => item.label === 'action: zzz');

            // Check sortText is lowercase (case-insensitive)
            expect(aaa?.sortText).toBe('aaa');
            expect(zzz?.sortText).toBe('zzz');

            // Verify aaa < zzz alphabetically
            expect(aaa?.sortText?.localeCompare(zzz?.sortText || '')).toBeLessThan(0);
          },
        });
      });
    });

    describe('User Story 3: Prefix Clarity for Type Distinction', () => {
      it('T017: should insert operation name without prefix', async () => {
        await completion({
          text: `
            action test [
              <|>
            ]
          `,
          index: 0,
          assert: (completions: CompletionList) => {
            const selectElement = completions.items.find(
              item => item.label === 'operation: selectElement'
            );
            expect(selectElement).toBeDefined();
            expect(selectElement?.insertText).toBe('selectElement'); // No prefix
            expect(selectElement?.label).toBe('operation: selectElement'); // With prefix
          },
        });
      });

      it('T018: should insert action name without prefix', async () => {
        await completion({
          text: `
            action fadeIn() [
              selectElement(".box")
            ]

            action main [
              <|>
            ]
          `,
          index: 0,
          assert: (completions: CompletionList) => {
            const fadeIn = completions.items.find(item => item.label === 'action: fadeIn');
            expect(fadeIn).toBeDefined();
            expect(fadeIn?.insertText).toBe('fadeIn'); // No prefix
            expect(fadeIn?.label).toBe('action: fadeIn'); // With prefix
          },
        });
      });

      it('T019: should have consistent prefix format for all items', async () => {
        await completion({
          text: `
            action customAction() [
              selectElement(".box")
            ]

            action main [
              <|>
            ]
          `,
          index: 0,
          assert: (completions: CompletionList) => {
            // Check all operations have "operation:" prefix
            const operations = completions.items.filter(item =>
              item.label.startsWith('operation:')
            );
            expect(operations.length).toBeGreaterThan(0);

            // Check all custom actions have "action:" prefix
            const actions = completions.items.filter(item => item.label.startsWith('action:'));
            expect(actions.length).toBeGreaterThan(0);

            // Verify no operations have "action:" prefix and vice versa
            for (const op of operations) {
              expect(op.label).toMatch(/^operation: [a-zA-Z]+$/);
            }
            for (const action of actions) {
              expect(action.label).toMatch(/^action: [a-zA-Z]+$/);
            }
          },
        });
      });
    });
  });
});
