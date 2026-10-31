/**
 * Feature 049: compile-time checks of a scroll timeline's container.
 *
 * Run through checkFiles on real files, the path `eligian check` and compile
 * use: the layout HTML is read from disk and the CSS loaded into the registry.
 * - An explicit scroll selector must exist in the layout HTML or the CSS (error).
 * - Some CSS rule or inline style should make it scroll vertically (warning).
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { checkFiles } from '../../compiler/pipeline.js';
import { declaresVerticalScroll } from '../../css/css-parser.js';

describe('scroll timeline container checks (Feature 049)', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-scroll-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  async function diagnosticsFor(options: { css: string; html?: string; using: string }) {
    fs.writeFileSync(path.join(dir, 's.css'), `#stage {} #a {} ${options.css}`);
    const layout = options.html !== undefined ? 'layout "./l.html"\n' : '';
    if (options.html !== undefined) fs.writeFileSync(path.join(dir, 'l.html'), options.html);
    const file = path.join(dir, 'main.eligian');
    fs.writeFileSync(
      file,
      `styles "./s.css"
${layout}timeline "story" in "#stage" using ${options.using} duration 60s {
  at 0s..10s [ selectElement("#a") ]
}
`
    );
    const [result] = await Effect.runPromise(checkFiles([file]));
    return result.diagnostics
      .filter(
        d => d.code === 'unknown_scroll_container' || d.code === 'scroll_container_not_scrollable'
      )
      .map(d => [d.severity, d.code, d.message]);
  }

  test('an explicit scroll selector that nothing defines is an error', async () => {
    expect(await diagnosticsFor({ css: '', using: 'scroll "#scroller"' })).toEqual([
      [
        'error',
        'unknown_scroll_container',
        "Unknown scroll container '#scroller': it is not in the layout HTML or the imported CSS",
      ],
    ]);
  });

  test('an element from the layout HTML with an inline overflow passes', async () => {
    const html =
      '<div id="scroller" style="overflow-y: auto; height: 100vh"><div id="stage"></div></div>';
    expect(await diagnosticsFor({ css: '', html, using: 'scroll "#scroller"' })).toEqual([]);
  });

  test.each([
    ['#scroller { overflow-y: auto; }'],
    ['#scroller { overflow: scroll; }'],
    ['#scroller { overflow: hidden auto; }'],
    ['.page #scroller { overflow-y: overlay !important; }'],
  ])('a CSS rule making it scroll passes: %s', async css => {
    expect(await diagnosticsFor({ css, using: 'scroll "#scroller"' })).toEqual([]);
  });

  test.each([
    ['#scroller { height: 100vh; }'],
    ['#scroller { overflow: auto hidden; }'],
    ['#scroller .inner { overflow-y: auto; }'],
  ])('without a rule that makes it scroll vertically, a warning: %s', async css => {
    const found = await diagnosticsFor({ css, using: 'scroll "#scroller"' });
    expect(found).toHaveLength(1);
    expect(found[0][0]).toBe('warning');
    expect(found[0][2]).toContain("The scroll container '#scroller' may not scroll");
  });

  test('the default scroll element (the container) is checked for overflow too', async () => {
    const found = await diagnosticsFor({ css: '', using: 'scroll' });
    expect(found.map(f => f[1])).toEqual(['scroll_container_not_scrollable']);
    expect(found[0][2]).toContain("'#stage'");
  });

  test('a warning does not stop compilation', async () => {
    const file = path.join(dir, 'w.eligian');
    fs.writeFileSync(path.join(dir, 's.css'), '#stage {} #a {} #scroller {}');
    fs.writeFileSync(
      file,
      `styles "./s.css"
timeline "story" in "#stage" using scroll "#scroller" duration 60s { at 0s..1s [ selectElement("#a") ] }
`
    );
    const [result] = await Effect.runPromise(checkFiles([file]));
    expect(result.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  });
});

describe('declaresVerticalScroll', () => {
  test.each([
    ['.a { overflow-y: auto }', true],
    ['.a { overflow-y: scroll; color: red }', true],
    ['.a { overflow: auto }', true],
    ['.a { overflow: hidden scroll }', true],
    ['.a { overflow: scroll hidden }', false],
    ['.a { overflow-x: auto }', false],
    ['.a { overflow-y: hidden }', false],
    ['.a { color: red }', false],
  ])('%s → %s', (rule, expected) => {
    expect(declaresVerticalScroll(rule)).toBe(expected);
  });
});
