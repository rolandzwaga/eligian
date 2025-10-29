# Feature Specification: Phase 4 - Validation Pipeline Unification

**Feature Branch**: `019-phase-4-validation`
**Created**: 2025-01-28
**Status**: Draft
**Input**: User description: "Phase 4: Validation Pipeline Unification - Unify the validation pipelines between the IDE/Language Server and the Compiler/CLI to ensure consistent error detection and reporting. Currently, the IDE sometimes shows errors while compilation succeeds due to race conditions in CSS file loading and singleton service state pollution. This feature consolidates validation logic, eliminates timing differences, and ensures 100% behavioral consistency across all tools."

## Context

This is Phase 4 of the Eligian refactoring roadmap, following the successful completion of:
- Phase 1: Shared Utilities Package (Feature 016) - ✅ Complete
- Phase 2: CSS Consolidation (Feature 017) - ✅ Complete
- Phase 3: Error Type Unification (Feature 018) - ✅ Complete

### The Problem

Users report inconsistent error detection between development environments:

**Observed Behavior**:
- Opening a `.eligian` file in VS Code shows validation errors in the Problems panel
- Compiling the same file via CLI succeeds without errors (or vice versa)
- Different files show different validation behavior unpredictably

**Root Causes** (identified via comprehensive codebase analysis):
1. **CSS Loading Race Condition**: Compiler loads CSS files synchronously before validation; IDE loads CSS asynchronously during/after validation
2. **Singleton Service State Pollution**: Compiler reuses Langium service instance across compilations, retaining CSS metadata and document cache
3. **Missing Validation Parity Tests**: No automated verification that IDE and compiler produce identical validation results

### Impact on Users

- **Loss of Trust**: Users cannot rely on IDE diagnostics - "if compilation succeeds, why does IDE show errors?"
- **Wasted Time**: Developers fix errors shown in IDE only to find compilation still fails (or vice versa)
- **Confusion**: No clear understanding of which errors are "real"
- **Workflow Disruption**: Must compile via CLI to verify if IDE errors are legitimate

## User Scenarios & Testing

### User Story 1 - Consistent CSS Validation (Priority: P1)

As a developer writing Eligian timelines with CSS imports, I need CSS class validation to behave identically in VS Code and CLI compilation, so that I can trust IDE error messages and avoid wasted debugging time.

**Why this priority**: This is the **primary reported issue** - CSS validation inconsistencies cause the most confusion and workflow disruption. Fixing this alone delivers immediate value.

**Independent Test**: Create an `.eligian` file importing CSS with invalid class references. Open in VS Code (observe errors), then compile via CLI. Both must show identical errors at identical locations.

**Acceptance Scenarios**:

1. **Given** an `.eligian` file with `styles "./main.css"` and `addClass("invalid-class")`, **When** I open the file in VS Code and compile via CLI, **Then** both show the same "Unknown CSS class: 'invalid-class'" error at the same line/column
2. **Given** an `.eligian` file with valid CSS class usage, **When** I open the file in VS Code and compile via CLI, **Then** neither shows CSS validation errors
3. **Given** CSS file changes while `.eligian` file is open in VS Code, **When** I save CSS file and re-compile via CLI, **Then** both reflect updated CSS class definitions identically

---

### User Story 2 - Isolated Compilation State (Priority: P2)

As a developer compiling multiple `.eligian` files in sequence, I need each compilation to be independent and isolated, so that compilation results are deterministic and don't depend on previous compilations.

**Why this priority**: State pollution causes **unpredictable validation results** - same file may validate differently depending on what was compiled before it. This is less visible than CSS issues but equally important for correctness.

**Independent Test**: Compile two files sequentially (FileA with CSS imports, FileB without). FileB's validation must not be affected by FileA's CSS metadata.

**Acceptance Scenarios**:

1. **Given** two `.eligian` files (FileA importing `styles.css`, FileB with no imports), **When** I compile FileA then FileB via CLI, **Then** FileB validation does not see CSS classes from FileA
2. **Given** a single `.eligian` file, **When** I compile it twice in succession, **Then** both compilations produce identical validation results
3. **Given** compilation with validation errors, **When** I fix errors and re-compile, **Then** previous errors do not persist in validation results

---

### User Story 3 - Validation Parity Assurance (Priority: P3)

As a project maintainer, I need automated tests that verify IDE and compiler validation behavior remains identical, so that future changes don't reintroduce validation inconsistencies.

