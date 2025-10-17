/**
 * Custom Scope Provider for Eligian DSL
 *
 * Handles scoping for:
 * - Parameter references (action parameters)
 * - Variable references (global and local const declarations)
 *
 * Based on Langium scoping architecture.
 */

import {
  type AstNode,
  AstUtils,
  DefaultScopeProvider,
  type ReferenceInfo,
  type Scope,
} from 'langium';
import {
  isActionDefinition,
  isParameterReference,
  isVariableDeclaration,
  isVariableReference,
  type VariableDeclaration,
} from './generated/ast.js';

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

    // Default scope resolution for everything else
    return super.getScope(context);
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
   * - Local: declared within the current action body (with const)
   * - Global: declared at program level (with const)
   *
   * Local variables shadow global ones.
   */
  private getScopeForVariableReference(context: ReferenceInfo): Scope {
    // Collect all visible variable declarations
    const visibleVariables = this.getVisibleVariables(context.container);

    // Create scope from variable declarations
    return this.createScopeForNodes(visibleVariables);
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
