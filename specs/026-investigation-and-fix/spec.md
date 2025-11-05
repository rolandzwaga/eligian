# Feature Specification: Import Resolution Failures in Multi-File Test Scenarios

**Feature Branch**: `026-investigation-and-fix`
**Created**: 2025-11-05
**Status**: Draft
**Input**: User description: "Investigation and fix for import resolution failures in multi-file test scenarios"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Root Cause Analysis (Priority: P1)

Developers working on the Eligian test suite need to understand why `createLibraryDocument()` successfully resolves imported actions while `setupDocuments()` fails, even though both helpers appear to perform similar document creation and workspace registration operations.

**Why this priority**: Without understanding the root cause, any attempted fix risks being incomplete or introducing new issues. This is the foundational investigation that enables all subsequent work.

**Independent Test**: Can be fully tested by creating minimal reproduction cases using both helpers and comparing document state, workspace registration, and import resolution behavior at each step of the process.

**Acceptance Scenarios**:

1. **Given** the codebase contains both `createLibraryDocument()` and `setupDocuments()` helpers, **When** a developer traces the execution path of both helpers with library imports, **Then** the exact differences in document registration, workspace state, and validation timing are identified and documented
2. **Given** a simple test case with one library file defining `fadeIn` and one main file importing it, **When** the test is run using `createLibraryDocument()`, **Then** the imported action is resolved successfully
3. **Given** the same test case, **When** run using `setupDocuments()`, **Then** the failure point (validator unable to find imported action) is identified with specific details about workspace state at validation time
4. **Given** the scope provider's `getImportedActions()` method, **When** its execution is traced during both successful and failed test scenarios, **Then** the conditions causing it to fail are identified (e.g., document not yet in workspace, parse result incomplete, wrong timing)

---

### User Story 2 - Fix Implementation (Priority: P2)

Developers need `setupDocuments()` to correctly enable cross-file action imports so that all import-related tests can use a consistent, reliable helper function without needing to understand complex Langium internals.

**Why this priority**: Once the root cause is understood (P1), implementing the fix is straightforward but critical for test suite maintainability. This enables developers to write multi-file tests without worrying about import resolution failures.

**Independent Test**: Can be fully tested by running the 3 currently-skipped tests in `operation-validation.spec.ts` after applying the fix - they should pass without modification to the test code itself.

**Acceptance Scenarios**:

1. **Given** the root cause is identified and documented, **When** the necessary changes to `setupDocuments()` are implemented (e.g., ensuring documents are registered in workspace before building, correct build order, proper validation timing), **Then** the helper successfully resolves imported actions across files
2. **Given** the 3 skipped tests in `operation-validation.spec.ts`, **When** they are un-skipped and run with the fixed `setupDocuments()`, **Then** all 3 tests pass with zero errors
3. **Given** the existing 16 passing tests in `import-validation.spec.ts`, **When** they are run after the fix, **Then** all tests continue to pass (regression check)
4. **Given** a new test case with multiple library files and complex import chains, **When** created using `setupDocuments()`, **Then** all imports resolve correctly and validation passes

---

### User Story 3 - Test Environment Documentation (Priority: P3)

Developers writing new integration tests need comprehensive documentation explaining how the Eligian test environment works, including document lifecycle, workspace management, helper function usage, and common pitfalls.

**Why this priority**: This prevents future developers from encountering the same issues and reduces debugging time. While important for long-term maintainability, it depends on completing the investigation (P1) and fix (P2).

**Independent Test**: Can be fully tested by having a developer unfamiliar with the test infrastructure read the documentation and successfully write a multi-file integration test without requiring assistance.

**Acceptance Scenarios**:

1. **Given** the investigation findings and fix details, **When** comprehensive documentation is written covering test environment architecture, **Then** the documentation includes: Langium document lifecycle, workspace registration mechanics, helper function comparison (`createTestContext`, `createTestContextWithMockFS`, `createLibraryDocument`, `setupDocuments`), when to use each helper, common pitfalls, and troubleshooting guide
2. **Given** the documentation file, **When** it is saved to `specs/test-environment-guide.md` in the project root, **Then** it is accessible to all developers and can be referenced in code reviews and onboarding materials
3. **Given** the test-helpers.ts file, **When** JSDoc comments are updated to reference the comprehensive guide, **Then** developers using IDE autocomplete get direct pointers to the full documentation
4. **Given** a new developer reading the documentation, **When** they create their first multi-file integration test following the documented patterns, **Then** their test works correctly on the first attempt without needing to debug import resolution issues

---

### Edge Cases

