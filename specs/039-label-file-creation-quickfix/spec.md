# Feature Specification: Label File Creation Quick Fix

**Feature Branch**: `039-label-file-creation-quickfix`
**Created**: 2025-11-24
**Status**: Draft
**Input**: User description: "label file creation quickfix. We need another quickfix: when a labels import is added to an .eligian file, but the file doesn't exists yet, a quickfix should be offered that creates the file with the given path. If a languages block is defined in the .eligian file then an example entry should be added to the file using the language codes defined in the languages block, other wise the file should simply contain an empty array: []. After the file is created it should then automatically be opened in our custom label editor."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create Empty Labels File (Priority: P1)

When a developer imports a labels file that doesn't exist and there's no languages block defined, the IDE should provide a quick fix that creates the file with an empty array structure and opens it in the label editor.

**Why this priority**: This is the MVP - enabling developers to quickly create a valid labels file structure without leaving the IDE or manually creating files, addressing the most common case where no languages are defined yet.

**Independent Test**: Can be fully tested by creating an Eligian file with a labels import pointing to a non-existent file (no languages block), triggering the quick fix, and verifying: (1) the file is created with `[]` content, (2) the file is opened in the label editor.

**Acceptance Scenarios**:

1. **Given** an Eligian file with a labels import statement referencing a file that doesn't exist and no languages block, **When** the developer invokes the quick fix action, **Then** the labels file is created with empty array content `[]` and the label editor opens automatically
2. **Given** a labels import with a relative path (e.g., `"./labels/app.json"`), **When** the quick fix creates the file, **Then** the full directory structure is created if needed (e.g., `labels/` folder) and the file is placed correctly
3. **Given** multiple labels imports in the file where some exist and some don't, **When** the quick fix is triggered, **Then** only the non-existent file under the cursor is created

---

### User Story 2 - Create Labels File with Language Template (Priority: P2)

When a developer imports a labels file that doesn't exist and there IS a languages block defined, the IDE should create the file with an example entry populated with all language codes from the languages block.

**Why this priority**: This provides immediate value by generating a starter template that developers can copy/modify, reducing the learning curve for the labels file structure.

**Independent Test**: Can be tested by creating an Eligian file with both a labels import (non-existent file) and a languages block with multiple languages (e.g., nl-NL, en-US), triggering the quick fix, and verifying the created file contains an example entry with all language codes.

**Acceptance Scenarios**:

1. **Given** an Eligian file with a languages block defining 2 languages (nl-NL, en-US) and a labels import for a non-existent file, **When** the developer invokes the quick fix, **Then** the labels file is created with an example entry containing both language codes (e.g., `[{"id": "example.label", "nl-NL": "Example NL", "en-US": "Example EN"}]`)
2. **Given** a languages block with a default language marked with *, **When** the quick fix generates the example entry, **Then** the example text reflects which language is the default (e.g., clearer placeholder text)
3. **Given** a languages block with 5 languages, **When** the labels file is created, **Then** the example entry includes all 5 language codes with appropriate placeholder text

---

### User Story 3 - Smart Path Resolution and Validation (Priority: P3)

The quick fix should correctly resolve both relative and absolute paths, create necessary directory structures, and handle edge cases like invalid characters or overly deep nesting.

**Why this priority**: This is a quality-of-life improvement ensuring robustness across different project structures, but the core functionality works without perfect path handling.

**Independent Test**: Can be tested by creating labels imports with various path formats (relative, absolute, nested, special characters) and verifying each creates the correct file in the correct location.

**Acceptance Scenarios**:

1. **Given** a labels import with an absolute path, **When** the quick fix creates the file, **Then** the file is created at the exact absolute location
2. **Given** a labels import with a deeply nested relative path (e.g., `"./data/localization/v2/labels.json"`), **When** the quick fix runs, **Then** all intermediate directories are created if they don't exist
3. **Given** a labels import path that would be invalid on the current OS (e.g., invalid characters), **When** the quick fix is triggered, **Then** an error message is shown explaining the path issue (file is not created)

---

### Edge Cases

