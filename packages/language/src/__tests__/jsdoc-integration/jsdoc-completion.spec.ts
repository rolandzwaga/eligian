import { EmptyFileSystem } from 'langium';
import { parseDocument } from 'langium/test';
import { describe, expect, test } from 'vitest';
import type { CompletionList } from 'vscode-languageserver-protocol';
import { createEligianServices } from '../../eligian-module.js';

const services = createEligianServices(EmptyFileSystem).Eligian;

async function getCompletions(
  text: string,
  triggerCharacter?: string
): Promise<CompletionList | undefined> {
  const document = await parseDocument(services, text);

  // Find cursor position (marked by |)
  const cursorIndex = text.indexOf('|');
  if (cursorIndex === -1) {
    throw new Error('No cursor position marked with | in test text');
  }

  const _textWithoutCursor = text.replace('|', '');
  const position = document.textDocument.positionAt(cursorIndex);

  const context = triggerCharacter ? { triggerCharacter } : undefined;

  return services.lsp.CompletionProvider?.getCompletion(document, {
    textDocument: { uri: document.uri.toString() },
    position,
    context,
  });
}

describe('JSDoc Completion (T014 - US2)', () => {
  test('should provide JSDoc template when typing /** above action with typed params', async () => {
    const text = `
      /**|
      action fadeIn(selector: string, duration: number) [
        selectElement(selector)
      ]
    `;

    const completions = await getCompletions(text, '*');

    expect(completions).toBeDefined();
    expect(completions?.items).toHaveLength(1);

    const jsdocCompletion = completions!.items[0];
    expect(jsdocCompletion.insertText).toContain('*');
    expect(jsdocCompletion.insertText).toContain('@param {string} selector');
    expect(jsdocCompletion.insertText).toContain('@param {number} duration');
  });

  test('should provide JSDoc template for action with untyped params', async () => {
    const text = `
      /**|
      action test(foo, bar) [
        selectElement(foo)
      ]
    `;

    const completions = await getCompletions(text, '*');

    expect(completions).toBeDefined();
    expect(completions?.items).toHaveLength(1);

    const jsdocCompletion = completions!.items[0];
    // Type inference would happen here in real implementation
    expect(jsdocCompletion.insertText).toContain('@param');
    expect(jsdocCompletion.insertText).toContain('foo');
    expect(jsdocCompletion.insertText).toContain('bar');
  });

  test('should provide JSDoc template for action with no params', async () => {
    const text = `
      /**|
      action test() [
        selectElement("#box")
      ]
    `;

    const completions = await getCompletions(text, '*');

    expect(completions).toBeDefined();
    expect(completions?.items).toHaveLength(1);

    const jsdocCompletion = completions!.items[0];
    expect(jsdocCompletion.insertText).toContain('*');
    expect(jsdocCompletion.insertText).not.toContain('@param'); // No parameters
  });

  test('should NOT provide JSDoc template when NOT above an action', async () => {
    const text = `
      action fadeIn() [ selectElement("#box") ]

      /**|

      timeline "test" in ".container" using raf {}
    `;

    const completions = await getCompletions(text, '*');

    // Should either return undefined or standard completions (not JSDoc template)
    if (completions) {
      const jsdocItems = completions.items.filter(item => item.insertText?.includes('@param'));
      expect(jsdocItems).toHaveLength(0);
    }
  });

  test('should trigger on * character', async () => {
    const text = `
      /**|
      action test(foo: string) [ selectElement(foo) ]
    `;

    // Trigger with * character
    const completions = await getCompletions(text, '*');

    expect(completions).toBeDefined();
    expect(completions?.items.length).toBeGreaterThan(0);
  });
});
