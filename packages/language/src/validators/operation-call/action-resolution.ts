import type { AstNode } from 'langium';
import type { EligianServices } from '../../eligian-module.js';
import type { EligianScopeProvider } from '../../eligian-scope-provider.js';
import type { ActionDefinition } from '../../generated/ast.js';

/**
 * Find the action an operation call named `callName` refers to, from inside the
 * Program or Library containing `node`.
 *
 * Resolves against the same callable-action scope the scope provider uses for
 * linking (and the compiler uses for emission): the document's own actions (a
 * library's private helpers included) plus the actions it imports directly,
 * under their alias when aliased. Works for both Program and Library roots, so
 * a library calling an action it imports is recognised (Feature 032 US3).
 *
 * Shared by {@link OperationExistenceValidator} and {@link ParameterValidator}.
 *
 * @param services - Eligian services (for the scope provider)
 * @param callName - Name used in the OperationCall (could be an alias)
 * @param node - The call node (any node inside the calling document)
 * @returns The ActionDefinition if the name is a callable action, undefined otherwise
 */
export function findCallableActionByName(
  services: EligianServices,
  callName: string,
  node: AstNode
): ActionDefinition | undefined {
  const scopeProvider = services.references.ScopeProvider as EligianScopeProvider;
  return scopeProvider.findCallableAction(callName, node);
}
