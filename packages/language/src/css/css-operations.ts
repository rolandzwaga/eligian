/**
 * Shared CSS operation-name sets.
 *
 * These identify the built-in operations whose string arguments carry CSS
 * semantics — either a bare class name (`className` parameter) or a CSS
 * selector. Both completion ([context-detection.ts](./context-detection.ts))
 * and hover ([hover-detection.ts](./hover-detection.ts)) consume these.
 *
 * The sets are derived from the generated operation registry (the same source the
 * parameter validators use), so they cannot drift from the operations that exist in Eligius.
 */

import { OPERATION_REGISTRY } from '../compiler/operations/registry.generated.js';

/**
 * Collect the names of operations having a parameter of the given `ParameterType`.
 */
function operationsWithParameterType(parameterType: string): Set<string> {
  const names = new Set<string>();
  for (const [name, operation] of Object.entries(OPERATION_REGISTRY)) {
    const hasType = operation.parameters.some(
      parameter =>
        Array.isArray(parameter.type) &&
        (parameter.type as readonly unknown[]).some(type => type === parameterType)
    );
    if (hasType) names.add(name);
  }
  return names;
}

/**
 * Operations that accept className parameters
 * (addClass, removeClass, toggleClass, animateWithClass)
 */
export const CLASS_NAME_OPERATIONS: ReadonlySet<string> =
  operationsWithParameterType('ParameterType:className');

/**
 * Operations that accept selector parameters
 * (selectElement, reparentElement)
 */
export const SELECTOR_OPERATIONS: ReadonlySet<string> =
  operationsWithParameterType('ParameterType:selector');
