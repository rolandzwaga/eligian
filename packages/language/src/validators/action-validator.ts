import { type AstNode, AstUtils, type Properties, type ValidationAcceptor } from 'langium';
import { hasOperation, validateControlFlowPairing } from '../compiler/index.js';
import type {
  ActionDefinition,
  BreakStatement,
  ContinueStatement,
  EndableActionDefinition,
  InlineEndableAction,
  OperationCall,
  OperationStatement,
  RegularActionDefinition,
} from '../generated/ast.js';
import { OperationDataTracker } from '../operation-data-tracker.js';
import { formatValidationMessage } from '../utils/error-builder.js';
import { getOperationCallName } from '../utils/operation-call-utils.js';
import { BaseValidator } from './base-validator.js';

/**
 * Validations for action definitions (control-flow pairing, erased properties,
 * recursion, visibility, break/continue).
 */
export class ActionValidator extends BaseValidator {
  /**
   * T039-T041: US2 - Check for action name collision with built-in operations
   * Emit error if action name matches an operation name
   */
  checkActionNameCollision(
    action: RegularActionDefinition | EndableActionDefinition,
    accept: ValidationAcceptor
  ): void {
    // T040: Check if action.name exists in operation registry
    if (hasOperation(action.name)) {
      // T041: Emit error with code and message
      // Feature 023 US5: Use consistent error code
      accept(
        'error',
        `Cannot define action '${action.name}': name conflicts with built-in operation`,
        {
          node: action,
          property: 'name',
          code: 'action_name_builtin_conflict',
        }
      );
    }
  }

  /**
   * Check for recursive action calls that would cause infinite loops.
   *
   * Detects both direct recursion (action calls itself) and indirect recursion
   * (cycle through multiple actions: A → B → A).
   *
   * Uses depth-first search with visited tracking to detect cycles in the
   * action call graph.
   *
   * @param action - The action definition to check
   * @param accept - Validation acceptor for reporting errors
   */
  checkRecursiveActionCalls(
    action: RegularActionDefinition | EndableActionDefinition,
    accept: ValidationAcceptor
  ): void {
    // Track action names in current call chain to detect cycles
    const callChain: string[] = [action.name];

    // B24: actions whose entire call subtree has already been explored (and
    // found cycle-free relative to the current root). Without this, an action
    // reachable via N distinct paths is re-explored from scratch each time,
    // giving O(M^N) worst-case blow-up. This is standard DFS coloring: `chain`
    // is the recursion stack (gray) used to detect back-edges, `visited` is the
    // finished set (black). A finished node cannot be part of an undiscovered
    // cycle, so it is safe to prune.
    const visited = new Set<string>();

    // Helper: Recursively check for cycles starting from an action
    const checkForCycles = (
      currentAction: RegularActionDefinition | EndableActionDefinition,
      chain: string[]
    ): void => {
      // Get all operation calls from the action body
      const operationCalls = this.getAllOperationCalls(currentAction);

      for (const opCall of operationCalls) {
        // Check if this is a custom action call (not a built-in operation)
        const actionRef = opCall.operationName.ref;
        if (!actionRef) {
          // Not resolved or is a built-in operation - skip
          continue;
        }

        const calledActionName = opCall.operationName.$refText;

        // Check if this action is already in our call chain (cycle detected!)
        if (chain.includes(calledActionName)) {
          // Found a cycle - report error
          const cycleChain = [...chain, calledActionName].join(' → ');
          accept(
            'error',
            `Recursive action call detected: '${calledActionName}' creates an infinite loop\n  Call chain: ${cycleChain}`,
            {
              node: opCall,
              property: 'operationName',
              code: 'recursive_action_call',
            }
          );
        } else if (!visited.has(calledActionName)) {
          // No cycle yet and not already fully explored - recurse deeper
          checkForCycles(actionRef, [...chain, calledActionName]);
        }
      }

      // Done with this action's subtree - mark finished so other paths skip it.
      visited.add(currentAction.name);
    };

    // Start cycle detection from this action
    checkForCycles(action, callChain);
  }

  /**
   * Helper: Get all OperationCall nodes from an action's body.
   *
   * Handles both RegularActionDefinition and EndableActionDefinition by
   * checking their respective operation lists.
   *
   * @param action - The action definition to extract calls from
   * @returns Array of all OperationCall nodes found in the action
   */
  private getAllOperationCalls(
    action: RegularActionDefinition | EndableActionDefinition
  ): OperationCall[] {
    const calls: OperationCall[] = [];

    if (action.$type === 'RegularActionDefinition') {
      // Regular action: check operations array
      this.collectOperationCallsFromStatements(action.operations, calls);
    } else if (action.$type === 'EndableActionDefinition') {
      // Endable action: check both startOperations and endOperations
      this.collectOperationCallsFromStatements(action.startOperations, calls);
      this.collectOperationCallsFromStatements(action.endOperations, calls);
    }

    return calls;
  }

