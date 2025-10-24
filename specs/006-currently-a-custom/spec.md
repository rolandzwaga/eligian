# Feature Specification: Unified Custom Action and Operation Call Syntax

**Feature Branch**: `006-currently-a-custom`
**Created**: 2025-01-23
**Status**: Draft
**Input**: User description: "Currently, a custom action has a very weird syntax to be add to an action. Its like this: at 0s..3s { fadeIn(\"123\", 1000) } In reality, we want a custom action to be called in exactly the same way that an operation is called: at 3s..8s [ fadeIn(\"123\", 1000) selectElement(\".content\") addClass(\"visible\") // FOR LOOP in timeline event for (section in [\"intro\", \"main\", \"outro\"]) { selectElement(@@section) addClass(\"active\") wait(500) } ] [ fadeIn(\"123\", 1000) selectElement(\".content\") removeClass(\"visible\") ] so, the grammar should allow the mixing of operation names and custom action names, and the type system should also be able to know the difference. We can discuss how to implement this, would it be an idea to make all of the operation names reserved words? Because it should definitely be illegal to give a custom action the same name as an operation."

## User Scenarios & Testing

### User Story 1 - Mix Custom Actions and Operations in Timeline Events (Priority: P1)

As an Eligian DSL user, I want to call custom actions using the same syntax as built-in operations so that I can seamlessly mix them in timeline event blocks without learning different syntaxes.

**Why this priority**: This is the core value of the feature - unifying the syntax reduces cognitive load and makes the DSL more intuitive. Without this, users must remember two different syntaxes for essentially the same concept (invoking executable behavior).

**Independent Test**: Can be fully tested by defining a custom action (e.g., `fadeIn`) and calling it within a timeline event's start operations using square bracket syntax `[ fadeIn(...) ]`, verifying it compiles correctly and delivers a unified syntax experience.

**Acceptance Scenarios**:

1. **Given** a custom action `fadeIn(selector, duration)` is defined, **When** I call it in a timeline event like `at 3s..8s [ fadeIn("#box", 1000) ]`, **Then** the DSL compiles successfully and generates the correct Eligius JSON for invoking that custom action
2. **Given** a timeline event with mixed calls like `[ fadeIn("#box", 1000) selectElement(".content") addClass("visible") ]`, **When** I compile the DSL, **Then** both the custom action (`fadeIn`) and built-in operations (`selectElement`, `addClass`) execute in sequence as specified
3. **Given** I have defined multiple custom actions, **When** I call them in any order within a timeline event block, **Then** they execute in the order specified, just like built-in operations

---

### User Story 2 - Prevent Name Collisions Between Custom Actions and Operations (Priority: P1)

As an Eligian DSL user, I want the compiler to prevent me from naming a custom action the same as a built-in operation so that I avoid runtime confusion and unexpected behavior.

**Why this priority**: This is critical for correctness and safety. Allowing name collisions would create ambiguity and potentially break existing code when new operations are added to Eligius. This must be enforced from day one.

**Independent Test**: Can be fully tested by attempting to define a custom action with the same name as a built-in operation (e.g., `action selectElement() [ ... ]`) and verifying the compiler rejects it with a clear error message.

**Acceptance Scenarios**:

1. **Given** a built-in operation named `selectElement` exists, **When** I attempt to define a custom action `action selectElement() [ ... ]`, **Then** the compiler rejects it with an error message like "Cannot define action 'selectElement': name conflicts with built-in operation"
2. **Given** I define a custom action `myCustomAction` in version N of Eligius, **When** I upgrade to version N+1 that adds a built-in operation with the same name, **Then** the compiler rejects the custom action definition with a clear error message indicating the name collision and requiring the user to rename their custom action
3. **Given** I attempt to define two custom actions with the same name in the same file, **When** I compile the DSL, **Then** the compiler rejects it with a duplicate definition error

---

### User Story 3 - Support Control Flow with Mixed Calls (Priority: P2)

As an Eligian DSL user, I want to use control flow constructs (if/else, for loops) that can contain both custom actions and built-in operations so that I can write expressive timeline logic.

**Why this priority**: This enables advanced use cases like iterating over data and applying custom behaviors. While important, it builds on US1 and can be implemented after the core syntax unification works.

**Independent Test**: Can be fully tested by writing a for loop within a timeline event that calls both a custom action and built-in operations, verifying the loop executes correctly for each iteration.

