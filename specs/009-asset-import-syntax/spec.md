# Feature Specification: Asset Import Syntax

**Feature Branch**: `009-asset-import-syntax`
**Created**: 2025-10-25
**Status**: Draft
**Input**: User description: "Asset Import Syntax: Support import statements for HTML, CSS, and media assets with named and default imports, type inference from extensions, and relative path validation"

## User Scenarios & Testing

### User Story 1 - Default Layout Import (Priority: P1)

As a timeline developer, I want to specify the main HTML layout template using a simple syntax, so that I can quickly set up the visual structure for my Eligius presentation.

**Why this priority**: This is the foundation of every Eligius timeline - without a layout template, there's no visual structure. This must work first before any other asset features.

**Independent Test**: Can be fully tested by writing `layout './template.html'` in an Eligian file and verifying it parses correctly without errors. Delivers immediate value by validating the most common import use case.

**Acceptance Scenarios**:

1. **Given** an empty Eligian file, **When** I write `layout './layout.html'`, **Then** the parser accepts it without errors
2. **Given** a layout import with valid relative path, **When** I compile the file, **Then** no syntax errors are reported
3. **Given** a layout import with absolute path `/absolute/path.html`, **When** I compile the file, **Then** I receive error "Import path must be relative (start with './' or '../'), absolute paths are not portable"

---

### User Story 2 - Named HTML Imports (Priority: P2)

As a timeline developer, I want to import reusable HTML snippets with descriptive names, so that I can reference them in operations like `setElementContent()` throughout my timeline.

**Why this priority**: Enables code reuse and modular HTML components. Critical for building complex timelines, but the timeline can function with just a layout template.

**Independent Test**: Can be fully tested by importing named HTML files and verifying the imports are recognized as valid identifiers. Delivers value by enabling HTML snippet reuse.

**Acceptance Scenarios**:

1. **Given** an Eligian file, **When** I write `import tooltip from './tooltip.html'`, **Then** the parser accepts it and recognizes `tooltip` as a valid identifier
2. **Given** two named imports `import a from './a.html'` and `import b from './b.html'`, **When** I compile the file, **Then** both imports are accepted without errors
3. **Given** duplicate imports `import tooltip from './a.html'` and `import tooltip from './b.html'`, **When** I compile the file, **Then** I receive error "Duplicate import name 'tooltip', import names must be unique"

---

### User Story 3 - CSS and Media Imports (Priority: P2)

As a timeline developer, I want to import CSS stylesheets and media files with the same syntax as HTML, so that I can organize all my timeline assets consistently.

**Why this priority**: Completes the asset import syntax coverage for all supported asset types. Equally important as named HTML imports for feature completeness.

**Independent Test**: Can be fully tested by importing CSS and media files and verifying type inference works correctly. Delivers value by supporting all asset types needed for timelines.

**Acceptance Scenarios**:

1. **Given** an Eligian file, **When** I write `styles './main.css'`, **Then** the parser accepts it without errors
2. **Given** an Eligian file, **When** I write `provider './video.mp4'`, **Then** the parser accepts it without errors
3. **Given** a named import `import theme from './theme.css'`, **When** I compile the file, **Then** the parser infers type as CSS from the extension
4. **Given** a named import `import intro from './intro.mp4'`, **When** I compile the file, **Then** the parser infers type as media from the extension

---

### User Story 4 - Type Inference and Override (Priority: P3)

As a timeline developer, I want the language to automatically detect asset types from file extensions, but also allow me to explicitly specify types for non-standard extensions, so that I can work with files that don't follow naming conventions.

**Why this priority**: Nice-to-have for edge cases. Most developers will use standard extensions, making explicit type override less critical for MVP.

**Independent Test**: Can be fully tested by importing files with both standard and non-standard extensions, verifying inference and explicit type override. Delivers value for teams with non-standard file naming.

**Acceptance Scenarios**:

