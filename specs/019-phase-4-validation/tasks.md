# Tasks: Phase 4 - Validation Pipeline Unification

**Input**: Design documents from `/specs/019-phase-4-validation/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Test-First Development (TDD) approach - tests written BEFORE implementation per Constitution Principle II

**Organization**: Tasks grouped by user story to enable independent implementation and testing

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify project structure and dependencies

- [ ] T001 Verify Langium 4.x and Vitest 3.2.4 are installed in packages/language/package.json
- [ ] T002 Verify @eligian/shared-utils and @eligian/language dependencies are available

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T003 [P] [US1] Add `clearDocument(documentUri: string): void` method to packages/language/src/css/css-registry.ts with JSDoc
- [ ] T004 [P] [US1] Add `clearAll(): void` method to packages/language/src/css/css-registry.ts with JSDoc
- [ ] T005 [P] [US1] Export clearDocument and clearAll from packages/language/src/css/index.ts

**Checkpoint**: CSS registry state management API ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Consistent CSS Validation (Priority: P1) 🎯 MVP

**Goal**: Fix CSS loading race condition so IDE and compiler show identical CSS validation errors

**Independent Test**: Create `.eligian` file with invalid CSS class reference. Open in VS Code (observe errors), compile via CLI. Both must show identical errors at identical locations.

### Tests for User Story 1 (Test-First Development)

**NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T006 [P] [US1] Write unit test for `clearDocument()` removes document imports in packages/language/src/css/__tests__/css-registry.spec.ts
- [ ] T007 [P] [US1] Write unit test for `clearDocument()` keeps CSS files if other documents reference them in packages/language/src/css/__tests__/css-registry.spec.ts
- [ ] T008 [P] [US1] Write unit test for `clearDocument()` is idempotent in packages/language/src/css/__tests__/css-registry.spec.ts
- [ ] T009 [P] [US1] Write unit test for `clearAll()` resets entire registry in packages/language/src/css/__tests__/css-registry.spec.ts
- [ ] T010 [P] [US1] Write unit test for `clearAll()` is idempotent in packages/language/src/css/__tests__/css-registry.spec.ts
- [ ] T011 [P] [US1] Write integration test "CSS validation produces same errors in IDE and compiler" in packages/language/src/__tests__/ide-compiler-parity.spec.ts (create new file)
- [ ] T012 [P] [US1] Write integration test "CSS changes reflect immediately in both environments" in packages/language/src/__tests__/ide-compiler-parity.spec.ts

### Implementation for User Story 1

- [ ] T013 [US1] Implement `clearDocument()` method in packages/language/src/css/css-registry.ts (reference counting for shared CSS files)
- [ ] T014 [US1] Implement `clearAll()` method in packages/language/src/css/css-registry.ts (clear all maps/sets)
- [ ] T015 [US1] Add explicit state reset in packages/language/src/compiler/pipeline.ts `parseSource()` - call `cssRegistry.clearDocument(uri)` before parsing (lines 42-54 area)
- [ ] T016 [US1] Document singleton state management in comments in packages/language/src/compiler/pipeline.ts
- [ ] T017 [US1] Add synchronization to CSS loading in packages/extension/src/language/main.ts - ensure `onBuildPhase(DocumentState.Parsed)` completes before validation (lines 75-158 area)
- [ ] T018 [US1] Implement helper functions in packages/language/src/__tests__/parity-helpers.ts: `getIDEValidationErrors()`, `getCompilerValidationErrors()`, `compareValidationResults()`
- [ ] T019 [US1] Run tests T006-T012 - verify they all PASS after implementation
- [ ] T020 [US1] Run full test suite (pnpm test) - verify all 1235+ existing tests still pass (zero regressions)

**Checkpoint**: At this point, CSS validation should be 100% consistent between IDE and compiler. US1 is fully functional and independently testable.

---

## Phase 4: User Story 2 - Isolated Compilation State (Priority: P2)

**Goal**: Eliminate state pollution between compilations so results are deterministic

**Independent Test**: Compile FileA (with CSS), then FileB (without CSS). FileB validation must not see FileA's CSS metadata.

### Tests for User Story 2 (Test-First Development)

- [ ] T021 [P] [US2] Write integration test "Sequential compilations are independent" in packages/language/src/__tests__/css-state-isolation.spec.ts (create new file)
- [ ] T022 [P] [US2] Write integration test "Compile same file twice produces identical results" in packages/language/src/__tests__/css-state-isolation.spec.ts
- [ ] T023 [P] [US2] Write integration test "CSS metadata doesn't leak between files" in packages/language/src/__tests__/css-state-isolation.spec.ts

### Implementation for User Story 2

- [ ] T024 [US2] Verify `clearDocument()` implementation properly removes document-specific state (no additional code needed - already implemented in T013)
- [ ] T025 [US2] Verify state reset is called before parsing in compiler pipeline (no additional code needed - already implemented in T015)
- [ ] T026 [US2] Run tests T021-T023 - verify they all PASS
- [ ] T027 [US2] Run full test suite (pnpm test) - verify all tests pass

**Checkpoint**: At this point, US1 AND US2 should both work independently. Compilation is fully isolated and deterministic.

---

## Phase 5: User Story 3 - Validation Parity Assurance (Priority: P3)

**Goal**: Prevent future validation inconsistencies via automated parity tests

**Independent Test**: Run parity test suite that compares IDE validation results against compiler validation results for multiple scenarios.

### Tests for User Story 3 (Test-First Development)

**NOTE: These are the tests that VERIFY parity - they test the test infrastructure itself**

- [ ] T028 [P] [US3] Write parity test "Parse errors identical in IDE and compiler" in packages/language/src/__tests__/ide-compiler-parity.spec.ts
- [ ] T029 [P] [US3] Write parity test "Validation errors identical in IDE and compiler" in packages/language/src/__tests__/ide-compiler-parity.spec.ts
- [ ] T030 [P] [US3] Write parity test "CSS validation errors identical in IDE and compiler" in packages/language/src/__tests__/ide-compiler-parity.spec.ts (extends T011)
- [ ] T031 [P] [US3] Write parity test "Asset loading errors identical in IDE and compiler" in packages/language/src/__tests__/ide-compiler-parity.spec.ts
- [ ] T032 [P] [US3] Write parity test "Valid code produces no errors in both environments" in packages/language/src/__tests__/ide-compiler-parity.spec.ts
- [ ] T033 [P] [US3] Write parity test "Complex selectors validated identically" in packages/language/src/__tests__/ide-compiler-parity.spec.ts
- [ ] T034 [P] [US3] Write parity test "Missing CSS file errors identical" in packages/language/src/__tests__/ide-compiler-parity.spec.ts
- [ ] T035 [P] [US3] Write parity test "CSS parse errors shown identically" in packages/language/src/__tests__/ide-compiler-parity.spec.ts

### Implementation for User Story 3

- [ ] T036 [US3] Enhance `getIDEValidationErrors()` helper in packages/language/src/__tests__/parity-helpers.ts to handle all error types
- [ ] T037 [US3] Enhance `getCompilerValidationErrors()` helper in packages/language/src/__tests__/parity-helpers.ts to handle all error types
- [ ] T038 [US3] Enhance `compareValidationResults()` helper in packages/language/src/__tests__/parity-helpers.ts with deep equality and sorting
- [ ] T039 [US3] Add test fixtures for edge cases in packages/language/src/__tests__/__fixtures__/validation-parity/
- [ ] T040 [US3] Run tests T028-T035 - verify they all PASS and complete in < 10 seconds
- [ ] T041 [US3] Run full test suite (pnpm test) - verify all tests pass

**Checkpoint**: All user stories 1-3 should now be independently functional. Parity test suite prevents future regressions.

---

## Phase 6: User Story 4 - Deprecated Code Removal (Priority: P4)

**Goal**: Complete Feature 018 migration by removing deprecated error types

**Independent Test**: Search codebase for imports from `compiler/types/errors.ts` - all must use unified `errors/` namespace.

### Tests for User Story 4 (Verification Tests)

- [ ] T042 [US4] Verify zero imports from deprecated location by running `grep -r "from.*compiler/types/errors" packages/` (should return empty)
- [ ] T043 [US4] Verify TypeScript compilation succeeds after removal by running `pnpm run typecheck`
- [ ] T044 [US4] Verify all existing tests pass after removal by running `pnpm test`

### Implementation for User Story 4

- [ ] T045 [P] [US4] Search for all imports from `compiler/types/errors` in packages/language/src/compiler/pipeline.ts - update to `@eligian/language/errors`
- [ ] T046 [P] [US4] Search for all imports from `compiler/types/errors` in packages/language/src/compiler/ast-transformer.ts - update to `@eligian/language/errors`
- [ ] T047 [P] [US4] Search for all imports from `compiler/types/errors` in all other files - update to `@eligian/language/errors` (use `grep -r "from.*compiler/types/errors" packages/`)
- [ ] T048 [US4] Delete file packages/language/src/compiler/types/errors.ts (262 lines removed)
- [ ] T049 [US4] Run verification tests T042-T044 - all must pass
- [ ] T050 [US4] Run full test suite (pnpm test) - verify all 1235+ tests pass

**Checkpoint**: All 4 user stories complete. Single source of truth for errors enforced.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T051 [P] Run `pnpm run check` (Biome format and lint with auto-fix) across all packages
- [ ] T052 [P] Run `pnpm run typecheck` - verify zero type errors
- [ ] T053 Benchmark validation performance - verify < 500ms for typical files (no regression from baseline)
- [ ] T054 Benchmark CSS loading performance - verify < 2s for typical files (no regression from baseline)
- [ ] T055 Benchmark parity test suite execution - verify < 10 seconds (success criterion SC-004)
- [ ] T056 [P] Update packages/language/src/css/README.md with state management documentation
- [ ] T057 Test CSS hot-reload in IDE preview - verify still works (< 300ms update time)
- [ ] T058 Run quickstart.md validation scenarios manually - verify all examples work
- [ ] T059 Code review checklist: Constitution compliance (TDD ✓, No gold-plating ✓, Simplicity ✓)
- [ ] T060 Final full test suite run: `pnpm test` - verify all 1235+ tests passing

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
  - T003-T005 MUST complete before any user story work begins
- **User Stories (Phase 3-6)**: All depend on Foundational phase completion
  - User stories can proceed in priority order (P1 → P2 → P3 → P4)
  - OR in parallel if multiple developers available
- **Polish (Phase 7)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Depends on Foundational (T003-T005) - No dependencies on other stories
- **User Story 2 (P2)**: Depends on Foundational (T003-T005) - Builds on US1 implementation but independently testable
- **User Story 3 (P3)**: Depends on Foundational (T003-T005) - Uses helpers from US1 but independently testable
- **User Story 4 (P4)**: Depends on Foundational (T003-T005) - Independent cleanup task

### Within Each User Story

- **Test-First Development** (Constitution Principle II):
  1. Write tests FIRST (ensure they FAIL)
  2. Write MINIMUM implementation to make tests PASS
  3. Refactor while keeping tests green
  4. Never write implementation before tests exist

- **Task Order**:
  - Foundation tasks before story tasks
  - Tests before implementation (TDD)
  - Core implementation before integration
  - Verification after implementation
  - Story complete before moving to next priority

### Parallel Opportunities

**Foundational Phase (T003-T005)**:
- All 3 tasks can run in parallel (different methods in same file, can be done concurrently)

**User Story 1 Tests (T006-T012)**:
- All 7 tests can be written in parallel (separate test cases)

**User Story 1 Implementation**:
- T013-T014 can run in parallel (different methods)
- T015-T017 can run in parallel (different files: pipeline.ts, main.ts, parity-helpers.ts)

**User Story 2 Tests (T021-T023)**:
- All 3 tests can be written in parallel (separate test cases)

**User Story 3 Tests (T028-T035)**:
- All 8 tests can be written in parallel (separate test cases)

**User Story 3 Implementation (T036-T039)**:
- All 4 enhancement tasks can run in parallel (different helpers, different fixtures)

**User Story 4 Implementation (T045-T047)**:
- All 3 import update tasks can run in parallel (different files)

**Polish Phase (T051-T060)**:
- T051-T052 can run in parallel
- T053-T055 can run in parallel (different benchmarks)
- T056-T058 can run in parallel

---

## Parallel Example: User Story 1

```bash
# Foundational Phase - All parallel:
Task T003: "Add clearDocument() method to css-registry.ts"
Task T004: "Add clearAll() method to css-registry.ts"
Task T005: "Export from css/index.ts"

