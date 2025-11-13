/**
 * Import Path Validator
 *
 * Provides pure validation function for import path format.
 * Enforces relative paths to ensure code portability.
 *
 * Constitution Principle X: Compiler-First Validation
 * - Pure function returning typed errors
 * - Langium validator is thin adapter calling this function
 *
 * @module import-path-validator
 */

import { createValidationError } from '../utils/error-builder.js';
import type { PathError } from './validation-errors.js';
import { ERROR_MESSAGES } from './validation-errors.js';

/**
 * Validates that an import path is relative and portable
 *
 * @param path - File path from import statement (including quotes from DSL source)
 * @returns PathError if invalid, undefined if valid
 *
 * **Validation Rules**:
 * - Path MUST start with `./` or `../` (relative)
 * - Path MUST NOT start with `/` (Unix absolute)
 * - Path MUST NOT match `/^[A-Z]:\\/` (Windows absolute like `C:\`)
 * - Path MUST NOT start with protocol (`http://`, `https://`, `file://`, etc.)
 *
 * **Examples**:
 * ```typescript
 * validateImportPath('./file.html')       // → undefined (valid)
 * validateImportPath('../file.html')      // → undefined (valid)
 * validateImportPath('/file.html')        // → PathError (absolute)
 * validateImportPath('C:\\file.html')     // → PathError (absolute)
 * validateImportPath('https://file')      // → PathError (absolute)
 * ```
 */
export function validateImportPath(path: string): PathError | undefined {
  // Handle undefined/null path (malformed AST from parser errors)
  if (!path) {
    return undefined; // Skip validation - parser error will be reported separately
  }

  // Check if path is relative (starts with ./ or ../)
  if (isRelativePath(path)) {
    return undefined; // Valid
  }

  return createValidationError('ABSOLUTE_PATH', () => ERROR_MESSAGES.ABSOLUTE_PATH, []);
}

/**
 * Checks if a path is relative (starts with ./ or ../)
 *
 * @param path - File path to check
 * @returns true if relative, false if absolute
 */
function isRelativePath(path: string): boolean {
  return path.startsWith('./') || path.startsWith('../');
}

/**
 * Checks if a path is absolute
 *
 * Absolute paths include:
 * - Unix absolute paths (start with `/`)
 * - Windows absolute paths (match `/^[A-Z]:\\/` like `C:\`)
 * - Protocol paths (`http://`, `https://`, `file://`, etc.)
 *
 * @param path - File path to check
 * @returns true if absolute, false if relative
 */
export function isAbsolutePath(path: string): boolean {
  // Unix absolute path (starts with /)
  if (path.startsWith('/')) return true;

  // Windows absolute path (C:\, D:\, etc.)
  // Matches both backslash and forward slash variants
  if (/^[A-Za-z]:[\\/]/.test(path)) return true;

  // Protocol (http://, https://, file://, ftp://, etc.)
  if (/^[a-z]+:\/\//i.test(path)) return true;

  return false;
}
