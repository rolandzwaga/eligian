# Feature Specification: Dependency Package Upgrades

**Feature Branch**: `027-package-upgrades-currently`
**Created**: 2025-11-06
**Status**: Draft
**Input**: User description: "package upgrades. Currently the language package depends on css-tree v2.3.1, htmlparser2 v9.1.0 and postcss-selector-parser v6.1.2. There are new major versions for all three of those packages: css-tree: v3.1.0, htmlparser2: v10.0.0, postcss-selector-parser: v7.1.0. So the our code must be refactored to make use of those latest versions. Perhaps no changes are needed, in which case just upgrading the package is enough. Make sure all tests pass of course."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Upgrade postcss-selector-parser (Priority: P1)

The language package must upgrade postcss-selector-parser from v6.1.2 to v7.1.0 to receive bug fixes, performance improvements, and security patches while maintaining all existing CSS selector parsing functionality.

**Why this priority**: This package is used in two critical modules (css-parser.ts and selector-parser.ts) for CSS class/ID validation. It's the highest priority because the selector parsing API is likely most stable with fewer breaking changes.

**Independent Test**: Can be fully tested by running existing CSS validation tests after upgrading the package, verifying that all selector parsing scenarios (simple selectors, complex combinators, pseudo-classes, attribute selectors) work identically.

**Acceptance Scenarios**:

1. **Given** postcss-selector-parser is upgraded to v7.1.0, **When** the parseSelector function processes a simple class selector ".button", **Then** it extracts ['button'] correctly
2. **Given** postcss-selector-parser is upgraded to v7.1.0, **When** the parseSelector function processes a complex selector ".button.primary > .icon", **Then** it extracts ['button', 'primary', 'icon'] correctly
3. **Given** postcss-selector-parser is upgraded to v7.1.0, **When** the css-parser module parses a CSS file with multiple rules, **Then** all classes and IDs are extracted with correct locations
4. **Given** postcss-selector-parser is upgraded to v7.1.0, **When** all existing CSS validation tests run, **Then** all 86 CSS tests pass without modification (42 selector-parser + 44 css-parser)

---

### User Story 2 - Upgrade htmlparser2 (Priority: P2)

The language package must upgrade htmlparser2 from v9.1.0 to v10.0.0 to benefit from improved HTML parsing performance and bug fixes while maintaining all existing HTML validation functionality.

**Why this priority**: This package is used only in the HTML validator (html-validator.ts) with a simple Parser API. It's second priority because HTML validation is less critical than CSS parsing and has fewer test dependencies.

**Independent Test**: Can be fully tested by running existing HTML validation tests after upgrading, verifying that empty HTML, non-HTML content, and malformed HTML are detected correctly.

**Acceptance Scenarios**:

1. **Given** htmlparser2 is upgraded to v10.0.0, **When** the HtmlValidator validates empty HTML content, **Then** it returns an error "HTML content is empty"
2. **Given** htmlparser2 is upgraded to v10.0.0, **When** the HtmlValidator validates non-HTML text content, **Then** it returns an error "HTML content does not contain valid HTML tags"
3. **Given** htmlparser2 is upgraded to v10.0.0, **When** the HtmlValidator validates truly malformed HTML, **Then** it captures parser errors with line/column information
4. **Given** htmlparser2 is upgraded to v10.0.0, **When** all existing HTML validation tests run, **Then** all tests pass without modification

---

### User Story 3 - Upgrade css-tree (Priority: P3)

The language package must upgrade css-tree from v2.3.1 to v3.1.0 to stay current with CSS parsing standards, though this package is currently unused in the codebase.

**Why this priority**: This is lowest priority because grep searches reveal css-tree is not imported or used anywhere in packages/language/src. It may be a transitive dependency or prepared for future use.

**Independent Test**: Can be tested by verifying the package upgrades successfully, builds without errors, and remains available for future CSS parsing needs if required.

**Acceptance Scenarios**:

1. **Given** css-tree is upgraded to v3.1.0, **When** the language package builds, **Then** the build completes successfully without errors
2. **Given** css-tree is upgraded to v3.1.0, **When** all existing tests run, **Then** all tests pass (since no code uses this package)
3. **Given** css-tree is upgraded to v3.1.0, **When** the @types/css-tree package is checked, **Then** it's upgraded to match the new version if needed

---

### Edge Cases

