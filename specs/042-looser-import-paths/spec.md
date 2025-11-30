# Feature Specification: Looser Import Paths

**Feature Branch**: `042-looser-import-paths`
**Created**: 2025-11-30
**Status**: Draft
**Input**: User description: "Looser import paths. Currently all of the import paths in an .eligian file are obligated to be in the same directory or under the same directory as the .eligian file. The original idea was that this was good for security purposes. But since we're only importing text based files this is slightly exaggerated. Therefore this restriction should be removed."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Import Files from Parent Directory (Priority: P1)

Developers can import HTML, CSS, and other assets from parent directories of the `.eligian` file using `../` path syntax. This enables more flexible project structures where shared assets live in common directories above feature-specific code.

**Why this priority**: This is the core functionality request. Currently developers are blocked from organizing their projects with shared assets in common directories. This restriction forces asset duplication or awkward project structures.

**Independent Test**: Can be fully tested by creating an `.eligian` file in a subdirectory and importing assets from a parent directory, verifying the import resolves and compiles successfully.

**Acceptance Scenarios**:

1. **Given** an `.eligian` file at `/project/features/timeline.eligian`, **When** the developer writes `styles "../shared/main.css"`, **Then** the CSS file is successfully resolved and loaded from `/project/shared/main.css`

2. **Given** an `.eligian` file at `/project/features/video/annotation.eligian`, **When** the developer writes `html "../../templates/header.html"`, **Then** the HTML file is successfully resolved and loaded from `/project/templates/header.html`

3. **Given** a complex path like `../../shared/../common/styles.css`, **When** compiled, **Then** the path is correctly normalized and resolved to the appropriate file

---

### User Story 2 - Maintain Relative Path Requirement (Priority: P2)

All import paths must still be relative (starting with `./` or `../`). Absolute paths and protocol-based URLs remain disallowed to ensure project portability.

**Why this priority**: Important for maintaining cross-platform compatibility and preventing accidental absolute paths that would break when moving projects between machines.

**Independent Test**: Can be tested by attempting to use absolute paths and verifying appropriate error messages are displayed.

**Acceptance Scenarios**:

1. **Given** an import statement with an absolute Unix path like `/var/www/styles.css`, **When** the file is validated, **Then** an error is reported indicating absolute paths are not allowed

2. **Given** an import statement with an absolute Windows path like `C:\project\styles.css`, **When** the file is validated, **Then** an error is reported indicating absolute paths are not allowed

3. **Given** an import statement with a protocol URL like `https://example.com/styles.css`, **When** the file is validated, **Then** an error is reported indicating remote URLs are not allowed

---

### User Story 3 - Clear Error Messages for Missing Files (Priority: P3)

When a parent directory import path points to a non-existent file, developers receive clear, actionable error messages that include the resolved absolute path.

**Why this priority**: Good developer experience through clear error messages is important but secondary to the core functionality working correctly.

**Independent Test**: Can be tested by creating imports to non-existent files and verifying the error messages include helpful information.

**Acceptance Scenarios**:

1. **Given** an import statement `styles "../nonexistent.css"`, **When** the file doesn't exist at the resolved path, **Then** an error is reported with the full resolved path and a suggestion to check the path

2. **Given** an import with multiple `..` segments like `../../missing.html`, **When** the file doesn't exist, **Then** the error message shows the fully normalized resolved path (not the original relative path)

---

### Edge Cases

- What happens when `../` navigates above the filesystem root?
  - The path resolver should normalize the path and report an error for the non-existent location

- What happens with mixed separators like `../styles\main.css` on Unix?
  - Backslashes in import paths are already invalid DSL syntax; this behavior remains unchanged

- What happens with circular path segments like `./foo/../bar/../foo/styles.css`?
  - Paths should be normalized; the circular segments are simplified before resolution

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow import paths containing `../` sequences to navigate to parent directories
- **FR-002**: System MUST correctly resolve paths with multiple `../` sequences (e.g., `../../shared/file.css`)
- **FR-003**: System MUST normalize paths by resolving `.` and `..` segments before accessing the filesystem
- **FR-004**: System MUST continue to reject absolute paths (Unix `/path`, Windows `C:\path`)
- **FR-005**: System MUST continue to reject protocol-based URLs (`http://`, `https://`, `file://`)
- **FR-006**: System MUST continue to require import paths start with `./` or `../`
- **FR-007**: System MUST provide the resolved absolute path in error messages when a file cannot be found
- **FR-008**: System MUST work identically on Windows and Unix-based systems with forward-slash paths in source

### Key Entities

- **Import Statement**: A DSL construct that references an external file (HTML, CSS, library, label, etc.)
- **Relative Path**: A file path starting with `./` (current directory) or `../` (parent directory)
- **Security Boundary**: Previously the `.eligian` file's directory; now removed to allow parent traversal

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Developers can import files from any accessible directory relative to the `.eligian` file using `../` paths
- **SC-002**: All existing projects using `./` paths continue to work without modification
- **SC-003**: Error messages for missing files display the fully resolved path
- **SC-004**: Import path validation completes in under 5ms per import (maintains current performance)
- **SC-005**: Cross-platform path resolution works identically on Windows and Unix systems

## Assumptions

- The removal of the security restriction is acceptable because:
  - Only text-based files are imported (HTML, CSS, library files, label files)
  - The files are read-only (no write operations)
  - The DSL compiler already runs with the user's file system permissions
  - True path traversal attacks (e.g., reading `/etc/passwd`) are still prevented by the relative path requirement
- Users understand that `../` paths may break if the project structure changes
