/**
 * Error Type Contracts - Complete TypeScript Definitions
 *
 * This file contains the complete error type hierarchy for the Eligian DSL.
 * All errors use discriminated unions with a `_tag` field for type-safe
 * runtime discrimination.
 *
 * @module error-types
 */

// ============================================================================
// Base Types
// ============================================================================

/**
 * Source code location for error reporting
 *
 * Tracks the position of AST nodes or text in source files to provide
 * helpful error messages with line/column information.
 */
export type SourceLocation = {
  readonly file?: string; // Optional - file path or URI
  readonly line: number; // Line number (1-indexed)
  readonly column: number; // Column number (1-indexed)
  readonly length?: number; // Optional - length of the error span
};

// ============================================================================
// Compiler Error Hierarchy
// ============================================================================

/**
 * Parse error - syntax errors from Langium parser
 *
 * Occurs when the DSL source code has invalid syntax that prevents parsing.
 *
 * @example
 * ```eligian
 * // Missing closing brace
 * timeline "Demo" at 0s {
 *   at 0s selectElement("#box")
 * // ParseError: Expected '}' but got EOF
 * ```
 */
export type ParseError = {
  readonly _tag: 'ParseError';
  readonly message: string;
  readonly location: SourceLocation;
  readonly expected?: string; // Expected token/construct
  readonly actual?: string; // Actual token/construct found
};

/**
 * Validation error kinds
 *
 * Each kind represents a specific semantic validation rule violation.
 */
export type ValidationErrorKind =
  | 'UndefinedReference' // Reference to undefined symbol
  | 'DuplicateDefinition' // Duplicate action/timeline/provider
  | 'InvalidScope' // Symbol used in wrong scope
  | 'MissingRequiredField' // Required field missing
  | 'TimelineRequired' // Timeline must have at least one event
  | 'UniqueEventIds' // Event IDs must be unique
  | 'ValidTimeRange' // Start time must be before end time
  | 'NonNegativeTimes' // Times must be non-negative
  | 'ValidActionType' // Action type must be valid
  | 'TargetRequired' // Target selector required
  | 'ValidSelector' // CSS selector must be valid
  | 'ActionNotDefined' // Action referenced before definition
  | 'ParameterArityMismatch'; // Wrong number of arguments

/**
 * Validation error - semantic validation failures
 *
 * Occurs when the DSL syntax is valid but violates semantic rules
 * (undefined references, duplicate definitions, invalid scopes, etc.).
 *
 * @example
 * ```eligian
 * // Undefined action reference
 * timeline "Demo" at 0s {
 *   at 0s fadeIn("#box")  // ValidationError: Action 'fadeIn' not defined
 * }
 * ```
 */
export type ValidationError = {
  readonly _tag: 'ValidationError';
  readonly kind: ValidationErrorKind;
  readonly message: string;
  readonly location: SourceLocation;
  readonly hint?: string;
};

/**
 * Type error - type checking failures
 *
 * Occurs when operation arguments or action parameters have incompatible types.
 *
 * @example
 * ```eligian
 * action bad(selector: number) [
 *   selectElement(selector)  // TypeError: Expected 'string', got 'number'
 * ]
 * ```
 */
export type TypeError = {
  readonly _tag: 'TypeError';
  readonly message: string;
  readonly location: SourceLocation;
  readonly expected: string; // Expected type
  readonly actual: string; // Actual type found
  readonly hint?: string;
};

/**
 * Transform error kinds
 */
export type TransformErrorKind =
  | 'UnknownNode' // AST node type not recognized
  | 'InvalidTimeline' // Timeline structure invalid
  | 'InvalidEvent' // Event structure invalid
  | 'InvalidAction' // Action structure invalid
  | 'InvalidExpression' // Expression cannot be evaluated
  | 'InvalidImport' // Import statement invalid
  | 'ValidationError'; // Validation failed during transform

