/**
 * HTML Import Utilities
 *
 * Utilities for loading HTML imports and resolving their paths.
 * Used by ast-transformer to process HTML imports into variables.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Resolve HTML import path relative to source file
 *
 * @param importPath - Relative path from import statement (e.g., './snippet.html')
 * @param sourceFilePath - Absolute path to source .eligian file
 * @param projectRoot - Absolute path to project root (for security validation)
 * @returns Absolute path to HTML file
 * @throws Error if path escapes project directory
 */
export function resolveHTMLPath(
  importPath: string,
  sourceFilePath: string,
  projectRoot: string
): string {
  // Normalize path separators (handle Windows backslashes)
  const normalized = importPath.replace(/\\/g, '/');

  // Resolve relative to source file directory
  const sourceDir = path.dirname(sourceFilePath);
  const absolutePath = path.resolve(sourceDir, normalized);

  // Security check: ensure path is within project directory
  const relativePath = path.relative(projectRoot, absolutePath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(
      `Security violation: HTML import path escapes project directory.\n` +
        `  Import path: '${importPath}'\n` +
        `  Resolves to: '${absolutePath}'\n` +
        `  Project root: '${projectRoot}'`
    );
  }

  return absolutePath;
}

/**
 * Load HTML file content synchronously
 *
 * @param absolutePath - Absolute path to HTML file
 * @returns HTML content as string
 * @throws Error if file cannot be read
 */
export function loadHTMLFile(absolutePath: string): string {
  try {
    return readFileSync(absolutePath, 'utf-8');
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw new Error(`HTML file not found: ${absolutePath}`);
    }
    if (error.code === 'EACCES') {
      throw new Error(`Permission denied reading HTML file: ${absolutePath}`);
    }
    throw new Error(`Failed to read HTML file: ${absolutePath} (${error.message})`);
  }
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