- What happens when postcss-selector-parser v7 introduces breaking API changes in the selector parsing API?
- What happens when htmlparser2 v10 changes the Parser constructor signature or error callback format?
- How does the system handle if type definitions (@types/css-tree) don't match the new css-tree v3.1.0?
- What happens if postcss-selector-parser v7 changes error message formats that tests depend on?
- How does the system handle if new major versions have incompatible peer dependency requirements?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST upgrade postcss-selector-parser from v6.1.2 to v7.1.0 in packages/language/package.json
- **FR-002**: System MUST upgrade htmlparser2 from v9.1.0 to v10.0.0 in packages/language/package.json
- **FR-003**: System MUST upgrade css-tree from v2.3.1 to v3.1.0 in packages/language/package.json
- **FR-004**: System MUST verify all CSS selector parsing functionality (simple selectors, complex selectors, combinators, pseudo-classes) works identically after postcss-selector-parser upgrade
- **FR-005**: System MUST verify all HTML validation functionality (empty HTML detection, non-HTML detection, parser error handling) works identically after htmlparser2 upgrade
- **FR-006**: System MUST refactor code in css-parser.ts and selector-parser.ts if postcss-selector-parser v7 introduces breaking API changes
- **FR-007**: System MUST refactor code in html-validator.ts if htmlparser2 v10 introduces breaking API changes to Parser constructor or error callbacks
- **FR-008**: System MUST ensure all 1,483+ existing tests pass after all package upgrades
- **FR-009**: System MUST maintain test coverage at or above current 81.72% baseline after any code refactoring
- **FR-010**: System MUST update @types/css-tree to match css-tree v3.1.0 if type definitions are available
- **FR-011**: System MUST run `pnpm run check` (Biome formatting/linting) and ensure 0 errors, 0 warnings after any code changes
- **FR-012**: System MUST run `pnpm run build` and ensure TypeScript compilation succeeds after upgrades

### Key Entities

- **Package Dependency**: Represents a third-party library dependency with name, current version, target version, usage locations, API surface area
- **Code Module**: Represents a source file that imports and uses a dependency (css-parser.ts, selector-parser.ts, html-validator.ts)
- **Test Suite**: Represents automated tests that verify dependency functionality remains intact after upgrades (CSS tests, HTML tests)
- **Breaking Change**: Represents an API change in a new major version that requires code refactoring (constructor changes, method signature changes, error format changes)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All three packages (postcss-selector-parser, htmlparser2, css-tree) upgrade to target major versions without build errors
- **SC-002**: All 1,483+ existing tests pass after package upgrades (100% test pass rate maintained)
- **SC-003**: Test suite completes in under 60 seconds (no performance regression from new package versions)
- **SC-004**: Code coverage remains at or above 81.72% baseline (no coverage loss from refactoring)
- **SC-005**: Biome code quality checks pass with 0 errors and 0 warnings after any code changes
- **SC-006**: CSS selector parsing functionality (42 selector-parser tests + 44 css-parser tests) passes with identical behavior
- **SC-007**: HTML validation functionality passes all existing validation scenarios without modification
- **SC-008**: Build time does not increase by more than 10% compared to pre-upgrade baseline

## Assumptions

- **ASM-001**: Major version upgrades (v6→v7, v9→v10, v2→v3) may contain breaking API changes that require code refactoring
- **ASM-002**: Package maintainers provide migration guides or changelogs documenting breaking changes
- **ASM-003**: The css-tree package, though currently unused, should be upgraded to stay current for potential future use
- **ASM-004**: Existing test suites provide sufficient coverage to detect breaking changes from package upgrades
- **ASM-005**: Performance characteristics of new package versions are equal or better than current versions
- **ASM-006**: The pnpm package manager handles major version upgrades correctly with proper dependency resolution

## Dependencies & Constraints

### Dependencies

- **DEP-001**: Requires access to npm registry to download postcss-selector-parser v7.1.0
- **DEP-002**: Requires access to npm registry to download htmlparser2 v10.0.0
- **DEP-003**: Requires access to npm registry to download css-tree v3.1.0
- **DEP-004**: Requires existing test suite infrastructure (Vitest, 1,483 tests) to validate upgrades
- **DEP-005**: Requires package maintainer changelogs/migration guides for breaking change documentation

### Constraints

- **CON-001**: Must maintain backwards compatibility with all existing Eligian DSL features (CSS validation, HTML validation, selector parsing)
- **CON-002**: Must complete all upgrades within a single feature branch to avoid dependency version conflicts
- **CON-003**: Must not introduce new security vulnerabilities (verify with pnpm audit or equivalent)
- **CON-004**: Must adhere to project constitution principles (comprehensive testing, simplicity first, functional programming patterns)
- **CON-005**: Cannot skip or disable existing tests to make upgrades pass - all tests must pass with original assertions intact

## Out of Scope

- **OOS-001**: Upgrading other dependencies beyond the three specified (postcss, domhandler, domutils, langium, etc.)
- **OOS-002**: Adding new features or functionality beyond maintaining existing behavior
- **OOS-003**: Performance optimization beyond maintaining current performance baselines
- **OOS-004**: Refactoring code for reasons other than accommodating breaking API changes
- **OOS-005**: Updating documentation or examples unless API changes require clarification
