import { AstUtils, type ValidationAcceptor } from 'langium';
import { TIMELINE_EVENTS } from '../completion/metadata/timeline-events.generated.js';
import { findSimilarClasses } from '../css/levenshtein.js';
import { type EventActionDefinition, isOperationCall, isStringLiteral } from '../generated/ast.js';
import { eligiusTypeToDslAnnotation } from '../utils/event-arg-types.js';
import { getOperationCallName } from '../utils/operation-call-utils.js';
import { BaseValidator } from './base-validator.js';
import { RESERVED_KEYWORDS } from './validation-constants.js';

/**
 * Validations for event action definitions.
 */
export class EventActionValidator extends BaseValidator {
  /**
   * T031: Validate event action definition
   *
   * Validates:
   * - Event name must not exceed 100 characters (a missing or empty name is
   *   reported once, by `checkEventNameExists`)
   * - Action body must contain at least one operation
   */
  checkEventActionDefinition(eventAction: EventActionDefinition, accept: ValidationAcceptor): void {
    // T026: Event name must be ≤100 chars. The grammar makes the name optional and
    // it is always a string literal, so a missing or empty name is not a "variable
    // reference" - checkEventNameExists reports it (a single diagnostic).
    if (eventAction.eventName && eventAction.eventName.length > 100) {
      accept(
        'error',
        `Event name exceeds 100 character limit (current: ${eventAction.eventName.length} characters)`,
        {
          node: eventAction,
          property: 'eventName',
          code: 'event_name_too_long',
        }
      );
    }

    // T042: Event topic must not be empty string (if provided)
    if (eventAction.eventTopic !== undefined && eventAction.eventTopic.length === 0) {
      accept(
        'error',
        'Event topic cannot be an empty string. Either provide a topic name or omit the topic clause entirely.',
        {
          node: eventAction,
          property: 'eventTopic',
          code: 'event_topic_empty',
        }
      );
    }

    // T027: Action body must have at least one operation
    if (eventAction.operations.length === 0) {
      accept('error', 'Event action body must contain at least one operation', {
        node: eventAction,
        property: 'operations',
        code: 'event_action_empty_body',
      });
    }
  }

  /**
   * T032: Validate event action parameters
   *
   * Validates:
   * - Parameters must not use reserved keywords
   * - No duplicate parameter names
   */
  checkEventActionParameters(eventAction: EventActionDefinition, accept: ValidationAcceptor): void {
    const parameters = eventAction.parameters;
    if (!parameters || parameters.length === 0) {
      return; // No parameters to validate
    }

    // T028: Check for reserved keywords
    for (const param of parameters) {
      if (RESERVED_KEYWORDS.has(param.name)) {
        accept('error', `Parameter name '${param.name}' is a reserved keyword and cannot be used`, {
          node: param,
          property: 'name',
          code: 'reserved_keyword_parameter',
        });
      }
    }

    // T029: Check for duplicate parameter names
    const seenParams = new Set<string>();
    for (const param of parameters) {
      if (seenParams.has(param.name)) {
        accept('error', `Duplicate parameter name '${param.name}'`, {
          node: param,
          property: 'name',
          code: 'duplicate_parameter',
        });
      }
      seenParams.add(param.name);
    }
  }

  /**
   * T034: Validate event name exists in known Eligius events
   *
   * Validates:
   * - Event name matches a known Eligius event from TIMELINE_EVENTS metadata
   * - Provides "Did you mean?" suggestions using Levenshtein distance ≤ 2
   * - Rejects empty event names
   *
   * Error codes:
   * - unknown_event_name: Event name not found in TIMELINE_EVENTS
   * - event_name_must_be_literal: Event name is missing (not a string literal)
   * - empty_event_name: Event name is empty string
   */
  checkEventNameExists(eventAction: EventActionDefinition, accept: ValidationAcceptor): void {
    const eventName = eventAction.eventName;

    // Missing event name (the grammar makes it optional): the only diagnostic for
    // this case. Covers `on event action foo()` and a non-literal such as
    // `on event myVar action foo()`, where the parser recovers with no name.
    if (eventName === undefined) {
      accept('error', 'Event name must be a string literal, e.g. on event "timeline-complete"', {
        node: eventAction,
        property: 'eventName',
        code: 'event_name_must_be_literal',
      });
      return;
    }

    // Check for empty event name
    if (eventName.trim() === '') {
      accept('error', 'Event name cannot be empty', {
        node: eventAction,
        property: 'eventName',
        code: 'empty_event_name',
      });
      return;
    }

    // Check if event exists in metadata
    const eventExists = TIMELINE_EVENTS.some((event: { name: string }) => event.name === eventName);

    if (eventExists) {
      return; // Valid event name
    }

    // Custom application events are first-class: the engine's eventbus dispatches
    // an action to whatever event name it was registered with. So a name that
    // isn't a known engine event is still valid if the program broadcasts it
    // itself — this keeps "did you mean?" typo help for genuine engine-event typos
    // while allowing deliberate custom events (e.g. a button broadcasting an event
    // an `on event` handler answers). See actionregistry-eventbus-listener.ts.
    if (this.isEventBroadcastInProgram(eventAction, eventName)) {
      return;
    }

    // Event not found - generate suggestions using Levenshtein distance
    const allEventNames = TIMELINE_EVENTS.map((event: { name: string }) => event.name);
    const eventNameSet = new Set(allEventNames);
    const suggestions = findSimilarClasses(eventName, eventNameSet, 2, 3);

    let message: string;
    if (suggestions.length > 0) {
      const suggestionsList = suggestions.join(', ');
      message = `Unknown event name: '${eventName}' (Did you mean: ${suggestionsList}?)`;
    } else {
      message = `Unknown event name: '${eventName}'`;
    }

    accept('error', message, {
      node: eventAction,
      property: 'eventName',
      code: 'unknown_event_name',
    });
  }

