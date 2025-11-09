# Implementation Tasks: Event Actions with Declarative Syntax

**Feature**: 028-event-actions-the
**Branch**: `028-event-actions-the`
**Generated**: 2025-11-09

## Overview

This document defines the implementation tasks for adding event-triggered actions to the Eligian DSL. Tasks are organized by user story to enable independent implementation and testing.

**Total Tasks**: 53
**Parallelization Opportunities**: 18 tasks can run in parallel
**MVP Scope**: User Story 1 (Define Event-Triggered Actions)

---

## Phase 1: Setup & Infrastructure

**Goal**: Prepare project structure and shared infrastructure needed by all user stories.

### T001: [Setup] Review existing action infrastructure
**File**: `packages/language/src/eligian.langium`, `packages/compiler/src/ast-transformer.ts`
**Description**: Review existing ActionDeclaration grammar and transformation logic to understand patterns for event actions.
**Deliverable**: Documentation of existing patterns (inline comments or notes)
**Story**: Infrastructure

### T002: [Setup] Create test fixtures directory
**File**: `packages/compiler/src/__tests__/__fixtures__/event-actions/`
**Description**: Create directory structure for event action test fixtures (valid/, invalid/, snapshots/).
**Deliverable**: Empty directory structure with README explaining organization
**Story**: Infrastructure

---

## Phase 2: Foundational Tasks (Blocking Prerequisites)

**Goal**: Complete foundational work that blocks ALL user stories. These must finish before any US can start.

### T003: [Foundation] [P] Add EventActionDefinition to grammar
**File**: `packages/language/src/eligian.langium`
**Description**: Extend Langium grammar with EventActionDefinition node. Add to ProgramElement union type.
```langium
EventActionDefinition:
  'on' 'event' eventName=STRING
  ('topic' eventTopic=STRING)?
  'action' name=ID
  '(' (parameters+=ID (',' parameters+=ID)*)? ')'
  '[' operations+=OperationStatement* ']'
;
```
**Deliverable**: Grammar compiles, EventActionDefinition nodes parseable
**Story**: Foundation
**Blocks**: All user stories

### T004: [Foundation] [P] Generate Langium artifacts
**File**: Run `pnpm run langium:generate`
**Description**: Regenerate TypeScript types from updated grammar.
**Deliverable**: Generated AST types include EventActionDefinition interface
**Story**: Foundation
**Depends**: T003
**Blocks**: All user stories

### T005: [Foundation] [P] Add IEventActionConfiguration type import
**File**: `packages/compiler/src/types.ts`
**Description**: Import IEventActionConfiguration from Eligius package (`import type { IEventActionConfiguration } from 'eligius';`), re-export for compiler use. IMPORTANT: Import from the installed 'eligius' npm package, NOT from source files.
**Deliverable**: Type available in compiler package
**Story**: Foundation
**Blocks**: US1, US2, US3

---

## Phase 3: User Story 1 - Define Event-Triggered Actions (P1 - MVP)

**Goal**: Enable developers to define basic event actions with clean syntax that compiles to Eligius JSON.

**Independent Test Criteria**: Write event action definition, compile to JSON, verify `eventActions` configuration matches expected format.

### T006: [US1] Write parsing test for basic event action syntax
**File**: `packages/language/src/__tests__/event-action-parsing.spec.ts`
**Description**: Test parsing `on event "event-name" action ActionName(param) [selectElement("#id")]`.
**Test Cases**:
- Parse event action with single parameter
- Parse event action with zero parameters
- Parse event action with multiple operations
- Parse multiple event actions in one file
**Deliverable**: 4 test cases (all failing initially)
**Story**: US1

### T007: [US1] Write parsing test for parameter list variations
**File**: `packages/language/src/__tests__/event-action-parsing.spec.ts`
**Description**: Test parameter list edge cases.
**Test Cases**:
- Zero parameters: `action Name []`
- One parameter: `action Name(a) []`
- Multiple parameters: `action Name(a, b, c) []`
- Trailing comma (should fail): `action Name(a, b,) []`
**Deliverable**: 4 test cases
**Story**: US1

