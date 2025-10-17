/**
 * OperationDataTracker - Track operationData properties through operation sequences
 *
 * T254: This class simulates the operationData object state as operations execute,
 * tracking which properties are available at each point in the sequence.
 *
 * See Constitution Principle XII: Eligius Architecture Understanding for details
 * on how operationData works in Eligius.
 *
 * Key Concepts:
 * - operationData: Object passed between operations containing user config and operation outputs
 * - Outputs: Properties added by operations (e.g., selectElement adds 'selectedElement')
 * - Dependencies: Properties operations expect to find (must exist before operation runs)
 * - Erased: Properties consumed and deleted by operations (marked erased: true in metadata)
 */

import { getOperationSignature } from './compiler/operations/index.js';

/**
 * Tracks which properties are available on operationData at a given point
 * in an operation sequence.
 */
export class OperationDataTracker {
  /**
   * Set of property names currently available on operationData.
   * Properties are tracked as simple strings (e.g., 'selectedElement', 'actionInstance').
   */
  private availableProperties: Set<string> = new Set();

  /**
   * History of property additions/removals for debugging and error messages.
   */
  private history: Array<{
    operation: string;
    action: 'added' | 'removed';
    property: string;
  }> = [];

  /**
   * Process an operation and update operationData state.
   *
   * Simulates what happens to operationData when an operation executes:
   * 1. Check dependencies exist (properties operation expects to find)
   * 2. Track non-erased parameters (stay on operationData for subsequent operations)
   * 3. Track outputs (properties operation produces)
   *
   * Note: Erased parameters are NOT tracked because they're deleted immediately after use.
   *
   * Example sequence:
   *   selectElement("#el")  → Outputs: selectedElement (tracked)
   *   addClass("foo")       → Parameter className (erased: true, NOT tracked)
   *                         → Dependency: selectedElement (validated, still available)
   *   removeClass("bar")    → Can still use selectedElement (not erased by addClass)
   *
   * @param operationName - Name of the operation being executed
   * @returns Array of missing dependencies (empty if all dependencies satisfied)
   */
  processOperation(operationName: string): string[] {
    const signature = getOperationSignature(operationName);
    if (!signature) {
      // Unknown operation - can't validate (should be caught by other validators)
      return [];
    }

    const missingDependencies: string[] = [];

    // Step 1: Check dependencies (properties operation expects to find on operationData)
    for (const dep of signature.dependencies) {
      if (!this.availableProperties.has(dep.name)) {
        missingDependencies.push(dep.name);
      }
    }

    // Step 2: Add non-erased parameters (these stay on operationData after operation)
    // Rule: If parameter is NOT marked erased, it stays on operationData for subsequent operations
    for (const param of signature.parameters) {
      if (!param.erased) {
        this.availableProperties.add(param.name);
        this.history.push({
          operation: operationName,
          action: 'added',
          property: param.name,
        });
      }
      // If erased: true, we don't track it - it's deleted immediately after use
    }

    // Step 3: Add outputs (properties operation produces)
    for (const output of signature.outputs) {
      this.availableProperties.add(output.name);
      this.history.push({
        operation: operationName,
        action: 'added',
        property: output.name,
      });
    }

    // Note: We don't need a Step 4 to remove erased properties because we never added them in Step 2

    return missingDependencies;
  }

  /**
   * Check if a property is currently available on operationData.
   */
  hasProperty(propertyName: string): boolean {
    return this.availableProperties.has(propertyName);
  }

  /**
   * Get all currently available properties.
   */
  getAvailableProperties(): string[] {
    return Array.from(this.availableProperties);
  }

  /**
   * Get the history of property changes (for debugging/error messages).
   */
  getHistory(): Array<{
    operation: string;
    action: 'added' | 'removed';
    property: string;
  }> {
    return [...this.history];
  }

  /**
   * Find which operation erased a given property (for error messages).
   * Returns undefined if property was never erased.
   */
  findErasurePoint(propertyName: string): { operation: string } | undefined {
    for (const entry of this.history) {
      if (entry.action === 'removed' && entry.property === propertyName) {
        return { operation: entry.operation };
      }
    }
    return undefined;
  }

  /**
   * Clone the tracker (useful for control flow branches).
   */
  clone(): OperationDataTracker {
    const cloned = new OperationDataTracker();
    cloned.availableProperties = new Set(this.availableProperties);
    cloned.history = [...this.history];
    return cloned;
  }

  /**
   * Merge another tracker's state (useful for control flow joins).
   * Only includes properties available in BOTH trackers (intersection).
   */
  merge(other: OperationDataTracker): void {
    // Properties available after if/else: only those available in BOTH branches
    const intersection = new Set<string>();
    for (const prop of Array.from(this.availableProperties)) {
      if (other.availableProperties.has(prop)) {
        intersection.add(prop);
      }
    }
    this.availableProperties = intersection;

    // Merge histories
    this.history.push(...other.history);
  }
}
