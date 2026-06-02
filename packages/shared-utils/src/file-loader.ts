/**
 * File loading utilities for Eligian DSL
 *
 * Provides consistent file loading with typed error handling for both
 * synchronous and asynchronous operations.
 *
 * @module file-loader
 */

import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import {
  createFileNotFoundError,
  createPermissionError,
  createReadError,
  type FileNotFoundError,
  type PermissionError,
  type ReadError,
} from './errors.js';

/**
 * Result of a file load operation (discriminated union)
 */
export type FileLoadResult =
  | {
      readonly success: true;
      readonly content: string;
    }
  | {
      readonly success: false;
      readonly error: FileNotFoundError | PermissionError | ReadError;
    };

/**
 * Maps Node.js error codes to typed errors
 *
 * @param error - Node.js error with optional code property
 * @param path - File path that caused the error
 * @returns Typed error (FileNotFoundError, PermissionError, or ReadError)
 */
function mapFileSystemError(
  error: unknown,
  path: string
): FileNotFoundError | PermissionError | ReadError {
  // Only Node.js Error objects carry a `code`; guard before casting so a
  // non-Error throwable (string, object, etc.) falls through to the generic
  // read error instead of dereferencing an arbitrary value.
  const code = error instanceof Error ? (error as NodeJS.ErrnoException).code : undefined;

  // Map specific error codes to typed errors
  switch (code) {
    case 'ENOENT':
      return createFileNotFoundError(path);

    case 'EACCES':
    case 'EPERM':
      return createPermissionError(path);

    default:
      // Generic read error for all other cases. Pass the raw error as `cause`
      // so the original (machine-inspectable) Error is preserved, not a
      // pre-stringified message (B43).
      return createReadError(path, error);
  }
}

/**
 * Load a file synchronously from the file system
 *
 * Reads the entire file content as UTF-8 text. Errors are returned as typed
 * error objects (not thrown) for consistent error handling.
 *
 * @param absolutePath - Absolute path to the file to load
 * @returns FileLoadResult with either content or typed error
 *
 * @example
 * ```typescript
 * const result = loadFileSync('/project/src/styles.css');
 *
 * if (result.success) {
 *   console.log('File content:', result.content);
 * } else {
 *   // Handle typed errors
 *   switch (result.error._tag) {
 *     case 'FileNotFoundError':
 *       console.error('File not found:', result.error.path);
 *       break;
 *     case 'PermissionError':
 *       console.error('Permission denied:', result.error.path);
 *       break;
 *     case 'ReadError':
 *       console.error('Read failed:', result.error.message);
 *       break;
 *   }
 * }
 * ```
 */
export function loadFileSync(absolutePath: string): FileLoadResult {
  try {
    // Read file as UTF-8 text
    const content = fs.readFileSync(absolutePath, 'utf-8');

    return {
      success: true,
      content,
    };
  } catch (error) {
    // Map Node.js errors to typed errors
    return {
      success: false,
      error: mapFileSystemError(error, absolutePath),
    };
  }
}

/**
 * Load a file asynchronously from the file system
 *
 * Reads the entire file content as UTF-8 text. The promise ALWAYS resolves
 * (never rejects) - errors are returned as typed error objects in the result.
 *
 * @param absolutePath - Absolute path to the file to load
 * @returns Promise that resolves to FileLoadResult (never rejects)
 *
 * @example
 * ```typescript
 * const result = await loadFileAsync('/project/src/template.html');
 *
 * if (result.success) {
 *   console.log('Loaded:', result.content.length, 'bytes');
 * } else {
 *   // Handle typed errors (same as sync version)
 *   if (result.error._tag === 'FileNotFoundError') {
 *     console.error('Not found:', result.error.path);
 *     console.error('Hint:', result.error.hint);
 *   }
 * }
 * ```
 */
export async function loadFileAsync(absolutePath: string): Promise<FileLoadResult> {
  try {
    // Read file as UTF-8 text (async)
    const content = await fsPromises.readFile(absolutePath, 'utf-8');

    return {
      success: true,
      content,
    };
  } catch (error) {
    // Map Node.js errors to typed errors
    return {
      success: false,
      error: mapFileSystemError(error, absolutePath),
    };
  }
}
