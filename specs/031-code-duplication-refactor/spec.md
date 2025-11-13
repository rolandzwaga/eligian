# Feature Specification: Code Duplication Refactoring

**Feature Branch**: `031-code-duplication-refactor`
**Created**: 2025-01-13
**Status**: Draft
**Input**: User description: "code duplication refactor. Now use the analysis report you made to create a spec to implement all of the refactors you suggest"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Eliminate Critical String Literal Detection Duplication (Priority: P1)

As a developer maintaining the Eligian codebase, I need to have a single implementation of string literal detection logic so that bug fixes and improvements only need to be applied once, reducing maintenance burden and preventing inconsistencies.

**Why this priority**: String literal detection is used in multiple hot paths (completion provider, CSS context detection) and is CRITICAL infrastructure. Having two identical implementations creates a high risk of divergence and double the maintenance cost.

**Independent Test**: Can be fully tested by extracting the shared function to `utils/string-utils.ts`, replacing both usages, and verifying that all existing completion and CSS validation tests continue to pass without modification.

**Acceptance Scenarios**:

1. **Given** cursor position within a string literal in an Eligian file, **When** completion provider calls the shared utility, **Then** it correctly detects the cursor is inside a string
2. **Given** cursor position outside a string literal, **When** CSS context detection calls the shared utility, **Then** it correctly detects the cursor is not inside a string
3. **Given** both the completion provider and CSS context detection are using the shared utility, **When** the shared utility is updated with a bug fix, **Then** both features benefit from the fix without duplicate code changes

---

### User Story 2 - Consolidate CSS Hover Markdown Builders (Priority: P1)

As a developer adding new CSS hover features, I need a single generic markdown builder for CSS identifiers so that I can add support for new CSS constructs (like custom properties or animations) without duplicating markdown generation logic.

**Why this priority**: CSS hover is a user-facing feature with 100+ lines of duplicated markdown/info building logic. Consolidating this eliminates 95% duplication in two critical functions and establishes a pattern for future CSS hover extensions.

**Independent Test**: Can be fully tested by consolidating `buildCSSClassMarkdown` and `buildCSSIDMarkdown` into a generic `buildCSSIdentifierMarkdown`, then verifying that all CSS hover tests pass and produce identical markdown output.

**Acceptance Scenarios**:

1. **Given** a CSS class reference in an Eligian file, **When** developer hovers over it, **Then** the markdown displays with the same format as before refactoring
2. **Given** a CSS ID reference in an Eligian file, **When** developer hovers over it, **Then** the markdown displays with the same format as before refactoring
3. **Given** the generic builder function, **When** a new CSS construct needs hover support, **Then** developers can reuse the builder with minimal code changes

---

### User Story 3 - Unify Error Construction Pattern Across Validators (Priority: P2)

As a developer adding new validators, I need a consistent error construction utility so that all validation errors follow the same structure and format without needing to remember the boilerplate.

**Why this priority**: Error construction is repeated across 5+ validator files with 25+ lines of duplication. Consolidating this improves consistency in error reporting and makes it easier to add new validators.

**Independent Test**: Can be fully tested by extracting `createValidationError()` utility, replacing error construction in all validators, and verifying that all validation tests produce identical error messages.

**Acceptance Scenarios**:

1. **Given** an invalid import in an Eligian file, **When** the import validator detects the error, **Then** it uses the shared utility to construct a properly formatted error with code, message, and hint
2. **Given** an invalid asset type, **When** the asset validator detects the error, **Then** it uses the same shared utility to construct a consistent error format
3. **Given** a developer adding a new validator, **When** they need to report an error, **Then** they can use the shared utility without duplicating error construction logic

---

### User Story 4 - Consolidate Hover Object Creation (Priority: P2)

As a developer implementing hover providers, I need a shared utility for creating LSP Hover objects so that all hover features return consistently formatted responses without duplicating the object structure.

**Why this priority**: Hover object creation is duplicated 6+ times across hover providers (30+ lines). This refactoring establishes a consistent pattern for all hover implementations.

**Independent Test**: Can be fully tested by extracting `createMarkdownHover()` utility, replacing all hover object creation, and verifying that all hover provider tests pass with identical hover responses.

**Acceptance Scenarios**:

