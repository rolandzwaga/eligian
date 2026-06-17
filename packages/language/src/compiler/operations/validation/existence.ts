/**
 * T213: Operation existence validation.
 *
 * Extracted verbatim from `operations/validator.ts` (W3 decomposition).
 */

import { hasOperation, OPERATION_REGISTRY, suggestSimilarOperations } from '../index.js';
import type { UnknownOperationError } from './errors.js';

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
export function getAllOperationNames(): string[] {
  return Object.keys(OPERATION_REGISTRY).sort();
}
