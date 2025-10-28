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
 * Rewrite CSS url() paths to webview URIs for images/fonts
 *
 * Converts relative paths in CSS (like url(./image.png)) to webview URIs
 * so assets load correctly in the webview context.
 *
 * @param css - CSS file content
 * @param cssFilePath - Absolute path to CSS file (for resolving relative paths)
 * @param converter - Webview URI converter (platform-specific)
 * @returns CSS content with rewritten url() paths
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
  // Handles: url(./file), url("./file"), url('../file'), url('file')
  const urlRegex = /url\(['"]?([^'")]+)['"]?\)/g;

  return css.replace(urlRegex, (match, urlPath) => {
    // Skip absolute URLs (http://, https://, data:)
    if (
      urlPath.startsWith('http://') ||
      urlPath.startsWith('https://') ||
      urlPath.startsWith('data:')
    ) {
      return match;
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

    return `url('${webviewUri.toString()}')`;
  });
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
