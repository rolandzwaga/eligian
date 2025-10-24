# Tasks: Unified Custom Action and Operation Call Syntax

**Feature**: 006-currently-a-custom
**Input**: Design documents from `/specs/006-currently-a-custom/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: TDD approach - Tests are written FIRST before implementation (constitution Principle II)

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions
- Existing monorepo structure: `packages/language/src/`, `packages/language/src/compiler/`, `packages/extension/`
- Tests: `packages/language/src/__tests__/`, `packages/language/src/compiler/__tests__/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and verification

- [ ] T001 Verify existing project structure matches plan.md expectations
- [ ] T002 Run `npm run test` to establish baseline (all existing tests passing)
- [ ] T003 [P] Run `npm run check && npm run typecheck` to verify code quality baseline

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T004 Read and understand current grammar structure in `packages/language/src/eligian.langium` (lines 246-311 for TimelineEvent, NamedActionInvocation)
- [ ] T005 [P] Read current operation registry API in `packages/language/src/compiler/operations/index.ts` (`hasOperation`, `getOperationSignature`)
- [ ] T006 [P] Read current validator structure in `packages/language/src/eligian-validator.ts` to understand validation patterns
- [ ] T007 Read current transformer structure in `packages/language/src/compiler/ast-transformer.ts` (lines 936-1013 for action transformation)
- [ ] T008 Document current NamedActionInvocation → requestAction/startAction transformation flow (create research note)

**Checkpoint**: Foundation understood - user story implementation can now begin

---

## Phase 3: User Story 1 - Mix Custom Actions and Operations in Timeline Events (Priority: P1) 🎯 MVP

**Goal**: Unify syntax so custom actions can be called directly in timeline events without curly braces

**Independent Test**: Define `action fadeIn(selector, duration) [...]` and call `at 0s..5s fadeIn("#box", 1000)` in timeline. Compiles successfully and generates correct Eligius JSON.

### Tests for User Story 1 (TDD - Write FIRST, Ensure FAIL)

- [ ] T009 [P] [US1] Add parsing test in `packages/language/src/__tests__/parsing.spec.ts`: Parse timeline with `at 0s..5s fadeIn(".box", 1000)` (no braces)
- [ ] T010 [P] [US1] Add parsing test: Parse timeline with inline action block `at 0s..5s [ fadeIn() selectElement() ]` (mixed calls)
- [ ] T011 [P] [US1] Add validation test in `packages/language/src/__tests__/validation.spec.ts`: Validate action call resolves to defined action
- [ ] T012 [P] [US1] Add transformer test in `packages/language/src/compiler/__tests__/transformer.spec.ts`: Transform action call to requestAction + startAction operations
- [ ] T013 [P] [US1] Add transformer test: Transform mixed action + operation calls in correct order
- [ ] T014 [P] [US1] Add integration test in `packages/language/src/__tests__/integration/`: End-to-end compile DSL with unified syntax → Verify JSON output

**Verify**: All 6 tests FAIL before proceeding to implementation

### Implementation for User Story 1

