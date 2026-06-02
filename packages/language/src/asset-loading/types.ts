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
 * // The legacy flat `AssetError` interface has been removed. Use the
 * // discriminated union from the unified namespace instead:
 * import { AssetError, CssImportError, HtmlImportError } from '@eligian/language/errors';
 * ```
 *
 * The remaining types here (validation results, SourceLocation) are still in
 * use; they will be migrated to the unified namespace in a future version.
 */

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
 * Generic validation result shape (D24/D44).
 *
 * The HTML, CSS, and media validators all returned a structurally identical
 * `{ valid: boolean; errors: TError[] }` object. This generic is the single
 * source of truth; the per-asset result types below are aliases that only fix
 * the error element type.
 */
export interface ValidationResult<TError> {
  valid: boolean;
  errors: TError[];
}

/**
 * HTML validation result
 */
export type HtmlValidationResult = ValidationResult<HtmlValidationError>;

/**
 * CSS validation result
 */
export type CssValidationResult = ValidationResult<CssValidationError>;

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
export type MediaValidationResult = ValidationResult<MediaValidationError>;
