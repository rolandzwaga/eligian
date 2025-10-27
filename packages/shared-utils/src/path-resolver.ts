/**
 * Path resolution utilities for Eligian DSL
 *
 * CRITICAL PATH RESOLUTION RULES (NON-NEGOTIABLE):
 *
 * 1. Import paths are ALWAYS relative to the `.eligian` file's directory
 *    - The `.eligian` file's directory is the ONLY valid base directory
 *    - NEVER use process.cwd(), workspace root, or any other directory
 *
 * 2. Paths in `.eligian` files are ALWAYS Unix-style (forward slashes)
 *    - Users write: "./styles/main.css" (always forward slashes, all platforms)
 *    - Backslashes are NEVER valid in `.eligian` source code (syntax error)
 *
 * 3. Paths that navigate OUT OF the `.eligian` file's directory are ILLEGAL
 *    - LEGAL: "./header.html" (same directory as .eligian file)
 *    - LEGAL: "./components/button.tsx" (subdirectory)
 *    - ILLEGAL: "../outside.html" (navigates OUT OF .eligian file's directory)
 *    - ILLEGAL: "../../etc/passwd" (navigates OUT OF .eligian file's directory)
 *    - The `.eligian` file's directory is the security boundary
 *
 * 4. OS-specific path conversion happens internally
 *    - Input: Unix-style path from `.eligian` source (e.g., "./styles/main.css")
 *    - Output: Absolute path normalized to Unix-style (e.g., "/project/src/styles/main.css")
 *    - Conversion to OS-specific format happens in file-loader, not here
 */

import * as path from 'node:path';
import { createSecurityError, type SecurityError } from './errors.js';

/**
 * Checks if a path is a Windows absolute path (with drive letter).
 * Examples: 'C:/path', 'F:/path', 'C:\\path'
 */
function isWindowsAbsolutePath(filePath: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(filePath);
}

/**
 * Resolves a relative path against a base directory, handling both
 * Unix absolute paths and Windows absolute paths (with drive letters).
 *
 * This is needed because path.posix.resolve() doesn't recognize Windows
 * drive letters as absolute paths.
 */
function resolvePaths(baseDir: string, relativePath: string): string {
  // If baseDir is a Windows absolute path, we need custom handling
  if (isWindowsAbsolutePath(baseDir)) {
    // Manually join the paths since posix.resolve doesn't understand drive letters
    if (relativePath === '' || relativePath === '.') {
      return baseDir;
    }
    // Remove leading ./ from relative path
    const cleanRelative = relativePath.replace(/^\.\//, '');
    // Join with /
    return `${baseDir}/${cleanRelative}`;
  }

  // For Unix absolute paths, use posix.resolve
  return path.posix.resolve(baseDir, relativePath);
}

/**
 * Result of path resolution with security validation.
 */
export type PathResolutionResult =
  | { readonly success: true; readonly absolutePath: string }
  | { readonly success: false; readonly error: SecurityError };

/**
 * Result of security validation.
 */
export type SecurityValidationResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly error: SecurityError };

/**
 * Normalizes a file path to use forward slashes and resolve . and .. segments.
 *
 * This ensures cross-platform consistency by converting Windows-style paths
 * to Unix-style paths that work on all platforms.
 *
 * @param filePath - Path to normalize (can be relative or absolute, Windows or Unix format)
 * @returns Normalized path with forward slashes
 *
 * @example
 * ```typescript
 * normalizePath('C:\\project\\src\\file.css')
 * // => 'C:/project/src/file.css'
 *
 * normalizePath('/project/src/../dist/file.css')
 * // => '/project/dist/file.css'
 * ```
 */
export function normalizePath(filePath: string): string {
  // Use path.normalize() to resolve . and .. segments
  let normalized = path.normalize(filePath);

  // Convert backslashes to forward slashes for cross-platform consistency
  normalized = normalized.replace(/\\/g, '/');

  // Remove trailing slashes (except for root /)
  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
}

/**
 * Validates that an absolute path does not escape the base directory.
 *
 * This prevents path traversal attacks where malicious paths like
 * "../outside.html" attempt to access files outside the `.eligian` file's directory.
 *
 * CRITICAL: The baseDir parameter is the `.eligian` file's directory, which is
 * the security boundary. Paths cannot navigate outside this directory.
 *
 * @param absolutePath - Absolute path to validate (must be normalized)
 * @param baseDir - Absolute path to the `.eligian` file's directory (security boundary)
 * @returns Validation result indicating if path is within bounds
 *
 * @example
 * ```typescript
 * // Valid path within .eligian file's directory
 * validatePathSecurity('/project/src/file.css', '/project/src')
 * // => { valid: true }
 *
 * // Invalid path outside .eligian file's directory
 * validatePathSecurity('/project/outside.html', '/project/src')
 * // => { valid: false, error: SecurityError }
 * ```
 */
export function validatePathSecurity(
  absolutePath: string,
  baseDir: string
): SecurityValidationResult {
  // Normalize both paths to ensure consistent comparison
  const normalizedPath = normalizePath(absolutePath);
  const normalizedBase = normalizePath(baseDir);

  // Check if the path starts with the base directory
  // The path must either be equal to baseDir or be a descendant of it
  if (normalizedPath === normalizedBase || normalizedPath.startsWith(`${normalizedBase}/`)) {
    return { valid: true };
  }

  // Path is outside base directory - security violation
  return {
    valid: false,
    error: createSecurityError(normalizedPath, normalizedBase),
  };
}

/**
 * Resolves a relative path to an absolute path with security validation.
 *
 * CRITICAL: The baseDir parameter MUST be the directory containing the
 * `.eligian` file. This is the ONLY valid base directory for resolving
 * import paths. NEVER use process.cwd(), workspace root, or any other
 * directory as the base.
 *
 * Security: Paths cannot navigate OUT OF the `.eligian` file's directory.
 * The baseDir is the security boundary - only same-directory or subdirectory
 * paths are allowed.
 *
 * @param relativePath - Relative path from `.eligian` source (Unix-style)
 * @param baseDir - Absolute path to the `.eligian` file's directory (security boundary)
 * @returns Resolution result with absolute path or security error
 *
 * @example
 * ```typescript
 * // Resolve import relative to .eligian file's directory
 * resolvePath('./header.html', '/project/src')
 * // => { success: true, absolutePath: '/project/src/header.html' }
 *
 * // Subdirectory - allowed
 * resolvePath('./components/button.tsx', '/project/src')
 * // => { success: true, absolutePath: '/project/src/components/button.tsx' }
 *
 * // Path traversal OUT OF .eligian directory - blocked
 * resolvePath('../outside.html', '/project/src')
 * // => { success: false, error: SecurityError }
 * ```
 */
export function resolvePath(relativePath: string, baseDir: string): PathResolutionResult {
  // Normalize baseDir first to ensure consistent comparison
  const normalizedBaseDir = normalizePath(baseDir);

  // Resolve the relative path to an absolute path
  // Use custom resolvePaths() to handle both Unix and Windows absolute paths
  const absolutePath = resolvePaths(normalizedBaseDir, relativePath);

  // Normalize to Unix-style path (forward slashes)
  const normalizedPath = normalizePath(absolutePath);

  // Validate that the resolved path doesn't escape the baseDir
  // (the .eligian file's directory is the security boundary)
  const validation = validatePathSecurity(normalizedPath, normalizedBaseDir);

  if (!validation.valid) {
    return {
      success: false,
      error: validation.error,
    };
  }

  return {
    success: true,
    absolutePath: normalizedPath,
  };
}
