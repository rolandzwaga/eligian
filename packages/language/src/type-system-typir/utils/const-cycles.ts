/**
 * Const Reference Cycle Detection
 *
 * A const's value can reference other consts (`const a = @b`), and the scope provider
 * makes every program-level const visible regardless of declaration order, including to
 * itself. A cyclic chain (`const a = @a`, `const a = @b` + `const b = @a`) has no value
 * and would make Typir's recursive inference (VariableDeclaration -> value ->
 * VariableReference -> VariableDeclaration) loop: Typir throws "There is a recursion loop
 * for inferring the type" instead of returning a problem. These helpers find such cycles
 * so inference can opt out and validation can report them.
 *
 * @module type-system-typir/utils/const-cycles
 */

import { AstUtils } from 'langium';
import { isVariableReference, type VariableDeclaration } from '../../generated/ast.js';

/** Consts directly referenced (anywhere) in the value of `decl`. */
function referencedConsts(decl: VariableDeclaration): VariableDeclaration[] {
  if (!decl.value) {
    return [];
  }
  const result: VariableDeclaration[] = [];
  for (const node of AstUtils.streamAst(decl.value)) {
    if (isVariableReference(node)) {
      const target = node.variable?.ref;
      if (target) {
        result.push(target);
      }
    }
  }
  return result;
}

/**
 * Find a reference cycle that runs through `decl`.
 *
 * @returns The cycle as a path that starts and ends with `decl` (`[a, b, a]`), or
 *          `undefined` when `decl` is not part of a cycle. A const that only references a
 *          cycle without being part of it (`const c = @a` with `const a = @a`) is not
 *          cyclic itself.
 */
export function findConstCycle(decl: VariableDeclaration): VariableDeclaration[] | undefined {
  const visited = new Set<VariableDeclaration>();

  const search = (
    current: VariableDeclaration,
    path: VariableDeclaration[]
  ): VariableDeclaration[] | undefined => {
    for (const next of referencedConsts(current)) {
      if (next === decl) {
        return [...path, decl];
      }
      if (!visited.has(next)) {
        visited.add(next);
        const found = search(next, [...path, next]);
        if (found) {
          return found;
        }
      }
    }
    return undefined;
  };

  return search(decl, [decl]);
}

/** Render a cycle path as `a -> b -> a`. */
export function formatConstCycle(cycle: readonly VariableDeclaration[]): string {
  return cycle.map(decl => decl.name).join(' -> ');
}
