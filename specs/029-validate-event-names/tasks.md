# Tasks: Event Name and Argument Validation

**Input**: Design documents from `/specs/029-validate-event-names/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Test-first development (TDD) is required per Constitution Principle II. All tests MUST be written before implementation.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions
- **Base directory**: `packages/language/`
- **Validator**: `src/eligian-validator.ts`
- **Tests**: `src/__tests__/event-validation/`
- **Examples**: `examples/demo.eligian` (repository root)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: No setup needed - all infrastructure already exists (event metadata, Levenshtein utilities, validator framework)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T001 [P] Create test directory structure `packages/language/src/__tests__/event-validation/`
- [x] T002 [P] Verify event metadata exists and is up-to-date in `packages/language/src/completion/metadata/timeline-events.generated.ts` (43 events expected)
- [x] T003 [P] Verify Levenshtein utilities exist in `packages/language/src/css/levenshtein.ts` (`findSimilar`, `levenshteinDistance` functions)

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Catch Typos in Event Names (Priority: P1) 🎯 MVP

**Goal**: Validate event names match known Eligius events and provide "Did you mean?" suggestions for typos using Levenshtein distance ≤ 2

**Independent Test**: Create event action with typo in event name and verify error with suggestion appears

### Tests for User Story 1 (TDD - Write tests FIRST)

**NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T004 [US1] Create test file `packages/language/src/__tests__/event-validation/event-name-validation.spec.ts`
- [ ] T005 [US1] Write test: Valid event name "data-sync" produces no errors
- [ ] T006 [US1] Write test: Valid event name "before-request-video-url" produces no errors
- [ ] T007 [US1] Write test: Valid event name "timeline-complete" produces no errors
- [ ] T008 [US1] Write test: Unknown event "data-synk" produces error with suggestion "data-sync"
- [ ] T009 [US1] Write test: Unknown event "before-request-vidio-url" produces error with suggestion "before-request-video-url"
- [ ] T010 [US1] Write test: Unknown event "completely-invalid-event" produces error without suggestions (distance > 2)
- [ ] T011 [US1] Write test: Empty event name "" produces error "Event name cannot be empty"
- [ ] T012 [US1] Write test: Event name with multiple typos produces error with closest match
- [ ] T013 [US1] Write test: Case-sensitive matching (e.g., "Data-Sync" should error, not match "data-sync")
- [ ] T014 [US1] Run tests and verify ALL FAIL (TDD Red phase)

### Implementation for User Story 1

- [ ] T015 [US1] Implement `checkEventNameExists()` method in `packages/language/src/eligian-validator.ts`:
  - Import `TIMELINE_EVENTS` from `completion/metadata/timeline-events.generated.js`
  - Import `findSimilar` from `css/levenshtein.js`
  - Check if `eventAction.eventName` is empty → accept error "Event name cannot be empty" (code: `empty_event_name`)
  - Check if event exists in `TIMELINE_EVENTS` → if found, return (valid)
  - If not found: extract all event names, call `findSimilar(eventName, allNames, 2)`
  - If suggestions found: format message `"Unknown event name: 'X' (Did you mean: 'Y'?)"`
  - If no suggestions: format message `"Unknown event name: 'X'"`
  - Accept error with message (code: `unknown_event_name`)
- [ ] T016 [US1] Register `checkEventNameExists` in `EligianValidatorRegistry` for `EventActionDefinition`:
  - Add to checks array after `checkEventActionParameters`
  - Verify registration in `packages/language/src/eligian-validator.ts` (line ~125)
- [ ] T017 [US1] Run tests for User Story 1 and verify ALL PASS (TDD Green phase)
- [ ] T018 [US1] Run `pnpm run check` to verify code quality (Biome linting and formatting)
- [ ] T019 [US1] Run `pnpm run typecheck` to verify TypeScript compilation
- [ ] T020 [US1] Refactor if needed while keeping tests green (TDD Refactor phase)

**Checkpoint**: At this point, User Story 1 should be fully functional - event name validation with suggestions works independently

---

## Phase 4: User Story 2 - Validate Argument Count (Priority: P2)

**Goal**: Validate that parameter count matches event argument count and provide warning (not error) when mismatched

**Independent Test**: Create event action with wrong parameter count and verify warning appears

### Tests for User Story 2 (TDD - Write tests FIRST)

**NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T021 [US2] Create test file `packages/language/src/__tests__/event-validation/argument-count-validation.spec.ts`
- [ ] T022 [US2] Write test: Event "before-request-video-url" (3 args) with 3 params produces no warnings
- [ ] T023 [US2] Write test: Event "timeline-complete" (0 args) with 0 params produces no warnings
- [ ] T024 [US2] Write test: Event "data-sync" (2 args) with 2 params produces no warnings
- [ ] T025 [US2] Write test: Event "before-request-video-url" (3 args) with 2 params produces warning "Event 'before-request-video-url' provides 3 arguments, but action declares 2"
- [ ] T026 [US2] Write test: Event "before-request-video-url" (3 args) with 1 param produces warning
- [ ] T027 [US2] Write test: Event "timeline-complete" (0 args) with 1 param produces warning "Event 'timeline-complete' provides 0 arguments, but action declares 1 parameter 'extraParam'"
- [ ] T028 [US2] Write test: Event "timeline-complete" (0 args) with 3 params produces warning
- [ ] T029 [US2] Write test: Unknown event name skips argument count validation (handled by US1)
- [ ] T030 [US2] Write test: Parameter names can be arbitrary (validation only checks count, not names)
- [ ] T031 [US2] Run tests and verify ALL FAIL (TDD Red phase)

### Implementation for User Story 2

- [ ] T032 [US2] Implement `checkEventArgumentCount()` method in `packages/language/src/eligian-validator.ts`:
  - Import `TIMELINE_EVENTS` from `completion/metadata/timeline-events.generated.js`
  - Find event metadata by `eventAction.eventName`
  - If event not found: return early (event name validation handles this)
  - Get expected arg count: `event.args?.length ?? 0`
  - Get actual param count: `eventAction.parameters.length`
  - If counts match: return (valid)
  - If mismatch: format warning message:
    - "Event 'X' provides N arguments, but action declares M parameters"
    - If actual < expected: append ". Missing arguments may be undefined at runtime."
    - If actual > expected: append ". Extra parameters will be ignored at runtime."
  - Accept warning with message (code: `event_argument_count_mismatch`, severity: `'warning'`)
- [ ] T033 [US2] Register `checkEventArgumentCount` in `EligianValidatorRegistry` for `EventActionDefinition`:
  - Add to checks array after `checkEventNameExists`
- [ ] T034 [US2] Run tests for User Story 2 and verify ALL PASS (TDD Green phase)
- [ ] T035 [US2] Run `pnpm run check` to verify code quality
- [ ] T036 [US2] Run `pnpm run typecheck` to verify TypeScript compilation
- [ ] T037 [US2] Refactor if needed while keeping tests green (TDD Refactor phase)

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently - event name validation + argument count validation

---

## Phase 5: User Story 3 - Validate Argument Type Compatibility (Priority: P3)

**Goal**: Validate that parameter type annotations (when present) match event argument types - opt-in validation

**Independent Test**: Create event action with type-annotated parameters that mismatch event arg types and verify error appears

### Tests for User Story 3 (TDD - Write tests FIRST)

**NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T038 [US3] Create test file `packages/language/src/__tests__/event-validation/argument-type-validation.spec.ts`
- [ ] T039 [US3] Write test: Event "before-request-video-url" with correct types (number, number, boolean) produces no errors
- [ ] T040 [US3] Write test: Event "data-sync" with correct types (string, number) produces no errors
- [ ] T041 [US3] Write test: Event "before-request-video-url" with type mismatch (string instead of number) produces error "declared as 'string' but event provides 'number'"
- [ ] T042 [US3] Write test: Event "data-sync" with type mismatch (number instead of string) produces error
- [ ] T043 [US3] Write test: Event without type annotations skips type validation (opt-in behavior)
- [ ] T044 [US3] Write test: Mixed annotations (some params typed, some not) validates only typed params
- [ ] T045 [US3] Write test: Event "timeline-complete" (0 args) with type-annotated param produces warning "Type annotation for 'X' is unnecessary"
- [ ] T046 [US3] Write test: Event with more params than args validates types up to arg count, warns about extra params (integrates with US2)
- [ ] T047 [US3] Write test: Type matching is case-sensitive ("string" != "String")
- [ ] T048 [US3] Write test: Unknown event name skips type validation (handled by US1)
- [ ] T049 [US3] Run tests and verify ALL FAIL (TDD Red phase)

### Implementation for User Story 3

- [ ] T050 [US3] Implement `checkEventTypeCompatibility()` method in `packages/language/src/eligian-validator.ts`:
  - Import `TIMELINE_EVENTS` from `completion/metadata/timeline-events.generated.js`
  - Find event metadata by `eventAction.eventName`
  - If event not found: return early (event name validation handles this)
  - Get event arguments: `event.args ?? []`
  - Iterate `eventAction.parameters` with index:
    - If parameter has no type annotation (`param.type` is undefined): skip (opt-in)
    - Get expected arg at same index: `eventArgs[index]`
    - If expected arg doesn't exist (param beyond arg count):
      - Accept warning "Type annotation for 'X' is unnecessary (event provides no arg at position N)"
      - Continue to next param
    - Compare types: `param.type === eventArg.type` (case-sensitive string comparison)
    - If types match: continue to next param
    - If types mismatch:
      - Format error message: "Type mismatch for parameter 'X': declared as 'Y' but event provides 'Z'"
      - Accept error with message (code: `event_type_mismatch`, severity: `'error'`)
- [ ] T051 [US3] Register `checkEventTypeCompatibility` in `EligianValidatorRegistry` for `EventActionDefinition`:
  - Add to checks array after `checkEventArgumentCount`
- [ ] T052 [US3] Run tests for User Story 3 and verify ALL PASS (TDD Green phase)
- [ ] T053 [US3] Run `pnpm run check` to verify code quality
- [ ] T054 [US3] Run `pnpm run typecheck` to verify TypeScript compilation
- [ ] T055 [US3] Refactor if needed while keeping tests green (TDD Refactor phase)

**Checkpoint**: All user stories should now be independently functional - complete event validation (names, counts, types)

---

## Phase 6: Integration & Examples

**Purpose**: Add examples to demonstrate all three user stories, verify no regressions in existing tests

- [ ] T056 [P] Update `examples/demo.eligian` with event validation examples per Constitution Principle XXIV:
  - Add section header: `// ============================================================================`
  - Add section header: `// EVENT VALIDATION - Event Name and Argument Validation (Feature 029)`
  - Add section header: `// ============================================================================`
  - Add comment: `// US1: Valid event names`
  - Add example: `on event "data-sync" action HandleDataSync(syncStatus, itemCount) [...]`
  - Add example: `on event "timeline-complete" action HandleComplete() [...]`
  - Add comment: `// US2: Correct argument counts`
  - Add example: `on event "before-request-video-url" action HandleVideo(index, position, isHistory) [...]`
  - Add comment: `// US3: Type annotations match event arg types`
  - Add example: `on event "data-sync" action HandleDataSyncTyped(syncStatus: string, itemCount: number) [...]`
  - Add example with JSDoc comments demonstrating documented event actions
