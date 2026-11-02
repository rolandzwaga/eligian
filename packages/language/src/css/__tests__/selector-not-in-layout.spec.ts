/**
 * `eligian.validation.selectorNotInLayout` (audit idea #18, optional check):
 * selector names the CSS defines but the layout HTML does not contain.
 */
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import {
  createTestContext,
  DiagnosticSeverity,
  setupCSSRegistry,
  type TestContext,
} from '../../__tests__/test-helpers.js';
import type { SelectorNotInLayout } from '../../validators/validation-settings.js';

const LAYOUT = '<div id="stage"><div id="a" class="on"></div></div>';
const PROGRAM = `action show(sel) [ selectElement(sel) addClass("on") ]
timeline "t" in "#stage" using raf {
  at 0s..1s target "#runtime" [ addClass("on") ]
  at 1s..2s show(".made")
  at 2s..3s show("#a")
  at 3s..4s [ selectElement("#runtime") ]
}`;

describe('selectorNotInLayout (audit idea #18)', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  afterEach(() => {
    ctx.services.Eligian.validation.Settings.selectorNotInLayout = 'off';
  });

  async function warnings(mode: SelectorNotInLayout, layout: string | null = LAYOUT) {
    ctx.services.Eligian.validation.Settings.selectorNotInLayout = mode;
    setupCSSRegistry(ctx, 'file:///styles.css', {
      classes: ['on', 'made'],
      ids: ['stage', 'a', 'runtime'],
    });
    const document = await ctx.parse(`styles "./styles.css"\n${PROGRAM}`);
    const uri = document.uri.toString();
    ctx.services.Eligian.css.CSSRegistry.registerImports(uri, ['file:///styles.css']);
    const html = ctx.services.Eligian.html.HTMLRegistry;
    if (layout !== null) {
      html.updateHTMLFile('file:///layout.html', { content: layout });
      html.registerImports(uri, 'file:///layout.html');
    }
    await ctx.services.shared.workspace.DocumentBuilder.build([document], { validation: true });
    const diagnostics = document.diagnostics ?? [];
    expect(diagnostics.filter(d => d.severity === DiagnosticSeverity.Error)).toEqual([]);
    return diagnostics
      .filter(d => d.code === 'selector_not_in_layout')
      .map(d => `${d.range.start.line}: ${/'([^']+)'/.exec(d.message)?.[1]}`);
  }

  test('off by default', async () => {
    expect(await warnings('off')).toEqual([]);
  });

  test('ids: an id the CSS defines but the layout does not contain', async () => {
    // #a is in the layout; #runtime only in the CSS (target and selectElement)
    expect(await warnings('ids')).toEqual(['3: #runtime', '6: #runtime']);
  });

  test('all: classes too, also through action parameters', async () => {
    expect(await warnings('all')).toEqual(['3: #runtime', '4: .made', '6: #runtime']);
  });

  test('nothing to compare with without a layout', async () => {
    const html = ctx.services.Eligian.html.HTMLRegistry;
    html.clearHTMLFile('file:///layout.html');
    expect(await warnings('all', null)).toEqual([]);
  });

  test('the editor setting is read from the client configuration', () => {
    const settings = ctx.services.Eligian.validation.Settings;
    settings.apply({ selectorNotInLayout: 'all' });
    expect(settings.selectorNotInLayout).toBe('all');
    settings.apply({ selectorNotInLayout: 'bogus' });
    expect(settings.selectorNotInLayout).toBe('off');
  });
});
