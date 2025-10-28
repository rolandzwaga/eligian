/**
 * Error Types for the Eligius DSL Compiler
 *
 * @deprecated This file is deprecated. Import from '@eligian/language/errors' instead.
 *
 * All error types have been moved to a unified error namespace in
 * `packages/language/src/errors/` for single source of truth (Feature 018 - US3).
 *
 * Migration guide:
 * ```typescript
 * // Before:
 * import { CompileError, ParseError } from './compiler/types/errors.js';
 *
 * // After:
 * import { CompilerError, ParseError } from '@eligian/language/errors';
 * ```
 *
 * Note: `CompileError` has been renamed to `CompilerError` for consistency.
 *
 * This file maintains the original definitions for backwards compatibility.
 * Do NOT import from ../errors/ to avoid circular bundling issues.
 *
 * @module errors
 */

import type { SourceLocation } from './common.js';

/**
 * Union of all possible compilation errors
 *
 * @deprecated Use CompilerError from '@eligian/language/errors' instead
 */
export type CompileError =
  | ParseError
  | ValidationError
  | TypeError
  | TransformError
  | OptimizationError
  | EmitError;

/**
 * Parse error - syntax errors from Langium parser
 *
 * @deprecated Use ParseError from '@eligian/language/errors' instead
 */
export type ParseError = {
  readonly _tag: 'ParseError';
  readonly message: string;
  readonly location: SourceLocation;
  readonly expected?: string;
  readonly actual?: string;
};

/**
 * Validation error - semantic validation failures
 *
 * @deprecated Use ValidationError from '@eligian/language/errors' instead
 */
export type ValidationError = {
  readonly _tag: 'ValidationError';
  readonly kind: ValidationErrorKind;
  readonly message: string;
  readonly location: SourceLocation;
  readonly hint?: string;
};

/**
 * @deprecated Use ValidationErrorKind from '@eligian/language/errors' instead
 */
export type ValidationErrorKind =
  | 'UndefinedReference'
  | 'DuplicateDefinition'
  | 'InvalidScope'
  | 'MissingRequiredField'
  | 'TimelineRequired'
  | 'UniqueEventIds'
  | 'ValidTimeRange'
  | 'NonNegativeTimes'
  | 'ValidActionType'
  | 'TargetRequired'
  | 'ValidSelector'
  | 'ActionNotDefined'
  | 'ParameterArityMismatch';

/**
 * Type error - type checking failures
 *
 * @deprecated Use TypeError from '@eligian/language/errors' instead
 */
export type TypeError = {
  readonly _tag: 'TypeError';
  readonly message: string;
  readonly location: SourceLocation;
  readonly expected: string;
  readonly actual: string;
  readonly hint?: string;
};

/**
 * Transform error - AST → IR transformation failures
 *
 * @deprecated Use TransformError from '@eligian/language/errors' instead
 */
export type TransformError = {
  readonly _tag: 'TransformError';
  readonly kind: TransformErrorKind;
  readonly message: string;
  readonly location: SourceLocation;
  readonly astNode?: string;
};

/**
 * @deprecated Use TransformErrorKind from '@eligian/language/errors' instead
 */
export type TransformErrorKind =
  | 'UnknownNode'
  | 'InvalidTimeline'
  | 'InvalidEvent'
  | 'InvalidAction'
  | 'InvalidExpression'
  | 'InvalidImport'
  | 'ValidationError';

/**
 * Optimization error - should rarely fail
 *
 * @deprecated Use OptimizationError from '@eligian/language/errors' instead
 */
export type OptimizationError = {
  readonly _tag: 'OptimizationError';
  readonly message: string;
  readonly pass: string;
  readonly hint?: string;
};

/**
 * Emit error - IR → Eligius JSON emission failures
 *
 * @deprecated Use EmitError from '@eligian/language/errors' instead
 */
export type EmitError = {
  readonly _tag: 'EmitError';
  readonly message: string;
  readonly ir?: string;
  readonly hint?: string;
};

/**
 * Formatted error for display (CLI, VS Code diagnostics)
 *
 * @deprecated Use FormattedError from '@eligian/language/errors' instead
 */
export type FormattedError = {
  readonly severity: 'error' | 'warning' | 'info';
  readonly message: string;
  readonly location: SourceLocation;
  readonly hint?: string;
  readonly codeSnippet?: string;
  readonly relatedInfo?: ReadonlyArray<RelatedInfo>;
};

/**
 * @deprecated Use RelatedInfo from '@eligian/language/errors' instead
 */
export type RelatedInfo = {
  readonly message: string;
  readonly location: SourceLocation;
};

// Error Constructors
// @deprecated Use constructors from '@eligian/language/errors' instead

/**
 * @deprecated Use createParseError from '@eligian/language/errors' instead
 */
export const createParseError = (
  message: string,
  location: SourceLocation,
  expected?: string,
  actual?: string
): ParseError => ({
  _tag: 'ParseError',
  message,
  location,
  expected,
  actual,
});

/**
 * @deprecated Use createValidationError from '@eligian/language/errors' instead
 */
export const createValidationError = (
  kind: ValidationErrorKind,
  message: string,
  location: SourceLocation,
  hint?: string
): ValidationError => ({
  _tag: 'ValidationError',
  kind,
  message,
  location,
  hint,
});

/**
 * @deprecated Use createTypeError from '@eligian/language/errors' instead
 */
export const createTypeError = (
  message: string,
  location: SourceLocation,
  expected: string,
  actual: string,
  hint?: string
): TypeError => ({
  _tag: 'TypeError',
  message,
  location,
  expected,
  actual,
  hint,
});

/**
 * @deprecated Use createTransformError from '@eligian/language/errors' instead
 */
export const createTransformError = (
  kind: TransformErrorKind,
  message: string,
  location: SourceLocation,
  astNode?: string
): TransformError => ({
  _tag: 'TransformError',
  kind,
  message,
  location,
  astNode,
});

/**
 * @deprecated Use createOptimizationError from '@eligian/language/errors' instead
 */
export const createOptimizationError = (
  message: string,
  pass: string,
  hint?: string
): OptimizationError => ({
  _tag: 'OptimizationError',
  message,
  pass,
  hint,
});

/**
 * @deprecated Use createEmitError from '@eligian/language/errors' instead
 */
export const createEmitError = (message: string, ir?: string, hint?: string): EmitError => ({
  _tag: 'EmitError',
  message,
  ir,
  hint,
});
