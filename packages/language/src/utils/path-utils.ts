/**
 * Path Utilities
 *
 * This module provides utilities for path manipulation, eliminating
 * duplicated file extension extraction patterns.
 */

import { dirname, extname, join } from 'node:path';
import { URI } from 'vscode-uri';

/**
 * Extracts the file extension from a path string.
 *
 * Returns the extension without the leading dot, normalized to lowercase.
 * Returns empty string if no extension is present.
 *
 * This utility wraps Node.js `path.extname()` to provide consistent behavior:
 * - Removes the leading dot from the extension
 * - Normalizes to lowercase
 * - Returns empty string for no extension
 *
 * @param path - File path string (relative or absolute)
 * @returns File extension in lowercase without dot, or empty string if no extension
 *
 * @example
 * ```typescript
 * getFileExtension('./file.html')         // → 'html'
 * getFileExtension('./file.min.css')      // → 'css' (last extension)
 * getFileExtension('./file')              // → ''
 * getFileExtension('./file.HTML')         // → 'html' (lowercased)
 * getFileExtension('../../dir.v2/file.js') // → 'js' (ignores dots in directories)
 * getFileExtension('')                    // → ''
 * getFileExtension('./file.')             // → '' (trailing dot - returns '.')
 * getFileExtension('.gitignore')          // → '' (dotfiles have no extension)
 * ```
 */
export function getFileExtension(path: string): string {
  if (!path) return '';

  const ext = extname(path);
  // extname returns '.html', we want 'html'
  // extname returns '' for no extension, we want ''
  // extname returns '.' for trailing dot, we want ''
  return ext && ext !== '.' ? ext.slice(1).toLowerCase() : '';
}

/**
 * Strips surrounding single or double quotes from a grammar string-literal path.
 *
 * DSL import paths arrive from the AST still wrapped in their source quotes
 * (e.g. `"./styles.css"`). This removes a single matching pair of leading/trailing
 * quotes. Already-unquoted input is returned unchanged (idempotent).
 *
 * @param rawPath - Path as it appears in source, possibly quoted
 * @returns The path with surrounding quotes removed
 *
 * @example
 * ```typescript
 * stripImportQuotes('"./styles.css"') // → './styles.css'
 * stripImportQuotes("'./a.css'")      // → './a.css'
 * stripImportQuotes('./a.css')        // → './a.css'
 * ```
 */
export function stripImportQuotes(rawPath: string): string {
  return rawPath.replace(/^["']|["']$/g, '');
}

/**
 * Resolves a (possibly quoted, possibly relative) import path to an absolute
 * filesystem path, relative to the given document directory.
 *
 * Quotes are stripped and the result is joined onto `docDir` via `path.join`,
 * which correctly handles `./`, `.`, and `../` segments (unlike manual `./`
 * stripping + string concatenation). Use this when a real filesystem path is
 * needed (e.g. `fs.readFileSync`).
 *
 * @param rawPath - Import path from the AST (possibly quoted, e.g. `"./styles.css"`)
 * @param docDir - Absolute directory of the importing document
 * @returns Absolute, normalized filesystem path
 *
 * @example
 * ```typescript
 * resolveImportRelativePath('"./styles.css"', '/proj') // → '/proj/styles.css'
 * resolveImportRelativePath('../shared/a.css', '/proj/sub') // → '/proj/shared/a.css'
 * ```
 */
export function resolveImportRelativePath(rawPath: string, docDir: string): string {
  return join(docDir, stripImportQuotes(rawPath));
}

/**
 * Resolves a (possibly quoted, possibly relative, possibly already-absolute)
 * import path to an absolute `file://` URI string, relative to the importing
 * document's URI.
 *
 * Behavior:
 * - Surrounding quotes are stripped first.
 * - If the path is already an absolute `file://` URI, it is returned unchanged.
 * - Otherwise the path is resolved against the document's directory and
 *   converted to a `file://` URI via `URI.file()` (cross-platform, matches the
 *   format used by the language server and CSS/labels/HTML registries).
 *
 * @param documentUri - URI of the importing Eligian document
 * @param rawPath - Import path (possibly quoted/relative/absolute)
 * @returns Absolute `file://` URI string
 *
 * @example
 * ```typescript
 * resolveImportPathToUri('file:///proj/main.eligian', '"./styles.css"')
 * // → 'file:///proj/styles.css'
 * resolveImportPathToUri('file:///proj/main.eligian', 'file:///other/a.css')
 * // → 'file:///other/a.css' (already absolute)
 * ```
 */
export function resolveImportPathToUri(documentUri: string, rawPath: string): string {
  const cleanPath = stripImportQuotes(rawPath);
  if (cleanPath.startsWith('file://')) {
    return cleanPath;
  }
  const docDir = dirname(URI.parse(documentUri).fsPath);
  return URI.file(join(docDir, cleanPath)).toString();
}

/**
 * Converts a `file://` URI string to an absolute filesystem path.
 *
 * Single source of truth for the URI→path decoding that was previously
 * hand-rolled as `uri.replace('file:///', '')` + `decodeURIComponent(...)`.
 * That manual idiom drops the leading slash on POSIX paths and ignores
 * authority components; delegating to `URI.parse(uri).fsPath` handles
 * percent-encoding and platform-specific drive letters / slashes correctly.
 *
 * @param uri - A `file://` URI string (possibly percent-encoded)
 * @returns The decoded absolute filesystem path
 *
 * @example
 * ```typescript
 * uriToFsPath('file:///c%3A/proj/styles.css') // → 'c:\\proj\\styles.css' (Windows)
 * uriToFsPath('file:///home/user/a.css')      // → '/home/user/a.css' (POSIX)
 * ```
 */
export function uriToFsPath(uri: string): string {
  return URI.parse(uri).fsPath;
}