  /**
   * Helper: Recursively collect OperationCall nodes from operation statements.
   *
   * Handles nested structures like if statements, for loops, and sequence blocks.
   *
   * @param statements - Array of operation statements to search
   * @param calls - Array to accumulate found OperationCall nodes
   */
  private collectOperationCallsFromStatements(
    statements: OperationStatement[],
    calls: OperationCall[]
  ): void {
    for (const stmt of statements) {
      if (stmt.$type === 'OperationCall') {
        // Direct operation call
        calls.push(stmt);
      } else if (stmt.$type === 'IfStatement') {
        // Recursively check if/else branches
        this.collectOperationCallsFromStatements(stmt.thenOps, calls);
        this.collectOperationCallsFromStatements(stmt.elseOps, calls);
      } else if (stmt.$type === 'ForStatement') {
        // Recursively check for loop body
        this.collectOperationCallsFromStatements(stmt.body, calls);
      }
      // VariableDeclaration, BreakStatement, ContinueStatement don't contain calls
    }
  }

  /**
   * Shared implementation for control flow pairing validation.
   * Checks that when/endWhen and forEach/endForEach are properly paired within
   * a single operation list, reporting any errors against the given node/property.
   */
  private validateControlFlowPairingForOps<N extends AstNode>(
    operations: AstNode[],
    node: N,
    property: Properties<N>,
    accept: ValidationAcceptor
  ): void {
    // Filter to only OperationCall (not IfStatement, ForStatement, VariableDeclaration)
    const operationNames = operations
      .filter(op => op.$type === 'OperationCall')
      .map(op => getOperationCallName(op as OperationCall))
      .filter((name): name is string => name !== undefined);
    const errors = validateControlFlowPairing(operationNames);

    for (const error of errors) {
      const message = formatValidationMessage(error.message, error.hint);

      accept('error', message, {
        node,
        property,
        code: error.code.toLowerCase(),
      });
    }
  }

  /**
   * Validate control flow pairing in regular action operations.
   * Checks that when/endWhen and forEach/endForEach are properly paired.
   */
  checkControlFlowPairing(action: RegularActionDefinition, accept: ValidationAcceptor): void {
    this.validateControlFlowPairingForOps(action.operations, action, 'operations', accept);
  }

  /**
   * Validate control flow pairing in endable action start operations.
   */
  checkControlFlowPairingInStartOps(
    action: EndableActionDefinition,
    accept: ValidationAcceptor
  ): void {
    this.validateControlFlowPairingForOps(
      action.startOperations,
      action,
      'startOperations',
      accept
    );
  }

  /**
   * Validate control flow pairing in endable action end operations.
   */
  checkControlFlowPairingInEndOps(
    action: EndableActionDefinition,
    accept: ValidationAcceptor
  ): void {
    this.validateControlFlowPairingForOps(action.endOperations, action, 'endOperations', accept);
  }

  /**
   * Validate control flow pairing in inline endable action start operations.
   */
  checkControlFlowPairingInInlineStart(
    action: InlineEndableAction,
    accept: ValidationAcceptor
  ): void {
    this.validateControlFlowPairingForOps(
      action.startOperations,
      action,
      'startOperations',
      accept
    );
  }

  /**
   * Validate control flow pairing in inline endable action end operations.
   */
  checkControlFlowPairingInInlineEnd(
    action: InlineEndableAction,
    accept: ValidationAcceptor
  ): void {
    this.validateControlFlowPairingForOps(action.endOperations, action, 'endOperations', accept);
  }

  /**
   * Validate erased properties in regular action operations.
   * Checks that operations don't access properties erased by previous operations.
   */
  checkErasedPropertiesInAction(action: RegularActionDefinition, accept: ValidationAcceptor): void {
    this.validateOperationSequence(action.operations, accept, action);
  }

  /**
   * Validate erased properties in endable action start operations.
   */
  checkErasedPropertiesInStartOps(
    action: EndableActionDefinition,
    accept: ValidationAcceptor
  ): void {
    this.validateOperationSequence(action.startOperations, accept, action);
  }

  /**
   * Validate erased properties in endable action end operations.
   */
  checkErasedPropertiesInEndOps(action: EndableActionDefinition, accept: ValidationAcceptor): void {
    this.validateOperationSequence(action.endOperations, accept, action);
  }

  /**
   * Validate erased properties in inline endable action start operations.
   */
  checkErasedPropertiesInInlineStart(
    action: InlineEndableAction,
    accept: ValidationAcceptor
  ): void {
    this.validateOperationSequence(action.startOperations, accept, action);
  }

  /**
   * Validate erased properties in inline endable action end operations.
   */
  checkErasedPropertiesInInlineEnd(action: InlineEndableAction, accept: ValidationAcceptor): void {
    this.validateOperationSequence(action.endOperations, accept, action);
  }