- [ ] T057 Verify `examples/demo.eligian` compiles successfully: `node packages/cli/bin/cli.js examples/demo.eligian`
- [ ] T058 Run all existing validation tests to ensure no regressions: `pnpm --filter @eligian/language test`
- [ ] T059 Run test coverage to verify 80% threshold: `pnpm --filter @eligian/language test:coverage`
- [ ] T060 Verify zero false positives on existing valid event action fixtures: `packages/language/src/compiler/__tests__/__fixtures__/event-actions/valid/*.eligian`

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final cleanup, documentation, and quality verification

- [ ] T061 [P] Add JSDoc comments to all three validator methods in `packages/language/src/eligian-validator.ts`:
  - `checkEventNameExists()`: Document error codes, Levenshtein threshold, behavior
  - `checkEventArgumentCount()`: Document warning behavior, expected vs actual counts
  - `checkEventTypeCompatibility()`: Document opt-in behavior, type matching rules
- [ ] T062 [P] Verify error messages are clear and actionable (manual testing in VS Code):
  - Test typo scenario → verify suggestion appears
  - Test argument count mismatch → verify warning with explanation
  - Test type mismatch → verify error with expected/actual types
- [ ] T063 [P] Run performance test: validate large file with 50+ event actions in <300ms (per SC-002)
- [ ] T064 Run full test suite across all packages: `pnpm -w run test`
- [ ] T065 Run full typecheck across all packages: `pnpm -w run typecheck`
- [ ] T066 Run Biome check across all packages: `pnpm -w run check`
- [ ] T067 Review quickstart.md examples and verify all examples work as documented
- [ ] T067a Document edge case handling in quickstart.md (edge cases from spec.md lines 62-71 are tested implicitly through acceptance scenarios: empty strings via T011, case sensitivity via T013, event not found via T029/T048, zero arguments via T023/T027)
- [ ] T068 Commit Phase 1-2 (foundational work): `git commit -m "test(spec-029): Add test infrastructure for event validation"`
- [ ] T069 Commit Phase 3 (US1 complete): `git commit -m "feat(spec-029): Implement event name validation with suggestions (US1)"`
- [ ] T070 Commit Phase 4 (US2 complete): `git commit -m "feat(spec-029): Implement argument count validation (US2)"`
- [ ] T071 Commit Phase 5 (US3 complete): `git commit -m "feat(spec-029): Implement type compatibility validation (US3)"`
- [ ] T072 Commit Phase 6-7 (polish): `git commit -m "docs(spec-029): Add examples and final polish for event validation"`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - SKIPPED (all infrastructure exists)
- **Foundational (Phase 2)**: Verify existing infrastructure - BLOCKS all user stories
- **User Stories (Phase 3-5)**: All depend on Foundational phase completion
  - User stories can proceed in parallel (if staffed) since tests are in separate files
  - Or sequentially in priority order (P1 → P2 → P3)
