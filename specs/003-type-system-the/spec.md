# Feature Specification: Robust Type System with Typir Integration

**Feature Branch**: `003-type-system-the`
**Completed**: 2025-10-22
**Created**: 2025-10-19
**Status**: Draft
**Input**: User description: "type system. The time has come to implement a solid and robust actual type system for Eligian, the grammar alone is not enough to properly validate the syntax and drive the code completions. There exists a very nice library for building typesystems called Typir, which has specialized integrations with Langium. A perfect companion!"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Real-Time Type Error Detection in IDE (Priority: P1)

As a DSL developer writing Eligian code, I want to see type errors immediately as I type so that I can fix issues before running my timeline presentations.

**Why this priority**: Immediate feedback during development is the primary value of a type system. Without this, developers waste time debugging runtime errors that could have been caught during writing. This is the foundation that all other type system features build upon.

**Independent Test**: Can be fully tested by opening a `.eligian` file in VS Code, writing code with intentional type mismatches (e.g., passing a string to a parameter expecting a number), and verifying that red squiggles appear under the error with a descriptive message in the Problems panel.

**Acceptance Scenarios**:

1. **Given** a developer is writing an action that calls `animate()` with a duration parameter, **When** they pass a string value where a number is expected, **Then** the IDE shows an error squiggle with the message "Type mismatch: expected 'number' but got 'string'"

2. **Given** a developer declares a variable with one type and uses it in a context expecting a different type, **When** the IDE performs validation, **Then** the error appears within 500ms with the exact location and a helpful fix suggestion

3. **Given** a developer has type annotations on action parameters, **When** they call that action with arguments of the wrong type, **Then** the IDE highlights the problematic argument and shows what type was expected vs. what was provided

---

### User Story 2 - Intelligent Code Completion Based on Types (Priority: P2)

As a DSL developer, I want my IDE to suggest only valid values and operations based on the current type context so that I can write code faster and avoid type errors.

**Why this priority**: Type-aware completions significantly improve productivity once basic error detection works. This builds on P1 by using type information proactively rather than reactively. It's P2 because developers can still work effectively with just error detection, but completions make the experience much smoother.

**Independent Test**: Can be fully tested by triggering autocomplete (Ctrl+Space) at various points in Eligian code and verifying that suggestions are filtered by type. For example, after typing a variable name that holds a string, only string-compatible operations should appear.

**Acceptance Scenarios**:

1. **Given** a developer is calling an operation that expects specific parameter types, **When** they trigger autocomplete for an argument position, **Then** the suggestions prioritize variables and expressions matching the expected type

2. **Given** a developer types a variable reference followed by a dot operator, **When** autocomplete is triggered, **Then** only operations and properties valid for that variable's type appear in the suggestion list

3. **Given** a developer is inside an action with typed parameters, **When** they start typing a parameter name, **Then** autocomplete shows the parameter with its type annotation as part of the suggestion

---

### User Story 3 - Type Inference for Cleaner Code (Priority: P2)

As a DSL developer, I want the type system to automatically infer types from my code usage so that I don't have to manually annotate every variable and parameter while still getting type safety.

**Why this priority**: Type inference reduces boilerplate while maintaining safety. It's tied with P2 because both features enhance the developer experience after basic validation works. Inference is particularly important for Eligian since the DSL aims to be concise and readable.

**Independent Test**: Can be fully tested by writing actions without explicit type annotations, using parameters in ways that imply specific types (e.g., passing to operations with known type requirements), and verifying that type errors are still caught correctly as if the types were explicitly annotated.

**Acceptance Scenarios**:

1. **Given** a developer writes an action with an unannotated parameter that is passed to `selectElement()`, **When** the type system analyzes the code, **Then** the parameter is inferred as type 'string' and subsequent type checking uses this inferred type

2. **Given** a developer uses the same parameter in multiple operations with consistent type requirements, **When** type inference runs, **Then** the system successfully unifies all constraints and assigns the appropriate type

3. **Given** a developer uses a parameter in conflicting ways (e.g., passed to both string and number operations), **When** type checking runs, **Then** the system reports a clear error explaining the conflict: "Cannot infer type: parameter is used as both 'string' and 'number'"

---