# Write all tests together:
Task T006: "Unit test clearDocument() removes imports"
Task T007: "Unit test clearDocument() keeps shared CSS"
Task T008: "Unit test clearDocument() is idempotent"
Task T009: "Unit test clearAll() resets registry"
Task T010: "Unit test clearAll() is idempotent"
Task T011: "Integration test CSS validation parity"
Task T012: "Integration test CSS changes reflected"

# Implement in parallel:
Task T013-T014: "Implement clearDocument() and clearAll()"
Task T015-T016: "Add state reset to pipeline.ts"
Task T017: "Add synchronization to main.ts"
Task T018: "Implement parity helper functions"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T002)
2. Complete Phase 2: Foundational (T003-T005) - CRITICAL
3. Complete Phase 3: User Story 1 (T006-T020)
4. **STOP and VALIDATE**: Test US1 independently
   - CSS validation should be identical in IDE and CLI
   - All 1235+ tests should pass
5. Ready for deployment/demo if needed

**Estimated Time**: 1-2 days

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP - Fixes primary issue!)
3. Add User Story 2 → Test independently → Deploy/Demo (Adds determinism)
4. Add User Story 3 → Test independently → Deploy/Demo (Adds regression prevention)
5. Add User Story 4 → Test independently → Deploy/Demo (Complete cleanup)
6. Each story adds value without breaking previous stories

