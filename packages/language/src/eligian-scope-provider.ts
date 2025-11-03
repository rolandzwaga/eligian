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
} from 'langium';
import { URI } from 'vscode-uri';
import type { EligianServices } from './eligian-module.js';
import {
  type ActionDefinition,
  isActionDefinition,
  isActionImport,
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
import { getElements } from './utils/program-helpers.js';

export class EligianScopeProvider extends DefaultScopeProvider {
  private eligianServices: EligianServices;

  constructor(services: EligianServices) {
    super(services);
    this.eligianServices = services;
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
   * Get scope for action references in OperationCall nodes (Feature 007 + Feature 023).
   *
   * Returns all ActionDefinition nodes from the document. The reference will:
   * - Resolve to an ActionDefinition if an action with that name exists
   * - Remain unresolved (ref = undefined) if it's a built-in operation
   *
   * This enables "Go to Definition" for custom action calls while allowing
   * built-in operation calls to work normally.
   *
   * Feature 023: Now handles both Program and Library files, plus imported actions (User Story 4).
   */
  private getScopeForActionReference(context: ReferenceInfo): Scope {
    // Get the document containing this OperationCall
    const document = AstUtils.getDocument(context.container);
    const model = document.parseResult.value;

    // Get all ActionDefinition nodes - works for both Program and Library
    let actionDefinitions: ActionDefinition[] = [];

    if (isProgram(model)) {
      // Program: get actions from program elements
      actionDefinitions = getElements(model).filter(isActionDefinition);

      // Feature 023 US4: Also include imported actions from library files
      const importedActions = this.getImportedActions(model);
      actionDefinitions.push(...importedActions);
    } else if (isLibrary(model)) {
      // Library: get actions directly from library.actions array
      actionDefinitions = model.actions || [];
    }

    if (actionDefinitions.length === 0) {
      // No actions defined in document
      return EMPTY_SCOPE;
    }

    // Create AstNodeDescription for each action
    // For imported actions, use the alias name if provided, otherwise use original name
    const actionDescriptions = actionDefinitions.map(action => {
      const name = this.getActionNameForScope(action, model);
      // Get the document where the action is defined (might be a library file)
      const actionDoc = AstUtils.getDocument(action);
      return this.descriptions.createDescription(action, name, actionDoc);
    });

    // Return scope with all available actions
    return this.createScope(actionDescriptions);
  }

  /**
   * Get all actions imported from library files (Feature 023 - User Story 4).
   *
   * Collects actions from all LibraryImport statements in the program,
   * resolving the library file and retrieving the action definitions.
   */
  private getImportedActions(program: any): ActionDefinition[] {
    const importedActions: ActionDefinition[] = [];

    // Get all LibraryImport statements
    const statements = program.statements || [];
    const libraryImports = statements.filter(isLibraryImport);

    for (const libraryImport of libraryImports) {
      // Resolve library file
      const currentUri = AstUtils.getDocument(program).uri;
      if (!currentUri) continue;

      const originalPath = libraryImport.path;
      let importPath = originalPath;
      if (importPath.startsWith('./')) {
        importPath = importPath.substring(2);
      }
      const documentUriStr = currentUri.toString();
      const documentDir = documentUriStr.substring(0, documentUriStr.lastIndexOf('/'));
      const resolvedUri = URI.parse(`${documentDir}/${importPath}`);

      // Load library document
      const documents = this.eligianServices.shared.workspace.LangiumDocuments;
      const libraryDoc = documents.getDocument(resolvedUri);

      if (!libraryDoc || !libraryDoc.parseResult.value) continue;

      const library = libraryDoc.parseResult.value;
      if (!isLibrary(library)) continue;

      // Add each imported action to the list
      for (const actionImport of libraryImport.actions) {
        const actionName = actionImport.action.$refText || '';
        const action = library.actions?.find(a => a.name === actionName);

        if (action) {
          importedActions.push(action);
        }
      }
    }

    return importedActions;
  }

  /**
   * Get the name to use for an action in the scope (Feature 023 - User Story 4).
   *
   * For imported actions with aliases, use the alias name.
   * Otherwise, use the original action name.
   */
  private getActionNameForScope(action: ActionDefinition, model: any): string {
    // If model is not a Program, just use the action name
    if (!isProgram(model)) {
      return action.name;
    }

    // Check if this action is imported with an alias
    const statements = model.statements || [];
    const libraryImports = statements.filter(isLibraryImport);

    for (const libraryImport of libraryImports) {
      for (const actionImport of libraryImport.actions) {
        // Check if this actionImport references the same action
        if (actionImport.action.ref === action && actionImport.alias) {
          return actionImport.alias;
        }
      }
    }

    // No alias found, use original name
    return action.name;
  }

  /**
   * Get scope for parameter references (bare identifiers in action bodies).
   *
   * Parameters are only visible within their containing action.
   */
  private getScopeForParameterReference(context: ReferenceInfo): Scope {
    // Find the containing action definition
    const actionDef = AstUtils.getContainerOfType(context.container, isActionDefinition);

    if (!actionDef) {
      // Parameter references are only valid inside actions
      return this.getGlobalScope('Parameter', context);
    }

    // Get all parameters from the action
    const parameters = actionDef.parameters || [];

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
   * Feature 023: Library files don't have imports, so return empty array.
   */
  private getHTMLImports(node: AstNode): NamedImport[] {
    const model = AstUtils.getDocument(node).parseResult.value;

    // Library files cannot have imports (validated elsewhere)
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
   * Collect all variable declarations visible from the given node.
   *
   * Walks up the AST tree collecting:
   * 1. Local variables (declared in action body)
   * 2. Global variables (declared at program level)
   *
   * Local variables shadow globals with the same name.
   */
  private getVisibleVariables(node: AstNode): VariableDeclaration[] {
    const variables: VariableDeclaration[] = [];
    const seenNames = new Set<string>();

    // Walk up the AST from the reference node
    let current: AstNode | undefined = node;

    while (current) {
      // If we're inside an action, collect local variables
      if (isActionDefinition(current)) {
        const localVars = this.getLocalVariables(current);
        for (const varDecl of localVars) {
          if (!seenNames.has(varDecl.name)) {
            variables.push(varDecl);
            seenNames.add(varDecl.name);
          }
        }
      }

      // Move up to parent
      current = current.$container;
    }

    // Get global variables from program root
    const program = AstUtils.getDocument(node).parseResult.value;
    const globalVars = AstUtils.streamAst(program).filter(isVariableDeclaration).toArray();

    for (const varDecl of globalVars) {
      if (!seenNames.has(varDecl.name)) {
        variables.push(varDecl);
        seenNames.add(varDecl.name);
      }
    }

    return variables;
  }

  /**
   * Get all local variable declarations within an action.
   *
   * Recursively walks through the action's operations to find all const declarations.
   */
  private getLocalVariables(actionDef: AstNode): VariableDeclaration[] {
    const variables: VariableDeclaration[] = [];

    // Get all operation statements from the action
    const operations = isActionDefinition(actionDef)
      ? 'startOperations' in actionDef
        ? actionDef.startOperations
        : actionDef.operations
      : [];

    // Recursively collect all variable declarations from operations
    const collectVars = (nodes: AstNode[]): void => {
      for (const node of nodes) {
        if (isVariableDeclaration(node)) {
          variables.push(node);
        }
        // Recursively check children (for if statements, for loops, etc.)
        // Use streamContents to get only children (not the node itself)
        const children = AstUtils.streamContents(node).toArray();
        if (children.length > 0) {
          collectVars(children);
        }
      }
    };

    collectVars(operations as AstNode[]);

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

    // Resolve library path relative to current document
    // Use URI-based resolution to handle both real file paths and test URIs (file:///test/...)
    const originalPath = libraryImport.path;
    let importPath = originalPath;
    // Normalize ./ prefix for URI resolution
    if (importPath.startsWith('./')) {
      importPath = importPath.substring(2);
    }
    const documentUriStr = currentUri.toString();
    const documentDir = documentUriStr.substring(0, documentUriStr.lastIndexOf('/'));
    const resolvedUri = URI.parse(`${documentDir}/${importPath}`);

    // Load library document using Langium's document provider
    const documents = this.eligianServices.shared.workspace.LangiumDocuments;
    const libraryDoc = documents.getDocument(resolvedUri);

    if (!libraryDoc || !libraryDoc.parseResult.value) {
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