1. **Given** a file with `.html` extension, **When** I write `import foo from './foo.html'`, **Then** type is inferred as HTML
2. **Given** a file with `.css` extension, **When** I write `import bar from './bar.css'`, **Then** type is inferred as CSS
3. **Given** a file with `.mp4` extension, **When** I write `import video from './video.mp4'`, **Then** type is inferred as media
4. **Given** a file with unknown extension `.xyz`, **When** I write `import data from './data.xyz'`, **Then** I receive error "Unknown file extension '.xyz', please specify type: import foo from './file.xyz' as html|css|media"
5. **Given** a file with unknown extension, **When** I write `import data from './data.xyz' as html`, **Then** the parser accepts it and sets type to HTML

---

### User Story 5 - Path Validation (Priority: P1)

As a timeline developer, I want the language to enforce relative paths and reject absolute paths, so that my timeline code remains portable across different environments and team members.

**Why this priority**: Critical for code portability and preventing runtime errors. Must be enforced from the start to establish good practices.

**Independent Test**: Can be fully tested by attempting to import with various path formats and verifying only relative paths are accepted. Delivers immediate value by preventing portability issues.

**Acceptance Scenarios**:

1. **Given** an import with path `./relative/path.html`, **When** I compile the file, **Then** the parser accepts it
2. **Given** an import with path `../parent/path.html`, **When** I compile the file, **Then** the parser accepts it
3. **Given** an import with path `/absolute/path.html`, **When** I compile the file, **Then** I receive error about absolute paths not being portable
4. **Given** an import with path `C:\absolute\windows\path.html`, **When** I compile the file, **Then** I receive error about absolute paths not being portable
5. **Given** an import with path `https://example.com/remote.html`, **When** I compile the file, **Then** I receive error about absolute paths not being portable

---

### Edge Cases

- What happens when an import name conflicts with a reserved keyword (e.g., `import if from './if.html'`)? **Expected**: Error message explaining reserved keywords cannot be used as import names
- What happens when an import name conflicts with a built-in operation name (e.g., `import selectElement from './select.html'`)? **Expected**: Error message explaining operation names cannot be used as import names
- What happens when the file extension has mixed case (e.g., `.HTML`, `.Css`)? **Expected**: Extension is treated case-insensitively, `.HTML` is recognized as HTML type
- What happens when a file has multiple extensions (e.g., `template.min.html`)? **Expected**: Final extension is used for type inference, treated as HTML
- What happens when importing a file from a deeply nested relative path (e.g., `../../../shared/assets/layout.html`)? **Expected**: Path is accepted as valid relative path
- What happens when a default import (`layout`, `styles`, `provider`) is declared multiple times? **Expected**: Error message about duplicate default import of the same type
- What happens when trying to use an import name before it's declared? **Expected**: Error message about undefined identifier (handled by existing scoping rules)
- What happens with `.ogg` files (ambiguous audio/video)? **Expected**: Error requiring explicit type override `as media`

## Requirements

### Functional Requirements

