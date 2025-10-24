/**
 * Utility functions for working with OperationCall nodes
 */

import type { OperationCall } from '../generated/ast.js';

/**
 * Get the name from an OperationCall.
 *
 * After Feature 007, operationName is a cross-reference (Reference<ActionDefinition>).
 * This function extracts the string name from the reference using $refText.
 *
 * Works for both:
 * - Custom action calls: ref resolves to ActionDefinition
 * - Built-in operations: ref is undefined
 *
 * @param call - The OperationCall node
 * @returns The operation or action name string (always defined)
 */
export function getOperationCallName(call: OperationCall): string {
  return call.operationName.$refText;
}

/**
 * Check if an OperationCall is a custom action call.
 *
 * Returns true if the operationName reference resolved to an ActionDefinition,
 * false if it's a built-in operation (ref is undefined).
 *
 * @param call - The OperationCall node
 * @returns True if custom action call, false if built-in operation
 */
export function isCustomActionCall(call: OperationCall): boolean {
  return call.operationName.ref !== undefined;
}
