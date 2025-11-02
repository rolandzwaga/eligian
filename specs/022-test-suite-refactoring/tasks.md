# Tasks: Test Suite Refactoring

**Input**: Design documents from `/specs/022-test-suite-refactoring/`
**Prerequisites**: plan.md, spec.md, quickstart.md

**Tests**: Not applicable - this is test infrastructure refactoring. Existing 1462 tests validate that refactoring preserves behavior.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions
- Test files: `packages/language/src/__tests__/`
- Helper module: `packages/language/src/__tests__/test-helpers.ts`

---

## Phase 1: Setup (No setup needed)

**Status**: SKIPPED - No setup required. All work happens within existing test directory.

---

## Phase 2: Foundational (Prerequisites for All User Stories)

**Purpose**: Create test-helpers.ts module that all subsequent user stories depend on

**⚠️ CRITICAL**: User Stories 1 and 2 (P1) depend on this module existing. Must complete before P1 stories.

- [X] **T001** [US1+US2] Create `packages/language/src/__tests__/test-helpers.ts` with module structure (interfaces, exports)
  - Define `TestContext` interface (services, parse, parseAndValidate)
  - Define `ValidationResult` interface (document, program, diagnostics, errors, warnings)
  - Define `CSSFixture` interface (classes?, ids?)
  - Define `DiagnosticSeverity` enum (Error=1, Warning=2, Information=3, Hint=4)
  - Add ESM imports with .js extensions per Constitution Principle IX
  - Export all interfaces and types

**Checkpoint**: test-helpers.ts module exists with type definitions - P1 stories can now begin in parallel

---

## Phase 3: User Story 1 - Shared Test Utilities (Priority: P1) 🎯 MVP

**Goal**: Provide createTestContext() and parseAndValidate() helpers to eliminate ~400 lines of service initialization duplication

**Independent Test**: Create helpers, update 2-3 test files, verify all 1462 tests pass with identical behavior

### Implementation for User Story 1

- [X] **T002** [P] [US1] Implement `createTestContext()` function in test-helpers.ts
  - Call `createEligianServices(EmptyFileSystem)` to create services
  - Call `parseHelper<Program>(services.Eligian)` to create parse helper
  - Implement `parseAndValidate(code, cssFileUri)` async function:
    - Parse code using parse helper
    - Register CSS imports with CSS registry (if cssFileUri provided)
    - Build document with DocumentBuilder.build([document], { validation: true })
    - Return ValidationResult with document, program, diagnostics, errors (severity 1), warnings (severity 2)
  - Return TestContext object { services, parse, parseAndValidate }
  - Add JSDoc comments explaining usage

- [X] **T003** [P] [US1] Implement `getErrors(document)` helper function in test-helpers.ts
  - Filter diagnostics by severity === DiagnosticSeverity.Error
  - Return empty array if no diagnostics
  - Add JSDoc comment

- [X] **T004** [P] [US1] Implement `getWarnings(document)` helper function in test-helpers.ts
  - Filter diagnostics by severity === DiagnosticSeverity.Warning
  - Return empty array if no diagnostics
  - Add JSDoc comment

- [X] **T005** [US1] Refactor `packages/language/src/__tests__/validation.spec.ts` to use test-helpers.ts
  - Import createTestContext from test-helpers.ts
  - Replace manual service creation with `ctx = createTestContext()` in beforeAll()
  - Replace local parseAndValidate() with ctx.parseAndValidate()
  - Update all test assertions to use `errors` instead of `validationErrors`
  - Verify all tests pass: `pnpm test validation.spec.ts`
  - Verify test output is identical to baseline

- [X] **T006** [US1] Refactor `packages/language/src/__tests__/parsing.spec.ts` to use test-helpers.ts
  - Import createTestContext from test-helpers.ts
  - Replace manual service creation with ctx = createTestContext()
  - Replace local parse() calls with ctx.parse() where appropriate
  - Add parse error checks using getErrors(document) per Langium best practices
  - Verify all tests pass: `pnpm test parsing.spec.ts`

