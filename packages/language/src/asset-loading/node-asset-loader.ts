/**
 * Node.js Asset Loader Implementation
 *
 * File system-based implementation of IAssetLoader using Node.js fs module.
 * Uses @eligian/shared-utils for consistent path resolution and file loading.
 */

import { existsSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { loadFileSync, resolvePath } from '@eligian/shared-utils';
import type { IAssetLoader } from './interfaces.js';

/**
 * Node.js-based asset loader implementation
 *
 * Uses Node.js fs module for file system operations.
 * Supports cross-platform path resolution (Windows/Unix).
 */
export class NodeAssetLoader implements IAssetLoader {
  /**
   * Check if a file exists at the given absolute path
   *
   * @param absolutePath - Absolute path to check
   * @returns true if file exists and is a file (not directory), false otherwise
   */
  fileExists(absolutePath: string): boolean {
    try {
      if (!existsSync(absolutePath)) {
        return false;
      }

      const stats = statSync(absolutePath);
      return stats.isFile();
    } catch {
      // If any error occurs (permissions, invalid path, etc.), treat as non-existent
      return false;
    }
  }

  /**
   * Load file contents from absolute path
   *
   * @param absolutePath - Absolute path to the file
   * @returns File contents as UTF-8 string
   * @throws Error if file doesn't exist or can't be read
   */
  loadFile(absolutePath: string): string {
    // Use shared-utils file loader with typed error handling
    const result = loadFileSync(absolutePath);

    if (!result.success) {
      // Convert typed error to thrown error for IAssetLoader interface compatibility
      const error = result.error;
      throw new Error(`${error.message}${error.hint ? `\n${error.hint}` : ''}`);
    }

    return result.content;
  }

  /**
   * Resolve a relative path from a source file to an absolute path
   *
   * @param sourcePath - Absolute path to the source .eligian file
   * @param relativePath - Relative path from the import statement
   * @returns Absolute path to the target file
   * @throws Error if path escapes source file directory (security violation)
   *
   * @example
   * ```typescript
   * const loader = new NodeAssetLoader();
   * const sourcePath = '/project/src/main.eligian';
   * const relativePath = './layout.html';
   * const absolutePath = loader.resolvePath(sourcePath, relativePath);
   * // Result: '/project/src/layout.html'
   * ```
   */
  resolvePath(sourcePath: string, relativePath: string): string {
    // Get directory of source file (security boundary)
    const sourceDir = dirname(sourcePath);

    // Use shared-utils path resolver with security validation
    const result = resolvePath(relativePath, sourceDir);

    if (!result.success) {
      // Convert typed error to thrown error for IAssetLoader interface compatibility
      const error = result.error;
      throw new Error(
        `Path resolution failed: ${error.message}\n` +
          `  Source file: ${sourcePath}\n` +
          `  Relative path: ${relativePath}`
      );
    }

    return result.absolutePath;
  }
}
