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
 * Checks if a path is a Windows absolute path with a drive letter.
 * Examples: 'C:/path', 'F:/path', 'C:\\path', and bare drive roots ('C:/', 'C:\\').
 */
function isWindowsAbsolutePath(filePath: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(filePath);
}

/**
 * Matches the `//server/share` prefix of a UNC path (either slash style). A leading
 * `///` is NOT a UNC path (it is a rooted POSIX path with redundant slashes).
 */
const UNC_PREFIX = /^[\\/]{2}(?![\\/])([^\\/]+)[\\/]+([^\\/]+)/;

function isUncPath(filePath: string): boolean {
  return UNC_PREFIX.test(filePath);
}

/**
 * Resolves a relative path against a base directory, handling Unix absolute paths,
 * Windows drive-letter paths and UNC paths.
 *
 * posix.resolve() recognizes neither drive letters nor UNC roots, so those bases are
 * resolved with path.win32.resolve (which is pure string logic and host independent).
 */
function resolvePaths(baseDir: string, relativePath: string): string {
  if (isWindowsAbsolutePath(baseDir) || isUncPath(baseDir)) {
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
 * This is host-OS independent: backslashes are converted first and the result is
 * normalized with path.posix, so `C:\\a\\..\\b` normalizes identically on Windows and POSIX.
 * Drive roots (`C:/`) and UNC prefixes (`//server/share`) are preserved.
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
 *
 * normalizePath('\\\\server\\share\\a\\..\\b')
 * // => '//server/share/b'
 * ```
 */
export function normalizePath(filePath: string): string {
  const slashed = filePath.replace(/\\/g, '/');

  // Split off a root prefix that posix.normalize would mangle (UNC) or not treat as a root (drive).
  let prefix = '';
  let rest = slashed;
  const unc = UNC_PREFIX.exec(slashed);
  if (unc) {
    prefix = `//${unc[1]}/${unc[2]}`;
    rest = slashed.slice(unc[0].length);
    if (rest === '') rest = '/';
  } else if (/^[a-zA-Z]:\//.test(slashed)) {
    prefix = slashed.slice(0, 2);
    rest = slashed.slice(2);
  }

  // A rooted remainder can never escape its root ('/..' => '/'), which is the right
  // behavior for drive and UNC roots as well.
  let normalized = path.posix.normalize(rest);

  // Remove trailing slashes (except for a root: '/', 'C:/', '//server/share/')
  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }

  return prefix + normalized;
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