1. **Given** a custom action invocation, **When** developer hovers over it, **Then** the hover response is created using the shared utility and displays correctly
2. **Given** a CSS class reference, **When** developer hovers over it, **Then** the hover response uses the same shared utility for consistent formatting
3. **Given** a new hover feature, **When** a developer implements it, **Then** they can use the shared utility without duplicating hover object creation code

---

### User Story 5 - Extract Markdown Building Utilities (Priority: P3)

As a developer creating markdown content for hovers and documentation, I need a reusable markdown builder utility so that markdown generation is consistent across all features without duplicating array-based building patterns.

**Why this priority**: Markdown building is repeated 3+ times across hover providers (15+ lines). While lower priority than critical infrastructure, consolidating this improves consistency and reduces cognitive load.

**Independent Test**: Can be fully tested by creating a `MarkdownBuilder` class, replacing array-based building patterns, and verifying that all generated markdown remains identical.

**Acceptance Scenarios**:

1. **Given** CSS class hover information, **When** markdown is generated, **Then** it uses the shared builder for consistent formatting
2. **Given** action hover documentation, **When** markdown is generated, **Then** it uses the same shared builder
3. **Given** a new feature requiring markdown output, **When** a developer implements it, **Then** they can use the builder without duplicating array manipulation code

---

### User Story 6 - Eliminate Type Guard Duplication (Priority: P3)

As a developer working with AST nodes, I need to use Langium-generated type guards instead of manually recreated ones so that type checking is consistent and benefits from Langium's code generation.

**Why this priority**: While Langium generates 80+ type guards automatically, `ast-helpers.ts` manually recreates a subset. This refactoring removes unnecessary duplication and establishes clear usage patterns.

**Independent Test**: Can be fully tested by removing manual type guard implementations, delegating to generated guards, and verifying that all AST traversal code continues to work correctly.

**Acceptance Scenarios**:

1. **Given** code checking if an AST node is a Timeline, **When** the type guard is called, **Then** it uses the Langium-generated guard instead of a manual implementation
2. **Given** wrapper functions in ast-helpers.ts, **When** they need type checking, **Then** they delegate to generated guards rather than reimplementing the logic
3. **Given** all manual type guards removed, **When** Langium regenerates AST types, **Then** all type guards automatically stay in sync

---

### User Story 7 - Extract Utility Functions (Priority: P3)

As a developer working across the codebase, I need common utilities (completion item creation, URI conversion, file extension extraction, CSS file reading) in shared modules so that these patterns are reusable and don't need to be reimplemented.

**Why this priority**: Low-impact duplications (36+ lines across 4 patterns) that, while individually small, collectively add up to maintenance burden. Consolidating these establishes comprehensive utility libraries.

**Independent Test**: Can be fully tested by extracting each utility function, replacing usages, and verifying that all affected tests pass without modification.

**Acceptance Scenarios**:

1. **Given** code needing to create completion items, **When** using the factory utility, **Then** completion items are created consistently across all completion providers
2. **Given** code needing to extract file extensions, **When** using the path utility, **Then** file extension extraction is consistent across validators
3. **Given** code needing to read CSS files, **When** using the CSS file utility, **Then** error handling is consistent across all CSS operations
4. **Given** code converting registry results to arrays, **When** using the collection utility, **Then** conversions are consistent across all usages

---

### Edge Cases

- What happens when refactored code is called with edge cases (null/undefined, empty strings, invalid offsets) that weren't explicitly tested in the original implementations?
- How does the system handle backward compatibility if any external code depends on the original function signatures?
- What happens when new utility functions need to handle additional use cases not present in the original duplicated code?
- How does testing coverage change when moving from multiple implementations to a single shared implementation?
- What happens if the shared utilities need to be updated but some callers depend on the old behavior?

## Requirements *(mandatory)*

### Functional Requirements

**High Priority Refactorings:**

- **FR-001**: System MUST extract string literal detection logic from `eligian-completion-provider.ts:44-61` and `css/context-detection.ts:125-165` into a single shared function `utils/string-utils.ts:isOffsetInStringLiteral()`
- **FR-002**: System MUST consolidate `buildCSSClassMarkdown` and `buildCSSIDMarkdown` functions in `css/css-hover.ts:110-148` into a single generic `buildCSSIdentifierMarkdown(name, label, files)` function
- **FR-003**: System MUST consolidate `buildCSSClassInfo` and `buildCSSIDInfo` functions in `css/css-hover.ts:162-194, 207-239` into a single generic `buildCSSIdentifierInfo` function with property getter parameters
- **FR-004**: System MUST extract error construction pattern from 5+ validator files into `utils/error-builder.ts:createValidationError()` utility function
- **FR-005**: All refactored code MUST maintain identical behavior to original implementations (verified through existing tests)