  /**
   * Helper: Validate a sequence of operation statements for erased property access.
   *
   * Walks through operation sequence and tracks operationData state using OperationDataTracker.
   * Reports errors when operations have missing dependencies (properties that were erased
   * or never created).
   *
   * @param operations - Sequence of operation statements to validate
   * @param accept - Validation acceptor for reporting errors
   * @param context - Parent action node for error reporting
   * @param tracker - Optional tracker to continue from (for nested scopes)
   */
  private validateOperationSequence(
    operations: Array<OperationStatement>,
    accept: ValidationAcceptor,
    context: RegularActionDefinition | EndableActionDefinition | InlineEndableAction,
    tracker?: OperationDataTracker
  ): void {
    // Create new tracker if not provided (top-level call)
    const currentTracker = tracker ?? new OperationDataTracker();

    // Walk through operations and track operationData state
    for (const statement of operations) {
      if (statement.$type === 'OperationCall') {
        const opName = getOperationCallName(statement);

        // Only validate if operation exists (avoid duplicate errors)
        if (!hasOperation(opName)) {
          continue;
        }

        // Check if this operation has missing dependencies
        const missingDependencies = currentTracker.processOperation(opName);

        // Report errors for missing dependencies
        for (const depName of missingDependencies) {
          const erasurePoint = currentTracker.findErasurePoint(depName);

          if (erasurePoint) {
            // Property was erased by a previous operation
            accept(
              'error',
              `Property '${depName}' is not available - it was erased by operation '${erasurePoint.operation}'`,
              {
                node: statement,
                property: 'operationName',
                code: 'erased-property-access',
              }
            );
          } else {
            // Property was never created (dependency not satisfied)
            accept(
              'error',
              `Property '${depName}' is not available - ensure it is created by a previous operation`,
              {
                node: statement,
                property: 'operationName',
                code: 'missing-dependency',
              }
            );
          }
        }
      } else if (statement.$type === 'IfStatement') {
        // Handle if/else branches (T255: Control flow support)
        // Validate both branches with current tracker state
        // Note: For a complete implementation, we would need to merge both branch states
        // and only keep properties available in BOTH branches
        this.validateOperationSequence(statement.thenOps, accept, context, currentTracker.clone());
        this.validateOperationSequence(statement.elseOps, accept, context, currentTracker.clone());
      } else if (statement.$type === 'ForStatement') {
        // Handle loop body (T255: Control flow support)
        // Validate loop body with current tracker state
        // Note: Full loop analysis would require fixed-point iteration
        // to determine which properties are stable across all iterations
        this.validateOperationSequence(statement.body, accept, context, currentTracker.clone());
      } else if (statement.$type === 'VariableDeclaration') {
      }
    }
  }

  /**
   * T056: US3 - Validate 'private' keyword only used in libraries
   *
   * The 'private' visibility modifier can only be used in library files, not in program files.
   * This validator checks action definitions and ensures private actions are only in libraries.
   */
  checkPrivateOnlyInLibraries(action: ActionDefinition, accept: ValidationAcceptor): void {
    // Check if action has 'private' visibility
    if (action.visibility !== 'private') {
      return; // Action is not private - no validation needed
    }

    // Get the containing file (either Program or Library)
    const document = AstUtils.getDocument(action);
    const model = document.parseResult.value;

    // If the file is not a Library, private is not allowed
    if (model.$type !== 'Library') {
      accept(
        'error',
        `Visibility modifier 'private' can only be used in library files. Program files cannot contain private actions.`,
        {
          node: action,
          property: 'visibility',
          code: 'private_only_in_libraries',
        }
      );
    }
  }

  /**
   * Validate that 'break' statement only appears inside a for loop.
   *
   * Break/continue syntactic sugar only works with forEach operations,
   * so they can only be used inside for loops.
   */
  checkBreakInsideLoop(stmt: BreakStatement, accept: ValidationAcceptor): void {
    if (!this.isInsideForLoop(stmt)) {
      accept('error', "'break' can only be used inside a loop", {
        node: stmt,
      });
    }
  }

  /**
   * Validate that 'continue' statement only appears inside a for loop.
   *
   * Break/continue syntactic sugar only works with forEach operations,
   * so they can only be used inside for loops.
   */
  checkContinueInsideLoop(stmt: ContinueStatement, accept: ValidationAcceptor): void {
    if (!this.isInsideForLoop(stmt)) {
      accept('error', "'continue' can only be used inside a loop", {
        node: stmt,
      });
    }
  }

  /**
   * Helper: Check if an AST node is inside a ForStatement.
   *
   * Walks up the AST container chain looking for a ForStatement.
   */
  private isInsideForLoop(node: BreakStatement | ContinueStatement): boolean {
    let current: any = node.$container;

    while (current) {
      if (current.$type === 'ForStatement') {
        return true;
      }
      current = current.$container;
    }

    return false;
  }
}
