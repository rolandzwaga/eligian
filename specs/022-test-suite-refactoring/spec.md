# Feature Specification: Test Suite Refactoring - Reduce Duplication and Improve Maintainability

**Feature Branch**: `022-test-suite-refactoring`
**Created**: 2025-11-02
**Status**: Draft
**Input**: User description: "Test Suite Refactoring - Reduce Duplication and Improve Maintainability"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Shared Test Utilities (Priority: P1)

**As a** developer writing new tests,
**I want** to use shared test helpers that handle common setup tasks,
**So that** I can focus on writing test logic without repeating boilerplate code.

**Why this priority**: This is the foundation for all other improvements. Eliminates ~400 lines of duplicated service initialization code across 40+ test files. Provides immediate ROI and improves consistency for all future test development.

**Independent Test**: Can be fully tested by creating test-helpers.ts with core utilities (createTestContext, setupCSSRegistry), updating 2-3 test files to use the new helpers, and verifying all tests pass with identical behavior.

**Acceptance Scenarios**:

1. **Given** a new test file needs Eligian service initialization, **When** developer imports `createTestContext()` from test-helpers.ts, **Then** services and parse helpers are configured correctly without manual setup
2. **Given** a test requires CSS validation, **When** developer calls `setupCSSRegistry()` with fixture data, **Then** CSS registry is populated without verbose boilerplate
3. **Given** a test needs to parse and validate Eligian code, **When** developer calls `ctx.parseAndValidate(code)`, **Then** document is parsed, validated, and results include typed diagnostics (errors, warnings) without manual filtering
4. **Given** multiple test files use shared utilities, **When** a change is needed to setup logic, **Then** only test-helpers.ts needs updating (not 40+ files)

---

### User Story 2 - CSS Registry Test Fixtures (Priority: P1)

**As a** developer writing CSS validation tests,
**I want** to use predefined CSS fixture sets (common, timeline, etc.),
**So that** I don't have to manually create CSS registry data structures for each test.

**Why this priority**: Eliminates ~150 lines of CSS registry boilerplate across 24 test files. Provides consistency in test data and makes CSS validation tests easier to read and maintain.

**Independent Test**: Can be fully tested by defining CSS_FIXTURES constant with common test data, updating 2-3 CSS validation test files to use fixtures, and verifying all tests pass with correct CSS validation behavior.

**Acceptance Scenarios**:

1. **Given** a test needs common CSS classes (button, primary, active), **When** developer calls `setupCSSRegistry(ctx, uri, CSS_FIXTURES.common)`, **Then** registry is populated with standard class set without manual definition
2. **Given** a test needs timeline-specific CSS classes, **When** developer calls `setupCSSRegistry(ctx, uri, CSS_FIXTURES.timeline)`, **Then** registry is populated with timeline class set
3. **Given** a test needs custom CSS classes, **When** developer calls `setupCSSRegistry(ctx, uri, { classes: ['custom'] })`, **Then** registry is populated with custom classes only
4. **Given** multiple tests use the same fixture, **When** fixture definition needs updating, **Then** only CSS_FIXTURES constant needs changing (not 24+ test files)

---

### User Story 3 - Standardized Lifecycle Hooks (Priority: P2)

**As a** developer maintaining tests,
**I want** consistent patterns for test setup and teardown across all test files,
**So that** test isolation and state management is predictable and debuggable.

**Why this priority**: Improves test reliability and reduces flaky tests caused by state leakage. Medium priority because current tests mostly work, but inconsistencies cause occasional debugging pain.

**Independent Test**: Can be fully tested by documenting lifecycle hook patterns (beforeAll for expensive setup, beforeEach for test isolation, afterEach for cleanup), updating 5-10 test files to follow patterns, and verifying no state leakage between tests.

**Acceptance Scenarios**:

1. **Given** a test suite needs expensive setup (service initialization), **When** developer uses `beforeAll()` hook, **Then** setup runs once per suite (not per test)
2. **Given** a test suite needs per-test isolation (CSS registry state), **When** developer uses `beforeEach()` and `afterEach()` hooks, **Then** each test starts with clean state
3. **Given** a test suite uses mocks or spies, **When** developer uses `afterEach(() => vi.restoreAllMocks())`, **Then** mocks are cleaned up between tests
4. **Given** a new developer reads test files, **When** they see lifecycle hook usage, **Then** patterns are consistent and match documented best practices

---

### User Story 4 - Parameterized Tests with test.each() (Priority: P2)

**As a** developer writing tests for multiple similar scenarios (e.g., testing 4 timeline providers),
**I want** to use Vitest's `test.each()` instead of manual loops,
**So that** test failures show which specific scenario failed with clear diagnostics.

**Why this priority**: Improves debuggability and test clarity. Medium priority because current loop-based tests work but produce unclear failures when one scenario breaks.

