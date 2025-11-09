# Feature Specification: Event Actions with Declarative Syntax

**Feature Branch**: `028-event-actions-the`
**Created**: 2025-11-07
**Status**: Draft
**Input**: User description: "event actions. The grammar and compiler should support event actions. These are action that are triggered by eventbus event dispatches."

## User Scenarios & Testing

### User Story 1 - Define Event-Triggered Actions (Priority: P1)

Developers need to define custom actions that execute automatically when specific events are broadcast through the Eligius eventbus. These event handlers should be declared using clean, readable syntax that clearly expresses the event-to-action relationship.

**Why this priority**: This is the core MVP functionality. Without the ability to define basic event actions, the feature provides no value. Event-driven programming is fundamental to interactive Eligius presentations.

**Independent Test**: Can be fully tested by writing an event action definition, compiling it to JSON, and verifying the generated `eventActions` configuration matches the expected Eligius format.

**Acceptance Scenarios**:

1. **Given** a developer wants to respond to a language change event, **When** they write `on event "language-change" action HandleLanguageChange(languageCode) [...]`, **Then** the compiler generates a valid `eventActions` entry with `eventName: "language-change"` and the action operations
2. **Given** a developer defines multiple event actions in one file, **When** compilation occurs, **Then** all event actions are extracted to the `eventActions` array in the correct order
3. **Given** a developer uses an event action with no parameters, **When** they write `on event "timeline-complete" action OnComplete [...]`, **Then** the compiler accepts the syntax and generates valid configuration
4. **Given** a developer references event parameters within the action body, **When** they use parameter names like `languageCode`, **Then** the compiler correctly maps these to `$operationData.eventArgs[n]` in the generated JSON

---

### User Story 2 - Access Event Arguments with Named Parameters (Priority: P2)

Developers need to access event payload data (eventArgs) passed from event dispatches using meaningful parameter names instead of array indices or implementation details like `$operationData.eventArgs[0]`.

**Why this priority**: While defining basic event actions (US1) is the MVP, accessing event data is essential for most real-world use cases. This story makes event actions truly useful by enabling data flow from events to actions.

**Independent Test**: Can be tested by defining an event action with multiple named parameters, triggering the event with test data, and verifying the parameters are correctly mapped to eventArgs array indices in the compiled configuration.

**Acceptance Scenarios**:

1. **Given** a developer defines `on event "user-click" action HandleClick(element, timestamp)`, **When** they reference `element` in the action body, **Then** the compiler replaces `element` with `$operationData.eventArgs[0]` in the JSON
2. **Given** a developer defines an event action with three parameters `(arg1, arg2, arg3)`, **When** they use all three in operations, **Then** the compiler maps them to `eventArgs[0]`, `eventArgs[1]`, `eventArgs[2]` respectively
3. **Given** a developer defines a parameter but never uses it, **When** compilation occurs, **Then** the compiler succeeds without errors (unused parameters are allowed)
4. **Given** a developer references a parameter that wasn't declared, **When** compilation occurs, **Then** the compiler produces an error indicating the undefined parameter

---

### User Story 3 - Support Event Topics for Namespacing (Priority: P3)

Developers need to register event actions for specific event topics (namespaces) to handle the same event name differently based on context. For example, handling "click" events differently for "navigation" vs "form-submission" topics.

**Why this priority**: Event topics are an advanced feature for complex presentations. The core functionality (P1-P2) works without topics, making this a valuable enhancement rather than a requirement.

**Independent Test**: Can be tested by defining an event action with a topic, compiling it, and verifying the generated JSON includes both `eventName` and `eventTopic` fields.

**Acceptance Scenarios**:

1. **Given** a developer defines `on event "click" topic "navigation" action HandleNavClick(target)`, **When** compilation occurs, **Then** the JSON includes `"eventName": "click"` and `"eventTopic": "navigation"`
2. **Given** a developer defines two actions for the same event but different topics, **When** compilation occurs, **Then** both actions are registered independently in `eventActions`
3. **Given** a developer omits the topic clause, **When** compilation occurs, **Then** the JSON includes `eventName` but `eventTopic` is undefined
4. **Given** a developer uses an empty string as a topic, **When** validation occurs, **Then** the compiler produces an error (topics must be non-empty strings)

---

### User Story 4 - Validate Event Action Definitions (Priority: P2)

Developers need compile-time validation to catch common mistakes in event action definitions, such as duplicate event/topic combinations, invalid event names, missing action bodies, and invalid parameter names.

**Why this priority**: Validation prevents runtime errors and improves developer experience. Since event actions only execute when triggered, errors might not surface during development without compile-time checks.

**Independent Test**: Can be tested by writing intentionally invalid event action definitions and verifying the compiler produces appropriate error messages with source locations.

**Acceptance Scenarios**:

1. **Given** a developer defines two event actions with the same event name and topic, **When** validation occurs, **Then** the compiler produces a warning about potential duplicate handlers
2. **Given** a developer uses a reserved keyword as a parameter name (e.g., `if`, `for`), **When** validation occurs, **Then** the compiler produces an error
3. **Given** a developer defines an event action with an empty action body, **When** validation occurs, **Then** the compiler produces an error
4. **Given** a developer uses a non-string literal for event name (e.g., a variable), **When** validation occurs, **Then** the compiler produces an error requiring string literals
5. **Given** a developer uses special characters in an action name, **When** validation occurs, **Then** the compiler validates against Eligius action naming rules

---

### User Story 5 - IDE Support for Event Actions (Priority: P3)

Developers need syntax highlighting, autocompletion, and hover documentation for event action syntax to improve productivity and discoverability.

