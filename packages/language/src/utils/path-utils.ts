/**
 * Path Utilities
 *
 * This module provides utilities for path manipulation, eliminating
 * duplicated file extension extraction patterns.
 */

import { extname } from 'node:path';

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