- **File already exists but is invalid JSON**: Quick fix will NOT be available (file exists, so this is a different problem - validation/repair is out of scope)
- **Path contains environment variables or dynamic tokens**: System treats these as literal strings (no variable expansion); if the resulting path is invalid, an error is shown
- **Concurrent file creation** (multiple developers on same project): Standard file system behavior applies (last write wins); no special conflict resolution in MVP
- **Read-only directory or insufficient permissions**: Error message shown to user with specific permission issue; file is not created
- **Labels import without quotes** (malformed): Parser error prevents reaching quick fix; this is a syntax error, not a missing file error
- **Multiple label imports pointing to the same non-existent file**: Quick fix shown once (at cursor position); creating the file resolves all import diagnostics
- **Network drives or slow file systems**: File creation may take longer but completes asynchronously; label editor opens after successful creation
- **Non-JSON file extensions** (e.g., `.yaml`, `.xml`): System creates the file as requested; content is always JSON regardless of extension (file extension doesn't change behavior)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST detect when a labels import statement references a file that does not exist on disk
- **FR-002**: System MUST provide a code action (quick fix) offering to create the missing labels file
- **FR-003**: System MUST check if a languages block exists in the current Eligian file before creating the labels file
- **FR-004**: System MUST create the labels file with empty array content `[]` when NO languages block is defined
- **FR-005**: System MUST create the labels file with an example entry when a languages block IS defined
- **FR-006**: The example entry MUST include all language codes defined in the languages block
- **FR-007**: The example entry MUST use the structure: `[{"id": "example.label", "language-code": "Placeholder text", ...}]` for all languages
- **FR-008**: System MUST normalize the labels import path to an absolute file system path before creating the file (handling relative paths correctly)
- **FR-009**: System MUST create all necessary intermediate directories if they don't exist
- **FR-010**: System MUST open the newly created labels file in the custom label editor automatically after creation, with fallback to default JSON editor if label editor is unavailable
- **FR-011**: System MUST handle path resolution errors gracefully (e.g., invalid characters, permission issues) and display appropriate error messages
- **FR-012**: Quick fix MUST be accessible via standard IDE mechanisms (light bulb icon, quick fix menu, keyboard shortcut)
- **FR-013**: System MUST use the first language code by definition order (as declared in languages block) as the ID language in the example entry; if no explicit order exists, fall back to alphabetical sorting (e.g., if nl-NL is declared first or comes first alphabetically, use nl-NL text for the ID)

### Key Entities *(include if feature involves data)*

- **Labels Import**: A statement in an Eligian file that references an external labels JSON file (syntax: `labels "path/to/file.json"`)
- **Labels File**: A JSON file containing label definitions in the Eligius labels schema format (array of label objects with id and language code properties)
- **Languages Block**: An optional DSL construct defining available languages in the Eligian file (if present, influences the example entry generated in the labels file)
- **Label Editor**: A custom VS Code webview editor specifically designed for editing multi-language label files (provides visual interface for managing translations)
- **File Path**: String identifier for a file location (can be relative to the Eligian file or absolute); must be resolved to absolute path for file system operations

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Developers can create a missing labels file and have it open in the label editor in under 3 seconds from triggering the quick fix
- **SC-002**: When a languages block with N languages exists, the generated example entry contains exactly N language code properties (100% completeness)
- **SC-003**: The quick fix correctly resolves paths and creates files in 95% of valid path scenarios (excluding intentionally malformed paths)
- **SC-004**: Files are created with valid JSON that passes schema validation 100% of the time (no syntax errors)
- **SC-005**: The label editor opens automatically after file creation in 98% of cases (barring editor crashes or extension issues)
- **SC-006**: Directory structures are created correctly for nested paths up to 10 levels deep without errors

## Assumptions

- The custom label editor is already implemented and registered for `.json` files matching the labels file pattern
- The Eligius labels JSON schema is well-defined and known (structure with array of objects containing `id` and language code properties)
- Developers prefer having an example entry (when languages are defined) over an empty structure (easier to learn from)
- The file system allows directory creation and file writes in the locations where labels files are typically stored
- The labels import path in the Eligian file uses standard path syntax (no custom path resolution schemes)
- Opening a file in a specific editor can be triggered programmatically via VS Code API
- The quick fix should not attempt to fix permission or file system errors (just report them to the user)
- Placeholder text in the example entry can be generic (e.g., "Example NL" for nl-NL) - doesn't need to be sophisticated

## Dependencies

- Existing Eligian language parser must correctly identify labels import statements
- File system access for path resolution, directory creation, and file writing
- VS Code API for opening files in specific editors (label editor command/API)
- Label editor must be registered and functional in the VS Code extension
- Path normalization logic from TECHNICAL_OVERVIEW.md (must be reused to ensure consistency with how paths are resolved for validation)

## Notes

- **Path Normalization Reference**: See `specs/TECHNICAL_OVERVIEW.md` section on "Asset Loading & Validation" for details on how labels import paths are normalized to absolute paths. The same logic must be used here to ensure consistency.
- **Label Editor**: The custom label editor is assumed to be already implemented as part of a previous feature. If it doesn't exist yet, the fallback is to open the file in the default JSON editor.