- What happens when `setupDocuments()` is called with an empty array of documents?
- How does the system handle circular imports between library files during testing?
- What happens if documents are added to the workspace out of dependency order (dependent file before library file)?
- How does `setupDocuments()` behave when the mock file system is not initialized (EmptyFileSystem vs MockFileSystem)?
- What happens when a document is parsed successfully but fails validation - is it still available for import resolution?
- How does the scope provider handle imported actions when the library document has parse errors?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Investigation MUST identify the specific differences in execution flow between `createLibraryDocument()` and `setupDocuments()` that cause import resolution to succeed in one case but fail in the other
- **FR-002**: Investigation MUST trace the scope provider's `getImportedActions()` method execution during both successful and failed scenarios to pinpoint where imported action lookup fails
- **FR-003**: Investigation MUST determine whether the issue is related to workspace registration timing, document build order, validation lifecycle, or scope provider implementation
- **FR-004**: Fix MUST enable `setupDocuments()` to correctly resolve imported actions across multiple files without breaking existing test functionality
- **FR-005**: Fix MUST allow the 3 currently-skipped tests in `operation-validation.spec.ts` to pass when un-skipped, without requiring changes to the test code itself
- **FR-006**: Fix MUST maintain backward compatibility with all existing tests that use `setupDocuments()` (currently Feature 025 tests)
- **FR-007**: Fix MUST NOT require changes to production code (validator, scope provider, etc.) - this is a test infrastructure issue only
- **FR-008**: Documentation MUST explain the Langium document lifecycle in the context of Eligian testing (parsing, workspace registration, building, validation, cross-reference resolution)
- **FR-009**: Documentation MUST provide clear guidance on when to use each test helper function (`createTestContext`, `createTestContextWithMockFS`, `createLibraryDocument`, `setupDocuments`)
- **FR-010**: Documentation MUST include troubleshooting guidance for common import resolution failures in tests
- **FR-011**: Documentation MUST be saved to `specs/test-environment-guide.md` and referenced from `test-helpers.ts` JSDoc comments
- **FR-012**: All fixes and documentation MUST be validated by running the full test suite and confirming no regressions

### Key Entities

- **Test Helper Function**: Utility function in `test-helpers.ts` that provides infrastructure for test setup (e.g., `createTestContext`, `setupDocuments`, `createLibraryDocument`)
- **Langium Document**: Represents a parsed `.eligian` file with URI, parse result, diagnostics, and metadata - managed by Langium framework
- **Workspace**: Langium service that maintains a registry of all active documents and enables cross-document reference resolution
- **Document Builder**: Langium service that processes documents to resolve cross-references and trigger validation
- **Scope Provider**: Langium service that resolves symbol references (e.g., finding imported actions when validating action calls)
- **Mock File System**: In-memory file system implementation used in tests to simulate file I/O operations without touching the real filesystem
- **Import Resolution**: Process by which the scope provider finds action definitions from imported library files during validation

### Assumptions

- **A-001**: The Langium framework's document parsing and workspace management are functioning correctly (the issue is in test helper usage, not Langium core)
- **A-002**: The production validator and scope provider correctly resolve imports when documents are properly registered (evidenced by 16 passing import-validation tests)
- **A-003**: `createLibraryDocument()` represents the correct pattern for multi-file test setup, and `setupDocuments()` needs to align with this pattern
- **A-004**: Mock file system is properly initialized in test contexts where it's required (contexts created with `createTestContextWithMockFS()`)
- **A-005**: The fix will not require changes to how tests structure their Eligian code (only changes to test infrastructure helpers)

### Dependencies

- **D-001**: Langium framework (version as specified in package.json) - provides document parsing, workspace management, and cross-reference resolution
- **D-002**: Vitest testing framework - used for all test execution and assertions
- **D-003**: Existing test suite (1483+ tests) - must continue passing after fix to validate no regressions
- **D-004**: Feature 025 implementation - introduced `setupDocuments()` helper that this feature fixes
- **D-005**: Feature 023 implementation - library import functionality that tests are validating

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Root cause of import resolution failure is identified and documented with specific evidence (code paths, timing diagrams, workspace state comparisons)
- **SC-002**: All 3 currently-skipped tests in `operation-validation.spec.ts` pass without modification after the fix is applied
- **SC-003**: All existing tests (1483+ tests) continue to pass after the fix, with zero regressions
- **SC-004**: Test environment documentation is complete and comprehensive (minimum 2000 words covering all required topics from FR-008 through FR-011)
- **SC-005**: Documentation usability is validated by having at least one developer unfamiliar with the test infrastructure successfully write a multi-file test following the guide
- **SC-006**: Fix implementation requires changes only to test infrastructure code, not production validation or language service code
- **SC-007**: `setupDocuments()` helper works consistently for both simple two-file scenarios (library + main) and complex multi-library scenarios with transitive imports

### Qualitative Outcomes

- **QC-001**: Developers express confidence in writing multi-file integration tests without fear of encountering mysterious import resolution failures
- **QC-002**: Code review feedback decreases for import-related test setup issues
- **QC-003**: Onboarding time for new developers working on test infrastructure is reduced due to comprehensive documentation