- [X] **T007** [P] [US1] Refactor `packages/language/src/__tests__/typir-import-validation.spec.ts` to use test-helpers.ts
  - Import createTestContext from test-helpers.ts
  - Replace manual service creation
  - Update parseAndValidate() calls
  - Verify all tests pass

- [X] **T008** [P] [US1] Refactor `packages/language/src/__tests__/typir-constant-validation.spec.ts` to use test-helpers.ts
  - Import createTestContext from test-helpers.ts
  - Replace manual service creation
  - Update parseAndValidate() calls
  - Verify all tests pass

- [ ] **T009** [P] [US1] Refactor `packages/language/src/__tests__/typir-event-validation.spec.ts` to use test-helpers.ts
  - Import createTestContext from test-helpers.ts
  - Replace manual service creation
  - Update parseAndValidate() calls
  - Verify all tests pass

- [ ] **T010** [P] [US1] Refactor `packages/language/src/__tests__/typir-control-flow-validation.spec.ts` to use test-helpers.ts
  - Import createTestContext from test-helpers.ts
  - Replace manual service creation
  - Update parseAndValidate() calls
  - Verify all tests pass

- [ ] **T011** [P] [US1] Refactor `packages/language/src/__tests__/typir-timeline-validation.spec.ts` to use test-helpers.ts
  - Import createTestContext from test-helpers.ts
  - Replace manual service creation
  - Update parseAndValidate() calls
  - Verify all tests pass

- [ ] **T012** [US1] Run full test suite to verify User Story 1 completion
  - Execute: `pnpm test`
  - Verify: All 1462 tests pass
  - Verify: No test behavior changes (output identical to baseline)
  - Measure: Count lines of code reduced (target: ~400 lines)
  - Execute: `grep -r "createEligianServices" packages/language/src/__tests__/ | wc -l`
  - Verify: Significant reduction in createEligianServices() usage

- [ ] **T013** [US1] Run code quality checks for User Story 1
  - Execute: `pnpm run check` (Biome formatting and linting)
  - Fix any linting errors in test-helpers.ts and refactored files
  - Execute: `pnpm run typecheck` (TypeScript type checking)
  - Fix any type errors
  - Verify: 0 errors, 0 warnings (except acceptable warnings)

**Checkpoint**: User Story 1 complete - Shared test utilities functional, 7 high-traffic test files refactored, all tests passing

---

## Phase 4: User Story 2 - CSS Registry Test Fixtures (Priority: P1)

**Goal**: Provide CSS_FIXTURES and setupCSSRegistry() to eliminate ~150 lines of CSS registry boilerplate

**Independent Test**: Add CSS fixtures, update 2-3 CSS test files, verify all tests pass with correct CSS validation behavior

### Implementation for User Story 2

- [ ] **T014** [P] [US2] Define `CSS_FIXTURES` constant in test-helpers.ts
  - Create CSS_FIXTURES.common with classes: ['button', 'primary', 'secondary', 'active', 'hidden', 'visible'] and ids: ['app', 'container', 'box', 'element']
  - Create CSS_FIXTURES.timeline with classes: ['test-container', 'container', 'presentation-container'] and ids: ['test', 'title', 'credits']
  - Export CSS_FIXTURES constant
  - Add JSDoc comment explaining usage and how to merge fixtures

- [ ] **T015** [US2] Implement `setupCSSRegistry()` function in test-helpers.ts
  - Accept parameters: (ctx: TestContext, cssFileUri: string = 'file:///styles.css', fixture: CSSFixture = CSS_FIXTURES.common)
  - Get CSS registry from ctx.services.Eligian.css.CSSRegistry
  - Call updateCSSFile() with cssFileUri and metadata:
    - classes: new Set(fixture.classes ?? [])
    - ids: new Set(fixture.ids ?? [])
    - classLocations: new Map()
    - idLocations: new Map()
    - classRules: new Map()
    - idRules: new Map()
    - errors: []
  - Add JSDoc comment with usage examples
  - Note: This function has dependencies on T014 (CSS_FIXTURES) so cannot be parallel

