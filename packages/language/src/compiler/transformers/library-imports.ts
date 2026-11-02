/**
 * Library import resolution for the AST transformer (Feature 023, Feature 032 US3).
 *
 * Works out, for a program, which action definitions must be emitted into
 * `config.actions`, the name each one is emitted under, and which call scope
 * each one's body is compiled against.
 *
 * Scoping is shared with the LSP scope provider (see `utils/action-scope.ts`):
 * - The program's timelines and local actions call its local actions plus the
 *   actions it imports, under their alias when aliased.
 * - A library action's body calls the actions of ITS OWN library (private
 *   helpers included, FR-010) plus the actions that library imports.
 *
 * Library actions are emitted when they are reachable from the program: every
 * action the program can call, plus every action those bodies call,
 * transitively.
 *
 * Eligius resolves `requestAction` by name in ONE global action namespace, so
 * every emitted name must be unique:
 * - An action the program can call is emitted under the name the program calls
 *   it by (its local name, or its import alias).
 * - Every other library action (private helpers, siblings and nested imports
 *   the program does not import itself) is emitted under a name qualified by
 *   its library: `<library>.<action>`. Action names cannot contain `.`, so a
 *   qualified name never collides with a program-level name, and the helpers of
 *   different libraries never collide with each other (spec 023 US3: renaming
 *   or adding a private helper never breaks a consumer).
 * The `requestAction` calls in each library body are rewritten to these
 * emitted names (see {@link ActionToEmit.systemNames}).
 */
import { Effect } from 'effect';
import { type AstNode, AstUtils } from 'langium';
import type { TransformError } from '../../errors/index.js';
import type { ActionDefinition, Library, Program } from '../../generated/ast.js';
import { isLibrary, isLibraryImport, isOperationCall } from '../../generated/ast.js';
import {
  type ActionScopeRoot,
  type CallableAction,
  findCallableAction,
  getActionScopeRoot,
  getCallableActions,
  type LibraryResolver,
} from '../../utils/action-scope.js';
import { getOperationCallName } from '../../utils/operation-call-utils.js';
import { getOrCreateServices, resolveLibraryPath } from '../pipeline.js';
import { getSourceLocation } from './source-location.js';

/** An action definition to emit, with the call scope its body is compiled against. */
export interface ActionToEmit {
  /** The definition, renamed to the name it is emitted (and requested) under. */
  readonly definition: ActionDefinition;
  /** The actions callable from this action's body (named as they are called there). */
  readonly scope: ActionDefinition[];
  /**
   * For each name callable from this action's body, the name the target is
   * emitted under (the `requestAction` systemName). Names absent from the map
   * are emitted under the name they are called by.
   */
  readonly systemNames: ReadonlyMap<string, string>;
}

/** Result of {@link resolveActionScopes}. */
export interface ResolvedActionScopes {
  /** The actions callable from the program's timelines and other program-level code. */
  readonly programScope: ActionDefinition[];
  /** Every action to emit into `config.actions`, in emission order. */
  readonly actionsToEmit: ActionToEmit[];
}

/**
 * Resolve library documents through the shared compiler services, which is
 * where `parseSource` loads them. Library documents are linked before the
 * libraries they import are loaded, so their import references can be
 * unresolved; path + name lookup does not depend on that linking.
 */
const resolveCompilerLibrary: LibraryResolver = (fromUri, importPath) => {
  const libraryUri = resolveLibraryPath(fromUri, importPath);
  const value =
    getOrCreateServices().shared.workspace.LangiumDocuments.getDocument(libraryUri)?.parseResult
      .value;
  return value && isLibrary(value) ? value : undefined;
};

/** `definition` renamed to `name` (a copy when the names differ). */
/**
 * Resolve an action called by `name` from the scope of `context` (local and
 * imported actions, aliases included), with the compiler's library resolver.
 */
export function resolveCompilerAction(
  context: AstNode,
  name: string
): ActionDefinition | undefined {
  const root = getActionScopeRoot(context);
  return root
    ? findCallableAction(name, getCallableActions(root, resolveCompilerLibrary))?.action
    : undefined;
}

function renamed(definition: ActionDefinition, name: string): ActionDefinition {
  return name === definition.name ? definition : { ...definition, name };
}

/**
 * The import entry in `program` that makes `name` callable, for error
 * locations that belong in the program rather than in a library file.
 */
function findProgramImportNode(program: Program, name: string) {
  for (const libraryImport of program.statements.filter(isLibraryImport)) {
    const entry = libraryImport.actions.find(
      actionImport => (actionImport.alias ?? actionImport.action.$refText) === name
    );
    if (entry) {
      return entry;
    }
  }
  return undefined;
}

/**
 * T044/T045: Resolve the program's action scopes (Feature 023 US2, FR-010; Feature 032 US3).
 *
 * Walks from the actions the program can call through every action call in
 * their bodies, resolving each call in the scope of the document that defines
 * the calling action. Unresolved names are left alone: they are built-in
 * operations, or unknown operations the operation transformer reports.
 *
 * Program-callable actions keep the program's name for them; every other
 * reachable library action gets a library-qualified name (see module docs).
 *
 * Fails with a TransformError only when two different definitions would still
 * be emitted under one name, which validation rules out (duplicate actions in
 * one document, or an import colliding with a local action).
 *
 * @param program - Program AST node with potential library imports
 * @param resolveLibrary - How to find imported library documents (defaults to the compiler services)
 */
