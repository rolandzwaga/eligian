/**
 * Path resolution utilities for Eligian DSL
 *
 * PATH RESOLUTION RULES:
 *
 * 1. Import paths are ALWAYS relative to the `.eligian` file's directory
 *    - The `.eligian` file's directory is the base directory for resolution
 *    - NEVER use process.cwd(), workspace root, or any other directory
 *
 * 2. Paths in `.eligian` files are ALWAYS Unix-style (forward slashes)
 *    - Users write: "./styles/main.css" (always forward slashes, all platforms)
 *    - Backslashes are NEVER valid in `.eligian` source code (syntax error)
 *
 * 3. Parent directory navigation is ALLOWED
 *    - LEGAL: "./header.html" (same directory as .eligian file)
 *    - LEGAL: "./components/button.tsx" (subdirectory)
 *    - LEGAL: "../shared/styles.css" (parent directory)
 *    - LEGAL: "../../templates/header.html" (multiple levels up)
 *    - Paths must start with "./" or "../" (relative paths only)
 *
 * 4. OS-specific path conversion happens internally
 *    - Input: Unix-style path from `.eligian` source (e.g., "./styles/main.css")
 *    - Output: Absolute path normalized to Unix-style (e.g., "/project/src/styles/main.css")
 *    - Conversion to OS-specific format happens in file-loader, not here
 */

import * as path from 'node:path';

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
  // If baseDir is a Windows absolute path, use path.win32.resolve so that
  // parent navigation ('../') and '.' segments are resolved here rather than
  // relying on a downstream normalizePath() call. posix.resolve doesn't
  // recognize drive letters as absolute, hence the dedicated branch.
  if (isWindowsAbsolutePath(baseDir)) {
    // win32.resolve falls back to process.cwd() for an empty segment, so map
    // ''/'.' to baseDir explicitly to preserve the prior behavior.
    const resolved = path.win32.resolve(baseDir, relativePath === '' ? '.' : relativePath);
    // Convert to forward slashes for cross-platform consistency.
    return resolved.replace(/\\/g, '/');
  }

  // For Unix absolute paths, use posix.resolve
  return path.posix.resolve(baseDir, relativePath);
}

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
 * Resolves a relative path to an absolute path.
 *
 * The baseDir parameter MUST be the directory containing the `.eligian` file.
 * This is the ONLY valid base directory for resolving import paths.
 * NEVER use process.cwd(), workspace root, or any other directory as the base.
 *
 * Parent directory navigation is allowed - paths can use "../" to access
 * files in parent directories relative to the `.eligian` file's location.
 *
 * @param relativePath - Relative path from `.eligian` source (Unix-style, must start with "./" or "../")
 * @param baseDir - Absolute path to the `.eligian` file's directory
 * @returns Normalized absolute path (Unix-style, forward slashes)
 *
 * @example
 * ```typescript
 * // Resolve import relative to .eligian file's directory
 * resolvePath('./header.html', '/project/src')
 * // => '/project/src/header.html'
 *
 * // Subdirectory - allowed
 * resolvePath('./components/button.tsx', '/project/src')
 * // => '/project/src/components/button.tsx'
 *
 * // Parent directory - allowed
 * resolvePath('../shared/styles.css', '/project/src')
 * // => '/project/shared/styles.css'
 *
 * // Multiple parent levels - allowed
 * resolvePath('../../templates/header.html', '/project/src/features')
 * // => '/project/templates/header.html'
 * ```
 */
export function resolvePath(relativePath: string, baseDir: string): string {
  // Normalize baseDir first to ensure consistent comparison
  const normalizedBaseDir = normalizePath(baseDir);

  // Resolve the relative path to an absolute path
  // Use custom resolvePaths() to handle both Unix and Windows absolute paths
  const absolutePath = resolvePaths(normalizedBaseDir, relativePath);

  // Normalize to Unix-style path (forward slashes)
  return normalizePath(absolutePath);
}
