/**
 * Unified Error Namespace for Eligian DSL
 *
 * This module provides a single source of truth for all error types in the
 * Eligian toolchain. All error types use discriminated unions with a `_tag`
 * field for type-safe runtime discrimination.
 *
 * @module errors
 */

// ============================================================================
// Base Types
// ============================================================================

import type { SourceLocation } from './base.js';

export type { SourceLocation } from './base.js';

// ============================================================================
// Compiler Errors
// ============================================================================

import type { CompilerError } from './compiler-errors.js';

export type {
  CompilerError,
  EmitError,
  OptimizationError,
  ParseError,
  TransformError,
  TransformErrorKind,
  TypeError,
  ValidationError,
  ValidationErrorKind,
} from './compiler-errors.js';

// Export constructor functions (Feature 018 - US1)
export {
  createEmitError,
  createOptimizationError,
  createParseError,
  createTransformError,
  createTypeError,
  createValidationError,
} from './compiler-errors.js';

// ============================================================================
// Asset Errors
// ============================================================================

import type { AssetError } from './asset-errors.js';

export type {
  AssetError,
  CssImportError,
  CssParseError,
  HtmlImportError,
  MediaImportError,
} from './asset-errors.js';

// Export constructor functions (Feature 018 - US1)
export {
  createCssImportError,
  createCssParseError,
  createHtmlImportError,
  createMediaImportError,
} from './asset-errors.js';

// ============================================================================
// I/O Errors (Re-exported from @eligian/shared-utils)
// ============================================================================

import type { IOError } from './io-errors.js';

// Also export individual I/O error types for convenience
export type {
  FileNotFoundError,
  PermissionError,
  ReadError,
  SecurityError,
} from '@eligian/shared-utils';
// Note: I/O error type guards are exported from type-guards.js (see below)
export type { IOError } from './io-errors.js';

// ============================================================================
// All Errors Union
// ============================================================================

/**
 * Union of ALL errors in the Eligian DSL
 *
 * Use this type when you need to handle any error from the entire system.
 * Enables exhaustive pattern matching across all error categories.
 */
export type AllErrors = CompilerError | AssetError | IOError;

// ============================================================================
// Error Formatting Types
// ============================================================================

/**
 * Related information for multi-location errors
 *
 * Used when an error spans multiple locations or has contextual information
 * from other parts of the codebase.
 */
export type RelatedInfo = {
  readonly message: string;
  readonly location: SourceLocation;
};

/**
 * Formatted error for display (CLI, VS Code diagnostics)
 *
 * This type represents an error formatted for human consumption, with
 * optional code snippets and related information.
 */
export type FormattedError = {
  readonly severity: 'error' | 'warning' | 'info';
  readonly message: string;
  readonly location?: SourceLocation;
  readonly hint?: string;
  readonly codeSnippet?: string;
  readonly relatedInfo?: ReadonlyArray<RelatedInfo>;
};

// ============================================================================
// Error Formatters (Feature 018 - US1)
// ============================================================================

export type { VSCodeDiagnostic } from './formatters.js';
export { formatError, formatErrorWithSnippet, formatForVSCode } from './formatters.js';

// ============================================================================
// Type Guards (Feature 018 - US2)
// ============================================================================

export {
  isAssetError,
  isCompilerError,
  isCssImportError,
  isCssParseError,
  isEligianError,
  isEmitError,
  isFileNotFoundError,
  isHtmlImportError,
  isIOError,
  isMediaImportError,
  isOptimizationError,
  isParseError,
  isPermissionError,
  isReadError,
  isSecurityError,
  isTransformError,
  isTypeError,
  isValidationError,
} from './type-guards.js';
