/**
 * Custom Scope Provider for Eligian DSL
 *
 * Handles scoping for:
 * - Parameter references (action parameters)
 * - Variable references (global and local const declarations)
 * - HTML imports (NamedImport nodes with .html extension) - Feature 015
 * - Action references (custom action calls in OperationCall nodes) - Feature 007
 *
 * Based on Langium scoping architecture.
 */

import {
  type AstNode,
  AstUtils,
  DefaultScopeProvider,
  EMPTY_SCOPE,
  type ReferenceInfo,
  type Scope,
  WorkspaceCache,
} from 'langium';
import { resolveLibraryPath } from './compiler/pipeline.js';
import type { EligianServices } from './eligian-module.js';
import {
  type ActionDefinition,
  isActionDefinition,
  isActionImport,
  isEventActionDefinition,
  isLibrary,
  isLibraryImport,
  isNamedImport,
  isOperationCall,
  isParameterReference,
  isProgram,
  isVariableDeclaration,
  isVariableReference,
  type NamedImport,
  type VariableDeclaration,
} from './generated/ast.js';
import {
  type CallableAction,
  findCallableAction,
  getActionScopeRoot,
  getCallableActions,
  type LibraryResolver,
} from './utils/action-scope.js';

export class EligianScopeProvider extends DefaultScopeProvider {
  private eligianServices: EligianServices;

  /**
   * Memoizes {@link getCallableActions} per document URI.
   *
   * The callable set was previously recomputed for every `OperationCall`
   * during scoping and validation, each time re-resolving the imported
   * libraries.
   *
   * A `WorkspaceCache` is the correct invalidation strategy here: the result
   * depends on *other* documents (the imported libraries), so it must be evicted
   * whenever any document in the workspace is added, changed, or deleted —
   * exactly `WorkspaceCache`'s contract. A naive `Map` would hold stale library
   * AST nodes across rebuilds (a correctness hazard), and a `DocumentCache`
   * keyed on the importing document would miss changes to the libraries it
   * imports.
   */
  private readonly callableActionsCache: WorkspaceCache<string, readonly CallableAction[]>;

  constructor(services: EligianServices) {
    super(services);
    this.eligianServices = services;
    this.callableActionsCache = new WorkspaceCache(services.shared);
  }

  override getScope(context: ReferenceInfo): Scope {
    // Handle parameter references
    if (isParameterReference(context.container) && context.property === 'parameter') {
      return this.getScopeForParameterReference(context);
    }

    // Handle variable references
    if (isVariableReference(context.container) && context.property === 'variable') {
      return this.getScopeForVariableReference(context);
    }

    // Feature 007: Handle action references in OperationCall nodes
    if (isOperationCall(context.container) && context.property === 'operationName') {
      return this.getScopeForActionReference(context);
    }

    // Feature 023: Handle action imports (filter private actions from library exports)
    if (isActionImport(context.container) && context.property === 'action') {
      return this.getScopeForActionImport(context);
    }

    // Default scope resolution for everything else
    return super.getScope(context);
  }

  /**
   * Get scope for action references in OperationCall nodes (Feature 007, 023, 032).
   *
   * Returns the actions callable from the document the call is in (see
   * {@link getCallableActions}). The reference will:
   * - Resolve to an ActionDefinition if an action with that name is in scope
   * - Remain unresolved (ref = undefined) if it's a built-in operation
   *
   * This enables "Go to Definition" and hover for custom action calls while
   * allowing built-in operation calls to work normally.
   */
  private getScopeForActionReference(context: ReferenceInfo): Scope {
    const callables = this.getCallableActions(context.container);
    if (callables.length === 0) {
      return EMPTY_SCOPE;
    }

    // Imported actions are described under the name they are called by (their
    // alias, when aliased) and point at the document that defines them.
    const actionDescriptions = callables.map(({ name, action }) =>
      this.descriptions.createDescription(action, name, AstUtils.getDocument(action))
    );
    return this.createScope(actionDescriptions);
  }

  /**
   * The actions callable by name from the Program or Library containing
   * `node`: its own actions (for a library, private ones included) plus the
   * actions it imports directly, under their alias when aliased. Imports are
   * not re-exported, so a program never sees a library's private helpers or
   * the actions that library imports.
   *
   * Shared with the operation-call validators so resolution, validation and
   * the compiler (`resolveActionScopes`) agree.
   */
  public getCallableActions(node: AstNode): readonly CallableAction[] {
    const root = getActionScopeRoot(node);
    if (!root) {
      return [];
    }
    const cacheKey = AstUtils.getDocument(root).uri?.toString();
    if (!cacheKey) {
      return getCallableActions(root, this.resolveLibrary);
    }
    return this.callableActionsCache.get(cacheKey, () =>
      getCallableActions(root, this.resolveLibrary)
    );
  }

