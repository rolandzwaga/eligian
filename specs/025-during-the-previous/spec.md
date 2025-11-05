# Feature Specification: Multi-File Test Infrastructure for Library Imports

**Feature Branch**: `025-during-the-previous`
**Created**: 2025-01-05
**Status**: Draft
**Input**: User description: "during the previous spec implementation you came to the conclusion that there isn't a sufficient test harness available to create integration tests that use eligian imports. Create a spec that describes how to augment the existing test helpers to make this possible."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create Library Files in Test Workspace (Priority: P1)

As a test author, I need to create library files in the test workspace so that I can test import statements and imported action validation in integration tests.

**Why this priority**: This is the foundational capability that unblocks all import-related testing. Without the ability to create library files in test scenarios, we cannot write integration tests for any import functionality (validation, completion, hover, etc.). This was the blocker discovered in Feature 024 where tests T003-T005 had to be skipped.

**Independent Test**: Can be fully tested by creating a test that registers a library file with action definitions, imports it in a main file, and verifies the library document is accessible in the workspace. This delivers immediate value by enabling basic multi-file test scenarios.

**Acceptance Scenarios**:

1. **Given** I am writing an integration test for import validation
   **When** I call a helper method to create a library file with action definitions
   **Then** the library file is registered in the Langium workspace and accessible by URI

2. **Given** I have created a library file in the test workspace
   **When** I parse a main file that imports from that library
   **Then** the import resolution finds the library document without errors

3. **Given** I need to test multiple library files
   **When** I create several library files with different names
   **Then** each library file is independently registered and resolvable

---

### User Story 2 - Test Imported Action Validation (Priority: P2)

As a test author, I need to verify that imported actions validate correctly in operation calls so that I can ensure the validator properly recognizes imported actions and catches typos or undefined action names.

**Why this priority**: This is the primary use case that motivated this feature - validating imported actions in integration tests. Feature 024 fixed the validator but couldn't test it end-to-end. This story enables comprehensive validation testing of imports.

**Independent Test**: Can be tested by creating a library file with specific actions, importing them in a main file, calling them in action bodies, and verifying zero validation errors for valid calls and appropriate errors for invalid calls.

**Acceptance Scenarios**:

1. **Given** a library file contains action `fadeIn(selector: string, duration: number)`
   **When** I import `fadeIn` and call it with valid parameters in an action body
   **Then** the validator reports zero errors for the import and the call

2. **Given** a library file contains action `fadeIn`
   **When** I import `fadeIn` but call `fadein` (typo with lowercase 'i')
   **Then** the validator reports an "unknown operation" error with suggestions

3. **Given** a library file contains multiple actions
   **When** I import and use several of them in the same action body
   **Then** the validator correctly validates each imported action call

4. **Given** I import an action from a library
   **When** I mix imported action calls with built-in operation calls
   **Then** the validator correctly distinguishes between both types

---

### User Story 3 - Test Code Completion for Imports (Priority: P3)

As a test author, I need to verify that code completion suggests imported actions so that I can ensure the IDE experience works correctly for library imports.

**Why this priority**: This enhances the developer experience but is not critical for core functionality. Code completion already works in production (Feature 023 US4), but we need integration tests to prevent regressions.

**Independent Test**: Can be tested by creating a library file with actions, importing them, triggering completion at various cursor positions, and verifying imported actions appear in the completion list with correct signatures.

**Acceptance Scenarios**:

1. **Given** I have imported action `fadeIn` from a library
   **When** I trigger code completion inside an action body
   **Then** the completion list includes `fadeIn` with its parameter signature

2. **Given** I have imported multiple actions from different libraries
   **When** I trigger code completion
   **Then** all imported actions are available alongside built-in operations

3. **Given** I have not yet imported any actions
   **When** I trigger code completion
   **Then** only built-in operations and local actions appear (no library actions)

---

### Edge Cases

- What happens when a library file contains syntax errors? (Should the main file's validation still complete without crashing)
- How does the test infrastructure handle circular imports where File A imports from File B which imports from File A?
- What happens when importing from a library that doesn't exist in the test workspace?
- How does the system handle multiple test files creating libraries with the same URI?
- What happens when a test creates a library file, runs validation, then modifies the library content?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Test helpers MUST provide a method to create library files in the Langium test workspace
- **FR-002**: Test helpers MUST register library documents with unique URIs to avoid collisions between tests
- **FR-003**: Test helpers MUST allow specifying library file content including library name and action definitions
- **FR-004**: Test helpers MUST ensure library documents are fully parsed and indexed before returning control to the test
- **FR-005**: Test helpers MUST support creating multiple library files in a single test scenario
- **FR-006**: Test infrastructure MUST provide helper methods that combine library creation with main file parsing for common test patterns
- **FR-007**: Test helpers MUST clean up library documents after each test to prevent cross-test contamination
- **FR-008**: Test infrastructure MUST support updating library file content during a test to enable hot-reload testing scenarios

### Key Entities

- **Library Document**: Represents a `.eligian` library file registered in the Langium workspace, containing a library name and action definitions
- **Test Context**: The test environment including Langium services, document builder, and workspace management
- **Library URI**: Unique identifier for library files in the test workspace (e.g., `file:///test-libs/animations.eligian`)
- **Import Statement**: DSL construct that references a library file and specifies which actions to import

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Test authors can create library files and test import scenarios in under 5 lines of test code
- **SC-002**: Integration tests for imported action validation pass without requiring manual file creation in the workspace
- **SC-003**: Test suite includes 100% coverage of import validation scenarios (valid imports, typos, multiple imports, mixed with operations)
- **SC-004**: Test infrastructure supports creating up to 10 library files per test without performance degradation (tests complete in under 500ms)
- **SC-005**: Zero test isolation failures caused by library document leakage between tests
- **SC-006**: Test authors can verify code completion suggestions for imported actions in integration tests

## Assumptions

- The existing `TestContext` helper from Feature 022 is the correct foundation for extension
- Library files created in tests do not need to persist beyond the test execution
- Test library URIs should use a conventional prefix (e.g., `file:///test-libs/`) to distinguish from real files
- Langium's `LangiumDocuments` service can register documents programmatically without physical files
- The test infrastructure will use the same workspace instance across library creation and main file parsing
- Library files in tests should use simplified content (minimal valid library syntax) unless specific syntax is being tested

## Out of Scope

- Testing import scenarios that require real file system access
- Performance testing with hundreds of library files (limit to 10 per test)
- Testing library files in different packages or workspaces (single workspace only)
- Integration with VS Code extension APIs for import path completion (that's a separate feature)
- Testing library file hot-reload in the actual VS Code extension (this is about test infrastructure only)
