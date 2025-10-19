/**
 * Operation Registry Module
 *
 * This module provides access to Eligius operation metadata for code completion.
 * It uses lazy loading (singleton pattern) to load metadata only when needed.
 */

import {
  FILTERED_OPERATIONS,
  OPERATIONS,
  type OperationMetadata,
} from './metadata/operations.generated.js';

/**
 * Singleton instance of the operation registry
 */
let operationRegistry: OperationMetadata[] | null = null;

/**
 * Load the operation registry (lazy loading, singleton pattern)
 *
 * This function loads the operation metadata only once and caches it.
 * Subsequent calls return the cached registry.
 *
 * @returns Array of operation metadata
 */
export function loadOperationRegistry(): OperationMetadata[] {
  if (operationRegistry === null) {
    operationRegistry = OPERATIONS;
  }
  return operationRegistry;
}

/**
 * Get all operations (sorted, filtered)
 *
 * Returns the complete list of operations, excluding those handled by DSL keywords.
 * Operations are already sorted alphabetically by name and filtered in the generated file.
 *
 * @returns Array of operation metadata
 */
export function getAllOperations(): OperationMetadata[] {
  return loadOperationRegistry();
}

/**
 * Get a specific operation by name
 *
 * @param name - Operation name (e.g., 'selectElement')
 * @returns Operation metadata if found, undefined otherwise
 */
export function getOperation(name: string): OperationMetadata | undefined {
  const registry = loadOperationRegistry();
  return registry.find(op => op.name === name);
}

/**
 * Check if an operation is filtered (handled by DSL keywords)
 *
 * Filtered operations should not appear in code completion because they
 * are provided as DSL keywords (break, continue, if, else, for).
 *
 * @param name - Operation name to check
 * @returns True if operation is filtered, false otherwise
 */
export function isFilteredOperation(name: string): boolean {
  return FILTERED_OPERATIONS.has(name);
}

/**
 * Get the number of operations in the registry
 *
 * @returns Total number of operations (excluding filtered ones)
 */
export function getOperationCount(): number {
  return loadOperationRegistry().length;
}

/**
 * Reset the registry (for testing purposes)
 *
 * This function clears the cached registry, forcing it to be reloaded
 * on the next call to loadOperationRegistry().
 *
 * @internal
 */
export function resetRegistry(): void {
  operationRegistry = null;
}
