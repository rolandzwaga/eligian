/**
 * Compiler error hierarchy for Eligian DSL
 *
 * This module defines all error types that occur during the compilation pipeline
 * from DSL source to Eligius JSON configuration. All errors use discriminated
 * unions with a `_tag` field for type-safe runtime discrimination.
 *
 * @module errors/compiler-errors
 */

import type { SourceLocation } from './base.js';

// ============================================================================
// Parse Errors
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

// ============================================================================
// Validation Errors
// ============================================================================

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

// ============================================================================
// Type Errors
// ============================================================================

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

// ============================================================================
// Transform Errors
// ============================================================================

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

// ============================================================================
// Optimization Errors
// ============================================================================

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

// ============================================================================
// Emit Errors
// ============================================================================

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

// ============================================================================
// Compiler Error Union
// ============================================================================

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
// Constructor Functions (Feature 018 - US1)
// ============================================================================

/**
 * Create a ParseError
 *
 * @param params - Error parameters
 * @returns ParseError object
 */
export function createParseError(
  paramsOrMessage:
    | { message: string; location: SourceLocation; expected?: string; actual?: string }
    | string,
  location?: SourceLocation,
  expected?: string,
  actual?: string
): ParseError {
  // Support both old positional API and new object API for backwards compatibility
  if (typeof paramsOrMessage === 'string') {
    return {
      _tag: 'ParseError',
      message: paramsOrMessage,
      location: location!,
      expected,
      actual,
    };
  }
  return {
    _tag: 'ParseError',
    message: paramsOrMessage.message,
    location: paramsOrMessage.location,
    expected: paramsOrMessage.expected,
    actual: paramsOrMessage.actual,
  };
}

/**
 * Create a ValidationError
 *
 * @param params - Error parameters
 * @returns ValidationError object
 */
export function createValidationError(
  paramsOrKind:
    | { kind: ValidationErrorKind; message: string; location: SourceLocation; hint?: string }
    | ValidationErrorKind,
  message?: string,
  location?: SourceLocation,
  hint?: string
): ValidationError {
  // Support both old positional API and new object API
  if (typeof paramsOrKind === 'string') {
    return {
      _tag: 'ValidationError',
      kind: paramsOrKind,
      message: message!,
      location: location!,
      hint,
    };
  }
  return {
    _tag: 'ValidationError',
    kind: paramsOrKind.kind,
    message: paramsOrKind.message,
    location: paramsOrKind.location,
    hint: paramsOrKind.hint,
  };
}

/**
 * Create a TypeError
 *
 * @param params - Error parameters
 * @returns TypeError object
 */
export function createTypeError(
  paramsOrMessage:
    | { message: string; location: SourceLocation; expected: string; actual: string; hint?: string }
    | string,
  location?: SourceLocation,
  expected?: string,
  actual?: string,
  hint?: string
): TypeError {
  // Support both old positional API and new object API
  if (typeof paramsOrMessage === 'string') {
    return {
      _tag: 'TypeError',
      message: paramsOrMessage,
      location: location!,
      expected: expected!,
      actual: actual!,
      hint,
    };
  }
  return {
    _tag: 'TypeError',
    message: paramsOrMessage.message,
    location: paramsOrMessage.location,
    expected: paramsOrMessage.expected,
    actual: paramsOrMessage.actual,
    hint: paramsOrMessage.hint,
  };
}

/**
 * Create a TransformError
 *
 * @param params - Error parameters
 * @returns TransformError object
 */
export function createTransformError(
  paramsOrKind:
    | { kind: TransformErrorKind; message: string; location: SourceLocation; astNode?: string }
    | TransformErrorKind,
  message?: string,
  location?: SourceLocation,
  astNode?: string
): TransformError {
  // Support both old positional API and new object API
  if (typeof paramsOrKind === 'string') {
    return {
      _tag: 'TransformError',
      kind: paramsOrKind,
      message: message!,
      location: location!,
      astNode,
    };
  }
  return {
    _tag: 'TransformError',
    kind: paramsOrKind.kind,
    message: paramsOrKind.message,
    location: paramsOrKind.location,
    astNode: paramsOrKind.astNode,
  };
}

/**
 * Create an OptimizationError
 *
 * @param params - Error parameters
 * @returns OptimizationError object
 */
export function createOptimizationError(params: {
  message: string;
  pass: string;
  hint?: string;
}): OptimizationError {
  return {
    _tag: 'OptimizationError',
    message: params.message,
    pass: params.pass,
    hint: params.hint,
  };
}

/**
 * Create an EmitError
 *
 * @param params - Error parameters
 * @returns EmitError object
 */
export function createEmitError(params: {
  message: string;
  ir?: string;
  hint?: string;
}): EmitError {
  return {
    _tag: 'EmitError',
    message: params.message,
    ir: params.ir,
    hint: params.hint,
  };
}
