/**
 * T214: Parameter count validation.
 *
 * Extracted verbatim from `operations/validator.ts` (W3 decomposition).
 */

import type { OperationSignature } from '../index.js';
import type { ParameterCountError } from './errors.js';

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
