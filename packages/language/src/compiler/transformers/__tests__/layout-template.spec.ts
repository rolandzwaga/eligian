/**
 * Unit tests for generateLayoutTemplate (the fallback layout used when no
 * `layout` is imported).
 *
 * Regression (2026-10-22 audit, low): it mapped each timeline to its own div by
 * stripping the selector's first character, so `.a.b` became `class="a.b"`,
 * `div#z` became `class="divz"`, and two timelines `in "#stage"` produced two
 * elements with `id="stage"`.
 */
import { JSDOM } from 'jsdom';
import { describe, expect, test } from 'vitest';
import type { TimelineConfigIR } from '../../types/eligius-ir.js';
import { generateLayoutTemplate } from '../config-builder.js';

const layoutFor = (...selectors: string[]): string =>
  generateLayoutTemplate(selectors.map(selector => ({ selector }) as TimelineConfigIR));

describe('generateLayoutTemplate', () => {
  test('simple class and id selectors keep their existing output', () => {
    expect(layoutFor('.timeline1', '#timeline2')).toBe(
      '<div class="timeline1"></div><div id="timeline2"></div>'
    );
  });

  test('timelines sharing a container produce a single element (no duplicate ids)', () => {
    expect(layoutFor('#stage', '#stage')).toBe('<div id="stage"></div>');
    expect(layoutFor('.panel', '.panel')).toBe('<div class="panel"></div>');
  });

  test('compound selectors become one element carrying every part', () => {
    expect(layoutFor('.panel.active')).toBe('<div class="panel active"></div>');
    expect(layoutFor('#x.y')).toBe('<div id="x" class="y"></div>');
    expect(layoutFor('div#z')).toBe('<div id="z"></div>');
    expect(layoutFor('section.slide')).toBe('<section class="slide"></section>');
    expect(layoutFor('[data-stage="main"]')).toBe('<div data-stage="main"></div>');
    expect(layoutFor('.a.a')).toBe('<div class="a"></div>');
  });

  test('descendant and child combinators nest, sharing common ancestors', () => {
    expect(layoutFor('.p > .q')).toBe('<div class="p"><div class="q"></div></div>');
    expect(layoutFor('#app .stage')).toBe('<div id="app"><div class="stage"></div></div>');
    expect(layoutFor('#app > .a', '#app > .b', '#app')).toBe(
      '<div id="app"><div class="a"></div><div class="b"></div></div>'
    );
  });

  test('the same id reached through a different compound is not emitted twice', () => {
    const html = layoutFor('#stage', '#stage.active');
    expect(html.match(/id="stage"/g)).toHaveLength(1);
    expect(html).toContain('<!--');
    expect(html).toContain('#stage.active');
  });

  test('selectors markup cannot express produce a comment, not a non-matching element', () => {
    for (const selector of ['.a:hover', '.a + .b', '.a ~ .b', '.a, .b', '#a#b', '[x^="y"]']) {
      const html = layoutFor(selector);
      expect(html).toMatch(/^<!-- eligian: no container generated for selector .* -->$/);
    }
    expect(layoutFor('.a[')).toMatch(/^<!-- .*invalid selector.* -->$/);
  });

  test('attribute values are escaped', () => {
    expect(layoutFor('[data-x="a&b<c>"]')).toBe('<div data-x="a&amp;b&lt;c&gt;"></div>');
  });

  test('comments never contain "--"', () => {
    const html = layoutFor('.a--b:hover');
    expect(html.slice(4, -3)).not.toContain('--');
  });

  test('every generated element matches its own selector (in a real DOM)', () => {
    const selectors = [
      '.panel.active',
      '#x.y',
      'div#z',
      '.p > .q',
      '#app .stage',
      'section.slide',
      '[data-stage="main"]',
      '#stage',
      '#stage',
    ];
    const { document } = new JSDOM('<div id="eligius-container"></div>').window;
    const container = document.getElementById('eligius-container')!;
    container.innerHTML = layoutFor(...selectors);

    for (const selector of selectors) {
      expect(container.querySelectorAll(selector), selector).toHaveLength(1);
    }
    for (const id of ['x', 'z', 'app', 'stage']) {
      expect(container.querySelectorAll(`[id="${id}"]`), id).toHaveLength(1);
    }
  });
});
