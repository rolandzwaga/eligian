/**
 * CSS Service API Contract
 *
 * TypeScript interface definitions for the unified CSS service module.
 * This contract defines the public API that will be implemented in
 * packages/language/src/css/css-service.ts and consumed by the extension.
 *
 * @module css-service
 * @packageDocumentation
 */

// ============================================================================
// URI Types (Platform-Agnostic)
// ============================================================================

/**
 * Platform-agnostic URI representation
 *
 * Avoids dependency on VS Code types in language package.
 */
export interface Uri {
  /** URI scheme (e.g., 'file', 'vscode-webview') */
  readonly scheme: string;

  /** Absolute path or resource path */
  readonly path: string;

  /** String representation of URI */
  toString(): string;
}

// ============================================================================
// Webview URI Conversion
// ============================================================================

/**
 * URI converter for webview contexts
 *
 * Abstracts the conversion of file system URIs to webview-compatible URIs.
 * This allows the CSS rewriter to work with any webview implementation
 * (VS Code, browser, Electron, etc.) without direct coupling.
 *
 * @example
 * ```typescript
 * // VS Code implementation
 * class VSCodeWebviewUriConverter implements WebviewUriConverter {
 *   constructor(private webview: vscode.Webview) {}
 *
 *   convertToWebviewUri(fileUri: Uri): Uri {
 *     const vscodeUri = vscode.Uri.file(fileUri.path);
 *     const webviewUri = this.webview.asWebviewUri(vscodeUri);
 *     return {
 *       scheme: webviewUri.scheme,
 *       path: webviewUri.path,
 *       toString: () => webviewUri.toString()
 *     };
 *   }
 * }
 * ```
 */
export interface WebviewUriConverter {
  /**
   * Convert a file system URI to a webview-compatible URI
   *
   * @param fileUri - File system URI (file:// scheme)
   * @returns Webview-compatible URI (e.g., vscode-webview:// scheme)
   *
   * @remarks
   * - Must preserve path integrity (no data loss)
   * - Must be pure function (same input → same output)
   * - Should handle absolute paths correctly
   */
  convertToWebviewUri(fileUri: Uri): Uri;
}

// ============================================================================
// CSS Parsing (Existing from css-parser.ts)
// ============================================================================

/**
 * Source code location for CSS definitions
 *
 * Used for IDE features (goto definition, error reporting).
 */
export interface CSSSourceLocation {
  /** Absolute path to CSS file */
  filePath: string;

  /** Starting line number (1-indexed) */
  startLine: number;

  /** Starting column number (1-indexed) */
  startColumn: number;

  /** Ending line number (1-indexed) */
  endLine: number;

  /** Ending column number (1-indexed) */
  endColumn: number;
}

/**
 * PostCSS syntax error information
 *
 * Returned when CSS file has parse errors.
 */
export interface CSSParseError {
  /** Error description */
  message: string;

  /** Absolute path to CSS file */
  filePath: string;

  /** Line number of error (1-indexed) */
  line: number;

  /** Column number of error (1-indexed) */
  column: number;

  /** Source code snippet (optional) */
  source?: string;
}

/**
 * Metadata extracted from parsed CSS file
 *
 * Contains all classes, IDs, their locations, rules, and any parse errors.
 *
 * @remarks
 * This interface is already defined in packages/language/src/css/css-parser.ts.
 * The CSS service's parseCSS() function delegates to the existing parser.
 */
export interface CSSParseResult {
  /** CSS class names (e.g., 'button', 'header') */
  classes: Set<string>;

  /** CSS ID names (e.g., 'main', 'nav') */
  ids: Set<string>;

  /** Source locations of class definitions */
  classLocations: Map<string, CSSSourceLocation>;

  /** Source locations of ID definitions */
  idLocations: Map<string, CSSSourceLocation>;

  /** Full CSS rules for each class */
  classRules: Map<string, string>;

  /** Full CSS rules for each ID */
  idRules: Map<string, string>;

  /** PostCSS syntax errors (if any) */
  errors: CSSParseError[];
}

// ============================================================================
// CSS Loading and URL Rewriting
// ============================================================================

/**
 * CSS file loaded and processed for webview injection
 *
 * Contains the CSS content with rewritten url() paths and a stable unique ID.
 */
export interface LoadedCSS {
  /** CSS content with rewritten url() paths */
  content: string;

  /** Stable unique identifier (SHA-256 hash of file path) */
  id: string;
}

// ============================================================================
// CSS Service Functions
// ============================================================================

/**
 * Parse CSS content and extract classes, IDs, locations, and rules
 *
 * @param content - CSS file content as string
 * @param filePath - Absolute file path (for error reporting)
 * @returns Parsed CSS metadata including classes, IDs, locations, rules, and errors
 *
 * @remarks
 * - Delegates to existing css-parser.ts parseCSS() function
 * - Handles malformed CSS gracefully (returns errors, doesn't throw)
 * - Used by language server for CSS validation and IDE features
 *
 * @example
 * ```typescript
 * const cssContent = await fs.readFile('styles.css', 'utf-8');
 * const result = parseCSS(cssContent, '/workspace/styles.css');
 *
 * console.log(result.classes); // Set { 'button', 'header', 'nav' }
 * console.log(result.ids); // Set { 'main', 'app' }
 *
 * if (result.errors.length > 0) {
 *   console.error('Parse errors:', result.errors);
 * }
 * ```
 */
export function parseCSS(content: string, filePath: string): CSSParseResult;

