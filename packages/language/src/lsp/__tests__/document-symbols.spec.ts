/**
 * Timeline-aware Outline / breadcrumbs / Go to Symbol (audit idea #20).
 */
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LangiumDocument } from 'langium';
import { beforeAll, describe, expect, test } from 'vitest';
import type { DocumentSymbol, Range } from 'vscode-languageserver';
import { SymbolKind } from 'vscode-languageserver';
import { createTestContext, type TestContext } from '../../__tests__/test-helpers.js';

/** name — detail, indented per level */
function outline(symbols: DocumentSymbol[] | undefined, depth = 0): string[] {
  return (symbols ?? []).flatMap(s => [
    `${'  '.repeat(depth)}${s.name}${s.detail ? ` — ${s.detail}` : ''}`,
    ...outline(s.children, depth + 1),
  ]);
}

const contains = (outer: Range, inner: Range) =>
  (outer.start.line < inner.start.line ||
    (outer.start.line === inner.start.line && outer.start.character <= inner.start.character)) &&
  (outer.end.line > inner.end.line ||
    (outer.end.line === inner.end.line && outer.end.character >= inner.end.character));

describe('document symbols (idea #20)', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  const symbolsOf = async (document: LangiumDocument) =>
    (await ctx.services.Eligian.lsp.DocumentSymbolProvider?.getSymbols(document, {
      textDocument: { uri: document.uri.toString() },
    })) ?? [];

  test('timelines list their lifecycle blocks and events with resolved times and calls', async () => {
    const document = await ctx.parse(`languages { * "en-US" "English" }
const beat = 2s
action reveal(sel, ms) [ selectElement(sel) addClass("on") ]
private endable action glow() [ selectElement("#g") ] [ selectElement("#g") ]
on event "ping" topic "nav" action onPing(target) [ selectElement(target) ]
timeline "Main" in "#stage" using raf {
  on enter [ reveal("#a", 1) on click "#b" toggle ]
  at 0s..@beat as intro [ reveal("#a", 1) wait(1) log("x") addClass("y") ] [ removeClass("on") ]
  at +1s for 2s reveal("#c", 2)
  sequence {
    reveal("#d", 1) for 2s as first
    for 3s [ selectElement("#e") ] [ selectElement("#e") ]
  }
  stagger 500ms ["#f", "#g", "#h"] with reveal(@@item, 1) for 1s
}`);
    expect(outline(await symbolsOf(document))).toEqual([
      'beat — 2s',
      'reveal — action(sel, ms)',
      'glow — private endable action()',
      'onPing — on event "ping" topic "nav"',
      'timeline "Main" — raf · 0s..12s',
      '  on enter — reveal, toggle',
      '  at 0s..2s as intro — reveal, wait, log, …',
      '  at 3s..5s — reveal',
      '  sequence 5s..10s ×2',
      '    5s..7s as first — reveal',
      '    7s..10s — selectElement',
      '  stagger 10s..12s ×3 — reveal',
    ]);
  });

  test('the first argument that reads as text is quoted first (beats look alike otherwise)', async () => {
    const document = await ctx.parse(`timeline "t" in "#s" using raf {
  on enter [ selectElement("#a") ]
  at 0s..1s [ selectElement("#x") log("A rather long sentence that will be cut off somewhere") ] []
}`);
    expect(outline(await symbolsOf(document))).toEqual([
      'timeline "t" — raf · 0s..1s',
      '  on enter — selectElement',
      '  at 0s..1s — "A rather long sentence that will be cut…" · selectElement, log',
    ]);
  });

  test('symbol kinds', async () => {
    const document = await ctx.parse(
      'action a() [ selectElement("#x") ]\ntimeline "t" in "#s" using raf { at 0s..1s a() }'
    );
    const [action, timeline] = await symbolsOf(document);
    expect(action.kind).toBe(SymbolKind.Function);
    expect(timeline.kind).toBe(SymbolKind.Module);
    expect(timeline.children?.[0].kind).toBe(SymbolKind.Event);
  });

  test('a library lists its actions', async () => {
    const document = await ctx.parse(
      'library fx\naction show(sel) [ selectElement(sel) ]\nprivate action hide() [ selectElement("#x") ]'
    );
    expect(outline(await symbolsOf(document))).toEqual([
      'show — action(sel)',
      'hide — private action()',
    ]);
  });

  test('a time that cannot be resolved shows its source', async () => {
    const document = await ctx.parse(
      'timeline "t" in "#s" using raf { at $globaldata.start..5s [ selectElement("#x") ] [] }'
    );
    expect(outline(await symbolsOf(document))).toEqual([
      'timeline "t" — raf',
      '  at $globaldata.start..5s — selectElement',
    ]);
  });

  test('the tour: every timeline and event, ranges nested for the breadcrumbs', async () => {
    const tourDir = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../../../../examples/eligian-tour'
    );
    const document = await ctx.parse(readFileSync(path.join(tourDir, 'tour.eligian'), 'utf-8'));
    const symbols = await symbolsOf(document);
    const timelines = symbols.filter(s => s.kind === SymbolKind.Module);
    expect(timelines.length).toBeGreaterThanOrEqual(7);
    expect(timelines.every(t => (t.children?.length ?? 0) > 0)).toBe(true);
    const check = (list: DocumentSymbol[] | undefined, parent?: DocumentSymbol) => {
      for (const s of list ?? []) {
        expect(contains(s.range, s.selectionRange), s.name).toBe(true);
        if (parent) expect(contains(parent.range, s.range), s.name).toBe(true);
        check(s.children, s);
      }
    };
    check(symbols);
  });
});