### User Story 4 - Cross-Reference Type Validation (Priority: P3)

As a DSL developer, I want the type system to validate that action calls throughout my codebase use the correct argument types based on the action's parameter type annotations so that refactoring is safer.

**Why this priority**: This extends type checking across file boundaries and action definitions, providing safety for larger codebases. It's P3 because it requires P1 (basic type checking) to be working first, and delivers value primarily in larger projects with multiple reusable actions.

**Independent Test**: Can be fully tested by defining an action with typed parameters in one part of the codebase, calling it from another location with incorrect types, and verifying that the error is reported at the call site with a reference to the action's signature.

**Acceptance Scenarios**:

1. **Given** an action is defined with typed parameters `fadeIn(selector: string, duration: number)`, **When** another action calls `fadeIn(123, "slow")`, **Then** the type system reports errors for both arguments with messages like "Argument 1: expected 'string' but got 'number'"

2. **Given** a developer changes an action's parameter type annotation, **When** the IDE re-validates, **Then** all call sites using that action are re-checked and any new type mismatches are highlighted

3. **Given** an action is called with a variable reference as an argument, **When** the type system validates, **Then** it checks the variable's type (inferred or annotated) against the parameter's expected type

---

### User Story 5 - Gradual Type Adoption (Priority: P3)

As a developer working with an existing Eligian codebase, I want to be able to add type annotations incrementally to my code so that I can improve type safety gradually without having to rewrite everything at once.

**Why this priority**: Backward compatibility is essential for adoption, but it's P3 because it's a property of the system design rather than a discrete feature users actively use. The system must support this from the start, but it doesn't require separate testing beyond ensuring untyped code continues to work.

**Independent Test**: Can be fully tested by taking an existing `.eligian` file with no type annotations, running it through validation to confirm no new errors appear, then gradually adding type annotations to specific actions and verifying that type checking works for annotated parts while leaving unannotated parts unaffected.

**Acceptance Scenarios**:

1. **Given** an existing Eligian file with no type annotations, **When** the type system is enabled, **Then** all existing code continues to validate and compile without errors

2. **Given** a developer adds type annotations to one action in a file, **When** validation runs, **Then** only that action receives type checking while other actions remain untyped and unchecked

3. **Given** a mix of typed and untyped actions in the same file, **When** a typed action calls an untyped action, **Then** the type system treats the untyped action's return/parameters as 'unknown' type and doesn't generate false errors

---

### User Story 6 - Complex Type Scenarios Support (Priority: P4)

As a developer writing advanced Eligian timelines, I want the type system to handle complex scenarios like conditional branching, loops with iterators, and nested operations so that type safety extends to all language features.

**Why this priority**: Comprehensive type checking for all language constructs is important for completeness, but it's P4 because basic scenarios (P1-P3) cover the majority of use cases. This can be incrementally added as the type system matures.

**Independent Test**: Can be fully tested by writing actions that use `if/else` blocks, `for` loops, and nested action calls, intentionally introducing type errors in each construct, and verifying that all errors are correctly detected with accurate location information.

**Acceptance Scenarios**:

1. **Given** an action uses an `if` statement with type-specific operations in both branches, **When** type checking runs, **Then** each branch is validated independently and errors are reported with the correct branch context

2. **Given** a `for` loop declares an iterator variable by iterating over an array, **When** the loop body uses the iterator, **Then** the type system infers the iterator's type from the array element type

3. **Given** an action calls another action which returns a typed value used in subsequent operations, **When** type checking runs, **Then** the entire call chain is validated end-to-end

---

### Edge Cases

- What happens when a parameter is used in contradictory ways that make type inference impossible? (The system should report a clear "conflicting type constraints" error with locations of each conflicting usage)

- How does the system handle recursive action calls where type inference might cycle? (Should detect recursion and fall back to explicit annotations with a helpful error message)

- What happens when an operation from the Eligius registry has no type information? (Should treat its parameters as 'unknown' type and allow any value without error, but log a warning for operation registry maintainers)

- How does the system handle type checking for dynamically evaluated expressions like string templates or computed property access? (Should infer string type for templates and 'unknown' for dynamic access, erring on the side of permissiveness)

- What happens when a variable is reassigned with a different type in a complex control flow? (Should track the type through the flow and report error if used inconsistently)

