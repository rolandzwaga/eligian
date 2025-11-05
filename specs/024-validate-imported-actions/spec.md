# Feature Specification: Validate Imported Actions in Operation Context

**Feature Branch**: `024-validate-imported-actions`
**Created**: 2025-01-05
**Status**: Draft
**Input**: User description: "validate imported actions. currently it is possible to import an action using this syntax: import { foo } from \"./bar.eligian\" And the validator will check whether the action foo indeed exists in the file bar.eligian BUT, the when this action is then used in another action, for example like this: action showSlide(slideId: string, duration: number) [ foo(\"#\" + slideId, duration) selectElement(\"#\" + slideId) addClass(\"active\") ] Then the validator marks foo as an 'unknown operation'. This should be recognized as a valid action though."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Call Imported Actions Without Validation Errors (Priority: P1)

As an Eligian developer, when I import an action from another file and use it within my action definitions, the IDE should recognize it as a valid action call and not show "unknown operation" errors.

**Why this priority**: This is the core bug fix. Without this, imported actions are unusable because the IDE flags them as errors even though they're valid, breaking the entire library import workflow.

**Independent Test**: Can be fully tested by creating two files - one defining an action, another importing and calling it - and verifying no validation errors appear. This delivers immediate value by making the existing import feature actually usable.

**Acceptance Scenarios**:

1. **Given** a library file `animations.eligian` with action `fadeIn(selector: string, duration: number)`
   **When** I import `fadeIn` in `demo.eligian` using `import { fadeIn } from "./animations.eligian"`
   **And** I call `fadeIn("#box", 1000)` within an action body
   **Then** the validator should NOT show "unknown operation" error for `fadeIn`

2. **Given** I have imported multiple actions from a library file
   **When** I use any of the imported actions within my custom actions
   **Then** all imported action calls should validate correctly without errors

3. **Given** I import an action but haven't called it yet
   **When** I type the action name in an action body
   **Then** code completion should suggest the imported action with its signature

---

### User Story 2 - Distinguish Between Invalid Operations and Valid Imported Actions (Priority: P2)

As an Eligian developer, the validator should still catch truly invalid operation names (typos, non-existent operations) while allowing imported action calls, so I can trust the validation feedback.

**Why this priority**: This ensures the fix doesn't break existing operation validation - we need both imported actions to work AND invalid operations to still be caught.

**Independent Test**: Can be tested by mixing imported actions with invalid operation names and verifying only the truly invalid ones are flagged. This maintains the quality of error detection.

**Acceptance Scenarios**:

1. **Given** I have imported action `fadeIn` from a library
   **When** I call `fadeIn("#box", 1000)` (valid) and `fadeout("#box", 1000)` (typo - should be `fadeOut`)
   **Then** validator should NOT error on `fadeIn` but SHOULD error on `fadeout` with suggestions

2. **Given** I import action `addClass` from my utilities library
   **And** Eligius also has a built-in operation called `addClass`
   **When** I call `addClass("active")` in my action
   **Then** validator should recognize this could be either the imported action OR the operation and not show errors

3. **Given** I have no imports in my file
   **When** I call a non-existent operation like `hasElement("#test")`
   **Then** validator should show "unknown operation" error with suggestions as it does today

---

### User Story 3 - Get Clear Error Messages for Import Mismatches (Priority: P3)

As an Eligian developer, when I import an action that doesn't exist in the target file, I should get a clear error message at the import statement (not at the usage site), so I know exactly what's wrong.

**Why this priority**: This improves developer experience by showing errors at the right location. Since import validation already works (per the problem description), this is about ensuring error clarity.

**Independent Test**: Can be tested by importing non-existent actions and verifying errors appear at the import line with clear messages. This improves debugging speed.

**Acceptance Scenarios**:

1. **Given** I write `import { nonExistent } from "./library.eligian"`
   **And** `nonExistent` action doesn't exist in `library.eligian`
   **When** the validator runs
   **Then** an error should appear at the import statement saying "Action 'nonExistent' not found in './library.eligian'"
   **And** no error should appear when I later call `nonExistent()` (since the error is already at the import)

2. **Given** I import an action that exists
   **But** I later call it with the wrong number of parameters
   **When** the validator runs
   **Then** the error should appear at the call site (not the import) with a parameter count mismatch message

---

### Edge Cases

- What happens when an imported action has the same name as a built-in Eligius operation? (Should allow it - actions take precedence in action bodies, operations in timeline contexts)
- How does the system handle circular imports where File A imports from File B which imports from File A?
- What if an imported action is renamed in the source file after being imported?
- How does validation behave when the imported file has syntax errors?
- What happens when importing actions from files outside the workspace?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Validator MUST recognize imported action names as valid identifiers when used as operation calls within action bodies
- **FR-002**: Validator MUST distinguish between imported action calls and built-in Eligius operations during validation
- **FR-003**: Validator MUST continue to flag truly unknown operations (typos, non-existent) that are neither imports nor built-in operations
- **FR-004**: Validator MUST check operation calls against imported actions before checking against built-in operations registry
- **FR-005**: Validator MUST provide suggestions for misspelled action names (both imported and built-in) when operation validation fails
- **FR-006**: Validator MUST show errors at import statements for non-existent actions, not at call sites
- **FR-007**: System MUST maintain existing import validation that checks action existence in source files
- **FR-008**: Code completion MUST include imported actions when suggesting operation calls within action bodies

### Key Entities

- **Imported Action Reference**: Represents a reference to an action defined in another file, including the action name, source file path, and resolved action definition
- **Operation Call Context**: The context in which an operation/action is called (within an action body, timeline event, control flow statement, etc.)
- **Validation Scope**: The set of valid identifiers available at a given point in the code, including imported actions, local actions, and built-in operations

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Developers can use imported actions in their code without seeing false "unknown operation" validation errors
- **SC-002**: 100% of valid imported action calls pass validation without errors
- **SC-003**: Validator correctly distinguishes between imported actions and invalid operations in 100% of test cases
- **SC-004**: Code completion suggests imported actions within 500ms of typing in action bodies
- **SC-005**: Validation errors appear at import statements (not call sites) for non-existent actions in 100% of cases
- **SC-006**: Existing operation validation tests continue to pass without modification (no regression)

## Assumptions

- Import resolution already works correctly (per problem description: "the validator will check whether the action foo indeed exists in the file bar.eligian")
- The scope provider correctly resolves action references at import time
- The issue is isolated to the operation validator (`checkOperationExists`) which doesn't check imported actions
- Imported actions should take precedence over built-in operations when called within action bodies (consistent with scoping rules)
- Timeline contexts should continue to only allow built-in operations (actions are called differently there: e.g., `at 0s..1s fadeIn()` not `fadeIn()` in operation sequence)

## Out of Scope

- Changing import syntax or import resolution logic (already working)
- Adding type checking for imported action parameters (that's a separate type system concern)
- Optimizing import performance or caching
- Adding support for wildcard imports (`import * from ...`)
- Refactoring the overall validation architecture
