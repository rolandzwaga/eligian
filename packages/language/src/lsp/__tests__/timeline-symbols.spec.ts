/**
 * Timeline names as symbols (audit idea #16): navigate targets and timeline
 * names for Go to Definition, Find References, Rename, completion and quick fixes.
 */
import type { LangiumDocument } from 'langium';
import { beforeAll, describe, expect, test } from 'vitest';
import type { CodeAction, Range, TextEdit } from 'vscode-languageserver-protocol';
import { createTestContext, type TestContext } from '../../__tests__/test-helpers.js';

const SOURCE = `action go() [ selectElement("#a") ]
timeline "Hub" in "#stage" using raf {
  on enter [
    on click "#card" navigate "Chapter One"
  ]
}
timeline "Chapter One" in "#stage" using raf {
  on enter [ on click "#back" navigate "Hub" ]
  at 0s..1s go()
}
timeline "Extra" in "#stage" using raf {
  on enter [ on click "#more" navigate "Chapter One" at 2s ]
}`;

describe('timeline names as symbols (audit idea #16)', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  async function documentOf(code: string): Promise<LangiumDocument> {
    const document = await ctx.parse(code);
    await ctx.services.shared.workspace.DocumentBuilder.build([document], { validation: true });
    return document;
  }

  /** The position of the `occurrence`-th `needle` (plus `shift` characters). */
  const positionOf = (document: LangiumDocument, needle: string, occurrence = 1, shift = 1) => {
    const text = document.textDocument.getText();
    let index = -1;
    for (let i = 0; i < occurrence; i++) index = text.indexOf(needle, index + 1);
    return document.textDocument.positionAt(index + shift);
  };
  const textAt = (document: LangiumDocument, range: Range) => document.textDocument.getText(range);
  const params = (document: LangiumDocument, position: { line: number; character: number }) => ({
    textDocument: { uri: document.uri.toString() },
    position,
  });

  test('Go to Definition from a navigate target lands on the timeline', async () => {
    const document = await documentOf(SOURCE);
    const [link] =
      (await ctx.services.Eligian.lsp.DefinitionProvider!.getDefinition(
        document,
        params(document, positionOf(document, '"Chapter One"'))
      )) ?? [];

    expect(textAt(document, link.targetSelectionRange)).toBe('"Chapter One"');
    expect(link.targetSelectionRange.start.line).toBe(6);
    expect(textAt(document, link.originSelectionRange!)).toBe('"Chapter One"');
  });

  test('other references still use the default provider (an action call)', async () => {
    const document = await documentOf(SOURCE);
    const [link] =
      (await ctx.services.Eligian.lsp.DefinitionProvider!.getDefinition(
        document,
        params(document, positionOf(document, 'go()', 2, 0))
      )) ?? [];
    expect(link?.targetSelectionRange.start.line).toBe(0);
  });

  test('Find References lists every navigate to the timeline', async () => {
    const document = await documentOf(SOURCE);
    const find = async (includeDeclaration: boolean) =>
      (
        await ctx.services.Eligian.lsp.ReferencesProvider!.findReferences(document, {
          ...params(document, positionOf(document, '"Chapter One"', 2)), // the timeline's name
          context: { includeDeclaration },
        })
      ).map(location => location.range.start.line);

    expect(await find(false)).toEqual([3, 11]);
    expect(await find(true)).toEqual([6, 3, 11]);
  });

  test('Rename changes the timeline and every navigate targeting it', async () => {
    const document = await documentOf(SOURCE);
    const rename = ctx.services.Eligian.lsp.RenameProvider!;
    const position = positionOf(document, '"Chapter One"'); // a navigate target

    const range = await rename.prepareRename(document, params(document, position));
    expect(textAt(document, range!)).toBe('Chapter One');

    const edit = await rename.rename(document, {
      ...params(document, position),
      newName: 'Basics',
    });
    const edits = edit!.changes![document.uri.toString()] as TextEdit[];
    expect(edits.map(e => [e.range.start.line, textAt(document, e.range), e.newText])).toEqual([
      [6, 'Chapter One', 'Basics'],
      [3, 'Chapter One', 'Basics'],
      [11, 'Chapter One', 'Basics'],
    ]);

    await expect(
      rename.rename(document, { ...params(document, position), newName: 'Hub' })
    ).rejects.toThrow("A timeline named 'Hub' already exists");
    await expect(
      rename.rename(document, { ...params(document, position), newName: 'a"b' })
    ).rejects.toThrow('cannot contain quotes');
  });

  test('completion offers the timeline names after navigate', async () => {
    const code = `timeline "Hub" in "#stage" using raf {
  on enter [ on click "#a" navigate "Ch" ]
}
timeline "Chapter One" in "#stage" using raf { }`;
    const document = await documentOf(code);
    const offset = code.indexOf('"Ch"') + 3; // after `"Ch`
    const list = await ctx.services.Eligian.lsp.CompletionProvider!.getCompletion(document, {
      textDocument: { uri: document.uri.toString() },
      position: document.textDocument.positionAt(offset),
    });

    expect(list?.items.map(i => i.label)).toEqual(['Hub', 'Chapter One']);
    const edit = list!.items[1].textEdit as TextEdit;
    // Replaces the typed `"Ch"` (both quotes) with the quoted name
    expect(textAt(document, edit.range)).toBe('"Ch"');
    expect(edit.newText).toBe('"Chapter One"');
  });

  test('quick fixes for an unknown target: change to the closest name, or create it', async () => {
    const code = `timeline "Hub" in "#stage" using raf {
  on enter [ on click "#a" navigate "Chapter Onw" ]
}
timeline "Chapter One" in "#stage" using raf { }
`;
    const document = await documentOf(code);
    const diagnostics = (document.diagnostics ?? []).filter(
      d => (d.data as { code?: string } | undefined)?.code === 'unknown_navigate_target'
    );
    expect(diagnostics).toHaveLength(1);

    const actions = (await ctx.services.Eligian.lsp.CodeActionProvider!.getCodeActions(document, {
      textDocument: { uri: document.uri.toString() },
      range: diagnostics[0].range,
      context: { diagnostics },
    })) as CodeAction[];
    const titles = actions.map(a => a.title);
    expect(titles).toContain('Change to "Chapter One"');
    expect(titles).toContain('Create timeline "Chapter Onw"');

    const change = actions.find(a => a.title === 'Change to "Chapter One"')!;
    expect(change.isPreferred).toBe(true);
    const [edit] = change.edit!.changes![document.uri.toString()];
    expect(textAt(document, edit.range)).toBe('Chapter Onw');

    const create = actions.find(a => a.title.startsWith('Create timeline'))!;
    const [insert] = create.edit!.changes![document.uri.toString()];
    expect(insert.newText).toBe('\ntimeline "Chapter Onw" in "#stage" using raf {\n}\n');
  });
});
