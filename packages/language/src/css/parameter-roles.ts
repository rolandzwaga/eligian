/**
 * Selector and class-name roles of action parameters (audit feature idea #18).
 *
 * A parameter has the role `selector` when the action passes it, directly, to
 * a selector input (`selectElement(sel)`, `with sel { }`) or to a selector
 * parameter of an action it calls, and `className` for className inputs
 * (`addClass(name)`). A parameter used for both, or only inside expressions
 * (`"#" + id`), gets no role. Roles follow nested action calls, also into
 * library files (calls resolve through the scope provider's references).
 *
 * At a call site, a string literal passed for a role-tagged parameter is
 * validated and completed like one passed to the operation itself:
 * `spotlight("#tok-timelin")` → Unknown CSS ID … Did you mean: tok-timeline?
 */
import { AstUtils } from 'langium';
import { getOperationSignature } from '../compiler/operations/index.js';
import {
  type ActionDefinition,
  type Expression,
  isActionDefinition,
  isOperationCall,
  isParameterReference,
  isWithStatement,
  type OperationCall,
} from '../generated/ast.js';
import { getOperationCallName } from '../utils/operation-call-utils.js';

export type ParameterRole = 'selector' | 'className';

/** The role of an operation's parameter at `index`, from its registry type tags. */
function operationParameterRole(name: string, index: number): ParameterRole | undefined {
  const parameter = getOperationSignature(name)?.parameters[index];
  const types = Array.isArray(parameter?.type) ? (parameter.type as readonly unknown[]) : [];
  if (types.includes('ParameterType:selector')) return 'selector';
  if (types.includes('ParameterType:className')) return 'className';
  return undefined;
}

/** The action `call` calls, when it is an action call (not an operation). */
export function calledAction(call: OperationCall): ActionDefinition | undefined {
  const target = call.operationName?.ref;
  return isActionDefinition(target) ? target : undefined;
}

/** The role of the callee parameter that the argument at `index` of `call` is passed to. */
export function argumentRole(call: OperationCall, index: number): ParameterRole | undefined {
  const action = calledAction(call);
  if (action) {
    const parameter = action.parameters[index];
    return parameter ? parameterRoles(action).get(parameter.name) : undefined;
  }
  return operationParameterRole(getOperationCallName(call), index);
}

/**
 * The roles of `action`'s parameters. Not cached across calls: a library
 * action can change without the AST of the actions calling it changing.
 */
export function parameterRoles(
  action: ActionDefinition,
  visiting: Set<ActionDefinition> = new Set()
): ReadonlyMap<string, ParameterRole> {
  if (visiting.has(action)) return new Map(); // recursion: no roles through the cycle
  visiting.add(action);

  const found = new Map<string, ParameterRole | 'conflict'>();
  const note = (expr: Expression | undefined, role: ParameterRole | undefined) => {
    if (!role || !isParameterReference(expr)) return;
    const parameter = expr.parameter?.ref;
    if (!parameter || !action.parameters.includes(parameter)) return;
    const existing = found.get(parameter.name);
    found.set(parameter.name, existing === undefined || existing === role ? role : 'conflict');
  };

  for (const node of AstUtils.streamAllContents(action)) {
    if (isWithStatement(node)) {
      note(node.selector, 'selector');
    } else if (isOperationCall(node)) {
      const callee = calledAction(node);
      node.args.forEach((arg, index) => {
        if (callee) {
          const parameter = callee.parameters[index];
          note(arg, parameter ? parameterRoles(callee, visiting).get(parameter.name) : undefined);
        } else {
          note(arg, operationParameterRole(getOperationCallName(node), index));
        }
      });
    }
  }

  visiting.delete(action);
  const roles = new Map<string, ParameterRole>();
  for (const [name, role] of found) {
    if (role !== 'conflict') roles.set(name, role);
  }
  return roles;
}
