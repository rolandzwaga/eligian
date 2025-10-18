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
  hasOperation,
  OPERATION_REGISTRY,
  type OperationSignature,
  suggestSimilarOperations,
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
export function validateOperationExists(operationName: string): UnknownOperationError | undefined {
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
    hint:
      suggestions.length > 0
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
  const required = signature.parameters.filter(p => p.required).length;
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
  _required: number,
  _total: number
): string {
  // Sort parameters: required first, then optional
  const sortedParams = [
    ...signature.parameters.filter(p => p.required),
    ...signature.parameters.filter(p => !p.required),
  ];

  const paramNames = sortedParams.map(p => (p.required ? p.name : `[${p.name}]`)).join(', ');

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
    case 'ParameterReference':
    case 'SystemPropertyReference':
    case 'VariableReference':
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
 * - **NEW**: For multi-type parameters (e.g., ['array', 'string']), checks if argument matches ANY of the types
 *
 * @param argType - The inferred argument type
 * @param paramType - The expected parameter type from signature (ParameterType[] or ConstantValue[])
 * @returns True if compatible, false otherwise
 */
function isTypeCompatible(argType: string, paramType: string[] | any[]): boolean {
  // Runtime values (property chains, expressions) can't be validated at compile time
  if (argType === 'property-chain' || argType === 'expression') {
    return true;
  }

  // Check if paramType is an array
  if (Array.isArray(paramType)) {
    // Empty array shouldn't happen, but handle it
    if (paramType.length === 0) {
      return false;
    }

    // Check if it's ConstantValue[] (array of objects)
    if (typeof paramType[0] === 'object' && 'value' in paramType[0]) {
      // For constant values, we can only validate literals at compile time
      // Property chains and expressions will be validated at runtime
      return true; // Can't validate constant values at compile time without literal value
    }

    // It's ParameterType[] - check if argument matches ANY of the types
    for (const singleType of paramType) {
      if (isTypeSingleCompatible(argType, singleType as string)) {
        return true; // Matches at least one type
      }
    }

    return false; // Doesn't match any of the allowed types
  }

  // Fallback: treat as single type string (shouldn't happen with new type system)
  return isTypeSingleCompatible(argType, paramType as string);
}

/**
 * Check if an argument type is compatible with a single ParameterType string.
 * Helper function for isTypeCompatible to reduce duplication.
 */
function isTypeSingleCompatible(argType: string, paramTypeStr: string): boolean {
  // String types
  if (argType === 'string') {
    return (
      paramTypeStr.includes('string') ||
      paramTypeStr.includes('String') ||
      paramTypeStr.includes('className') ||
      paramTypeStr.includes('selector') ||
      paramTypeStr.includes('htmlElementName') ||
      paramTypeStr.includes('actionName') ||
      paramTypeStr.includes('eventName')
    );
  }

  // Number types
  if (argType === 'number') {
    return (
      paramTypeStr.includes('number') ||
      paramTypeStr.includes('Number') ||
      paramTypeStr.includes('numeric') ||
      paramTypeStr.includes('duration')
    );
  }

  // Boolean types
  if (argType === 'boolean') {
    return paramTypeStr.includes('boolean') || paramTypeStr.includes('Boolean');
  }

  // Object types
  if (argType === 'object') {
    return (
      paramTypeStr.includes('object') ||
      paramTypeStr.includes('Object') ||
      paramTypeStr.includes('cssProperties') || // CSS property objects
      paramTypeStr.includes('animationProperties') // Animation property objects
    );
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
      // Format expected type for error message
      let expectedType: string;
      if (Array.isArray(param.type)) {
        // Check if it's ConstantValue[] or ParameterType[]
        if (
          param.type.length > 0 &&
          typeof param.type[0] === 'object' &&
          'value' in param.type[0]
        ) {
          // ConstantValue[]
          expectedType = `one of: ${param.type.map((c: any) => c.value).join(', ')}`;
        } else {
          // ParameterType[] - could be multi-type (e.g., ['array', 'string'])
          expectedType =
            param.type.length === 1
              ? (param.type[0] as string)
              : `${(param.type as string[]).join(' or ')}`;
        }
      } else {
        // Shouldn't happen with new type system, but handle it
        expectedType = param.type as string;
      }

      errors.push({
        code: 'PARAMETER_TYPE',
        operationName: signature.systemName,
        message: `Parameter '${param.name}' expects type '${expectedType}' but got '${argType}'`,
        parameterIndex: i,
        parameterName: param.name,
        expectedType: expectedType.toString(),
        actualType: argType,
        hint: `Provide a ${expectedType} value for parameter '${param.name}'`,
      });
    }
  }

  return errors;
}

// ============================================================================
// T216: Dependency Validation
// ============================================================================

/**
 * Validate that required dependencies are available for an operation.
 * Tracks outputs from previous operations in the action/event.
 *
 * @param signature - The operation signature requiring dependencies
 * @param availableOutputs - Set of output names available from previous operations
 * @returns Array of MissingDependencyError for missing dependencies, empty if valid
 *
 * @example
 * const signature = OPERATION_REGISTRY['addClass'];
 * const available = new Set<string>(); // No outputs yet
 * const errors = validateDependencies(signature, available);
 * // errors[0].message = "Operation 'addClass' requires 'selectedElement' but it is not available"
 *
 * @example
 * const available = new Set(['selectedElement']); // After selectElement()
 * const errors = validateDependencies(signature, available);
 * // errors = [] (no error, dependency satisfied)
 */