/**
 * Load CSS file and rewrite URLs for webview compatibility
 *
 * @param filePath - Absolute path to CSS file
 * @param converter - Webview URI converter (platform-specific)
 * @returns Promise resolving to LoadedCSS (content + ID)
 * @throws Never - Returns typed errors via Result type pattern
 *
 * @remarks
 * - Uses shared-utils loadFileAsync() for file I/O
 * - Calls rewriteUrls() to convert url() paths to webview URIs
 * - Generates stable ID using SHA-256 hash of file path
 * - Returns Result type (success | FileOperationError)
 *
 * @example
 * ```typescript
 * const converter = new VSCodeWebviewUriConverter(panel.webview);
 * const result = await loadCSS('/workspace/styles.css', converter);
 *
 * if (result.success) {
 *   console.log('Loaded CSS:', result.value.content);
 *   console.log('CSS ID:', result.value.id);
 * } else {
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
export function loadCSS(filePath: string, converter: WebviewUriConverter): Promise<LoadedCSS>;

/**
 * Rewrite CSS url() paths to webview URIs
 *
 * @param css - CSS content
 * @param cssFilePath - Absolute path to CSS file (for resolving relative paths)
 * @param converter - Webview URI converter (platform-specific)
 * @returns CSS with rewritten url() paths
 *
 * @remarks
 * - Uses regex for simplicity and performance (<1ms per file)
 * - Handles relative paths: url('./image.png'), url('../fonts/font.woff')
 * - Skips absolute URLs: http://, https://, data: URIs
 * - Normalizes Windows backslashes to forward slashes
 * - Handles quoted and unquoted URLs: url("file"), url('file'), url(file)
 *
 * **Edge Cases**:
 * - URLs in CSS comments: May be transformed (rare, acceptable)
 * - Multi-line URLs: Not supported (invalid CSS)
 * - Escaped quotes: May not work (invalid CSS)
 *
 * @example
 * ```typescript
 * const css = `
 *   .bg { background: url('./image.png'); }
 *   .font { font-family: url('../fonts/custom.woff2'); }
 *   .external { background: url('https://cdn.com/image.png'); }
 * `;
 *
 * const converter = new VSCodeWebviewUriConverter(webview);
 * const rewritten = rewriteUrls(css, '/workspace/styles/main.css', converter);
 *
 * // Result:
 * // .bg { background: url('vscode-webview://.../styles/image.png'); }
 * // .font { font-family: url('vscode-webview://.../fonts/custom.woff2'); }
 * // .external { background: url('https://cdn.com/image.png'); } // Unchanged
 * ```
 */
export function rewriteUrls(
  css: string,
  cssFilePath: string,
  converter: WebviewUriConverter
): string;

/**
 * Generate stable unique identifier from file path
 *
 * @param filePath - Absolute file path
 * @returns 16-character hex string (SHA-256 hash truncated)
 *
 * @remarks
 * - Uses SHA-256 hash for uniqueness (collision probability negligible)
 * - Truncates to 16 characters for readability (64 bits of entropy)
 * - Stable: same file path always produces same ID
 * - Used as data-css-id attribute in webview <style> tags
 *
 * @example
 * ```typescript
 * const id1 = generateCSSId('/workspace/styles/main.css');
 * const id2 = generateCSSId('/workspace/styles/main.css');
 * console.log(id1 === id2); // true (stable)
 *
 * const id3 = generateCSSId('/workspace/styles/theme.css');
 * console.log(id1 === id3); // false (different paths)
 * ```
 */
export function generateCSSId(filePath: string): string;

// ============================================================================
// Error Types (Re-exported from shared-utils)
// ============================================================================

/**
 * File not found error
 *
 * Returned when CSS file does not exist at specified path.
 */
export interface FileNotFoundError {
  _tag: 'FileNotFoundError';
  path: string;
  message: string;
}

/**
 * Permission denied error
 *
 * Returned when insufficient permissions to read CSS file.
 */
export interface PermissionError {
  _tag: 'PermissionError';
  path: string;
  message: string;
}

/**
 * Read error
 *
 * Returned when file read operation fails for other reasons.
 */
export interface ReadError {
  _tag: 'ReadError';
  path: string;
  message: string;
}

/**
 * Union type of all file operation errors
 */
export type FileOperationError = FileNotFoundError | PermissionError | ReadError;

// ============================================================================
// Result Type (Functional Error Handling)
// ============================================================================

/**
 * Success result
 */
export interface Success<T> {
  success: true;
  value: T;
}

/**
 * Failure result
 */
export interface Failure<E> {
  success: false;
  error: E;
}

/**
 * Result type for operations that can fail
 *
 * Used instead of throwing exceptions (functional programming pattern).
 */
export type Result<T, E> = Success<T> | Failure<E>;

// ============================================================================
// Module Exports
// ============================================================================

/**
 * The CSS service module exports the following:
 *
 * **Functions**:
 * - parseCSS()      - Parse CSS and extract metadata
 * - loadCSS()       - Load CSS file with URL rewriting
 * - rewriteUrls()   - Rewrite CSS url() paths
 * - generateCSSId() - Generate stable CSS file ID
 *
 * **Types**:
 * - Uri                   - Platform-agnostic URI
 * - WebviewUriConverter   - URI converter interface
 * - CSSSourceLocation     - Source location metadata
 * - CSSParseError         - Parse error information
 * - CSSParseResult        - Parsed CSS metadata
 * - LoadedCSS             - Loaded CSS with ID
 * - FileOperationError    - File I/O errors (re-exported from shared-utils)
 * - Result                - Functional error handling type
 *
 * **Usage**:
 * ```typescript
 * import {
 *   parseCSS,
 *   loadCSS,
 *   rewriteUrls,
 *   generateCSSId,
 *   type WebviewUriConverter,
 *   type LoadedCSS,
 *   type FileOperationError
 * } from '@eligian/language';
 * ```
 */
