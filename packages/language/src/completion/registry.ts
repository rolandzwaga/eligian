/**
 * Operation Registry Module
 *
 * This module provides access to Eligius operation metadata for code completion.
 * It uses lazy loading (singleton pattern) to load metadata only when needed.
 */

import { CONTROLLERS } from './metadata/controllers.generated.js';
import {
  FILTERED_OPERATIONS,
  OPERATIONS,
  type OperationMetadata,
} from './metadata/operations.generated.js';

/**
 * Synthetic DSL operations (not in Eligius metadata)
 *
 * These operations are DSL-specific and transform to multiple Eligius operations
 * during compilation (see ast-transformer.ts).
 */
const SYNTHETIC_OPERATIONS: OperationMetadata[] = [
  {
    name: 'addController',
    description:
      'Adds a controller instance to the selected element. Synthetic DSL operation that expands to getControllerInstance + addControllerToElement.',
    category: 'Controller',
    parameters: [
      {
        name: 'controllerName',
        type: 'string',
        required: true,
        description: `Controller name (${CONTROLLERS.map(c => c.name).join(', ')})`,
      },
      {
        name: 'parameters',
        type: 'object',
        required: false,
        description: 'Controller-specific parameters (varies by controller)',
      },
    ],
    dependencies: ['selectedElement'],
    outputs: [],
  },
];

/**
 * Singleton instance of the operation registry
 */
let operationRegistry: OperationMetadata[] | null = null;

/**
 * Load the operation registry (lazy loading, singleton pattern)
 *
 * This function loads the operation metadata only once and caches it.
 * It merges operations from Eligius metadata with synthetic DSL operations,
 * then sorts alphabetically by name.
 *
 * @returns Array of operation metadata
 */
export function loadOperationRegistry(): OperationMetadata[] {
  if (operationRegistry === null) {
    // Merge Eligius operations with synthetic operations
    const allOperations = [...OPERATIONS, ...SYNTHETIC_OPERATIONS];

    // Sort alphabetically by name (case-insensitive)
    allOperations.sort((a, b) => a.name.localeCompare(b.name));

    operationRegistry = allOperations;
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
