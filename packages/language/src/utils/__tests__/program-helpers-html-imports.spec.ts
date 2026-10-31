/**
 * getHTMLImports / isHtmlImport must agree with inferAssetType (audit finding #41).
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from '../../__tests__/test-helpers.js';
import type { NamedImport } from '../../generated/ast.js';
import { getHTMLImports, isHtmlImport } from '../program-helpers.js';

const imp = (path: string, assetType?: 'html' | 'css' | 'media') =>
  ({ path, assetType }) as unknown as NamedImport;

describe('isHtmlImport', () => {
  it('uses the extension when no explicit type is given', () => {
    expect(isHtmlImport(imp('./page.html'))).toBe(true);
    expect(isHtmlImport(imp('./style.css'))).toBe(false);
  });

  it('is case-insensitive like inferAssetType', () => {
    expect(isHtmlImport(imp('./Page.HTML'))).toBe(true);
  });

  it('lets an explicit type override the extension', () => {
    expect(isHtmlImport(imp('./page.html', 'css'))).toBe(false);
    expect(isHtmlImport(imp('./page.html', 'media'))).toBe(false);
    expect(isHtmlImport(imp('./fragment.tpl', 'html'))).toBe(true);
  });
});

describe('getHTMLImports (parsed program)', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  it('selects html imports by effective type', async () => {
    const document = await ctx.parse(`
      import upper from "./Page.HTML"
      import lower from "./page.html"
      import forced from "./data.tpl" as html
      import notHtml from "./page2.html" as css
      import styles from "./style.css"
    `);
    const names = getHTMLImports(document.parseResult.value).map(i => i.name);
    expect(names).toEqual(['upper', 'lower', 'forced']);
  });
});
