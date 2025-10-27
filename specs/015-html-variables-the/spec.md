# Feature Specification: HTML Variables

**Feature Branch**: `015-html-variables-the`
**Created**: 2025-10-27
**Status**: Draft
**Input**: User description: "HTML variables. The layout keyword now clearly indicates that the HTML file content will have to be assigned to the layoutTemplate property of the configuration. Regular HTML imports though should behave like a variable. So, when we have this import statement: import foo from './foo.html'; it should behave like const foo = '<div>hello</world>'; So, that way it can be referenced in operation like so: setElementContent(@foo) Is that clear or do you have questions?"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Import HTML as String Variables (Priority: P1)

As a developer writing Eligian code, I want to import HTML files as string variables so that I can reuse HTML snippets across multiple operations without duplicating markup or using the layout system.

**Why this priority**: This is the core functionality that enables HTML content reusability and clean separation of markup from logic. Without this, developers must either inline HTML strings (error-prone, hard to edit) or use external templating systems.

**Independent Test**: Can be fully tested by importing an HTML file with `import foo from './foo.html'`, referencing it in an operation like `setElementContent(@foo)`, and verifying the HTML content is correctly inserted into the DOM. Delivers immediate value for content management.

**Acceptance Scenarios**:

1. **Given** an HTML file `./snippet.html` containing `<div>Hello</div>`, **When** developer writes `import snippet from './snippet.html'`, **Then** the variable `snippet` contains the HTML string and can be referenced with `@snippet`
2. **Given** an imported HTML variable `@footer`, **When** used in `setElementContent(@footer)`, **Then** the HTML content from the imported file is inserted into the selected element
3. **Given** multiple HTML imports in a single file, **When** each is referenced by its variable name, **Then** each resolves to its corresponding HTML content
4. **Given** an HTML variable `@header`, **When** used in multiple operations throughout the timeline, **Then** the same HTML content is available in all locations

---

### User Story 2 - Distinguish Layout from Content Variables (Priority: P1)

As a developer, I want the `layout` keyword to assign HTML to the configuration's `layoutTemplate` property while regular `import` statements create variables, so that I have clear separation between application structure and reusable content.

**Why this priority**: Critical for preventing confusion between two different HTML use cases. The `layout` keyword serves a specific architectural purpose (main app container) while imports serve content reuse. This distinction must be clear from syntax.

**Independent Test**: Can be tested by using both `layout "./layout.html"` and `import header from './header.html'` in the same file, then verifying that the layout HTML is assigned to the configuration's `layoutTemplate` while the imported variable can be referenced with `@header`. Demonstrates clear separation of concerns.

**Acceptance Scenarios**:

1. **Given** a file with `layout "./app.html"`, **When** compiled, **Then** the HTML content is assigned to the Eligius configuration's `layoutTemplate` property
2. **Given** a file with `import nav from './nav.html'`, **When** compiled, **Then** the HTML content is available as a variable `@nav` but NOT assigned to `layoutTemplate`
3. **Given** both `layout` and `import` statements in one file, **When** compiled, **Then** only the layout HTML goes to `layoutTemplate` and imported HTML becomes variables
4. **Given** an attempt to use `@` reference with layout keyword, **When** parsing, **Then** validation error indicates layout cannot be referenced as a variable

---

### User Story 3 - Validation of HTML Import Paths (Priority: P2)

As a developer, I want validation errors when HTML import paths are invalid or files don't exist, so that I catch configuration errors at compile-time rather than runtime.

**Why this priority**: Enhances developer experience by catching errors early. Ranked P2 because the core functionality (US1) can work without comprehensive validation, but validation significantly improves reliability and debuggability.

**Independent Test**: Can be tested by providing invalid file paths in import statements and verifying that appropriate compile-time errors are shown with helpful messages. Delivers standalone value for error prevention.

**Acceptance Scenarios**:

1. **Given** an import statement `import foo from './missing.html'`, **When** file doesn't exist, **Then** compilation error reports "HTML file not found: ./missing.html"
2. **Given** an import statement with relative path `import bar from '../../../outside.html'`, **When** file is outside project directory, **Then** compilation error reports "HTML imports must be within project directory" for security
3. **Given** an HTML file with invalid syntax or encoding, **When** imported, **Then** warning indicates potential issues but doesn't block compilation
4. **Given** duplicate variable names from imports, **When** compiling, **Then** error reports "Variable '@foo' is already defined"

