# Feature Specification: Constant Folding Optimization

**Feature Branch**: `005-const-folding-compiler`
**Created**: 2025-01-23
**Status**: Draft
**Input**: User description: "const folding. it is required to have the compiler support constant folding. Also, currently when a global constant is added to the .eligian file, the compiler generates an init action where the constant value is added to the globalData and any reference to it in actions and operations is generated as $globalData.<constant-name>. This is really unnecessary, since we're dealing with a true constant, so what should actually happen is globaldata assignment in the init action can be skipped completely and any reference to the constant should simply be replaced with its value."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Constant Values Inlined in Generated JSON (Priority: P1)

As a developer writing Eligian DSL code, when I declare a global constant and reference it in actions, the compiler should inline the constant's value directly into the generated JSON instead of generating globalData assignments and references. This reduces the size of the generated configuration and eliminates unnecessary runtime overhead.

**Why this priority**: This is the core functionality - constant folding directly impacts the quality and efficiency of generated code. Without this, constants are unnecessarily stored in globalData and dereferenced at runtime.

**Independent Test**: Can be fully tested by compiling an Eligian file with a global constant declaration (e.g., `const foo = "bar";`) and verifying that the generated JSON contains the literal value `"bar"` wherever `foo` is referenced, with no init action or globalData assignment present.

**Acceptance Scenarios**:

1. **Given** an Eligian file with `const MESSAGE = "hello";` and an action that references `MESSAGE`, **When** the compiler processes the file, **Then** the generated JSON should contain the literal string `"hello"` at every reference point, with no globalData assignment
2. **Given** an Eligian file with `const DELAY = 1000;` used in multiple actions, **When** the compiler generates JSON, **Then** each reference should be replaced with the numeric literal `1000`
3. **Given** an Eligian file with `const FLAG = true;` used in conditional logic, **When** the compiler processes it, **Then** the boolean literal `true` should appear in the generated JSON

---

### User Story 2 - No Init Action for Constants (Priority: P2)

As a developer, when I declare only global constants (no variables), the compiler should not generate an init action at all, since there's nothing to initialize at runtime.

**Why this priority**: Eliminating unnecessary init actions reduces generated JSON size and avoids confusion about what code runs at initialization time.

**Independent Test**: Can be tested by compiling an Eligian file containing only constant declarations (no variables) and verifying that no init action appears in the generated JSON.

**Acceptance Scenarios**:

1. **Given** an Eligian file with only `const` declarations and no `let` variables, **When** the compiler generates JSON, **Then** no init action should be present in the output
2. **Given** an Eligian file with mixed `const` and `let` declarations, **When** the compiler generates JSON, **Then** the init action should only contain assignments for `let` variables, not `const` declarations

---

### User Story 3 - Compile-Time Constant Expressions (Priority: P3)

As a developer, when I declare a constant with a simple expression (e.g., `const TOTAL = 5 + 3;`), the compiler should evaluate the expression at compile time and inline the result (`8`) rather than generating runtime computation.

**Why this priority**: Extends constant folding to include compile-time evaluation of expressions, providing additional optimization opportunities. This is a natural extension of P1/P2 but requires expression evaluation logic.

**Independent Test**: Can be tested by declaring constants with arithmetic, string concatenation, or logical expressions and verifying that the generated JSON contains the computed result, not the expression.

**Acceptance Scenarios**:

1. **Given** `const SUM = 10 + 20;`, **When** compiled, **Then** references should contain `30` (not an expression)
2. **Given** `const NAME = "Hello" + " World";`, **When** compiled, **Then** references should contain `"Hello World"`
3. **Given** `const ENABLED = true && false;`, **When** compiled, **Then** references should contain `false`

---

### Edge Cases

- What happens when a constant references another constant (e.g., `const A = 5; const B = A + 3;`)? Should the compiler resolve transitive dependencies?
- How does the compiler handle constants declared but never used? Should they be ignored entirely?
- What happens if a constant value is a complex object or array literal? Should these also be inlined, or is there a size threshold?
- What about constants that reference imported values or external configuration? Are these in scope for folding?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Compiler MUST detect all `const` declarations in the global scope of Eligian source files
- **FR-002**: Compiler MUST replace every reference to a global constant with its literal value in the generated JSON
- **FR-003**: Compiler MUST NOT generate globalData assignments for `const` declarations in the init action
- **FR-004**: Compiler MUST preserve the original constant value's type (string, number, boolean) when inlining
- **FR-005**: Compiler MUST eliminate the init action entirely if the source contains only `const` declarations and no `let` variables
- **FR-006**: Compiler MUST evaluate simple constant expressions at compile time (arithmetic, string concatenation, logical operations)
- **FR-007**: Compiler MUST maintain correct behavior for mixed `const` and `let` declarations (only variables should appear in globalData)
- **FR-008**: Compiler MUST produce identical runtime behavior before and after constant folding optimization

### Key Entities

- **Constant Declaration**: A global `const` binding in the Eligian source with an immutable value
- **Constant Reference**: Any usage of a constant's name in actions, operations, or expressions
- **Init Action**: The special generated action that initializes globalData (should be eliminated or reduced when constants are folded)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Generated JSON size is reduced by at least 20% for typical Eligian files that use multiple constants (measured by comparing JSON file size before and after optimization)
- **SC-002**: 100% of constant references in test files are successfully inlined (no `$globalData.<const-name>` patterns remain for constants)
- **SC-003**: Compilation time does not increase by more than 10% when constant folding is enabled
- **SC-004**: All existing Eligian test files compile successfully with identical runtime behavior after enabling constant folding
- **SC-005**: Developer can verify that no init action is generated for files containing only constants by inspecting the JSON output

## Dependencies & Constraints *(optional)*

### Dependencies

- Requires existing compiler AST traversal and transformation logic
- Depends on the current global variable system (`const` vs `let` declarations)
- May interact with existing optimizer passes (should be run early in the pipeline)

### Constraints

- Must maintain backward compatibility with existing Eligian code (optimization should be transparent)
- Should not break existing tests or generated JSON structure
- Must handle all primitive types (string, number, boolean) and simple expressions

## Assumptions *(optional)*

- Constants are immutable by definition - their values cannot change after declaration
- Constant values are known at compile time (no dynamic/runtime dependencies)
- The current compiler already has AST representation for constant declarations and references
- Simple expressions (arithmetic, string concat, logical ops) can be safely evaluated at compile time
- Developers expect the same runtime behavior after optimization (invisible optimization)

## Out of Scope *(optional)*

- Constant folding for non-primitive types (objects, arrays) - initial implementation will focus on primitives
- Cross-file constant resolution (imports from other `.eligian` files)
- User-configurable optimization levels (constant folding will be always-on)
- Constant propagation across function boundaries (only global scope for MVP)
- Dead code elimination (removing unused constants) - may be a separate optimization pass

## Open Questions *(optional)*

- Should the compiler issue warnings for unused constants, or silently ignore them?
- What is the maximum expression complexity we should evaluate at compile time? (prevent accidental infinite loops or excessive compile times)
- Should constant folding be controllable via a compiler flag, or always enabled?
