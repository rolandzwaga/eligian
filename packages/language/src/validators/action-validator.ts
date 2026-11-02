import { type AstNode, AstUtils, type Properties, type ValidationAcceptor } from 'langium';
import { hasOperation } from '../compiler/index.js';
import type {
  ActionDefinition,
  BreakStatement,
  ContinueStatement,
  EndableActionDefinition,
  InlineEndableAction,
  OperationCall,
  OperationStatement,
  RegularActionDefinition,
  SequenceBlock,
  SequenceItem,
  TimelineLifecycle,
} from '../generated/ast.js';
import { BaseValidator } from './base-validator.js';
import { reportControlFlowPairing } from './control-flow-pairing.js';
import { RESERVED_KEYWORDS } from './validation-constants.js';

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
    if (hasOperation(action.name, action)) {
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
   * Validate regular/endable action parameters (same rules as event actions):
   * - Parameters must not use reserved keywords (`reserved_keyword_parameter`)
   * - No duplicate parameter names (`duplicate_parameter`, on the later one)
   *
   * ParameterReference resolves by name, so a duplicate would silently shadow
   * the other parameter and collapse both into one operationData key.
   */
  checkActionParameters(
    action: RegularActionDefinition | EndableActionDefinition,
    accept: ValidationAcceptor
  ): void {
    const parameters = action.parameters;
    if (parameters.length === 0) {
      return;
    }

    for (const param of parameters) {
      if (RESERVED_KEYWORDS.has(param.name)) {
        accept('error', `Parameter name '${param.name}' is a reserved keyword and cannot be used`, {
          node: param,
          property: 'name',
          code: 'reserved_keyword_parameter',
        });
      }
    }

    this.reportDuplicatesByName(
      parameters,
      param => `Duplicate parameter name '${param.name}'`,
      'duplicate_parameter',
      accept
    );
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
    // Actions are tracked by AST node identity, never by name: a local action
    // and a same-named (private) library action are different nodes, and an
    // aliased import's call-site text differs from the definition name.
    //
    // Only cycles that close back to `action` itself are reported, and always
    // on `action`'s own first-hop call. That call lives in the document being
    // validated, so the diagnostic range is never computed from another file's
    // CST. Every action on a cycle gets its own report when it is validated as
    // the root; an action that merely calls into a cycle is not reported.
    for (const firstHop of this.getAllOperationCalls(action)) {
      const callee = firstHop.operationName.ref;
      if (!callee) {
        // Not resolved or is a built-in operation - skip
        continue;
      }

      const path = this.findCallPath(callee, action);
      if (!path) {
        continue;
      }

      const cycleChain = [action, ...path].map(a => a.name).join(' → ');
      accept(
        'error',
        `Recursive action call detected: '${firstHop.operationName.$refText}' creates an infinite loop\n  Call chain: ${cycleChain}`,
        {
          node: firstHop,
          property: 'operationName',
          code: 'recursive_action_call',
        }
      );
    }
  }

  /**
   * Helper: Find a call path from `from` to `target` in the action call graph.
   *
   * Depth-first reachability with an identity-keyed visited set (B24: each
   * action is expanded at most once per search, so diamond-shaped graphs and
   * cycles that do not include `target` cannot blow up or loop forever).
   *
   * @returns The actions along the path, starting with `from` and ending with
   *   `target`, or `undefined` when `target` is unreachable.
   */
  private findCallPath(
    from: ActionDefinition,
    target: ActionDefinition
  ): ActionDefinition[] | undefined {
    const visited = new Set<ActionDefinition>();

    const visit = (current: ActionDefinition): ActionDefinition[] | undefined => {
      if (current === target) {
        return [current];
      }
      if (visited.has(current)) {
        return undefined;
      }
      visited.add(current);

      for (const opCall of this.getAllOperationCalls(current)) {
        const next = opCall.operationName.ref;
        if (!next) continue;
        const rest = visit(next);
        if (rest) {
          return [current, ...rest];
        }
      }
      return undefined;
    };

    return visit(from);
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
    // Pairs the top-level list and every nested if/else branch and for body
    reportControlFlowPairing(operations as OperationStatement[], node, property, accept);
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

  /** Idea #11: control flow pairing in a sequence's `each [..]` / `then [..]` blocks. */
  checkControlFlowPairingInSequence(block: SequenceBlock, accept: ValidationAcceptor): void {
    this.validateControlFlowPairingForOps(block.prelude, block, 'prelude', accept);
    this.validateControlFlowPairingForOps(block.postlude, block, 'postlude', accept);
  }

  /** Idea #11: control flow pairing in an inline sequence item's blocks. */
  checkControlFlowPairingInSequenceItem(item: SequenceItem, accept: ValidationAcceptor): void {
    this.validateControlFlowPairingForOps(item.startOps, item, 'startOps', accept);
    this.validateControlFlowPairingForOps(item.endOps, item, 'endOps', accept);
  }

  /** Validate control flow pairing in an `on enter` / `on leave` block (audit idea #6). */
  checkControlFlowPairingInLifecycle(block: TimelineLifecycle, accept: ValidationAcceptor): void {
    this.validateControlFlowPairingForOps(block.operations, block, 'operations', accept);
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
