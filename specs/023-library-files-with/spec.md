# Feature Specification: Library Files with Action Imports

**Feature Branch**: `023-library-files-with`
**Created**: 2025-11-02
**Status**: Draft
**Input**: User description: "Library files with action imports - Allow .eligian library files containing reusable custom actions that can be imported by other Eligian programs"

## User Scenarios & Testing

### User Story 1 - Create Reusable Action Library (Priority: P1)

As a developer building multiple Eligian presentations, I want to create library files containing reusable animation actions so that I can share common functionality across multiple projects without copy-pasting code.

**Why this priority**: This is the foundation of the entire feature. Without the ability to create and define library files, nothing else is possible. This represents the minimum viable functionality - developers can create libraries and understand the difference between library and program files.

**Independent Test**: Can be fully tested by creating a `.eligian` file with the `library` keyword and multiple action definitions, then verifying the file is recognized as a library (not a program) by the language server and compiler.

**Acceptance Scenarios**:

1. **Given** I want to create a reusable animation library, **When** I create a file named `animations.eligian` with the `library` keyword and action definitions, **Then** the file is recognized as a valid library file
2. **Given** I have a library file with 5 custom actions, **When** I open it in VS Code, **Then** syntax highlighting and validation work correctly for all actions
3. **Given** I try to add a timeline to a library file, **When** validation runs, **Then** I receive an error stating "Library files cannot contain timelines"
4. **Given** I try to add a styles import to a library file, **When** validation runs, **Then** I receive an error stating "Library files cannot contain imports"
5. **Given** I have two actions with the same name in a library, **When** validation runs, **Then** I receive an error stating "Duplicate action name"

---

### User Story 2 - Import Actions from Library (Priority: P1)

As a developer writing an Eligian program, I want to import specific actions from a library file so that I can use pre-built animations and operations without redefining them in every program.

**Why this priority**: This is the other half of the MVP. Combined with US1, it delivers complete end-to-end value - create a library, import from it, and use the imported actions. Without this, libraries would be useless.

**Independent Test**: Can be fully tested by creating a library file with actions, then creating a program file that imports those actions and uses them in a timeline. Verify imported actions work identically to locally-defined actions.

**Acceptance Scenarios**:

1. **Given** I have a library file `animations.eligian` with a `fadeIn` action, **When** I import it using `import { fadeIn } from "./animations.eligian"` in my program, **Then** I can call `fadeIn()` in my timeline
2. **Given** I import multiple actions `import { fadeIn, fadeOut, slideIn } from "./animations.eligian"`, **When** I use all three in my timeline, **Then** all actions execute correctly
3. **Given** I import an action with an alias `import { fadeIn as fade } from "./animations.eligian"`, **When** I call `fade()`, **Then** it executes the `fadeIn` action
4. **Given** I try to import a non-existent action `import { missing } from "./animations.eligian"`, **When** validation runs, **Then** I receive an error "Action 'missing' not found in library"
5. **Given** I import an action but never use it, **When** compilation runs, **Then** the imported action is still included in the output (no tree-shaking yet)

---

### User Story 3 - Private Action Encapsulation (Priority: P2)

As a library author, I want to mark internal helper actions as `private` so that library consumers cannot import or depend on my implementation details, allowing me to refactor internals without breaking their code.

**Why this priority**: This is a quality-of-life improvement for library authors. While not essential for basic library functionality, it enables better API design, maintainability, and prevents accidental coupling to internal implementation. It's the difference between a "working" library and a "well-designed" library.

**Independent Test**: Can be fully tested by creating a library with both public and private actions, then attempting to import the private action from another file and verifying it's blocked by validation.

**Acceptance Scenarios**:

1. **Given** I have a library with `private action resetOpacity()`, **When** I try to import it via `import { resetOpacity } from "./lib.eligian"`, **Then** I receive an error "Cannot import private action 'resetOpacity'"
2. **Given** I have a library with a private helper action, **When** a public action in the same library calls the private action, **Then** the call succeeds (private actions are accessible within their own library)
3. **Given** I mark an action as private in a program file (not library), **When** validation runs, **Then** I receive an error "Visibility modifier 'private' can only be used in library files"
4. **Given** I have a library with 3 public and 2 private actions, **When** I view auto-completion for imports, **Then** only the 3 public actions appear in the suggestion list
5. **Given** I refactor a library's private action, **When** programs importing the library recompile, **Then** no errors occur (private changes don't affect consumers)

