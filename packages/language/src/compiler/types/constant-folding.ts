/**
 * Constant Folding Type Definitions
 *
 * This module defines the data structures used for constant folding optimization
 * in the Eligian compiler. Constant folding replaces references to compile-time
 * constants with their literal values, eliminating unnecessary globalData assignments
 * and reducing generated JSON size.
 *
 * Related: data-model.md in feature specification
 */

/**
 * Represents a resolved constant with its name, value, and type information.
 *
 * Used during AST transformation to track which constants can be inlined
 * and what their literal values are.
 *
 * @example
 * ```typescript
 * const messageConstant: ConstantValue = {
 *   name: 'MESSAGE',
 *   value: 'hello',
 *   type: 'string',
 *   sourceLocation: { line: 1, column: 7, file: 'example.eligian' }
 * };
 * ```
 */
export interface ConstantValue {
  /**
   * The constant's identifier name
   * @example "MESSAGE", "DELAY", "FLAG"
   */
  name: string;

  /**
   * The constant's resolved literal value
   * Must be a JavaScript primitive (string, number, or boolean)
   */
  value: string | number | boolean;

  /**
   * The constant's type (for type preservation during inlining)
   * Ensures string "5" is not confused with number 5
   */
  type: 'string' | 'number' | 'boolean';

  /**
   * Source location (for error reporting)
   * Optional - used for generating helpful compiler errors
   */
  sourceLocation?: {
    line: number;
    column: number;
    file: string;
  };
}

/**
 * A map from constant names to their resolved values.
 *
 * Built during AST traversal by detecting VariableDeclaration nodes
 * with literal or evaluable expression values. Used during transformation
 * to replace variable references with their inlined literal values.
 *
 * **Lifecycle**:
 * 1. Build Phase: During AST traversal, populate map by evaluating const declarations
 * 2. Replace Phase: During transformation, use map to replace variable references
 * 3. Cleanup: Map is discarded after compilation (not persisted)
 *
 * **Properties**:
 * - Key: Constant name (string)
 * - Value: ConstantValue object
 * - Scope: Global only (MVP - no nested scopes)
 * - Immutability: Map is built once during AST traversal, then read-only during transformation
 *
 * @example
 * ```typescript
 * const constantMap: ConstantMap = new Map([
 *   ['MESSAGE', { name: 'MESSAGE', value: 'hello', type: 'string' }],
 *   ['DELAY', { name: 'DELAY', value: 1000, type: 'number' }],
 *   ['ENABLED', { name: 'ENABLED', value: true, type: 'boolean' }]
 * ]);
 * ```
 */
export type ConstantMap = Map<string, ConstantValue>;

/**
 * Result of attempting to evaluate a constant expression at compile time.
 *
 * Used by the expression evaluator (User Story 3) to communicate whether
 * an expression can be safely evaluated at compile time, and if so, what
 * the result value is. If evaluation fails, provides error details.
 *
 * Enables graceful fallback: if an expression can't be evaluated, the
 * constant is treated as a regular variable (no folding, no crash).
 *
 * @example Success case
 * ```typescript
 * const result: ExpressionEvaluationResult = {
 *   canEvaluate: true,
 *   value: 30, // Result of evaluating "10 + 20"
 * };
 * ```
 *
 * @example Failure case
 * ```typescript
 * const result: ExpressionEvaluationResult = {
 *   canEvaluate: false,
 *   error: {
 *     reason: 'Cannot evaluate: references non-constant variable',
 *     expression: 'x + 5', // Where 'x' is a runtime variable
 *     sourceLocation: { line: 5, column: 15, file: 'example.eligian' }
 *   }
 * };
 * ```
 */
export interface ExpressionEvaluationResult {
  /**
   * Whether the expression could be successfully evaluated at compile time
   */
  canEvaluate: boolean;

  /**
   * The evaluated value (if canEvaluate is true)
   * undefined if evaluation failed
   */
  value?: string | number | boolean;

  /**
   * Error information (if canEvaluate is false)
   */
  error?: {
    /** Human-readable error message explaining why evaluation failed */
    reason: string;
    /** The expression that failed to evaluate (for debugging) */
    expression: string;
    /** Source location where the error occurred */
    sourceLocation?: { line: number; column: number; file: string };
  };
}
