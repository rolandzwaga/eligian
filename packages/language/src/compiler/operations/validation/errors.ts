/**
 * Operation validation error types.
 *
 * Extracted verbatim from `operations/validator.ts` (W3 decomposition).
 */

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
