/**
 * Mock File System for Testing
 *
 * Provides an in-memory file system implementation for testing cross-document
 * references without actual file I/O. This enables tests to:
 * - Create library files programmatically
 * - Resolve imports across documents
 * - Test validators that depend on file existence checks
 *
 * ## Usage
 *
 * ```typescript
 * const fs = new MockFileSystemProvider();
 *
 * // Add library file
 * fs.writeFile('file:///test/animations.eligian', `
 *   library animations
 *   action fadeIn() [...]
 * `);
 *
 * // Create services with mock FS
 * const services = createEligianServices({
 *   fileSystemProvider: () => fs
 * });
 * ```
 *
 * ## Implementation Notes
 *
 * - Stores files in memory as Map<string, string>
 * - Supports both sync and async methods (sync implementation)
 * - Case-sensitive file paths (matches Unix behavior)
 * - No support for directories (files only)
 * - URI normalization (converts to string key)
 */

import type { URI } from 'langium';
import type { FileSystemNode, FileSystemProvider } from 'langium/lsp';

/**
 * In-memory file system for testing
 */
export class MockFileSystemProvider implements FileSystemProvider {
  private files: Map<string, string> = new Map();

  /**
   * Add a file to the mock file system
   * @param uri File URI (string or URI object)
   * @param content File content
   */
  writeFile(uri: string | URI, content: string): void {
    const key = this.normalizeUri(uri);
    this.files.set(key, content);
  }

  /**
   * Remove a file from the mock file system
   * @param uri File URI
   */
  deleteFile(uri: string | URI): void {
    const key = this.normalizeUri(uri);
    this.files.delete(key);
  }

  /**
   * Clear all files from the mock file system
   */
  clear(): void {
    this.files.clear();
  }

  /**
   * Check if a file exists
   * @param uri File URI
   */
  exists(uri: URI): Promise<boolean> {
    return Promise.resolve(this.existsSync(uri));
  }

  /**
   * Check if a file exists (sync)
   * @param uri File URI
   */
  existsSync(uri: URI): boolean {
    const key = this.normalizeUri(uri);
    return this.files.has(key);
  }

  /**
   * Get file/directory stats
   * @param uri File URI
   */
  stat(uri: URI): Promise<FileSystemNode> {
    return Promise.resolve(this.statSync(uri));
  }

  /**
   * Get file/directory stats (sync)
   * @param uri File URI
   */
  statSync(uri: URI): FileSystemNode {
    const key = this.normalizeUri(uri);
    const exists = this.files.has(key);

    if (!exists) {
      throw new Error(`ENOENT: no such file or directory: ${key}`);
    }

    return {
      uri,
      isFile: true,
      isDirectory: false,
    };
  }

  /**
   * Read file content as binary
   * @param uri File URI
   */
  readBinary(uri: URI): Promise<Uint8Array> {
    return Promise.resolve(this.readBinarySync(uri));
  }

  /**
   * Read file content as binary (sync)
   * @param uri File URI
   */
  readBinarySync(uri: URI): Uint8Array {
    const content = this.readFileSync(uri);
    const encoder = new TextEncoder();
    return encoder.encode(content);
  }

  /**
   * Read file content as string
   * @param uri File URI
   */
  readFile(uri: URI): Promise<string> {
    return Promise.resolve(this.readFileSync(uri));
  }

  /**
   * Read file content as string (sync)
   * @param uri File URI
   */
  readFileSync(uri: URI): string {
    const key = this.normalizeUri(uri);
    const content = this.files.get(key);

    if (content === undefined) {
      throw new Error(`ENOENT: no such file or directory: ${key}`);
    }

    return content;
  }

  /**
   * Read directory (not implemented - returns empty array)
   * @param _uri Directory URI
   */
  readDirectory(_uri: URI): Promise<FileSystemNode[]> {
    return Promise.resolve(this.readDirectorySync(_uri));
  }

  /**
   * Read directory (not implemented - returns empty array)
   * @param _uri Directory URI
   */
  readDirectorySync(_uri: URI): FileSystemNode[] {
    // Mock FS doesn't support directory listings
    // Return empty array to avoid breaking Langium workspace initialization
    return [];
  }

  /**
   * Normalize URI to string key for Map storage
   * Handles both URI objects and strings
   */
  private normalizeUri(uri: string | URI): string {
    if (typeof uri === 'string') {
      return uri;
    }
    // URI object - convert to string
    return uri.toString();
  }
}

/**
 * Factory function for Langium services configuration
 *
 * Usage:
 * ```typescript
 * const mockFs = new MockFileSystemProvider();
 * mockFs.writeFile('file:///test/lib.eligian', 'library lib...');
 *
 * const services = createEligianServices({
 *   fileSystemProvider: () => mockFs
 * });
 * ```
 */
export function createMockFileSystem(): {
  fileSystemProvider: () => MockFileSystemProvider;
  fs: MockFileSystemProvider;
} {
  const fs = new MockFileSystemProvider();
  return {
    fileSystemProvider: () => fs,
    fs,
  };
}
