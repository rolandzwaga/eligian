# Feature Specification: Event Action Code Completion

**Feature Branch**: `030-event-action-code`
**Created**: 2025-11-12
**Status**: Draft
**Input**: User description: "event action code completion with camelCase action names"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Event Name Completion (Priority: P1)

As a developer writing event actions, I want event name suggestions when I type `on event ""` so that I can quickly discover available events without consulting documentation.

**Why this priority**: This is the entry point for the entire event action workflow. Without knowing which events exist, developers cannot write event actions. This delivers immediate value by surfacing the available event API.

**Independent Test**: Can be fully tested by typing `on event "` and pressing Ctrl+Space, then verifying that a list of known Eligius event names appears with descriptions.

**Acceptance Scenarios**:

1. **Given** a developer is editing an Eligian file, **When** they type `on event "` and press Ctrl+Space inside the quotes, **Then** they see a completion list showing all available Eligius event names with descriptions.
2. **Given** the developer is seeing event name suggestions, **When** they select an event name from the list, **Then** the event name is inserted into the string literal.
3. **Given** a developer types partial event name, **When** they press Ctrl+Space, **Then** they see filtered suggestions.

---

### User Story 2 - Event Action Skeleton Generation (Priority: P2)

As a developer who has selected an event name, I want the IDE to generate a complete event action skeleton with camelCase action name and parameter list so that I can start implementing the handler immediately.

**Why this priority**: Once developers know which event to handle, auto-generating the action definition removes boilerplate friction and ensures naming consistency.

**Independent Test**: Can be fully tested by selecting an event name and verifying skeleton generation with proper camelCase formatting.

**Acceptance Scenarios**:

1. **Given** a developer selects event "language-change", **When** skeleton is generated, **Then** action name is `handleLanguageChange` (camelCase).
2. **Given** an event has multiple parameters, **When** skeleton is generated, **Then** all parameters are included with correct names and types.
3. **Given** an event has no parameters, **When** skeleton is generated, **Then** action has empty parameter list.
4. **Given** event "before-request-video-url", **When** skeleton is generated, **Then** action name is `handleBeforeRequestVideoUrl` (camelCase).

---

### User Story 3 - Event Action Parameter Type Inference (Priority: P3)

As a developer writing operations inside an event action body, I want the type system to understand event parameter types for type checking and IntelliSense.

**Why this priority**: Enhances developer experience with type safety after skeleton is created. Lower priority because functional event actions work without it.

**Independent Test**: Can be fully tested by verifying type checking and hover documentation work for event action parameters.

**Acceptance Scenarios**:

1. **Given** event action with typed parameters, **When** writing operation statements, **Then** type system validates parameter usage.
2. **Given** event action parameter, **When** hovering over parameter name, **Then** type information is displayed.
3. **Given** type mismatch, **When** using parameter incorrectly, **Then** IDE shows type error.

---

### Edge Cases

- **Event name not in metadata**: Custom event names allowed but no skeleton generation.
- **Complex parameter types**: Use type name as-is from metadata.
- **Cursor position**: Inside action body after generation.
- **Duplicate action names**: Validation catches duplicates per existing rules.
- **No arguments**: Empty parameter list.
- **Multiple completions**: Each is independent.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide event name completion inside string literal after `on event "`.
- **FR-002**: Event name completion MUST include all 43 events from timeline-events.generated.ts.
- **FR-003**: Each completion item MUST include event name, description, and category.
- **FR-004**: Event name completion MUST be filterable by partial names.
- **FR-005**: System MUST generate complete event action skeleton when event name is selected.
- **FR-006**: Action name generation MUST convert hyphenated event names to camelCase with "handle" prefix (e.g., "language-change" to "handleLanguageChange", "before-request-video-url" to "handleBeforeRequestVideoUrl").
- **FR-007**: Parameter list MUST include all event arguments with names and types from metadata.
- **FR-008**: Parameter type annotations MUST use Eligian type syntax.
- **FR-009**: Cursor MUST be positioned inside empty action body after generation.
- **FR-010**: System MUST support zero, one, or multiple parameters.
- **FR-011**: Type system SHOULD recognize event action parameters for type checking.

### Key Entities

- **Event Metadata**: Event name, description, category, and argument list from timeline-events.generated.ts.
- **Event Action Skeleton**: Generated code with event name, action name, parameter list, and empty body.
- **Event Action Parameter**: Typed parameter from event metadata.
- **Completion Context**: Cursor position context for triggering completion.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Developers can discover all 43 events by typing `on event "` and pressing Ctrl+Space.
- **SC-002**: Skeleton generation reduces typing by at least 80 percent.
- **SC-003**: 100 percent of events have correctly generated parameter lists.
- **SC-004**: Action names follow camelCase convention for 100 percent of events.
- **SC-005**: Zero cursor movements needed after skeleton generation.
- **SC-006**: Type checking identifies parameter type mismatches.
- **SC-007**: Completion response time under 300ms.

## Assumptions

- Event metadata is complete and accurate.
- "handle" prefix plus camelCase is preferred naming (e.g., handleLanguageChange, handleUserLogin).
- Each event action handles one event.
- Typir integration explored during implementation.
- Event metadata types map to Eligian annotations.
- Cursor position inside action body is optimal.

## Dependencies

- Eligius Event Metadata (timeline-events.generated.ts)
- Existing Completion Infrastructure
- Type System Integration
- LSP Snippet Support

## Out of Scope

- Event Topic Completion
- Custom Event Registration
- Event Action Refactoring
- Event Argument Validation
- Multi-Event Actions
- Event Action Templates