- [ ] **T016** [US2] Refactor `packages/language/src/__tests__/css-classname-validation/valid-classname.spec.ts`
  - Import setupCSSRegistry and CSS_FIXTURES from test-helpers.ts (use '../test-helpers.js' path)
  - Replace manual cssRegistry.updateCSSFile() with setupCSSRegistry(ctx, 'file:///styles.css', CSS_FIXTURES.common)
  - Simplify CSS setup in beforeAll() hook
  - Verify all tests pass
  - Measure: Count lines reduced in this file

- [ ] **T017** [P] [US2] Refactor `packages/language/src/__tests__/css-classname-validation/unknown-classname.spec.ts`
  - Import setupCSSRegistry and CSS_FIXTURES
  - Replace CSS registry boilerplate with setupCSSRegistry()
  - Verify all tests pass

- [ ] **T018** [P] [US2] Refactor `packages/language/src/__tests__/css-selector-validation/valid-selector.spec.ts`
  - Import setupCSSRegistry and CSS_FIXTURES
  - Replace CSS registry boilerplate
  - Verify all tests pass

- [ ] **T019** [P] [US2] Refactor `packages/language/src/__tests__/css-selector-validation/unknown-selector.spec.ts`
  - Import setupCSSRegistry and CSS_FIXTURES
  - Replace CSS registry boilerplate
  - Verify all tests pass

- [ ] **T020** [P] [US2] Refactor `packages/language/src/__tests__/css-selector-validation/invalid-syntax.spec.ts`
  - Import setupCSSRegistry and CSS_FIXTURES
  - Replace CSS registry boilerplate
  - Verify all tests pass

- [ ] **T021** [P] [US2] Refactor `packages/language/src/__tests__/css-hot-reload/css-registry-update.spec.ts`
  - Import setupCSSRegistry and CSS_FIXTURES
  - Replace CSS registry boilerplate
  - Verify all tests pass

- [ ] **T022** [P] [US2] Refactor `packages/language/src/__tests__/css-invalid-file/invalid-css.spec.ts`
  - Import setupCSSRegistry and CSS_FIXTURES
  - Replace CSS registry boilerplate
  - Verify all tests pass

- [ ] **T023** [US2] Run full test suite to verify User Story 2 completion
  - Execute: `pnpm test`
  - Verify: All 1462 tests pass
  - Measure: Count lines of code reduced in CSS test files (target: ~150 lines)
  - Execute: `grep -r "cssRegistry.updateCSSFile" packages/language/src/__tests__/ | wc -l`
  - Verify: Significant reduction in updateCSSFile() boilerplate

- [ ] **T024** [US2] Run code quality checks for User Story 2
  - Execute: `pnpm run check`
  - Fix any linting errors
  - Execute: `pnpm run typecheck`
  - Fix any type errors
  - Verify: 0 errors, 0 warnings

**Checkpoint**: User Story 2 complete - CSS fixtures functional, 7 CSS test files refactored, all tests passing

---

## Phase 5: User Story 3 - Standardized Lifecycle Hooks (Priority: P2)

**Goal**: Document and standardize lifecycle hook patterns (beforeAll/beforeEach/afterEach) across 10-20 test files

**Independent Test**: Update 5-10 test files with standardized hooks, verify no state leakage between tests

### Implementation for User Story 3

- [ ] **T025** [US3] Document lifecycle hook patterns in test-helpers.ts
  - Add module-level JSDoc comment section explaining best practices:
    - Use beforeAll() for expensive setup (service creation) - runs once per suite
    - Use beforeEach() for per-test isolation (when tests modify shared state)
    - Use afterEach() for cleanup (vi.restoreAllMocks(), CSS registry cleanup)
    - Use afterEach() for CSS registry state cleanup to prevent leakage
  - Add code examples in JSDoc comments
  - Reference TEST_SUITE_ANALYSIS.md section on lifecycle hooks

