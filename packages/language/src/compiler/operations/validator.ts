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
 *
 * This module is the composition root: each stage lives in a focused module
 * under `validation/` and is re-exported here so existing importers (and the
 * `compiler/index.ts` barrel) are unchanged (W3 decomposition).
 */

import { OPERATION_REGISTRY, type OperationSignature } from './index.js';
import type { OperationValidationError } from './validation/errors.js';
import { validateOperationExists } from './validation/existence.js';
import { validateParameterCount } from './validation/parameter-count.js';

export { validateControlFlowPairing } from './validation/control-flow.js';
export { trackOutputs, validateDependencies } from './validation/dependencies.js';
// Re-export the decomposed validation stages and error types.
export type {
  ControlFlowError,
  MissingDependencyError,
  ParameterCountError,
  ParameterTypeError,
  UnknownOperationError,
  ValidationError,
} from './validation/errors.js';
export { validateOperationExists } from './validation/existence.js';
export { validateParameterCount } from './validation/parameter-count.js';
export { validateParameterTypes } from './validation/parameter-types.js';

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