**Independent Test**: Can be fully tested by converting 2-3 loop-based tests to test.each(), running test suite, and verifying test output shows individual scenario results with clear failure messages.

**Acceptance Scenarios**:

1. **Given** a test validates 4 timeline providers (video, audio, raf, custom), **When** test uses `test.each([...])` with provider data, **Then** each provider appears as separate test case in output
2. **Given** one provider fails validation, **When** test runs, **Then** failure message shows which provider failed (e.g., "should accept video provider")
3. **Given** a developer sees test output, **When** reviewing passing tests, **Then** output shows "✓ should accept video provider", "✓ should accept audio provider" (not just "✓ test passed")
4. **Given** tests run in parallel, **When** using test.each(), **Then** Vitest can run each parameterized test concurrently for faster execution

---

### User Story 5 - Diagnostic Severity Constants (Priority: P3)

**As a** developer writing validation tests,
**I want** to use named constants for diagnostic severity levels (Error, Warning),
**So that** I don't have to remember magic numbers (1, 2) and code is self-documenting.

**Why this priority**: Improves code readability and reduces errors from using wrong severity numbers. Low priority because it's cosmetic - current code works but is less readable.

**Independent Test**: Can be fully tested by defining DiagnosticSeverity enum, adding getErrors()/getWarnings() helper functions, updating 5-10 test files to use constants, and verifying all tests pass with correct filtering.

**Acceptance Scenarios**:

1. **Given** a test needs to filter errors, **When** developer uses `getErrors(document)` helper, **Then** only errors (severity 1) are returned
2. **Given** a test needs to filter warnings, **When** developer uses `getWarnings(document)` helper, **Then** only warnings (severity 2) are returned
3. **Given** a developer reads test code, **When** seeing `severity === DiagnosticSeverity.Error`, **Then** intent is immediately clear (vs `severity === 1`)
4. **Given** Langium changes diagnostic severity values, **When** enum is updated in one place, **Then** all tests continue working without scattered updates

---

### Edge Cases

- **Empty test suite**: What happens when test file imports helpers but has no tests? (Should work without errors - helpers are pure utilities)
- **Nested CSS fixtures**: What happens when test needs to merge multiple CSS fixtures? (Should support `{ ...CSS_FIXTURES.common, classes: [...CSS_FIXTURES.common.classes, 'extra'] }` pattern)
- **Parallel test execution**: Do shared test utilities work correctly when multiple tests run concurrently? (Yes - each test gets independent service instance via createTestContext())
- **Test file without CSS**: What happens when test file uses createTestContext() but doesn't need CSS validation? (Should work fine - CSS registry setup is optional)
- **Legacy test migration**: Can old tests and new helper-based tests coexist during gradual migration? (Yes - helpers are additive, old patterns still work)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Test helper module MUST provide `createTestContext()` function that returns services, parse helper, and parseAndValidate helper in a single call
- **FR-002**: Test helper module MUST provide `setupCSSRegistry()` function that accepts TestContext, CSS file URI, and fixture data to populate registry
- **FR-003**: Test helper module MUST provide predefined CSS fixtures (CSS_FIXTURES.common, CSS_FIXTURES.timeline) with standard class/ID sets
- **FR-004**: Test helper module MUST provide `DiagnosticSeverity` enum with Error, Warning, Information, Hint values matching Langium LSP protocol
- **FR-005**: Test helper module MUST provide `getErrors()` and `getWarnings()` functions that filter diagnostics by severity
- **FR-006**: `parseAndValidate()` helper MUST return ValidationResult object with document, program, diagnostics, errors, and warnings fields
- **FR-007**: All test files using shared helpers MUST produce identical test results compared to pre-refactor baseline
- **FR-008**: Refactored tests MUST maintain 81.72%+ code coverage (no regression)
- **FR-009**: Test suite MUST complete in ≤10 seconds after refactoring (no performance regression)
- **FR-010**: Loop-based tests converted to test.each() MUST show individual scenario names in test output
- **FR-011**: Lifecycle hook patterns MUST be documented in inline comments for developer guidance
- **FR-012**: CSS registry cleanup MUST happen in afterEach() hooks to prevent state leakage between tests

### Key Entities *(include if feature involves data)*

- **TestContext**: Container for test infrastructure
  - services: ReturnType<typeof createEligianServices> - Language services instance
  - parse: ReturnType<typeof parseHelper<Program>> - Langium parse helper
  - parseAndValidate: (code: string) => Promise<ValidationResult> - Combined parse+validate helper

- **ValidationResult**: Structured validation output
  - document: LangiumDocument<Program> - Parsed document
  - program: Program - AST root node
  - diagnostics: Diagnostic[] - All diagnostics
  - errors: Diagnostic[] - Error-level diagnostics (severity 1)
  - warnings: Diagnostic[] - Warning-level diagnostics (severity 2)

