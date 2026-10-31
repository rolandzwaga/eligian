/**
 * CSS url() parsing regression tests (audit finding #39): query strings,
 * fragments, fragment-only references, percent-encoding and comments must not
 * abort the bundle with AssetNotFound.
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  type CollectOptions,
  collectAssets,
  extractCSSUrls,
  extractCSSUrlsWithLines,
} from '../../bundler/asset-collector.js';
import { rewriteCSSUrls } from '../../bundler/css-processor.js';

const config = { containerSelector: '#p', initActions: [], actions: [], timelines: [] };
const options: CollectOptions = { inlineThreshold: 0 };

describe('CSS url() extraction', () => {
  test('skips fragment-only, protocol-relative, data and http references', () => {
    const css = `
      .a { fill: url(#grad); }
      .b { background: url(//cdn.example.com/x.png); }
      .c { background: url(data:image/png;base64,AAA); }
      .d { background: url(https://x.com/y.png); }
      .e { background: url('real.png'); }
    `;
    expect(extractCSSUrls(css)).toEqual(['real.png']);
  });

  test('ignores url() inside comments, keeping line numbers intact', () => {
    const css = '/* url(old.png)\n   url(older.png) */\n.a { background: url(new.png); }\n';
    expect(extractCSSUrls(css)).toEqual(['new.png']);
    expect(extractCSSUrlsWithLines(css)).toEqual([{ url: 'new.png', line: 3 }]);
  });

  test('does not treat comment markers inside strings as comments', () => {
    const css =
      '.a::before { content: "/*"; background: url(a.png); } /* x */ .b { background: url(b.png); }';
    expect(extractCSSUrls(css)).toEqual(['a.png', 'b.png']);
  });
});

describe('collectAssets with url() edge cases', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'eligian-css-url-test-'));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  test('resolves query/fragment/percent-encoded refs and ignores fragment-only/comments', async () => {
    await fs.writeFile(path.join(dir, 'font.woff'), 'font');
    await fs.writeFile(path.join(dir, 'icons.svg'), '<svg/>');
    await fs.writeFile(path.join(dir, 'my image.png'), 'png');
    const cssPath = path.join(dir, 'main.css');
    const css = `
      /* url(missing-in-comment.png) */
      @font-face { src: url('font.woff?v=3#iefix'); }
      .a { background: url(icons.svg#home); }
      .b { fill: url(#gradient); }
      .c { background: url("my%20image.png"); }
      .d { background: url(//cdn.example.com/x.png); }
    `;
    await fs.writeFile(cssPath, css);

    const manifest = await Effect.runPromise(
      collectAssets(config as never, [cssPath], dir, options)
    );

    expect([...manifest.assets.keys()].sort()).toEqual(
      [
        path.join(dir, 'font.woff'),
        path.join(dir, 'icons.svg'),
        path.join(dir, 'my image.png'),
      ].sort()
    );

    // The rewriter finds the same manifest entries and keeps query/fragment
    const out = rewriteCSSUrls(css, cssPath, manifest);
    const fontEntry = manifest.assets.get(path.join(dir, 'font.woff'));
    expect(out).toContain(`url('${fontEntry?.outputPath}?v=3#iefix')`);
    expect(out).toContain('url(#gradient)');
    expect(out).toContain('url(//cdn.example.com/x.png)');
    expect(out).toContain('url(missing-in-comment.png)');
  });

  test('a genuinely missing file is still reported as AssetNotFound', async () => {
    const cssPath = path.join(dir, 'main.css');
    await fs.writeFile(cssPath, '.a { background: url(nope.png?v=1); }');
    const result = await Effect.runPromise(
      Effect.result(collectAssets(config as never, [cssPath], dir, options))
    );
    expect(result._tag).toBe('Failure');
  });
});

describe('inlined url() references keep their #fragment', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'eligian-css-inline-fragment-'));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  test('an inlined SVG keeps #home / #blur and drops ?query', async () => {
    await fs.writeFile(path.join(dir, 'icons.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    await fs.writeFile(path.join(dir, 'fx.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    const cssPath = path.join(dir, 'main.css');
    const css = `
      .a { mask: url(./icons.svg#home); }
      .b { filter: url('./fx.svg?v=2#blur'); }
      .c { background: url(./icons.svg); }
    `;
    await fs.writeFile(cssPath, css);

    const manifest = await Effect.runPromise(
      collectAssets(config as never, [cssPath], dir, { inlineThreshold: 1024 * 1024 })
    );
    const icons = manifest.assets.get(path.join(dir, 'icons.svg'));
    const fx = manifest.assets.get(path.join(dir, 'fx.svg'));
    expect(icons?.inline).toBe(true);
    expect(fx?.inline).toBe(true);

    const out = rewriteCSSUrls(css, cssPath, manifest);
    expect(out).toContain(`mask: url('${icons?.dataUri}#home')`);
    expect(out).toContain(`filter: url('${fx?.dataUri}#blur')`);
    expect(out).toContain(`background: url('${icons?.dataUri}')`);
    expect(out).not.toContain('?v=2');
  });
});
