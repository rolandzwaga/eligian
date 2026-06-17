/**
 * T215: Parameter type validation.
 *
 * Extracted verbatim from `operations/validator.ts` (W3 decomposition); the
 * one pre-existing `useOptionalChain` warning on `inferArgumentType` was fixed
 * during the move (behavior-equivalent — `$type` is a plain property).
 */

import type { OperationSignature } from '../index.js';
import type { ParameterTypeError } from './errors.js';

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
  if (!arg?.$type) return 'unknown';

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