**Why this priority**: This is **prevention** - ensures the problem doesn't recur. Lower priority than fixing the immediate issue, but critical for long-term maintainability.

**Independent Test**: Run integration test suite that compares IDE validation results against compiler validation results for a set of test fixtures.

**Acceptance Scenarios**:

1. **Given** a test fixture with validation errors, **When** I run parity tests, **Then** IDE and compiler produce identical error messages, locations, and counts
2. **Given** a test fixture with CSS validation errors, **When** I run parity tests, **Then** both environments detect the same CSS class/selector issues
3. **Given** changes to validation logic, **When** I run parity tests, **Then** tests fail if IDE and compiler diverge in validation behavior

---

### User Story 4 - Deprecated Code Removal (Priority: P4)

As a developer working on the Eligian codebase, I need deprecated error types and formatters removed, so that I can rely on a single source of truth for error handling without import confusion.

**Why this priority**: This is **technical debt cleanup** from Feature 018. Important for code quality but doesn't directly fix user-facing issues.

**Independent Test**: Search codebase for imports from deprecated error locations - all must be updated to use unified error namespace.

**Acceptance Scenarios**:

1. **Given** the codebase after refactoring, **When** I search for imports from `compiler/types/errors.ts`, **Then** no files import from this deprecated location
2. **Given** compilation or validation errors, **When** errors are formatted for display, **Then** all tools use the same formatter (`errors/formatters.ts`)
3. **Given** new error types added to the system, **When** developers consult documentation, **Then** a single canonical error namespace is documented

---

### Edge Cases

- What happens when CSS files are added/removed while IDE is running? (Must trigger re-validation)
- How does system handle CSS files that fail to parse? (Validation must not crash, show clear error at import statement)
- What happens when compiling files with no source URI? (Must generate stable temporary URIs, validation still works)
- How does system handle very large CSS files (>1MB)? (Loading must not block validation indefinitely)
- What happens when multiple `.eligian` files import the same CSS file? (CSS must not be parsed multiple times, but each file sees the same validation results)

## Requirements

### Functional Requirements

- **FR-001**: System MUST load CSS files before validation runs in both IDE and compiler paths
- **FR-002**: System MUST clear CSS registry state between independent compilations
- **FR-003**: System MUST produce identical validation errors (message, location, severity) in IDE and compiler for the same source file
- **FR-004**: System MUST trigger re-validation when imported CSS files change in the IDE
- **FR-005**: System MUST use the same Langium validation logic in both IDE and compiler paths
- **FR-006**: System MUST format errors identically across CLI, IDE, and compiler using unified formatters
- **FR-007**: System MUST remove all imports from deprecated error type locations (`compiler/types/errors.ts`)
- **FR-008**: System MUST provide automated tests comparing IDE and compiler validation results
- **FR-009**: System MUST handle CSS file loading errors consistently (file not found, parse errors, permission denied)
- **FR-010**: System MUST isolate Langium service state between compilations (no state leakage)

### Non-Functional Requirements

- **NFR-001**: Validation must complete within 500ms for typical files (same performance as current system)
- **NFR-002**: CSS file loading must not block validation beyond 2 seconds (timeout for large/slow files)
- **NFR-003**: All existing tests must continue passing (zero regressions)
- **NFR-004**: Code duplication must be reduced by at least 80 lines (deprecated error types removed)
- **NFR-005**: Parity tests must run in under 10 seconds for full fixture suite

### Key Entities

- **ValidationPipeline**: Represents the sequence of operations (parse → load CSS → validate → report) that must be identical in IDE and compiler
- **CSSRegistry**: Tracks parsed CSS metadata per document; must support state clearing between compilations
- **LangiumServiceInstance**: Shared Langium services (parser, validator, workspace); must be properly initialized/reset
- **ValidationResult**: Set of errors/warnings produced by validation; must be comparable across environments

## Success Criteria

### Measurable Outcomes

- **SC-001**: 100% of test fixtures produce identical validation results in IDE and compiler (verified by parity tests)
- **SC-002**: Zero instances of "IDE shows errors but compilation succeeds" or vice versa (validated via integration tests with CSS imports)
- **SC-003**: All 80+ lines of deprecated error type definitions removed from codebase
- **SC-004**: Validation parity test suite completes in under 10 seconds with 100% pass rate
- **SC-005**: No performance regression - validation completes within 500ms for typical files (same as current baseline)
- **SC-006**: All existing tests continue passing (1235+ tests remain green)
- **SC-007**: CSS hot-reload continues working in IDE preview (validation updates within 300ms of CSS file save)

