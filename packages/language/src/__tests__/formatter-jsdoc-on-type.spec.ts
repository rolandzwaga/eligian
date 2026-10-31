/**
 * Regression tests for the on-type JSDoc template formatter and findActionBelow
 * (audit 2026-10-22, medium #26).
 */

import { EmptyFileSystem } from 'langium';
import { parseDocument } from 'langium/test';
import { describe, expect, test } from 'vitest';
import { createEligianServices } from '../eligian-module.js';
import { findActionBelow } from '../utils/ast-navigation.js';

const services = createEligianServices(EmptyFileSystem).Eligian;

async function onType(text: string, position: { line: number; character: number }) {
  const document = await parseDocument(services, text);
  return services.lsp.Formatter?.formatDocumentOnType(document, {
    textDocument: { uri: document.uri.toString() },
    position,
    ch: '*',
    options: { tabSize: 2, insertSpaces: true },
  });
}

describe('findActionBelow', () => {
  test('finds an event action below the comment line', async () => {
    const document = await parseDocument(
      services,
      `/** */
on event "timeline-play" action handler(a) [
  selectElement("#x")
]
action later(b: string) [
  selectElement("#y")
]
`
    );
    const found = findActionBelow(document, { line: 0, character: 3 });
    expect(found?.$type).toBe('EventActionDefinition');
    expect(found?.name).toBe('handler');
  });

  test('does not skip over a non-action statement to a later action', async () => {
    const document = await parseDocument(
      services,
      `/** */
const x = 1
action later(b: string) [
  selectElement("#y")
]
`
    );
    expect(findActionBelow(document, { line: 0, character: 3 })).toBeUndefined();
  });

  test('does not skip over a timeline to a later action', async () => {
    const document = await parseDocument(
      services,
      `/** */
timeline "t" in "#c" using raf {
  at 0s..1s selectElement("#a")
}
action later(b: string) [
  selectElement("#y")
]
`
    );
    expect(findActionBelow(document, { line: 0, character: 3 })).toBeUndefined();
  });
});

describe('EligianFormatter.formatDocumentOnType (JSDoc template)', () => {
  test('uses the event action parameters, not those of a later action', async () => {
    const edits = await onType(
      `/** */
on event "timeline-play" action handler(a) [
  selectElement("#x")
]
action later(b: string) [
  selectElement("#y")
]
`,
      { line: 0, character: 3 }
    );
    expect(edits).toHaveLength(1);
    const newText = edits![0].newText;
    expect(newText).toContain('@param {unknown} a');
    expect(newText).not.toContain('@param {string} b');
  });

  test('produces a template for an unterminated /** above an action', async () => {
    const edits = await onType(
      `/**
action fadeIn(selector: string, duration: number) [
  selectElement(selector)
]
`,
      { line: 0, character: 3 }
    );
    expect(edits).toHaveLength(1);
    expect(edits![0].newText).toContain('@param {string} selector');
    expect(edits![0].newText).toContain('@param {number} duration');
    // Closing delimiter is generated because none follows the cursor
    expect(edits![0].newText.trimEnd().endsWith('*/')).toBe(true);
  });

  test('unterminated /** is not swallowed by a JSDoc comment further below', async () => {
    const edits = await onType(
      `/**
action first(a: string) [
  selectElement(a)
]

/**
 * Second
 */
action second(b: number) [
  selectElement("#y")
]
`,
      { line: 0, character: 3 }
    );
    expect(edits).toHaveLength(1);
    expect(edits![0].newText).toContain('@param {string} a');
    expect(edits![0].newText).not.toContain('@param {number} b');
  });

  test('works for an unterminated /** that follows another action', async () => {
    const edits = await onType(
      `action first(a: string) [
  selectElement(a)
]

/**
action second(b: number) [
  selectElement("#y")
]
`,
      { line: 4, character: 3 }
    );
    expect(edits).toHaveLength(1);
    expect(edits![0].newText).toContain('@param {number} b');
  });

  test('indents inserted lines to the comment column', async () => {
    const edits = await onType(
      `library demo

  /**
  action fadeIn(selector: string) [
    selectElement(selector)
  ]
`,
      { line: 2, character: 5 }
    );
    expect(edits).toHaveLength(1);
    const lines = edits![0].newText.split('\n').slice(1);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line.startsWith('  ')).toBe(true);
    }
    expect(lines.join('\n')).toContain('  * @param {string} selector');
  });

  test('does not duplicate an existing closing delimiter', async () => {
    const text = `/** */
action fadeIn(selector: string) [
  selectElement(selector)
]
`;
    const edits = await onType(text, { line: 0, character: 3 });
    expect(edits).toHaveLength(1);
    const edit = edits![0];
    // Apply the edit and make sure there is exactly one `*/`
    const document = await parseDocument(services, text);
    const start = document.textDocument.offsetAt(edit.range.start);
    const end = document.textDocument.offsetAt(edit.range.end);
    const result = text.slice(0, start) + edit.newText + text.slice(end);
    expect(result.match(/\*\//g)).toHaveLength(1);
    expect(result).toContain('@param {string} selector');
  });

  test('returns no edits when the next statement is not an action', async () => {
    const edits = await onType(
      `/**
const x = 1
action later(b: string) [
  selectElement("#y")
]
`,
      { line: 0, character: 3 }
    );
    expect(edits).toEqual([]);
  });

  test('returns no edits for a non-trigger character', async () => {
    const document = await parseDocument(services, '/** */\n');
    const edits = services.lsp.Formatter?.formatDocumentOnType(document, {
      textDocument: { uri: document.uri.toString() },
      position: { line: 0, character: 3 },
      ch: 'x',
      options: { tabSize: 2, insertSpaces: true },
    });
    expect(edits).toEqual([]);
  });
});