**Medium Priority Refactorings:**

- **FR-006**: System MUST remove manual type guard implementations in `utils/ast-helpers.ts` and delegate to Langium-generated guards in `generated/ast.ts`
- **FR-007**: System MUST extract hover object creation pattern (duplicated 6+ times) into `utils/hover-utils.ts:createMarkdownHover()` utility
- **FR-008**: System MUST create `MarkdownBuilder` class in `utils/markdown-builder.ts` to replace array-based markdown building patterns (duplicated 3+ times)
- **FR-009**: System MUST extract CSS file reading with error handling into `utils/css-file-utils.ts:readCSSFileWithErrorHandling()`

**Low Priority Refactorings:**

- **FR-010**: System MUST create `completion/completion-item-factory.ts` for consistent CompletionItem construction across completion providers
- **FR-011**: System MUST add URI-to-array conversion utilities to `utils/collection-utils.ts` to eliminate duplication in hover and code action providers
- **FR-012**: System MUST extract file extension extraction logic into `shared-utils/path-utils.ts:getFileExtension()` utility
- **FR-013**: System SHOULD investigate service initialization patterns and create factory if 2+ instances found (deferred - evaluate during US7 implementation)

**Quality Requirements:**

- **FR-014**: All existing tests MUST continue to pass without modification after each refactoring step
- **FR-015**: All new utility modules MUST have comprehensive unit tests covering the refactored functionality
- **FR-016**: Code coverage MUST NOT decrease after refactoring (maintain or improve current 81.72% coverage)
- **FR-017**: All refactored code MUST follow existing project code style and formatting guidelines (Biome configuration)
- **FR-018**: All new utility functions MUST have JSDoc documentation explaining purpose, parameters, and return values

**Integration Requirements:**

- **FR-019**: Refactored utilities MUST be importable from consistent paths (e.g., `utils/string-utils`, not `../../../utils/string-utils`)
- **FR-020**: Refactored code MUST maintain compatibility with Effect-ts patterns where applicable (functional composition, immutability)
- **FR-021**: All validator error construction MUST continue to integrate with existing error reporting infrastructure
- **FR-022**: All hover utilities MUST continue to integrate with LSP protocol requirements

### Key Entities

**Utility Modules** - New shared modules that consolidate duplicated logic:
- `utils/string-utils.ts` - String literal detection and manipulation
- `utils/error-builder.ts` - Validation error construction helpers
- `utils/hover-utils.ts` - LSP Hover object creation utilities
- `utils/markdown-builder.ts` - Markdown generation utilities
- `utils/css-file-utils.ts` - CSS file operations with error handling
- `utils/collection-utils.ts` - Collection type conversion utilities
- `completion/completion-item-factory.ts` - CompletionItem builders

**Refactored Consumers** - Existing modules that will consume new utilities:
- Completion providers (actions, operations, events, JSDoc)
- Validators (import, asset, CSS, timeline)
- Hover providers (CSS, actions, operations)
- CSS modules (hover, code actions, context detection)

## Success Criteria *(mandatory)*

### Measurable Outcomes

**Code Quality Metrics:**

- **SC-001**: Codebase contains 150-200 fewer lines of duplicated code after all refactorings are complete
- **SC-002**: All 1,483+ existing tests pass without modification after each refactoring phase
- **SC-003**: Code coverage remains at or above 81.72% after all refactorings
- **SC-004**: Zero new linting errors or warnings introduced by refactored code (verified by `pnpm run check`)

**Maintainability Metrics:**

- **SC-005**: String literal detection logic exists in exactly 1 location (down from 2) after Phase 1
- **SC-006**: CSS hover markdown/info building logic reduces duplication from 100+ lines to less than 20 lines after Phase 1
- **SC-007**: Error construction pattern exists in exactly 1 utility function (down from 5+ validator implementations) after Phase 1
- **SC-008**: Hover object creation pattern exists in exactly 1 utility function (down from 6+ implementations) after Phase 2
- **SC-009**: Type guard implementations in ast-helpers.ts reduce by 20+ lines after Phase 2

**Developer Experience Metrics:**