  /**
   * Find the action called `name` from inside the Program or Library containing
   * `node` (local, library-internal or imported, alias-aware).
   */
  public findCallableAction(name: string, node: AstNode): ActionDefinition | undefined {
    return findCallableAction(name, this.getCallableActions(node))?.action;
  }

  /** Resolve a library import path against this workspace's documents. */
  private readonly resolveLibrary: LibraryResolver = (fromUri, importPath) => {
    const libraryUri = resolveLibraryPath(fromUri, importPath);
    const value =
      this.eligianServices.shared.workspace.LangiumDocuments.getDocument(libraryUri)?.parseResult
        .value;
    return value && isLibrary(value) ? value : undefined;
  };

  /**
   * Get scope for parameter references (bare identifiers in action bodies).
   *
   * Parameters are only visible within their containing action (Feature 028 - T018).
   * Handles both regular actions and event actions.
   */
  private getScopeForParameterReference(context: ReferenceInfo): Scope {
    // Find the containing action definition (regular or event action)
    const actionDef = AstUtils.getContainerOfType(context.container, isActionDefinition);
    const eventActionDef = AstUtils.getContainerOfType(context.container, isEventActionDefinition);

    const container = actionDef || eventActionDef;

    if (!container) {
      // Parameter references are only valid inside actions
      return this.getGlobalScope('Parameter', context);
    }

    // Get all parameters from the action (regular or event action)
    const parameters = container.parameters || [];

    // Create scope from parameters
    return this.createScopeForNodes(parameters);
  }

  /**
   * Get scope for variable references (@varName).
   *
   * Variables can be:
   * - HTML imports: NamedImport nodes with .html extension (Feature 015)
   * - Local: declared within the current action body (with const)
   * - Global: declared at program level (with const)
   *
   * Local variables shadow global ones.
   */
  private getScopeForVariableReference(context: ReferenceInfo): Scope {
    const document = AstUtils.getDocument(context.container);

    // Collect all visible variable declarations
    const visibleVariables = this.getVisibleVariables(context.container);

    // Collect HTML imports (Feature 015)
    const htmlImports = this.getHTMLImports(context.container);

    // Create descriptions for all nodes
    // HTML imports are treated as VariableDeclarations for scoping purposes
    const descriptions = [
      ...htmlImports.map(imp => this.descriptions.createDescription(imp, imp.name, document)),
      ...visibleVariables.map(varDecl =>
        this.descriptions.createDescription(varDecl, varDecl.name, document)
      ),
    ];

    // Create scope from descriptions
    return this.createScope(descriptions);
  }

  /**
   * Collect all HTML imports from the program (Feature 015).
   *
   * HTML imports are NamedImport nodes that either:
   * - Have explicit assetType='html'
   * - Have .html file extension
   *
   * These are treated like constants and can be referenced with @variableName.
   *
   * Feature 032 US3: Library files may have library imports but not HTML imports.
   */
  private getHTMLImports(node: AstNode): NamedImport[] {
    const model = AstUtils.getDocument(node).parseResult.value;

    // Library files cannot have HTML imports (only library imports allowed)
    if (isLibrary(model)) {
      return [];
    }

    // For Program files, get all statements
    if (isProgram(model)) {
      // Get all statements (includes both imports and program elements)
      const allStatements = model.statements || [];

      // Filter to only NamedImport nodes
      // TypeScript doesn't understand that isNamedImport narrows the type, so we use type assertion
      const imports = allStatements.filter(isNamedImport) as unknown as NamedImport[];

      // Filter to only HTML imports (explicit type or .html extension)
      return imports.filter(imp => {
        const explicitType = imp.assetType === 'html';
        const htmlExtension = imp.path.endsWith('.html');
        return explicitType || htmlExtension;
      });
    }

    return [];
  }

  /**
   * Collect the variable declarations visible from the given node, nearest
   * first.
   *
   * Local consts are lexically scoped: walking up from the reference, each
   * enclosing statement list (action / event action body, endable start and
   * end blocks, inline endable and stagger blocks, then / else branches, for
   * bodies) contributes the consts declared BEFORE the statement that contains
   * the reference, the closest declaration first. So a const is not visible
   * before its declaration, after the block it is declared in, in a sibling
   * branch, or in its own initializer. The end block of an endable action
   * (named or inline) or of an inline stagger block also sees every const of
   * its start block, which runs first: the compiler transforms both blocks with
   * one scope and inlines foldable consts. A non-foldable start-block const is a
   * runtime variable that Eligius does not carry over to the end operations, so
   * the validator reports such references
   * (ExpressionValidator.checkEndBlockConstReference).
   *
   * Program-level consts come last (they are globals, visible everywhere), so
   * a local shadows a global of the same name.
   */
  private getVisibleVariables(node: AstNode): VariableDeclaration[] {
    const variables: VariableDeclaration[] = [];
    const seenNames = new Set<string>();
    const add = (varDecl: VariableDeclaration): void => {
      if (!seenNames.has(varDecl.name)) {
        variables.push(varDecl);
        seenNames.add(varDecl.name);
      }
    };

    let child: AstNode = node;
    let parent = node.$container;
    while (parent && !isProgram(parent) && !isLibrary(parent)) {
      for (const varDecl of getPrecedingDeclarations(child, parent)) {
        add(varDecl);
      }
      child = parent;
      parent = parent.$container;
    }

    // Global variables: only top-level statements count as globals. Descending
    // into the whole AST (streamAst) would leak actions' local declarations.
    const program = AstUtils.getDocument(node).parseResult.value;
    if (isProgram(program)) {
      for (const varDecl of program.statements.filter(isVariableDeclaration)) {
        add(varDecl);
      }
    }

    return variables;
  }