---

### User Story 4 - IDE Support for Imported Actions (Priority: P2)

As a developer using imported actions, I want IDE features like auto-completion, hover documentation, and go-to-definition to work seamlessly so that I can discover and understand library actions without reading source files manually.

**Why this priority**: This dramatically improves developer experience and library discoverability. Without IDE support, developers would need to manually browse library files to find actions, read their parameters, and understand their purpose. This feature makes libraries feel like first-class language constructs.

**Independent Test**: Can be fully tested by importing an action with JSDoc documentation, then verifying hover tooltips display the docs, auto-completion suggests the action, and go-to-definition jumps to the library file.

**Acceptance Scenarios**:

1. **Given** I type `import { | } from "./lib.eligian"` (cursor at `|`), **When** I trigger auto-completion, **Then** I see a list of all public actions from the library
2. **Given** I have imported `fadeIn` with JSDoc documentation, **When** I hover over `fadeIn("#box", 1000)` in my timeline, **Then** I see the formatted documentation including description and parameter info
3. **Given** I imported an action, **When** I Ctrl+Click (or Cmd+Click) on the action name, **Then** my editor jumps to the action definition in the library file
4. **Given** I have imported `fadeIn` but mistype it as `fadIn`, **When** validation runs, **Then** I receive an error with a suggestion "Unknown action 'fadIn'. Did you mean 'fadeIn'?"
5. **Given** I type the start of an imported action name in a timeline, **When** I trigger auto-completion, **Then** the imported action appears in suggestions alongside locally-defined actions

---

### User Story 5 - Library Name Collision Prevention (Priority: P3)

As a developer, I want the system to prevent me from creating actions with names that conflict with built-in operations so that I don't accidentally shadow core functionality or create confusing code.

**Why this priority**: This is a safety/validation feature that prevents foot-guns. While important for code quality, it's less critical than core functionality. Developers can work around this manually by choosing different names, but automated validation improves the experience.

**Independent Test**: Can be fully tested by attempting to create a library action named after a built-in operation (e.g., `selectElement`) and verifying validation blocks it with a clear error message.

**Acceptance Scenarios**:

1. **Given** I create a library action named `selectElement`, **When** validation runs, **Then** I receive an error "Action name 'selectElement' conflicts with built-in operation"
2. **Given** I create a library action named `fadeIn` (not a built-in), **When** validation runs, **Then** no error occurs
3. **Given** I import two libraries that both export an action named `fadeIn`, **When** I try to import both, **Then** I receive an error "Duplicate import: 'fadeIn' is exported by multiple libraries"
4. **Given** I import an action with the same name as a locally-defined action, **When** validation runs, **Then** I receive an error "Action 'fadeIn' is already defined locally"
5. **Given** I import an action with an alias that conflicts with a local action, **When** validation runs, **Then** I receive the same conflict error

---

### Edge Cases

- **Empty library files**: What happens when a library file contains `library myLib` but no actions? (Should be valid but useless - warning might be appropriate)
- **Circular imports**: What happens if library A imports from library B, and library B imports from library A? (Should be prevented with clear error)
- **Library imports library**: What happens if a library file tries to import actions from another library? (Currently forbidden by design - libraries cannot contain imports)
- **Deeply nested library paths**: How does the system handle `import { fadeIn } from "../../shared/animations/motion.eligian"`? (Should work - path resolution relative to current file)
- **Missing library files**: What happens if an imported library file doesn't exist or was deleted? (Validation error with file path shown)
- **Library file renamed**: What happens if a library file is renamed while other files import from the old path? (Validation errors in all importing files - IDE could provide "update imports" refactoring)
- **Action signature changes**: What happens if a library action's parameters change (add/remove/rename)? (Importing files show validation errors at call sites - breaking change)
- **Private action called from another library**: What happens if library A tries to call a private action from library B? (Validation error - private actions only accessible within their own library)
- **Import with typo in library name**: What happens if developer types `import { fadeIn } from "./animtions.eligian"`? (File not found error with "Did you mean: ./animations.eligian?" suggestion)
- **Reserved keywords as action names**: What happens if an action is named `library`, `import`, `timeline`, `action`? (Should be prevented - validation error for reserved keywords)

