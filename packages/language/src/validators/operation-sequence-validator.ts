import type { AstNode, Properties, ValidationAcceptor } from 'langium';
import { hasOperation, validateControlFlowPairing } from '../compiler/index.js';
import type {
  EventActionDefinition,
  OperationCall,
  OperationStatement,
  StaggerBlock,
} from '../generated/ast.js';
import { OperationDataTracker } from '../operation-data-tracker.js';
import { formatValidationMessage } from '../utils/error-builder.js';
import { getOperationCallName } from '../utils/operation-call-utils.js';
import { BaseValidator } from './base-validator.js';

/**
 * Operation-sequence checks (control-flow pairing and operationData
 * dependency / erased-property tracking) for operation lists that are not
 * action definitions: event action bodies and inline stagger blocks.
 *
 * Regular, endable and inline endable actions get the same checks from
 * `ActionValidator`; this class applies identical rules to the remaining
 * operation lists, so a raw `when(...)` without `endWhen` or an operation
 * whose dependency was never created is reported wherever it appears.
 */
export class OperationSequenceValidator extends BaseValidator {
  /** Control-flow pairing in an event action body. */
  checkControlFlowPairingInEventAction(
    eventAction: EventActionDefinition,
    accept: ValidationAcceptor
  ): void {
    this.validateControlFlowPairing(eventAction.operations, eventAction, 'operations', accept);
  }

  /** Erased-property / missing-dependency tracking in an event action body. */
  checkErasedPropertiesInEventAction(
    eventAction: EventActionDefinition,
    accept: ValidationAcceptor
  ): void {
    this.validateOperationSequence(eventAction.operations, accept);
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
   * Erased-property / missing-dependency tracking in an inline stagger block.
   * Each stagger item becomes an independent timeline action, so the start and
   * end lists each start from an empty operationData, like an inline endable
   * action.
   */
  checkErasedPropertiesInStagger(stagger: StaggerBlock, accept: ValidationAcceptor): void {
    if (stagger.actionCall) {
      return;
    }
    this.validateOperationSequence(stagger.startOps, accept);
    this.validateOperationSequence(stagger.endOps, accept);
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
    const operationNames = (operations ?? [])
      .filter((op): op is OperationCall => op.$type === 'OperationCall')
      .map(op => getOperationCallName(op))
      .filter((name): name is string => name !== undefined);

    for (const error of validateControlFlowPairing(operationNames)) {
      accept('error', formatValidationMessage(error.message, error.hint), {
        node,
        property,
        code: error.code.toLowerCase(),
      });
    }
  }

  /**
   * Walk an operation list, tracking operationData state, and report operations
   * whose dependencies were erased or never created. Same semantics as
   * `ActionValidator`: each if/else branch starts from the pre-branch state and
   * only properties available in both branches survive the join; a loop body
   * may run zero times, so its resulting state is discarded.
   *
   * @returns The tracker holding the operationData state after the sequence
   */
  private validateOperationSequence(
    operations: readonly OperationStatement[] | undefined,
    accept: ValidationAcceptor,
    initialTracker: OperationDataTracker = new OperationDataTracker()
  ): OperationDataTracker {
    let tracker = initialTracker;
    for (const statement of operations ?? []) {
      if (statement.$type === 'OperationCall') {
        const opName = getOperationCallName(statement);
        // Unknown operations and action calls are reported / handled elsewhere
        if (!hasOperation(opName)) {
          continue;
        }

        for (const depName of tracker.processOperation(opName)) {
          const erasurePoint = tracker.findErasurePoint(depName);
          if (erasurePoint) {
            accept(
              'error',
              `Property '${depName}' is not available - it was erased by operation '${erasurePoint.operation}'`,
              { node: statement, property: 'operationName', code: 'erased-property-access' }
            );
          } else {
            accept(
              'error',
              `Property '${depName}' is not available - ensure it is created by a previous operation`,
              { node: statement, property: 'operationName', code: 'missing-dependency' }
            );
          }
        }
      } else if (statement.$type === 'IfStatement') {
        const thenTracker = this.validateOperationSequence(
          statement.thenOps,
          accept,
          tracker.clone()
        );
        const elseTracker = this.validateOperationSequence(
          statement.elseOps,
          accept,
          tracker.clone()
        );
        thenTracker.merge(elseTracker);
        tracker = thenTracker;
      } else if (statement.$type === 'ForStatement') {
        this.validateOperationSequence(statement.body, accept, tracker.clone());
      }
    }
    return tracker;
  }
}
