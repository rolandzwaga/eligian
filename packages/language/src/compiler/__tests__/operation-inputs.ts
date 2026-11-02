import type { TOperationData } from 'eligius';

interface OperationLike {
  readonly systemName: string;
  readonly operationData?: TOperationData;
}

/**
 * The configured inputs an operation receives: its own operationData merged over
 * the properties of the `setOperationData` operations directly before it.
 *
 * The compiler moves runtime values (property chains) that an operation does not
 * resolve itself into a preceding `setOperationData`, which resolves them before
 * the operation runs (compiler/transformers/runtime-values.ts). Tests that check
 * what an operation is given should look at these inputs, not only at its own
 * operationData.
 */
export function inputsOf(
  operations: readonly OperationLike[],
  operation: OperationLike | undefined
): Record<string, unknown> {
  if (!operation) return {};
  const index = operations.indexOf(operation);
  const inputs: Record<string, unknown> = {};
  for (let i = index - 1; i >= 0 && operations[i].systemName === 'setOperationData'; i--) {
    const properties = (operations[i].operationData?.properties ?? {}) as Record<string, unknown>;
    for (const [key, value] of Object.entries(properties)) {
      if (!(key in inputs)) inputs[key] = value;
    }
  }
  return { ...inputs, ...(operation.operationData ?? {}) };
}

/**
 * The operations without the `setOperationData` steps the compiler inserts to
 * resolve runtime values, for assertions about the shape the source describes.
 */
export function userOperations<T extends OperationLike>(operations: readonly T[]): T[] {
  return operations.filter(op => op.systemName !== 'setOperationData');
}
