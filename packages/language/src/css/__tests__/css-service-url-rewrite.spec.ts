/**
 * rewriteUrls() regression tests: fragment, query, percent-encoded and
 * protocol-relative url() values (audit finding #34).
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

/** Expected webview URL for a path under the workspace root (platform-neutral) */
function uri(...segments: string[]): string {
  const absolute = path.resolve('/workspace', ...segments);
  return `vscode-webview://authority${absolute.split(path.sep).join('/')}`;
}

function rewrite(css: string): string {
  return rewriteUrls(css, CSS_PATH, converter);
}

describe('rewriteUrls() url edge cases', () => {
  it('leaves fragment-only references untouched', () => {
    const css = '.a { fill: url(#gradient); }';
    expect(rewrite(css)).toBe(css);
  });

  it('leaves protocol-relative URLs untouched', () => {
    const css = ".a { background: url('//cdn.example.com/x.png'); }";
    expect(rewrite(css)).toBe(css);
  });

  it('leaves other schemes untouched', () => {
    const css = ".a { background: url('blob:abc'); } .b { background: url(HTTPS://x.com/y.png); }";
    expect(rewrite(css)).toBe(css);
  });

  it('keeps query and fragment out of the file path but appends them to the result', () => {
    const out = rewrite(".a { background: url('./font.woff?v=3#iefix'); }");
    expect(out).toBe(`.a { background: url('${uri('styles', 'font.woff')}?v=3#iefix'); }`);
  });

  it('keeps a fragment on an svg reference', () => {
    const out = rewrite('.a { background: url(icons.svg#home); }');
    expect(out).toContain(`url('${uri('styles', 'icons.svg')}#home')`);
  });

  it('percent-decodes the path before resolving it', () => {
    const out = rewrite('.a { background: url("./my%20image.png"); }');
    expect(out).toContain(uri('styles', 'my image.png'));
    expect(out).not.toContain('%20');
  });

  it('tolerates whitespace inside url( )', () => {
    const out = rewrite(".a { background: url( 'img.png' ); }");
    expect(out).toContain(`url('${uri('styles', 'img.png')}')`);
  });

  it('still rewrites plain relative paths and skips http/data', () => {
    const out = rewrite(
      ".a { background: url('../img/a.png'); } .b { background: url(data:image/png;base64,AAA); } .c { background: url(https://x.com/a.png); }"
    );
    expect(out).toContain(`url('${uri('img', 'a.png')}')`);
    expect(out).toContain('url(data:image/png;base64,AAA)');
    expect(out).toContain('url(https://x.com/a.png)');
  });
});

describe('rewriteUrls() bare-string @import targets (audit #35)', () => {
  it('rewrites double- and single-quoted @import targets to webview URIs', () => {
    const out = rewrite(`@import "./buttons.css";\n@import '../shared/theme.css' screen;`);
    expect(out).toBe(
      `@import '${uri('styles', 'buttons.css')}';\n@import '${uri('shared', 'theme.css')}' screen;`
    );
  });

  it('rewrites @import url(...) once and leaves remote @import targets untouched', () => {
    const out = rewrite(`@import url("./a.css");\n@import "https://fonts.example.com/x.css";`);
    expect(out).toBe(
      `@import url('${uri('styles', 'a.css')}');\n@import "https://fonts.example.com/x.css";`
    );
  });
});
