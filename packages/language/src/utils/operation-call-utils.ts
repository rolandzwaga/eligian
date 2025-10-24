/**
 * Utility functions for working with OperationCall nodes
 */

import type { OperationCall } from '../generated/ast.js';

/**
 * Get the name from an OperationCall.
 *
 * The grammar guarantees operationName is always present (required field),
 * so we assert it as non-null.
 *
 * @param call - The OperationCall node
 * @returns The operation or action name (always defined)
 */
export function getOperationCallName(call: OperationCall): string {
  return call.operationName!;
}
