# Feature Specification: CSS IDE Features

**Feature Branch**: `014-css-ide-features`
**Created**: 2025-10-26
**Status**: Draft
**Input**: User description: "CSS IDE Features: Provide autocomplete, hover, and quick fixes for CSS classes and selectors in the Eligian DSL to improve developer productivity"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Autocomplete CSS Classes in Parameters (Priority: P1)

As a developer writing Eligian code, I want autocomplete to suggest available CSS class names when typing className parameters, so I can write code faster without switching to CSS files to check class names.

**Why this priority**: This is the most frequently used IDE feature for CSS classes. Every time a developer types `addClass()` or similar operations, they need to reference CSS class names. Autocomplete provides immediate value and reduces context switching.

**Independent Test**: Can be fully tested by typing `addClass("")` with cursor between quotes and verifying that all CSS classes from imported files appear in the autocomplete menu. Delivers immediate value by eliminating the need to open CSS files to check class names.

**Acceptance Scenarios**:

1. **Given** a `.eligian` file imports `styles.css` containing `.button` and `.primary` classes, **When** developer types `addClass("")` and positions cursor between quotes, **Then** autocomplete shows "button" and "primary" as suggestions with "CSS class" detail
2. **Given** developer is inside a className parameter, **When** they type the first letters of a class name (e.g., "bu"), **Then** autocomplete filters to matching classes (e.g., "button")
3. **Given** multiple CSS files are imported with overlapping class names, **When** developer triggers autocomplete, **Then** all unique class names from all imported files appear
4. **Given** no CSS files are imported, **When** developer triggers autocomplete in className parameter, **Then** no CSS class suggestions appear (only other completions)

---

### User Story 2 - Hover to See CSS Definitions (Priority: P2)

As a developer reviewing Eligian code, I want to hover over CSS class name strings to see where they are defined and preview their CSS rules, so I can understand styling without leaving my current file.

**Why this priority**: Provides valuable context during code review and debugging. While not as frequently used as autocomplete, it significantly speeds up understanding code by showing CSS rules inline.

**Independent Test**: Can be fully tested by hovering over a class name string (e.g., "button" in `addClass("button")`) and verifying that a tooltip appears showing the CSS file location and rule preview. Delivers standalone value for code comprehension.

**Acceptance Scenarios**:

1. **Given** a class name "button" is used in `addClass("button")`, **When** developer hovers over "button" string, **Then** tooltip shows "Defined in styles.css:15" and previews the CSS rules
2. **Given** a class is defined in multiple CSS files, **When** developer hovers over the class name, **Then** tooltip shows all definition locations
3. **Given** a class name doesn't exist in any imported CSS, **When** developer hovers over it, **Then** no hover information appears (or shows validation error if validation is active)
4. **Given** a complex selector like ".button.primary", **When** developer hovers over the string at "button" position, **Then** hover shows information for "button" class

---

### User Story 3 - Autocomplete in Selector Strings (Priority: P2)

As a developer typing CSS selectors in operations like `selectElement()`, I want autocomplete to suggest class names when I type `.` and ID names when I type `#`, so I can build complex selectors without memorizing CSS identifiers.

**Why this priority**: Extends autocomplete to selector contexts, which are more complex than simple className parameters. Ranked P2 because selector completion is more specialized and less frequently used than basic className completion.

**Independent Test**: Can be fully tested by typing `selectElement(".")` with cursor after the dot and verifying that CSS class names appear without the dot prefix. Delivers independent value for building selectors efficiently.

**Acceptance Scenarios**:

1. **Given** imported CSS contains `.button` and `.primary` classes, **When** developer types `selectElement(".")` and positions cursor after dot, **Then** autocomplete shows "button" and "primary" (without dot prefix)
2. **Given** imported CSS contains `#header` and `#footer` IDs, **When** developer types `selectElement("#")` and positions cursor after hash, **Then** autocomplete shows "header" and "footer" (without hash prefix)
3. **Given** developer is building a compound selector like ".button.", **When** they position cursor after the second dot, **Then** autocomplete shows remaining classes that haven't been used
4. **Given** developer types ".butt" in a selector, **When** autocomplete triggers, **Then** filtered suggestions show only classes starting with "butt"

---

### User Story 4 - Quick Fix to Create Missing CSS Classes (Priority: P3)

As a developer who has used an unknown CSS class name, I want a quick fix action that creates the missing class in my CSS file, so I can quickly scaffold CSS without leaving my Eligian code.

**Why this priority**: Nice-to-have feature that reduces friction when iterating on new components. Ranked P3 because it's a convenience feature - developers can still manually add CSS classes. Most valuable during rapid prototyping.

**Independent Test**: Can be fully tested by using an unknown class name (triggering a validation error), clicking the quick fix, and verifying that the class is created in the CSS file with a TODO comment. Delivers independent value as a productivity shortcut.

**Acceptance Scenarios**:

1. **Given** a validation error for unknown class "new-class", **When** developer clicks the quick fix "Create '.new-class' in styles.css", **Then** the class is added to the CSS file with a `/* TODO: Add styles */` comment
2. **Given** multiple CSS files are imported, **When** developer triggers quick fix for unknown class, **Then** the class is created in the first imported CSS file
3. **Given** an unknown class has validation errors, **When** quick fix creates the class, **Then** validation errors disappear immediately due to CSS hot-reload
4. **Given** no CSS files are imported, **When** validation error appears for unknown class, **Then** no quick fix is available (cannot determine target file)

