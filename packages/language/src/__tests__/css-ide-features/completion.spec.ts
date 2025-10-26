/**
 * Unit tests for CSS completion provider
 *
 * These tests verify that CSS class and ID completions are generated correctly
 * with proper structure (label, kind, sortText, detail).
 */

import type { CompletionContext } from 'langium/lsp';
import { describe, expect, it } from 'vitest';
import type { CompletionItem } from 'vscode-languageserver-protocol';
import { CompletionItemKind } from 'vscode-languageserver-protocol';

import { CSSCompletionProvider } from '../../css/css-completion.js';

/**
 * Create a mock completion context for testing
 */
function createMockContext(
  text = '',
  tokenOffset = 0,
  offset = text.length,
  tokenEndOffset = text.length
): CompletionContext {
  return {
    textDocument: {
      getText: () => text,
      positionAt: (pos: number) => ({ line: 0, character: pos }),
    },
    tokenOffset,
    offset,
    tokenEndOffset,
  } as unknown as CompletionContext;
}

describe('CSS Completion Provider', () => {
  describe('provideCSSClassCompletions', () => {
    it('should generate completion items for all CSS classes', () => {
      const provider = new CSSCompletionProvider();
      const classes = new Set(['button', 'primary', 'active', 'hidden']);
      const context = createMockContext();

      const items: CompletionItem[] = [];
      const acceptor = (_ctx: CompletionContext, item: CompletionItem) => items.push(item);

      provider.provideCSSClassCompletions(context, classes, acceptor);

      expect(items).toHaveLength(4);
      const labels = items.map(item => item.label);
      expect(labels).toContain('button');
      expect(labels).toContain('primary');
      expect(labels).toContain('active');
      expect(labels).toContain('hidden');
    });

    it('should generate completion items with correct structure', () => {
      const provider = new CSSCompletionProvider();
      const classes = new Set(['button']);

      const items: CompletionItem[] = [];
      const acceptor = (_ctx: CompletionContext, item: CompletionItem) => items.push(item);

      const context = createMockContext();
      provider.provideCSSClassCompletions(context, classes, acceptor);

      expect(items).toHaveLength(1);
      const item = items[0];

      expect(item.label).toBe('button');
      expect(item.kind).toBe(CompletionItemKind.Property);
      expect(item.detail).toBe('CSS class');
      expect(item.sortText).toBe('0_button');
      expect(item.insertText).toBe('button');
    });

    it('should use sortText prefix "0_" to rank CSS items first', () => {
      const provider = new CSSCompletionProvider();
      const classes = new Set(['button', 'primary']);

      const items: CompletionItem[] = [];
      const acceptor = (_ctx: CompletionContext, item: CompletionItem) => items.push(item);

      const context = createMockContext();
      provider.provideCSSClassCompletions(context, classes, acceptor);

      for (const item of items) {
        expect(item.sortText).toMatch(/^0_/);
      }

      expect(items[0].sortText).toBe('0_button');
      expect(items[1].sortText).toBe('0_primary');
    });

    it('should handle empty class set gracefully', () => {
      const provider = new CSSCompletionProvider();
      const classes = new Set<string>();

      const items: CompletionItem[] = [];
      const acceptor = (_ctx: CompletionContext, item: CompletionItem) => items.push(item);

      const context = createMockContext();
      provider.provideCSSClassCompletions(context, classes, acceptor);

      expect(items).toHaveLength(0);
    });

    it('should generate items for classes with hyphens and underscores', () => {
      const provider = new CSSCompletionProvider();
      const classes = new Set(['btn-primary', 'nav_item', 'is-active']);

      const items: CompletionItem[] = [];
      const acceptor = (_ctx: CompletionContext, item: CompletionItem) => items.push(item);

      const context = createMockContext();
      provider.provideCSSClassCompletions(context, classes, acceptor);

      expect(items).toHaveLength(3);
      const labels = items.map(item => item.label);
      expect(labels).toContain('btn-primary');
      expect(labels).toContain('nav_item');
      expect(labels).toContain('is-active');
    });
  });

  describe('provideSelectorCompletions', () => {
    it('should generate completion items for CSS classes (after dot)', () => {
      const provider = new CSSCompletionProvider();
      const classes = new Set(['button', 'primary']);
      const ids = new Set<string>();

      const items: CompletionItem[] = [];
      const acceptor = (_ctx: CompletionContext, item: CompletionItem) => items.push(item);

      const text = '"."';
      const context = createMockContext(text, 0, 2, 3);

      provider.provideSelectorCompletions(context, classes, ids, 'class', acceptor);

      expect(items).toHaveLength(2);
      expect(items[0].label).toBe('button');
      expect(items[1].label).toBe('primary');
    });

    it('should generate completion items for CSS IDs (after hash)', () => {
      const provider = new CSSCompletionProvider();
      const classes = new Set<string>();
      const ids = new Set(['header', 'footer', 'main']);

      const items: CompletionItem[] = [];
      const acceptor = (_ctx: CompletionContext, item: CompletionItem) => items.push(item);

      const text = '"#"';
      const context = createMockContext(text, 0, 2, 3);

      provider.provideSelectorCompletions(context, classes, ids, 'id', acceptor);

      expect(items).toHaveLength(3);
      const labels = items.map(item => item.label);
      expect(labels).toContain('header');
      expect(labels).toContain('footer');
      expect(labels).toContain('main');
    });

    it('should NOT include dot/hash prefix in label or textEdit', () => {
      const provider = new CSSCompletionProvider();
      const classes = new Set(['button']);
      const ids = new Set(['header']);

      const classItems: CompletionItem[] = [];
      const classAcceptor = (_ctx: CompletionContext, item: CompletionItem) =>
        classItems.push(item);

      const classText = '"."';
      const classContext = createMockContext(classText, 0, 2, 3);
      provider.provideSelectorCompletions(classContext, classes, new Set(), 'class', classAcceptor);

      const idItems: CompletionItem[] = [];
      const idAcceptor = (_ctx: CompletionContext, item: CompletionItem) => idItems.push(item);

      const idText = '"#"';
      const idContext = createMockContext(idText, 0, 2, 3);
      provider.provideSelectorCompletions(idContext, new Set(), ids, 'id', idAcceptor);

      expect(classItems[0].label).toBe('button');
      expect(classItems[0].textEdit?.newText).toBe('button');

      expect(idItems[0].label).toBe('header');
      expect(idItems[0].textEdit?.newText).toBe('header');
    });

    it('should use sortText to rank CSS items first', () => {
      const provider = new CSSCompletionProvider();
      const classes = new Set(['button']);
      const ids = new Set(['header']);

      const items: CompletionItem[] = [];
      const acceptor = (_ctx: CompletionContext, item: CompletionItem) => items.push(item);

      const text = '"."';
      const context = createMockContext(text, 0, 2, 3);
      provider.provideSelectorCompletions(context, classes, ids, 'class', acceptor);
      provider.provideSelectorCompletions(context, classes, ids, 'id', acceptor);

      for (const item of items) {
        expect(item.sortText).toMatch(/^0_/);
      }
    });

    it('should set kind to Property for classes', () => {
      const provider = new CSSCompletionProvider();
      const classes = new Set(['button']);

      const items: CompletionItem[] = [];
      const acceptor = (_ctx: CompletionContext, item: CompletionItem) => items.push(item);

      const text = '"."';
      const context = createMockContext(text, 0, 2, 3);
      provider.provideSelectorCompletions(context, classes, new Set(), 'class', acceptor);

      expect(items[0].kind).toBe(CompletionItemKind.Property);
    });

    it('should set kind to Property for IDs', () => {
      const provider = new CSSCompletionProvider();
      const ids = new Set(['header']);

      const items: CompletionItem[] = [];
      const acceptor = (_ctx: CompletionContext, item: CompletionItem) => items.push(item);

      const text = '"#"';
      const context = createMockContext(text, 0, 2, 3);
      provider.provideSelectorCompletions(context, new Set(), ids, 'id', acceptor);

      expect(items[0].kind).toBe(CompletionItemKind.Property);
    });
  });

  describe('Detail text', () => {
    it('should show "CSS class" for className completions', () => {
      const provider = new CSSCompletionProvider();
      const classes = new Set(['button']);

      const items: CompletionItem[] = [];
      const acceptor = (_ctx: CompletionContext, item: CompletionItem) => items.push(item);

      const context = createMockContext();
      provider.provideCSSClassCompletions(context, classes, acceptor);

      expect(items[0].detail).toBe('CSS class');
    });

    it('should show "CSS class" for selector class completions', () => {
      const provider = new CSSCompletionProvider();
      const classes = new Set(['button']);

      const items: CompletionItem[] = [];
      const acceptor = (_ctx: CompletionContext, item: CompletionItem) => items.push(item);

      const text = '"."';
      const context = createMockContext(text, 0, 2, 3);
      provider.provideSelectorCompletions(context, classes, new Set(), 'class', acceptor);

      expect(items[0].detail).toBe('CSS class');
    });

    it('should show "CSS ID" for selector ID completions', () => {
      const provider = new CSSCompletionProvider();
      const ids = new Set(['header']);

      const items: CompletionItem[] = [];
      const acceptor = (_ctx: CompletionContext, item: CompletionItem) => items.push(item);

      const text = '"#"';
      const context = createMockContext(text, 0, 2, 3);
      provider.provideSelectorCompletions(context, new Set(), ids, 'id', acceptor);

      expect(items[0].detail).toBe('CSS ID');
    });
  });
});
