/**
 * HTML Import Utilities
 *
 * Utilities for loading HTML imports and resolving their paths.
 * Used by ast-transformer to process HTML imports into variables.
 */

import path from 'node:path';
import { loadFileSync, normalizePath, resolvePath } from '@eligian/shared-utils';

/**
 * Resolve HTML import path relative to source file
 *
 * @param importPath - Relative path from import statement (e.g., './snippet.html')
 * @param sourceFilePath - Absolute path to source .eligian file
 * @param projectRoot - Absolute path to project root (DEPRECATED - no longer used for security)
 * @returns Absolute path to HTML file
 * @throws Error if path escapes source file directory
 *
 * @remarks
 * Security boundary is the source file's directory, not the project root.
 * Paths cannot navigate outside the .eligian file's directory.
 */
export function resolveHTMLPath(
  importPath: string,
  sourceFilePath: string,
  _projectRoot: string
): string {
  // Get source file directory (security boundary)
  const sourceDir = path.dirname(sourceFilePath);

  // Use shared-utils path resolver with security validation
  const result = resolvePath(importPath, sourceDir);

  if (!result.success) {
    throw new Error(
      `Security violation: HTML import path escapes source file directory.\n` +
        `  Import path: '${importPath}'\n` +
        `  Source file: '${normalizePath(sourceFilePath)}'\n` +
        `  Error: ${result.error.message}`
    );
  }

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