- [ ] **T026** [P] [US3] Standardize lifecycle hooks in `packages/language/src/__tests__/validation.spec.ts`
  - Add inline comment in beforeAll() explaining: "Expensive setup - runs once per suite"
  - Add afterEach() hook if test suite uses mocks/spies: `afterEach(() => vi.restoreAllMocks())`
  - Verify pattern consistency with other files
  - Verify all tests pass

- [ ] **T027** [P] [US3] Standardize lifecycle hooks in `packages/language/src/__tests__/parsing.spec.ts`
  - Add inline comments documenting lifecycle hook purpose
  - Add afterEach() for cleanup if needed
  - Verify all tests pass

- [ ] **T028** [P] [US3] Standardize lifecycle hooks in `packages/language/src/__tests__/typir-import-validation.spec.ts`
  - Add inline comments
  - Add afterEach() for cleanup
  - Verify all tests pass

- [ ] **T029** [P] [US3] Standardize lifecycle hooks in `packages/language/src/__tests__/css-classname-validation/valid-classname.spec.ts`
  - Add inline comments
  - Add afterEach() to clear CSS registry state if needed
  - Verify all tests pass

- [ ] **T030** [P] [US3] Standardize lifecycle hooks in `packages/language/src/__tests__/css-selector-validation/valid-selector.spec.ts`
  - Add inline comments
  - Add afterEach() for CSS registry cleanup
  - Verify all tests pass

- [ ] **T031** [P] [US3] Standardize lifecycle hooks in 5-10 additional test files
  - Identify test files with inconsistent lifecycle hook usage (from TEST_SUITE_ANALYSIS.md)
  - Add inline comments documenting hook purpose
  - Add afterEach() cleanup where needed
  - Verify all tests pass for each file

- [ ] **T032** [US3] Run full test suite to verify User Story 3 completion
  - Execute: `pnpm test`
  - Verify: All 1462 tests pass
  - Verify: No state leakage between tests (run tests multiple times to check for flakiness)
  - Review: Test output for consistent patterns

- [ ] **T033** [US3] Run code quality checks for User Story 3
  - Execute: `pnpm run check`
  - Execute: `pnpm run typecheck`
  - Verify: 0 errors, 0 warnings

**Checkpoint**: User Story 3 complete - Lifecycle hooks standardized across 10-15 test files, documentation in place

---

## Phase 6: User Story 4 - Parameterized Tests with test.each() (Priority: P2)

**Goal**: Convert 5-10 loop-based tests to test.each() for better failure diagnostics

**Independent Test**: Convert 2-3 loop tests, verify test output shows individual scenario names with clear failure messages

### Implementation for User Story 4

- [ ] **T034** [US4] Convert provider validation loop to test.each() in `packages/language/src/__tests__/validation.spec.ts`
  - Identify loop-based test for timeline provider validation (video, audio, raf, custom)
  - Convert to test.each() format:
    ```typescript
    test.each([
      { provider: 'video', needsSource: true, description: 'video provider with source' },
      { provider: 'audio', needsSource: true, description: 'audio provider with source' },
      { provider: 'raf', needsSource: false, description: 'raf provider without source' },
      { provider: 'custom', needsSource: false, description: 'custom provider without source' },
    ])('should accept $provider provider', async ({ provider, needsSource }) => {
      // Test logic using provider and needsSource
    });
    ```
  - Verify test output shows individual scenario names: "✓ should accept video provider"
  - Verify failure messages show specific failing scenario
  - Verify all tests pass

- [ ] **T035** [P] [US4] Convert parameter type validation loops to test.each() in relevant test files
  - Identify 2-3 test files with loop-based parameter type validation
  - Convert loops to test.each() with descriptive scenario names
  - Verify test output clarity improves
  - Verify all tests pass

- [ ] **T036** [P] [US4] Convert operation validation loops to test.each() in relevant test files
  - Identify 2-3 test files with loop-based operation validation
  - Convert loops to test.each()
  - Verify all tests pass

- [ ] **T037** [US4] Run full test suite to verify User Story 4 completion
  - Execute: `pnpm test`
  - Verify: All 1462 tests pass
  - Review: Test output shows individual scenario names (not just "test passed")
  - Verify: Failure messages are more specific and debuggable