- How does the system handle null/undefined values in type checking? (Should treat them as compatible with any type unless strict null checking is enabled, which can be a future enhancement)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST integrate Typir and Typir-Langium libraries into the Eligian language package to provide a robust type checking foundation

- **FR-002**: System MUST preserve all existing type annotation syntax in the grammar (parameter type annotations like `param: string`)

- **FR-003**: System MUST replace the current custom type system implementation with Typir-based type checking while maintaining identical user-facing behavior

- **FR-004**: System MUST perform type inference for unannotated parameters by analyzing operation usage patterns and collecting type constraints

- **FR-005**: System MUST validate type compatibility when operations are called with arguments, checking actual argument types against expected parameter types from the operation registry

- **FR-006**: System MUST report type errors through Langium's validation system with precise source locations (line, column) and actionable error messages

- **FR-007**: System MUST support type checking within all language constructs including actions, inline actions, endable actions, if/else blocks, and for loops

- **FR-008**: System MUST maintain a type environment that tracks variable types through sequences of statements, accounting for variable declarations and assignments

- **FR-009**: System MUST treat parameters and variables without type annotations or usage constraints as 'unknown' type, opting them out of type checking

- **FR-010**: System MUST provide type information to the Langium completion provider so that autocomplete suggestions can be filtered based on the current type context

- **FR-011**: System MUST ensure 100% backward compatibility - all existing Eligian code without type annotations must continue to parse, validate, and compile without new errors

- **FR-012**: System MUST support gradual typing where typed and untyped code can coexist in the same file, with type checking applying only to explicitly typed portions

- **FR-013**: System MUST validate cross-reference type consistency when actions call other actions, checking that argument types match the called action's parameter types

- **FR-014**: System MUST handle type inference conflicts (parameter used with contradictory types) by reporting a clear error message identifying each conflicting usage location

- **FR-015**: System MUST integrate with the existing operation registry to retrieve expected parameter types for built-in Eligius operations

- **FR-016**: System MUST support all primitive types currently in the type system: string, number, boolean, object, array, and unknown

- **FR-017**: System MUST perform type checking during the validation phase of Langium's language server lifecycle, providing real-time feedback to developers

- **FR-018**: System MUST generate type error diagnostics that include the expected type, actual type, and a helpful hint suggesting how to fix the issue

- **FR-019**: System MUST maintain performance such that type checking overhead does not exceed 100ms for files up to 500 lines of Eligian code

- **FR-020**: System MUST hook into Langium's document build process so that type information is created and invalidated correctly as documents are edited and saved

### Key Entities *(include if feature involves data)*

- **Type**: Represents a type in the Eligian type system (string, number, boolean, object, array, unknown). Managed by Typir's type infrastructure with Eligian-specific customizations.

- **Type Constraint**: Represents a requirement that a parameter or variable must satisfy a specific type based on usage. Collected during inference and unified to determine final types.

- **Type Environment**: Tracks the types of all variables and parameters in scope at a given point in the code. Cloned when entering branches (if/else, loops) to handle control flow.

- **Type Error**: Represents a type validation failure with source location, expected type, actual type, and a descriptive error message. Reported through Langium diagnostics.

- **Inference Rule**: Defines how to infer the type of a specific AST node based on its context. Registered with Typir-Langium for specific node types.

- **Validation Rule**: Defines a type-related check to perform on specific AST node types. Registered with Typir-Langium and executed during the validation phase.

- **Operation Type Signature**: Metadata about an operation's expected parameter types and return type, stored in the operation registry for use during type checking.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Developers see type error diagnostics appear in the VS Code Problems panel within 500ms of making a type-related change in their code

- **SC-002**: Type checking correctly identifies 95% of type mismatches in test scenarios covering all language constructs (actions, loops, conditionals, operation calls)

- **SC-003**: Autocomplete suggestions are filtered by type context, reducing irrelevant suggestions by at least 60% in typed code sections

- **SC-004**: Type inference correctly determines types for 90% of unannotated parameters that have clear usage patterns (single consistent type across all uses)

- **SC-005**: All 298 existing tests continue to pass after Typir integration, confirming backward compatibility

