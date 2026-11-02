/**
 * URL / asset-path utilities (single source of truth)
 *
 * Shared helpers for classifying URLs (external vs data URI) and resolving
 * relative asset references against a containing file. Previously these were
 * copy-pasted across asset-collector.ts, css-processor.ts, and html-generator.ts
 * (D31).
 */

import * as path from 'node:path';

/**
 * Check if a URL is external (http://, https://, or protocol-relative //)
 */
export function isExternalUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//');
}

/**
 * Check if a URL is a data URI
 */
export function isDataUri(url: string): boolean {
  return url.startsWith('data:');
}

/**
 * Resolve a relative URL reference against the directory of a containing file.
 *
 * @param urlRef - The URL reference (e.g., "./images/hero.png")
 * @param containingFilePath - Absolute path to the file the reference appears in
 *   (CSS or HTML file)
 * @returns Absolute path to the referenced asset
 */
export function resolveAssetPath(urlRef: string, containingFilePath: string): string {
  const baseDir = path.dirname(containingFilePath);
  return path.resolve(baseDir, urlRef);
}

/**
 * Check if a URL is a fragment-only reference (e.g. "#gradient", used by SVG
 * `fill: url(#grad)`). These never refer to a file.
 */
export function isFragmentOnlyUrl(url: string): boolean {
  return url.startsWith('#');
}

/**
 * Split a URL into its file-path part and its trailing `?query` / `#fragment`
 * suffix (the suffix is returned verbatim, including the leading `?` or `#`).
 */
export function splitUrlSuffix(url: string): { pathPart: string; suffix: string } {
  const index = url.search(/[?#]/);
  if (index === -1) {
    return { pathPart: url, suffix: '' };
  }
  return { pathPart: url.slice(0, index), suffix: url.slice(index) };
}

/**
 * Percent-decode a URL path for file-system lookup. Malformed escapes leave
 * the input unchanged.
 */
export function decodeUrlPath(urlPath: string): string {
  try {
    return decodeURIComponent(urlPath);
  } catch {
    return urlPath;
  }
}

/**
 * Resolve a CSS url() reference to the file it names: the `?query` and
 * `#fragment` are stripped and the path is percent-decoded.
 *
 * @returns The absolute file path and the stripped suffix (to re-attach to a rewritten URL)
 */
export function resolveCssUrlFile(
  urlRef: string,
  cssFilePath: string
): { absolutePath: string; suffix: string } {
  const { pathPart, suffix } = splitUrlSuffix(urlRef);
  return { absolutePath: resolveAssetPath(decodeUrlPath(pathPart), cssFilePath), suffix };
}

/**
 * Replace CSS comments with spaces of the same length (newlines preserved) so
 * that offsets and line numbers are unchanged while url() inside comments is
 * ignored. String literals are respected, so `"/*"` is not treated as a comment.
 */
export function maskCssComments(css: string): string {
  let out = '';
  let i = 0;
  while (i < css.length) {
    const ch = css[i];
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < css.length && css[j] !== ch && css[j] !== '\n') {
        j += css[j] === '\\' ? 2 : 1;
      }
      const end = Math.min(j + 1, css.length);
      out += css.slice(i, end);
      i = end;
    } else if (ch === '/' && css[i + 1] === '*') {
      const close = css.indexOf('*/', i + 2);
      const end = close === -1 ? css.length : close + 2;
      out += css.slice(i, end).replace(/[^\r\n]/g, ' ');
      i = end;
    } else {
      out += ch;
      i++;
    }
  }
  return out;
}
