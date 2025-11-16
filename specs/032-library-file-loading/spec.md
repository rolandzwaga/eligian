# Feature Specification: Library File Loading in Compiler Pipeline

**Feature Branch**: `032-library-file-loading`
**Created**: 2025-11-16
**Status**: Draft
**Input**: User description: "Library file loading in compiler pipeline - load imported .eligian library files during compilation"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - CLI Compilation with Library Imports (Priority: P1)

As a developer using the CLI compiler, I want to compile `.eligian` files that import custom actions from library files, so that I can reuse action definitions across multiple timeline programs.

**Why this priority**: This is the core missing functionality that blocks Feature 023 (library imports) from working in the CLI compiler. The grammar, scoping, and validation are already implemented, but the compiler fails because library files are never loaded into the Langium workspace.

**Independent Test**: Can be fully tested by creating a simple `.eligian` file with a library import statement, running the CLI compiler, and verifying the output JSON contains the expanded action calls. Delivers immediate value by enabling modular code organization.

**Acceptance Scenarios**:

1. **Given** a library file `animations.eligian` with action `fadeIn` and a program file importing it, **When** I run `pnpm --filter @eligian/cli run build:cli && node packages/cli/out/index.js program.eligian`, **Then** compilation succeeds and output JSON contains the `fadeIn` actions operations
2. **Given** a program file with multiple library imports, **When** I compile it, **Then** all imported actions are resolved correctly
3. **Given** a program file with aliased library imports (`import { fadeIn as appear }`), **When** I compile it, **Then** the aliased action name is resolved correctly

---

### User Story 2 - Error Reporting for Missing Libraries (Priority: P2)

As a developer using the CLI compiler, I want clear error messages when library files cannot be found or loaded, so that I can quickly diagnose and fix import path issues.

**Why this priority**: This improves developer experience by providing actionable error messages, but is secondary to making the basic functionality work (P1).

**Independent Test**: Can be tested by intentionally creating broken import paths and verifying error messages are clear and actionable. Delivers value by reducing debugging time.

**Acceptance Scenarios**:

1. **Given** a program file importing a non-existent library, **When** I compile it, **Then** I see error: "Library file not found: './missing.eligian'"
2. **Given** a program file importing a library with syntax errors, **When** I compile it, **Then** I see error: "Library file has parse errors: './broken.eligian' (line X, column Y)"
3. **Given** a program file with circular library imports, **When** I compile it, **Then** I see error: "Circular dependency detected: A → B → A"

---

### User Story 3 - Nested Library Dependencies (Priority: P3)

As a developer, I want library files to be able to import other library files, so that I can build layered abstractions and organize complex action libraries.

**Why this priority**: This is an advanced feature that extends the basic library loading (P1) to support nested dependencies. Useful for large projects but not essential for initial MVP.

**Independent Test**: Can be tested by creating a chain of library imports (A imports B, B imports C) and verifying all actions resolve correctly. Delivers value for complex projects with hierarchical action libraries.

**Acceptance Scenarios**:

1. **Given** library A imports library B which imports library C, **When** I compile a program importing A, **Then** all actions from A, B, and C are available
2. **Given** nested library dependencies, **When** any library in the chain has an error, **Then** I see error with full dependency path
3. **Given** nested libraries with name collisions, **When** I compile, **Then** validation catches the collision with clear error message

---

### Edge Cases

- What happens when a library import path uses `../` to reference parent directories?
- How does the system handle platform-specific path separators (Windows \ vs Unix `/`)?
- What happens when two libraries export actions with the same name?
- How does the system handle library files that are valid syntax but have semantic errors?
- What happens when a library file changes between reading the import statement and loading the library?
- How does the system handle very large library files (>1MB)?
- What happens when library imports create deep nesting (10+ levels)?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Compiler MUST extract library import paths from `LibraryImport` AST nodes in the program
- **FR-002**: Compiler MUST resolve relative library paths relative to the importing file's directory
- **FR-003**: Compiler MUST load library file content from the file system using the resolved path
- **FR-004**: Compiler MUST parse library file content into a Langium document using `LangiumDocumentFactory.fromString()`
- **FR-005**: Compiler MUST add library documents to the Langium workspace's `LangiumDocuments` collection
- **FR-006**: Compiler MUST build library documents using `DocumentBuilder.build()` to link cross-references
- **FR-007**: Compiler MUST re-link the main program document after all libraries are loaded to resolve action references
- **FR-008**: Compiler MUST handle file I/O errors for missing library files with clear error messages
- **FR-009**: Compiler MUST handle parse errors in library files with error location information
- **FR-010**: Compiler MUST detect circular dependencies between library files and report errors

