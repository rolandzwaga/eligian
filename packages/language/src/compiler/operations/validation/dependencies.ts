/**
 * T216: Dependency validation.
 *
 * Extracted verbatim from `operations/validator.ts` (W3 decomposition).
 */

import { OPERATION_REGISTRY, type OperationSignature } from '../index.js';
import type { MissingDependencyError } from './errors.js';

/**
 * Validate that required dependencies are available for an operation.
 * Tracks outputs from previous operations in the action/event.
 *
 * @param signature - The operation signature requiring dependencies
 * @param availableOutputs - Set of output names available from previous operations
 * @returns Array of MissingDependencyError for missing dependencies, empty if valid
 *
 * @example
 * const signature = OPERATION_REGISTRY['addClass'];
 * const available = new Set<string>(); // No outputs yet
 * const errors = validateDependencies(signature, available);
 * // errors[0].message = "Operation 'addClass' requires 'selectedElement' but it is not available"
 *
 * @example
 * const available = new Set(['selectedElement']); // After selectElement()
 * const errors = validateDependencies(signature, available);
 * // errors = [] (no error, dependency satisfied)
 */
export function validateDependencies(
  signature: OperationSignature,
  availableOutputs: Set<string>
): MissingDependencyError[] {
  const errors: MissingDependencyError[] = [];

  // Check each required dependency
  for (const dependency of signature.dependencies) {
    if (!availableOutputs.has(dependency.name)) {
      // Find which operations can provide this dependency
      const providers = findOperationsProvidingOutput(dependency.name);
      const providerHint =
        providers.length > 0
          ? `Call ${providers.slice(0, 3).join(' or ')} first to provide '${dependency.name}'`
          : `No operation in the registry provides '${dependency.name}'`;

      errors.push({
        code: 'MISSING_DEPENDENCY',
        operationName: signature.systemName,
        message: `Operation '${signature.systemName}' requires '${dependency.name}' but it is not available`,
        dependencyName: dependency.name,
        requiredType: dependency.type,
        hint: providerHint,
      });
    }
  }

  return errors;
}

/**
 * Find operations that provide a specific output.
 * Used for generating helpful error hints.
 */
function findOperationsProvidingOutput(outputName: string): string[] {
  const providers: string[] = [];

  for (const [name, signature] of Object.entries(OPERATION_REGISTRY)) {
    if (signature.outputs.some(output => output.name === outputName)) {
      providers.push(name);
    }
  }

  return providers;
}

/**
 * Track available outputs as operations are executed in sequence.
 * Call this after validating each operation to update the available outputs.
 *
 * @param signature - The operation that was just validated
 * @param availableOutputs - The set of currently available outputs (mutated in place)
 *
 * @example
 * const available = new Set<string>();
 * const selectElementSig = OPERATION_REGISTRY['selectElement'];
 *
 * // After selectElement(), selectedElement becomes available
 * trackOutputs(selectElementSig, available);
 * // available now contains 'selectedElement'
 */
export function trackOutputs(signature: OperationSignature, availableOutputs: Set<string>): void {
  for (const output of signature.outputs) {
    availableOutputs.add(output.name);
  }
}
