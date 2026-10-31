/**
 * Completion core regressions (audit 2026-10-22, low #32 and #33).
 *
 * - #32: custom-action completion items are cached (not rebuilt by an AST walk
 *   per completionFor call) and not built at all for CSS / event branches.
 * - #33: the event-name completion's main textEdit and its additionalTextEdits
 *   must not overlap, and applying them must yield the skeleton.
 */

import type { CompletionContext, NextFeature } from 'langium/lsp';
import { describe, expect, test } from 'vitest';
import type { CompletionItem, Position, TextEdit } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { detectContext } from '../completion/context.js';
import { handleEventCompletion } from '../completion/event-completion-handler.js';
import { createTestContext } from './test-helpers.js';

const ctx = createTestContext();
let counter = 0;

async function completeAt(code: string): Promise<{ items: CompletionItem[]; text: string }> {
  const cursor = code.indexOf('|');
  const text = code.replace('|', '');
  const document = await ctx.parse(text, {
    documentUri: `file:///test/completion-core-${counter++}.eligian`,
  });
  await ctx.services.shared.workspace.DocumentBuilder.build([document], { validation: true });
  const before = code.substring(0, cursor).split('\n');
  const list = await ctx.services.Eligian.lsp.CompletionProvider?.getCompletion(document, {
    textDocument: { uri: document.uri.toString() },
    position: { line: before.length - 1, character: before[before.length - 1].length },
  });
  return { items: list?.items ?? [], text };
}

const ZERO: Position = { line: 0, character: 0 };

function isBefore(a: Position, b: Position): boolean {
  return a.line < b.line || (a.line === b.line && a.character <= b.character);
}

/**
 * Runs the event-name branch directly. Langium never calls completionFor for a position
 * inside a string token in a plain getCompletion request, so the handler is driven with
 * the completion context Langium would hand it (tokenOffset at the opening quote).
 */
async function eventNameItems(code: string): Promise<{ items: CompletionItem[]; text: string }> {
  const cursor = code.indexOf('|');
  const text = code.replace('|', '');
  const document = await ctx.parse(text, {
    documentUri: `file:///test/completion-core-event-${counter++}.eligian`,
  });
  const position = document.textDocument.positionAt(cursor);
  const cursorContext = detectContext(document, position);
  expect(cursorContext.isInEventNameString).toBe(true);
  const context = {
    document,
    textDocument: document.textDocument,
    offset: cursor,
    tokenOffset: text.lastIndexOf('"', cursor - 1),
    tokenEndOffset: cursor,
    position,
  } as unknown as CompletionContext;
  const items: CompletionItem[] = [];
  const result = handleEventCompletion(
    context,
    {} as NextFeature,
    (_ctx, item) => {
      items.push(item as CompletionItem);
    },
    cursorContext
  );
  expect(result.status).toBe('finalize-noop');
  return { items, text };
}

describe('event-name completion edits (#33)', () => {
  const code = `on event "time|line-play" action handler() [
  selectElement("#a")
]`;

  test('the main edit does not overlap the additional edits', async () => {
    const { items } = await eventNameItems(code);
    const item = items.find(i => i.label === 'language-change');
    expect(item).toBeDefined();
    const main = (item?.textEdit as TextEdit | undefined)?.range ?? { start: ZERO, end: ZERO };
    const extras = (item?.additionalTextEdits ?? []).map(e => e.range);
    expect(extras.length).toBeGreaterThan(0);

    // The main edit is a single-line range (an LSP requirement)
    expect(main.start.line).toBe(main.end.line);

    const all = [main, ...extras].sort((a, b) =>
      a.start.line !== b.start.line
        ? a.start.line - b.start.line
        : a.start.character - b.start.character
    );
    for (let i = 1; i < all.length; i++) {
      // Each range must end at or before the start of the next one
      expect(isBefore(all[i - 1].end, all[i].start)).toBe(true);
    }
  });

  test('applying all edits replaces the whole definition with the skeleton', async () => {
    const { items, text } = await eventNameItems(code);
    const item = items.find(i => i.label === 'language-change');
    expect(item).toBeDefined();
    const edits = [item?.textEdit as TextEdit, ...(item?.additionalTextEdits ?? [])];
    const result = TextDocument.applyEdits(
      TextDocument.create('file:///x', 'eligian', 1, text),
      edits
    );
    expect(result).toBe(
      'on event "language-change" action handleLanguageChange(language: string) [\n\t\n]'
    );
  });

  test('also works when the cursor is at the end of an empty name string', async () => {
    const { items, text } = await eventNameItems('on event "|" action handler() [ ]');
    const item = items.find(i => i.label === 'timeline-play');
    expect(item).toBeDefined();
    const edits = [item?.textEdit as TextEdit, ...(item?.additionalTextEdits ?? [])];
    const result = TextDocument.applyEdits(
      TextDocument.create('file:///x', 'eligian', 1, text),
      edits
    );
    expect(result).toBe('on event "timeline-play" action handleTimelinePlay() [\n\t\n]');
  });
});

