/**
 * Asset validation error hierarchy for Eligian DSL
 *
 * This module defines all error types that occur during asset validation
 * (HTML layouts, CSS stylesheets, media files). All errors use discriminated
 * unions with a `_tag` field for type-safe runtime discrimination.
 *
 * @module errors/asset-errors
 */

import type { SourceLocation } from './base.js';

// ============================================================================
// Shared Base
// ============================================================================

/**
 * Fields shared by every file-import error (HTML/CSS/media).
 *
 * These three errors are structurally identical apart from their `_tag` (and
 * HTML's optional syntax-location fields), so they intersect this base instead
 * of repeating the same five fields three times.
 */
export type FileImportErrorBase = {
  readonly filePath: string; // Relative path from source file
  readonly absolutePath: string; // Resolved absolute path
  readonly message: string;
  readonly location: SourceLocation; // Location of import statement
  readonly hint?: string;
};

// ============================================================================
// HTML Import Errors
// ============================================================================

/**
 * HTML import error - HTML file validation failures
 *
 * Occurs when an imported HTML layout file has syntax errors or is missing.
 *
 * @example
 * ```eligian
 * layout "./missing.html"  // HtmlImportError: File not found
 * layout "./invalid.html"  // HtmlImportError: Unclosed <div> tag
 * ```
 */
export type HtmlImportError = FileImportErrorBase & {
  readonly _tag: 'HtmlImportError';
  readonly line?: number; // Line in HTML file (if syntax error)
  readonly column?: number; // Column in HTML file (if syntax error)
};

// ============================================================================
// CSS Import Errors
// ============================================================================

/**
 * CSS import error - CSS file validation failures
 *
 * Occurs when an imported CSS file has issues (missing, permission denied, etc.)
 * but NOT syntax errors (use CssParseError for syntax errors).
 *
 * @example
 * ```eligian
 * styles "./missing.css"  // CssImportError: File not found
 * ```
 */
export type CssImportError = FileImportErrorBase & {
  readonly _tag: 'CssImportError';
};

/**
 * CSS parse error - CSS syntax errors from PostCSS parser
 *
 * Occurs when an imported CSS file has invalid syntax.
 *
 * @example
 * ```eligian
 * styles "./broken.css"  // CssParseError: Unclosed block at line 5, column 10
 * ```
 */
export type CssParseError = {
  readonly _tag: 'CssParseError';
  readonly filePath: string; // Absolute file path
  readonly message: string;
  readonly line: number; // Line in CSS file where error occurred
  readonly column: number; // Column in CSS file where error occurred
  readonly source?: string; // Source snippet showing error context
  readonly hint?: string;
};

// ============================================================================
// Media Import Errors
// ============================================================================

/**
 * Media import error - media file validation failures
 *
 * Occurs when an imported media file (video, audio, image) is missing or invalid.
 *
 * @example
 * ```eligian
 * provider VideoProvider({src: "./missing.mp4"})  // MediaImportError: File not found
 * ```
 */
export type MediaImportError = FileImportErrorBase & {
  readonly _tag: 'MediaImportError';
};

// ============================================================================
// Asset Error Union
// ============================================================================

/**
 * Union of all asset validation errors
 *
 * These errors occur when validating imported assets (HTML layouts, CSS stylesheets, media files).
 */
export type AssetError = HtmlImportError | CssImportError | CssParseError | MediaImportError;

// ============================================================================
// Constructor Functions (Feature 018 - US1)
// ============================================================================

/**
 * Build a file-import error by tagging a parameter object.
 *
 * Single source of truth for the three structurally identical import-error
 * constructors; each public constructor below is a thin, typed wrapper.
 *
 * @param tag - Discriminator (`HtmlImportError` / `CssImportError` / `MediaImportError`)
 * @param params - Error fields (extends {@link FileImportErrorBase})
 * @returns The tagged error object
 */
function makeImportError<T extends string, P extends FileImportErrorBase>(
  tag: T,
  params: P
): P & { readonly _tag: T } {
  return { _tag: tag, ...params };
}

/**
 * Create an HtmlImportError
 *
 * @param params - Error parameters
 * @returns HtmlImportError object
 */
export function createHtmlImportError(params: {
  filePath: string;
  absolutePath: string;
  message: string;
  location: SourceLocation;
  line?: number;
  column?: number;
  hint?: string;
}): HtmlImportError {
  return makeImportError('HtmlImportError', params);
}

/**
 * Create a CssImportError
 *
 * @param params - Error parameters
 * @returns CssImportError object
 */
export function createCssImportError(params: {
  filePath: string;
  absolutePath: string;
  message: string;
  location: SourceLocation;
  hint?: string;
}): CssImportError {
  return makeImportError('CssImportError', params);
}

/**
 * Create a CssParseError
 *
 * @param params - Error parameters
 * @returns CssParseError object
 */
export function createCssParseError(params: {
  filePath: string;
  message: string;
  line: number;
  column: number;
  source?: string;
  hint?: string;
}): CssParseError {
  return {
    _tag: 'CssParseError',
    filePath: params.filePath,
    message: params.message,
    line: params.line,
    column: params.column,
    source: params.source,
    hint: params.hint,
  };
}

/**
 * Create a MediaImportError
 *
 * @param params - Error parameters
 * @returns MediaImportError object
 */
export function createMediaImportError(params: {
  filePath: string;
  absolutePath: string;
  message: string;
  location: SourceLocation;
  hint?: string;
}): MediaImportError {
  return makeImportError('MediaImportError', params);
}
