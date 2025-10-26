# Feature Specification: CSS Class and Selector Validation

**Feature Branch**: `013-css-class-and`
**Created**: 2025-10-26
**Status**: Draft
**Input**: User description: "CSS class and selector validation - Parse imported CSS files to extract class names and IDs, then validate operation parameters marked with ParameterType.className or ParameterType.selector against the extracted list. Provide real-time validation with hot-reload when CSS files change."

**Note**: This specification covers **Spec 1: Validation Infrastructure** only. IDE features (autocomplete, hover, code actions) will be covered in a separate Spec 2 after this foundation is complete.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Catch Unknown CSS Classes in className Parameters (Priority: P1)

As a developer writing Eligian presentations, I want to receive immediate error feedback when I reference CSS class names that don't exist in my imported CSS files, so I can catch typos and missing classes before running my timeline.

**Why this priority**: This is the core value proposition - preventing runtime errors by catching CSS reference mistakes at compile time. Without this, developers must manually verify class names exist, leading to runtime failures when selectors don't match.

**Independent Test**: Can be fully tested by importing a CSS file with known classes, then using an unknown class name in an `addClass()` operation. The system should show an error immediately. This delivers immediate value by catching the most common error case.

**Acceptance Scenarios**:

1. **Given** I have imported `styles.css` containing `.button` and `.primary` classes, **When** I write `addClass("primry")`, **Then** I see an error "Unknown CSS class: 'primry'. Did you mean: primary?"

2. **Given** I have imported `styles.css` containing `.button` class, **When** I write `addClass("button")`, **Then** no error appears and validation passes

3. **Given** I have imported `styles.css` containing `.button` class, **When** I write `addClass("card")`, **Then** I see an error "Unknown CSS class: 'card'" with suggestions of similar class names if any exist

4. **Given** I have no CSS files imported, **When** I write `addClass("button")`, **Then** validation passes (no CSS context to validate against)

---

### User Story 2 - Validate Complex CSS Selectors (Priority: P2)

As a developer using `selectElement()` operations with complex CSS selectors, I want each class name and ID within my selector to be validated against imported CSS files, so I can ensure my selectors will match elements correctly.

**Why this priority**: Selector validation is more complex than simple className validation but provides significant value by catching errors in the most commonly used operation (`selectElement`). This builds on P1 by handling multi-class selectors like `.button.primary`.

**Independent Test**: Can be tested by using `selectElement()` with various selector patterns (`.class1.class2`, `#id`, `.parent > .child`) and verifying that each class/ID component is validated separately. Delivers value by catching errors in complex selectors that are harder to debug at runtime.

**Acceptance Scenarios**:

1. **Given** I have imported CSS with `.button` and `.primary` classes, **When** I write `selectElement(".button.primary")`, **Then** validation passes (both classes exist)

2. **Given** I have imported CSS with `.button` but not `.primary`, **When** I write `selectElement(".button.primary")`, **Then** I see an error "Unknown CSS class in selector: 'primary'"

3. **Given** I have imported CSS with `.button` class and `#header` ID, **When** I write `selectElement("#header.button")`, **Then** validation passes (both exist)

4. **Given** I have imported CSS with `.button` class, **When** I write `selectElement(".button:hover")`, **Then** validation passes (pseudo-classes are ignored/assumed valid)

5. **Given** I have imported CSS with `.button` class, **When** I write `selectElement(".parent > .button")`, **Then** validation passes (combinators are ignored, only `.parent` and `.button` validated)

6. **Given** I write an invalid CSS selector, **When** I write `selectElement(".button[")`, **Then** I see an error "Invalid CSS selector syntax: Unclosed attribute selector"

---

### User Story 3 - Real-time Validation on CSS File Changes (Priority: P2)

As a developer actively editing both Eligian code and CSS files, I want validation to update immediately when I save changes to CSS files, so I get instant feedback without restarting the language server or reloading my workspace.

**Why this priority**: Hot-reload is critical for developer experience and workflow efficiency. Without it, developers must manually trigger re-validation or restart services, breaking flow. This builds on existing CSS hot-reload infrastructure from Feature 011.

**Independent Test**: Can be tested by creating an error (unknown class), then adding that class to the CSS file and saving. The error should disappear within 300ms. Delivers value by maintaining fast iteration cycles during development.

**Acceptance Scenarios**:

1. **Given** I have an error for unknown class `"new-class"` in my code, **When** I add `.new-class { }` to my CSS file and save, **Then** the error disappears within 300ms

2. **Given** I have no errors in my code using class `"button"`, **When** I delete the `.button` rule from my CSS file and save, **Then** an error appears within 300ms for all usages of `"button"`

3. **Given** I have multiple `.eligian` files importing the same CSS file, **When** I modify that CSS file, **Then** validation updates in all dependent files simultaneously

4. **Given** I am actively typing in an `.eligian` file, **When** a CSS file changes, **Then** validation updates without interrupting my typing or losing cursor position

---

### User Story 4 - Handle Invalid CSS Files Gracefully (Priority: P3)

As a developer who may accidentally introduce CSS syntax errors, I want clear error messages when my CSS files have syntax errors, so I can fix the CSS before attempting to use those classes in my Eligian code.

