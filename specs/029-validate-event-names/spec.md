# Feature Specification: Event Name and Argument Validation

**Feature Branch**: `029-validate-event-names`
**Created**: 2025-11-10
**Status**: Draft
**Input**: User description: "validate event names and argument. We just implemented support for event actions, so we can now use this syntax: on event \"data-sync\" action HandleDataSync(syncStatus: string, itemCount: number). The event metadata that we extract from the Eligius library contains the event name and corresponding argument names and types, so this can be used to validate the beforementioned syntax."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Catch Typos in Event Names (Priority: P1)

When a developer writes an event action, they need immediate feedback if they've misspelled or mistyped the event name. This prevents runtime errors where the event handler is registered but never called because the event name doesn't match what Eligius dispatches.

**Why this priority**: This is the most critical validation because an incorrect event name means the handler will never execute, leading to silent failures that are difficult to debug. This directly impacts developer productivity and code reliability.

**Independent Test**: Can be fully tested by creating an event action with a typo in the event name (e.g., `on event "click"` typo'd as `on event "clik"`) and verifying that the IDE displays an error with a suggestion for the correct event name. This delivers immediate value by catching the most common error.

**Acceptance Scenarios**:

1. **Given** the developer writes `on event "data-synk" action HandleSync()`, **When** validation runs, **Then** the IDE displays an error "Unknown event name: 'data-synk' (Did you mean: 'data-sync'?)" at the event name location
2. **Given** the developer writes `on event "before-request-video-url" action HandleVideo()`, **When** validation runs, **Then** no error is displayed because the event name is valid
3. **Given** the developer writes `on event "completely-invalid-event" action HandleInvalid()`, **When** validation runs, **Then** the IDE displays an error "Unknown event name: 'completely-invalid-event'" (no suggestions when Levenshtein distance > 2)
4. **Given** the developer writes `on event "" action HandleEmpty()`, **When** validation runs, **Then** the IDE displays an error "Event name cannot be empty"

---

### User Story 2 - Validate Argument Count (Priority: P2)

When a developer defines parameters for an event action, they need validation that the parameter count matches what the Eligius event provides. This prevents runtime errors where the event handler expects arguments that don't exist or misses arguments that are provided.

**Why this priority**: While less critical than event name validation (P1), this prevents runtime errors and ensures developers use the correct event data. It's independent of P1 and can be implemented separately.

**Independent Test**: Can be fully tested by creating event actions with mismatched argument counts and verifying appropriate warning messages. This delivers value by ensuring developers correctly consume event data.

**Acceptance Scenarios**:

1. **Given** the event "before-request-video-url" has 3 arguments, **When** the developer writes `on event "before-request-video-url" action HandleVideo(index, position)`, **Then** the IDE displays a warning "Event 'before-request-video-url' provides 3 arguments, but action declares 2. Missing arguments may be undefined at runtime."
2. **Given** the event "timeline-complete" has no arguments, **When** the developer writes `on event "timeline-complete" action HandleComplete(extraParam)`, **Then** the IDE displays a warning "Event 'timeline-complete' provides no arguments, but action declares 1 parameter 'extraParam'"
3. **Given** the event "before-request-video-url" has 3 arguments, **When** the developer writes `on event "before-request-video-url" action HandleVideo(index, position, history)` (correct count), **Then** no warning is displayed because the argument count matches
4. **Given** the event "app-ready" has no arguments, **When** the developer writes `on event "app-ready" action Initialize()`, **Then** no warning is displayed because the argument count matches

---

### User Story 3 - Validate Argument Type Compatibility (Priority: P3)

When a developer adds type annotations to event action parameters, they need validation that the declared types match the types provided by the Eligius event. This catches type mismatches early and ensures type safety when the existing Eligian type system is enabled.

**Why this priority**: This builds on P2 and is only useful when developers use type annotations. It's the lowest priority because it's optional (type annotations are opt-in) and depends on the type system being enabled.

**Independent Test**: Can be fully tested by creating event actions with type-annotated parameters that mismatch the event's argument types and verifying appropriate error messages. This delivers value for developers using the type system.

**Acceptance Scenarios**:

1. **Given** the event "before-request-video-url" has arg `{name: "index", type: "number"}`, **When** the developer writes `on event "before-request-video-url" action HandleVideo(index: string)`, **Then** the IDE displays an error "Type mismatch for parameter 'index': declared as 'string' but event provides 'number'"
2. **Given** the event "before-request-video-url" has arg `{name: "isHistoryRequest", type: "boolean"}`, **When** the developer writes `on event "before-request-video-url" action HandleVideo(index, position, isHistoryRequest: boolean)`, **Then** no error is displayed because the type matches
3. **Given** the event "app-ready" has no arguments, **When** the developer writes `on event "app-ready" action Initialize(param: string)`, **Then** the IDE displays both an error from US2 (argument count mismatch) and a warning "Type annotation for 'param' is unnecessary because the event provides no arguments"
4. **Given** the developer writes an event action without type annotations, **When** validation runs, **Then** no type mismatch errors are displayed (type checking is opt-in)

---

### Edge Cases

- What happens when an event name is empty string or whitespace-only?
- How does the system handle event actions when the event metadata is not available (e.g., network error fetching metadata)?
- What happens if the Eligius library adds new events that the DSL metadata hasn't been updated for yet?
- How are custom/user-defined events handled (events not in the Eligius standard library)?
- What if a developer uses a variable for the event name instead of a string literal?
- How does validation handle very long event names (>100 characters)?
- What happens if the Eligius event metadata has changed between library versions?
- How are events with optional arguments validated?
- What if an event has variable-length arguments (rest parameters)?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST validate that event names in `on event "name"` declarations match known Eligius event names from the event metadata
- **FR-002**: System MUST provide "Did you mean?" suggestions when an event name is misspelled, using fuzzy matching (Levenshtein distance ≤ 2)
- **FR-003**: System MUST display an error diagnostic at the event name location when an unknown event name is used
- **FR-004**: System MUST validate that the number of parameters declared in the event action matches the number of arguments provided by the Eligius event
- **FR-005**: System MUST display a warning diagnostic when parameter count mismatches occur, indicating expected vs actual counts
- **FR-006**: System MUST validate type compatibility between declared parameter types and event argument types (when type annotations are present)
- **FR-007**: System MUST display an error diagnostic when parameter type annotations don't match the event's argument types
- **FR-008**: System MUST only perform type validation when parameter type annotations are explicitly provided (opt-in)
- **FR-009**: System MUST handle events with zero arguments gracefully (no false positives)
- **FR-010**: System MUST use the existing event metadata infrastructure (`TIMELINE_EVENTS` from `timeline-events.generated.ts`)
- **FR-011**: System MUST not block compilation when validation warnings are present (only errors should block)
- **FR-012**: System MUST provide clear, actionable error messages that include the event name and available alternatives
- **FR-013**: System MUST respect the existing validation architecture (use `ValidationAcceptor` and error codes)
- **FR-014**: System MUST validate event names as string literals only (variables are not supported)

### Key Entities *(include if feature involves data)*

- **Event Metadata**: Represents an Eligius event definition with name, description, category, and argument specifications
  - **Event Name**: String identifier for the event (e.g., "data-sync", "before-request-video-url")
  - **Event Arguments**: Array of argument metadata with name and type properties
  - **Argument Name**: String identifier for an event argument (e.g., "syncStatus", "itemCount")
  - **Argument Type**: Type specification for an event argument (e.g., "string", "number", "boolean")

- **Event Action Definition**: DSL construct declaring a handler for a specific event
  - **Event Name Reference**: The string literal in `on event "name"`
  - **Action Parameters**: List of parameter declarations with optional type annotations
  - **Parameter Name**: Identifier for an action parameter
  - **Parameter Type Annotation**: Optional type specification in TypeScript syntax

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Developers catch 95% of event name typos at compile time (measured by validation error rate in test suite)
- **SC-002**: Developers receive actionable error messages with suggestions in under 300ms (measured by validation performance tests)
- **SC-003**: Zero false positives for valid event actions in existing test fixtures (measured by running validation on all `event-actions/valid/*.eligian` files)
- **SC-004**: Validation errors appear in the IDE Problems panel at the correct source location (event name or parameter) with appropriate severity (error vs warning)
- **SC-005**: Parameter count mismatches are detected with 100% accuracy across all known Eligius events (measured by test coverage of all 43 events)
- **SC-006**: Type mismatches are detected when type annotations are present, with clear messages indicating expected vs actual types
- **SC-007**: Developers can successfully compile event actions with warnings (only errors block compilation)
