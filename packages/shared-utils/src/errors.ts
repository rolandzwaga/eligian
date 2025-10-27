/**
 * Unified error types for file operations in Eligian DSL
 *
 * All error types use discriminated unions with a `_tag` field for type-safe
 * runtime discrimination. This enables exhaustive pattern matching and avoids
 * class inheritance complexity.
 */

/**
 * Indicates a file does not exist at the specified path.
 */
export interface FileNotFoundError {
  readonly _tag: 'FileNotFoundError';
  readonly path: string;
  readonly message: string;
  readonly hint?: string;
}

/**
 * Indicates insufficient permissions to read the file.
 */
export interface PermissionError {
  readonly _tag: 'PermissionError';
  readonly path: string;
  readonly message: string;
  readonly hint?: string;
}

/**
 * Indicates an error occurred while reading the file (I/O error, encoding issue, etc.).
 */
export interface ReadError {
  readonly _tag: 'ReadError';
  readonly path: string;
  readonly message: string;
  readonly cause?: unknown;
  readonly hint?: string;
}

/**
 * Indicates a path traversal attempt (trying to escape project root with `../`).
 *
 * CRITICAL: Import paths are ALWAYS relative to the `.eligian` file's directory.
 * Paths that navigate outside the project root are ILLEGAL.
 */
export interface SecurityError {
  readonly _tag: 'SecurityError';
  readonly path: string;
  readonly projectRoot: string;
  readonly message: string;
  readonly hint?: string;
}

/**
 * Union type of all file operation errors.
 */
export type FileOperationError = FileNotFoundError | PermissionError | ReadError | SecurityError;

/**
 * Creates a FileNotFoundError with standard message and hint.
 *
 * @param path - Absolute path that was not found
 * @returns FileNotFoundError instance
 */
export function createFileNotFoundError(path: string): FileNotFoundError {
  return {
    _tag: 'FileNotFoundError',
    path,
    message: `File not found: ${path}`,
    hint: 'Check that the file exists and the path is correct',
  };
}

/**
 * Creates a PermissionError with standard message and hint.
 *
 * @param path - Absolute path with permission issue
 * @returns PermissionError instance
 */
export function createPermissionError(path: string): PermissionError {
  return {
    _tag: 'PermissionError',
    path,
    message: `Permission denied: ${path}`,
    hint: 'Ensure the file has read permissions for the current user',
  };
}

/**
 * Creates a ReadError with standard message and hint.
 *
 * @param path - Absolute path where read failed
 * @param cause - Optional original error from fs.readFile
 * @returns ReadError instance
 */
export function createReadError(path: string, cause?: unknown): ReadError {
  return {
    _tag: 'ReadError',
    path,
    message: `Failed to read file: ${path}`,
    cause,
    hint: 'Check that the file is not corrupted and is readable',
  };
}

/**
 * Creates a SecurityError with standard message and hint.
 *
 * @param path - Absolute path that failed security check
 * @param projectRoot - Project root boundary that was violated
 * @returns SecurityError instance
 */
export function createSecurityError(path: string, projectRoot: string): SecurityError {
  return {
    _tag: 'SecurityError',
    path,
    projectRoot,
    message: `Path traversal detected: ${path} is outside project root ${projectRoot}`,
    hint: 'Paths must not escape the project directory using .. segments',
  };
}

/**
 * Type guard to check if an error is a FileNotFoundError.
 *
 * @param error - Error to check
 * @returns True if error is FileNotFoundError
 */
export function isFileNotFoundError(error: unknown): error is FileNotFoundError {
  return (
    typeof error === 'object' &&
    error !== null &&
    '_tag' in error &&
    error._tag === 'FileNotFoundError'
  );
}

/**
 * Type guard to check if an error is a PermissionError.
 *
 * @param error - Error to check
 * @returns True if error is PermissionError
 */
export function isPermissionError(error: unknown): error is PermissionError {
  return (
    typeof error === 'object' &&
    error !== null &&
    '_tag' in error &&
    error._tag === 'PermissionError'
  );
}

/**
 * Type guard to check if an error is a ReadError.
 *
 * @param error - Error to check
 * @returns True if error is ReadError
 */
export function isReadError(error: unknown): error is ReadError {
  return (
    typeof error === 'object' && error !== null && '_tag' in error && error._tag === 'ReadError'
  );
}

/**
 * Type guard to check if an error is a SecurityError.
 *
 * @param error - Error to check
 * @returns True if error is SecurityError
 */
export function isSecurityError(error: unknown): error is SecurityError {
  return (
    typeof error === 'object' && error !== null && '_tag' in error && error._tag === 'SecurityError'
  );
}
