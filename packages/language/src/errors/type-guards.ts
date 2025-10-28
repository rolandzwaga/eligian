/**
 * Type Guard Functions - Runtime Type Checking for Errors
 *
 * This module provides type guard functions for all error types in the Eligian DSL.
 * Type guards enable safe runtime discrimination of error types using TypeScript's
 * type narrowing.
 *
 * All type guards follow the same pattern:
 * 1. Check if error is an object
 * 2. Check if error has a _tag property
 * 3. Check if _tag matches the expected error type
 *
 * @module errors/type-guards
 */

import type {
  AllErrors,
  AssetError,
  CompilerError,
  CssImportError,
  CssParseError,
  EmitError,
  HtmlImportError,
  IOError,
  MediaImportError,
  OptimizationError,
  ParseError,
  TransformError,
  TypeError,
  ValidationError,
} from './index.js';

// Re-export I/O error type guards from shared-utils
export {
  isFileNotFoundError,
  isPermissionError,
  isReadError,
  isSecurityError,
} from '@eligian/shared-utils';

// ============================================================================
// Compiler Error Type Guards
// ============================================================================

/**
 * Check if error is a ParseError
 *
 * @param error - Error to check
 * @returns True if error is ParseError
 *
 * @example
 * ```typescript
 * if (isParseError(error)) {
 *   console.log(`Expected ${error.expected}, got ${error.actual}`);
 * }
 * ```
 */
export function isParseError(error: unknown): error is ParseError {
  return (
    typeof error === 'object' && error !== null && '_tag' in error && error._tag === 'ParseError'
  );
}

/**
 * Check if error is a ValidationError
 *
 * @param error - Error to check
 * @returns True if error is ValidationError
 *
 * @example
 * ```typescript
 * if (isValidationError(error)) {
 *   console.log(`Validation failed: ${error.kind}`);
 * }
 * ```
 */
export function isValidationError(error: unknown): error is ValidationError {
  return (
    typeof error === 'object' &&
    error !== null &&
    '_tag' in error &&
    error._tag === 'ValidationError'
  );
}

/**
 * Check if error is a TypeError
 *
 * @param error - Error to check
 * @returns True if error is TypeError
 *
 * @example
 * ```typescript
 * if (isTypeError(error)) {
 *   console.log(`Type mismatch: expected ${error.expected}, got ${error.actual}`);
 * }
 * ```
 */
export function isTypeError(error: unknown): error is TypeError {
  return (
    typeof error === 'object' && error !== null && '_tag' in error && error._tag === 'TypeError'
  );
}

/**
 * Check if error is a TransformError
 *
 * @param error - Error to check
 * @returns True if error is TransformError
 *
 * @example
 * ```typescript
 * if (isTransformError(error)) {
 *   console.log(`Transform failed: ${error.kind} at ${error.astNode}`);
 * }
 * ```
 */
export function isTransformError(error: unknown): error is TransformError {
  return (
    typeof error === 'object' &&
    error !== null &&
    '_tag' in error &&
    error._tag === 'TransformError'
  );
}

/**
 * Check if error is an OptimizationError
 *
 * @param error - Error to check
 * @returns True if error is OptimizationError
 *
 * @example
 * ```typescript
 * if (isOptimizationError(error)) {
 *   console.log(`Optimization pass '${error.pass}' failed`);
 * }
 * ```
 */
export function isOptimizationError(error: unknown): error is OptimizationError {
  return (
    typeof error === 'object' &&
    error !== null &&
    '_tag' in error &&
    error._tag === 'OptimizationError'
  );
}

/**
 * Check if error is an EmitError
 *
 * @param error - Error to check
 * @returns True if error is EmitError
 *
 * @example
 * ```typescript
 * if (isEmitError(error)) {
 *   console.log(`Failed to emit JSON: ${error.message}`);
 * }
 * ```
 */
export function isEmitError(error: unknown): error is EmitError {
  return (
    typeof error === 'object' && error !== null && '_tag' in error && error._tag === 'EmitError'
  );
}

/**
 * Check if error is any CompilerError
 *
 * @param error - Error to check
 * @returns True if error is any type of CompilerError
 *
 * @example
 * ```typescript
 * if (isCompilerError(error)) {
 *   // Handle all compiler errors uniformly
 *   console.log(`Compilation failed: ${error.message}`);
 * }
 * ```
 */
