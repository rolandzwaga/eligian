/**
 * Operation Parameter Mapping
 *
 * This module handles mapping DSL operation calls to Eligius operation configuration format.
 * It converts positional arguments to named parameters and wraps parameters in required
 * wrapper objects per Eligius spec.
 *
 * BUG-001 FIX (T323): Arguments are now pre-transformed JsonValue instead of Expression AST.
 * The transformer handles all reference resolution (@@varName, @varName, paramName) before
 * passing values to the mapper, greatly simplifying this module.
 *
 * @module mapper
 */

import type { JsonValue } from '../types/eligius-ir.js';
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
 * BUG-001 FIX (T323): Arguments are now pre-transformed JsonValue instead of Expression AST.
 *
 * This function:
 * 1. Maps positional arguments to parameter names from signature
 * 2. Handles optional parameters (fills with default values or undefined)
 * 3. Returns object with named parameters for Eligius runtime
 *
 * @param signature - Operation signature from registry
 * @param args - Pre-transformed positional arguments (JsonValue[])
 * @returns Mapping result with named parameters or errors
 *
 * @example
 * const signature = { parameters: [{ name: 'className', required: true }] };
 * const args = ["active"];  // Pre-transformed JsonValue
 * const result = mapPositionalToNamed(signature, args);
 * // result.operationData = { className: 'active' }
 */
export function mapPositionalToNamed(
  signature: OperationSignature,
  args: JsonValue[]
): MappingResult {
  const errors: MappingError[] = [];
  const operationData: Record<string, unknown> = {};

  // Map each positional argument to its corresponding parameter name
  for (let i = 0; i < signature.parameters.length; i++) {
    const param = signature.parameters[i];
    const arg = args[i];

    if (arg !== undefined) {
      // Argument provided - already transformed to JsonValue, just use it
      operationData[param.name] = arg;
    } else if (param.defaultValue !== undefined) {
      // No argument, but parameter has default value
      operationData[param.name] = param.defaultValue;
    } else if (!param.required) {
      // Optional parameter with no default - omit from operationData
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
 * BUG-001 FIX (T323): extractArgumentValue() and resolvePropertyChain() removed.
 *
 * These functions are no longer needed because arguments are now pre-transformed
 * to JsonValue by the transformer before being passed to the mapper.
 *
 * All reference resolution (@@varName, @varName, paramName) now happens in
 * ast-transformer.ts via transformExpression(), which properly handles scope context.
 */

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
 * BUG-001 FIX (T323): Arguments are now pre-transformed JsonValue instead of Expression AST.
 *
 * Combines positional-to-named mapping and wrapper generation.
 *
 * @param signature - Operation signature from registry
 * @param args - Pre-transformed positional arguments (JsonValue[])
 * @returns Mapping result with wrapped operation data
 *
 * @example
 * const signature = getOperationSignature('addClass');
 * const args = ["active"];  // Pre-transformed JsonValue
 * const result = mapParameters(signature, args);
 * // result.operationData = { className: 'active' }
 */
export function mapParameters(signature: OperationSignature, args: JsonValue[]): MappingResult {
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
