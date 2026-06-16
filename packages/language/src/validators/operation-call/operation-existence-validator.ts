import type { ValidationAcceptor } from 'langium';
import { hasOperation, validateOperationExists } from '../../compiler/index.js';
import { findActionByName } from '../../compiler/name-resolver.js';
import type { EligianScopeProvider } from '../../eligian-scope-provider.js';
import type { OperationCall, TimedEvent } from '../../generated/ast.js';
import { formatValidationMessage } from '../../utils/error-builder.js';
import { getOperationCallName } from '../../utils/operation-call-utils.js';
import { BaseValidator } from '../base-validator.js';
import { findImportedActionByNameOrAlias } from './action-resolution.js';

/**
 * Validates that an operation call resolves to a known operation or action, and
 * enforces the unified-syntax rule that only actions (never bare operations) may
 * be used directly in timeline events.
 *
 * Split out of the former monolithic `OperationCallValidator` (W1) as the
 * "operation existence / resolution" check family.
 */
export class OperationExistenceValidator extends BaseValidator {
  /**
   * Validate that an operation exists in the Eligius registry.
   * Provides typo suggestions for similar operation names.
   *
   * This gives instant IDE feedback with red squiggles and helpful suggestions.
   */
  checkOperationExists(operation: OperationCall, accept: ValidationAcceptor): void {
    const opName = getOperationCallName(operation);

    // T020: Skip operation validation if this is an action call
    // (Action calls are validated by checkTimelineOperationCall for direct timeline calls,
    //  or allowed in InlineEndableAction blocks)
    //
    // Feature 023: Also check for Library files
    const program = this.getProgram(operation);
    if (program) {
      const action = findActionByName(opName, program);
      if (action) {
        // This is a valid action call - skip operation validation
        return;
      }
    }

    // Feature 023: Check if operation is in a Library file
    const library = this.getLibrary(operation);
    if (library) {
      const action = library.actions?.find(a => a.name === opName);
      if (action) {
        // This is a valid action call within the library - skip operation validation
        return;
      }
    }

    // Feature 024: Check if operation is an IMPORTED action
    // Feature 032 Fix: Must check aliases as well as original action names
    if (program && this.services) {
      const scopeProvider = this.services.references.ScopeProvider as EligianScopeProvider;
      const importedActions = scopeProvider.getImportedActions(program);
      const importedAction = findImportedActionByNameOrAlias(opName, program, importedActions);
      if (importedAction) {
        // This is a valid imported action call - skip operation validation
        return;
      }
    }

    // Use compiler validation logic
    const error = validateOperationExists(opName);

    if (error) {
      const message = formatValidationMessage(error.message, error.hint);

      accept('error', message, {
        node: operation,
        property: 'operationName',
        code: error.code.toLowerCase(),
      });
    }
  }

  /**
   * T020-T023: Validate OperationCall when used in timeline context
   *
   * With unified syntax, OperationCall can appear as TimelineAction.
   * We need to validate that it resolves to a defined action (not an operation).
   */
  checkTimelineOperationCall(call: OperationCall, accept: ValidationAcceptor): void {
    // Check if this OperationCall is in a direct timeline event (not in InlineEndableAction)
    const isDirectTimelineCall = this.isDirectTimelineCall(call);

    if (!isDirectTimelineCall) {
      // Not a direct timeline call - normal validation applies
      // (could be in action body, InlineEndableAction, control flow, etc.)
      return;
    }

    // Direct timeline call - must be an action call, NOT an operation
    const callName = getOperationCallName(call);

    // Get the program to search for actions
    const program = this.getProgram(call);
    if (!program) {
      return; // Can't validate without program context
    }

    // Check if it's a defined action (local)
    const action = findActionByName(callName, program);
    if (action) {
      // Valid local action call - success
      return;
    }

    // Feature 024: Check if it's an IMPORTED action
    // Feature 032 Fix: Must check aliases as well as original action names
    if (this.services) {
      const scopeProvider = this.services.references.ScopeProvider as EligianScopeProvider;
      const importedActions = scopeProvider.getImportedActions(program);

      // Check if callName matches an imported action's name OR its alias
      const importedAction = findImportedActionByNameOrAlias(callName, program, importedActions);
      if (importedAction) {
        // Valid imported action call - success
        return;
      }
    }

    // Check if it's an operation (ERROR - operations not allowed as direct timeline actions)
    if (hasOperation(callName)) {
      accept(
        'error',
        `Operation '${callName}' cannot be used directly in timeline events. Define an action that calls this operation, then call the action.`,
        {
          node: call,
          property: 'operationName',
        }
      );
      return;
    }

    // Unknown - neither action nor operation
    accept(
      'error',
      `Unknown action: ${callName}. Define this action before using it in timeline events.`,
      {
        node: call,
        property: 'operationName',
      }
    );
  }

  /**
   * T053-T054: US3 - Check if OperationCall is a direct timeline call
   * Handles direct calls and calls within ForStatement/IfStatement in timelines
   *
   * Returns true only for direct timeline calls like:
   *   at 0s..5s actionCall()
   *   at 0s..5s for (...) { actionCall() }
   *
   * Returns false for:
   *   - Calls inside action definition bodies
   *   - Calls inside InlineEndableAction blocks (operations allowed there)
   */
  private isDirectTimelineCall(call: OperationCall): boolean {
    let current: any = call.$container;

    // Walk up to find if we're in a direct timeline context
    while (current) {
      // If we hit an action definition body, we're NOT a direct timeline call
      if (
        current.$type === 'RegularActionDefinition' ||
        current.$type === 'EndableActionDefinition'
      ) {
        return false;
      }

      // If we're inside an InlineEndableAction, we're NOT a direct timeline call
      // (operations are allowed inside inline endable action blocks)
      if (current.$type === 'InlineEndableAction') {
        return false;
      }

      if (current.$type === 'TimedEvent') {
        const timedEvent = current as TimedEvent;

        // Direct action: OperationCall is the timeline action itself
        if (timedEvent.action === call) {
          return true;
        }

        // T053: Control flow in timeline: Check if call is inside ForStatement/IfStatement
        // that is the timeline action
        if (
          timedEvent.action &&
          (timedEvent.action.$type === 'ForStatement' || timedEvent.action.$type === 'IfStatement')
        ) {
          // The call is somewhere inside control flow - check if it's in this timeline event
          return this.isDescendantOf(call, timedEvent.action);
        }
      }
      current = current.$container;
    }

    return false;
  }

  /**
   * T053: Helper - Check if node is a descendant of ancestor
   */
  private isDescendantOf(node: any, ancestor: any): boolean {
    let current = node.$container;
    while (current) {
      if (current === ancestor) {
        return true;
      }
      current = current.$container;
    }
    return false;
  }
}