### Key Entities *(include if feature involves data)*

- **Library Document**: Represents a parsed `.eligian` library file in the Langium workspace, containing action definitions available for import
- **Library Import Path**: The relative file path from an importing document to a library file, as specified in the `import` statement
- **Document Workspace**: Langium's collection of all loaded documents (program + libraries), used for cross-reference resolution

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: CLI compiler successfully compiles programs with library imports without "Could not resolve reference" errors
- **SC-002**: Compilation with library imports completes in <2 seconds for typical projects (1 program + 5 libraries)
- **SC-003**: Error messages for missing library files include the expected file path and importing location
- **SC-004**: Nested library dependencies (up to 10 levels deep) resolve correctly without stack overflow or performance degradation

## Assumptions

- Library files use the same `.eligian` file extension as program files
- Library import paths are relative (not absolute or using node_modules resolution)
- The file system is available and accessible (not running in a browser environment)
- Langium's document workspace can handle multiple documents simultaneously
- The existing scope provider's `getImportedActions()` method works correctly once library documents are loaded

## Dependencies

- **Langium Framework**: Requires `LangiumDocumentFactory`, `DocumentBuilder`, and `LangiumDocuments` services
- **Feature 023**: Builds on existing library import grammar, scope provider, and validation
- **Node.js fs module**: Required for reading library file content from disk
- **Effect-TS**: Compiler pipeline uses Effect for error handling and composition

## Out of Scope

- **Library package resolution**: No support for importing libraries from `node_modules` or package registries
- **Library versioning**: No semantic versioning or compatibility checking between libraries
- **Library caching**: No caching of parsed library documents across multiple compilations
- **Workspace-wide library index**: No global registry of available libraries for autocomplete
- **Library bundling**: No support for bundling multiple libraries into a single distributable file
- **Hot-reload in CLI**: Library changes require full recompilation (hot-reload is extension-only)

## Technical Context

### Current Implementation Status

**Already Implemented (Feature 023)**:
- Grammar for `import { actionName } from "path"` syntax (eligian.langium)
- Scope provider methods: `getImportedActions()`, `getScopeForActionImport()` (eligian-scope-provider.ts:131-173, 395-455)
- Validation for private action filtering and duplicate imports (eligian-validator.ts)

**Missing Implementation**:
- Library file loading in compiler pipeline (pipeline.ts:290-345)
- The scope provider's `getImportedActions()` attempts to load library documents, but fails because they were never added to the workspace

### Error Manifestation

When compiling a file with library imports using the CLI:

```
Unknown Error: {
  "_tag":"ParseError",
  "message":"Could not resolve reference to ActionDefinition named 'fadeIn'.",
  "location":{"line":3,"column":10,"length":6},
  "hint":"Semantic validation failed"
}
```

**Root Cause**: The library file `animations.eligian` is never loaded into the Langium workspace, so when the scope provider tries to resolve the `fadeIn` reference, it cannot find the library document.

### Required Code Location

**File**: `packages/language/src/compiler/pipeline.ts`
**Location**: After CSS file loading (around line 340), before validation
**Required Operations**:
1. Extract library imports from program AST
2. Load each library file from file system
3. Parse library content into Langium document
4. Add library document to workspace
5. Build library document to link its internal cross-references
6. Re-link main document after all libraries loaded

### Integration Points

- **Scope Provider**: Already has logic to find imported actions, will work automatically once libraries are loaded
- **Validator**: Already validates library imports, will work automatically once libraries are loaded
- **Effect Pipeline**: Library loading should use `Effect.tryPromise()` for file I/O error handling
- **Error Reporter**: Should format library loading errors with file path and importing location

## References

- **Feature 023 Spec**: `specs/023-library-files-with/spec.md` - Original library import feature
- **Scope Provider Implementation**: `packages/language/src/eligian-scope-provider.ts:131-173` - `getImportedActions()` method
- **Technical Overview**: `specs/TECHNICAL_OVERVIEW.md` - Compiler pipeline architecture
- **Example Test File**: `test-import.eligian` - Reproduces the "Could not resolve reference" error
- **Library Example**: `examples/libraries/animations.eligian` - Sample library file