- **SC-006**: Type checking adds no more than 50ms overhead to validation time for typical Eligian files (100-200 lines)

- **SC-007**: Developers can add type annotations to 20% of an existing codebase without causing any type errors in the remaining 80% of untyped code

- **SC-008**: Type error messages include specific location, expected type, actual type, and fix suggestions in 100% of cases

- **SC-009**: Cross-file action call type validation correctly identifies type mismatches at call sites when action signatures change

- **SC-010**: Type system handles files with up to 50 action definitions and 1000 lines of code without degradation in IDE responsiveness

## Assumptions

- **A-001**: The Typir and Typir-Langium libraries are actively maintained and compatible with the version of Langium used in Eligian (Langium 4.1.0)

- **A-002**: The existing operation registry in Eligian has or can easily be extended with type information for built-in operations

- **A-003**: Developers using Eligian have VS Code as their primary development environment (type checking will work in other LSP-compatible editors, but VS Code is the primary testing target)

- **A-004**: The current custom type system implementation is self-contained enough that replacing it with Typir won't require changes to the grammar or parser

- **A-005**: Performance targets assume developers are working on typical modern development machines (8GB+ RAM, multi-core CPU)

- **A-006**: The existing test suite provides adequate coverage of language features to validate backward compatibility after Typir integration

- **A-007**: Type inference will use a constraint-based approach where multiple uses of a parameter constrain its type, and conflicts are reported rather than attempting sophisticated type unification algorithms

- **A-008**: The 'unknown' type serves as an escape hatch for dynamic scenarios and gradual typing, allowing type-unsafe code to coexist with typed code

## Dependencies

- **D-001**: Requires Typir core library (`typir` npm package) to be installed and integrated into the language package

- **D-002**: Requires Typir-Langium integration library (`typir-langium` npm package) to be installed and configured

- **D-003**: Depends on the existing operation registry structure to provide type information for operations

- **D-004**: Depends on Langium's validation infrastructure (ValidationRegistry, ValidationCheck) to report type errors

- **D-005**: Depends on the existing grammar's type annotation syntax to remain stable

- **D-006**: Requires the existing test suite to validate backward compatibility

## Local Resources

- **Typir Source Code**: The Typir library source code is available locally at `../../typir` (relative to project root)
- **Typir Documentation**: Comprehensive documentation can be found in `../../typir/documentation` - this is a valuable resource for understanding Typir's architecture, APIs, and integration patterns
- **Reference Implementation**: The Typir repository includes example implementations that demonstrate type system patterns and Langium integration techniques

## Out of Scope

The following are explicitly not included in this feature and may be considered for future enhancements:

- **Advanced type features**: Union types (string | number), intersection types, generic types (Array<T>), tuple types
- **Custom type definitions**: User-defined types, type aliases, nominal types, branded types
- **Strict null checking**: Treating null/undefined as distinct types requiring explicit handling
- **Type guards**: Runtime type checking or type narrowing based on conditional checks
- **Structural typing**: Deep object shape matching beyond simple 'object' type
- **Type inference across file boundaries**: Inferring return types of actions and using them in other files
- **Hover type information**: Showing inferred types on hover (may be added as enhancement to P2)
- **Go-to-definition for types**: Navigating from type usage to type definition
- **Type-aware refactoring**: Automated refactoring operations that preserve type safety
- **Typir customization**: Advanced Typir features like custom type equality, subtyping rules, or type coercion beyond basic assignability

## Notes

- The existing type system in `packages/language/src/type-system/` serves as a reference implementation. The Typir-based system should achieve feature parity with it while providing a more robust and extensible foundation.

- Typir's integration with Langium's document lifecycle is crucial - types must be created/destroyed as documents are built/invalidated to avoid stale type information.

- The operation registry is a central integration point. If operations lack type information, the system should degrade gracefully rather than breaking.

- Error messages should be beginner-friendly. Many Eligian users may not have extensive type system experience, so errors should explain what went wrong and suggest concrete fixes.

- Type inference quality directly impacts the "gradual typing" user experience. If inference is too weak, developers will need excessive annotations. If too aggressive, it may report false positives.

- Performance is critical since type checking runs on every keystroke in the IDE. The implementation should use Typir's caching features effectively and avoid redundant computation.
