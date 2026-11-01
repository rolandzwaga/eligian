/**
 * Navigation between .eligian, CSS and the layout HTML (audit idea #22).
 */
import type { LangiumDocument } from 'langium';
import { beforeAll, describe, expect, test } from 'vitest';
import type { LocationLink } from 'vscode-languageserver-types';
import { createTestContext, type TestContext } from '../../__tests__/test-helpers.js';
import { parseCSS } from '../../css/css-parser.js';
import type { Program } from '../../generated/ast.js';
import {
  cssReferenceLenses,
  cssReferences,
  cssUses,
  layoutElementRanges,
} from '../css-navigation.js';

const CSS = `#stage { margin: 0; }
.on { color: red; }
.card.on { color: blue; }
`;
const LAYOUT = `<div id="stage">
  <div id="a" class="card on"></div>
  <span class="on"></span>
</div>
`;
const PROGRAM = `layout "./layout.html"
styles "./styles.css"
action mark(sel, cls) [ selectElement(sel) addClass(cls) ]
timeline "t" in "#stage" using raf {
  at 0s..1s [ selectElement(".card.on") addClass("on") ] []
  at 1s..2s mark("#a", "on")
  at 2s..3s target "#a" [ removeClass("on") ] []
}`;

describe('CSS / HTML navigation (idea #22)', () => {
  let ctx: TestContext;
  let document: LangiumDocument<Program>;

  beforeAll(async () => {
    ctx = createTestContext();
    document = await ctx.parse(PROGRAM);
    const uri = document.uri.toString();
    const css = ctx.services.Eligian.css.CSSRegistry;
    css.updateCSSFile('file:///styles.css', parseCSS(CSS, '/styles.css'));
    css.registerImports(uri, ['file:///styles.css']);
    const html = ctx.services.Eligian.html.HTMLRegistry;
    html.updateHTMLFile('file:///layout.html', { content: LAYOUT });
    html.registerImports(uri, 'file:///layout.html');
  });

  /** The position of the `nth` occurrence of `text` in the program (+ `offset`). */
  const at = (text: string, offset = 1, nth = 0) => {
    let index = -1;
    for (let i = 0; i <= nth; i++) index = PROGRAM.indexOf(text, index + 1);
    return document.textDocument.positionAt(index + offset);
  };

  const definitions = async (text: string, offset = 1, nth = 0) =>
    ((await ctx.services.Eligian.lsp.DefinitionProvider?.getDefinition(document, {
      textDocument: { uri: document.uri.toString() },
      position: at(text, offset, nth),
    })) ?? []) as LocationLink[];

  const where = (links: LocationLink[]) =>
    links.map(l => `${l.targetUri.replace('file:///', '')}:${l.targetRange.start.line}`);

  test('the classes and ids of className / selector strings, with their ranges', () => {
    expect(cssUses(document).map(u => `${u.kind}:${u.name}`)).toEqual([
      'id:stage', // timeline container
      'class:card',
      'class:on',
      'class:on', // addClass("on")
      'id:a', // mark("#a", "on"): selector role through the action
      'class:on', // … className role
      'id:a', // target
      'class:on',
    ]);
  });

  test('a class name goes to its (first) CSS rule and its layout elements', async () => {
    expect(where(await definitions('addClass("on")', 10))).toEqual([
      'styles.css:1',
      'layout.html:1',
      'layout.html:2',
    ]);
  });

  test('the part of a selector under the cursor', async () => {
    // ".card.on": on `card`, then on `on`
    expect(where(await definitions('".card.on"', 2))).toEqual(['styles.css:2', 'layout.html:1']);
    expect(where(await definitions('".card.on"', 7))).toEqual([
      'styles.css:1',
      'layout.html:1',
      'layout.html:2',
    ]);
    // Through an action parameter, the timeline container, and target
    expect(where(await definitions('mark("#a"', 7))).toEqual(['layout.html:1']);
    expect(where(await definitions('"#stage"', 2))).toEqual(['styles.css:0', 'layout.html:0']);
    expect(where(await definitions('target "#a"', 9))).toEqual(['layout.html:1']);
  });

  test('the uses of a class or id of a stylesheet or layout', () => {
    const uses = (uri: string, kind: 'class' | 'id', name: string) =>
      cssReferences(ctx.services.Eligian, { uri, kind, name }).map(l => l.range.start.line);
    expect(uses('file:///styles.css', 'class', 'on')).toEqual([4, 4, 5, 6]);
    expect(uses('file:///layout.html', 'id', 'a')).toEqual([5, 6]);
    expect(uses('file:///other.css', 'class', 'on')).toEqual([]);
  });

  test('a lens per class and id of a stylesheet, with its uses', () => {
    const lenses = cssReferenceLenses(ctx.services.Eligian, 'file:///styles.css');
    expect(
      lenses.map(l => [`${l.kind}:${l.name}`, l.range.start.line, l.references.length])
    ).toEqual([
      ['class:on', 1, 4],
      ['class:card', 2, 1],
      ['id:stage', 0, 1],
    ]);
  });

  test('layout element ranges cover the opening tag', () => {
    expect(layoutElementRanges(LAYOUT, { kind: 'class', name: 'card' })).toEqual([
      { start: { line: 1, character: 2 }, end: { line: 1, character: 30 } },
    ]);
  });
});