export function validateDependencies(
  signature: OperationSignature,
  availableOutputs: Set<string>
): MissingDependencyError[] {
  const errors: MissingDependencyError[] = [];

  // Check each required dependency
  for (const dependency of signature.dependencies) {
    if (!availableOutputs.has(dependency.name)) {
      // Find which operations can provide this dependency
      const providers = findOperationsProvidingOutput(dependency.name);
      const providerHint =
        providers.length > 0
          ? `Call ${providers.slice(0, 3).join(' or ')} first to provide '${dependency.name}'`
          : `No operation in the registry provides '${dependency.name}'`;

      errors.push({
        code: 'MISSING_DEPENDENCY',
        operationName: signature.systemName,
        message: `Operation '${signature.systemName}' requires '${dependency.name}' but it is not available`,
        dependencyName: dependency.name,
        requiredType: dependency.type,
        hint: providerHint,
      });
    }
  }

  return errors;
}

/**
 * Find operations that provide a specific output.
 * Used for generating helpful error hints.
 */
function findOperationsProvidingOutput(outputName: string): string[] {
  const providers: string[] = [];

  for (const [name, signature] of Object.entries(OPERATION_REGISTRY)) {
    if (signature.outputs.some(output => output.name === outputName)) {
      providers.push(name);
    }
  }

  return providers;
}

/**
 * Track available outputs as operations are executed in sequence.
 * Call this after validating each operation to update the available outputs.
 *
 * @param signature - The operation that was just validated
 * @param availableOutputs - The set of currently available outputs (mutated in place)
 *
 * @example
 * const available = new Set<string>();
 * const selectElementSig = OPERATION_REGISTRY['selectElement'];
 *
 * // After selectElement(), selectedElement becomes available
 * trackOutputs(selectElementSig, available);
 * // available now contains 'selectedElement'
 */
export function trackOutputs(signature: OperationSignature, availableOutputs: Set<string>): void {
  for (const output of signature.outputs) {
    availableOutputs.add(output.name);
  }
}

// ============================================================================
// T217: Control Flow Pairing Validation
// ============================================================================

/**
 * Validate control flow pairing for a sequence of operations.
 * Checks that when/endWhen and forEach/endForEach are properly paired.
 * Validates that otherwise appears only between when and endWhen.
 *
 * @param operations - Array of operation names in sequence
 * @returns Array of ControlFlowError for any pairing issues, empty if valid
 *
 * @example
 * const operations = ['when', 'addClass', 'endWhen'];
 * const errors = validateControlFlowPairing(operations);
 * // errors = [] (valid pairing)
 *
 * @example
 * const operations = ['when', 'addClass']; // Missing endWhen
 * const errors = validateControlFlowPairing(operations);
 * // errors[0].issue = 'unclosed'
 *
 * @example
 * const operations = ['addClass', 'endWhen']; // Unmatched endWhen
 * const errors = validateControlFlowPairing(operations);
 * // errors[0].issue = 'unmatched'
 *
 * @example
 * const operations = ['addClass', 'otherwise']; // otherwise outside when block
 * const errors = validateControlFlowPairing(operations);
 * // errors[0].issue = 'invalid_otherwise'
 */
export function validateControlFlowPairing(operations: string[]): ControlFlowError[] {
  const errors: ControlFlowError[] = [];
  const whenStack: number[] = []; // Track indices of unclosed 'when'
  const forEachStack: number[] = []; // Track indices of unclosed 'forEach'

  for (let i = 0; i < operations.length; i++) {
    const op = operations[i];

    switch (op) {
      case 'when':
        whenStack.push(i);
        break;

      case 'endWhen':
        if (whenStack.length === 0) {
          // Unmatched endWhen
          errors.push({
            code: 'CONTROL_FLOW',
            operationName: 'endWhen',
            message: `Unmatched 'endWhen' at position ${i}: no corresponding 'when' found`,
            blockType: 'when',
            issue: 'unmatched',
            hint: `Add a 'when' operation before this 'endWhen'`,
          });
        } else {
          whenStack.pop(); // Matched - remove from stack
        }
        break;

      case 'otherwise':
        // otherwise is only valid inside a when block
        if (whenStack.length === 0) {
          errors.push({
            code: 'CONTROL_FLOW',
            operationName: 'otherwise',
            message: `'otherwise' at position ${i} appears outside a 'when' block`,
            blockType: 'when',
            issue: 'invalid_otherwise',
            hint: `'otherwise' can only appear between 'when' and 'endWhen'`,
          });
        }
        break;

      case 'forEach':
        forEachStack.push(i);
        break;

      case 'endForEach':
        if (forEachStack.length === 0) {
          // Unmatched endForEach
          errors.push({
            code: 'CONTROL_FLOW',
            operationName: 'endForEach',
            message: `Unmatched 'endForEach' at position ${i}: no corresponding 'forEach' found`,
            blockType: 'forEach',
            issue: 'unmatched',
            hint: `Add a 'forEach' operation before this 'endForEach'`,
          });
        } else {
          forEachStack.pop(); // Matched - remove from stack
        }
        break;
    }
  }

  // Check for unclosed blocks at end of sequence
  for (const whenIndex of whenStack) {
    errors.push({
      code: 'CONTROL_FLOW',
      operationName: 'when',
      message: `Unclosed 'when' block starting at position ${whenIndex}: missing 'endWhen'`,
      blockType: 'when',
      issue: 'unclosed',
      hint: `Add 'endWhen' to close this 'when' block`,
    });
  }

  for (const forEachIndex of forEachStack) {
    errors.push({
      code: 'CONTROL_FLOW',
      operationName: 'forEach',
      message: `Unclosed 'forEach' block starting at position ${forEachIndex}: missing 'endForEach'`,
      blockType: 'forEach',
      issue: 'unclosed',
      hint: `Add 'endForEach' to close this 'forEach' block`,
    });
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
export function validateOperation(operationName: string, argumentCount?: number): ValidationResult {
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
