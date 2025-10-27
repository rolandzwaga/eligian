/**
 * Error Types for the Eligius DSL Compiler
 *
 * All compiler errors are typed for pattern matching with Effect.
 * Each pipeline stage has specific error types.
 *
 * @module errors
 */

import type { SourceLocation } from './common.js';

/**
 * Union of all possible compilation errors
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
 */
export type ValidationError = {
  readonly _tag: 'ValidationError';
  readonly kind: ValidationErrorKind;
  readonly message: string;
  readonly location: SourceLocation;
  readonly hint?: string;
};

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
 */
export type TransformError = {
  readonly _tag: 'TransformError';
  readonly kind: TransformErrorKind;
  readonly message: string;
  readonly location: SourceLocation;
  readonly astNode?: string;
};

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
 */
export type OptimizationError = {
  readonly _tag: 'OptimizationError';
  readonly message: string;
  readonly pass: string;
  readonly hint?: string;
};

/**
 * Emit error - IR → Eligius JSON emission failures
 */
export type EmitError = {
  readonly _tag: 'EmitError';
  readonly message: string;
  readonly ir?: string;
  readonly hint?: string;
};

/**
 * Formatted error for display (CLI, VS Code diagnostics)
 */
export type FormattedError = {
  readonly severity: 'error' | 'warning' | 'info';
  readonly message: string;
  readonly location: SourceLocation;
  readonly hint?: string;
  readonly codeSnippet?: string;
  readonly relatedInfo?: ReadonlyArray<RelatedInfo>;
};

export type RelatedInfo = {
  readonly message: string;
  readonly location: SourceLocation;
};

// Error Constructors

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

export const createEmitError = (message: string, ir?: string, hint?: string): EmitError => ({
  _tag: 'EmitError',
  message,
  ir,
  hint,
});
