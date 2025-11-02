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
import {
  type ActionDefinition,
  isActionDefinition,
  isLibrary,
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
   * Feature 023: Now handles both Program and Library files.
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
    } else if (isLibrary(model)) {
      // Library: get actions directly from library.actions array
      actionDefinitions = model.actions || [];
    }

    if (actionDefinitions.length === 0) {
      // No actions defined in document
      return EMPTY_SCOPE;
    }

    // Create AstNodeDescription for each action
    const actionDescriptions = actionDefinitions.map(action =>
      this.descriptions.createDescription(action, action.name, document)
    );

    // Return scope with all available actions
    return this.createScope(actionDescriptions);
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
}