/**
 * Transform error - AST → IR transformation failures
 *
 * Occurs when the AST cannot be transformed to Eligius intermediate representation.
 *
 * @example
 * // Unknown AST node type (should never happen unless grammar changes)
 * TransformError: Unknown node type 'FutureConstruct'
 */
export type TransformError = {
  readonly _tag: 'TransformError';
  readonly kind: TransformErrorKind;
  readonly message: string;
  readonly location: SourceLocation;
  readonly astNode?: string; // AST node type that failed
};

/**
 * Optimization error - should rarely fail
 *
 * Occurs when an optimization pass encounters an unexpected state.
 * These errors are rare and usually indicate a bug in the optimizer.
 */
export type OptimizationError = {
  readonly _tag: 'OptimizationError';
  readonly message: string;
  readonly pass: string; // Name of the optimization pass that failed
  readonly hint?: string;
};

/**
 * Emit error - IR → Eligius JSON emission failures
 *
 * Occurs when the intermediate representation cannot be serialized to JSON.
 * These errors are rare and usually indicate invalid IR state.
 */
export type EmitError = {
  readonly _tag: 'EmitError';
  readonly message: string;
  readonly ir?: string; // Stringified IR that failed to emit
  readonly hint?: string;
};

/**
 * Union of all compilation errors
 *
 * These errors occur during the compilation pipeline from DSL source to Eligius JSON.
 */
export type CompilerError =
  | ParseError
  | ValidationError
  | TypeError
  | TransformError
  | OptimizationError
  | EmitError;

// ============================================================================
// Asset Error Hierarchy
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

/**
 * Union of all asset validation errors
 *
 * These errors occur when validating imported assets (HTML layouts, CSS stylesheets, media files).
 */
export type AssetError = HtmlImportError | CssImportError | CssParseError | MediaImportError;

// ============================================================================
// I/O Error Hierarchy (Re-exported from @eligian/shared-utils)
// ============================================================================

/**
 * File not found error
 *
 * Re-exported from @eligian/shared-utils for convenience.
 */
export interface FileNotFoundError {
  readonly _tag: 'FileNotFoundError';
  readonly path: string;
  readonly message: string;
  readonly hint?: string;
}

/**
 * Permission denied error
 *
 * Re-exported from @eligian/shared-utils for convenience.
 */
export interface PermissionError {
  readonly _tag: 'PermissionError';
  readonly path: string;
  readonly message: string;
  readonly hint?: string;
}

/**
 * File read error (I/O error, encoding issue, etc.)
 *
 * Re-exported from @eligian/shared-utils for convenience.
 */
export interface ReadError {
  readonly _tag: 'ReadError';
  readonly path: string;
  readonly message: string;
  readonly cause?: unknown;
  readonly hint?: string;
}

/**
 * Security error (path traversal attempt)
 *
 * Re-exported from @eligian/shared-utils for convenience.
 */
export interface SecurityError {
  readonly _tag: 'SecurityError';
  readonly path: string;
  readonly projectRoot: string;
  readonly message: string;
  readonly hint?: string;
}

/**
 * Union of all file I/O errors
 *
 * Re-exported from @eligian/shared-utils for convenience.
 */
export type IOError = FileNotFoundError | PermissionError | ReadError | SecurityError;

// ============================================================================
// All Errors Union
// ============================================================================

/**
 * Union of ALL errors in the Eligian DSL
 *
 * Use this type when you need to handle any error from the entire system.
 */
export type AllErrors = CompilerError | AssetError | IOError;

// ============================================================================
// Error Formatting Types
// ============================================================================

/**
 * Related information for multi-location errors
 */
export type RelatedInfo = {
  readonly message: string;
  readonly location: SourceLocation;
};

/**
 * Formatted error for display (CLI, VS Code diagnostics)
 */
export type FormattedError = {
  readonly severity: 'error' | 'warning' | 'info';
  readonly message: string;
  readonly location?: SourceLocation;
  readonly hint?: string;
  readonly codeSnippet?: string;
  readonly relatedInfo?: ReadonlyArray<RelatedInfo>;
};