describe('action completion caching (#32)', () => {
  function spyOnCallableActions(): { calls: () => number; restore: () => void } {
    const scopeProvider = ctx.services.Eligian.references.ScopeProvider as unknown as {
      getCallableActions: (node: unknown) => unknown;
    };
    const original = scopeProvider.getCallableActions;
    let calls = 0;
    scopeProvider.getCallableActions = function (this: unknown, node: unknown) {
      calls++;
      return original.call(this, node);
    };
    return {
      calls: () => calls,
      restore: () => {
        scopeProvider.getCallableActions = original;
      },
    };
  }

  test('action items are built once for repeated requests on the same document', async () => {
    const text = 'action local [\n  \n]';
    const document = await ctx.parse(text, {
      documentUri: 'file:///test/completion-cache.eligian',
    });
    const params = {
      textDocument: { uri: document.uri.toString() },
      position: { line: 1, character: 2 },
    };
    const provider = ctx.services.Eligian.lsp.CompletionProvider;

    // Warm: resolves linking etc. and fills the cache
    const first = await provider?.getCompletion(document, params);
    expect(first?.items.map(i => i.label)).toContain('local (action)');

    const spy = spyOnCallableActions();
    try {
      const second = await provider?.getCompletion(document, params);
      const third = await provider?.getCompletion(document, params);
      expect(second?.items.map(i => i.label)).toContain('local (action)');
      expect(third?.items.map(i => i.label)).toContain('local (action)');
      expect(spy.calls()).toBe(0);
    } finally {
      spy.restore();
    }
  });

  test('action items are not built when completing inside a CSS string', async () => {
    const code = 'action local [\n  addClass("|")\n]';
    const cursor = code.indexOf('|');
    const document = await ctx.parse(code.replace('|', ''), {
      documentUri: 'file:///test/completion-cache-css.eligian',
    });
    const before = code.substring(0, cursor).split('\n');
    const spy = spyOnCallableActions();
    try {
      await ctx.services.Eligian.lsp.CompletionProvider?.getCompletion(document, {
        textDocument: { uri: document.uri.toString() },
        position: { line: before.length - 1, character: before[before.length - 1].length },
      });
      expect(spy.calls()).toBe(0);
    } finally {
      spy.restore();
    }
  });

  test('the cache is evicted when the document changes', async () => {
    const uri = 'file:///test/completion-cache-evict.eligian';
    const first = await completeAt('action alpha [\n  |\n]').then(r => r.items);
    expect(first.map(i => i.label)).toContain('alpha (action)');
    // A new parse of the same URI (new text) must not return stale items
    const document = await ctx.parse('action beta [\n  \n]', { documentUri: uri });
    const list = await ctx.services.Eligian.lsp.CompletionProvider?.getCompletion(document, {
      textDocument: { uri },
      position: { line: 1, character: 2 },
    });
    const labels = list?.items.map(i => i.label) ?? [];
    expect(labels).toContain('beta (action)');
    expect(labels).not.toContain('alpha (action)');
  });
});
