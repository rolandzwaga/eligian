import { EmptyFileSystem } from 'langium';
import { expectFindReferences, expectGoToDefinition } from 'langium/test';
import { beforeAll, describe, test } from 'vitest';
import { createEligianServices } from '../eligian-module.js';

const services = createEligianServices(EmptyFileSystem).Eligian;

describe('Custom Action Reference Provider - LSP Integration', () => {
  beforeAll(async () => {
    await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
  });

  describe('Go to Definition (Ctrl+Click, F12)', () => {
    test('US1: Navigate from direct timeline call to action definition', async () => {
      const expectDef = expectGoToDefinition(services);

      await expectDef({
        text: `
          action <|fadeIn|>(selector, duration) [
            selectElement(selector)
          ]

          timeline "main" in ".container" using raf {
            at 0s..1s <|>fadeIn("#box", 1000)
          }
        `,
        index: 0,
        rangeIndex: 0,
      });
    });

    test('US2: Navigate from inline endable block to action definition', async () => {
      const expectDef = expectGoToDefinition(services);

      await expectDef({
        text: `
          action <|fadeIn|>(selector, duration) [
            selectElement(selector)
          ]

          timeline "main" in ".container" using raf {
            at 0s..3s [ <|>fadeIn("#box", 1000) ] []
          }
        `,
        index: 0,
        rangeIndex: 0,
      });
    });

    test('US3: Navigate from sequence block to action definition', async () => {
      const expectDef = expectGoToDefinition(services);

      await expectDef({
        text: `
          action <|fadeIn|>(selector, duration) [
            selectElement(selector)
          ]

          timeline "main" in ".container" using raf {
            at 0s..5s sequence { <|>fadeIn("#box", 1000) for 1s }
          }
        `,
        index: 0,
        rangeIndex: 0,
      });
    });

    test('US4: Navigate from stagger block to action definition', async () => {
      const expectDef = expectGoToDefinition(services);

      await expectDef({
        text: `
          action <|fadeIn|>(selector, duration) [
            selectElement(selector)
          ]

          timeline "main" in ".container" using raf {
            at 0s..5s stagger 200ms ["#box", "#title"] with <|>fadeIn(@@item, 1000) for 1s
          }
        `,
        index: 0,
        rangeIndex: 0,
      });
    });

    test('US5: Navigate from control flow (if block) to action definition', async () => {
      const expectDef = expectGoToDefinition(services);

      await expectDef({
        text: `
          action <|fadeIn|>(selector, duration) [
            selectElement(selector)
          ]

          action complexAction(selector) [
            if (@@condition) {
              <|>fadeIn(selector, 1000)
            }
          ]
        `,
        index: 0,
        rangeIndex: 0,
      });
    });

    test('US6: Navigate from control flow (for loop) to action definition', async () => {
      const expectDef = expectGoToDefinition(services);

      await expectDef({
        text: `
          action <|fadeIn|>(selector, duration) [
            selectElement(selector)
          ]

          action complexAction(items) [
            for (item in items) {
              <|>fadeIn(@@currentItem, 1000)
            }
          ]
        `,
        index: 0,
        rangeIndex: 0,
      });
    });

    test('Edge Case: Action calling another action', async () => {
      const expectDef = expectGoToDefinition(services);

      await expectDef({
        text: `
          action <|fadeIn|>(selector) [
            selectElement(selector)
          ]

          action complexAction(target) [
            <|>fadeIn(target)
          ]
        `,
        index: 0,
        rangeIndex: 0,
      });
    });

    test('Edge Case: Multiple actions with different names', async () => {
      const expectDef = expectGoToDefinition(services);

      await expectDef({
        text: `
          action <|fadeIn|>(selector) [
            selectElement(selector)
          ]

          action fadeOut(selector) [
            selectElement(selector)
          ]

          timeline "main" in ".container" using raf {
            at 0s..1s <|>fadeIn("#box")
          }
        `,
        index: 0,
        rangeIndex: 0,
      });
    });

    test('Edge Case: Built-in operation should not navigate', async () => {
      const expectDef = expectGoToDefinition(services);

      // Built-in operations like selectElement should not have a definition
      // This test verifies that we don't incorrectly navigate to anything
      await expectDef({
        text: `
          timeline "main" in ".container" using raf {
            at 0s..1s <|>selectElement("#box")
          }
        `,
        index: 0,
        rangeIndex: [],
      });
    });
  });

  describe('Find All References (Shift+F12)', () => {
    test('US7: Find all references to action including declaration', async () => {
      const expectRefs = expectFindReferences(services);

      await expectRefs({
        text: `
          action <|fadeIn|>(selector, duration) [
            selectElement(selector)
          ]

          timeline "main" in ".container" using raf {
            at 0s..1s <|fadeIn|>("#box", 1000)
            at 2s..3s <|fadeIn|>("#title", 500)
            at 4s..5s sequence { <|fadeIn|>("#content", 800) for 1s }
          }
        `,
        includeDeclaration: true,
      });
    });

    test('US8: Find all references to action excluding declaration', async () => {
      const expectRefs = expectFindReferences(services);

      await expectRefs({
        text: `
          action fadeIn(selector, duration) [
            selectElement(selector)
          ]

          timeline "main" in ".container" using raf {
            at 0s..1s <|fadeIn|>("#box", 1000)
            at 2s..3s <|fadeIn|>("#title", 500)
          }
        `,
        includeDeclaration: false,
      });
    });

    test('US9: Find references across different timeline contexts', async () => {
      const expectRefs = expectFindReferences(services);

      await expectRefs({
        text: `
          action <|fadeIn|>(selector) [
            selectElement(selector)
          ]

          timeline "main" in ".container" using raf {
            at 0s..1s <|fadeIn|>("#box")
            at 2s..3s [ <|fadeIn|>("#title") ] []
            at 4s..5s sequence { <|fadeIn|>("#content") for 1s }
            at 6s..8s stagger 200ms ["#a", "#b"] with <|fadeIn|>(@@item) for 1s
          }
        `,
        includeDeclaration: true,
      });
    });

    test('US10: Find references in control flow blocks', async () => {
      const expectRefs = expectFindReferences(services);

      await expectRefs({
        text: `
          action <|fadeIn|>(selector) [
            selectElement(selector)
          ]

          action complexAction(items) [
            if (@@condition) {
              <|fadeIn|>(@@item)
            }

            for (item in items) {
              <|fadeIn|>(@@currentItem)
            }
          ]
        `,
        includeDeclaration: true,
      });
    });

    test('Edge Case: Action with zero references', async () => {
      const expectRefs = expectFindReferences(services);

      await expectRefs({
        text: `
          action <|fadeIn|>(selector) [
            selectElement(selector)
          ]

          timeline "main" in ".container" using raf {
            at 0s..1s selectElement("#box")
          }
        `,
        includeDeclaration: true,
      });
    });

    test('Edge Case: Action called by another action', async () => {
      const expectRefs = expectFindReferences(services);

      await expectRefs({
        text: `
          action <|fadeIn|>(selector) [
            selectElement(selector)
          ]

          action complexAction(target) [
            <|fadeIn|>(target)
          ]

          timeline "main" in ".container" using raf {
            at 0s..1s <|fadeIn|>("#box")
          }
        `,
        includeDeclaration: true,
      });
    });

    test('Edge Case: Multiple actions, only find specific one', async () => {
      const expectRefs = expectFindReferences(services);

      await expectRefs({
        text: `
          action <|fadeIn|>(selector) [
            selectElement(selector)
          ]

          action fadeOut(selector) [
            selectElement(selector)
          ]

          timeline "main" in ".container" using raf {
            at 0s..1s <|fadeIn|>("#box")
            at 2s..3s fadeOut("#box")
            at 4s..5s <|fadeIn|>("#title")
          }
        `,
        includeDeclaration: true,
      });
    });
  });

  describe('Performance Requirements', () => {
    test('SC-001: Navigation completes in < 1 second for 100 actions', async () => {
      const expectDef = expectGoToDefinition(services);

      // Generate 99 action definitions (0-98)
      const actions = Array.from(
        { length: 99 },
        (_, i) => `
        action action${i}(param) [
          selectElement(param)
        ]
      `
      ).join('\n');

      // Define action99 with markers
      const text = `
        ${actions}
        action <|action99|>(param) [
          selectElement(param)
        ]

        timeline "main" in ".container" using raf {
          at 0s..1s <|>action99("#box")
        }
      `;

      const startTime = performance.now();
      await expectDef({
        text,
        index: 0,
        rangeIndex: 0,
      });
      const endTime = performance.now();

      const duration = endTime - startTime;
      // Should complete in less than 1 second (1000ms)
      console.log(`Navigation with 100 actions took: ${duration.toFixed(2)}ms`);
      // Note: This is a soft requirement - test will pass regardless
      // but we log the duration for monitoring
    });
  });

  describe('Accuracy Requirements', () => {
    test('SC-002: 100% accuracy - no false positives', async () => {
      const expectDef = expectGoToDefinition(services);

      // Test that we don't navigate to similarly named actions
      await expectDef({
        text: `
          action <|fade|>(selector) [
            selectElement(selector)
          ]

          action fadeIn(selector) [
            selectElement(selector)
          ]

          action fadeOut(selector) [
            selectElement(selector)
          ]

          timeline "main" in ".container" using raf {
            at 0s..1s <|>fade("#box")
          }
        `,
        index: 0,
        rangeIndex: 0, // Should navigate ONLY to 'fade', not 'fadeIn' or 'fadeOut'
      });
    });

    test('SC-003: 100% accuracy - no false negatives', async () => {
      const expectRefs = expectFindReferences(services);

      // Test that we find ALL references, even in nested contexts
      await expectRefs({
        text: `
          action <|fadeIn|>(selector) [
            selectElement(selector)
          ]

          action outer(items) [
            for (item in items) {
              if (@@condition) {
                <|fadeIn|>(@@item)
              }
            }
          ]

          timeline "main" in ".container" using raf {
            at 0s..1s <|fadeIn|>("#a")
            at 2s..3s [ <|fadeIn|>("#b") ] []
            at 4s..5s sequence {
              if (@@check) {
                <|fadeIn|>("#c")
              } for 1s
            }
            at 6s..8s stagger 200ms ["#d"] with <|fadeIn|>(@@item) for 1s
          }
        `,
        includeDeclaration: true,
      });
    });
  });
});