  /**
   * Whether any `broadcastEvent(...)` in the same program broadcasts `eventName`.
   *
   * The event name is `broadcastEvent`'s SECOND positional argument (the operation
   * signature orders parameters `eventArgs` then `eventName`). Only string-literal
   * event names can be matched statically; non-literal names fall through to the
   * normal unknown-event error.
   */
  private isEventBroadcastInProgram(node: EventActionDefinition, eventName: string): boolean {
    const program = this.getProgram(node);
    if (!program) {
      return false;
    }

    for (const candidate of AstUtils.streamAllContents(program)) {
      if (!isOperationCall(candidate) || getOperationCallName(candidate) !== 'broadcastEvent') {
        continue;
      }
      const nameArg = candidate.args[1];
      if (nameArg && isStringLiteral(nameArg) && nameArg.value === eventName) {
        return true;
      }
    }

    return false;
  }

  /**
   * User Story 2: Validate event argument count matches parameter count
   *
   * Checks that the number of parameters declared in an event action
   * matches the number of arguments provided by the Eligius event.
   * Handlers read their parameters by index from the event's arguments, so
   * declaring FEWER parameters than the event supplies is benign (trailing
   * arguments are never read) and is not reported, while declaring MORE leaves
   * the extra parameters `undefined` at runtime and produces a warning.
   */
  checkEventArgumentCount(eventAction: EventActionDefinition, accept: ValidationAcceptor): void {
    const eventName = eventAction.eventName;

    // Find event metadata
    const eventMetadata = TIMELINE_EVENTS.find(event => event.name === eventName);

    // Skip validation if event not found (US1 already handles this)
    if (!eventMetadata) {
      return;
    }

    const expectedArgCount = eventMetadata.args?.length ?? 0;
    const actualParamCount = eventAction.parameters.length;

    // Same count, or fewer parameters than arguments: nothing to warn about
    // (the trailing arguments are simply never read).
    if (actualParamCount <= expectedArgCount) {
      return;
    }

    // More parameters than the event supplies: the extra ones are undefined.
    const extraNames = eventAction.parameters.slice(expectedArgCount).map(p => `'${p.name}'`);
    const plural = extraNames.length === 1 ? '' : 's';
    const message = `Event '${eventName}' provides ${expectedArgCount} arguments, but action declares ${actualParamCount} parameter${actualParamCount === 1 ? '' : 's'}. Parameter${plural} ${extraNames.join(', ')} will be undefined at runtime (event supplies only ${expectedArgCount} argument${expectedArgCount === 1 ? '' : 's'}).`;

    accept('warning', message, {
      node: eventAction,
      property: 'parameters',
      code: 'event_argument_count_mismatch',
    });
  }

  /**
   * User Story 3: Validate event type compatibility with parameter type annotations
   *
   * Checks that parameter type annotations (when present) match the types
   * specified in event metadata. This is OPT-IN validation - only parameters
   * with explicit type annotations are checked.
   *
   * T038-T047: Type compatibility validation tests
   * T049: Implementation
   */
  checkEventTypeCompatibility(
    eventAction: EventActionDefinition,
    accept: ValidationAcceptor
  ): void {
    const eventName = eventAction.eventName;

    // Find event metadata
    const eventMetadata = TIMELINE_EVENTS.find(event => event.name === eventName);

    // Skip validation if event not found (US1 already handles this)
    if (!eventMetadata) {
      return;
    }

    const eventArgs = eventMetadata.args ?? [];

    // Iterate through parameters and check types (opt-in)
    for (let i = 0; i < eventAction.parameters.length; i++) {
      const param = eventAction.parameters[i];

      // Skip if no type annotation (opt-in validation)
      if (!param.type) {
        continue;
      }

      // Check if there's a corresponding event argument at this position
      const eventArg = eventArgs[i];

      if (!eventArg) {
        // Type annotation present but event has no argument at this position
        accept(
          'warning',
          `Type annotation for '${param.name}' is unnecessary because the event provides no arguments at this position`,
          {
            node: param,
            property: 'type',
            code: 'unnecessary_type_annotation',
          }
        );
        continue;
      }

      // Compare the annotation with the DSL equivalent of the Eligius argument type
      // (e.g. TLanguageCode -> string, string[] -> array). Arguments typed `any` or
      // as callbacks have no DSL annotation and must stay untyped.
      const expected = eligiusTypeToDslAnnotation(eventArg.type);
      if (expected === undefined) {
        accept(
          'error',
          `Type mismatch for parameter '${param.name}': declared as '${param.type}' but event provides '${eventArg.type}', which has no Eligian type annotation. Remove the annotation.`,
          {
            node: param,
            property: 'type',
            code: 'event_type_mismatch',
          }
        );
      } else if (param.type !== expected) {
        accept(
          'error',
          `Type mismatch for parameter '${param.name}': declared as '${param.type}' but event provides '${eventArg.type}' (annotate as '${expected}')`,
          {
            node: param,
            property: 'type',
            code: 'event_type_mismatch',
          }
        );
      }
    }
  }
}