export function resolveActionScopes(
  program: Program,
  resolveLibrary: LibraryResolver = resolveCompilerLibrary
): Effect.Effect<ResolvedActionScopes, TransformError, never> {
  return Effect.gen(function* () {
    const callablesByRoot = new Map<ActionScopeRoot, CallableAction[]>();
    const callablesOf = (root: ActionScopeRoot): CallableAction[] => {
      let callables = callablesByRoot.get(root);
      if (!callables) {
        callables = getCallableActions(root, resolveLibrary);
        callablesByRoot.set(root, callables);
      }
      return callables;
    };

    const programCallables = callablesOf(program);

    // The name the program calls each definition it can call by (first wins).
    const programNameOf = new Map<ActionDefinition, string>();
    for (const { name, action } of programCallables) {
      if (!programNameOf.has(action)) {
        programNameOf.set(action, name);
      }
    }

    // One unique qualifier per library document (its name, suffixed on clashes).
    const qualifierByLibrary = new Map<Library, string>();
    const usedQualifiers = new Set<string>();
    const qualifierOf = (library: Library): string => {
      let qualifier = qualifierByLibrary.get(library);
      if (!qualifier) {
        const base = library.name || 'library';
        qualifier = base;
        for (let n = 2; usedQualifiers.has(qualifier); n++) {
          qualifier = `${base}${n}`;
        }
        usedQualifiers.add(qualifier);
        qualifierByLibrary.set(library, qualifier);
      }
      return qualifier;
    };

    /** The name `callable` is emitted under when called from `callerRoot`. */
    const systemNameOf = (callable: CallableAction, callerRoot: ActionScopeRoot): string => {
      if (callerRoot === program) {
        return callable.name;
      }
      const programName = programNameOf.get(callable.action);
      if (programName !== undefined) {
        return programName;
      }
      const definingRoot = getActionScopeRoot(callable.action);
      return definingRoot && isLibrary(definingRoot)
        ? `${qualifierOf(definingRoot)}.${callable.action.name}`
        : callable.action.name;
    };

    const scopesByRoot = new Map<
      ActionScopeRoot,
      { scope: ActionDefinition[]; systemNames: Map<string, string> }
    >();
    const scopeOf = (root: ActionScopeRoot) => {
      let entry = scopesByRoot.get(root);
      if (!entry) {
        const callables = callablesOf(root);
        const systemNames = new Map<string, string>();
        for (const callable of callables) {
          if (!systemNames.has(callable.name)) {
            systemNames.set(callable.name, systemNameOf(callable, root));
          }
        }
        entry = {
          scope: callables.map(callable => renamed(callable.action, callable.name)),
          systemNames,
        };
        scopesByRoot.set(root, entry);
      }
      return entry;
    };

    const programScope = scopeOf(program).scope;

    const actionsToEmit: ActionToEmit[] = [];
    const emittedByName = new Map<string, ActionDefinition>();
    const queue: { callable: CallableAction; systemName: string }[] = [];
    const queued = new Set<string>();
    const enqueue = (callable: CallableAction, callerRoot: ActionScopeRoot) => {
      queue.push({ callable, systemName: systemNameOf(callable, callerRoot) });
    };
    for (const callable of programCallables) {
      if (!queued.has(callable.name)) {
        queued.add(callable.name); // a shadowed duplicate is never callable
        enqueue(callable, program);
      }
    }

    for (let i = 0; i < queue.length; i++) {
      const { callable, systemName } = queue[i];
      const existing = emittedByName.get(systemName);
      if (existing === callable.action) {
        continue; // already emitted under this name
      }
      if (existing) {
        const where = (action: ActionDefinition) =>
          AstUtils.getDocument(action).uri?.toString() ?? 'the program';
        const programDocument = AstUtils.getDocument(program);
        const inProgram = [callable.action, existing].find(
          action => AstUtils.getDocument(action) === programDocument
        );
        return yield* Effect.fail({
          _tag: 'TransformError' as const,
          kind: 'ValidationError' as const,
          message: `Action name '${systemName}' is used by two different actions (in ${where(existing)} and ${where(callable.action)}). Eligius action names are global, so every emitted action needs a unique name. Rename one of them.`,
          location: getSourceLocation(
            inProgram ?? findProgramImportNode(program, systemName) ?? program
          ),
        });
      }
      emittedByName.set(systemName, callable.action);

      // A library action's body is compiled against its own library's scope;
      // a program action's against the program's.
      const root = getActionScopeRoot(callable.action) ?? program;
      const { scope, systemNames } = scopeOf(root);
      actionsToEmit.push({
        definition: renamed(callable.action, systemName),
        scope,
        systemNames,
      });

      // Follow the actions this body calls (resolved in its own scope).
      const rootCallables = callablesOf(root);
      for (const call of AstUtils.streamAst(callable.action).filter(isOperationCall)) {
        const target = findCallableAction(getOperationCallName(call), rootCallables);
        if (target) {
          enqueue(target, root);
        }
      }
    }

    return { programScope, actionsToEmit };
  });
}