- **SC-010**: Developers can add new validators using shared error utilities without copying boilerplate (measured by PR review feedback)
- **SC-011**: Developers can add new hover features using shared utilities without duplicating object creation (measured by implementation time for new hover features)
- **SC-012**: Build time remains within 5% of current performance after all refactorings (no significant slowdown)

**Refactoring Process Metrics:**

- **SC-013**: Phase 1 (high priority refactorings) completes in 2-4 hours of development effort
- **SC-014**: Phase 2 (medium priority refactorings) completes in 4-6 hours of development effort
- **SC-015**: Phase 3 (low priority refactorings) completes in 2-3 hours of development effort
- **SC-016**: Total refactoring effort remains within 8-13 hours estimate

## Assumptions

1. **Test Coverage**: Existing test suite is comprehensive enough to catch behavioral regressions during refactoring
2. **No External Dependencies**: No external code outside the Eligian monorepo depends on the specific function signatures being refactored
3. **Backward Compatibility**: Internal API changes are acceptable as long as external behavior (LSP protocol, compilation output) remains identical
4. **Development Environment**: Developers have access to the full duplication analysis report at `DUPLICATION_ANALYSIS.md` for reference
5. **Incremental Approach**: Refactorings can be completed in phases without blocking other development work
6. **Biome Configuration**: Current Biome linting/formatting rules are appropriate for refactored code
7. **Module Boundaries**: Creating new utility modules in `utils/` and extending `shared-utils/` is architecturally appropriate
8. **Effect-ts Compatibility**: Refactored utilities can remain synchronous where appropriate (not everything needs Effect wrappers)
9. **Performance**: Extracting shared utilities has negligible performance impact (micro-optimizations not required)
10. **Documentation**: JSDoc documentation is sufficient for utility functions (no need for separate documentation files)

## Dependencies

1. **Duplication Analysis Report**: `DUPLICATION_ANALYSIS.md` must be available and accurate
2. **Existing Test Suite**: All 1,483+ tests must be passing before refactoring begins
3. **Biome Tooling**: `pnpm run check` must be available for code quality verification
4. **TypeScript Compilation**: `pnpm run build` must be available for type checking
5. **Langium Generated Code**: `packages/language/src/generated/ast.ts` must be up-to-date for type guard refactoring
6. **Development Branch**: Feature branch `031-code-duplication-refactor` must be checked out

## Scope

### In Scope

- Refactoring all 12 code duplication patterns identified in the analysis report
- Creating 7 new utility modules with comprehensive documentation
- Updating all consumers of duplicated code to use shared utilities
- Adding unit tests for all new utility functions
- Verifying all existing tests pass after each refactoring
- Ensuring code quality standards are met (Biome checks pass)

### Out of Scope

- Adding new features or functionality beyond consolidating existing code
- Changing external APIs or LSP protocol behavior
- Refactoring code that is not identified as duplicated in the analysis report
- Performance optimization beyond maintaining current performance
- Updating documentation files beyond code-level JSDoc comments
- Creating new tests beyond coverage for new utility functions
- Changing Biome configuration or coding standards
- Refactoring test files (analysis explicitly excluded test code)

## Constraints

1. **Zero Behavior Change**: All refactorings must maintain identical external behavior (verified by existing tests)
2. **No Test Modifications**: Existing tests must pass without modification (proves behavior preservation)
3. **Code Quality**: All refactored code must pass `pnpm run check` without warnings or errors
4. **Type Safety**: All refactored code must compile without TypeScript errors
5. **Coverage Maintenance**: Code coverage must not decrease below 81.72%
6. **Incremental Progress**: Refactorings must be completable in three phases (not all-or-nothing)
7. **Low Risk**: All refactorings are pure extractions of existing logic (no algorithmic changes)
8. **Time Box**: Total effort must remain within 8-13 hours estimate
9. **Module Organization**: New utilities must follow existing project structure conventions
10. **Documentation**: All public utility functions must have JSDoc documentation

## Non-Functional Considerations

### Performance

- Extracted utilities should have negligible performance impact compared to inline implementations
- Build time should remain within 5% of current performance
- No new expensive operations should be introduced during refactoring

### Maintainability

- Single source of truth for duplicated logic reduces maintenance burden
- Consistent utility patterns make codebase easier to understand for new contributors
- Centralized error construction improves consistency in validation error reporting
- Shared markdown builders ensure consistent formatting across all hover features

