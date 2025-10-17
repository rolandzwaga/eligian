/**
 * Type system types for Eligian DSL type checking
 *
 * This module defines the core types used throughout the type system:
 * - EligianType: The primitive types supported by the type system
 * - TypeAnnotation: Represents a type annotation in the AST
 * - TypeConstraint: Represents a type constraint collected during inference
 * - TypeError: Represents a type validation error
 */

/**
 * Primitive types supported by the Eligian type system
 */
export type EligianType =
  | 'string' // String literals and selectors
  | 'number' // Numeric literals (durations, offsets, etc.)
  | 'boolean' // Boolean literals (true, false)
  | 'object' // Object literals ({key: value})
  | 'array' // Array literals ([1, 2, 3])
  | 'unknown'; // Unknown type (opt-out of type checking)

/**
 * Source location information for error reporting
 */
export type SourceLocation = {
  readonly line: number;
  readonly column: number;
  readonly length: number;
};

/**
 * Type annotation from the AST
 */
export type TypeAnnotation = {
  readonly type: EligianType;
  readonly location: SourceLocation;
};

/**
 * Type constraint collected during type inference
 */
export type TypeConstraint = {
  readonly parameter: string; // Parameter name
  readonly expectedType: EligianType; // Expected type from operation signature
  readonly source: string; // Source of constraint (operation name)
  readonly location: SourceLocation; // Location where constraint was collected
};

/**
 * Type validation error
 */
export type TypeError = {
  readonly code: string; // Error code (e.g., 'TYPE_MISMATCH')
  readonly message: string; // Human-readable error message
  readonly hint?: string; // Optional hint for fixing the error
  readonly location: SourceLocation; // Location of the error
};
