/**
 * Custom-action call expansion helper.
 *
 * Extracted verbatim from `ast-transformer.ts` as part of the W2 decomposition
 * (CODE_ANALYSIS).
 */
import type { SourceLocation } from '../types/common.js';
import type { JsonValue, OperationConfigIR } from '../types/eligius-ir.js';

/**
 * Build the `requestAction` + (`startAction` | `endAction`) operation pair that
 * a custom-action call expands to.
 *
 * Single source of truth for the four hand-coded copies of this triplet across
 * the transformer (sequence items, stagger items, timeline action calls, and
 * inline operation statements). Each call produces a fresh pair with new UUIDs:
 * a `requestAction` (carrying the action's `systemName`) followed by the given
 * `verb` (`startAction` for start operations, `endAction` for endable-action end
 * operations), both stamped with the same source location.
 *
 * @param actionName - The custom action's name (→ `requestAction.systemName`)
 * @param actionOperationData - Mapped argument data, or `undefined` for no args
 * @param sourceLocation - Source location to stamp on both operations
 * @param verb - `'startAction'` or `'endAction'`
 */
export function buildActionCallOperations(
  actionName: string,
  actionOperationData: Record<string, JsonValue> | undefined,
  sourceLocation: SourceLocation,
  verb: 'startAction' | 'endAction'
): OperationConfigIR[] {
  return [
    {
      id: crypto.randomUUID(),
      systemName: 'requestAction',
      operationData: { systemName: actionName },
      sourceLocation,
    },
    {
      id: crypto.randomUUID(),
      // Both startAction and endAction REQUIRE an actionOperationData object at
      // runtime (they do mergeOperationData/Object.keys on it). A zero-arg call
      // must still emit an empty object, not omit it, or the engine throws
      // "Cannot convert undefined or null to object". (See eligius start-action.ts
      // / end-action.ts.)
      systemName: verb,
      operationData: { actionOperationData: actionOperationData ?? {} },
      sourceLocation,
    },
  ];
}
