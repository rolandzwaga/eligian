/**
 * Mock Asset Loader for Testing
 *
 * Provides a mock implementation of IAssetLoader that works with the mock file system.
 * This enables tests to validate asset loading logic without actual file I/O.
 *
 * ## Usage
 *
 * ```typescript
 * const ctx = createTestContextWithMockFS();
 * const assetLoader = new MockAssetLoader(ctx.mockFs!);
 *
 * // Add CSS file to mock FS
 * ctx.mockFs!.writeFile('file:///test/styles.css', '.button { color: red; }');
 *
 * // Mock asset loader can now check file existence
 * assetLoader.fileExists('/test/styles.css') // true
 * ```
 */

import { URI } from 'langium';
import type { IAssetLoader } from '../asset-loading/interfaces.js';
import type { MockFileSystemProvider } from './mock-file-system.js';

/**
 * Mock asset loader that uses the mock file system
 */
export class MockAssetLoader implements IAssetLoader {
  constructor(private readonly mockFs: MockFileSystemProvider) {}

  /**
   * Check if a file exists at the given absolute path
   *
   * @param absolutePath - Absolute path to check (can be file:// URI or file system path)
   * @returns true if file exists in mock FS, false otherwise
   */
  fileExists(absolutePath: string): boolean {
    // Convert file system path to URI if needed
    const uri = this.toUri(absolutePath);
    return this.mockFs.existsSync(uri);
  }

  /**
   * Load file contents from absolute path
   *
   * @param absolutePath - Absolute path to the file
   * @returns File contents as UTF-8 string
   * @throws Error if file doesn't exist or can't be read
   */
  loadFile(absolutePath: string): string {
    const uri = this.toUri(absolutePath);

    try {
      return this.mockFs.readFileSync(uri);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to load file: ${message}`);
    }
  }

  /**
   * Resolve a relative path from a source file to an absolute path
   *
   * This is a simplified implementation for testing that assumes:
   * - Source paths are file:// URIs
   * - Relative paths use Unix-style forward slashes
   * - Path resolution is straightforward (no complex normalization)
   *
   * @param sourcePath - Absolute path to the source .eligian file (file:// URI)
   * @param relativePath - Relative path from the import statement
   * @returns Absolute path to the target file (file:// URI or file system path)
   *
   * @example
   * ```typescript
   * const loader = new MockAssetLoader(mockFs);
   * const sourcePath = 'file:///test/main.eligian';
   * const relativePath = './styles.css';
   * const absolutePath = loader.resolvePath(sourcePath, relativePath);
   * // Result: 'file:///test/styles.css'
   * ```
   */
  resolvePath(sourcePath: string, relativePath: string): string {
    // Extract directory from source path
    const sourceUri = this.toUri(sourcePath);
    const sourceUriStr = sourceUri.toString();
    const lastSlash = sourceUriStr.lastIndexOf('/');
    const sourceDir = sourceUriStr.substring(0, lastSlash);

    // Resolve relative path
    // Remove leading './' if present
    let cleanRelativePath = relativePath;
    if (cleanRelativePath.startsWith('./')) {
      cleanRelativePath = cleanRelativePath.substring(2);
    }

    // Handle parent directory references (..)
    const parts = cleanRelativePath.split('/');
    const sourceParts = sourceDir.split('/');

    for (const part of parts) {
      if (part === '..') {
        // Go up one directory
        sourceParts.pop();
      } else if (part !== '.' && part !== '') {
        // Add to path
        sourceParts.push(part);
      }
    }

    const resolvedPath = sourceParts.join('/');

    // Return as file:// URI if source was a URI, otherwise return as path
    if (sourcePath.startsWith('file://')) {
      return resolvedPath;
    }

    // Convert URI back to file system path
    return resolvedPath.replace(/^file:\/\//, '');
  }

  /**
   * Convert a file system path or URI to a Langium URI object
   */
  private toUri(path: string): URI {
    if (path.startsWith('file://')) {
      return URI.parse(path);
    }

    // Convert file system path to file:// URI
    // Handle Windows paths (convert backslashes to forward slashes)
    const normalizedPath = path.replace(/\\/g, '/');

    // Ensure path starts with /
    const uriPath = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`;

    return URI.parse(`file://${uriPath}`);
  }
}