export function isCompilerError(error: unknown): error is CompilerError {
  return (
    isParseError(error) ||
    isValidationError(error) ||
    isTypeError(error) ||
    isTransformError(error) ||
    isOptimizationError(error) ||
    isEmitError(error)
  );
}

// ============================================================================
// Asset Error Type Guards
// ============================================================================

/**
 * Check if error is an HtmlImportError
 *
 * @param error - Error to check
 * @returns True if error is HtmlImportError
 *
 * @example
 * ```typescript
 * if (isHtmlImportError(error)) {
 *   console.log(`HTML validation failed: ${error.filePath}`);
 *   if (error.line && error.column) {
 *     console.log(`  at line ${error.line}, column ${error.column}`);
 *   }
 * }
 * ```
 */
export function isHtmlImportError(error: unknown): error is HtmlImportError {
  return (
    typeof error === 'object' &&
    error !== null &&
    '_tag' in error &&
    error._tag === 'HtmlImportError'
  );
}

/**
 * Check if error is a CssImportError
 *
 * @param error - Error to check
 * @returns True if error is CssImportError
 *
 * @example
 * ```typescript
 * if (isCssImportError(error)) {
 *   console.log(`CSS import failed: ${error.filePath}`);
 * }
 * ```
 */
export function isCssImportError(error: unknown): error is CssImportError {
  return (
    typeof error === 'object' &&
    error !== null &&
    '_tag' in error &&
    error._tag === 'CssImportError'
  );
}

/**
 * Check if error is a CssParseError
 *
 * @param error - Error to check
 * @returns True if error is CssParseError
 *
 * @example
 * ```typescript
 * if (isCssParseError(error)) {
 *   console.log(`CSS syntax error at ${error.line}:${error.column}`);
 *   if (error.source) {
 *     console.log(error.source);  // Show source snippet
 *   }
 * }
 * ```
 */
export function isCssParseError(error: unknown): error is CssParseError {
  return (
    typeof error === 'object' && error !== null && '_tag' in error && error._tag === 'CssParseError'
  );
}

/**
 * Check if error is a MediaImportError
 *
 * @param error - Error to check
 * @returns True if error is MediaImportError
 *
 * @example
 * ```typescript
 * if (isMediaImportError(error)) {
 *   console.log(`Media file not found: ${error.filePath}`);
 * }
 * ```
 */
export function isMediaImportError(error: unknown): error is MediaImportError {
  return (
    typeof error === 'object' &&
    error !== null &&
    '_tag' in error &&
    error._tag === 'MediaImportError'
  );
}

/**
 * Check if error is any AssetError
 *
 * @param error - Error to check
 * @returns True if error is any type of AssetError
 *
 * @example
 * ```typescript
 * if (isAssetError(error)) {
 *   // Handle all asset errors uniformly
 *   console.log(`Asset validation failed: ${error.message}`);
 * }
 * ```
 */
export function isAssetError(error: unknown): error is AssetError {
  return (
    isHtmlImportError(error) ||
    isCssImportError(error) ||
    isCssParseError(error) ||
    isMediaImportError(error)
  );
}

// ============================================================================
// I/O Error Type Guard
// ============================================================================

/**
 * Check if error is any IOError
 *
 * @param error - Error to check
 * @returns True if error is any type of IOError
 *
 * @example
 * ```typescript
 * if (isIOError(error)) {
 *   // Handle all I/O errors uniformly
 *   console.log(`File operation failed: ${error.message}`);
 * }
 * ```
 */
export function isIOError(error: unknown): error is IOError {
  return (
    typeof error === 'object' &&
    error !== null &&
    '_tag' in error &&
    (error._tag === 'FileNotFoundError' ||
      error._tag === 'PermissionError' ||
      error._tag === 'ReadError' ||
      error._tag === 'SecurityError')
  );
}

// ============================================================================
// Top-Level Type Guard
// ============================================================================

/**
 * Check if error is any Eligian error
 *
 * @param error - Error to check
 * @returns True if error is any type of Eligian error
 *
 * @example
 * ```typescript
 * if (isEligianError(error)) {
 *   // Handle all Eligian errors uniformly
 *   console.log(`Eligian error: ${error.message}`);
 * } else {
 *   // Unknown error type - rethrow or log
 *   throw error;
 * }
 * ```
 */
export function isEligianError(error: unknown): error is AllErrors {
  return isCompilerError(error) || isAssetError(error) || isIOError(error);
}
