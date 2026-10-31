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
   *    and remove erased ones (Eligius deletes them after use, including a value
   *    an earlier operation left under the same name; recorded as an erasure)
   * 3. Track outputs (properties operation produces)
   *
   * Note: Erased parameters are never added, so a plain `addClass("foo")` does
   * not make `className` available to later operations.
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

    // Step 2: Parameters.
    // - Not erased: the value stays on operationData for subsequent operations.
    // - Erased: Eligius deletes the property after the operation runs. That also
    //   removes a value an EARLIER operation left under the same name (e.g.
    //   createElement outputs 'template', setElementContent erases its
    //   'template' parameter), so it is removed and recorded as an erasure.
    for (const param of signature.parameters) {
      if (!param.erased) {
        this.add(operationName, param.name);
      } else {
        this.remove(operationName, param.name);
      }
    }

    // Step 3: Outputs (properties the operation produces). An output marked
    // erased is deleted after execution, so it never reaches later operations.
    for (const output of signature.outputs) {
      if (output.erased) {
        this.remove(operationName, output.name);
      } else {
        this.add(operationName, output.name);
      }
    }

    return missingDependencies;
  }

  private add(operation: string, property: string): void {
    this.availableProperties.add(property);
    this.history.push({ operation, action: 'added', property });
  }

  /** Remove `property` if present, recording the erasure; a no-op otherwise. */
  private remove(operation: string, property: string): void {
    if (this.availableProperties.delete(property)) {
      this.history.push({ operation, action: 'removed', property });
    }
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
   * Find which operation erased a given property (for error messages): the
   * most recent erasure recorded for it. Returns undefined if the property was
   * never erased (it was simply never created).
   */
  findErasurePoint(propertyName: string): { operation: string } | undefined {
    for (let i = this.history.length - 1; i >= 0; i--) {
      const entry = this.history[i];
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

    // Merge histories. Branch trackers are clones of the same pre-branch
    // tracker, so they share its history entries (same objects) as a prefix:
    // append only the other branch's own entries, not the shared prefix again.
    let shared = 0;
    while (
      shared < this.history.length &&
      shared < other.history.length &&
      this.history[shared] === other.history[shared]
    ) {
      shared++;
    }
    this.history.push(...other.history.slice(shared));
  }
}
