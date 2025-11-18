/**
 * Operation Registry Exports
 *
 * This module provides the main API for working with the operation registry.
 * It exports the generated registry and provides lookup/query functions.
 */

import { OPERATION_REGISTRY as GENERATED_REGISTRY } from './registry.generated.js';
import type { OperationSignature } from './types.js';

/**
 * Feature 035: Synthetic operation for addController DSL syntax sugar
 *
 * addController is not a real Eligius operation - it's DSL sugar that transforms into:
 * - getControllerInstance({ systemName: 'ControllerName' })
 * - addControllerToElement({ ...params })
 *
 * We register it here to prevent "unknown operation" errors during validation.
 * The actual transformation happens in ast-transformer.ts.
 */
const SYNTHETIC_ADD_CONTROLLER: OperationSignature = {
  systemName: 'addController',
  description:
    'DSL syntax sugar for adding a controller. Transforms to getControllerInstance + addControllerToElement.',
  category: 'Controller',
  parameters: [
    {
      name: 'controllerName',
      type: ['ParameterType:string'],
      required: true,
      description: 'Name of the controller to add (e.g., "LabelController")',
    },
  ],
  dependencies: [],
  outputs: [],
};

/**
 * The complete operation registry containing all Eligius operations + synthetic operations.
 * Maps operation name → operation signature.
 */
export const OPERATION_REGISTRY: Record<string, OperationSignature> = {
  ...GENERATED_REGISTRY,
  addController: SYNTHETIC_ADD_CONTROLLER,
};

/**
 * Export all types for consumers
 */
export type {
  ConstantValue,
  DependencyInfo,
  OperationParameter,
  OperationRegistry,
  OperationSignature,
  OutputInfo,
  ParameterType,
} from './types.js';

export {
  getDefaultConstantValue,
  isConstantValueArray,
  isParameterTypeArray,
} from './types.js';

/**
 * Get the signature for a specific operation by name.
 *
 * @param name - The operation name (e.g., 'addClass', 'selectElement')
 * @returns The operation signature if found, undefined otherwise
 *
 * @example
 * const signature = getOperationSignature('addClass');
 * if (signature) {
 * }
 */
export function getOperationSignature(name: string): OperationSignature | undefined {
  return OPERATION_REGISTRY[name];
}

/**
 * Check if an operation exists in the registry.
 *
 * @param name - The operation name to check
 * @returns True if the operation exists, false otherwise
 *
 * @example
 * if (hasOperation('addClass')) {
 *   // Safe to use addClass operation
 * }
 */
export function hasOperation(name: string): boolean {
  return name in OPERATION_REGISTRY;
}

/**
 * Get all operation signatures from the registry.
 *
 * @returns Array of all operation signatures
 *
 * @example
 * const allOps = getAllOperations();
 */
export function getAllOperations(): OperationSignature[] {
  return Object.values(OPERATION_REGISTRY);
}

/**
 * Get all operation names from the registry.
 *
 * @returns Array of all operation names sorted alphabetically
 *
 * @example
 * const names = getAllOperationNames();
 * // ['addClass', 'addControllerToElement', 'animate', ...]
 */
export function getAllOperationNames(): string[] {
  return Object.keys(OPERATION_REGISTRY).sort();
}

/**
 * Get operations grouped by category.
 *
 * @returns Record mapping category name → array of operation signatures
 *
 * @example
 * const byCategory = getOperationsByCategory();
 */
export function getOperationsByCategory(): Record<string, OperationSignature[]> {
  const result: Record<string, OperationSignature[]> = {};

  for (const signature of Object.values(OPERATION_REGISTRY)) {
    const category = signature.category ?? 'Uncategorized';
    if (!result[category]) {
      result[category] = [];
    }
    result[category].push(signature);
  }

  return result;
}

/**
 * Find operations that have a specific dependency.
 *
 * @param dependencyName - The dependency name to search for (e.g., 'selectedElement')
 * @returns Array of operations that depend on this value
 *
 * @example
 * const needsSelectedElement = findOperationsWithDependency('selectedElement');
 * // [addClass, removeClass, setStyle, animate, ...]
 */
export function findOperationsWithDependency(dependencyName: string): OperationSignature[] {
  return Object.values(OPERATION_REGISTRY).filter(op =>
    op.dependencies.some(dep => dep.name === dependencyName)
  );
}

