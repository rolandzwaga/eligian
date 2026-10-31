/**
 * HTML createElement completion boundaries through the real completion provider
 * (audit 2026-10-22, low #29, #31, #35, #36): cursor right after a closing delimiter,
 * on an opening quote, in a quoted object key, in whitespace, and in event bodies.
 */

import { EmptyFileSystem } from 'langium';
import { expectCompletion } from 'langium/test';
import { describe, expect, it } from 'vitest';
import type { CompletionItem, CompletionList } from 'vscode-languageserver-protocol';
import { createEligianServices } from '../../eligian-module.js';

const services = createEligianServices(EmptyFileSystem).Eligian;
const completion = expectCompletion(services);

async function itemsFor(text: string): Promise<CompletionItem[]> {
  let items: CompletionItem[] = [];
  await completion({
    text,
    index: 0,
    assert: (completions: CompletionList) => {
      items = completions.items;
    },
  });
  return items;
}

const labels = (items: CompletionItem[]) => items.map(item => item.label);

describe('createElement completion boundaries', () => {
  it('offers no attributes with the cursor right after the closing brace (#29)', async () => {
    const items = await itemsFor(`
      action test [
        createElement("input", "x", {}<|>)
      ]
    `);
    expect(labels(items)).not.toContain('placeholder');
    expect(labels(items)).not.toContain('accept');
  });

  it('still offers attributes between empty braces (#29)', async () => {
    const items = await itemsFor(`
      action test [
        createElement("input", "x", {<|>})
      ]
    `);
    expect(labels(items)).toContain('placeholder');
  });

  it('offers no element names with the cursor right after the closing quote (#29)', async () => {
    const items = await itemsFor(`
      action test [
        createElement("div"<|>)
      ]
    `);
    expect(items.filter(i => i.detail === 'HTML <div> element')).toHaveLength(0);
  });

  it('offers element names inside the quotes (#29)', async () => {
    const items = await itemsFor(`
      action test [
        createElement("di<|>")
      ]
    `);
    expect(labels(items)).toContain('div');
  });

  it('does not suppress the default completions or offer garbage at the opening quote (#31)', async () => {
    const items = await itemsFor(`
      action test [
        createElement(<|>"div")
      ]
    `);
    // Previously the partial text became `"`, so HTML matched nothing AND the default
    // completions were suppressed. No HTML element item may be inserted before an
    // existing argument either (it would produce `"div""div"`).
    expect(items.filter(i => i.detail?.startsWith('HTML <'))).toHaveLength(0);
  });

  it('adds quotes for element names when the call has no arguments yet', async () => {
    const items = await itemsFor(`
      action test [
        createElement(<|>)
      ]
    `);
    const div = items.find(i => i.label === 'div');
    expect(div?.insertText).toBe('"div"');
  });

  it('offers attribute names inside a quoted object key (#35)', async () => {
    const items = await itemsFor(`
      action test [
        createElement("input", "", { "<|>": 1 })
      ]
    `);
    const aria = items.find(i => i.label === 'aria-label');
    expect(aria).toBeDefined();
    // The quotes already exist: the edit replaces the string content with the bare name
    expect((aria!.textEdit as { newText: string }).newText).toBe('aria-label');
    expect(labels(items)).toContain('data-');
    expect(labels(items)).toContain('placeholder');
  });

  it('filters quoted-key attribute names by the typed prefix (#35)', async () => {
    const items = await itemsFor(`
      action test [
        createElement("div", "", { "aria-<|>": 1 })
      ]
    `);
    expect(labels(items)).toContain('aria-label');
    expect(labels(items)).not.toContain('title');
  });

  it('offers a data- entry as a quoted key when typing an identifier key (#35)', async () => {
    const items = await itemsFor(`
      action test [
        createElement("div", "", { <|> })
      ]
    `);
    expect(items.find(i => i.label === 'data-')?.insertText).toBe('"data-"');
  });

  it('offers no attribute names after a property value inside the object (#29)', async () => {
    const items = await itemsFor(`
      action test [
        createElement("input", "", { type: "text"<|> })
      ]
    `);
    expect(labels(items)).not.toContain('placeholder');
  });

  it('offers enum values inside the attribute value string', async () => {
    const items = await itemsFor(`
      action test [
        createElement("input", "", { type: "ch<|>" })
      ]
    `);
    expect(labels(items)).toContain('checkbox');
  });

  it('offers no attribute-value items with the cursor after the closing quote (#29)', async () => {
    const items = await itemsFor(`
      action test [
        createElement("input", "", { type: "text"<|> })
      ]
    `);
    expect(labels(items)).not.toContain('checkbox');
  });

  it('offers no HTML items in whitespace after the closed call (#36)', async () => {
    const items = await itemsFor(`
      action test [
        createElement("input", "", { type: "text" })   <|>
      ]
    `);
    expect(labels(items)).not.toContain('placeholder');
    expect(items.filter(i => i.detail?.startsWith('HTML <'))).toHaveLength(0);
  });

  it('offers no HTML items for the second (text) argument string (#36)', async () => {
    const items = await itemsFor(`
      action test [
        createElement("input", "pla<|>", {})
      ]
    `);
    expect(labels(items)).not.toContain('placeholder');
    expect(items.filter(i => i.detail?.startsWith('HTML <'))).toHaveLength(0);
  });

  it('offers no event names for a string inside an event action body (#36)', async () => {
    const items = await itemsFor(`
      on event "click" action handler() [
        selectElement("<|>")
      ]
    `);
    expect(items.filter(i => i.detail?.startsWith('HTML <'))).toHaveLength(0);
    expect(labels(items)).not.toContain('placeholder');
  });
});
