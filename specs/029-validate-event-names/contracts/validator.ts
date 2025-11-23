/**
 * Validator Contracts: Event Name and Argument Validation
 *
 * This file defines the method signatures for event action validation.
 * These methods will be implemented in packages/language/src/eligian-validator.ts
 * as part of the EligianValidator class.
 *
 * Feature: 029-validate-event-names
 * Date: 2025-11-10
 */

import type { ValidationAcceptor } from 'langium';
import type { EventActionDefinition } from '../generated/ast.js';

/**
 * User Story 1: Validate that event name matches a known Eligius event
 *
 * This validator checks that the event name specified in an event action
 * declaration matches a known Eligius event from the event metadata. If
 * the event name is not found, it provides "Did you mean?" suggestions
 * using Levenshtein distance.
 *
 * @param eventAction - Event action AST node to validate
 * @param accept - Validation acceptor for reporting diagnostics
 *
 * @example
 * ```eligian
 * // Valid: event name matches known Eligius event
 * on event "data-sync" action HandleSync(status: string) [...]
 *
 * // Error: typo in event name
 * on event "data-synk" action HandleSync(status: string) [...]
 * // Diagnostic: "Unknown event name: 'data-synk' (Did you mean: 'data-sync'?)"
 *
 * // Error: completely invalid event name
 * on event "invalid-event" action HandleInvalid() [...]
 * // Diagnostic: "Unknown event name: 'invalid-event'"
 * ```
 *
 * @errors
 * - `unknown_event_name`: Event name not found in TIMELINE_EVENTS metadata
 * - `empty_event_name`: Event name is empty string
 *
 * @provides
 * - "Did you mean?" suggestions using Levenshtein distance ≤ 2
 * - Error diagnostic at event name location with appropriate code
 *
 * @preconditions
 * - Event name must be a string literal (validated by existing checkEventActionDefinition)
 * - Event name length ≤ 100 chars (validated by existing checkEventActionDefinition)
 *
 * @postconditions
 * - If valid: no diagnostics added
 * - If invalid: error diagnostic added with suggestions (if available)
 *
 * @performance
 * - O(n) event name lookup (43 events)
 * - O(n * m) Levenshtein calculation on error (only runs when event not found)
 * - Expected execution time: ~2ms per validation
 */
export function checkEventNameExists(
  eventAction: EventActionDefinition,
  accept: ValidationAcceptor
): void;

/**
 * User Story 2: Validate that parameter count matches event argument count
 *
 * This validator checks that the number of parameters declared in an event
 * action matches the number of arguments provided by the Eligius event. If
 * the counts don't match, it reports a warning (not an error, since runtime
 * may still work with missing/extra arguments).
 *
 * @param eventAction - Event action AST node to validate
 * @param accept - Validation acceptor for reporting diagnostics
 *
 * @example
 * ```eligian
 * // Valid: parameter count matches event arguments (3 == 3)
 * on event "before-request-video-url" action HandleVideo(index, position, history) [...]
 *
 * // Warning: too few parameters (2 < 3)
 * on event "before-request-video-url" action HandleVideo(index, position) [...]
 * // Diagnostic: "Event 'before-request-video-url' provides 3 arguments, but action declares 2 parameters.
 * //              Missing arguments may be undefined at runtime."
 *
 * // Warning: too many parameters (1 > 0)
 * on event "timeline-complete" action HandleComplete(extraParam) [...]
 * // Diagnostic: "Event 'timeline-complete' provides 0 arguments, but action declares 1 parameter 'extraParam'.
 * //              Extra parameters will be ignored at runtime."
 * ```
 *
 * @warnings
 * - `event_argument_count_mismatch`: Parameter count doesn't match event args
 *
 * @provides
 * - Expected vs actual count in warning message
 * - Explanation of runtime behavior (undefined args or ignored params)
 * - Warning diagnostic (not error - compilation can continue)
 *
 * @preconditions
 * - Event name must be valid (checkEventNameExists should run first)
 * - Event metadata must be available for the event name
 *
 * @postconditions
 * - If counts match: no diagnostics added
 * - If counts mismatch: warning diagnostic added with explanation
 *
 * @performance
 * - O(n) event metadata lookup (43 events)
 * - O(1) count comparison
 * - Expected execution time: ~1ms per validation
 *
 * @notes
 * - Parameter names are NOT validated (developers can use any names)
 * - Only the count is validated (position-based argument matching)
 * - Warnings do NOT block compilation (per FR-011)
 */
export function checkEventArgumentCount(
  eventAction: EventActionDefinition,
  accept: ValidationAcceptor
): void;