---

### Edge Cases

- What happens when a CSS class is defined in multiple imported files? (Hover shows all locations; autocomplete shows class once)
- How does system handle CSS files with syntax errors? (CSS registry has no classes; autocomplete shows nothing; hover unavailable)
- What if developer triggers autocomplete mid-selector like ".button.p|rimary"? (Autocomplete shows classes; insertion replaces from cursor to next delimiter)
- How does autocomplete handle very large CSS files (1000+ classes)? (All classes shown; VSCode's fuzzy filtering handles performance)
- What if CSS file is deleted while document is open? (CSS registry removes classes; validation triggers immediately; autocomplete stops showing those classes)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide autocomplete suggestions for CSS class names when developer is typing inside a `className` type parameter (e.g., `addClass("")`)
- **FR-002**: System MUST provide autocomplete suggestions for CSS class names when developer types `.` in a `selector` type parameter (e.g., `selectElement(".")`)
- **FR-003**: System MUST provide autocomplete suggestions for CSS ID names when developer types `#` in a `selector` type parameter (e.g., `selectElement("#")`)
- **FR-004**: Autocomplete MUST show CSS class/ID suggestions with appropriate detail text (e.g., "CSS class", "CSS ID") to distinguish from other completions
- **FR-005**: Autocomplete suggestions MUST be ranked higher than other completion types (operations, variables) to prioritize CSS identifiers
- **FR-006**: System MUST provide hover information for CSS class names showing file location and line number where class is defined
- **FR-007**: Hover information MUST include a preview of the CSS rules for the hovered class
- **FR-008**: Hover MUST work for className parameters (simple strings) and for class names within selector strings
- **FR-009**: System MUST provide a quick fix code action for validation errors on unknown CSS class names
- **FR-010**: Quick fix MUST create the missing CSS class in an appropriate CSS file with a `/* TODO: Add styles */` comment placeholder
- **FR-011**: Quick fix MUST not be available if no CSS files are imported in the document
- **FR-012**: System MUST update autocomplete suggestions immediately when CSS files change (within 500ms due to debouncing)
- **FR-013**: System MUST handle cursor position correctly in selector strings to determine whether to suggest classes (after `.`) or IDs (after `#`)
- **FR-014**: Autocomplete suggestions MUST filter based on current input prefix (fuzzy matching handled by VSCode)

### Key Entities

- **CSSCompletionProvider**: Generates completion items for CSS classes and IDs based on CSS registry data and completion context
- **CSSHoverProvider**: Provides hover information including file location and CSS rule previews for CSS class/ID names
- **CSSCodeActionProvider**: Generates quick fix actions to create missing CSS classes in appropriate CSS files
- **CompletionContext**: Represents the context where completion is triggered, including cursor position, current node, and parameter type
- **CSSMetadata**: Contains extracted CSS information (classes, IDs, locations, rules) from CSS registry (provided by Feature 013)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Developers can select CSS class names from autocomplete in under 2 seconds (time from typing first character to selecting suggestion)
- **SC-002**: Hover information appears within 100ms of hovering over a CSS class name
- **SC-003**: Autocomplete shows all available CSS classes from imported files (100% coverage)
- **SC-004**: Quick fix creates CSS class in target file within 1 second of triggering action
- **SC-005**: 90% of CSS class insertions use autocomplete (measured over typical development session)
- **SC-006**: Time to write `addClass()` operation reduces by 50% compared to manual typing (measured by keystroke count and time)
- **SC-007**: Developers spend 70% less time switching to CSS files to check class names (measured by file switch frequency)
- **SC-008**: Autocomplete performance remains under 100ms even with CSS files containing 1000+ classes

## Assumptions *(optional)*

- Feature 013 (CSS Validation Infrastructure) is complete and provides CSSRegistryService with stable APIs
- CSS files are already parsed and loaded into CSS registry via Feature 013's infrastructure
- CSS file watching and hot-reload are functional (from Features 011 and 013)
- VSCode's built-in fuzzy matching and ranking for completion items is sufficient
- Developers primarily use keyboard shortcuts to trigger autocomplete (Ctrl+Space) rather than waiting for automatic triggers
- The first imported CSS file is a reasonable default target for quick fix actions

## Dependencies *(optional)*

- **Feature 013**: CSS Validation Infrastructure - Provides CSSRegistryService, CSSParserService, and CSS hot-reload notifications
- **Feature 011**: CSS Preview Support - Provides CSS file watching infrastructure (reused for validation triggers)
- **Langium Framework**: Provides LSP integration for completion, hover, and code actions
- **VSCode LSP Client**: Handles communication between extension and language server

## Constraints *(optional)*

- Must not degrade autocomplete performance for non-CSS completions (operations, variables)
- Cannot modify CSS files directly from language server (must use LSP WorkspaceEdit protocol)
- Hover information limited to markdown format (VSCode LSP constraint)
- Quick fix can only target CSS files that are already imported in the document
- Selector string parsing limited to LSP position mapping capabilities (may be complex for nested strings)

## Out of Scope *(optional)*

- Rename refactoring for CSS classes across multiple files
- Find all references for CSS classes
- CSS variable (custom property) support
- Color preview in hover
- Go-to-definition command (can be added later as enhancement)
- Signature help for operation parameters showing available CSS classes
- Completion inside CSS files themselves (only Eligian file completion)
- CSS module or SCSS/LESS support
- Validation of pseudo-classes or attribute selectors