- **CSSFixture**: CSS test data definition
  - classes?: string[] - CSS class names to register
  - ids?: string[] - CSS ID names to register

- **CSS_FIXTURES**: Predefined CSS test data
  - common: { classes: ['button', 'primary', ...], ids: ['app', 'container', ...] }
  - timeline: { classes: ['test-container', ...], ids: ['test', 'title', ...] }

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Test suite code reduction of ≥400 lines through helper extraction (measured by git diff after Phase 1)
- **SC-002**: Service initialization boilerplate reduced from 40+ instances to 1 shared implementation (measured by grep count)
- **SC-003**: CSS registry setup boilerplate reduced from 24+ instances to predefined fixtures (measured by grep count)
- **SC-004**: New test files can be written 40% faster using helpers (measured by time to add 3 new tests: baseline vs with helpers)
- **SC-005**: Test failures show specific scenario names when using test.each() (measured by test output readability score from developers)
- **SC-006**: Zero test regressions after refactoring (all 1462 tests must pass)
- **SC-007**: Code coverage maintained at ≥81.72% (measured by vitest --coverage)
- **SC-008**: Test suite runtime remains ≤10 seconds (measured by pnpm test execution time)
- **SC-009**: Developer satisfaction improves by ≥30% for test writing tasks (measured by team survey after 2 weeks)
- **SC-010**: Test maintenance time reduces by ≥50% for common changes (measured by time to update setup logic in all tests: before vs after)

## Assumptions *(optional)*

- All tests currently pass and provide correct validation coverage
- Test suite uses Vitest 3.2.4+ and Langium 3.0+ (confirmed in TEST_SUITE_ANALYSIS.md)
- Refactoring will be done incrementally (Phase 1 → Phase 2 → Phase 3) with validation after each phase
- Existing test behavior must be preserved exactly (no functional changes, only structure)
- Developers are familiar with Vitest lifecycle hooks (beforeAll, beforeEach, afterEach)
- Test execution environment supports concurrent test execution (Vitest default)
- CSS registry state can leak between tests if not explicitly cleaned up (requires afterEach hooks)
- Parse helper generic type correctly infers Program type (no explicit type assertions needed)

## Dependencies *(optional)*

- Vitest 3.2.4+ (test framework) - already installed
- Langium 3.0+ (language framework) - already installed
- Langium test utilities (parseHelper, EmptyFileSystem) - already in use
- Existing test infrastructure (services, validators, CSS registry) - no changes needed
- Git (for measuring code reduction via diff) - already available
- TEST_SUITE_ANALYSIS.md (analysis document) - provides baseline metrics and recommendations

## Out of Scope *(optional)*

- Changing test framework (remaining on Vitest)
- Changing test assertion library (remaining on Vitest expect)
- Modifying tested functionality (only refactoring test structure)
- Adding new test coverage (maintaining current 81.72%)
- Performance optimization of tested code (only refactoring tests)
- Refactoring non-language package tests (focus on packages/language/src/__tests__/)
- Creating custom test matchers (deferred to Phase 3, not MVP)
- Adding global test setup file (deferred to Phase 2, not MVP)
- Test documentation (TESTING.md creation deferred to Phase 3)
- Property-based testing (not needed for current test scenarios)

## Non-Functional Requirements *(optional)*

- **NFR-001**: Test helper functions MUST execute in <1ms (negligible overhead)
- **NFR-002**: Test suite MUST maintain <10 second total runtime after refactoring
- **NFR-003**: Test helpers MUST be fully typed (no `any` types) for IDE autocomplete support
- **NFR-004**: Test helpers MUST work with concurrent test execution (thread-safe, no shared mutable state)
- **NFR-005**: Error messages from tests MUST be as clear as before refactoring (no degradation in debuggability)
- **NFR-006**: Refactored tests MUST be readable by developers unfamiliar with codebase (self-documenting)
- **NFR-007**: Test helper module MUST have ESM imports with .js extensions (per project Constitution)
- **NFR-008**: All code changes MUST pass Biome linter with 0 errors (per project Constitution)

## Risks *(optional)*

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Test behavior changes during refactoring | Medium | High | Run full suite after each file refactored, use git diff to verify output |
| Shared helpers introduce coupling | Low | Medium | Keep helpers simple and focused, avoid complex logic in utilities |
| Performance regression from helper overhead | Low | Medium | Benchmark suite before/after each phase, helper calls should be <1ms |
| State leakage from shared services | Medium | High | Use beforeEach/afterEach for cleanup, document isolation patterns |
| Developer resistance to new patterns | Low | Low | Show benefits early (less code, clearer tests), provide migration examples |
| Incomplete migration leaves mixed patterns | Medium | Medium | Prioritize high-traffic files first, document migration strategy |

## Open Questions *(optional)*

*None at this time - all aspects are well-defined based on TEST_SUITE_ANALYSIS.md findings.*
