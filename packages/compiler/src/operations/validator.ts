/**
 * Operation Validator
 *
 * Validates operation calls against the operation registry.
 * Provides detailed error messages with suggestions for common mistakes.
 *
 * Validation stages:
 * 1. Operation existence (T213)
 * 2. Parameter count (T214)
 * 3. Parameter types (T215)
 * 4. Dependencies (T216)
 * 5. Control flow pairing (T217)
 */

import {
  OPERATION_REGISTRY,
  suggestSimilarOperations,
  hasOperation,
  type OperationSignature,
} from './index.js';

// ============================================================================
// Error Types
// ============================================================================

/**
 * Base validation error
 */
export interface ValidationError {
  code: string;
  message: string;
  operationName: string;
  hint?: string;
}

/**
 * Unknown operation error (operation doesn't exist in registry)
 */
export interface UnknownOperationError extends ValidationError {
  code: 'UNKNOWN_OPERATION';
  suggestions: string[];
}

/**
 * Parameter count error (wrong number of arguments)
 */
export interface ParameterCountError extends ValidationError {
  code: 'PARAMETER_COUNT';
  expected: { min: number; max: number };
  actual: number;
}

/**
 * Parameter type error (argument type doesn't match expected type)
 */
export interface ParameterTypeError extends ValidationError {
  code: 'PARAMETER_TYPE';
  parameterIndex: number;
  parameterName: string;
  expectedType: string;
  actualType: string;
}

/**
 * Missing dependency error (required dependency not available)
 */
export interface MissingDependencyError extends ValidationError {
  code: 'MISSING_DEPENDENCY';
  dependencyName: string;
  requiredType: string;
}

/**
 * Control flow error (mismatched when/endWhen, forEach/endForEach)
 */
export interface ControlFlowError extends ValidationError {
  code: 'CONTROL_FLOW';
  blockType: 'when' | 'forEach';
  issue: 'unclosed' | 'unmatched' | 'invalid_otherwise';
}

/**
 * Union of all validation error types
 */
export type OperationValidationError =
  | UnknownOperationError
  | ParameterCountError
  | ParameterTypeError
  | MissingDependencyError
  | ControlFlowError;

// ============================================================================
// T213: Operation Existence Validation
// ============================================================================

/**
 * Check if an operation exists in the registry.
 * Returns an error with typo suggestions if not found.
 *
 * @param operationName - The operation name to validate
 * @returns UnknownOperationError if operation doesn't exist, undefined otherwise
 *
 * @example
 * const error = validateOperationExists('adClass'); // typo
 * // error.suggestions = ['addClass', 'toggleClass', 'removeClass']
 */
export function validateOperationExists(
  operationName: string
): UnknownOperationError | undefined {
  if (hasOperation(operationName)) {
    return undefined; // Operation exists, no error
  }

  // Operation doesn't exist - provide suggestions
  const suggestions = suggestSimilarOperations(operationName, 3);

  const error: UnknownOperationError = {
    code: 'UNKNOWN_OPERATION',
    operationName,
    message: `Unknown operation: "${operationName}"`,
    suggestions,
    hint: suggestions.length > 0
      ? `Did you mean: ${suggestions.join(', ')}?`
      : `Available operations: ${getAllOperationNames().slice(0, 5).join(', ')}, ...`,
  };

  return error;
}

/**
 * Get all available operation names (sorted)
 */
function getAllOperationNames(): string[] {
  return Object.keys(OPERATION_REGISTRY).sort();
}

// ============================================================================
// T214: Parameter Count Validation
// ============================================================================

/**
 * Validate parameter count for an operation.
 * Checks if the number of arguments matches required/optional parameters.
 *
 * @param signature - The operation signature from registry
 * @param argumentCount - The number of arguments provided
 * @returns ParameterCountError if count is invalid, undefined otherwise
 *
 * @example
 * const signature = OPERATION_REGISTRY['addClass'];
 * const error = validateParameterCount(signature, 0); // Error: requires 1 parameter
 */
export function validateParameterCount(
  signature: OperationSignature,
  argumentCount: number
): ParameterCountError | undefined {
  const required = signature.parameters.filter((p) => p.required).length;
  const total = signature.parameters.length;

  // Check if argument count is within valid range
  if (argumentCount < required || argumentCount > total) {
    const error: ParameterCountError = {
      code: 'PARAMETER_COUNT',
      operationName: signature.systemName,
      message: `Operation "${signature.systemName}" expects ${formatParameterCount(required, total)} parameter(s), but got ${argumentCount}`,
      expected: { min: required, max: total },
      actual: argumentCount,
      hint: formatParameterHint(signature, required, total),
    };
    return error;
  }

  return undefined;
}

/**
 * Format parameter count for error message
 */
function formatParameterCount(required: number, total: number): string {
  if (required === total) {
    return `${required}`; // "expects 2 parameters"
  } else {
    return `${required}-${total}`; // "expects 1-3 parameters"
  }
}

/**
 * Generate helpful hint for parameter count errors.
 * Shows required parameters first, then optional parameters in brackets.
 */
function formatParameterHint(
  signature: OperationSignature,
  required: number,
  total: number
): string {
  // Sort parameters: required first, then optional
  const sortedParams = [
    ...signature.parameters.filter(p => p.required),
    ...signature.parameters.filter(p => !p.required),
  ];

  const paramNames = sortedParams.map((p) =>
    p.required ? p.name : `[${p.name}]`
  ).join(', ');

  return `Expected: ${signature.systemName}(${paramNames})`;
}

// ============================================================================
// Validation Result
// ============================================================================

/**
 * Result of validating an operation call.
 * Contains either the operation signature (success) or validation errors.
 */
export type ValidationResult =
  | { success: true; signature: OperationSignature }
  | { success: false; errors: OperationValidationError[] };

/**
 * Validate an operation call (name and parameter count).
 * More validation stages will be added in T215-T217.
 *
 * @param operationName - The operation name to validate
 * @param argumentCount - The number of arguments provided (optional, for T214)
 * @returns ValidationResult with signature or errors
 *
 * @example
 * const result = validateOperation('addClass', 1);
 * if (result.success) {
 *   console.log(result.signature.parameters);
 * } else {
 *   console.error(result.errors);
 * }
 */
export function validateOperation(
  operationName: string,
  argumentCount?: number
): ValidationResult {
  const errors: OperationValidationError[] = [];

  // T213: Check operation exists
  const existenceError = validateOperationExists(operationName);
  if (existenceError) {
    errors.push(existenceError);
    return { success: false, errors };
  }

  // Operation exists - get signature
  const signature = OPERATION_REGISTRY[operationName];

  // T214: Check parameter count (if provided)
  if (argumentCount !== undefined) {
    const countError = validateParameterCount(signature, argumentCount);
    if (countError) {
      errors.push(countError);
    }
  }

  // T215-T217 will add more validation stages here

  // Return errors if any, otherwise success
  if (errors.length > 0) {
    return { success: false, errors };
  }

  return { success: true, signature };
}