- [ ] **T038** [US4] Run code quality checks for User Story 4
  - Execute: `pnpm run check`
  - Execute: `pnpm run typecheck`
  - Verify: 0 errors, 0 warnings

**Checkpoint**: User Story 4 complete - 5-10 loop tests converted to test.each(), improved test output diagnostics

---

## Phase 7: User Story 5 - Diagnostic Severity Constants (Priority: P3)

**Goal**: Replace magic numbers with DiagnosticSeverity enum for better code readability

**Independent Test**: DiagnosticSeverity enum already defined in T001. Update 5-10 test files to use constants, verify all tests pass.

### Implementation for User Story 5

**Note**: DiagnosticSeverity enum was already implemented in T001 (Phase 2). This phase focuses on adoption.

- [ ] **T039** [P] [US5] Update test files to use DiagnosticSeverity enum
  - Files already refactored in previous phases automatically use the enum via getErrors()/getWarnings() helpers
  - Identify any remaining test files using magic numbers (severity === 1, severity === 2)
  - Replace with DiagnosticSeverity.Error and DiagnosticSeverity.Warning
  - Update 5-10 test files total
  - Verify all tests pass

- [ ] **T040** [US5] Run full test suite to verify User Story 5 completion
  - Execute: `pnpm test`
  - Verify: All 1462 tests pass
  - Execute: `grep -r "severity === 1" packages/language/src/__tests__/ | wc -l`
  - Execute: `grep -r "severity === 2" packages/language/src/__tests__/ | wc -l`
  - Verify: Significant reduction in magic number usage

- [ ] **T041** [US5] Run code quality checks for User Story 5
  - Execute: `pnpm run check`
  - Execute: `pnpm run typecheck`
  - Verify: 0 errors, 0 warnings

**Checkpoint**: User Story 5 complete - Magic numbers replaced with DiagnosticSeverity constants, improved code readability

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, coverage verification, documentation updates

- [ ] **T042** [P] Run comprehensive test suite validation
  - Execute: `pnpm test` (verify all 1462 tests pass)
  - Execute: `pnpm run test:coverage` (verify coverage ≥ 81.72%)
  - Verify: No test regressions (all tests produce identical results to baseline)
  - Verify: Test suite runtime ≤ 10 seconds (current: ~8 seconds)

- [ ] **T043** [P] Measure code reduction achieved
  - Execute: `git diff --stat` to count lines changed
  - Verify: ≥400 lines reduced from service initialization (SC-001)
  - Verify: ≥150 lines reduced from CSS registry setup (SC-003)
  - Execute: `grep -r "createEligianServices" packages/language/src/__tests__/ | wc -l`
  - Verify: Significant reduction in boilerplate

- [ ] **T044** [P] Run final code quality checks
  - Execute: `pnpm run check` (Biome formatting and linting)
  - Fix any remaining issues
  - Execute: `pnpm run typecheck` (TypeScript type checking)
  - Verify: 0 errors, 0 warnings (except acceptable warnings)

- [ ] **T045** Update CLAUDE.md with test helper documentation (if applicable)
  - Add reference to test-helpers.ts in Testing Strategy section
  - Document best practices for using createTestContext()
  - Link to quickstart.md for full guide
  - Update testing workflow section