  /**
   * Get scope for action imports from library files (Feature 023 - User Story 3).
   *
   * Filters out private actions from the library exports, making only public actions
   * available for import. This enforces encapsulation and allows library authors to
   * hide implementation details.
   *
   * Algorithm:
   * 1. Get the LibraryImport statement containing this ActionImport
   * 2. Resolve the library file path relative to current document
   * 3. Load the library document using Langium's document provider
   * 4. Filter actions to only include public ones (visibility !== 'private')
   * 5. Return scope containing only public actions
   */
  private getScopeForActionImport(context: ReferenceInfo): Scope {
    // Get the LibraryImport statement containing this ActionImport
    const libraryImport = AstUtils.getContainerOfType(context.container, isLibraryImport);

    if (!libraryImport) {
      // ActionImport should always be inside a LibraryImport
      return EMPTY_SCOPE;
    }

    // Get current document URI
    const currentDocument = AstUtils.getDocument(context.container);
    const currentUri = currentDocument.uri;
    if (!currentUri) {
      return EMPTY_SCOPE;
    }

    // Resolve library path using same logic as pipeline.ts
    const importPath = libraryImport.path;
    const resolvedUri = resolveLibraryPath(currentUri, importPath);

    // Load library document using Langium's document provider
    const documents = this.eligianServices.shared.workspace.LangiumDocuments;
    const libraryDoc = documents.getDocument(resolvedUri);

    if (!libraryDoc?.parseResult.value) {
      // Library file not found or has parse errors (validation will handle this)
      return EMPTY_SCOPE;
    }

    // Get the library AST node
    const library = libraryDoc.parseResult.value;

    if (!isLibrary(library)) {
      // Referenced file is not a library (validation will handle this)
      return EMPTY_SCOPE;
    }

    // Filter actions to only include public ones (exclude private actions)
    const publicActions = (library.actions || []).filter(action => action.visibility !== 'private');

    if (publicActions.length === 0) {
      // No public actions available in library
      return EMPTY_SCOPE;
    }

    // Create AstNodeDescription for each public action
    const actionDescriptions = publicActions.map(action =>
      this.descriptions.createDescription(action, action.name, libraryDoc)
    );

    // Return scope with only public actions
    return this.createScope(actionDescriptions);
  }
}

/**
 * The const declarations that precede `child` in the statement list of
 * `parent` holding it, nearest first. Empty when `child` is not held in a
 * list (e.g. an if condition). Only statement lists can hold
 * VariableDeclarations, so any other list (call arguments, object literal
 * properties) contributes nothing.
 */
function getPrecedingDeclarations(child: AstNode, parent: AstNode): VariableDeclaration[] {
  const index = child.$containerIndex;
  const property = child.$containerProperty;
  if (index === undefined || property === undefined) {
    return [];
  }
  const siblings = (parent as unknown as Record<string, unknown>)[property];
  if (!Array.isArray(siblings)) {
    return [];
  }
  const declarations: VariableDeclaration[] = [];
  for (let i = index - 1; i >= 0; i--) {
    const sibling: unknown = siblings[i];
    if (isVariableDeclaration(sibling)) {
      declarations.push(sibling);
    }
  }
  // An end block also sees the consts of its start block, last first.
  const startProperty = START_LIST_OF_END_LIST[property];
  const startList = startProperty
    ? (parent as unknown as Record<string, unknown>)[startProperty]
    : undefined;
  if (Array.isArray(startList)) {
    for (let i = startList.length - 1; i >= 0; i--) {
      const statement: unknown = startList[i];
      if (isVariableDeclaration(statement)) {
        declarations.push(statement);
      }
    }
  }
  return declarations;
}

/**
 * End-block property → start-block property of the same node: endable action
 * definitions and inline endable actions (`endOperations`), inline stagger
 * blocks (`endOps`).
 */
const START_LIST_OF_END_LIST: Readonly<Record<string, string>> = {
  endOperations: 'startOperations',
  endOps: 'startOps',
};
