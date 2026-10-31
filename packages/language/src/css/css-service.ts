/**
 * CSS Service - Unified CSS operations module
 *
 * Provides parsing, loading, and URL rewriting for CSS files.
 * Used by both language server (validation) and VS Code extension (webview injection).
 *
 * @module css-service
 * @packageDocumentation
 */

// ============================================================================
// URI Types (Platform-Agnostic)
// ============================================================================

/**
 * Platform-agnostic URI representation
 *
 * Avoids dependency on VS Code types in language package.
 */
export interface Uri {
  /** URI scheme (e.g., 'file', 'vscode-webview') */
  readonly scheme: string;

  /** Absolute path or resource path */
  readonly path: string;

  /** String representation of URI */
  toString(): string;
}

// ============================================================================
// Webview URI Conversion
// ============================================================================

/**
 * URI converter for webview contexts
 *
 * Abstracts the conversion of file system URIs to webview-compatible URIs.
 * This allows the CSS rewriter to work with any webview implementation
 * (VS Code, browser, Electron, etc.) without direct coupling.
 *
 * @example
 * ```typescript
 * // VS Code implementation
 * class VSCodeWebviewUriConverter implements WebviewUriConverter {
 *   constructor(private webview: vscode.Webview) {}
 *
 *   convertToWebviewUri(fileUri: Uri): Uri {
 *     const vscodeUri = vscode.Uri.file(fileUri.path);
 *     const webviewUri = this.webview.asWebviewUri(vscodeUri);
 *     return {
 *       scheme: webviewUri.scheme,
 *       path: webviewUri.path,
 *       toString: () => webviewUri.toString()
 *     };
 *   }
 * }
 * ```
 */
export interface WebviewUriConverter {
  /**
   * Convert a file system URI to a webview-compatible URI
   *
   * @param fileUri - File system URI (file:// scheme)
   * @returns Webview-compatible URI (e.g., vscode-webview:// scheme)
   *
   * @remarks
   * - Must preserve path integrity (no data loss)
   * - Must be pure function (same input → same output)
   * - Should handle absolute paths correctly
   */
  convertToWebviewUri(fileUri: Uri): Uri;
}

// ============================================================================
// CSS Loading and URL Rewriting
// ============================================================================

/**
 * CSS file loaded and processed for webview injection
 *
 * Contains the CSS content with rewritten url() paths and a stable unique ID.
 */
export interface LoadedCSS {
  /** CSS content with rewritten url() paths */
  content: string;

  /** Stable unique identifier (SHA-256 hash of file path) */
  id: string;
}

// ============================================================================
// Implementation
// ============================================================================

import * as crypto from 'node:crypto';
import * as path from 'node:path';
import { loadFileAsync } from '@eligian/shared-utils';

// Note: parseCSS is available from css-parser.js directly
// We don't re-export it here to avoid naming conflicts

/**
 * Generate stable unique identifier from file path using SHA-256 hash
 *
 * @param filePath - Absolute file system path to CSS file
 * @returns 16-character hex string (SHA-256 hash truncated)
 *
 * @example
 * ```typescript
 * generateCSSId('/workspace/styles/main.css'); // 'a3f5b2c8d9e1f4b7'
 * ```
 */
export function generateCSSId(filePath: string): string {
  const hash = crypto.createHash('sha256');
  hash.update(filePath);
  return hash.digest('hex').substring(0, 16);
}

/**
 * Rewrite CSS url() paths and bare-string @import targets to webview URIs
 *
 * Converts relative paths in CSS (like url(./image.png) or @import "./x.css")
 * to webview URIs so assets and imported sheets load in the webview context.
 * (Left relative, an @import resolves against the webview origin and is blocked.)
 *
 * @param css - CSS file content
 * @param cssFilePath - Absolute path to CSS file (for resolving relative paths)
 * @param converter - Webview URI converter (platform-specific)
 * @returns CSS content with rewritten url() paths and @import targets
 *
 * @example
 * ```typescript
 * const css = ".bg { background: url('./image.png'); }";
 * rewriteUrls(css, '/workspace/styles/main.css', converter);
 * // ".bg { background: url('vscode-webview://.../styles/image.png'); }"
 * ```
 */