- [ ] **T046** Validate quickstart.md examples
  - Review all code examples in quickstart.md
  - Verify examples match actual test-helpers.ts API
  - Verify import paths are correct
  - Test code examples work as documented

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: SKIPPED - No setup needed
- **Foundational (Phase 2)**: T001 - Creates test-helpers.ts module structure - BLOCKS all user stories
- **User Story 1 (Phase 3 - P1)**: Depends on Foundational (T001) - Can start after T001 completes
- **User Story 2 (Phase 4 - P1)**: Depends on Foundational (T001) - Can start after T001 completes - Independent of US1
- **User Story 3 (Phase 5 - P2)**: Can start after US1 or US2 (benefits from refactored test files)
- **User Story 4 (Phase 6 - P2)**: Can start after US1 (benefits from refactored test files)
- **User Story 5 (Phase 7 - P3)**: Already partially implemented in T001 - Just needs adoption
- **Polish (Phase 8)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Depends on T001 (test-helpers.ts structure) - No dependencies on other stories
- **User Story 2 (P1)**: Depends on T001 (test-helpers.ts structure) - Independent of US1 (can run in parallel with US1)
- **User Story 3 (P2)**: Benefits from US1 refactored files but can be implemented independently
- **User Story 4 (P2)**: Benefits from US1 refactored files but can be implemented independently
- **User Story 5 (P3)**: Enum already defined in T001 - Just needs adoption in test files

### Within Each User Story

**User Story 1**:
- T002, T003, T004 (implement helpers) can run in parallel [P]
- T005 (refactor validation.spec.ts) depends on T002-T004
- T006 (refactor parsing.spec.ts) depends on T002-T004
- T007-T011 (refactor typir test files) can run in parallel after T002-T004 [P]
- T012 (validation) runs after all refactoring
- T013 (code quality) runs after T012

**User Story 2**:
- T014 (define CSS_FIXTURES) runs first [P]
- T015 (implement setupCSSRegistry) depends on T014
- T016-T022 (refactor CSS test files) can run in parallel after T015 [P]
- T023 (validation) runs after all refactoring
- T024 (code quality) runs after T023

**User Story 3**:
- T025 (document patterns) runs first
- T026-T031 (standardize hooks in test files) can all run in parallel [P]
- T032 (validation) runs after all refactoring
- T033 (code quality) runs after T032

**User Story 4**:
- T034, T035, T036 (convert loops to test.each) can run in parallel [P]
- T037 (validation) runs after all conversions
- T038 (code quality) runs after T037

**User Story 5**:
- T039 (update test files) runs first [P]
- T040 (validation) runs after updates
- T041 (code quality) runs after T040

**Polish Phase**:
- T042, T043, T044, T045, T046 can all run in parallel [P]

### Parallel Opportunities

**After T001 completes (Foundational phase)**:
- User Story 1 (T002-T011) can start
- User Story 2 (T014-T022) can start in parallel with US1
- These two P1 stories can be worked on simultaneously by different developers

**Within User Story 1**:
- T002, T003, T004 (implement helpers) [P]
- T007, T008, T009, T010, T011 (refactor typir files) [P]

**Within User Story 2**:
- T016, T017, T018, T019, T020, T021, T022 (refactor CSS files) [P]

**Within User Story 3**:
- T026, T027, T028, T029, T030, T031 (standardize hooks) [P]

**Within User Story 4**:
- T034, T035, T036 (convert loops) [P]

**Polish Phase**:
- T042, T043, T044, T045, T046 (all final checks) [P]

---

## Parallel Example: User Story 1 (P1)

```bash
# After T001 completes, launch helper implementation in parallel:
Task: "Implement createTestContext() function in test-helpers.ts"
Task: "Implement getErrors() helper function in test-helpers.ts"
Task: "Implement getWarnings() helper function in test-helpers.ts"

# After helpers complete, launch test file refactoring in parallel:
Task: "Refactor packages/language/src/__tests__/typir-import-validation.spec.ts"
Task: "Refactor packages/language/src/__tests__/typir-constant-validation.spec.ts"
Task: "Refactor packages/language/src/__tests__/typir-event-validation.spec.ts"
Task: "Refactor packages/language/src/__tests__/typir-control-flow-validation.spec.ts"
Task: "Refactor packages/language/src/__tests__/typir-timeline-validation.spec.ts"
```

---

## Parallel Example: User Story 2 (P1)