- **Integration (Phase 6)**: Depends on all user stories being complete
- **Polish (Phase 7)**: Depends on Integration phase completion

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - Independent of US1 (tests skip validation if event name invalid)
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) - Independent of US1/US2 (tests skip validation if event name invalid)

**NOTE**: User stories are intentionally independent to allow parallel development, but US2 and US3 gracefully handle invalid event names by skipping validation (US1 handles event name errors)

### Within Each User Story

- Tests MUST be written FIRST and FAIL (TDD Red phase)
- Implementation comes after tests (TDD Green phase)
- Code quality checks after implementation passes
- Refactoring after code quality passes (TDD Refactor phase)

### Parallel Opportunities

- **Phase 2 (Foundational)**: All 3 tasks marked [P] can run in parallel
- **Within User Story 1**: Tests T005-T013 can be written in parallel (same file, but independent test cases)
- **Within User Story 2**: Tests T022-T030 can be written in parallel
- **Within User Story 3**: Tests T039-T048 can be written in parallel
- **Across User Stories**: Once Foundational completes, all three user stories can be developed in parallel by different developers (separate test files, separate validator methods)
- **Phase 6 (Integration)**: T056 and T057 are sequential, but T058-T060 can run in parallel with each other
- **Phase 7 (Polish)**: T061, T062, T063 can run in parallel, T064-T066 can run in parallel, commits are sequential