**Acceptance Scenarios**:

1. **Given** a for loop in a timeline event like `for (item in items) { customAction(@@item) builtInOp(@@item) }`, **When** I compile and run the timeline, **Then** both the custom action and built-in operation execute for each item in the collection
2. **Given** an if/else block that calls a custom action in the `then` branch and a built-in operation in the `else` branch, **When** the condition is evaluated, **Then** the appropriate branch executes with the correct call type
3. **Given** nested control flow with mixed calls, **When** I compile the DSL, **Then** scoping rules apply correctly and each call resolves to the right definition (custom action vs operation)

---

### Edge Cases

- What happens when a custom action and a built-in operation have similar names (e.g., `mySelect` vs `selectElement`)? (Should not conflict - only exact matches are forbidden)
- How does the system handle a call to an undefined custom action vs an undefined operation? (Both should produce "not found" errors, but messages should indicate whether it searched for an action or operation)
- What if a custom action is defined after it's called in a timeline event? (Forward references should be allowed if the action is defined in the same file - standard scoping rules apply)
- What if a custom action calls another custom action within its body? (Should work seamlessly - custom actions can call other custom actions and operations)
- What if a user misspells a custom action name? (Compiler should suggest similar names from both custom actions and operations in the error message)

## Requirements

### Functional Requirements

- **FR-001**: The DSL MUST allow custom actions to be called using the same syntax as built-in operations (e.g., `fadeIn("#box", 1000)` regardless of whether `fadeIn` is custom or built-in)
- **FR-002**: Timeline event blocks (start operations and end operations) MUST accept both custom action calls and built-in operation calls in any order
- **FR-003**: The compiler MUST distinguish between custom action calls and operation calls during validation and transformation
- **FR-004**: The compiler MUST reject custom action definitions that use the same name as any built-in operation with a clear error message
- **FR-005**: The compiler MUST validate that called names resolve to either a defined custom action or a registered built-in operation
- **FR-006**: Custom action calls MUST support the same argument syntax as operation calls (positional arguments, object literals, expressions, variable references)
- **FR-007**: Control flow constructs (if/else, for loops) within timeline events MUST support both custom action calls and operation calls in their bodies
- **FR-008**: The compiler MUST provide helpful error messages when a call cannot be resolved, suggesting similar names from both custom actions and operations
- **FR-009**: Custom actions defined in the same file MUST be available for calls in timeline events regardless of definition order (forward references allowed)
- **FR-010**: The type system MUST track and differentiate custom action signatures from operation signatures for type checking

### Key Entities

- **Custom Action Call**: A call to a user-defined action within a timeline event block, using the same syntax as operation calls (name + arguments)
- **Operation Call**: A call to a built-in Eligius operation, indistinguishable in syntax from custom action calls
- **Name Registry**: Internal tracking of all available names (custom actions + built-in operations) to detect collisions and resolve calls

## Success Criteria

### Measurable Outcomes

- **SC-001**: Users can write timeline events that mix custom actions and operations without needing to remember different syntaxes (100% syntax parity)
- **SC-002**: The compiler rejects 100% of custom action definitions that collide with built-in operation names with clear error messages
- **SC-003**: Users can identify and fix "undefined action/operation" errors in under 30 seconds using compiler suggestions
- **SC-004**: All existing DSL code that uses the old custom action syntax continues to work (100% backward compatibility, with deprecation warnings)
- **SC-005**: Compilation time for files with mixed custom actions and operations increases by less than 10% compared to files with only operations

## Assumptions

- **ASM-001**: Built-in operation names are stable and documented (the set of reserved names is available from the operation registry)
- **ASM-002**: Custom actions are defined at the file/module level (not nested within other constructs)
- **ASM-003**: Users prefer a unified syntax over maintaining two separate syntaxes for actions vs operations
- **ASM-004**: The old custom action invocation syntax (curly braces) can be deprecated in favor of the unified syntax
- **ASM-005**: Type checking for custom action calls follows the same rules as operation calls (parameter count, types match signatures)

## Open Questions

- **OQ-001**: How should the migration path work for existing code using the old `{ customAction() }` syntax? Automatic migration, deprecation warnings, or breaking change?
- **OQ-002**: Should custom actions be allowed to override/shadow operations for backward compatibility when Eligius adds new operations?
