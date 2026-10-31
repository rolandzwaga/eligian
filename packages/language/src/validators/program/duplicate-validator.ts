import type { ValidationAcceptor } from 'langium';
import { hasOperation } from '../../compiler/index.js';
import {
  type EndableActionDefinition,
  type EventActionDefinition,
  isEventActionDefinition,
  isLibraryImport,
  type Program,
  type RegularActionDefinition,
  type VariableDeclaration,
} from '../../generated/ast.js';
import { getActions, getElements, getTimelines } from '../../utils/program-helpers.js';
import { BaseValidator } from '../base-validator.js';

/**
 * Program-level duplicate detection (actions, constants, timelines, event
 * actions, event handlers).
 */
export class ProgramDuplicateValidator extends BaseValidator {
  /**
   * Report every timeline after the first one that reuses a timeline name.
   *
   * Timelines are addressed by name (`navigate "t"`, the emitted Eligius
   * timeline `uri`), so a duplicate name makes navigation ambiguous.
   */
  checkDuplicateTimelines(program: Program, accept: ValidationAcceptor): void {
    // Skip partial timelines (name missing mid-edit); the syntax error covers them
    const timelines = getTimelines(program).filter(timeline => timeline.name !== undefined);

    this.reportDuplicatesByName(
      timelines,
      timeline => `Duplicate timeline name '${timeline.name}'. Timeline names must be unique.`,
      'duplicate_timeline',
      accept
    );
  }

  /**
   * Validate event action names:
   * - Error (`duplicate_event_action`) on the second and later event action
   *   with the same name.
   * - Warning (`event_action_name_conflict`) when an event action shares its
   *   name with a regular/endable action or an imported action, which makes the
   *   emitted action names ambiguous.
   * - Warning (`event_action_name_builtin_conflict`) when an event action is
   *   named like a built-in operation. Event actions cannot be called, so this
   *   is a warning, not the error regular actions get.
   */
  checkEventActionNames(program: Program, accept: ValidationAcceptor): void {
    const eventActions = program.statements
      .filter(isEventActionDefinition)
      .filter(eventAction => eventAction.name !== undefined);
    if (eventActions.length === 0) {
      return;
    }

    this.reportDuplicatesByName(
      eventActions,
      eventAction =>
        `Duplicate event action name '${eventAction.name}'. Event action already defined.`,
      'duplicate_event_action',
      accept
    );

    const actionNames = new Set<string>(getActions(program).map(action => action.name));
    for (const libraryImport of program.statements.filter(isLibraryImport)) {
      for (const actionImport of libraryImport.actions) {
        const localName = actionImport.alias ?? actionImport.action?.$refText;
        if (localName) {
          actionNames.add(localName);
        }
      }
    }

    for (const eventAction of eventActions) {
      if (actionNames.has(eventAction.name)) {
        accept(
          'warning',
          `Event action '${eventAction.name}' has the same name as an action. Use a distinct name to keep emitted action names unambiguous.`,
          { node: eventAction, property: 'name', code: 'event_action_name_conflict' }
        );
      }
      if (hasOperation(eventAction.name)) {
        accept(
          'warning',
          `Event action '${eventAction.name}' has the same name as a built-in operation.`,
          { node: eventAction, property: 'name', code: 'event_action_name_builtin_conflict' }
        );
      }
    }
  }

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