**Estimated Total Time**: 3-5 days

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together (T001-T005)
2. Once Foundational is done:
   - **Developer A**: User Story 1 (T006-T020) - Primary fix
   - **Developer B**: User Story 3 (T028-T041) - Parity tests (can start after US1 helpers available)
   - **Developer C**: User Story 4 (T042-T050) - Cleanup (independent)
3. User Story 2 (T021-T027) - Quick verification phase after US1 completes
4. Stories complete and validate independently

**Estimated Time with 3 Developers**: 2-3 days

---

## Notes

### Task Conventions

- **[P]** tasks = Different files or independent logic, no dependencies
- **[Story]** label maps task to specific user story (US1, US2, US3, US4)
- Each user story should be independently completable and testable
- Tests written FIRST, verify they FAIL, then implement

### Test-First Development (TDD)

Per Constitution Principle II, this feature MUST follow strict TDD:
1. Write test FIRST (it should FAIL - RED phase)
2. Write MINIMUM code to make test PASS (GREEN phase)
3. Refactor while keeping tests green (REFACTOR phase)
4. Implementation without tests is a constitutional violation

### Verification Points

- After T005: Foundation ready - CSS registry state API available
- After T020: US1 complete - CSS validation 100% consistent
- After T027: US2 complete - Compilation fully isolated
- After T041: US3 complete - Parity tests prevent regressions
- After T050: US4 complete - Single source of truth enforced
- After T060: All 4 stories complete, all quality checks pass

### Success Criteria Validation

- **SC-001**: 100% validation parity → Verified by US3 parity tests passing
- **SC-002**: Zero inconsistency reports → Verified by US1 integration tests passing
- **SC-003**: 80+ lines removed → Verified by T048 (262 lines removed)
- **SC-004**: Parity tests < 10s → Verified by T055 benchmark
- **SC-005**: Validation < 500ms → Verified by T053 benchmark
- **SC-006**: 1235+ tests passing → Verified by T060 full test run
- **SC-007**: CSS hot-reload < 300ms → Verified by T057 manual test

### Anti-Patterns to Avoid

- ❌ Writing implementation before tests (violates TDD)
- ❌ Skipping test verification (tests must FAIL first)
- ❌ Cross-story dependencies that break independence
- ❌ Vague tasks without specific file paths
- ❌ Same file conflicts (multiple people editing same file)
- ❌ Committing without running full test suite

### Commit Strategy

- Commit after each logical group (e.g., after T003-T005 foundation complete)
- Commit after tests written and verified to fail (e.g., after T006-T012)
- Commit after implementation makes tests pass (e.g., after T013-T019)
- Commit after each user story checkpoint
- Always run `pnpm test` before committing
- Always run `pnpm run check` before committing