/**
 * User Story 3: Validate that parameter type annotations match event argument types
 *
 * This validator checks that parameter type annotations (when present) match
 * the types specified in the event metadata. This is OPT-IN validation - only
 * parameters with explicit type annotations are checked. Parameters without
 * type annotations are skipped.
 *
 * @param eventAction - Event action AST node to validate
 * @param accept - Validation acceptor for reporting diagnostics
 *
 * @example
 * ```eligian
 * // Valid: type annotations match event arg types
 * on event "before-request-video-url" action HandleVideo(
 *   index: number,
 *   position: number,
 *   isHistory: boolean
 * ) [...]
 *
 * // Error: type mismatch (string != number)
 * on event "before-request-video-url" action HandleVideo(index: string) [...]
 * // Diagnostic: "Type mismatch for parameter 'index': declared as 'string' but event provides 'number'"
 *
 * // Valid: no type annotations, validation skipped (opt-in)
 * on event "data-sync" action HandleSync(status, count) [...]
 *
 * // Warning: unnecessary type annotation (event has no args)
 * on event "app-ready" action Initialize(param: string) [...]
 * // Diagnostic: "Type annotation for 'param' is unnecessary because the event provides no arguments"
 * ```
 *
 * @errors
 * - `event_type_mismatch`: Parameter type doesn't match event arg type
 *
 * @warnings
 * - `unnecessary_type_annotation`: Type annotation present but event has no corresponding arg
 *
 * @provides
 * - Declared vs expected type in error message
 * - Only validates when type annotations present (opt-in behavior)
 * - Error diagnostic at parameter location with type details
 *
 * @preconditions
 * - Event name must be valid (checkEventNameExists should run first)
 * - Event metadata must be available for the event name
 * - Parameter type annotations are optional
 *
 * @postconditions
 * - If no type annotations: no diagnostics added (opt-in)
 * - If types match: no diagnostics added
 * - If types mismatch: error diagnostic added with type details
 *
 * @performance
 * - O(n) event metadata lookup (43 events)
 * - O(m) iteration over parameters (typically 0-3 params)
 * - O(1) type string comparison per parameter
 * - Expected execution time: ~2ms per validation
 *
 * @notes
 * - Type checking is OPT-IN (only when annotations present)
 * - Type matching is simple string comparison (no type coercion)
 * - Types are case-sensitive ("string" != "String")
 * - Arguments matched by position, not by name
 * - No complex type compatibility checking (out of scope)
 */
export function checkEventTypeCompatibility(
  eventAction: EventActionDefinition,
  accept: ValidationAcceptor
): void;

/**
 * Validation Registration
 *
 * These validators should be registered in the EligianValidatorRegistry
 * for the EventActionDefinition AST node type:
 *
 * ```typescript
 * const checks: ValidationChecks<EligianAstType> = {
 *   EventActionDefinition: [
 *     validator.checkEventActionDefinition,     // Existing: event name literal, length, body
 *     validator.checkEventActionParameters,     // Existing: reserved keywords, duplicates
 *     validator.checkEventNameExists,           // NEW: event name validation (US1)
 *     validator.checkEventArgumentCount,        // NEW: argument count validation (US2)
 *     validator.checkEventTypeCompatibility,    // NEW: type compatibility validation (US3)
 *   ],
 * };
 * registry.register(checks, validator);
 * ```
 *
 * Validators run in order, so preconditions from early validators
 * (e.g., valid event name) are satisfied for later validators.
 */

/**
 * Dependencies
 *
 * These validators depend on the following existing infrastructure:
 *
 * 1. Event Metadata:
 *    - Source: packages/language/src/completion/metadata/timeline-events.generated.ts
 *    - Import: import { TIMELINE_EVENTS } from '../completion/metadata/timeline-events.generated.js';
 *    - Structure: TimelineEventMetadata[] with name, description, category, args
 *
 * 2. Levenshtein Distance:
 *    - Source: packages/language/src/css/levenshtein.ts
 *    - Import: import { findSimilar } from '../css/levenshtein.js';
 *    - Functions: levenshteinDistance(a, b), findSimilar(target, candidates, threshold)
 *
 * 3. AST Types:
 *    - Source: packages/language/src/generated/ast.ts (Langium-generated)
 *    - Types: EventActionDefinition, Parameter
 *    - Fields: eventName, actionName, parameters, topic, body, Parameter.name, Parameter.type
 *
 * 4. Validation Infrastructure:
 *    - Source: langium (npm package)
 *    - Types: ValidationAcceptor, DiagnosticSeverity
 *    - Methods: accept(severity, message, options)
 */

/**
 * Testing Requirements
 *
 * Integration tests must cover:
 *
 * 1. Event Name Validation (event-name-validation.spec.ts):
 *    - Valid event names (no errors)
 *    - Unknown event names (errors)
 *    - Empty event names (errors)
 *    - Typos with suggestions (Levenshtein ≤ 2)
 *    - Typos without suggestions (Levenshtein > 2)
 *
 * 2. Argument Count Validation (argument-count-validation.spec.ts):
 *    - Correct count (no warnings)
 *    - Too few parameters (warnings)
 *    - Too many parameters (warnings)
 *    - Zero args, zero params (no warnings)
 *    - Zero args, N params (warnings)
 *
 * 3. Type Compatibility Validation (argument-type-validation.spec.ts):
 *    - Matching types (no errors)
 *    - Mismatched types (errors)
 *    - No type annotations (no errors - opt-in)
 *    - Mixed annotations (some params typed, some not)
 *    - Unnecessary annotations (warnings)
 *
 * Each test suite should be in a SEPARATE file (per Constitution Principle II)
 * to avoid test environment pollution.
 */
