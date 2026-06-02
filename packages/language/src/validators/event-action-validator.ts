import type { ValidationAcceptor } from 'langium';
import { TIMELINE_EVENTS } from '../completion/metadata/timeline-events.generated.js';
import { findSimilarClasses } from '../css/levenshtein.js';
import type { EventActionDefinition } from '../generated/ast.js';
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
   * - Event name must be a string literal (not a variable reference)
   * - Event name must not exceed 100 characters
   * - Action body must contain at least one operation
   */
  checkEventActionDefinition(eventAction: EventActionDefinition, accept: ValidationAcceptor): void {
    // T026: Event name must be string literal and ≤100 chars
    if (!eventAction.eventName) {
      accept('error', 'Event name must be a string literal (not a variable reference)', {
        node: eventAction,
        property: 'eventName',
        code: 'event_name_must_be_literal',
      });
    } else if (eventAction.eventName.length > 100) {
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
   * - empty_event_name: Event name is empty string
   */
  checkEventNameExists(eventAction: EventActionDefinition, accept: ValidationAcceptor): void {
    const eventName = eventAction.eventName;

    // Check for empty event name
    if (!eventName || eventName.trim() === '') {
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
   * User Story 2: Validate event argument count matches parameter count
   *
   * Checks that the number of parameters declared in an event action
   * matches the number of arguments provided by the Eligius event.
   * Warnings (not errors) are issued for mismatches since runtime may
   * still function (extra params ignored, missing args become undefined).
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

    // Counts match - no warning needed
    if (expectedArgCount === actualParamCount) {
      return;
    }

    // Build warning message
    let message: string;
    if (actualParamCount < expectedArgCount) {
      // Too few parameters
      message = `Event '${eventName}' provides ${expectedArgCount} arguments, but action declares ${actualParamCount} parameters. Missing arguments may be undefined at runtime.`;
    } else {
      // Too many parameters - include parameter name(s) for single extra param
      if (actualParamCount === 1 && expectedArgCount === 0) {
        const paramName = eventAction.parameters[0].name;
        message = `Event '${eventName}' provides ${expectedArgCount} arguments, but action declares ${actualParamCount} parameter '${paramName}'. Extra parameters will be ignored at runtime.`;
      } else {
        message = `Event '${eventName}' provides ${expectedArgCount} arguments, but action declares ${actualParamCount} parameters. Extra parameters will be ignored at runtime.`;
      }
    }

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

      // Compare types (case-sensitive string comparison)
      if (param.type !== eventArg.type) {
        accept(
          'error',
          `Type mismatch for parameter '${param.name}': declared as '${param.type}' but event provides '${eventArg.type}'`,
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