## Requirements

### Functional Requirements

#### Library File Structure

- **FR-001**: System MUST recognize files with `library [name]` declaration as library files (distinct from program files)
- **FR-002**: Library files MUST only contain action definitions (both regular `action` and `endable action`)
- **FR-003**: Library files MUST NOT contain timeline definitions, constant declarations, or import statements
- **FR-004**: System MUST validate that all actions within a library have unique names
- **FR-005**: System MUST prevent actions from using names that conflict with built-in operations

#### Action Visibility

- **FR-006**: Actions in library files MAY be marked with the `private` keyword to restrict visibility
- **FR-007**: Actions without the `private` keyword MUST be public (importable) by default
- **FR-008**: The `public` keyword MUST NOT be supported (visibility is implicit when `private` is omitted)
- **FR-009**: The `private` keyword MUST only be allowed in library files (not in program files)
- **FR-010**: Private actions MUST be callable by other actions within the same library file
- **FR-011**: Private actions MUST NOT be importable by external files

#### Import Statements

- **FR-012**: Program files MUST support import statements using syntax: `import { action1, action2 } from "path/to/library.eligian"`
- **FR-013**: Import statements MUST support action aliasing using syntax: `import { action1 as alias1 } from "library.eligian"`
- **FR-014**: Import paths MUST be resolved relative to the current file's directory
- **FR-015**: System MUST validate that imported library files exist and are valid libraries
- **FR-016**: System MUST validate that all imported actions exist in the target library and are public
- **FR-017**: System MUST prevent importing actions that conflict with locally-defined actions
- **FR-018**: System MUST prevent importing the same action name from multiple libraries (unless aliased)

#### Scoping and Resolution

- **FR-019**: Imported actions MUST be usable anywhere locally-defined actions can be used (timelines, control flow, sequences, staggers)
- **FR-020**: Name resolution MUST follow standard shadowing semantics: locally-defined actions first, then imported actions, then built-in operations
- **FR-021**: System MUST provide clear error messages when imported actions are not found, with suggestions for similar names
- **FR-022**: Auto-completion MUST only suggest public actions when completing import statements

#### Compilation

- **FR-023**: Compiler MUST expand imported action calls identically to locally-defined action calls (requestAction + startAction pattern)
- **FR-024**: Compiler MUST include imported action definitions in the compiled output
- **FR-025**: Compiler MUST handle library files correctly when compiling standalone (ignore library keyword, export nothing)

### Key Entities

- **Library File**: An `.eligian` file containing the `library` keyword and one or more action definitions, with no timelines, constants, or imports
- **Library Action**: A custom action defined within a library file, either public (default) or private (explicitly marked)
- **Import Statement**: A declaration in a program file that makes actions from a library file available for use, with optional aliasing
- **Action Visibility**: A property of library actions determining whether they can be imported (public) or are internal-only (private)

## Success Criteria

### Measurable Outcomes

**Performance Baseline**: All timing criteria measured on developer workstation (8GB RAM, SSD, VS Code with Eligian extension).

- **SC-001**: Developers can create library files with multiple actions and receive validation feedback in under 1 second
- **SC-002**: Developers can import actions from library files and use them in timelines without any additional setup or configuration
- **SC-003**: Imported actions execute identically to locally-defined actions in 100% of scenarios (same compilation output)
- **SC-004**: IDE auto-completion for library imports displays all public actions from the target library within 500ms
- **SC-005**: Attempting to import a private action results in a clear validation error shown in the IDE within 1 second
- **SC-006**: Hover documentation for imported actions displays JSDoc content identically to locally-defined actions
- **SC-007**: Go-to-definition for imported actions navigates to the library file within 500ms
- **SC-008**: Library files with syntax errors or constraint violations (e.g., containing timelines) show validation errors within 1 second
- **SC-009**: Name collision errors (action conflicts with built-in operations or other imports) are detected and reported within 1 second
- **SC-010**: Developers can refactor private actions in libraries without breaking any importing program files (validation still passes)

