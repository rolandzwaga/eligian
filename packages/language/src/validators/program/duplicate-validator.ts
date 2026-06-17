import type { ValidationAcceptor } from 'langium';
import type {
  EndableActionDefinition,
  EventActionDefinition,
  Program,
  RegularActionDefinition,
  VariableDeclaration,
} from '../../generated/ast.js';
import { getElements } from '../../utils/program-helpers.js';
import { BaseValidator } from '../base-validator.js';

/**
 * Program-level duplicate detection (actions, constants, event handlers).
 */
export class ProgramDuplicateValidator extends BaseValidator {
  /**
   * T042: US2 - Check for duplicate action definitions
   * Emit error if the same action name is defined multiple times
   */
  checkDuplicateActions(program: Program, accept: ValidationAcceptor): void {
    const actions = getElements(program).filter(
      (element): element is RegularActionDefinition | EndableActionDefinition =>
        element.$type === 'RegularActionDefinition' || element.$type === 'EndableActionDefinition'
    );

    this.reportDuplicatesByName(
      actions,
      element => `Duplicate action definition '${element.name}'. Action already defined.`,
      'duplicate_action',
      accept
    );
  }

  /**
   * Check for duplicate constant declarations
   * Emit error if constant name is declared more than once
   */
  checkDuplicateConstants(program: Program, accept: ValidationAcceptor): void {
    const constants = getElements(program).filter(
      (element): element is VariableDeclaration => element.$type === 'VariableDeclaration'
    );

    this.reportDuplicatesByName(
      constants,
      element => `Duplicate constant declaration '${element.name}'. Constant already defined.`,
      'duplicate_constant',
      accept
    );
  }

  /**
   * T033: Validate duplicate event/topic combinations
   *
   * Warns about duplicate event names or event+topic combinations.
   * Multiple handlers for the same event may indicate unintended behavior.
   */
  checkDuplicateEventActions(program: Program, accept: ValidationAcceptor): void {
    // Build a map of event signatures to event actions
    const eventSignatures = new Map<string, EventActionDefinition[]>();

    for (const stmt of program.statements) {
      if (stmt.$type === 'EventActionDefinition') {
        const eventAction = stmt as EventActionDefinition;

        // Skip incomplete event actions (eventName optional for completion)
        if (!eventAction.eventName) {
          continue;
        }

        // Create signature: "eventName" or "eventName|topic"
        const signature = eventAction.eventTopic
          ? `${eventAction.eventName}|${eventAction.eventTopic}`
          : eventAction.eventName;

        if (!eventSignatures.has(signature)) {
          eventSignatures.set(signature, []);
        }
        eventSignatures.get(signature)!.push(eventAction);
      }
    }

    // T030: Warn about duplicates
    for (const [signature, actions] of eventSignatures) {
      if (actions.length > 1) {
        // Multiple handlers for the same event/topic combination
        const hasTopic = signature.includes('|');
        const [eventName, topic] = hasTopic ? signature.split('|') : [signature, undefined];

        for (const action of actions) {
          const message = hasTopic
            ? `Multiple handlers defined for event '${eventName}' with topic '${topic}'. This may cause unexpected behavior.`
            : `Multiple handlers defined for event '${eventName}'. This may cause unexpected behavior.`;

          accept('warning', message, {
            node: action,
            property: 'eventName',
            code: 'duplicate_event_handler',
          });
        }
      }
    }
  }
}