```bash
# After T001 and T014-T015 complete, launch CSS file refactoring in parallel:
Task: "Refactor packages/language/src/__tests__/css-classname-validation/valid-classname.spec.ts"
Task: "Refactor packages/language/src/__tests__/css-classname-validation/unknown-classname.spec.ts"
Task: "Refactor packages/language/src/__tests__/css-selector-validation/valid-selector.spec.ts"
Task: "Refactor packages/language/src/__tests__/css-selector-validation/unknown-selector.spec.ts"
Task: "Refactor packages/language/src/__tests__/css-selector-validation/invalid-syntax.spec.ts"
Task: "Refactor packages/language/src/__tests__/css-hot-reload/css-registry-update.spec.ts"
Task: "Refactor packages/language/src/__tests__/css-invalid-file/invalid-css.spec.ts"
```

---

## Implementation Strategy

### MVP Scope (Minimum Viable Product)

**MVP = User Story 1 (P1) Only**: Shared Test Utilities

**Rationale**: US1 provides the foundation (test-helpers.ts module) and delivers immediate value by eliminating ~400 lines of service initialization duplication across 7 high-traffic test files. This is independently testable and deployable.

**MVP Deliverables**:
- test-helpers.ts with createTestContext(), parseAndValidate(), getErrors(), getWarnings()
- 7 refactored test files (validation.spec.ts, parsing.spec.ts, 5 typir test files)
- All 1462 tests passing
- ~400 lines of code reduced
- Zero test regressions

### Incremental Delivery

**Iteration 1 (MVP)**: User Story 1 (P1) - Weeks 1-2
- T001-T013: Create shared utilities, refactor 7 core test files
- Deliverable: Functional test helpers, immediate code reduction

**Iteration 2**: User Story 2 (P1) - Week 2
- T014-T024: Add CSS fixtures, refactor 7 CSS test files
- Deliverable: CSS test simplification, ~150 more lines reduced
- Can run in parallel with Iteration 1 if team capacity allows

**Iteration 3**: User Story 3 (P2) - Week 3
- T025-T033: Standardize lifecycle hooks across 10-15 files
- Deliverable: Improved test consistency, documentation

**Iteration 4**: User Story 4 (P2) - Week 3
- T034-T038: Convert 5-10 loops to test.each()
- Deliverable: Better test diagnostics
- Can run in parallel with Iteration 3 if team capacity allows

**Iteration 5**: User Story 5 (P3) - Week 4
- T039-T041: Adopt DiagnosticSeverity constants
- Deliverable: Improved code readability

**Final**: Polish - Week 4
- T042-T046: Validation, measurement, documentation
- Deliverable: Complete refactoring with metrics

### Success Metrics

**After MVP (User Story 1)**:
- ✅ test-helpers.ts module exists and works
- ✅ 7 test files refactored
- ✅ ~400 lines reduced
- ✅ All 1462 tests pass
- ✅ Zero performance regression (≤10s runtime)
- ✅ Coverage maintained (≥81.72%)

**After All User Stories**:
- ✅ ~550 total lines reduced
- ✅ 24+ test files refactored
- ✅ Consistent patterns across test suite
- ✅ Better test diagnostics with test.each()
- ✅ Improved code readability with constants

---

## Total Task Count: 46 tasks

**By User Story**:
- Foundational (Phase 2): 1 task (T001)
- User Story 1 (P1): 12 tasks (T002-T013)
- User Story 2 (P1): 11 tasks (T014-T024)
- User Story 3 (P2): 9 tasks (T025-T033)
- User Story 4 (P2): 5 tasks (T034-T038)
- User Story 5 (P3): 3 tasks (T039-T041)
- Polish: 5 tasks (T042-T046)

**Parallel Opportunities Identified**: 28 tasks marked [P] can run in parallel within their phases

**Independent Test Criteria**:
- US1: Create helpers, refactor 2-3 files, all tests pass ✅
- US2: Define fixtures, refactor 2-3 CSS files, all tests pass ✅
- US3: Standardize hooks in 5-10 files, no state leakage ✅
- US4: Convert 2-3 loops, test output shows scenarios ✅
- US5: Update 5-10 files with constants, all tests pass ✅

**Suggested MVP Scope**: User Story 1 only (T001-T013) = 13 tasks, ~400 lines saved, immediate value

---

**End of Tasks Document**
