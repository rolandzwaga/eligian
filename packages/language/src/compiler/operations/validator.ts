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
// T215: Parameter Type Validation
// ============================================================================

/**
 * Infer the type of an argument expression based on its AST node type.
 *
 * Note: This is compile-time type inference. PropertyChainReferences and
 * expressions resolve at runtime, so we can't fully validate them.
 *
 * @param arg - The argument expression AST node
 * @returns The inferred type string
 */
function inferArgumentType(arg: any): string {
  if (!arg || !arg.$type) return 'unknown';

  switch (arg.$type) {
    case 'StringLiteral':
      return 'string';
    case 'NumberLiteral':
      return 'number';
    case 'BooleanLiteral':
      return 'boolean';
    case 'NullLiteral':
      return 'null';
    case 'ObjectLiteral':
      return 'object';
    case 'ArrayLiteral':
      return 'array';
    case 'PropertyChainReference':
      return 'property-chain'; // Runtime value, can't validate type
    case 'BinaryExpression':
    case 'UnaryExpression':
      return 'expression'; // Runtime evaluation
    default:
      return 'unknown';
  }
}

/**
 * Check if an argument type is compatible with expected parameter type.
 *
 * Compatibility rules:
 * - 'property-chain' and 'expression' are compatible with any type (runtime values)
 * - 'string' matches ParameterType:string or ParameterType:* string types
 * - 'number' matches ParameterType:number or ParameterType:* numeric types
 * - 'boolean' matches ParameterType:boolean
 * - 'object' matches ParameterType:object
 * - 'array' matches ParameterType:array
 * - Constant values must match exactly
 *
 * @param argType - The inferred argument type
 * @param paramType - The expected parameter type from signature
 * @returns True if compatible, false otherwise
 */
function isTypeCompatible(argType: string, paramType: string | any[]): boolean {
  // Runtime values (property chains, expressions) can't be validated at compile time
  if (argType === 'property-chain' || argType === 'expression') {
    return true;
  }

  // Constant values (array of allowed values)
  if (Array.isArray(paramType)) {
    // For constant values, we can only validate literals
    // Property chains and expressions will be validated at runtime
    return true; // Can't validate constant values at compile time without literal value
  }

  // ParameterType validation
  const paramTypeStr = paramType as string;

  // String types
  if (argType === 'string') {
    return paramTypeStr.includes('string') ||
           paramTypeStr.includes('String') ||
           paramTypeStr.includes('className') ||
           paramTypeStr.includes('selector') ||
           paramTypeStr.includes('htmlElementName') ||
           paramTypeStr.includes('actionName') ||
           paramTypeStr.includes('eventName');
  }

  // Number types
  if (argType === 'number') {
    return paramTypeStr.includes('number') ||
           paramTypeStr.includes('Number') ||
           paramTypeStr.includes('numeric') ||
           paramTypeStr.includes('duration');
  }

  // Boolean types
  if (argType === 'boolean') {
    return paramTypeStr.includes('boolean') || paramTypeStr.includes('Boolean');
  }

  // Object types
  if (argType === 'object') {
    return paramTypeStr.includes('object') || paramTypeStr.includes('Object');
  }

  // Array types
  if (argType === 'array') {
    return paramTypeStr.includes('array') || paramTypeStr.includes('Array');
  }

  // Null can match optional parameters
  if (argType === 'null') {
    return true; // Null can be passed to optional parameters
  }

  return false;
}

/**
 * Validate parameter types for an operation call.
 * Checks if argument types match expected parameter types.
 *
 * Note: This performs compile-time validation only. Property chains and
 * expressions that resolve at runtime cannot be fully validated.
 *
 * @param signature - The operation signature from registry
 * @param args - The argument expression AST nodes
 * @returns Array of ParameterTypeError for any type mismatches, empty if valid
 *
 * @example
 * const signature = OPERATION_REGISTRY['addClass'];
 * const args = [{ $type: 'NumberLiteral', value: 123 }]; // Wrong type!
 * const errors = validateParameterTypes(signature, args);
 * // errors[0].message = "Parameter 'className' expects type 'ParameterType:className' but got 'number'"
 */
export function validateParameterTypes(
  signature: OperationSignature,
  args: any[]
): ParameterTypeError[] {
  const errors: ParameterTypeError[] = [];

  // Validate each argument against its corresponding parameter
  for (let i = 0; i < args.length && i < signature.parameters.length; i++) {
    const arg = args[i];
    const param = signature.parameters[i];

    const argType = inferArgumentType(arg);
    const isCompatible = isTypeCompatible(argType, param.type);

    if (!isCompatible) {
      const expectedType = Array.isArray(param.type)
        ? `one of: ${param.type.join(', ')}`
        : param.type;

      errors.push({
        code: 'PARAMETER_TYPE',
        operationName: signature.systemName,
        message: `Parameter '${param.name}' expects type '${expectedType}' but got '${argType}'`,
        parameterIndex: i,
        parameterName: param.name,
        expectedType: expectedType.toString(),
        actualType: argType,
        hint: `Provide a ${expectedType} value for parameter '${param.name}'`
      });
    }
  }

  return errors;
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