/**
 * Find operations that produce a specific output.
 *
 * @param outputName - The output name to search for (e.g., 'selectedElement')
 * @returns Array of operations that produce this output
 *
 * @example
 * const producesSelectedElement = findOperationsWithOutput('selectedElement');
 * // [selectElement]
 */
export function findOperationsWithOutput(outputName: string): OperationSignature[] {
  return Object.values(OPERATION_REGISTRY).filter(op =>
    op.outputs.some(out => out.name === outputName)
  );
}

/**
 * Search for operations by name (fuzzy match).
 * Useful for providing suggestions when user types an unknown operation.
 *
 * @param query - The search query (partial operation name)
 * @returns Array of matching operation signatures, sorted by relevance
 *
 * @example
 * const matches = searchOperations('class');
 * // [addClass, removeClass, toggleClass, animateWithClass]
 */
export function searchOperations(query: string): OperationSignature[] {
  const lowerQuery = query.toLowerCase();

  return Object.values(OPERATION_REGISTRY)
    .filter(op => op.systemName.toLowerCase().includes(lowerQuery))
    .sort((a, b) => {
      // Sort by how early the query appears in the name
      const aIndex = a.systemName.toLowerCase().indexOf(lowerQuery);
      const bIndex = b.systemName.toLowerCase().indexOf(lowerQuery);
      return aIndex - bIndex;
    });
}

/**
 * Suggest similar operation names for a given unknown operation.
 * Uses Levenshtein distance for similarity matching.
 *
 * @param unknownName - The unknown operation name
 * @param maxSuggestions - Maximum number of suggestions to return (default: 3)
 * @returns Array of suggested operation names
 *
 * @example
 * const suggestions = suggestSimilarOperations('adClass'); // typo
 * // ['addClass', 'toggleClass', 'removeClass']
 */
export function suggestSimilarOperations(
  unknownName: string,
  maxSuggestions: number = 3,
  maxDistance: number = 3
): string[] {
  const allNames = Object.keys(OPERATION_REGISTRY);

  // Calculate Levenshtein distance for each operation name
  const distances = allNames.map(name => ({
    name,
    distance: levenshteinDistance(unknownName.toLowerCase(), name.toLowerCase()),
  }));

  // Filter by distance threshold, sort by distance (closest first), and return top N
  return distances
    .filter(item => item.distance <= maxDistance)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, maxSuggestions)
    .map(item => item.name);
}

/**
 * Validate the registry for consistency.
 * Checks for duplicate names, invalid categories, etc.
 *
 * @throws Error if validation fails
 *
 * @example
 * validateRegistry(); // Throws if registry is invalid
 */
export function validateRegistry(): void {
  const names = Object.keys(OPERATION_REGISTRY);
  const uniqueNames = new Set(names);

  if (names.length !== uniqueNames.size) {
    throw new Error('Registry contains duplicate operation names');
  }

  for (const [name, signature] of Object.entries(OPERATION_REGISTRY)) {
    if (signature.systemName !== name) {
      throw new Error(
        `Operation key "${name}" does not match systemName "${signature.systemName}"`
      );
    }

    if (!signature.description || signature.description.trim().length === 0) {
      throw new Error(`Operation "${name}" has no description`);
    }

    // Validate parameter types
    for (const param of signature.parameters) {
      if (!param.name || param.name.trim().length === 0) {
        throw new Error(`Operation "${name}" has parameter with empty name`);
      }

      // param.type is always an array now (ParameterType[] | ConstantValue[])
      if (!Array.isArray(param.type)) {
        throw new Error(`Operation "${name}" parameter "${param.name}" type must be an array`);
      }

      if (param.type.length === 0) {
        throw new Error(`Operation "${name}" parameter "${param.name}" has empty type array`);
      }

      // Check if it's ConstantValue[] or ParameterType[]
      if (typeof param.type[0] === 'object' && 'value' in param.type[0]) {
        // ConstantValue[] - no additional validation needed
      } else {
        // ParameterType[] - validate each type string
        for (const typeStr of param.type) {
          if (typeof typeStr !== 'string' || !typeStr.startsWith('ParameterType:')) {
            throw new Error(
              `Operation "${name}" parameter "${param.name}" has invalid type "${typeStr}"`
            );
          }
        }
      }
    }
  }
}

/**
 * Helper: Calculate Levenshtein distance between two strings.
 * Used for fuzzy matching and typo suggestions.
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  // Initialize first column
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  // Initialize first row
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  // Fill in the rest of the matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}