**Why this priority**: This is defensive error handling that prevents confusing validation states. While less common than typos (P1) or selector errors (P2), syntax errors in CSS can lead to confusing situations where classes appear missing. This provides clear feedback about the root cause.

**Independent Test**: Can be tested by introducing a CSS syntax error (missing closing brace, invalid property) and verifying that the CSS file is marked as invalid with a clear error message. Delivers value by providing actionable error messages pointing to the source of the problem.

**Acceptance Scenarios**:

1. **Given** I import a CSS file with syntax error (e.g., unclosed brace), **When** the file is parsed, **Then** I see an error "CSS file 'styles.css' has syntax errors (line 5, column 10): Unclosed block"

2. **Given** I import an invalid CSS file, **When** I reference a class from that file, **Then** I see an error indicating the CSS file is invalid rather than "unknown class"

3. **Given** I have a CSS file with syntax errors, **When** I fix the syntax errors and save, **Then** the file error disappears and class validation resumes normally

4. **Given** I import multiple CSS files where one has syntax errors, **When** validation runs, **Then** only the invalid file shows errors and classes from valid files are still validated correctly

---

### Edge Cases

- **What happens when a CSS file is deleted after being imported?**
  System should show error that CSS file cannot be found, treat all classes from that file as unavailable

- **What happens when the same class name exists in multiple imported CSS files?**
  System should accept the class as valid (CSS cascade rules apply at runtime), validation passes if class exists in ANY imported file

- **What happens when a CSS file imports other CSS files via `@import`?**
  System validates only the directly imported file's classes (nested imports are out of scope for Spec 1)

- **What happens when using CSS variables or custom properties?**
  System ignores CSS variables (not class names), validation focuses only on class and ID selectors

- **What happens when CSS file path is relative?**
  System resolves paths relative to the `.eligian` file location (reusing existing CSS path resolution from Feature 010/011)

- **What happens when a parameter value is a variable reference instead of a string literal?**
  System skips validation (cannot validate dynamic values), no error shown

- **What happens when validation runs before CSS files are parsed?**
  System treats all classes as valid until CSS metadata is available (optimistic validation)

- **What happens when CSS watcher debounce is active and multiple changes occur rapidly?**
  System batches updates using existing 300ms debounce, re-validation occurs once after changes settle

## Requirements *(mandatory)*

### Functional Requirements

#### CSS Parsing & Registry

- **FR-001**: System MUST parse imported CSS files to extract all class names (selectors starting with `.`) and their source locations (file path, line number, column number)

- **FR-002**: System MUST parse imported CSS files to extract all ID names (selectors starting with `#`) and their source locations

- **FR-003**: System MUST extract CSS rule definitions for each class and ID to support future IDE features (hover previews)

- **FR-004**: System MUST handle CSS syntax errors gracefully, recording parse errors with line/column information without crashing the parser

- **FR-005**: System MUST maintain a registry mapping CSS file paths to extracted metadata (classes, IDs, locations, rules, errors)

- **FR-006**: System MUST provide a query interface to retrieve all classes available to a specific Eligian document based on its CSS imports

- **FR-007**: System MUST provide a query interface to retrieve all IDs available to a specific Eligian document

- **FR-008**: System MUST provide a lookup interface to find the definition location of a specific class name (for future hover/go-to-definition features)

#### Selector Parsing

- **FR-009**: System MUST parse CSS selector strings to extract individual class names and ID names, handling complex selectors with combinators (e.g., `.parent > .child`)

- **FR-010**: System MUST parse selectors with multiple classes (e.g., `.button.primary.large`) and return all class names separately

- **FR-011**: System MUST parse selectors with pseudo-classes (e.g., `:hover`, `:nth-child(2)`) without treating them as class names

- **FR-012**: System MUST parse selectors with attribute selectors (e.g., `[disabled]`, `[data-foo="bar"]`) without treating them as class names

- **FR-013**: System MUST detect invalid CSS selector syntax and report specific syntax errors (e.g., "Unclosed attribute selector at position 5")

#### Validation

- **FR-014**: System MUST validate parameters with `ParameterType.className` against the list of available CSS classes for that document

- **FR-015**: System MUST validate parameters with `ParameterType.selector` by parsing the selector and validating each extracted class and ID

- **FR-016**: System MUST report errors (not warnings) when unknown class names are referenced in `className` parameters

- **FR-017**: System MUST report errors (not warnings) when unknown class names or IDs are found in `selector` parameters

- **FR-018**: System MUST skip validation for parameter values that are not string literals (e.g., variable references, expressions)

- **FR-019**: System MUST provide "Did you mean?" suggestions for unknown class names using Levenshtein distance (maximum edit distance of 2), showing up to 3 suggestions

- **FR-020**: System MUST report errors when imported CSS files have syntax errors, indicating the file path and parse error location

#### Hot-Reload Integration

- **FR-021**: System MUST integrate with existing CSS file watcher from Feature 011 to receive notifications when CSS files change

- **FR-022**: System MUST re-parse CSS files when file change notifications are received

- **FR-023**: System MUST update the CSS registry with new metadata when files are re-parsed