### T008: [US1] Verify grammar parses basic event actions
**File**: `packages/language/src/eligian.langium`
**Description**: Ensure T003 grammar correctly parses test cases from T006-T007.
**Deliverable**: All T006-T007 tests pass
**Story**: US1
**Depends**: T003, T004, T006, T007

### T009: [US1] [P] Write transformation test for basic event action
**File**: `packages/compiler/src/__tests__/event-action-transformer.spec.ts`
**Description**: Test transforming EventActionDefinition AST → IEventActionConfiguration JSON.
**Test Cases**:
- Event action with name generates correct `name` field
- Event action generates valid UUID v4 `id`
- Event name string literal → `eventName` field
- Operations array → `startOperations` array
- No `endOperations` in output (event actions don't have end operations)
**Deliverable**: 5 test cases (all failing initially)
**Story**: US1

### T010: [US1] [P] Implement transformEventAction function
**File**: `packages/compiler/src/ast-transformer.ts`
**Description**: Add `transformEventAction(node: EventActionDefinition): IEventActionConfiguration` function.
**Implementation**:
```typescript
function transformEventAction(node: EventActionDefinition): IEventActionConfiguration {
  return {
    id: crypto.randomUUID(), // UUID v4 per Constitution Principle VII
    name: node.name,
    eventName: node.eventName,
    eventTopic: node.eventTopic, // undefined if not present
    startOperations: node.operations.map(op => transformOperation(op, {}))
  };
}
```
**Deliverable**: Function exists, T009 tests pass
**Story**: US1
**Depends**: T009

### T011: [US1] Integrate event action transformation into main pipeline
**File**: `packages/compiler/src/ast-transformer.ts`
**Description**: Modify `transformProgram` to detect EventActionDefinition nodes and call `transformEventAction`.
**Implementation**: Add to program traversal, accumulate into `config.eventActions[]` array.
**Deliverable**: Event actions appear in compiled JSON
**Story**: US1
**Depends**: T010

### T012: [US1] [P] Write integration test for end-to-end compilation
**File**: `packages/compiler/src/__tests__/event-action-integration.spec.ts`
**Description**: Test full DSL → JSON compilation pipeline.
**Test Cases**:
- Compile DSL file with single event action → verify JSON structure
- Compile DSL file with multiple event actions → verify array order preserved (FR-014)
- Compile DSL file with zero-parameter event action → verify no parameters in ops
- Compile DSL file with event action calling another action → verify `requestAction` in operations (FR-011)
- Compile DSL file with 1 regular action + 1 event action → verify both appear in JSON (FR-015)
**Fixtures**:
- `valid/simple-event-action.eligian`
- `valid/multiple-event-actions.eligian`
- `valid/zero-param-event-action.eligian`
- `valid/event-action-calls-action.eligian`
- `valid/mixed-actions.eligian`
**Deliverable**: 5 integration tests with fixtures
**Story**: US1

### T013: [US1] Create test fixture: simple event action
**File**: `packages/compiler/src/__tests__/__fixtures__/event-actions/valid/simple-event-action.eligian`
**Description**: Create example DSL file with basic event action.
```eligian
on event "language-change" action HandleLanguageChange(languageCode) [
  selectElement(".lang-display")
  setTextContent(languageCode)
]
```
**Deliverable**: Valid DSL file for testing
**Story**: US1

### T014: [US1] Verify integration tests pass
**File**: Run `pnpm test event-action-integration.spec.ts`
**Description**: Ensure T012 integration tests pass with T011 implementation.
**Deliverable**: All integration tests green
**Story**: US1
**Depends**: T011, T012, T013

### T015: [US1] Run Biome check and fix issues
**File**: All modified files
**Description**: Run `pnpm run check` to format/lint, fix any issues.
**Deliverable**: Biome passes with 0 errors
**Story**: US1
**Depends**: T014

**✓ Checkpoint**: US1 Complete - Basic event actions compile to valid Eligius JSON

---

## Phase 4: User Story 2 - Access Event Arguments with Named Parameters (P2)

**Goal**: Enable parameter names in DSL that map to `$operationData.eventArgs[n]` in compiled JSON.

**Independent Test Criteria**: Define event action with multiple parameters, verify they map to correct eventArgs indices in JSON.

### T016: [US2] Write test for parameter context creation
**File**: `packages/compiler/src/__tests__/event-action-transformer.spec.ts`
**Description**: Test building parameter index map from EventActionDefinition.
**Test Cases**:
- Zero parameters → empty Map
- One parameter → Map{ "param": 0 }
- Three parameters → Map{ "a": 0, "b": 1, "c": 2 }
**Deliverable**: 3 test cases for parameter context
**Story**: US2

### T017: [US2] Implement createParameterContext function
**File**: `packages/compiler/src/ast-transformer.ts`
**Description**: Add helper function to build parameter index map.
```typescript
interface EventActionContext {
  parameters: Map<string, number>;
}

function createParameterContext(params: string[]): EventActionContext {
  const parameters = new Map<string, number>();
  params.forEach((name, index) => {
    parameters.set(name, index);
  });
  return { parameters };
}
```
**Deliverable**: Function exists, T016 tests pass
**Story**: US2
**Depends**: T016

### T018: [US2] Write test for parameter reference resolution
**File**: `packages/compiler/src/__tests__/event-action-transformer.spec.ts`
**Description**: Test resolving parameter names → `$operationData.eventArgs[n]`.
**Test Cases**:
- Reference to first param → `$operationData.eventArgs[0]`
- Reference to second param → `$operationData.eventArgs[1]`
- Reference to third param → `$operationData.eventArgs[2]`
- Reference to non-parameter (constant) → unchanged
**Deliverable**: 4 test cases for resolution
**Story**: US2

### T019: [US2] Modify transformOperation to accept context parameter
**File**: `packages/compiler/src/ast-transformer.ts`
**Description**: Update `transformOperation` signature to accept optional EventActionContext.
**Implementation**:
```typescript
function transformOperation(
  op: OperationStatement,
  context: EventActionContext
): IOperationConfiguration {
  // Existing logic + parameter resolution
}
```
**Deliverable**: Signature updated, existing tests still pass
**Story**: US2
**Depends**: T018

### T020: [US2] Implement parameter reference resolution logic
**File**: `packages/compiler/src/ast-transformer.ts`
**Description**: In `transformOperation`, detect references to event action parameters and map to eventArgs indices.
**Implementation**: Check if identifier exists in `context.parameters`, if yes → replace with `$operationData.eventArgs[${index}]`.
**Deliverable**: T018 tests pass
**Story**: US2
**Depends**: T019

### T021: [US2] Update transformEventAction to pass parameter context
**File**: `packages/compiler/src/ast-transformer.ts`
**Description**: Modify `transformEventAction` to create context and pass to `transformOperation`.
**Implementation**:
```typescript
function transformEventAction(node: EventActionDefinition): IEventActionConfiguration {
  const context = createParameterContext(node.parameters.map(p => p.name));
  return {
    // ...
    startOperations: node.operations.map(op => transformOperation(op, context))
  };
}
```
**Deliverable**: Parameters correctly mapped in operations
**Story**: US2
**Depends**: T017, T020

### T022: [US2] [P] Write integration test for multi-parameter event action
**File**: `packages/compiler/src/__tests__/event-action-integration.spec.ts`
**Description**: Test DSL with multiple parameters compiles correctly.
**Test Case**: Event action with 3 parameters → verify each maps to correct eventArgs index in JSON.
**Fixture**: `valid/multi-param-event-action.eligian`
**Deliverable**: 1 integration test with fixture
**Story**: US2

### T023: [US2] Create test fixture: multi-parameter event action
**File**: `packages/compiler/src/__tests__/__fixtures__/event-actions/valid/multi-param-event-action.eligian`
**Description**: Create DSL file with multiple parameters.
```eligian
on event "user-interaction" action Track(element, timestamp, userId) [
  logEvent(element, timestamp, userId)
]
```
**Deliverable**: Valid DSL file
**Story**: US2

### T024: [US2] Verify parameter mapping integration tests pass
**File**: Run `pnpm test event-action-integration.spec.ts`
**Description**: Ensure T022 tests pass with T021 implementation.
**Deliverable**: All parameter mapping tests green
**Story**: US2
**Depends**: T021, T022, T023

### T025: [US2] Run Biome check and fix issues
**File**: All modified files
**Description**: Run `pnpm run check` to format/lint.
**Deliverable**: Biome passes
**Story**: US2
**Depends**: T024

**✓ Checkpoint**: US2 Complete - Parameters map to eventArgs indices correctly

---

## Phase 5: User Story 4 - Validate Event Action Definitions (P2)

**Goal**: Implement compile-time validation to catch common errors (duplicate handlers, reserved keywords, empty bodies).

**Independent Test Criteria**: Write invalid event action definitions, verify compiler produces appropriate error messages with source locations.

**Note**: US4 before US3 because validation applies to all event actions (topics or not).

### T026: [US4] [P] Write validation test for event name must be string literal
**File**: `packages/language/src/__tests__/event-action-validation.spec.ts`
**Description**: Test validation rejects variable/expression as event name and enforces length limit.
**Test Cases**:
- `on event myVar action ...` → Error (not string literal)
- `on event "literal" action ...` → Valid
- `on event "<101-char-string>" action ...` → Error (exceeds 100 character limit - FR-006)
**Deliverable**: 3 test cases
**Story**: US4

### T027: [US4] [P] Write validation test for empty action body
**File**: `packages/language/src/__tests__/event-action-validation.spec.ts`
**Description**: Test validation rejects event actions with no operations.
**Test Case**: `on event "test" action Empty []` → Error
**Deliverable**: 1 test case
**Story**: US4

### T028: [US4] [P] Write validation test for reserved keyword parameters
**File**: `packages/language/src/__tests__/event-action-validation.spec.ts`
**Description**: Test validation rejects reserved keywords as parameter names.
**Test Cases**:
- `action Foo(if) [...]` → Error
- `action Foo(for) [...]` → Error
- `action Foo(break) [...]` → Error
- `action Foo(validName) [...]` → Valid
**Deliverable**: 4 test cases
**Story**: US4

### T029: [US4] [P] Write validation test for duplicate parameter names
**File**: `packages/language/src/__tests__/event-action-validation.spec.ts`
**Description**: Test validation rejects duplicate parameters.
**Test Case**: `action Foo(a, a) [...]` → Error
**Deliverable**: 1 test case
**Story**: US4

### T030: [US4] [P] Write validation test for duplicate event/topic combinations
**File**: `packages/language/src/__tests__/event-action-validation.spec.ts`
**Description**: Test validation warns about multiple handlers for same event.
**Test Cases**:
- Two event actions with same eventName → Warning
- Two event actions with same eventName + eventTopic → Warning
- Different eventNames → No warning
**Deliverable**: 3 test cases
**Story**: US4

### T031: [US4] Implement checkEventActionDefinition validator
**File**: `packages/language/src/eligian-validator.ts`
**Description**: Add validation method for EventActionDefinition.
**Validations**:
- Event name must be string literal (not variable) and ≤100 characters (FR-006)
- Event topic (if present) must be string literal and ≤100 characters (FR-006)
- Action name must match pattern `/^[a-zA-Z_][a-zA-Z0-9_]*$/` (FR-007)
- At least one operation required (FR-009)
**Deliverable**: Validator method, T026-T027 tests pass
**Story**: US4
**Depends**: T026, T027

### T032: [US4] Implement checkEventActionParameters validator
**File**: `packages/language/src/eligian-validator.ts`
**Description**: Add validation for parameter list.
**Validations**:
- Parameter names must not be reserved keywords (if, for, break, continue, etc.)
- No duplicate parameter names within same event action
**Deliverable**: Validator method, T028-T029 tests pass
**Story**: US4
**Depends**: T028, T029

### T033: [US4] Implement checkDuplicateEventActions validator
**File**: `packages/language/src/eligian-validator.ts`
**Description**: Add validation to warn about duplicate (eventName, eventTopic) combinations.
**Implementation**: Track all event actions in program, warn if duplicates found.
**Deliverable**: Validator method, T030 tests pass
**Story**: US4
**Depends**: T030

### T034: [US4] Verify all validation tests pass
**File**: Run `pnpm test event-action-validation.spec.ts`
**Description**: Ensure all validation tests (T026-T030) pass.
**Deliverable**: All validation tests green
**Story**: US4
**Depends**: T031, T032, T033

### T035: [US4] Run Biome check and fix issues
**File**: All modified files
**Description**: Run `pnpm run check` to format/lint.
**Deliverable**: Biome passes
**Story**: US4
**Depends**: T034

**✓ Checkpoint**: US4 Complete - Validation catches common errors at compile time

---

## Phase 6: User Story 3 - Support Event Topics for Namespacing (P3)

**Goal**: Enable optional `topic` clause for event namespacing (same event name, different contexts).

**Independent Test Criteria**: Define event action with topic, verify JSON includes both `eventName` and `eventTopic` fields.

### T036: [US3] Write parsing test for topic clause
**File**: `packages/language/src/__tests__/event-action-parsing.spec.ts`
**Description**: Test parsing event actions with optional topic.
**Test Cases**:
- `on event "click" topic "nav" action ...` → Parses with topic
- `on event "click" action ...` → Parses without topic
- `on event "click" topic "" action ...` → Should fail validation (empty topic)
**Deliverable**: 3 test cases
**Story**: US3

### T037: [US3] Verify grammar parses topic clause
**File**: `packages/language/src/eligian.langium`
**Description**: Ensure T003 grammar correctly handles optional topic clause.
**Deliverable**: T036 tests pass (grammar already supports this from T003)
**Story**: US3
**Depends**: T003, T036

### T038: [US3] [P] Write transformation test for event topic
**File**: `packages/compiler/src/__tests__/event-action-transformer.spec.ts`
**Description**: Test transforming event actions with topics.
**Test Cases**:
- Event action with topic → `eventTopic` field in JSON
- Event action without topic → `eventTopic` is undefined in JSON
**Deliverable**: 2 test cases
**Story**: US3

### T039: [US3] Verify transformEventAction handles topics
**File**: `packages/compiler/src/ast-transformer.ts`
**Description**: Ensure T010 implementation correctly maps `eventTopic` field (should already work).
**Deliverable**: T038 tests pass
**Story**: US3
**Depends**: T010, T038

### T040: [US3] [P] Write integration test for event actions with topics
**File**: `packages/compiler/src/__tests__/event-action-integration.spec.ts`
**Description**: Test DSL with topics compiles correctly.
**Test Cases**:
- Two event actions with same eventName but different topics → Both in JSON
- Event action with topic → Correct `eventName` and `eventTopic` in JSON
**Fixtures**:
- `valid/event-action-with-topics.eligian`
**Deliverable**: 2 integration tests with fixture
**Story**: US3

### T041: [US3] Create test fixture: event actions with topics
**File**: `packages/compiler/src/__tests__/__fixtures__/event-actions/valid/event-action-with-topics.eligian`
**Description**: Create DSL file demonstrating topic namespacing.
```eligian
on event "click" topic "navigation" action HandleNavClick(target) [
  selectElement(target)
  addClass("active")
]

on event "click" topic "form" action HandleFormClick(formId) [
  selectElement(formId)
  submitForm()
]
```
**Deliverable**: Valid DSL file
**Story**: US3

### T042: [US3] Add validation for empty topic strings
**File**: `packages/language/src/eligian-validator.ts`
**Description**: Extend T031 validator to reject empty string topics.
**Validation**: If `eventTopic` is present, it must be non-empty string literal.
**Deliverable**: Empty topic validation, integration tests pass
**Story**: US3
**Depends**: T031, T040, T041

### T043: [US3] Run Biome check and fix issues
**File**: All modified files
**Description**: Run `pnpm run check` to format/lint.
**Deliverable**: Biome passes
**Story**: US3
**Depends**: T042

**✓ Checkpoint**: US3 Complete - Event topics enable context-specific event handling

---

## Phase 7: User Story 5 - IDE Support for Event Actions (P3)

**Goal**: Provide syntax highlighting, autocomplete, and hover documentation for event actions in VS Code.

**Independent Test Criteria**: Open `.eligian` file with event actions, verify syntax highlighting, autocomplete suggestions, and hover tooltips work correctly.

**Note**: US5 is P3 (lowest priority) because IDE features are enhancements, not core functionality.

### T044: [US5] [P] Implement autocomplete for event names
**File**: `packages/language/src/eligian-completion-provider.ts`
**Description**: Add autocomplete trigger for `on event "` to suggest known Eligius event names.
**Suggestions**:
- `"timeline-play"`
- `"timeline-pause"`
- `"timeline-complete"`
- `"language-change"`
**Deliverable**: Autocomplete works when typing `on event "`
**Story**: US5

### T045: [US5] [P] Implement hover provider for event action definitions
**File**: `packages/language/src/eligian-hover-provider.ts`
**Description**: Add hover tooltip for EventActionDefinition showing parameters and their indices.
**Tooltip Content**:
```
Event Action: HandleLanguageChange
Parameters:
  - languageCode (index 0)
```
**Deliverable**: Hover tooltip appears over event action definition
**Story**: US5

### T046: [US5] [P] Write integration test for IDE autocomplete
**File**: `packages/language/src/__tests__/event-action-completion.spec.ts`
**Description**: Test autocomplete suggestions.
**Test Cases**:
- Trigger autocomplete at `on event "|` → Returns event name suggestions
- Trigger autocomplete at `action ` → Returns action naming guidance
**Deliverable**: 2 integration tests
**Story**: US5

### T047: [US5] Verify IDE integration tests pass
**File**: Run `pnpm test event-action-completion.spec.ts`
**Description**: Ensure T046 tests pass with T044-T045 implementation.
**Deliverable**: IDE integration tests green
**Story**: US5
**Depends**: T044, T045, T046

### T048: [US5] Run Biome check and fix issues
**File**: All modified files
**Description**: Run `pnpm run check` to format/lint.
**Deliverable**: Biome passes
**Story**: US5
**Depends**: T047

**✓ Checkpoint**: US5 Complete - IDE support improves developer experience

---

## Phase 8: Polish & Cross-Cutting Concerns

**Goal**: Complete documentation, final testing, and prepare for PR.

### T049: [Polish] Update LANGUAGE_SPEC.md with event action syntax
**File**: `LANGUAGE_SPEC.md`
**Description**: Add section documenting event action syntax, parameter mapping, and compilation behavior.
**Content**:
- Grammar rules for EventActionDefinition
- Parameter scoping explanation
- Event topic namespacing behavior
- Compilation examples (DSL → JSON)
**Deliverable**: LANGUAGE_SPEC.md updated per Constitution Principle XVII
**Story**: Documentation

### T050: [Polish] [P] Run full test suite and verify coverage
**File**: Run `pnpm test` and `pnpm test:coverage`
**Description**: Run all tests, verify 80%+ coverage for event action code.
**Deliverable**: All tests pass, coverage meets threshold
**Story**: Testing

### T051: [Polish] [P] Run TypeScript type check
**File**: Run `pnpm run typecheck`
**Description**: Verify no type errors in event action implementation.
**Deliverable**: TypeScript compiles without errors
**Story**: Quality

### T052: [Polish] Create example file demonstrating event actions
**File**: `examples/event-actions-demo.eligian`
**Description**: Create comprehensive example showcasing all event action features.
**Content**:
- Basic event action
- Multi-parameter event action
- Event action with topic
- Zero-parameter event action
**Deliverable**: Runnable example file
**Story**: Documentation

### T053: [Polish] Final Biome check across all files
**File**: Run `pnpm run check` on entire codebase
**Description**: Ensure all code quality checks pass.
**Deliverable**: Biome passes with 0 errors/warnings
**Story**: Quality
**Depends**: T050, T051

**✓ Checkpoint**: All tasks complete - Feature ready for code review

---

## Task Dependencies

### Dependency Graph

```
Phase 1 (Setup):
  T001 → T002

Phase 2 (Foundation - BLOCKS ALL USER STORIES):
  T003 → T004 → T005

Phase 3 (US1 - MVP):
  T006, T007 → T008 (depends T003, T004)
  T009 [P] → T010 → T011
  T012 [P], T013 [P] → T014 (depends T011)
  T014 → T015

Phase 4 (US2):
  T016 → T017
  T018 → T019 → T020
  T017, T020 → T021
  T022 [P], T023 [P] → T024 (depends T021)
  T024 → T025

Phase 5 (US4):
  T026 [P], T027 [P], T028 [P], T029 [P], T030 [P] (all parallel)
  T026, T027 → T031
  T028, T029 → T032
  T030 → T033
  T031, T032, T033 → T034 → T035

Phase 6 (US3):
  T036 → T037 (depends T003)
  T038 [P] → T039 (depends T010)
  T040 [P], T041 [P] → T042 (depends T031, T040, T041)
  T042 → T043

Phase 7 (US5):
  T044 [P], T045 [P], T046 [P] (all parallel)
  T044, T045, T046 → T047 → T048

Phase 8 (Polish):
  T049 [P], T050 [P], T051 [P], T052 [P] (all parallel)
  T050, T051 → T053
```

### Critical Path

The critical path (longest dependency chain) is:
```
T003 → T004 → T006 → T008 → T009 → T010 → T011 → T012 → T014 → T015
→ T016 → T017 → T019 → T020 → T021 → T024 → T025
→ T026 → T031 → T034 → T035
→ T036 → T037 → T042 → T043
→ T047 → T048
→ T050 → T053
```

**Estimated Critical Path**: 35 sequential tasks (with parallelizable tasks off critical path)

---

## Parallel Execution Opportunities

### Phase 3 (US1) Parallelization

```bash
# After T008 completes:
parallel \
  "# T009: Write transformation test" \
  "# T012: Write integration test" \
  "# T013: Create test fixture"

# Then T010, T011, T014 run sequentially
```

### Phase 4 (US2) Parallelization

```bash
# After T021 completes:
parallel \
  "# T022: Write integration test" \
  "# T023: Create test fixture"

# Then T024 runs
```

### Phase 5 (US4) Parallelization

```bash
# All validation tests run in parallel:
parallel \
  "# T026: Test string literal validation" \
  "# T027: Test empty body validation" \
  "# T028: Test reserved keyword validation" \
  "# T029: Test duplicate parameter validation" \
  "# T030: Test duplicate handler validation"

# Then T031-T033 run (could be parallel if different functions)
```

### Phase 7 (US5) Parallelization

```bash
# All IDE integration tasks run in parallel:
parallel \
  "# T044: Implement autocomplete" \
  "# T045: Implement hover provider" \
  "# T046: Write integration tests"

# Then T047 runs
```

### Phase 8 (Polish) Parallelization

```bash
# All polish tasks run in parallel:
parallel \
  "# T049: Update LANGUAGE_SPEC.md" \
  "# T050: Run test suite" \
  "# T051: Run typecheck" \
  "# T052: Create example file"

# Then T053 runs
```

---

## Implementation Strategy

### MVP Scope (Recommended First PR)

**Target**: User Story 1 only (T001-T015)

**Rationale**:
- Delivers core value (define event actions, compile to JSON)
- Minimal scope reduces review burden
- Establishes foundation for subsequent stories
- Independently testable and shippable

**Estimated Effort**: 8-12 hours

### Incremental Delivery Plan

**PR #1 (MVP)**: User Story 1
- Tasks: T001-T015
- Deliverable: Basic event actions work end-to-end
- Value: Developers can define and compile event actions

**PR #2**: User Story 2 + User Story 4
- Tasks: T016-T025, T026-T035
- Deliverable: Parameter mapping + validation
- Value: Event actions become practical (parameter access) and safe (validation)
- Rationale: Combine US2 and US4 because validation applies to parameters

**PR #3**: User Story 3
- Tasks: T036-T043
- Deliverable: Event topic namespacing
- Value: Advanced users can organize complex event-driven interactions

**PR #4**: User Story 5 + Polish
- Tasks: T044-T053
- Deliverable: IDE support + documentation
- Value: Complete developer experience with autocompletion and examples

### Test-First Development Workflow

Per Constitution Principle II, all implementation MUST follow Red-Green-Refactor:

1. **RED**: Write failing test (e.g., T006)
2. **GREEN**: Implement minimal code to pass (e.g., T008)
3. **REFACTOR**: Improve code quality while keeping tests green
4. **VERIFY**: Run Biome and coverage checks

**Example for T009-T010**:
```bash
# 1. RED: Write failing test
pnpm test event-action-transformer.spec.ts  # Fails (no transformEventAction yet)

# 2. GREEN: Implement function
# Edit ast-transformer.ts, add transformEventAction

pnpm test event-action-transformer.spec.ts  # Passes

# 3. REFACTOR: Clean up code
pnpm run check  # Format and lint

# 4. VERIFY: Coverage
pnpm test:coverage  # Check 80%+ threshold
```

---

## Success Criteria

### Per-Story Completion Criteria

**US1 Complete**:
- [ ] EventActionDefinition grammar parses successfully
- [ ] Basic event actions compile to IEventActionConfiguration JSON
- [ ] Integration tests verify DSL → JSON correctness
- [ ] All US1 tests pass (T006-T014)
- [ ] Biome check passes

**US2 Complete**:
- [ ] Parameters map to `$operationData.eventArgs[n]` by index
- [ ] Multi-parameter event actions compile correctly
- [ ] Parameter context creation and resolution work
- [ ] All US2 tests pass (T016-T024)
- [ ] Biome check passes

**US4 Complete**:
- [ ] Validation rejects invalid event names, empty bodies, reserved keywords
- [ ] Validation warns about duplicate event/topic combinations
- [ ] All validation tests pass (T026-T034)
- [ ] Biome check passes

**US3 Complete**:
- [ ] Optional topic clause parses correctly
- [ ] Event topics appear in compiled JSON
- [ ] Empty topics rejected by validation
- [ ] All US3 tests pass (T036-T042)
- [ ] Biome check passes

**US5 Complete**:
- [ ] Autocomplete suggests event names
- [ ] Hover tooltips show event action details
- [ ] All IDE integration tests pass (T044-T047)
- [ ] Biome check passes

### Overall Feature Completion

- [ ] All 53 tasks completed
- [ ] Test coverage ≥ 80% for event action code
- [ ] TypeScript compiles without errors
- [ ] Biome passes with 0 errors/warnings
- [ ] LANGUAGE_SPEC.md updated with event action syntax
- [ ] Example file demonstrates all features
- [ ] All user story acceptance scenarios pass

---

## Notes

- **Constitution Compliance**: All tasks follow Constitution Principles (test-first, Biome checks, UUID v4, documentation)
- **Parallelization**: 18 tasks marked [P] can run concurrently (save ~40% time)
- **MVP Focus**: Recommend shipping US1 first (T001-T015) for rapid feedback
- **Test Coverage**: Constitution requires 80%+ coverage - verify with `pnpm test:coverage` after each user story
- **ESM Imports**: All relative imports must use `.js` extensions per Constitution Principle IX

---

**Ready to implement**: Start with Phase 1 (Setup), then proceed sequentially through user stories.