---

### Edge Cases

- What happens when HTML file contains template syntax or placeholders (e.g., `{{variable}}`)?
- How does system handle HTML files with external dependencies (CSS links, script tags, image references)?
- What occurs when imported HTML file is modified during development (hot-reload scenario)?
- How are circular dependencies handled (File A imports B, B imports A)?
- What happens when HTML file contains only whitespace or is empty?
- How does system handle HTML files with different character encodings (UTF-8, UTF-16, etc.)?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST support `import [variableName] from '[path]'` syntax for importing HTML files as string variables
- **FR-002**: System MUST load HTML file content as a complete string and assign to the named variable
- **FR-003**: HTML import variables MUST be referenceable using `@[variableName]` syntax in operations
- **FR-004**: System MUST distinguish between `layout "[path]"` statements (which assign to `layoutTemplate`) and `import` statements (which create variables)
- **FR-005**: System MUST validate HTML import paths resolve to existing files at compile-time
- **FR-006**: System MUST support relative path resolution for HTML imports (e.g., `./`, `../`)
- **FR-007**: System MUST detect and report duplicate variable names from HTML imports
- **FR-008**: Imported HTML variables MUST be available throughout the entire timeline/action scope where they are defined
- **FR-009**: System MUST preserve HTML content exactly as written in the file (no parsing or transformation)
- **FR-010**: System MUST support multiple HTML imports in a single Eligian file
- **FR-011**: HTML import statements MUST work in both timeline-level and action-level scopes
- **FR-012**: System MUST report clear compilation errors when HTML files cannot be read or don't exist
- **FR-013**: System MUST restrict HTML imports to files within the project directory and reject paths that escape the project boundary for security

### Key Entities

- **HTML Import Statement**: Represents `import [name] from '[path]'` declaration that loads HTML file content as a string variable
  - Variable name: Identifier used to reference the content
  - File path: Relative path to HTML file
  - Scope: Where the variable is accessible (program-level vs. action-level)

- **HTML Variable**: Runtime representation of imported HTML content
  - Name: Variable identifier (referenced with `@` prefix)
  - Content: Raw HTML string from file
  - Type: String type in Eligian's type system

- **Layout Declaration**: Existing `layout "[path]"` statement that assigns HTML to configuration's `layoutTemplate`
  - Distinct from imports - not referenceable as a variable
  - Single-use per program (one layout per configuration)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Developers can import HTML files and use their content in operations within 30 seconds of writing the import statement
- **SC-002**: HTML import feature reduces inline HTML string usage by 80% in typical Eligian projects
- **SC-003**: Compilation time increases by less than 10% when projects include HTML imports
- **SC-004**: 95% of HTML import path errors are caught at compile-time with actionable error messages
- **SC-005**: Developers can distinguish between layout and import statements without consulting documentation (self-documenting syntax)
- **SC-006**: HTML variables are referenceable in any operation that accepts string content without special handling
- **SC-007**: Projects with HTML imports have 50% fewer bugs related to HTML content errors (vs. inline strings)

## Assumptions *(optional)*

- HTML files are UTF-8 encoded by default (standard for web content)
- HTML imports are resolved at compile-time and content is embedded in generated configuration
- HTML files are static content (no server-side processing or template rendering)
- Imported HTML content is treated as opaque strings (no syntax validation or transformation)
- File paths use forward slashes (/) for cross-platform compatibility
- HTML imports follow same scoping rules as other Eligian variables
- Maximum HTML file size is reasonable for web content (assume <1MB per file as reasonable default)
- HTML file modifications during development trigger recompilation (similar to other file changes)

## Dependencies *(optional)*

- **Existing Import System**: Builds on existing asset import infrastructure (CSS imports, media imports)
- **Variable System**: Requires Eligian variable syntax (`@variableName`) to already support string types
- **File System Access**: Needs file reading capabilities at compile-time (already exists for other imports)
- **Scoping System**: Depends on existing action and program scope rules

## Constraints *(optional)*

- HTML content cannot be dynamically generated or modified at runtime (compile-time only)
- Imported HTML is embedded in configuration JSON (affects bundle size)
- File paths must be relative to Eligian source file (no absolute paths for portability)
- Cannot import HTML from URLs or external sources (local files only)
- HTML variables are immutable once imported (cannot be modified in timeline)