- **FR-024**: System MUST trigger re-validation of all Eligian documents that import the changed CSS file

- **FR-025**: System MUST complete CSS re-parsing and re-validation within 300ms of file change (matching existing debounce behavior)

- **FR-026**: System MUST send Language Server Protocol (LSP) notifications from the extension to the language server when CSS files change

#### Scope & Boundaries

- **FR-027**: System MUST validate only against CSS files directly imported by the Eligian document (not transitive imports via CSS `@import`)

- **FR-028**: System MUST validate only class names and ID names, ignoring pseudo-classes, pseudo-elements, attribute selectors, and combinators

- **FR-029**: System MUST resolve CSS file paths relative to the Eligian document location (reusing existing path resolution from Feature 010)

- **FR-030**: System MUST treat documents with no CSS imports as valid (no validation errors for any class names)

### Key Entities

- **CSSMetadata**: Represents parsed information from a single CSS file
  - Attributes: classes (set of class names), IDs (set of ID names), class locations (map of class name to source location), ID locations, class rules (map of class name to CSS rule text), ID rules, parse errors (list of syntax errors)

- **CSSRegistry**: Centralized registry of all parsed CSS metadata
  - Attributes: metadata by file path, indexed for fast lookup
  - Relationships: Maps CSS file paths to CSSMetadata, tracks which documents import which CSS files

- **ParsedSelector**: Represents a parsed CSS selector string
  - Attributes: classes (list of class names), IDs (list of ID names), valid (boolean indicating syntax validity), error message (if invalid)

- **ValidationError**: Represents a CSS validation error
  - Attributes: error message, source location, error code (unknown-css-class, unknown-css-id, invalid-selector-syntax, invalid-css-file), suggestions (list of similar class names)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Developers receive error feedback for unknown CSS class names within 50ms of typing (instant validation)

- **SC-002**: Validation updates within 300ms after CSS file changes (matching existing hot-reload performance)

- **SC-003**: System correctly validates 100% of CSS selectors containing only supported features (classes, IDs, combinators, pseudo-classes)

- **SC-004**: Error messages include helpful suggestions (Levenshtein distance ≤ 2) for unknown class names when similar classes exist

- **SC-005**: System handles CSS files with up to 1000 class/ID definitions without performance degradation (parsing < 100ms)

- **SC-006**: All validation errors are actionable, indicating exactly which class/ID is unknown and in which context

- **SC-007**: Developers can continue working uninterrupted when CSS files change (no editor freezing, cursor position maintained)

- **SC-008**: System correctly identifies and reports CSS syntax errors with line and column precision

- **SC-009**: Validation works correctly across multiple Eligian documents importing overlapping CSS files (per-document context isolation)

- **SC-010**: Zero false positives for valid class names (classes that exist in imported CSS are never flagged as errors)

- **SC-011**: Zero false negatives for unknown class names in string literals (typos in className/selector parameters are always caught)

## Assumptions

1. **CSS Parser Library**: We will use PostCSS with postcss-selector-parser (already a dependency from Feature 011) for robust CSS parsing
2. **Path Resolution**: CSS file paths will be resolved using the same logic as Feature 010/011 (relative to `.eligian` file)
3. **Watcher Integration**: We will extend the existing `CSSWatcherManager` from Feature 011 rather than creating a separate watcher
4. **LSP Infrastructure**: Language server can receive custom LSP notifications (standard LSP capability)
5. **Validation Scope**: Only string literals will be validated; variable references and expressions are out of scope
6. **Selector Validation Depth**: Pseudo-classes, pseudo-elements, and attribute selectors are assumed valid CSS (not validated against CSS spec)
7. **CSS Import Depth**: Only directly imported CSS files are parsed; nested `@import` statements in CSS are not followed
8. **Performance Target**: CSS files are typically < 1000 lines; parsing performance is optimized for this size
9. **Error Severity**: Unknown CSS classes/IDs are errors (not warnings) because they indicate likely bugs
10. **Suggestion Algorithm**: Levenshtein distance is sufficient for typo detection (no need for more complex fuzzy matching)

## Dependencies

- **Feature 010**: CSS import syntax (`styles "./file.css"`) - provides CSS file references
- **Feature 011**: CSS file watcher infrastructure - will be extended for validation notifications
- **Langium Framework**: Validation registry and AST traversal
- **PostCSS**: CSS parsing library (existing dependency)
- **postcss-selector-parser**: Selector parsing library (new dependency)

## Out of Scope (Deferred to Spec 2)

The following features are intentionally excluded from this specification and will be covered in a separate "Spec 2: IDE Features" specification:

- **Autocomplete**: Suggesting CSS classes while typing className/selector parameters
- **Hover Information**: Showing CSS definition location and rule preview on hover
- **Code Actions**: Quick fixes to create missing CSS classes
- **Go to Definition**: Navigating from class reference to CSS file location
- **Signature Help**: Showing available classes for operation parameters
- **Find References**: Finding all usages of a CSS class across files
- **Rename Refactoring**: Renaming CSS classes across Eligian and CSS files

These IDE features will build on the validation infrastructure created in this specification.
