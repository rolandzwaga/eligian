/**
 * Additional rewriteUrls() edge cases (audit findings #43, #53): combined query+fragment,
 * blob:, uppercase schemes, empty url(), quote escaping, mixed content and @import forms.
 */

import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { rewriteUrls, type Uri, type WebviewUriConverter } from '../css-service.js';

const converter: WebviewUriConverter = {
  convertToWebviewUri(fileUri: Uri): Uri {
    return {
      scheme: 'vscode-webview',
      path: fileUri.path,
      toString: () => `vscode-webview://authority${fileUri.path}`,
    };
  },
};

const CSS_PATH = path.resolve('/workspace/styles/main.css');

function uri(...segments: string[]): string {
  const absolute = path.resolve('/workspace', ...segments);
  return `vscode-webview://authority${absolute.split(path.sep).join('/')}`;
}

const rewrite = (css: string) => rewriteUrls(css, CSS_PATH, converter);

describe('rewriteUrls() additional edge cases', () => {
  it('keeps the combined ?#iefix suffix out of the file path', () => {
    expect(rewrite('@font-face { src: url("fonts/a.eot?#iefix"); }')).toBe(
      `@font-face { src: url('${uri('styles', 'fonts', 'a.eot')}?#iefix'); }`
    );
  });

  it('keeps a pure query string (cache busting)', () => {
    expect(rewrite('.a { src: url(font.woff2?v=3); }')).toBe(
      `.a { src: url('${uri('styles', 'font.woff2')}?v=3'); }`
    );
  });

  it('leaves blob:, data: and uppercase-scheme URLs untouched', () => {
    for (const url of [
      'blob:https://x/1',
      'HTTPS://cdn.example.com/a.png',
      'data:image/png;base64,AA',
    ]) {
      const css = `.a { background: url("${url}"); }`;
      expect(rewrite(css)).toBe(css);
    }
  });

  it('leaves an empty url() untouched', () => {
    const css = ".a { background: url(''); }";
    expect(rewrite(css)).toBe(css);
  });

  it('rewrites several urls in one declaration independently', () => {
    expect(rewrite('.a { background: url(a.png), url(#m), url(//cdn/x.png); }')).toBe(
      `.a { background: url('${uri('styles', 'a.png')}'), url(#m), url(//cdn/x.png); }`
    );
  });

  it('resolves parent-directory references', () => {
    expect(rewrite('.a { background: url(../img/a.png); }')).toBe(
      `.a { background: url('${uri('img', 'a.png')}'); }`
    );
  });

  it('leaves remote and protocol-relative @import targets untouched', () => {
    const css = '@import "https://fonts.example.com/x.css";\n@import "//cdn.example.com/y.css";';
    expect(rewrite(css)).toBe(css);
  });

  it('rewrites a bare @import with a query suffix', () => {
    expect(rewrite('@import "./x.css?v=2";')).toBe(`@import '${uri('styles', 'x.css')}?v=2';`);
  });

  it('tolerates a malformed percent escape', () => {
    expect(rewrite('.a { background: url(100%.png); }')).toBe(
      `.a { background: url('${uri('styles', '100%.png')}'); }`
    );
  });
});