---

## Parallel Example: User Story 1

```bash
# After Foundational phase completes, start User Story 1:

# Step 1: Write all tests in parallel (different test cases in same file)
Task: "Write test: Valid event name 'data-sync' produces no errors"
Task: "Write test: Unknown event 'data-synk' produces error with suggestion 'data-sync'"
Task: "Write test: Empty event name '' produces error"
# ... (all test tasks T005-T013 can be worked on concurrently)

# Step 2: Verify tests fail (TDD Red)
Task: "Run tests and verify ALL FAIL"

# Step 3: Implement validator method (sequential - single file)
Task: "Implement checkEventNameExists() method"
Task: "Register checkEventNameExists in EligianValidatorRegistry"

# Step 4: Verify tests pass (TDD Green)
Task: "Run tests for User Story 1 and verify ALL PASS"

# Step 5: Code quality checks (can run in parallel)
Task: "Run pnpm run check"
Task: "Run pnpm run typecheck"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 2: Foundational (verify infrastructure)
2. Complete Phase 3: User Story 1 (event name validation)
3. **STOP and VALIDATE**: Test User Story 1 independently
4. Optional: Commit and demo MVP before continuing

### Incremental Delivery

1. Complete Foundational → Infrastructure verified
2. Add User Story 1 → Test independently → Commit (MVP!)
3. Add User Story 2 → Test independently → Commit
4. Add User Story 3 → Test independently → Commit
5. Add Integration + Polish → Final commit
6. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Foundational together (Phase 2)
2. Once Foundational is done:
   - Developer A: User Story 1 (event name validation)
   - Developer B: User Story 2 (argument count validation)
   - Developer C: User Story 3 (type compatibility validation)
3. Stories complete independently, then integrate in Phase 6

---

## Notes

- **TDD Required**: Per Constitution Principle II, tests MUST be written before implementation
- **Test Isolation**: Per Constitution Principle II, integration tests MUST be in separate files (one per user story) to avoid environment pollution
- **[P] tasks**: Can run in parallel (different files or independent test cases)
- **[Story] label**: Maps task to specific user story for traceability
- **Each user story independently testable**: US2 and US3 skip validation if event name is invalid (US1 handles that)
- **Commit after each phase**: Per Constitution Principle XXIII (Incremental Feature Commits)
- **Zero regressions**: Verify all existing tests still pass (T058)
- **80% coverage**: Verify coverage threshold met (T059)
- **Performance target**: <300ms validation response time (T063)
- **Example file**: All features must be in `examples/demo.eligian` per Constitution Principle XXIV

---

## Task Count Summary

- **Total tasks**: 73
- **User Story 1**: 17 tasks (T004-T020)
- **User Story 2**: 17 tasks (T021-T037)
- **User Story 3**: 18 tasks (T038-T055)
- **Integration**: 5 tasks (T056-T060)
- **Polish**: 13 tasks (T061-T067a, T068-T072)
- **Parallel opportunities**: 15+ tasks can run in parallel across different phases

---

## Suggested MVP Scope

**Minimum Viable Product**: User Story 1 only (event name validation with suggestions)

**Rationale**: US1 catches the most critical error (typo in event name → silent runtime failure). This delivers immediate value and can be deployed independently. US2 and US3 are enhancements that add additional safety but aren't blocking.

**MVP Deliverable**:
- Event name validation with "Did you mean?" suggestions
- 10 passing tests for US1
- Zero regressions in existing tests
- Examples in `demo.eligian`
- ~17 tasks (T001-T020)

**Post-MVP**: Add US2 (argument count warnings) and US3 (type compatibility) as separate increments.
