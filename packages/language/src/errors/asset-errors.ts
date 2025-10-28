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
export type HtmlImportError = {
  readonly _tag: 'HtmlImportError';
  readonly filePath: string; // Relative path from source file
  readonly absolutePath: string; // Resolved absolute path
  readonly message: string;
  readonly location: SourceLocation; // Location of import statement
  readonly line?: number; // Line in HTML file (if syntax error)
  readonly column?: number; // Column in HTML file (if syntax error)
  readonly hint?: string;
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
export type CssImportError = {
  readonly _tag: 'CssImportError';
  readonly filePath: string; // Relative path from source file
  readonly absolutePath: string; // Resolved absolute path
  readonly message: string;
  readonly location: SourceLocation; // Location of import statement
  readonly hint?: string;
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
export type MediaImportError = {
  readonly _tag: 'MediaImportError';
  readonly filePath: string; // Relative path from source file
  readonly absolutePath: string; // Resolved absolute path
  readonly message: string;
  readonly location: SourceLocation; // Location of import/reference
  readonly hint?: string;
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
  return {
    _tag: 'HtmlImportError',
    filePath: params.filePath,
    absolutePath: params.absolutePath,
    message: params.message,
    location: params.location,
    line: params.line,
    column: params.column,
    hint: params.hint,
  };
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
  return {
    _tag: 'CssImportError',
    filePath: params.filePath,
    absolutePath: params.absolutePath,
    message: params.message,
    location: params.location,
    hint: params.hint,
  };
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
  return {
    _tag: 'MediaImportError',
    filePath: params.filePath,
    absolutePath: params.absolutePath,
    message: params.message,
    location: params.location,
    hint: params.hint,
  };
}