## Assumptions

1. **Langium Version**: The project uses a stable version of Langium with consistent validation behavior
2. **CSS File Size**: Typical CSS files are under 100KB; extremely large files (>1MB) are rare edge cases
3. **Single Workspace**: IDE validation operates on a single workspace at a time (no multi-root workspaces)
4. **File System Access**: Both IDE and compiler have synchronous file system access (no network-mounted CSS files)
5. **Error Message Format**: Existing error message formats are acceptable; no breaking changes to user-facing error text required

## Dependencies

- **Langium Framework**: All validation logic depends on Langium's `ValidationAcceptor` and `DocumentValidator` APIs
- **Phase 1 (Shared Utilities)**: Uses `loadFileSync()` and `loadFileAsync()` from `@eligian/shared-utils`
- **Phase 2 (CSS Consolidation)**: Uses `CSSService` from `@eligian/language/css` for CSS parsing
- **Phase 3 (Error Unification)**: Uses unified error types from `@eligian/language/errors`
- **VS Code Extension API**: IDE validation depends on VS Code's diagnostic reporting APIs

## Out of Scope

- **Performance Optimization**: No major performance improvements beyond maintaining current baseline
- **New Validation Rules**: No new validators added; focus is on consistency, not new features
- **Language Server Protocol Changes**: No changes to LSP message formats or capabilities
- **Multi-Document Validation**: Cross-file validation (e.g., checking imports across multiple `.eligian` files) remains out of scope
- **Error Message Content Changes**: Error message text may be reformatted but content/meaning stays the same

## Risks & Mitigations

### Risk 1: Breaking Existing Validation Behavior

**Description**: Changes to CSS loading timing may inadvertently break existing validation rules

**Likelihood**: Medium
**Impact**: High (could cause regressions in existing features)

**Mitigation**:
- Run full test suite (1235+ tests) after each change
- Add parity tests BEFORE making changes (TDD approach)
- Test with real-world `.eligian` files from examples/ directory

### Risk 2: Performance Degradation

**Description**: Synchronizing CSS loading may slow down validation

**Likelihood**: Low
**Impact**: Medium (users notice slow IDE response)

**Mitigation**:
- Benchmark validation performance before/after changes
- Use async CSS loading with proper synchronization (not blocking)
- Add timeout for CSS loading (2 second max)

### Risk 3: Incomplete State Isolation

**Description**: Clearing CSS registry may not fully isolate compilation state (other cached data remains)

**Likelihood**: Medium
**Impact**: Medium (partial fix, issue may recur in edge cases)

**Mitigation**:
- Test sequential compilation scenarios explicitly
- Document all stateful components in Langium service
- Consider creating fresh service instance per compilation (if performance allows)

## Related Features

- **Feature 016**: Shared Utilities Package - Provides file loading abstractions
- **Feature 017**: CSS Consolidation - Created `CSSService` used by both IDE and compiler
- **Feature 018**: Error Type Unification - Created unified error types and formatters
- **Feature 013**: CSS Class Validation - Original CSS validation implementation
- **Feature 011**: Preview CSS Support with Live Reload - CSS hot-reload in IDE preview

## Notes

### Investigation Findings (from Analysis)

The comprehensive codebase analysis identified these specific technical issues:

**CSS Loading Timing**:
- Compiler: `pipeline.ts` lines 138-193 (synchronous loading before validation)
- IDE: `language/main.ts` lines 75-158 (asynchronous loading via `onBuildPhase`)

**Singleton Service**:
- `pipeline.ts` lines 42-54 (singleton pattern with `sharedServices` variable)
- CSS registry and document cache persist across compilations

**Document URI Differences**:
- Compiler generates: `file:///memory/source-${counter}.eligian`
- IDE uses real paths: `file:///c:/Users/...`

### Recommended Fix Priority

1. **P0-CRITICAL**: Fix CSS loading race condition (unify loading strategy)
2. **P0-CRITICAL**: Fix singleton state pollution (add state reset)
3. **P0-CRITICAL**: Add validation parity tests (prevent regressions)
4. **P1-HIGH**: Remove deprecated error types (cleanup Feature 018 migration)
5. **P1-HIGH**: Unify error formatting (consistent messages)

### Estimated Impact

- **Code Reduction**: ~80 lines removed (deprecated error types)
- **Consistency**: 100% validation parity (verified by tests)
- **Effort**: 3-5 days implementation + testing
