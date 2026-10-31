/**
 * Action call scoping shared by the LSP scope provider, the validators and the
 * compiler (Feature 023 FR-010, Feature 032 US3).
 *
 * The set of actions callable by name from inside a document root is:
 * - its own actions: a Program's local actions, or ALL of a Library's actions
 *   (private helpers included, FR-010), plus
 * - the actions it imports directly, under their alias when aliased.
 *
 * Imports are not re-exported: a program importing `a` from library A cannot
 * call the actions A imports from B, nor A's private helpers. A library action
 * body is always resolved against its own library's scope, wherever it is
 * called from.
 *
 * Library documents are found through a {@link LibraryResolver}, so the IDE
 * (its own workspace) and the compiler (the shared compiler services) can share
 * this logic. When the resolver cannot find a document, the import's linked
 * reference is used instead.
 */

import { type AstNode, AstUtils, type URI } from 'langium';
import {
  type ActionDefinition,
  type ActionImport,
  isActionDefinition,
  isLibrary,
  isLibraryImport,
  isProgram,
  type Library,
  type LibraryImport,
  type Program,
} from '../generated/ast.js';
import { getActions } from './program-helpers.js';

/** A document root that owns action definitions and imports. */
export type ActionScopeRoot = Program | Library;

/**
 * Looks up the library document an import path refers to, relative to the
 * importing document's URI. Returns `undefined` when it is not loaded or is not
 * a library.
 */
export type LibraryResolver = (fromUri: URI, importPath: string) => Library | undefined;

/** An action as visible from a scope root: the name it is called by there, and its definition. */
export interface CallableAction {
  /** The name used to call the action in this scope (the import alias, when aliased). */
  readonly name: string;
  /** The original definition (in this document or in an imported library). */
  readonly action: ActionDefinition;
  /** Whether the action comes from an import rather than this document. */
  readonly imported: boolean;
}

/**
 * The Program or Library that a node belongs to (for an action definition: the
 * root that defines it).
 */
export function getActionScopeRoot(node: AstNode): ActionScopeRoot | undefined {
  return AstUtils.getContainerOfType(
    node,
    (n): n is ActionScopeRoot => isProgram(n) || isLibrary(n)
  );
}

/** The library imports (`import { ... } from "./x.eligian"`) of a Program or Library. */
export function getLibraryImportsOf(root: ActionScopeRoot): LibraryImport[] {
  return isProgram(root)
    ? root.statements.filter(isLibraryImport)
    : (root.imports ?? []).filter(isLibraryImport);
}

function getOwnActions(root: ActionScopeRoot): ActionDefinition[] {
  return isProgram(root) ? getActions(root) : (root.actions ?? []).filter(isActionDefinition);
}

/**
 * Resolve one `import { x }` entry to the public action it names.
 *
 * The library is looked up by path first, matching the action by name. This
 * works even when the importing document was linked before the library was
 * loaded (nested library documents in the compiler). The linked reference is
 * the fallback for libraries the resolver does not know about.
 */
function resolveActionImport(
  actionImport: ActionImport,
  libraryImport: LibraryImport,
  fromUri: URI | undefined,
  resolveLibrary: LibraryResolver
): ActionDefinition | undefined {
  const actionName = actionImport.action.$refText;
  const library = fromUri ? resolveLibrary(fromUri, libraryImport.path) : undefined;
  if (library) {
    return (library.actions ?? []).find(
      action => action.name === actionName && action.visibility !== 'private'
    );
  }
  const ref = actionImport.action.ref;
  return ref && ref.visibility !== 'private' ? ref : undefined;
}

/**
 * The actions a root imports directly, each under the name it is called by
 * (alias ?? original name). Unresolvable and private imports are skipped; the
 * import validators report those.
 */
export function getImportedCallableActions(
  root: ActionScopeRoot,
  resolveLibrary: LibraryResolver
): CallableAction[] {
  const fromUri = AstUtils.getDocument(root).uri;
  const result: CallableAction[] = [];
  for (const libraryImport of getLibraryImportsOf(root)) {
    for (const actionImport of libraryImport.actions) {
      const action = resolveActionImport(actionImport, libraryImport, fromUri, resolveLibrary);
      if (action) {
        result.push({ name: actionImport.alias ?? action.name, action, imported: true });
      }
    }
  }
  return result;
}

/**
 * All actions callable by name from inside `root`: its own actions followed by
 * its directly imported actions. Lookups take the first match, so an own
 * action shadows an import of the same name (the IDE, validators and compiler
 * agree on this). Such collisions are reported by validation
 * (`import_name_collision`, for Programs and Libraries alike).
 */
export function getCallableActions(
  root: ActionScopeRoot,
  resolveLibrary: LibraryResolver
): CallableAction[] {
  const own = getOwnActions(root).map(
    (action): CallableAction => ({ name: action.name, action, imported: false })
  );
  return [...own, ...getImportedCallableActions(root, resolveLibrary)];
}

/** Find the action called `name` among `callables`. */
export function findCallableAction(
  name: string,
  callables: readonly CallableAction[]
): CallableAction | undefined {
  return callables.find(callable => callable.name === name);
}
