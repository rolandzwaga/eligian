/**
 * HTML Import Utilities
 *
 * Utilities for loading HTML imports and resolving their paths.
 * Used by ast-transformer to process HTML imports into variables.
 */

import path from 'node:path';
import { loadFileSync, resolvePath } from '@eligian/shared-utils';

/**
 * Resolve HTML import path relative to source file
 *
 * Resolves a relative import path to an absolute path. Parent directory navigation
 * using "../" is allowed, enabling flexible project structures.
 *
 * @param importPath - Relative path from import statement (e.g., './snippet.html' or '../shared/template.html')
 * @param sourceFilePath - Absolute path to source .eligian file
 * @param projectRoot - Absolute path to project root (DEPRECATED - no longer used)
 * @returns Absolute path to HTML file
 *
 * @example
 * ```typescript
 * // Same directory
 * resolveHTMLPath('./template.html', '/project/src/main.eligian', '/project')
 * // => '/project/src/template.html'
 *
 * // Parent directory
 * resolveHTMLPath('../shared/header.html', '/project/src/main.eligian', '/project')
 * // => '/project/shared/header.html'
 * ```
 */
export function resolveHTMLPath(
  importPath: string,
  sourceFilePath: string,
  _projectRoot: string
): string {
  // Get source file directory
  const sourceDir = path.dirname(sourceFilePath);

  // Use shared-utils path resolver (parent directory navigation is allowed)
  const result = resolvePath(importPath, sourceDir);

  return result.absolutePath;
}

/**
 * Load HTML file content synchronously
 *
 * @param absolutePath - Absolute path to HTML file
 * @returns HTML content as string
 * @throws Error if file cannot be read
 */
export function loadHTMLFile(absolutePath: string): string {
  // Use shared-utils file loader with typed error handling
  const result = loadFileSync(absolutePath);

  if (!result.success) {
    // Convert typed error to thrown error for backwards compatibility
    const error = result.error;
    throw new Error(`${error.message}${error.hint ? `\n${error.hint}` : ''}`);
  }

  return result.content;
}

/**
 * Validate HTML file size (warn if >1MB)
 *
 * @param content - HTML content
 * @param maxSizeBytes - Maximum size in bytes (default: 1MB)
 * @returns Warning message if file is too large, undefined otherwise
 */
export function validateHTMLSize(content: string, maxSizeBytes = 1024 * 1024): string | undefined {
  const sizeBytes = Buffer.byteLength(content, 'utf-8');
  if (sizeBytes > maxSizeBytes) {
    return `Warning: HTML file size (${sizeBytes} bytes) exceeds ${maxSizeBytes} bytes. Large files may impact compilation performance.`;
  }
  return undefined;
}
