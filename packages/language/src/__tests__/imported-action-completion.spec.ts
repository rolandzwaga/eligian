/**
 * Imported (library) actions must be suggested at operation-name positions
 * (audit 2026-10-22, medium #30).
 */

import { beforeAll, describe, expect, test } from 'vitest';
import {
  createLibraryDocument,
  createTestContextWithMockFS,
  type TestContext,
} from './test-helpers.js';

describe('Imported action completion at operation-name positions', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = createTestContextWithMockFS();
    await createLibraryDocument(
      ctx,
      `
        library importedCompletionLib

        action fadeIn(selector: string, duration: number) [
          selectElement(selector)
        ]

        action slideIn(selector: string) [
          selectElement(selector)
        ]

        private action hiddenHelper(selector: string) [
          selectElement(selector)
        ]
      `,
      'file:///test/importedCompletionLib.eligian'
    );
  });

  async function completionLabels(code: string, uri: string): Promise<string[]> {
    const cursor = code.indexOf('|');
    const document = await ctx.parse(code.replace('|', ''), { documentUri: uri });
    await ctx.services.shared.workspace.DocumentBuilder.build([document], { validation: true });
    const before = code.substring(0, cursor).split('\n');
    const completions = await ctx.services.Eligian.lsp.CompletionProvider?.getCompletion(document, {
      textDocument: { uri: document.uri.toString() },
      position: { line: before.length - 1, character: before[before.length - 1].length },
    });
    return (completions?.items ?? []).map(item => String(item.label));
  }

  test('suggests imported actions on an empty line inside an action body', async () => {
    const labels = await completionLabels(
      `
        import { fadeIn } from "./importedCompletionLib.eligian"

        action local [
          |
        ]
      `,
      'file:///test/imported-completion-1.eligian'
    );
    expect(labels).toContain('local (action)');
    expect(labels).toContain('fadeIn (action)');
    // Only what was imported, and never private actions
    expect(labels).not.toContain('slideIn (action)');
    expect(labels).not.toContain('hiddenHelper (action)');
  });

  test('suggests aliased imports under their alias', async () => {
    const labels = await completionLabels(
      `
        import { fadeIn as appear } from "./importedCompletionLib.eligian"

        action local [
          |
        ]
      `,
      'file:///test/imported-completion-2.eligian'
    );
    expect(labels).toContain('appear (action)');
    expect(labels).not.toContain('fadeIn (action)');
  });

  test('suggests imported actions while typing a prefix, without duplicates', async () => {
    const labels = await completionLabels(
      `
        import { fadeIn } from "./importedCompletionLib.eligian"

        action local [
          fade|
        ]
      `,
      'file:///test/imported-completion-3.eligian'
    );
    expect(labels.filter(label => label.startsWith('fadeIn'))).toEqual(['fadeIn (action)']);
  });

  test('suggests imported actions in a timeline event', async () => {
    const labels = await completionLabels(
      `
        import { fadeIn } from "./importedCompletionLib.eligian"

        timeline "Test" in ".container" using raf {
          at 0s..2s |
        }
      `,
      'file:///test/imported-completion-4.eligian'
    );
    expect(labels).toContain('fadeIn (action)');
  });

  describe('built-in operations are not offered where only actions are valid', () => {
    const operationLabels = (labels: string[]) =>
      labels.filter(label => label === 'addClass' || label.startsWith('addClass '));

    test.each([
      ['a direct timeline event', 'at 0s..2s |'],
      ['a timeline for body', 'at 0s..2s for (x in ["a"]) {\n            |\n          }'],
    ])('at %s only actions are suggested', async (_label, event) => {
      const labels = await completionLabels(
        `
        import { fadeIn } from "./importedCompletionLib.eligian"

        action local [
          selectElement("#a")
        ]

        timeline "Test" in ".container" using raf {
          ${event}
        }
      `,
        `file:///test/imported-completion-ops-${_label.replace(/\W+/g, '-')}.eligian`
      );
      expect(labels).toContain('fadeIn (action)');
      expect(labels).toContain('local (action)');
      expect(operationLabels(labels)).toEqual([]);
    });

    test.each([
      ['an inline endable action', 'at 0s..2s [\n            |\n          ] []'],
      ['an inline stagger block', 'stagger 100ms ["#a"] for 1s [\n            |\n          ] []'],
    ])('inside %s operations are suggested too', async (_label, event) => {
      const labels = await completionLabels(
        `
        timeline "Test" in ".container" using raf {
          ${event}
        }
      `,
        `file:///test/imported-completion-ops-${_label.replace(/\W+/g, '-')}.eligian`
      );
      expect(operationLabels(labels).length).toBeGreaterThan(0);
    });
  });
});
