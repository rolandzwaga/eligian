/**
 * Operation Parameter Mapping
 *
 * This module handles mapping DSL operation calls to Eligius operation configuration format.
 * It converts positional arguments to named parameters, resolves property chain references,
 * and wraps parameters in required wrapper objects per Eligius spec.
 *
 * @module mapper
 */

import type { Expression, PropertyChainReference } from '../../generated/ast.js';
import type { OperationSignature } from './types.js';

/**
 * Result of parameter mapping operation.
 */
export interface MappingResult {
  /** Whether mapping succeeded */
  success: boolean;
  /** Mapped parameters as key-value pairs (success case) */
  operationData?: Record<string, unknown>;
  /** Error messages (failure case) */
  errors: MappingError[];
}

/**
 * Error during parameter mapping.
 */
export interface MappingError {
  code: 'MAPPING_ERROR';
  message: string;
  parameterName?: string;
  hint?: string;
}

/**
 * Map positional arguments to named parameters using operation signature.
 *
 * This function:
 * 1. Maps positional arguments to parameter names from signature
 * 2. Handles optional parameters (fills with default values or undefined)
 * 3. Returns object with named parameters for Eligius runtime
 *
 * @param signature - Operation signature from registry
 * @param args - Positional arguments from DSL
 * @returns Mapping result with named parameters or errors
 *
 * @example
 * const signature = { parameters: [{ name: 'className', required: true }, { name: 'useCapture', required: false, defaultValue: false }] };
 * const args = [{ $type: 'StringLiteral', value: 'active' }];
 * const result = mapPositionalToNamed(signature, args);
 * // result.operationData = { className: 'active', useCapture: false }
 */
export function mapPositionalToNamed(
  signature: OperationSignature,
  args: Expression[]
): MappingResult {
  const errors: MappingError[] = [];
  const operationData: Record<string, unknown> = {};

  // Map each positional argument to its corresponding parameter name
  for (let i = 0; i < signature.parameters.length; i++) {
    const param = signature.parameters[i];
    const arg = args[i];

    if (arg !== undefined) {
      // Argument provided - extract value and map to parameter name
      const value = extractArgumentValue(arg);
      operationData[param.name] = value;
    } else if (param.defaultValue !== undefined) {
      // No argument, but parameter has default value
      operationData[param.name] = param.defaultValue;
    } else if (!param.required) {
    } else {
      // Required parameter missing (should have been caught by validator)
      errors.push({
        code: 'MAPPING_ERROR',
        message: `Required parameter '${param.name}' is missing`,
        parameterName: param.name,
        hint: `Provide value for parameter '${param.name}'`,
      });
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return { success: true, operationData, errors: [] };
}

/**
 * Extract runtime value from DSL argument AST node.
 *
 * Handles:
 * - String literals → string
 * - Number literals → number
 * - Boolean literals → boolean
 * - Object literals → Record<string, unknown>
 * - Array literals → unknown[]
 * - Property chains → "scope.foo" string format for Eligius runtime
 *
 * @param arg - Argument AST node
 * @returns Runtime value
 */
function extractArgumentValue(arg: Expression): unknown {
  switch (arg.$type) {
    case 'StringLiteral':
      return arg.value;

    case 'NumberLiteral':
      return arg.value;

    case 'BooleanLiteral':
      return arg.value;

    case 'ObjectLiteral': {
      const obj: Record<string, unknown> = {};
      for (const prop of arg.properties) {
        obj[prop.key] = extractArgumentValue(prop.value);
      }
      return obj;
    }

    case 'ArrayLiteral':
      return arg.elements.map(extractArgumentValue);

    case 'PropertyChainReference':
      // Convert property chain to Eligius runtime string format
      return resolvePropertyChain(arg);

    default:
      // Unknown argument type - return undefined
      return undefined;
  }
}

/**
 * Resolve property chain to Eligius runtime string format.
 *
 * Converts:
 * - $scope.foo → "scope.foo"
 * - $operationdata.bar → "operationdata.bar"
 * - $globaldata.baz → "globaldata.baz"
 *
 * This string format is used by Eligius runtime for dynamic value resolution.
 *
 * @param chain - Property chain AST node
 * @returns Eligius runtime string (e.g., "scope.foo")
 *
 * @example
 * resolvePropertyChain($scope.currentItem) // "scope.currentItem"
 * resolvePropertyChain($operationdata.name) // "operationdata.name"
 */
export function resolvePropertyChain(chain: PropertyChainReference): string {
  // Property chain format: $scope.property1.property2...
  // We want: "scope.property1.property2..."

  // Build chain by concatenating scope and properties
  const scope = chain.scope; // e.g., 'scope', 'operationdata', 'globaldata'
  const properties = chain.properties; // e.g., ['currentItem'], ['name']

  // Join with dots
  return [scope, ...properties].join('.');
}

/**
 * Generate wrapper object for operation parameters according to Eligius spec.
 *
 * Some Eligius operations require parameters to be wrapped in specific objects.
 * This function handles that wrapping based on operation signature metadata.
 *
 * Note: This is currently a placeholder. Wrapper requirements will be documented
 * in operation signatures once we analyze Eligius operation metadata more thoroughly.
 *
 * @param signature - Operation signature
 * @param operationData - Named parameters from mapPositionalToNamed
 * @returns Wrapped operation data (or original if no wrapping needed)
 *
 * @example
 * // For animate operation:
 * // Input: { properties: { opacity: 1 }, duration: 500, easing: 'ease' }
 * // Output: { animationProperties: { opacity: 1 }, animationDuration: 500, animationEasing: 'ease' }
 */
export function wrapParameters(
  _signature: OperationSignature,
  operationData: Record<string, unknown>
): Record<string, unknown> {
  // TODO: Implement wrapper logic based on operation signature metadata
  // For now, return operationData as-is
  // This will be enhanced once we document wrapper requirements in operation signatures

  return operationData;
}

/**
 * Complete parameter mapping pipeline.
 *
 * Combines positional-to-named mapping and wrapper generation.
 *
 * @param signature - Operation signature from registry
 * @param args - Positional arguments from DSL
 * @returns Mapping result with wrapped operation data
 *
 * @example
 * const signature = getOperationSignature('addClass');
 * const args = [{ $type: 'StringLiteral', value: 'active' }];
 * const result = mapParameters(signature, args);
 * // result.operationData = { className: 'active' }
 */
export function mapParameters(signature: OperationSignature, args: Expression[]): MappingResult {
  // Step 1: Map positional to named
  const mappingResult = mapPositionalToNamed(signature, args);

  if (!mappingResult.success || !mappingResult.operationData) {
    return mappingResult;
  }

  // Step 2: Wrap parameters if needed
  const wrappedData = wrapParameters(signature, mappingResult.operationData);

  return {
    success: true,
    operationData: wrappedData,
    errors: [],
  };
}
