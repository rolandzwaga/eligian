/**
 * Timeline event snippets (audit idea #13) and the extension's snippet file.
 */
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expectCompletion } from 'langium/test';
import { beforeAll, describe, expect, test } from 'vitest';
import type { CompletionItem, CompletionList } from 'vscode-languageserver-protocol';
import { createTestContext, type TestContext } from '../../__tests__/test-helpers.js';

describe('timeline event snippets', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  async function snippetsAt(text: string): Promise<CompletionItem[]> {
    let items: CompletionItem[] = [];
    await expectCompletion(ctx.services.Eligian)({
      text,
      index: 0,
      assert: (completions: CompletionList) => {
        items = completions.items.filter(i => i.kind === 15 /* Snippet */);
      },
    });
    return items;
  }

  const insertOf = (items: CompletionItem[], label: string) =>
    items.find(i => i.label === label)?.insertText;

  /** The expected `at` snippet text, spelled out without template syntax. */
  const atSnippet = (start: string) =>
    ['at $', `{1:${start}}`, ' for $', '{2:5s} [\n\t$0\n]'].join('');

  test('offers at, sequence and stagger skeletons once each in a timeline body', async () => {
    const items = await snippetsAt('timeline "t" in ".c" using raf {\n  <|>\n}');

    expect(items.map(i => i.label)).toEqual(['at … for … [ ]', 'sequence { }', 'stagger … with …']);
    expect(insertOf(items, 'at … for … [ ]')).toBe(atSnippet('0s'));
  });

  test("the at snippet starts at the previous event's end", async () => {
    const items = await snippetsAt(`timeline "t" in ".c" using raf {
  at 0s..20s [ selectElement("#a") ]
  at +1s for 10s [ selectElement("#a") ]
  <|>
}`);

    expect(insertOf(items, 'at … for … [ ]')).toBe(atSnippet('31s'));
  });

  test('after an event whose end is not statically known it starts at +0s', async () => {
    const items = await snippetsAt(`timeline "t" in ".c" using raf {
  sequence { intro() for 2s }
  <|>
}`);

    expect(insertOf(items, 'at … for … [ ]')).toBe(atSnippet('+0s'));
  });

  test('are not offered inside an event block', async () => {
    const items = await snippetsAt('timeline "t" in ".c" using raf {\n  at 0s..1s [ <|> ]\n}');
    expect(items.map(i => i.label)).not.toContain('at … for … [ ]');
  });
});

describe('cursor between timeline events', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  async function labelsAt(text: string): Promise<string[]> {
    let labels: string[] = [];
    await expectCompletion(ctx.services.Eligian)({
      text,
      index: 0,
      assert: (completions: CompletionList) => {
        labels = completions.items.map(i => i.label);
      },
    });
    return labels;
  }

  test('after a complete event, operations (invalid there) are not offered', async () => {
    const labels = await labelsAt(`timeline "t" in ".c" using raf {
  at 0s..1s [ selectElement("#a") ]
  <|>
}`);
    expect(labels).toContain('at … for … [ ]');
    expect(labels.some(l => l.startsWith('addClass'))).toBe(false);
  });

  test('inside an unclosed inline block, operations are still offered', async () => {
    const labels = await labelsAt(`timeline "t" in ".c" using raf {
  at 0s..1s [ selectElement("#a")
  <|>
}`);
    expect(labels.some(l => l.startsWith('addClass'))).toBe(true);
    expect(labels).not.toContain('at … for … [ ]');
  });
});

describe('extension snippets (packages/extension/snippets/eligian.json)', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  const here = path.dirname(fileURLToPath(import.meta.url));
  const file = path.resolve(here, '../../../../extension/snippets/eligian.json');
  const snippets = JSON.parse(readFileSync(file, 'utf-8')) as Record<
    string,
    { prefix: string; body: string[] }
  >;

  /** A snippet body with every placeholder replaced by its default (first choice). */
  const expand = (body: string[]) =>
    body
      .join('\n')
      .replace(/\$\{\d+\|([^,|]*)[^}]*\}/g, '$1')
      .replace(/\$\{\d+:([^}]*)\}/g, '$1')
      .replace(/\$\{\d+\}/g, '')
      .replace(/\$\d+/g, '');

  test.each(Object.entries(snippets))(
    '%s expands to code the grammar accepts',
    async (name, snippet) => {
      const code = expand(snippet.body);
      // Program snippets other than timelines need a timeline next to them
      const program =
        name === 'Library' || name.includes('imeline')
          ? code
          : `${code}\ntimeline "t" in ".c" using raf {}`;
      const document = await ctx.parse(program);
      expect(document.parseResult.lexerErrors).toEqual([]);
      expect(document.parseResult.parserErrors).toEqual([]);
    }
  );
});
