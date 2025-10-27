# Implementation Plan: Shared Utilities Package

**Branch**: `016-shared-utilities-package` | **Date**: 2025-01-27 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/016-shared-utilities-package/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Create a new `@eligian/shared-utils` package to consolidate duplicate path resolution, file loading, and error handling logic across the compiler, language server, CLI, and VS Code extension. This eliminates behavioral inconsistencies (like the Feature 015 bug where paths resolved differently in CLI vs extension) and provides a single source of truth for file operations with consistent security validation and error reporting.

### Path Resolution Rules (NON-NEGOTIABLE)

**CRITICAL**: These rules are absolute and non-negotiable:

1. **Import paths are ALWAYS relative to the `.eligian` file's directory** - The `.eligian` file's directory is the ONLY valid base for resolving imports (NEVER `process.cwd()`, workspace root, or any other directory)

2. **Paths in `.eligian` files are ALWAYS Unix-style (forward slashes)** - Users write `"./styles/main.css"` on ALL platforms (Windows users must use forward slashes, not backslashes)

3. **Paths that escape the project root are ILLEGAL** - `../shared/utils.ts` is LEGAL if within project, `../../../etc/passwd` is BLOCKED (security validation)

4. **OS-specific path conversion happens internally** - Users never see OS paths in `.eligian` files. Conversion to `C:\` or Unix paths happens "under the hood" during `fs.readFile()`

## Technical Context

**Language/Version**: TypeScript 5.0+, Node.js 18+
**Primary Dependencies**: Node.js built-in modules (`fs`, `path`, `crypto`), existing monorepo dependencies (Langium, Effect-TS minimal)
**Storage**: File system operations (read, resolve paths, validate security)
**Testing**: Vitest (existing test framework), with mocking for file system operations
**Target Platform**: Node.js (CLI and VS Code extension host)
**Project Type**: Monorepo package (pnpm workspaces) - new package under `packages/shared-utils/`
**Performance Goals**: Path resolution <1ms, file loading <50ms for typical files, negligible overhead vs current implementations
**Constraints**: Must work cross-platform (Windows, macOS, Linux), zero breaking changes to existing APIs during migration, maintain backwards compatibility
**Scale/Scope**: Consolidate 6+ duplicate path resolution implementations and 8+ file loading implementations across 4 packages (language, compiler, extension, cli)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with `.specify/memory/constitution.md`:

- [x] **I. Simplicity & Documentation**: Clear, focused utilities with pure functions. Well-documented path resolution and file loading logic. No over-abstraction.
- [x] **II. Comprehensive Testing**: TDD approach with tests first. Unit tests for path resolver, file loader, error types. Integration tests for cross-package usage. Target 90%+ coverage.
- [x] **III. No Gold-Plating**: Solves documented problem (Feature 015 bug, 15 duplicate implementations). Minimum viable solution: path resolution, file loading, errors only.
- [x] **IV. Mandatory Code Reviews**: Standard PR process applies. Migration PRs reviewed per package.
- [x] **V. UX Consistency**: Maintains existing API interfaces during migration. Error messages consistent across CLI and extension.
- [x] **VI. Functional Programming**: Pure functions for path resolution and validation. External immutability maintained. Internal mutation allowed for path normalization.
- [x] **VII. UUID-Based Identifiers**: N/A (no Eligius config generation in this package)
- [x] **VIII. Debug Cleanup**: Standard cleanup process applies
- [x] **IX. ESM Import Extensions**: All imports use `.js` extensions per standard
- [x] **X. Validation Pattern**: N/A (no Langium validation in shared-utils)
- [x] **XI. Code Quality: Biome Integration**: Biome + typecheck run after each task
- [x] **XII. Eligius Architecture Understanding**: N/A (this is infrastructure, not DSL compilation)
- [x] **XIII. Eligius Domain Expert Consultation**: N/A (file operations, not Eligius semantics)
- [x] **XIV. Question-First Implementation**: Will clarify path resolution edge cases if uncertain
- [x] **XV. Operation Metadata Consultation**: N/A (no operation transformation)
- [x] **XVI. Concise Communication**: Standard brief communication applies
- [x] **XVII. Language Specification Maintenance**: N/A (no language changes)
- [x] **XVIII. Research & Documentation Standards**: Will use context7 for Node.js fs/path API patterns if needed
- [x] **XIX. Dependency Management**: No new dependencies required (using Node.js built-ins)
- [x] **XX. Debugging Attempt Limit**: 5-attempt limit applies
- [x] **XXI. Token Efficiency**: No redundant documentation, coverage via command only
- [x] **XXII. Accessibility Standards**: N/A (backend utilities, no UI)

*No violations. All principles compliant.*

## Project Structure

### Documentation (this feature)

```
specs/016-shared-utilities-package/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (N/A - no research needed)
├── data-model.md        # Phase 1 output (error types, API contracts)
├── quickstart.md        # Phase 1 output (migration guide)
├── contracts/           # Phase 1 output (API contracts for each module)
│   ├── path-resolver.md
│   ├── file-loader.md
│   └── errors.md
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```
packages/
├── shared-utils/               # NEW PACKAGE
│   ├── package.json           # Package configuration
│   ├── tsconfig.json          # TypeScript config
│   ├── src/
│   │   ├── index.ts           # Main export (re-exports all modules)
│   │   ├── path-resolver.ts   # Path resolution and security validation
│   │   ├── file-loader.ts     # Sync/async file loading with typed errors
│   │   └── errors.ts          # Unified error types (FileNotFoundError, etc.)
│   └── __tests__/
│       ├── path-resolver.spec.ts    # Path resolver unit tests
│       ├── file-loader.spec.ts      # File loader unit tests
│       ├── errors.spec.ts           # Error type tests
│       └── integration/
│           ├── cross-platform.spec.ts    # Windows/Unix path handling
│           └── security.spec.ts          # Path traversal validation
│
├── language/                   # EXISTING - will migrate to shared-utils
│   ├── src/
│   │   ├── compiler/
│   │   │   └── html-import-utils.ts      # MIGRATE path logic to shared-utils
│   │   └── asset-loading/
│   │       └── node-asset-loader.ts      # MIGRATE file loading to shared-utils
│
├── extension/                  # EXISTING - will migrate to shared-utils
│   ├── src/
│   │   └── extension/
│   │       ├── css-loader.ts             # MIGRATE file loading to shared-utils
│   │       └── preview/
│   │           └── MediaResolver.ts      # MIGRATE path resolution to shared-utils
│
├── compiler/                   # EXISTING - may use shared-utils in future
└── cli/                        # EXISTING - may use shared-utils in future
```

