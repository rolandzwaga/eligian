/**
 * Keeping action parameters alive across operations that erase them.
 *
 * An action's parameters live in its operationData under their own names
 * (`action reveal(selector)` reads `$operationdata.selector`). Eligius
 * operations erase some of their own properties after they ran (`@erased`:
 * selectElement removes `selector`), and when such a property has the name of
 * a parameter, the parameter is gone for the rest of the block:
 *
 *   action twice(selector) [
 *     selectElement(selector) addClass("on")    // erases `selector`
 *     selectElement(selector) removeClass("on") // runtime error: no selector
 *   ]
 *
 * The same broke forwarding the parameter to another action (`inner(selector)`
 * relies on startAction merging the caller's data, which no longer has it) and
 * the next iteration of a loop. So when a statement's operations erase a
 * parameter that the block still uses (later in the same start / end block, or
 * anywhere in an enclosing loop), the parameter is saved before them and put
 * back after them.
 */
import { type AstNode, AstUtils } from 'langium';
import {
  isActionDefinition,
  isForStatement,
  isParameterReference,
  isPropertyChainReference,
} from '../../generated/ast.js';
import { getOperationSignature } from '../operations/index.js';
import type { OperationConfigIR } from '../types/eligius-ir.js';
import type { ScopeContext } from './scope.js';

/** Where a parameter is kept while an operation erases it. */
export const preservedParameterKey = (name: string) => `__eligian_param_${name}`;

/** The properties these operations erase after they ran. */
function erasedBy(operations: readonly OperationConfigIR[]): Set<string> {
  const erased = new Set<string>();
  for (const operation of operations) {
    const signature = getOperationSignature(operation.systemName);
    for (const parameter of signature?.parameters ?? []) {
      if (parameter.erased) erased.add(parameter.name);
    }
    for (const output of signature?.outputs ?? []) {
      if (output.erased) erased.add(output.name);
    }
  }
  return erased;
}

/**
 * `operations` (compiled from `statement`), with the parameters they erase
 * saved before and restored after them, when the block still needs them.
 */
export function preserveErasedParameters(
  statement: AstNode,
  operations: OperationConfigIR[],
  scope: ScopeContext
): OperationConfigIR[] {
  if (!scope.inActionBody || scope.actionParameters.length === 0 || operations.length === 0) {
    return operations;
  }
  const erased = erasedBy(operations);
  const names = scope.actionParameters.filter(
    name => erased.has(name) && usedAgain(statement, name)
  );
  if (names.length === 0) return operations;
  const sourceLocation = operations[0].sourceLocation;
  const copy = (from: (name: string) => string, to: (name: string) => string) => ({
    id: crypto.randomUUID(),
    systemName: 'setOperationData',
    operationData: {
      properties: Object.fromEntries(names.map(name => [to(name), `$operationdata.${from(name)}`])),
    },
    sourceLocation,
  });
  return [
    copy(name => name, preservedParameterKey),
    ...operations,
    copy(preservedParameterKey, name => name),
  ];
}

/**
 * Whether the parameter `name` is used after `statement` in its start / end
 * block (each block starts with fresh operation data), or anywhere in a loop
 * around the statement (the next iteration uses it again).
 */
export function usedAgain(statement: AstNode, name: string): boolean {
  const action = AstUtils.getContainerOfType(statement, isActionDefinition);
  if (!action) return false;
  let top: AstNode = statement;
  let loop: AstNode | undefined;
  for (let node: AstNode | undefined = statement.$container; node && node !== action; ) {
    if (isForStatement(node)) loop = node;
    top = node;
    node = node.$container;
  }
  if (top.$container !== action) top = statement;
  const block = (action as unknown as Record<string, unknown>)[top.$containerProperty ?? ''];
  if (!Array.isArray(block)) return false;
  const end = statement.$cstNode?.end ?? Number.POSITIVE_INFINITY;
  for (const node of (block as AstNode[]).flatMap(s => [...AstUtils.streamAst(s)])) {
    if (!refersTo(node, name)) continue;
    if ((node.$cstNode?.offset ?? -1) >= end) return true;
    if (loop && isInside(node, loop)) return true;
  }
  return false;
}

function isInside(node: AstNode, container: AstNode): boolean {
  for (let n: AstNode | undefined = node; n; n = n.$container) if (n === container) return true;
  return false;
}

/** A use of the parameter: `selector`, or `$operationdata.selector`. */
function refersTo(node: AstNode, name: string): boolean {
  if (isParameterReference(node)) return node.parameter?.$refText === name;
  return (
    isPropertyChainReference(node) && node.scope === 'operationdata' && node.properties[0] === name
  );
}
