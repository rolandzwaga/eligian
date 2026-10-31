import type { AstNode, Properties, ValidationAcceptor } from 'langium';
import type { EventActionDefinition, OperationStatement, StaggerBlock } from '../generated/ast.js';
import { BaseValidator } from './base-validator.js';
import { reportControlFlowPairing } from './control-flow-pairing.js';

/**
 * Control-flow pairing for operation lists that are not action definitions:
 * event action bodies and inline stagger blocks. Regular, endable and inline
 * endable actions get the same check from `ActionValidator`. (operationData
 * dependencies are checked for every operation list by `DataflowValidator`.)
 */
export class OperationSequenceValidator extends BaseValidator {
  /** Control-flow pairing in an event action body. */
  checkControlFlowPairingInEventAction(
    eventAction: EventActionDefinition,
    accept: ValidationAcceptor
  ): void {
    this.validateControlFlowPairing(eventAction.operations, eventAction, 'operations', accept);
  }

  /**
   * Control-flow pairing in an inline stagger block's start and end operations.
   * The `with actionCall()` form has no inline operations, so nothing is checked.
   */
  checkControlFlowPairingInStagger(stagger: StaggerBlock, accept: ValidationAcceptor): void {
    if (stagger.actionCall) {
      return;
    }
    this.validateControlFlowPairing(stagger.startOps, stagger, 'startOps', accept);
    this.validateControlFlowPairing(stagger.endOps, stagger, 'endOps', accept);
  }

  /**
   * Check that when/endWhen, otherwise and forEach/endForEach are properly
   * paired within a single operation list, reporting errors on `node.property`.
   */
  private validateControlFlowPairing<N extends AstNode>(
    operations: readonly OperationStatement[] | undefined,
    node: N,
    property: Properties<N>,
    accept: ValidationAcceptor
  ): void {
    // Pairs the top-level list and every nested if/else branch and for body
    reportControlFlowPairing(operations, node, property, accept);
  }
}