- **FR-001**: System MUST support default import syntax `layout './path.html'` for assigning HTML to layoutTemplate property
- **FR-002**: System MUST support default import syntax `styles './path.css'` for registering CSS for future completions
- **FR-003**: System MUST support default import syntax `provider './path.mp4'` for assigning media to timelineProvider source
- **FR-004**: System MUST support named import syntax `import name from './path.ext'` for reusable asset references
- **FR-005**: System MUST support explicit type override syntax `import name from './path.ext' as type` where type is `html`, `css`, or `media`
- **FR-006**: System MUST infer asset type from file extension: `.html` → HTML, `.css` → CSS, `.mp4/.webm/.ogg` → video media, `.mp3/.wav/.ogg` → audio media
- **FR-007**: System MUST reject imports with unknown file extensions unless explicit type is provided via `as type` suffix
- **FR-008**: System MUST validate that import paths are relative (start with `./` or `../`)
- **FR-009**: System MUST reject absolute paths (starting with `/`, `C:\`, or protocol like `https://`) with error message explaining portability requirement
- **FR-010**: System MUST validate that import names are unique within a document
- **FR-011**: System MUST validate that import names are valid identifiers (not reserved keywords or operation names)
- **FR-012**: System MUST make imported names available as identifiers in the global scope of the document
- **FR-013**: System MUST support multiple default imports (one `layout`, one `styles`, one `provider`) without conflict
- **FR-014**: System MUST reject duplicate default imports of the same type (e.g., two `layout` imports)
- **FR-015**: System MUST provide clear error messages for all import syntax violations
- **FR-016**: System MUST treat file extensions case-insensitively (`.html` and `.HTML` are equivalent)
- **FR-017**: System MUST use the final extension for type inference when multiple extensions exist (e.g., `file.min.html` uses `.html`)
- **FR-018**: System MUST require explicit type override for ambiguous extensions (`.ogg` files)

### Key Entities

- **Default Import**: Represents a special import that auto-assigns to a configuration property (`layout`, `styles`, `provider`). Contains import type and relative file path.
- **Named Import**: Represents a reusable asset reference with a developer-chosen identifier. Contains name, relative file path, and asset type (inferred or explicit).
- **Asset Type**: Classification of imported file as HTML, CSS, or media. Determines how the asset can be used in the timeline.
- **Import Path**: Relative file path (starting with `./` or `../`) that resolves from the location of the `.eligian` file.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Developers can import layout templates without encountering syntax errors for valid relative paths
- **SC-002**: Developers receive clear, actionable error messages within 1 second when using invalid import syntax (absolute paths, duplicate names, unknown extensions)
- **SC-003**: 100% of valid import combinations (default + named, multiple types, explicit overrides) parse correctly without errors
- **SC-004**: Import syntax validation catches 100% of portability issues (absolute paths) at parse time before any file loading occurs
- **SC-005**: Developer can write and validate a complete asset import section (layout, styles, provider, and named imports) in under 5 minutes without consulting documentation for common cases

## Scope

### In Scope

- Grammar definition for default imports (`layout`, `styles`, `provider`)
- Grammar definition for named imports (`import name from 'path'`)
- Grammar definition for explicit type override (`as html|css|media`)
- AST node types for representing imports in the parsed tree
- Syntax validation for import statements (path format, name uniqueness, type inference)
- Error messages for invalid import syntax
- Type inference from file extensions
- Relative path format validation

### Out of Scope (Future Features)

- File existence checking (verifying imported files exist on disk)
- File content loading (reading HTML, CSS, or media files)
- File content validation (verifying HTML is well-formed, CSS is valid, etc.)
- CSS class/ID extraction for code completions
- HTML content inlining into compiled JSON
- Media file format validation
- Asset bundling and optimization
- Absolute path resolution
- Hot reload of asset files in IDE
- Asset file watching for changes

## Assumptions

- Import statements appear at the top level of the Eligian document (not nested inside actions or timeline events)
- File extensions are case-insensitive (`.html` and `.HTML` are treated the same)
- Multiple file extensions are handled by checking the final extension (e.g., `template.min.html` is treated as `.html`)
- Import names follow standard identifier rules (alphanumeric + underscore, cannot start with digit)
- Reserved keywords and built-in operation names cannot be used as import names
- All imported files will be resolved relative to the `.eligian` file's directory at compile time (in future feature)
- `.ogg` extension is ambiguous (could be audio or video) and requires explicit type override
- Default imports (`layout`, `styles`, `provider`) can appear in any order in the document
- Named imports can appear before or after default imports
- Import statements can be interspersed with other top-level declarations (like action definitions)

## Dependencies

- Langium grammar system for defining import syntax
- Existing Eligian grammar structure for integrating import statements
- Existing validation framework for adding import-specific validators

## Constraints

- Must maintain backward compatibility with existing Eligian files that don't use imports
- Syntax must be intuitive for developers familiar with ES modules (JavaScript/TypeScript)
- Error messages must be beginner-friendly and explain why the syntax is invalid
- Grammar must be unambiguous to ensure consistent parsing