**Structure Decision**: Monorepo package structure. New `@eligian/shared-utils` package provides pure utility functions consumed by language, extension, and future packages. Package follows standard TypeScript library layout with `src/` for source and `__tests__/` for tests.

## Complexity Tracking

*Fill ONLY if Constitution Check has violations that must be justified*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |

## Phase 0: Research

*No research phase required.* All technical details are known from existing codebase analysis. The following information is already established:

**Known Implementation Details**:
- Node.js `path` module API for path resolution and normalization
- Node.js `fs` module API for sync/async file operations
- Security validation pattern: detect `..` segments in resolved paths
- Error type structure: discriminated unions with `_tag` field
- Cross-platform path handling: `path.normalize()` + forward slash conversion
- Existing duplicate implementations in 6+ files (documented in REFACTORING_ROADMAP.md)

**No Clarifications Needed**: All functional requirements (FR-001 to FR-019) are clear and implementable without research.

**Proceed directly to Phase 1 (Design).**


## Phase 1: Design

*Generate design artifacts for the shared utilities package.*

### data-model.md

**Purpose**: Document error types, data structures, and API contracts.

**Content**:
- Error type hierarchy (FileNotFoundError, PermissionError, ReadError, SecurityError)
- PathResolutionResult type (success/failure discriminated union)
- FileLoadResult type (success/failure discriminated union)
- Type guard functions for error discrimination

**Key Decisions**:
- Use discriminated unions with `_tag` field for type safety
- Errors include source location, hints, and file paths
- Pure data types (no class inheritance, just TypeScript interfaces/types)

### contracts/

**Purpose**: API contract documentation for each module.

**Files**:

1. **contracts/path-resolver.md**
   - `resolvePath(relativePath, baseDir): PathResolutionResult`
   - `validatePathSecurity(absolutePath, projectRoot): SecurityValidationResult`
   - `normalizePath(path): string`
   - Contract: path resolution, security validation, normalization
   - Preconditions, postconditions, error conditions

2. **contracts/file-loader.md**
   - `loadFileSync(absolutePath): FileLoadResult`
   - `loadFileAsync(absolutePath): Promise<FileLoadResult>`
   - Contract: file loading with typed errors
   - Preconditions, postconditions, error conditions

3. **contracts/errors.md**
   - Error type definitions (FileNotFoundError, PermissionError, etc.)
   - Type guard signatures (`isFileNotFoundError`, etc.)
   - Error construction and serialization

### quickstart.md

**Purpose**: Migration guide for consuming packages.

**Content**:
- How to add `@eligian/shared-utils` as dependency
- Migration examples (before/after code)
  - Example 1: Migrate `html-import-utils.ts` path resolution
  - Example 2: Migrate `css-loader.ts` file loading
  - Example 3: Replace custom error types with shared errors
- Testing migration (how to verify behavior unchanged)
- Rollout strategy (package-by-package migration order)

**Key Sections**:
1. **Installation**: Add to `package.json`
2. **Path Resolution Migration**: Replace custom logic with `resolvePath()`
3. **File Loading Migration**: Replace fs calls with `loadFileSync/Async()`
4. **Error Handling Migration**: Replace custom errors with shared types
5. **Testing Strategy**: Ensure existing tests still pass

### Design Validation

After generating artifacts:
- [x] data-model.md defines all error types and data structures
- [x] contracts/ documents API for all three modules (path-resolver.md, file-loader.md, errors.md)
- [x] quickstart.md provides clear migration path
- [x] Design artifacts reviewed against spec requirements (FR-001 to FR-019)
- [x] Constitution Check re-evaluated (all principles still compliant)

**Phase 1 Complete**: All design artifacts generated and validated.

**Next Step**: Generate tasks.md via `/speckit.tasks` command.