export function rewriteUrls(
  css: string,
  cssFilePath: string,
  converter: WebviewUriConverter
): string {
  const cssDir = path.dirname(cssFilePath);

  // Match url(...) patterns in CSS
  // Handles: url(./file), url("./file"), url('../file'), url('file'), url( "file" )
  const urlRegex = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;

  // Bare-string @import targets: @import "./x.css" / @import './x.css'
  // (@import url(...) is covered by urlRegex)
  const importRegex = /@import\s+(['"])([^'"]+)\1/g;

  return css
    .replace(urlRegex, (match, _quote, rawUrl: string) => {
      const ref = toWebviewRef(rawUrl, cssDir, converter);
      return ref === undefined ? match : `url('${ref}')`;
    })
    .replace(importRegex, (match, _quote, rawUrl: string) => {
      const ref = toWebviewRef(rawUrl, cssDir, converter);
      return ref === undefined ? match : `@import '${ref}'`;
    });
}

/**
 * Webview URI (quote-escaped, ?query / #fragment kept) for a local CSS reference, or
 * undefined for references that must stay as written.
 */
function toWebviewRef(
  rawUrl: string,
  cssDir: string,
  converter: WebviewUriConverter
): string | undefined {
  const url = rawUrl.trim();

  // Leave non-file references untouched: fragment-only (#id), protocol-relative (//host),
  // and anything with a URL scheme (http:, https:, data:, blob:, ...)
  if (
    url === '' ||
    url.startsWith('#') ||
    url.startsWith('//') ||
    /^[a-z][a-z0-9+.-]+:/i.test(url)
  ) {
    return undefined;
  }

  // Separate the file path from any ?query / #fragment, which must survive rewriting
  const suffixIndex = url.search(/[?#]/);
  const rawPath = suffixIndex === -1 ? url : url.slice(0, suffixIndex);
  const suffix = suffixIndex === -1 ? '' : url.slice(suffixIndex);

  // Percent-decode for file lookup (the converter re-encodes as needed)
  let urlPath = rawPath;
  try {
    urlPath = decodeURIComponent(rawPath);
  } catch {
    // Malformed escape: use the path as written
  }

  // Resolve relative path to absolute
  const absolutePath = path.resolve(cssDir, urlPath);

  // Normalize Windows paths (CSS doesn't accept backslashes)
  const normalizedPath = absolutePath.replace(/\\/g, '/');

  // Convert to webview URI using platform-specific converter
  const fileUri: Uri = {
    scheme: 'file',
    path: normalizedPath,
    toString: () => `file://${normalizedPath}`,
  };
  const webviewUri = converter.convertToWebviewUri(fileUri);

  return `${webviewUri.toString().replace(/'/g, "\\'")}${suffix}`;
}

/**
 * Load CSS file content from disk and prepare for webview injection
 *
 * Reads the CSS file, rewrites url() paths for webview compatibility,
 * and generates a stable unique ID for tracking.
 *
 * @param filePath - Absolute path to CSS file
 * @param converter - Webview URI converter (platform-specific)
 * @returns Loaded CSS with rewritten URLs and unique ID
 * @throws Error if file cannot be read (FileNotFoundError, PermissionError, ReadError)
 *
 * @example
 * ```typescript
 * const loaded = await loadCSS('/workspace/styles/main.css', converter);
 * console.log(loaded.id); // 'a3f5b2c8d9e1f4b7'
 * console.log(loaded.content); // CSS with rewritten url() paths
 * ```
 */
export async function loadCSS(
  filePath: string,
  converter: WebviewUriConverter
): Promise<LoadedCSS> {
  // Use shared-utils file loader with typed error handling
  const result = await loadFileAsync(filePath);

  if (!result.success) {
    // Throw error for backwards compatibility with extension code
    const error = result.error;
    throw new Error(`Failed to load CSS file: ${error.path} (${error._tag})`);
  }

  // Rewrite CSS url() paths for webview
  const content = rewriteUrls(result.content, filePath, converter);

  // Generate stable ID for tracking
  const id = generateCSSId(filePath);

  return { content, id };
}
