/**
 * Asset Loading Types
 *
 * @deprecated Most types in this file are deprecated. Import from '@eligian/language/errors' instead.
 *
 * Asset error types have been moved to a unified error namespace in
 * `packages/language/src/errors/` for single source of truth (Feature 018 - US3).
 *
 * Migration guide:
 * ```typescript
 * // Before:
 * import { AssetError } from './asset-loading/types.js';
 *
 * // After:
 * import { AssetError, CssImportError, HtmlImportError } from '@eligian/language/errors';
 * ```
 *
 * This file maintains backwards compatibility with old-style interfaces.
 * It will be removed in a future version.
 */

// ============================================================================
// Legacy Asset Error Interface (deprecated)
// ============================================================================

/**
 * @deprecated Use the new AssetError union type from '@eligian/language/errors' instead.
 *
 * This interface represents the old-style asset error format.
 * New code should use the discriminated union types from the unified namespace.
 */
export interface AssetError {
  type: 'missing-file' | 'invalid-html' | 'invalid-css' | 'load-error';
  filePath: string; // Relative path from source
  absolutePath: string; // Resolved absolute path
  sourceLocation: SourceLocation;
  message: string;
  hint: string;
  details?: string;
}

// ============================================================================
// Validation Result Types (still in use)
// ============================================================================

/**
 * HTML validation error
 *
 * @deprecated Consider migrating to CssParseError from '@eligian/language/errors'
 */
export interface HtmlValidationError {
  message: string;
  line: number;
  column: number;
  hint: string;
}

/**
 * CSS validation error
 *
 * @deprecated Consider migrating to CssParseError from '@eligian/language/errors'
 */
export interface CssValidationError {
  message: string;
  line: number;
  column: number;
  hint: string;
}

/**
 * Source location
 *
 * @deprecated Use SourceLocation from '@eligian/language/errors' instead
 */
export interface SourceLocation {
  file: string;
  line: number;
  column: number;
}

/**
 * HTML validation result
 */
export interface HtmlValidationResult {
  valid: boolean;
  errors: HtmlValidationError[];
}

/**
 * CSS validation result
 */
export interface CssValidationResult {
  valid: boolean;
  errors: CssValidationError[];
}

/**
 * Media validation error
 */
export interface MediaValidationError {
  message: string;
  absolutePath: string;
  hint: string;
}

/**
 * Media validation result
 */
export interface MediaValidationResult {
  valid: boolean;
  errors: MediaValidationError[];
}
