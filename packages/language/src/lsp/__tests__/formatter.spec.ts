/**
 * Format Document / `eligian fmt` (audit idea #15).
 *
 * The formatter only changes whitespace: every example and fixture is
 * formatted and checked to keep its text without whitespace, to parse, to have
 * the same AST, and to not change when formatted again.
 */
import { globSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { AstUtils, EmptyFileSystem, isReference, URI } from 'langium';
import { describe, expect, test } from 'vitest';
import { createEligianServices } from '../../eligian-module.js';
import { formatSource } from '../format-source.js';

const root = path.resolve(__dirname, '../../../../..');
const files = [
  ...globSync('examples/**/*.eligian', { cwd: root }),
  ...globSync('packages/language/src/**/__fixtures__/**/*.eligian', { cwd: root }),
].sort();

const services = createEligianServices(EmptyFileSystem).Eligian;

let counter = 0;

/**
 * The AST's structure: every node's type, primitive properties and reference
 * texts, in document order (positions are left out: whitespace moves them).
 */
function astOf(text: string): string {
  const document = services.shared.workspace.LangiumDocumentFactory.fromString(
    text,
    URI.parse(`memory:/ast-${++counter}.eligian`)
  );
  const lines: string[] = [];
  for (const node of AstUtils.streamAst(document.parseResult.value)) {
    const values = Object.entries(node)
      .filter(([key]) => !key.startsWith('$'))
      .map(([key, value]) => {
        if (isReference(value)) return `${key}=&${value.$refText}`;
        if (value === null || typeof value !== 'object') return `${key}=${JSON.stringify(value)}`;
        if (Array.isArray(value) && value.every(v => typeof v !== 'object')) {
          return `${key}=${JSON.stringify(value)}`;
        }
        return undefined;
      })
      .filter(Boolean)
      .sort();
    lines.push(`${node.$type}(${values.join(', ')})`);
  }
  return lines.join('\n');
}

const withoutWhitespace = (text: string) => text.replace(/\s+/g, '');

describe('formatter (audit idea #15)', () => {
  test.each(files)('%s: whitespace only, same AST, stable', async file => {
    const original = readFileSync(path.join(root, file), 'utf-8');
    const once = await formatSource(original);
    if (once.errors.length > 0) {
      // Files with syntax errors are left alone
      expect(once.text).toBe(original);
      return;
    }
    expect(withoutWhitespace(once.text)).toBe(withoutWhitespace(original));
    expect(astOf(once.text)).toBe(astOf(original));
    expect((await formatSource(once.text)).text).toBe(once.text);
  });

  test('the examples are formatted', async () => {
    const examples = files.filter(f => f.startsWith('examples') && !f.includes('errors'));
    const unformatted: string[] = [];
    for (const file of examples) {
      const result = await formatSource(readFileSync(path.join(root, file), 'utf-8'));
      if (result.changed) unformatted.push(file);
    }
    expect(unformatted).toEqual([]);
  });

  test('normalizes spacing, indentation and blocks', async () => {
    const messy = [
      'const   beat=7 s',
      'const items = [ "#a" ,"#b" ]',
      '/** Shows it */',
      'action show( sel : string ) [',
      'selectElement( sel )',
      '        addClass( "on" )',
      '   if ( @beat > 2 ) { log( "x" ) } else {',
      'log("y")',
      '}',
      ']',
      'endable action fade(sel) [ selectElement(sel) ]   [ selectElement(sel) ]',
      'timeline "t"   in "#stage"  using raf {',
      '      on enter [ show( "#a" ) ]',
      'at 0s .. 5s as intro [',
      '  show("#a")',
      '    ]  [',
      'show("#b")',
      ']',
      '  sequence each [ log("x") ] {',
      '  for 2 s [ log("y") ]',
      '      show("#c") for + 1s',
      '}',
      '  stagger 200ms @items at intro.end with show() for 1s',
      '}',
    ].join('\n');

    expect((await formatSource(messy)).text).toBe(
      [
        'const beat = 7s',
        'const items = ["#a", "#b"]',
        '/** Shows it */',
        'action show(sel: string) [',
        '  selectElement(sel)',
        '  addClass("on")',
        '  if (@beat > 2) { log("x") } else {',
        '    log("y")',
        '  }',
        ']',
        '',
        'endable action fade(sel) [ selectElement(sel) ] [ selectElement(sel) ]',
        '',
        'timeline "t" in "#stage" using raf {',
        '  on enter [ show("#a") ]',
        '  at 0s..5s as intro [',
        '    show("#a")',
        '  ] [',
        '    show("#b")',
        '  ]',
        '  sequence each [ log("x") ] {',
        '    for 2s [ log("y") ]',
        '    show("#c") for +1s',
        '  }',
        '  stagger 200ms @items at intro.end with show() for 1s',
        '}',
      ].join('\n')
    );
  });

  test('keeps comments, re-indented with their block; at most one blank line between entries', async () => {
    const source = [
      '// header',
      'action show(sel) [',
      '        // inside',
      'selectElement(sel)  // trailing',
      ']',
      'timeline "t" in "#s" using raf {',
      'at 0s..1s show("#a")',
      '',
      '',
      '',
      'at 1s..2s show("#b")',
      '}',
    ].join('\n');

    expect((await formatSource(source)).text).toBe(
      [
        '// header',
        'action show(sel) [',
        '  // inside',
        '  selectElement(sel)  // trailing',
        ']',
        '',
        'timeline "t" in "#s" using raf {',
        '  at 0s..1s show("#a")',
        '',
        '  at 1s..2s show("#b")',
        '}',
      ].join('\n')
    );
  });

  test('names that are also keywords keep their spacing (a parameter called duration)', async () => {
    const source =
      'action fade(sel: string, duration: number) [ animate({ opacity: 1 }, duration) ]';
    expect((await formatSource(source)).text).toBe(source);
  });

  test('interaction verbs are spaced, an action called toggle is not (idea #19)', async () => {
    const source =
      'action toggle(sel) [ selectElement(sel) on  click "#a"   toggle  toggle("#b") ]';
    expect((await formatSource(source)).text).toBe(
      'action toggle(sel) [ selectElement(sel) on click "#a" toggle toggle("#b") ]'
    );
  });

  test('a document with syntax errors is not formatted', async () => {
    const result = await formatSource('action a( [ ');
    expect(result.changed).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