**Why this priority**: IDE support significantly improves developer experience but isn't required for functionality. Developers can write event actions without IDE features, making this an enhancement.

**Independent Test**: Can be tested by opening an `.eligian` file with event actions in VS Code and verifying syntax highlighting, autocomplete suggestions, and hover tooltips work correctly.

**Acceptance Scenarios**:

1. **Given** a developer types `on event ` in VS Code, **When** they trigger autocomplete, **Then** the IDE suggests known Eligius event names (e.g., "timeline-play", "language-change")
2. **Given** a developer hovers over a known event name string literal, **When** hover tooltip appears, **Then** it displays documentation from Eligius `TimelineEventNames` (if available)
3. **Given** a developer types `action ` after an event clause, **When** they trigger autocomplete, **Then** the IDE suggests valid action names following Eligius naming conventions
4. **Given** a developer has an event action in the file, **When** syntax highlighting is applied, **Then** keywords (`on`, `event`, `topic`, `action`) are highlighted distinctly from strings and identifiers

---

### Edge Cases

- What happens when an event action is defined but the event is never broadcast? (Action is registered but never executes - this is valid)
- How does the system handle an event action with zero parameters when the event broadcasts arguments? (Parameters are ignored - the action can still execute)
- What happens when an event action references more parameters than the event provides? (Runtime: undefined values - compile-time: no error since event schemas aren't enforced yet)
- How does the system handle extremely long event names or topics? (Validated against reasonable length limits, e.g., 100 characters)
- What happens when an event action name collides with a regular action name? (Treated as separate namespaces - eventActions and actions are distinct lists in Eligius)
- How does the system handle event actions defined in imported library files? (Event actions are extracted during compilation of the importing file - same as regular actions)

## Requirements

### Functional Requirements

- **FR-001**: System MUST support `on event "<eventName>" action <ActionName>(<params>) [<operations>]` syntax for defining event-triggered actions
- **FR-002**: System MUST extract event action definitions and compile them to Eligius `eventActions` JSON format with `eventName`, `name`, and `startOperations` fields
- **FR-003**: System MUST support optional `topic "<topicName>"` clause between `event` and `action` keywords for event namespacing
- **FR-004**: System MUST map event action parameters to `$operationData.eventArgs[n]` in the compiled JSON, where n is the zero-based parameter index
- **FR-005**: System MUST allow zero or more named parameters in the event action parameter list
- **FR-006**: System MUST validate that event names and topics are non-empty string literals (not variables or expressions) and MUST NOT exceed 100 characters in length
- **FR-007**: System MUST validate that event action names follow the same naming rules as regular actions (pattern: `/^[a-zA-Z_][a-zA-Z0-9_]*$/` - must start with letter or underscore, contain only alphanumeric characters and underscores)
- **FR-008**: System MUST validate that parameter names are valid identifiers and not reserved keywords
- **FR-009**: System MUST produce errors for event actions with empty action bodies
- **FR-010**: System MUST support all existing operation calls within event action bodies (same as regular actions)
- **FR-011**: System MUST allow referencing other actions (via `requestAction`/`startAction`) from within event action bodies
- **FR-012**: System MUST warn when multiple event actions are defined for the same event name and topic combination
- **FR-013**: System MUST generate unique IDs for each event action in the compiled JSON
- **FR-014**: System MUST preserve the order of event actions as they appear in the source file when generating the `eventActions` array
- **FR-015**: System MUST support event actions alongside regular actions and timeline actions in the same file

### Key Entities

- **Event Action Definition**: A DSL construct that binds an action to an event. Contains: event name (string), optional topic (string), action name (identifier), parameter list (identifiers), and action body (operations)
- **Event Parameter**: A named identifier in the event action parameter list that maps to an index in the `eventArgs` array passed from event dispatches
- **Event Name**: A string literal identifying the event type (e.g., "language-change", "timeline-complete"). Corresponds to Eligius eventbus event names
- **Event Topic**: An optional string literal for namespacing events of the same name (e.g., "click" event with "navigation" or "form" topics)

## Success Criteria

### Measurable Outcomes

- **SC-001**: Developers can define basic event actions (event name + action body) and compile them to valid Eligius JSON in under 30 seconds
- **SC-002**: Event action parameter references are correctly mapped to `$operationData.eventArgs[n]` indices in 100% of cases
- **SC-003**: Compiler validation catches common errors (invalid event names, duplicate handlers, reserved parameter names) with clear error messages within 2 seconds
- **SC-004**: Event actions with topics compile to JSON with correct `eventName` and `eventTopic` fields in 100% of cases
- **SC-005**: VS Code provides autocomplete suggestions for event names within 500ms of typing `on event "`
- **SC-006**: Compiled event action JSON configurations execute correctly in the Eligius runtime without errors when events are dispatched
- **SC-007**: Documentation and examples enable developers to write their first event action within 5 minutes without external help
- **SC-008**: Event actions support the same operation set as regular actions (100% feature parity for action bodies)

## Assumptions

- Event names follow existing Eligius conventions (kebab-case strings like "timeline-play", "language-change")
- The Eligius eventbus does not currently expose typed event metadata - event argument types are `any[]`
- Event actions only support `startOperations`, not `endOperations` (based on Eligius source code analysis)
- Event actions are registered globally per presentation, not scoped to specific timelines
- The `on event` syntax is distinct from other DSL constructs and won't conflict with future extensions
- Event validation (checking if an event name exists in Eligius) is out of scope - any string literal is accepted
- Event argument type checking is deferred until Eligius provides event type metadata
- Event actions can reference constants, regular actions, and all operation types available in the DSL
