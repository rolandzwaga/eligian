# Feature Specification: Custom Action Code Completions

**Feature Branch**: `008-custom-action-code`
**Created**: 2025-10-24
**Status**: Draft
**Input**: User description: "custom action code completions. The current code completion that shows the available operations should also list all of the custom actions that are available. To see the distinction between them, we should prefix the operations with 'operation:' and the custom actions by 'action:' the completion list should sort the operations and actions alphabetically."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See Custom Actions in Code Completion (Priority: P1)

When a developer types an operation call in an action body or timeline event, the IDE shows both built-in operations and custom actions in the code completion list, clearly labeled to distinguish between them.

**Why this priority**: This is the core feature - making custom actions discoverable through code completion. Without this, developers must remember action names manually or reference other parts of the file.

**Independent Test**: Can be fully tested by defining a custom action (e.g., `fadeIn`) and triggering code completion in a timeline event. The completion list should show both `operation: selectElement` and `action: fadeIn`.

**Acceptance Scenarios**:

1. **Given** a file with custom action `fadeIn` defined, **When** developer types in a timeline event and triggers code completion, **Then** completion list shows both operations (prefixed with `operation:`) and custom actions (prefixed with `action:`)
2. **Given** a file with no custom actions, **When** developer triggers code completion, **Then** completion list shows only operations (all prefixed with `operation:`)
3. **Given** a file with multiple custom actions (`fadeIn`, `fadeOut`, `slideIn`), **When** developer triggers code completion, **Then** completion list shows all custom actions alphabetically sorted with `action:` prefix

---

### User Story 2 - Alphabetical Sorting of Combined List (Priority: P2)

The code completion list displays operations and actions in a single alphabetically sorted list, making it easy to find items regardless of whether they're operations or actions.

**Why this priority**: Alphabetical sorting improves discoverability and reduces cognitive load. Users can quickly scan the list to find what they need without mentally separating operations from actions.

**Independent Test**: Can be tested by creating a file with actions whose names alphabetically interleave with operation names (e.g., action `animate` vs operation `addClass`), and verifying the completion list shows them in correct alphabetical order.

**Acceptance Scenarios**:

1. **Given** actions `fadeIn`, `setup` and operations `addClass`, `selectElement`, `wait`, **When** developer triggers completion, **Then** list shows items in order: `action: fadeIn`, `operation: addClass`, `operation: selectElement`, `action: setup`, `operation: wait`
2. **Given** action named `aaa` and operation `zzz`, **When** developer triggers completion, **Then** action `aaa` appears before operation `zzz` in the list
3. **Given** actions and operations with identical names after prefix (e.g., `action: test`, `operation: test`), **When** sorted alphabetically, **Then** they appear together in the list

---

### User Story 3 - Prefix Clarity for Type Distinction (Priority: P3)

The code completion list uses consistent prefixes (`operation:` and `action:`) to help developers immediately identify whether an item is a built-in operation or a custom action without needing to check definitions.

**Why this priority**: Clear visual distinction prevents confusion and helps developers understand the codebase structure. This is especially valuable for teams with multiple developers or when revisiting code after time away.

**Independent Test**: Can be tested by verifying that all completion items have exactly one of two prefix formats, and that selecting an item inserts only the actual name (without the prefix).

**Acceptance Scenarios**:

1. **Given** developer triggers code completion, **When** viewing the list, **Then** every operation shows prefix `operation:` and every custom action shows prefix `action:`
2. **Given** developer selects `operation: selectElement` from completion list, **When** item is inserted, **Then** only `selectElement` is inserted (prefix removed)
3. **Given** developer selects `action: fadeIn` from completion list, **When** item is inserted, **Then** only `fadeIn` is inserted (prefix removed)

---

### Edge Cases

- What happens when a custom action has the same name as a built-in operation? (Note: This should already be prevented by existing validation from Feature 006)
- How does the completion list behave when there are 50+ custom actions defined?
- What happens when developer types partial text that matches both operations and actions (e.g., typing "sel" should filter to show both `operation: selectElement` and `action: selectCustom`)?
- How does completion work in different contexts (timeline events, action bodies, control flow blocks)?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Code completion MUST include all custom actions defined in the current document
- **FR-002**: Code completion MUST prefix built-in operations with `operation:` in the display label
- **FR-003**: Code completion MUST prefix custom actions with `action:` in the display label
- **FR-004**: Code completion MUST sort all items (operations and actions) alphabetically in a single unified list
- **FR-005**: Code completion MUST insert only the actual name (without prefix) when user selects an item
- **FR-006**: Code completion MUST work in all contexts where operations are valid (timeline events, action bodies, if/else blocks, for loops, sequences, staggers)
- **FR-007**: Code completion MUST update the action list when custom actions are added, modified, or removed in the document
- **FR-008**: Code completion filtering (when user types partial text) MUST match against the actual name, not the prefixed label

### Key Entities

- **Custom Action**: A user-defined reusable operation sequence with a name and optional parameters (already exists in DSL)
- **Built-in Operation**: A pre-defined Eligius operation from the operation registry (already exists)
- **Completion Item**: A suggestion shown in the IDE code completion list with display label (includes prefix) and insert text (actual name)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Developers can discover all available custom actions through code completion without referencing other parts of the file
- **SC-002**: Code completion list displays operations and actions in a single alphabetically sorted view
- **SC-003**: 100% of custom actions defined in the current document appear in code completion suggestions
- **SC-004**: Visual distinction between operations and actions is immediately clear (prefix format is consistent and recognizable)
- **SC-005**: Completion list updates within 1 second when custom actions are added or modified in the document

## Assumptions

- Code completion infrastructure already exists for operations (Feature 002 - Code Completion)
- Custom action definitions are already validated and parsed correctly
- The existing completion provider can be extended to include custom actions
- Alphabetical sorting follows standard lexicographic order (case-insensitive)
- Prefixes are purely cosmetic (display only) and don't affect the actual code inserted

## Out of Scope

- Cross-file action references (future: library imports)
- Documentation/hover hints for custom actions (separate feature)
- Parameter hints for custom action calls (separate feature)
- Filtering by action vs operation type (all items shown in unified list)
- Custom sorting orders (alphabetical only)