### Testability

- Extracted utilities are easier to test in isolation than duplicated inline code
- Unit tests for utilities provide better coverage than integration tests alone
- Test failures become easier to diagnose when logic exists in one place

### Developer Experience

- Shared utilities reduce cognitive load (developers learn patterns once, apply everywhere)
- Consistent patterns make code reviews faster and more effective
- New features become faster to implement when reusable utilities exist
- Onboarding new developers is easier with well-organized utility modules

## Risks and Mitigations

### Risk 1: Behavioral Regressions During Refactoring
**Likelihood**: Low
**Impact**: High
**Mitigation**: Run full test suite after each refactoring step; maintain identical function signatures; use existing tests as behavioral specification

### Risk 2: Decreased Code Coverage
**Likelihood**: Medium
**Impact**: Medium
**Mitigation**: Add comprehensive unit tests for new utility modules; verify coverage metrics after each phase; ensure utilities are covered both in isolation and through consumers

### Risk 3: Time Overrun
**Likelihood**: Low
**Impact**: Medium
**Mitigation**: Follow phased approach; complete high-priority refactorings first; time-box each phase; defer low-priority refactorings if needed

### Risk 4: Inconsistent Utility Usage
**Likelihood**: Medium
**Impact**: Low
**Mitigation**: Document utility functions with JSDoc; update code review guidelines; search codebase for remaining patterns after each refactoring; use TypeScript deprecation warnings for old patterns

### Risk 5: Merge Conflicts with Active Development
**Likelihood**: Medium
**Impact**: Medium
**Mitigation**: Complete refactorings in dedicated feature branch; coordinate with team on merge timing; keep refactorings focused and minimal; avoid changing test files

## Success Validation

The feature is considered successful when:

1. All 12 identified code duplications have been refactored into shared utilities
2. All 1,483+ existing tests pass without modification
3. Code coverage remains at or above 81.72%
4. `pnpm run check` passes without errors or warnings
5. Codebase contains 150-200 fewer lines of duplicated code
6. All new utility modules have comprehensive unit tests and JSDoc documentation
7. Development effort remains within 8-13 hours estimate
8. No behavioral regressions are detected in manual testing or automated tests

## Phased Rollout

### Phase 1: High Priority Refactorings (2-4 hours)
**Goal**: Eliminate critical duplications with highest impact

**Deliverables**:
- Extract `utils/string-utils.ts` with `isOffsetInStringLiteral()` (Duplication #1)
- Consolidate CSS hover markdown/info builders (Duplications #2, #3)
- Extract `utils/error-builder.ts` with `createValidationError()` (Duplication #4)
- All Phase 1 tests pass
- Code reduction: 135+ lines

**Success Criteria**: SC-001, SC-002, SC-003, SC-004, SC-005, SC-006, SC-007, SC-013

### Phase 2: Medium Priority Refactorings (4-6 hours)
**Goal**: Consolidate commonly used patterns

**Deliverables**:
- Extract `utils/hover-utils.ts` with `createMarkdownHover()` (Duplication #6)
- Create `utils/markdown-builder.ts` with `MarkdownBuilder` class (Duplication #7)
- Clean up type guards in `utils/ast-helpers.ts` (Duplication #5)
- Extract `utils/css-file-utils.ts` (Duplication #8)
- All Phase 2 tests pass
- Code reduction: 110+ lines

**Success Criteria**: SC-002, SC-003, SC-004, SC-008, SC-009, SC-011, SC-014

### Phase 3: Low Priority Refactorings (2-3 hours)
**Goal**: Polish and complete utility consolidation

**Deliverables**:
- Create `completion/completion-item-factory.ts` (Duplication #9)
- Add utilities to `utils/collection-utils.ts` (Duplication #10)
- Add utilities to `shared-utils/path-utils.ts` (Duplication #12)
- Extract service initialization utilities (Duplication #11)
- Consolidate CSS file utilities (Duplication #8)
- All Phase 3 tests pass
- Code reduction: 36+ lines

**Success Criteria**: SC-002, SC-003, SC-004, SC-010, SC-012, SC-015

### Phase 4: Validation and Documentation
**Goal**: Verify success criteria and complete documentation

**Deliverables**:
- All phases complete
- Final test suite verification
- Coverage metrics validation
- Performance benchmarking
- JSDoc documentation review

**Success Criteria**: All SC-001 through SC-016 met