**Grammar Changes**:
- [ ] T015 [US1] Update `TimelineAction` production in `packages/language/src/eligian.langium` to accept `OperationCall` instead of `NamedActionInvocation`
- [ ] T016 [US1] Comment out (don't delete yet) `NamedActionInvocation` and `ActionCallExpression` productions for backward compatibility testing
- [ ] T017 [US1] Run `npm run langium:generate` to regenerate AST types from grammar

**Name Resolution**:
- [ ] T018 [P] [US1] Create helper function `findActionByName(name: string, program: Program): ActionDefinition | undefined` in `packages/language/src/compiler/ast-transformer.ts`
- [ ] T019 [P] [US1] Create `resolveCallName(callName: string, registry: NameRegistry): CallResolutionResult` in new file `packages/language/src/compiler/name-resolver.ts`

**Validation**:
- [ ] T020 [US1] Add `checkTimelineOperationCall(call: OperationCall, accept: ValidationAcceptor)` method to `packages/language/src/eligian-validator.ts`
- [ ] T021 [US1] Implement action name resolution logic in `checkTimelineOperationCall` (check if name is action vs operation)
- [ ] T022 [US1] Add error message for operation used in timeline: "Operation '{name}' cannot be used directly in timeline events"
- [ ] T023 [US1] Add error message for undefined action with suggestions: "Unknown action: {name}. Did you mean: {suggestions}?"

**Transformation**:
- [ ] T024 [US1] Update `transformTimedEvent()` in `packages/language/src/compiler/ast-transformer.ts` to handle `OperationCall` nodes
- [ ] T025 [US1] Add branch: if call name resolves to action → use existing requestAction/startAction transformation
- [ ] T026 [US1] Add branch: if call name resolves to operation → fail with clear error (should be caught by validator)
- [ ] T027 [US1] Preserve existing transformation logic for inline action blocks (backward compatibility)

**Verification**:
- [ ] T028 [US1] Run all 6 tests for US1 - ensure they PASS
- [ ] T029 [US1] Run full test suite (`npm run test`) - ensure no regressions (all existing tests still pass)
- [ ] T030 [US1] Run code quality checks (`npm run check && npm run typecheck`) - ensure no errors

**Checkpoint**: At this point, User Story 1 is fully functional - custom actions work with unified syntax

---

## Phase 4: User Story 2 - Prevent Name Collisions Between Custom Actions and Operations (Priority: P1)

**Goal**: Reject custom action definitions that use the same name as built-in operations

**Independent Test**: Define `action selectElement() [...]` and verify compiler rejects with error "Cannot define action 'selectElement': name conflicts with built-in operation"

### Tests for User Story 2 (TDD - Write FIRST, Ensure FAIL)

- [ ] T031 [P] [US2] Add validation test in `packages/language/src/__tests__/validation.spec.ts`: Reject action with operation name (e.g., `action selectElement()`)
- [ ] T032 [P] [US2] Add validation test: Reject duplicate action definitions in same file
- [ ] T033 [P] [US2] Add validation test: Allow action with similar name (e.g., `action mySelectElement()` is OK)
- [ ] T034 [P] [US2] Add integration test: Compile file with name collision → Verify error includes operation name

**Verify**: All 4 tests FAIL before proceeding to implementation

### Implementation for User Story 2

**Name Registry**:
- [ ] T035 [P] [US2] Create `NameRegistry` interface in `packages/language/src/compiler/name-resolver.ts` (operations Set, actions Map)
- [ ] T036 [P] [US2] Create `buildNameRegistry(program: Program): NameRegistry` function
- [ ] T037 [US2] Populate `registry.operations` from `OPERATION_REGISTRY` (48 operation names)
- [ ] T038 [US2] Populate `registry.actions` from program's ActionDefinition nodes

**Validation**:
- [ ] T039 [US2] Add `checkActionNameCollision(action: ActionDefinition, accept: ValidationAcceptor)` to `packages/language/src/eligian-validator.ts`
- [ ] T040 [US2] Check if `action.name` exists in operation registry using `hasOperation(action.name)`
- [ ] T041 [US2] If collision: emit error with code `ACTION_OPERATION_COLLISION` and message "Cannot define action '{name}': name conflicts with built-in operation"
- [ ] T042 [US2] Add `checkDuplicateActions(program: Program, accept: ValidationAcceptor)` to detect duplicate action definitions
- [ ] T043 [US2] Emit error with code `DUPLICATE_ACTION` for duplicates, include source location of first definition

**Verification**:
- [ ] T044 [US2] Run all 4 tests for US2 - ensure they PASS
- [ ] T045 [US2] Run full test suite - verify no regressions
- [ ] T046 [US2] Run code quality checks

**Checkpoint**: User Stories 1 AND 2 are now complete - unified syntax works with collision prevention

---

## Phase 5: User Story 3 - Support Control Flow with Mixed Calls (Priority: P2)

**Goal**: Enable for loops and if/else blocks in timeline events with mixed custom action/operation calls

**Independent Test**: Write `for (item in items) { customAction(@@item) }` in timeline event, verify compiles and executes correctly

### Tests for User Story 3 (TDD - Write FIRST, Ensure FAIL)

- [ ] T047 [P] [US3] Add parsing test in `packages/language/src/__tests__/parsing.spec.ts`: Parse for loop in timeline event with action call
- [ ] T048 [P] [US3] Add parsing test: Parse if/else in timeline event with action calls in both branches
- [ ] T049 [P] [US3] Add validation test in `packages/language/src/__tests__/validation.spec.ts`: Validate scoping rules for action calls in loops
- [ ] T050 [P] [US3] Add transformer test in `packages/language/src/compiler/__tests__/transformer.spec.ts`: Transform for loop with action call
- [ ] T051 [P] [US3] Add transformer test: Transform if/else with action calls in separate branches
- [ ] T052 [P] [US3] Add integration test: End-to-end compile with nested control flow and action calls

**Verify**: All 6 tests FAIL before proceeding to implementation

### Implementation for User Story 3

**Note**: This builds on US1 infrastructure - no grammar changes needed (control flow already supported)

**Validation**:
- [ ] T053 [US3] Update `checkTimelineOperationCall()` to handle calls within ForStatement context
- [ ] T054 [US3] Update `checkTimelineOperationCall()` to handle calls within IfStatement context
- [ ] T055 [US3] Ensure scoping rules apply correctly (loop variables, block scoping)

**Transformation**:
- [ ] T056 [US3] Update `transformForStatement()` in timeline context to handle action calls (resolve name before transforming)
- [ ] T057 [US3] Update `transformIfStatement()` in timeline context to handle action calls in both branches
- [ ] T058 [US3] Ensure action calls in control flow generate correct requestAction/startAction operations

**Verification**:
- [ ] T059 [US3] Run all 6 tests for US3 - ensure they PASS
- [ ] T060 [US3] Run full test suite - verify no regressions
- [ ] T061 [US3] Run code quality checks

**Checkpoint**: All user stories (US1, US2, US3) are now complete and independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

**Error Reporting Enhancements**:
- [ ] T062 [P] Enhance `suggestSimilarOperations()` in `packages/language/src/compiler/operations/index.ts` with threshold filtering (distance ≤ 3)
- [ ] T063 [P] Create `suggestSimilarActions(unknownName: string, availableActions: string[]): string[]` in `packages/language/src/compiler/name-resolver.ts`
- [ ] T064 Update error messages to use enhanced suggestion functions

**Backward Compatibility**:
- [ ] T065 Restore `NamedActionInvocation` and `ActionCallExpression` grammar productions (support both syntaxes temporarily)
- [ ] T066 Add deprecation warning in validator for old `{ action() }` syntax
- [ ] T067 Create test to verify both old and new syntax work during migration period

**Documentation**:
- [ ] T068 [P] Update `LANGUAGE_SPEC.md` with unified call syntax documentation
- [ ] T069 [P] Add example files to `examples/` demonstrating unified syntax
- [ ] T070 [P] Update `CLAUDE.md` with unified syntax context (if not already done by agent context script)

**Code Cleanup**:
- [ ] T071 Run Biome formatting and linting (`npm run check`) across all modified files
- [ ] T072 Run TypeScript type checking (`npm run typecheck`) and fix any type errors
- [ ] T073 Review code for simplicity - refactor complex functions if needed

**Final Validation**:
- [ ] T074 Run complete test suite (`npm run test`) - ensure all 423+ tests pass
- [ ] T075 Run code quality checks - ensure zero errors, zero warnings
- [ ] T076 Manually test quickstart.md examples - verify they compile correctly
- [ ] T077 Create example DSL file demonstrating all three user stories working together

**Checkpoint**: Feature complete - ready for code review and merge

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational phase completion
- **User Story 2 (Phase 4)**: Depends on Foundational phase completion (can run parallel to US1 if staffed)
- **User Story 3 (Phase 5)**: Depends on US1 completion (builds on unified syntax infrastructure)
- **Polish (Phase 6)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Foundational → US1 (no dependencies on other stories)
- **User Story 2 (P1)**: Foundational → US2 (no dependencies on other stories, can be parallel to US1)
- **User Story 3 (P2)**: Foundational → US1 → US3 (depends on US1 for name resolution infrastructure)

### Within Each User Story

**TDD Workflow (Constitution Principle II)**:
1. **RED**: Write tests FIRST (T009-T014, T031-T034, T047-T052)
2. **Verify FAIL**: Ensure all tests fail before implementation
3. **GREEN**: Implement minimum code to pass tests (T015-T030, T035-T046, T053-T061)
4. **REFACTOR**: Clean up while keeping tests green
5. **Verify PASS**: Run tests again, ensure they pass
6. **No Regression**: Run full test suite, ensure no existing tests broke

### Parallel Opportunities

**Phase 1 (Setup)**: All tasks marked [P] can run together (T003)

**Phase 2 (Foundational)**: Tasks T005, T006 can run in parallel (different files)

**User Story 1 Tests**: All 6 tests (T009-T014) can be written in parallel [P]

**User Story 1 Implementation**: T018, T019 can run in parallel [P] (different concerns)

**User Story 2 Tests**: All 4 tests (T031-T034) can be written in parallel [P]

**User Story 2 Implementation**: T035, T036 can run in parallel [P] (different files)

**User Story 3 Tests**: All 6 tests (T047-T052) can be written in parallel [P]

**Phase 6 (Polish)**: T062, T063, T068, T069, T070 can all run in parallel [P]

**Team Parallelization**:
- After Foundational phase complete: Developer A → US1, Developer B → US2 simultaneously
- US3 waits for US1 to complete (depends on name resolution infrastructure)

---

## Parallel Example: User Story 1

```bash
# RED Phase - Write all tests in parallel:
Task T009: "Parsing test: timeline with fadeIn() no braces"
Task T010: "Parsing test: inline block with mixed calls"
Task T011: "Validation test: action call resolves"
Task T012: "Transformer test: action → requestAction/startAction"
Task T013: "Transformer test: mixed calls in order"
Task T014: "Integration test: end-to-end compilation"

# Verify all FAIL before proceeding

# GREEN Phase - Parallel implementation tasks:
Task T018: "Create findActionByName() helper"
Task T019: "Create resolveCallName() function"

# Then sequential tasks (same file dependencies):
Task T015 → T016 → T017 (grammar changes)
Task T020 → T021 → T022 → T023 (validation)
Task T024 → T025 → T026 → T027 (transformation)

# Verify all PASS
```

---

## Implementation Strategy

### MVP First (User Story 1 + User Story 2 Only)

**Rationale**: US1 and US2 are both P1 priority and provide complete core value:
- US1: Unified syntax works
- US2: Safety enforcement (name collision prevention)
- US3: Nice-to-have (control flow), can be added later

**MVP Path**:
1. Complete Phase 1: Setup (T001-T003)
2. Complete Phase 2: Foundational (T004-T008)
3. Complete Phase 3: User Story 1 (T009-T030)
4. Complete Phase 4: User Story 2 (T031-T046)
5. **STOP and VALIDATE**: Test unified syntax + collision prevention
6. Skip US3 for MVP (can be added in next iteration)
7. Complete Phase 6: Polish (T062-T077)

**MVP Validation**:
- Custom actions work with `fadeIn()` syntax ✅
- Name collisions rejected ✅
- All tests pass ✅
- Code quality checks pass ✅
- Ready for code review and merge ✅

### Incremental Delivery (Full Feature)

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Checkpoint (unified syntax works!)
3. Add User Story 2 → Test independently → Checkpoint (name safety works!)
4. Add User Story 3 → Test independently → Checkpoint (control flow works!)
5. Polish → Final validation → Merge

**Each checkpoint is a potential release point**

### Parallel Team Strategy

With 2 developers:

1. **Together**: Phase 1 + Phase 2 (foundation)
2. **Split after Foundational**:
   - Developer A: User Story 1 (T009-T030)
   - Developer B: User Story 2 (T031-T046)
3. **Sequential**: US3 depends on US1, so Developer A continues to US3 after US1 complete
4. **Together**: Phase 6 (Polish)

With 3+ developers:
- Same as above, but Developer C can work on documentation/examples (T068-T070) during US1/US2 development

---

## Notes

- **TDD Mandatory**: Constitution Principle II requires tests BEFORE implementation
- **[P] tasks**: Different files, no dependencies - can run in parallel
- **[Story] label**: Maps task to specific user story for traceability
- **Each user story**: Independently completable and testable
- **Verify tests FAIL**: Before implementing (proves tests actually test something)
- **Checkpoint validation**: Stop after each user story to verify independently
- **Avoid**: Vague tasks, same-file conflicts, cross-story dependencies that break independence
- **Code quality**: Run `npm run check && npm run typecheck` after each task completion (Constitution Principle XI)

**Total Tasks**: 77
- Setup: 3 tasks
- Foundational: 5 tasks
- User Story 1: 22 tasks (6 tests + 16 implementation)
- User Story 2: 16 tasks (4 tests + 12 implementation)
- User Story 3: 15 tasks (6 tests + 9 implementation)
- Polish: 16 tasks

**MVP Scope (US1 + US2)**: 46 tasks total
**Full Feature (US1 + US2 + US3)**: 77 tasks total