## Out of Scope

The following are explicitly **not** included in this feature:

- **Tree-shaking**: Imported but unused actions will still be included in compiled output (optimization for future)
- **Cross-library imports**: Library files cannot import from other libraries (only program files can import)
- **Circular import detection**: No automatic detection or prevention of circular import chains (assumed not needed for MVP)
- **Library versioning**: No support for version constraints or semantic versioning of libraries
- **Package management**: No central repository, package installation, or dependency management (all imports are file-path based)
- **Module bundling**: No bundling or packaging of multiple library files into a single distributable unit
- **Re-exporting**: Libraries cannot re-export actions from other libraries (no `export { x } from "./other.eligian"`)
- **Namespace imports**: No support for `import * as animations from "./lib.eligian"` syntax
- **Default exports**: No support for default exports or unnamed imports
- **Dynamic imports**: No runtime import() function or conditional imports
- **Import side effects**: Libraries cannot have initialization code or side effects beyond defining actions
- **Backward compatibility mode**: No support for running old programs that don't use library syntax

## Dependencies

- **Langium grammar**: Must be extended to support `library` keyword, `private` modifier, and `import` statements
- **Langium scoping**: Must implement custom scope provider to filter private actions from exports
- **Existing validation**: Builds on existing action validation and name resolution infrastructure
- **IDE features**: Depends on existing hover provider, completion provider, and definition provider
- **Compiler transformer**: Extends existing AST transformation to resolve and merge imported actions
- **File system access**: Requires ability to read and parse library files referenced in imports

## Assumptions

- **File paths are relative**: Import paths are always relative to the importing file (no absolute paths or special module resolution)
- **Single library per file**: Each library file contains exactly one `library` declaration (no multi-library files)
- **Libraries are stateless**: Library actions have no shared state or initialization requirements beyond their definitions
- **Import-time validation**: All import validation happens at parse/validation time (not at runtime)
- **UTF-8 encoding**: All library files use UTF-8 encoding (same as program files)
- **File extension required**: Import paths must include `.eligian` extension (no automatic extension resolution)
- **No remote libraries**: All library files must be local files accessible via file system (no HTTP URLs)
- **Same-project libraries**: Libraries and programs are assumed to be in the same project/workspace (no cross-project imports)
- **Developers understand visibility**: Developers are familiar with public/private concepts from other languages (no extensive education needed)
- **Library authors write docs**: Library actions should include JSDoc documentation for best IDE experience (but not enforced)

## Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Name collisions between multiple imported libraries | High - Could break existing code when adding new imports | Medium | Provide clear error messages with suggestions to use aliases. Document best practices for library naming conventions. |
| Breaking changes in library signatures | High - Programs break when library actions change parameters | High | Document that libraries should be versioned carefully. Consider adding deprecation warnings in future. No automatic migration for MVP. |
| Performance with large libraries | Medium - IDE could slow down with 100+ action libraries | Low | Test with realistic library sizes. Optimize scope provider if needed. Libraries should be focused/small by design. |
| Circular import confusion | Medium - Developers try to make libraries import each other | Low | Clear error message explaining libraries cannot import. Document pattern of creating shared base library instead. |
| Confusion about private vs public | Low - Developers forget to mark actions private | Medium | Good documentation and examples. Consider linter rule to suggest private for single-use helpers. |
| File path resolution issues | Medium - Cross-platform path differences (Windows/Unix) | Low | Use Langium's URI utilities for platform-agnostic path handling. Test on both Windows and Unix. |

## Notes

- This feature enables code reuse patterns similar to ES6 modules but tailored to Eligian's action-based model
- The explicit `library` keyword (instead of implicit library detection) makes intent clear and allows future expansion (e.g., library metadata, exports configuration)
- The default-public visibility aligns with most modern languages (TypeScript, Kotlin) and keeps the common case simple
- Private actions enable implementation hiding similar to private methods in OOP languages, supporting library evolution
- The import syntax deliberately mirrors ES6 to leverage developer familiarity, but adapted to Eligian's action model (no default exports, no side effects)
- This feature is a foundational building block for a future ecosystem of shared libraries (animation libraries, UI pattern libraries, etc.)
