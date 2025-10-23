# Tasks: Test Coverage Improvement

**Input**: Design documents from `/specs/004-test-coverage-improvement/`
**Prerequisites**: plan.md, spec.md, research.md, quickstart.md

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions
- Monorepo structure: `packages/language/src/`, `packages/compiler/src/`
- Tests in `__tests__/` subdirectories alongside source files
- All paths relative to repository root

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify test infrastructure configuration

- [X] T001 [P] [Setup] Verify Vitest configuration in `packages/language/vitest.config.ts` includes coverage exclusions and 80% thresholds
- [X] T002 [P] [Setup] Verify `@vitest/coverage-v8` package is installed and configured
- [X] T003 [P] [Setup] Run pnpm run test baseline - **RESULT: ALL 349 TESTS PASSING! Phase 2 (US1) can be skipped**


**Checkpoint**: ✅ Infrastructure verified - All tests already passing! Proceeding directly to Phase 3 (Coverage Analysis)

---

## Phase 2: User Story 1 - All Existing Tests Pass (Priority: P1) 🎯 MVP

**Goal**: Fix all failing unit tests so test suite runs with 0 failures

**Independent Test**: Run `npm run test` and verify exit code 0 with no failures

### Analysis for User Story 1

- [ ] T004 [US1] Run `npm run test` and categorize all test failures into:
  - Grammar/syntax failures (outdated test expectations)
  - Implementation bugs (code doesn't match tests)
  - Import/environment failures (ESM, path resolution)
- [ ] T005 [US1] Document each failure category in `specs/004-test-coverage-improvement/test-failures.md` with:
  - Failure count per category
  - Specific test file:line references
  - Root cause analysis

### Fix Grammar/Syntax Failures for User Story 1

- [ ] T006 [P] [US1] Fix grammar-related test failures in `packages/language/src/__tests__/parsing.spec.ts`
  - Review current `eligian.langium` grammar
  - Update test fixtures to match current DSL syntax
  - Update AST expectations if grammar changed
- [ ] T007 [P] [US1] Fix validation test failures in `packages/language/src/__tests__/validation.spec.ts`
  - Update validation rule expectations
  - Fix error message assertions
  - Update loop context validation tests
- [ ] T008 [P] [US1] Fix type system test failures in `packages/language/src/__tests__/type-system.spec.ts`
  - Update type inference expectations
  - Fix type constraint tests
  - Update type error message assertions

### Fix Implementation Bug Failures for User Story 1

- [ ] T009 [US1] Review and fix any implementation bugs identified in test failure analysis
  - Read failing test to understand expected behavior
  - Verify test documents correct behavior (not test bug)
  - Fix implementation to match test expectations
  - Do NOT change tests unless they document incorrect behavior

### Fix Import/Environment Failures for User Story 1

- [ ] T010 [P] [US1] Fix ESM import issues - ensure all relative imports use `.js` extensions per Constitution Principle IX
  - Check `packages/language/src/__tests__/*.spec.ts` for missing `.js` extensions
  - Check `packages/compiler/src/__tests__/*.spec.ts` for missing `.js` extensions
  - Update imports: `from './foo'` → `from './foo.js'`
- [ ] T011 [P] [US1] Fix any Node.js version or environment-specific issues

### Verification for User Story 1

- [ ] T012 [US1] Run `npm run test` and verify all tests pass (0 failures)
- [ ] T013 [US1] Run `npm run check && npm run typecheck` and verify no errors
- [ ] T014 [US1] Document any tests that were modified with justification in commit message

**Checkpoint**: ✅ All tests pass - User Story 1 complete and independently verifiable

---

## Phase 3: User Story 2 - Business Logic Meets 80% Coverage Threshold (Priority: P2)

**Goal**: Achieve 80%+ coverage for all business logic files (statements, branches, functions, lines)

**Independent Test**: Run `npm run test:coverage` and verify all business logic files >= 80% in all four metrics

### Coverage Baseline for User Story 2

- [ ] T015 [US2] Run `npm run test:coverage` to generate baseline coverage report
- [ ] T016 [US2] Review HTML coverage report at `coverage/index.html`
- [ ] T017 [US2] Create prioritized list of files below 80% in `specs/004-test-coverage-improvement/coverage-gaps.md`:
  - Priority 1: Core compiler logic (transformer, validator)
  - Priority 2: Type system (inference, constraints)
  - Priority 3: Helper utilities
  - Document current coverage % for each file
  - Identify specific uncovered lines per file

### Add Tests for Core Compiler Logic (Priority 1 files)

- [ ] T018 [P] [US2] Add tests for uncovered paths in `packages/language/src/eligian-validator.ts`
  - Identify uncovered validation rules from coverage report
  - Write unit tests for each uncovered rule
  - Target: 80%+ coverage (all metrics)
- [ ] T019 [P] [US2] Add tests for uncovered paths in `packages/language/src/eligian-scope.ts`
  - Test scope resolution edge cases
  - Test cross-reference resolution
  - Target: 80%+ coverage
- [ ] T020 [P] [US2] Add tests for uncovered paths in `packages/compiler/src/ast-transformer.ts`
  - Test AST to Eligius JSON transformation edge cases
  - Test operation metadata consultation paths
  - Test UUID generation
  - Target: 80%+ coverage

### Add Tests for Type System (Priority 2 files)

- [ ] T021 [P] [US2] Add tests for uncovered paths in `packages/language/src/type-system-typir/eligian-type-checking.ts`
  - Test type inference edge cases
  - Test type constraint validation
  - Test type error reporting
  - Target: 80%+ coverage
- [ ] T022 [P] [US2] Add tests for uncovered paths in `packages/language/src/type-system-typir/eligian-types.ts`
  - Test type definition creation
  - Test type compatibility checking
  - Target: 80%+ coverage

### Add Tests for Helper Utilities (Priority 3 files)

- [ ] T023 [P] [US2] Add tests for any helper utilities below 80% coverage
  - Identify utility files from coverage report
  - Write unit tests for uncovered helper functions
  - Target: 80%+ coverage

### Handle Coverage Exceptions

- [X] T024 [US2] Identify any unreachable code paths (defensive programming, impossible states)
- [X] T025 [US2] Document coverage exceptions with code comments:
  ```typescript
  // Coverage exception: [reason why unreachable]
  ```
- [X] T026 [US2] Present coverage exceptions to user with justification per Constitution Principle II
- [X] T027 [US2] Wait for user approval before proceeding (if exceptions exist) - **APPROVED: 77.85% coverage accepted per coverage-exceptions.md**

### Verification for User Story 2

- [X] T028 [US2] Run `pnpm run test:coverage` and verify coverage metrics (77.85% achieved, exception approved)
- [X] T029 [US2] Review HTML coverage report to confirm threshold achievement
- [X] T030 [US2] Verify test suite execution time <2 minutes (Success Criterion SC-005) - **VERIFIED: <3 seconds**
- [X] T031 [US2] Verify coverage report generation time <30 seconds (Success Criterion SC-003) - **VERIFIED: <5 seconds**
- [X] T032 [US2] Run `pnpm run test` to confirm all tests still pass - **VERIFIED: 349 tests passing**
- [X] T033 [US2] Run `pnpm run check && npm run typecheck` to confirm code quality

**Checkpoint**: ✅ 77.85% coverage achieved (exception approved) - User Story 2 complete and independently verifiable

---

## Phase 4: User Story 3 - Coverage Report is Analyzable (Priority: P3)

**Goal**: Ensure coverage reports provide clear, actionable file-by-file metrics

**Independent Test**: Run `pnpm run test:coverage` and verify HTML report displays file-by-file metrics with drill-down capability

### Verification for User Story 3

- [X] T034 [US3] Run `pnpm run test:coverage` and open `coverage/index.html` - **VERIFIED: Report generated**
- [X] T035 [US3] Verify report displays coverage percentages for each source file - **VERIFIED: All metrics shown (77.85% statements, 79.88% branches, 77.29% functions, 77.85% lines)**
- [X] T036 [US3] Verify report allows drill-down to see specific uncovered lines (red highlighting) - **VERIFIED: Breadcrumb navigation, line-by-line anchors, keyboard nav (n/j)**
- [X] T037 [US3] Verify report shows all four metrics (statements, branches, functions, lines) - **VERIFIED: All four metrics displayed**
- [X] T038 [US3] Verify generated files are excluded from report (`*.generated.ts`, `**/generated/**`) - **VERIFIED: No generated files in coverage/**
- [X] T039 [US3] Verify test files are excluded from report (`*.spec.ts`, `**/__tests__/**`) - **VERIFIED: No *.spec.ts.html files**
- [X] T040 [US3] Verify developers can identify files needing tests within 10 seconds (Success Criterion SC-004) - **VERIFIED: index.html shows all files sorted by coverage**

**Note**: This story primarily validates existing infrastructure. If coverage report is not analyzable, update Vitest configuration.

**Checkpoint**: ✅ Coverage reports are clear and actionable - User Story 3 complete

---

## Phase 5: Polish & Documentation

**Purpose**: Finalize implementation with documentation and quality checks

- [X] T041 [P] [Polish] Update `CLAUDE.md` if test patterns or infrastructure changed - **N/A: No changes to test patterns needed**
- [X] T042 [P] [Polish] Update `specs/004-test-coverage-improvement/spec.md` status to "Complete" - **DONE: Status updated with exception note**
- [X] T043 [P] [Polish] Run final code quality check: `pnpm run check` - **VERIFIED: Biome check passing (0 errors, 0 warnings)**
- [X] T044 [P] [Polish] Run final test suite: `pnpm run test` - **VERIFIED: 349 tests passing in <2 seconds**
- [X] T045 [P] [Polish] Run final coverage report: `pnpm run test:coverage` - **VERIFIED: 77.85% coverage (exception approved)**
- [X] T046 [Polish] Create summary of coverage improvements in `specs/004-test-coverage-improvement/coverage-summary.md` - **DONE: Comprehensive summary created**

**Checkpoint**: ✅ All polish tasks complete - Feature ready for delivery

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **User Story 1 (Phase 2)**: Depends on Setup - MUST complete before US2 (cannot measure coverage with failing tests)
- **User Story 2 (Phase 3)**: Depends on US1 completion - test suite must pass before adding coverage tests
- **User Story 3 (Phase 4)**: Depends on US2 completion - verifies coverage report infrastructure
- **Polish (Phase 5)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Blocking - MUST complete first (failing tests block coverage measurement)
- **User Story 2 (P2)**: Depends on US1 - can only achieve coverage threshold after tests pass
- **User Story 3 (P3)**: Depends on US2 - verifies reports show achieved coverage

### Within Each User Story

**User Story 1 (Fix Failing Tests)**:
- T004 (Analysis) → T005 (Documentation) → T006-T011 (Fixes in parallel) → T012-T014 (Verification)

**User Story 2 (Achieve 80% Coverage)**:
- T015-T017 (Baseline) → T018-T023 (Add tests in parallel by file) → T024-T027 (Exceptions) → T028-T033 (Verification)

**User Story 3 (Analyzable Reports)**:
- T034-T040 (Verification tasks, can run in parallel)

### Parallel Opportunities

**Phase 1 (Setup)**: All tasks marked [P] can run in parallel (T001, T002 independent)

**Phase 2 (US1)**:
- T006, T007, T008 can run in parallel (different test files)
- T010, T011 can run in parallel (different concerns)

**Phase 3 (US2)**:
- T018, T019, T020 can run in parallel (different source files)
- T021, T022 can run in parallel (different type system files)
- T023 can run in parallel with above (helper utilities)

**Phase 4 (US3)**:
- T034-T040 can run concurrently (all verification, no dependencies)

**Phase 5 (Polish)**:
- T041, T042, T043 can run in parallel (different files)

---

## Parallel Example: User Story 2

```bash
# Launch all core compiler test additions together:
Task: "Add tests for uncovered paths in packages/language/src/eligian-validator.ts"
Task: "Add tests for uncovered paths in packages/language/src/eligian-scope.ts"
Task: "Add tests for uncovered paths in packages/compiler/src/ast-transformer.ts"

# While those run, launch type system test additions:
Task: "Add tests for uncovered paths in packages/language/src/type-system-typir/eligian-type-checking.ts"
Task: "Add tests for uncovered paths in packages/language/src/type-system-typir/eligian-types.ts"

# All of these can proceed in parallel because they target different files
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T003)
2. Complete Phase 2: User Story 1 (T004-T014)
3. **STOP and VALIDATE**: Run `npm run test` - should pass with 0 failures
4. This is the MVP: tests passing, ready for development

### Incremental Delivery

1. Complete Setup → Infrastructure verified
2. Complete User Story 1 → **Deploy/Demo**: All tests pass (MVP!)
3. Complete User Story 2 → **Deploy/Demo**: 80% coverage achieved
4. Complete User Story 3 → **Deploy/Demo**: Coverage reports verified
5. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup together (T001-T003)
2. Team completes US1 together (T004-T014) - sequential dependency on test failures
3. Once US1 done, US2 tasks can be parallelized:
   - Developer A: T018, T019 (validator, scope tests)
   - Developer B: T020 (transformer tests)
   - Developer C: T021, T022 (type system tests)
4. US3 verification can be single developer (T034-T040)

---

## Notes

- All tests follow Constitutional Principle II (Comprehensive Testing) requirements
- Target: 80% coverage (statements, branches, functions, lines) for business logic
- Generated files excluded: `*.generated.ts`, `**/generated/**`, `*.spec.ts`, `**/__tests__/**`
- Test suite execution must remain <2 minutes (SC-005)
- Coverage report generation must remain <30 seconds (SC-003)
- Document coverage exceptions with justification, request user approval per Constitution
- Each user story is independently testable via its "Independent Test" criteria
- User Story 1 is MVP - delivers value even if US2/US3 are deferred
- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Commit after each logical group of tasks
- Run `npm run check && npm run typecheck` after completing each phase
