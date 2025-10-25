/**
 * Node.js Asset Loader Implementation
 *
 * File system-based implementation of IAssetLoader using Node.js fs module.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
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
    try {
      if (!this.fileExists(absolutePath)) {
        throw new Error(`File not found: ${absolutePath}`);
      }

      return readFileSync(absolutePath, 'utf-8');
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Failed to load file: ${absolutePath}`);
    }
  }

  /**
   * Resolve a relative path from a source file to an absolute path
   *
   * @param sourcePath - Absolute path to the source .eligian file
   * @param relativePath - Relative path from the import statement
   * @returns Absolute path to the target file
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
    // Get directory of source file
    const sourceDir = dirname(sourcePath);

    // Resolve relative path from source directory
    // Node.js path.resolve automatically handles cross-platform paths
    return resolve(sourceDir, relativePath);
  }
}
