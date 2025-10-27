# Feature Specification: Shared Utilities Package - Path Resolution and File Loading Consolidation

**Feature Branch**: `016-shared-utilities-package`  
**Created**: 2025-01-27  
**Status**: Draft  
**Input**: User description: "Shared Utilities Package - Path Resolution and File Loading Consolidation"

## Overview

The Eligian codebase currently has duplicate path resolution and file loading logic scattered across the compiler, language server, CLI, and VS Code extension packages. This duplication has led to behavioral inconsistencies (such as the recent Feature 015 bug where the extension used `process.cwd()` while the compiler used the `.eligian` file's directory) and security vulnerabilities (some implementations lack path traversal protection).

This feature consolidates all path resolution and file loading logic into a new shared utilities package (`@eligian/shared-utils`) that all other packages will depend on. This ensures consistent behavior, unified security validation, and reduces maintenance burden.

### Path Resolution Rules (NON-NEGOTIABLE)

**CRITICAL**: The following path resolution rules are absolute and must be enforced consistently across all packages:

1. **Import paths are ALWAYS relative to the `.eligian` file that declares them**
   - The `.eligian` file's directory is the ONLY valid base directory for resolving imports
   - Example: If `/project/src/main.eligian` imports `./header.html`, it resolves to `/project/src/header.html`
   - Example: If `/project/src/pages/index.eligian` imports `../shared/utils.ts`, it resolves to `/project/src/shared/utils.ts`

2. **Paths declared in `.eligian` files are ALWAYS Unix-style (forward slashes)**
   - User writes: `styles "./styles/main.css"` (always forward slashes, regardless of platform)
   - User writes: `import header from "./components/header.html"` (always forward slashes)
   - Backslashes are NEVER used in `.eligian` source code (Windows users must use forward slashes)

3. **Paths that navigate OUT OF the `.eligian` file's directory are ILLEGAL if they escape the project root**
   - LEGAL: `/project/src/pages/index.eligian` imports `../shared/header.html` → resolves to `/project/src/shared/header.html` (within project)
   - ILLEGAL: `/project/src/main.eligian` imports `../../../etc/passwd` → BLOCKED (escapes `/project` root)
   - Security validation MUST block any resolved path outside the project root

4. **OS-specific path conversion happens "under the hood" during file loading**
   - `.eligian` source: `styles "./styles/main.css"` (Unix-style, always)
   - Internal resolution: Convert to OS-specific format for `fs.readFile()`
   - Windows: `/project/styles/main.css` → `C:\project\styles\main.css` (internally)
   - Unix: `/project/styles/main.css` → `/project/styles/main.css` (unchanged)
   - Users NEVER see or write OS-specific paths in `.eligian` files

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Unified Path Resolution (Priority: P1)

As a **developer using the Eligian CLI or VS Code extension**, I need **all file path references to be resolved consistently** so that **importing HTML, CSS, or media files works identically regardless of whether I'm using the command-line compiler or the VS Code extension**.

**Why this priority**: This is the most critical issue - inconsistent path resolution causes confusing bugs where code works in one environment but fails in another. The Feature 015 bug demonstrated this: HTML imports worked in CLI but failed in the extension because they used different path resolution strategies.

**Independent Test**: Can be fully tested by creating an `.eligian` file that imports a resource using a relative path (e.g., `import header from "./header.html"`), then compiling it both via CLI and via VS Code extension. Both should resolve the path identically and produce the same output.

**Acceptance Scenarios**:

1. **Given** an `.eligian` file at `/project/src/main.eligian` that imports `./header.html`, **When** compiled via CLI, **Then** the path is resolved to `/project/src/header.html`
2. **Given** the same `.eligian` file at `/project/src/main.eligian`, **When** compiled via VS Code extension, **Then** the path is resolved to `/project/src/header.html` (identical to CLI)
3. **Given** an `.eligian` file that imports `../outside.html` (path traversal attempt), **When** compiled in either CLI or extension, **Then** compilation fails with a security error message
4. **Given** an `.eligian` file on Windows with backslash paths `.\header.html`, **When** compiled on any platform, **Then** paths are normalized to forward slashes and resolved correctly

---

### User Story 2 - Unified File Loading (Priority: P2)

As a **developer importing files into Eligian programs**, I need **consistent error messages when files are missing or unreadable** so that **I can quickly understand and fix import issues regardless of which tool I'm using**.

**Why this priority**: After ensuring paths resolve consistently (P1), the next most important issue is providing clear, actionable error messages when file operations fail. Currently, different parts of the codebase produce different error formats for the same failure (file not found vs missing file vs ENOENT).

**Independent Test**: Can be fully tested by creating an `.eligian` file that imports a non-existent file, then attempting compilation via CLI and extension. Both should produce identical, user-friendly error messages (not raw ENOENT errors).

**Acceptance Scenarios**:

1. **Given** an `.eligian` file that imports a non-existent file `./missing.html`, **When** compiled, **Then** both CLI and extension show error: "HTML file not found: /absolute/path/to/missing.html"
2. **Given** an `.eligian` file that imports a file without read permissions, **When** compiled, **Then** both CLI and extension show error: "Permission denied reading file: /absolute/path/to/file.html"
3. **Given** an `.eligian` file that imports a file that exists but has I/O errors, **When** compiled, **Then** both CLI and extension show error: "Failed to read file: /absolute/path (error details)"

---

### User Story 3 - Cross-Platform Compatibility (Priority: P3)

As a **developer working on Windows, macOS, or Linux**, I need **file paths to work correctly on all platforms** so that **I can share Eligian projects across different operating systems without modification**.

**Why this priority**: While important for team collaboration, this is lower priority than P1/P2 because most developers work on a single platform. However, it's critical for open-source projects and cross-platform teams.

**Independent Test**: Can be fully tested by running the same `.eligian` project (with relative imports like `./header.html`, `../shared/footer.html`) on Windows, macOS, and Linux. All imports should resolve correctly without modification.

**Acceptance Scenarios**:

1. **Given** an `.eligian` file with Windows-style path `.\header.html`, **When** compiled on macOS/Linux, **Then** path is normalized to `./header.html` and resolves correctly
2. **Given** an `.eligian` file with Unix-style path `./header.html`, **When** compiled on Windows, **Then** path resolves correctly to Windows absolute path
3. **Given** an `.eligian` file with parent directory reference `../shared/footer.html`, **When** compiled on any platform, **Then** path traversal validation works consistently (allows if within project, blocks if escaping)

---

### Edge Cases

- What happens when a file path contains special characters (spaces, Unicode, emoji)?
- What happens when a symbolic link is used in the path?
- What happens when the project root cannot be determined (no workspace folder in VS Code)?
- What happens when attempting to import files from network drives or UNC paths?
- What happens when case-sensitivity differs between platforms (macOS case-insensitive, Linux case-sensitive)?
- What happens when file paths exceed platform limits (260 chars on Windows)?

## Requirements *(mandatory)*

### Functional Requirements

#### Path Resolution

- **FR-001**: System MUST resolve ALL import paths relative to the `.eligian` file's directory (NEVER relative to `process.cwd()`, workspace root, or any other directory)
- **FR-002**: System MUST accept ONLY Unix-style paths (forward slashes) in `.eligian` source files (backslashes are syntax errors)
- **FR-003**: System MUST validate that resolved absolute paths do not escape the project root directory (path traversal security)
- **FR-004**: System MUST BLOCK any resolved path that navigates outside the project root (e.g., `../../../etc/passwd`)
- **FR-005**: System MUST ALLOW paths that navigate outside the `.eligian` file's directory IF they remain within the project root (e.g., `../shared/utils.ts`)
- **FR-006**: System MUST convert resolved absolute paths to OS-specific format internally for `fs.readFile()` (but users never see OS-specific paths)
- **FR-007**: Path resolution MUST work identically in CLI, compiler, language server, and VS Code extension (same input → same output, always)

#### File Loading

- **FR-008**: System MUST provide both synchronous and asynchronous file loading APIs
- **FR-009**: System MUST distinguish between "file not found", "permission denied", and "read error" failure modes
- **FR-010**: System MUST provide structured error types (not generic `Error` objects)
- **FR-011**: System MUST include the absolute file path in all error messages
- **FR-012**: File loading MUST validate file size limits (warn if exceeding 1MB)
- **FR-013**: File loading MUST read files as UTF-8 text by default

#### Security

- **FR-014**: System MUST prevent path traversal attacks by validating that resolved paths remain within the project boundary
- **FR-015**: System MUST provide clear error messages for security violations (e.g., "Path escapes project directory")
- **FR-016**: System MUST handle symbolic links securely (resolve to real path and validate boundary)

#### Error Handling

- **FR-017**: System MUST provide a unified error type hierarchy for path and file operations
- **FR-018**: Error messages MUST be user-friendly and actionable (not raw system error codes)
- **FR-019**: Error objects MUST include source location information (file, line, column) when available
- **FR-020**: System MUST provide error type guards for TypeScript consumers

### Key Entities

- **PathResolver**: Encapsulates path resolution logic with security validation. Takes source file path and relative import path as input, returns absolute resolved path or security error, normalizes path separators across platforms, validates project boundary constraints.

- **FileLoader**: Encapsulates file loading logic with unified error handling. Provides both sync (`loadSync`) and async (`loadAsync`) methods, returns file content as string or structured error, validates file size and accessibility, supports multiple encodings (default UTF-8).

- **FileLoadError**: Discriminated union type representing file operation failures: `FileNotFoundError` (file does not exist), `PermissionError` (file exists but cannot be read), `ReadError` (file exists and is readable but I/O failed), `PathTraversalError` (path attempts to escape project boundary), `FileSizeError` (file exceeds size limit).

- **SourceLocation**: Represents location in source code with file path, line number, column number, and length. Used for error reporting and diagnostics. Unified definition used across all packages.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Developers can import files using relative paths, and the paths resolve identically in CLI and VS Code extension 100% of the time
- **SC-002**: When a file import fails, developers see a clear, actionable error message (not raw system error codes like ENOENT)
- **SC-003**: Path traversal attacks (using `../` to escape project directory) are blocked, and developers receive a security error message explaining why
- **SC-004**: The codebase has 1,000-1,500 fewer lines of duplicate code after consolidation
- **SC-005**: All existing tests pass after migration to shared utilities package
- **SC-006**: Cross-platform compatibility is verified by running test suite on Windows, macOS, and Linux

### Quality Metrics

- **SC-007**: 100% of path resolution operations use the shared `PathResolver` API (no direct `path.resolve` calls)
- **SC-008**: 100% of file loading operations use the shared `FileLoader` API (no direct `fs.readFileSync` calls)
- **SC-009**: Test coverage for shared utilities package is ≥90%
- **SC-010**: Zero security vulnerabilities reported by path validation logic

## Scope

### In Scope

- Creating new `@eligian/shared-utils` package
- Unified path resolution API with security validation
- Unified file loading API (sync and async)
- Consolidated error type hierarchy
- Migration of existing path/file code to use shared utilities
- Cross-platform path handling (Windows, macOS, Linux)
- Security validation (path traversal prevention)

### Out of Scope

- Network file loading (HTTP/HTTPS URLs) - only local file system
- File writing operations - this feature focuses on reading
- File watching/monitoring - handled by existing watchers
- Binary file loading - only text files (UTF-8) in scope
- Caching/memoization of file contents - can be added later
- Advanced file system operations (mkdir, rm, mv, etc.)

## Dependencies

### Required Before Implementation

- None - this is a foundational refactor that other features will depend on

### Blocks Future Work

- Feature 017: CSS Consolidation (will depend on this shared utilities package)
- Feature 018: Error Type Unification (will build on error types defined here)

## Assumptions

- All file operations are for local file system access (not network/cloud storage)
- Project boundaries are defined by the workspace root (VS Code) or current working directory (CLI)
- UTF-8 encoding is sufficient for all text files (HTML, CSS, JS, Eligian DSL)
- 1MB file size limit is reasonable for HTML/CSS imports (can be adjusted later)
- Symbolic links should be resolved to real paths and validated
- Case sensitivity follows platform defaults (case-insensitive on macOS/Windows, case-sensitive on Linux)

## Non-Functional Requirements

### Performance

- Path resolution operations complete in <1ms per call
- File loading operations complete in <10ms for typical files (<100KB)
- No significant performance regression compared to existing implementations

### Reliability

- Path traversal validation has zero false negatives (all escape attempts caught)
- Path traversal validation has zero false positives (valid paths not blocked)
- File loading handles all error conditions gracefully (no crashes)

### Maintainability

- Shared utilities package has comprehensive documentation
- All public APIs have TypeScript doc comments
- Examples provided for common use cases
- Migration guide documents how to switch from old APIs to new shared APIs

### Compatibility

- Works with Node.js 18+ (project's minimum supported version)
- Compatible with TypeScript 5.0+ (project's TypeScript version)
- Works identically in CommonJS and ES Modules contexts
- No breaking changes to existing public APIs (during migration period)
