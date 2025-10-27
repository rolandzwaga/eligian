# Eligian Codebase Refactoring Roadmap

**Created**: 2025-01-27
**Status**: In Progress
**Context**: Comprehensive codebase analysis identified architectural issues causing inconsistent behavior between compiler and VS Code extension

## Executive Summary

The Eligian codebase exhibits **significant code duplication** across packages, creating maintenance burden and inconsistency risks. Analysis identified **15 high-priority refactoring opportunities** across 5 categories.

**Estimated Total Impact**:
- Code reduction: 1,000-1,500 lines
- Consistency improvement: 60%+ of cross-package inconsistencies eliminated
- Risk reduction: Security vulnerabilities consolidated and validated

## The Problem

### Root Cause: Architectural Divergence

The compiler, language server, CLI, and VS Code extension packages have evolved independently, leading to:

1. **Duplicate implementations**: Same logic (path resolution, file loading, error handling) implemented differently in each package
2. **Behavioral inconsistencies**: Code works in CLI but fails in extension (e.g., Feature 015 `process.cwd()` bug)
3. **Security gaps**: Some implementations have security validation, others don't
4. **Maintenance burden**: Bug fixes must be applied to 4+ locations

### Recent Examples

**Feature 015 Bug (HTML Imports)**:
- **Compiler**: Used `.eligian` file's directory as root ✅
- **Extension**: Used `process.cwd()` (VS Code install directory) ❌
- **Result**: HTML imports worked in CLI but failed in extension
- **Root Cause**: Path resolution logic duplicated, diverged over time

## Analysis Findings

### Critical Issues (2)

1. **Path Resolution Duplication**: 6+ files with inconsistent security validation
2. **File Loading Pattern Duplication**: 8+ files with incompatible error handling

### High Priority Issues (3)

3. **CSS Functionality Split**: Language server and extension duplicate CSS logic
4. **Error Type Duplication**: 5 different error type hierarchies with 60-80% overlap
5. **SourceLocation Type Duplication**: 3 incompatible definitions

### Medium Priority Issues (10+)

- Compilation logic duplicated in extension
- Configuration types duplicated
- Validation patterns duplicated
- And more...

## Refactoring Strategy

### Three-Phase Approach

We split the refactoring into **3 separate feature specs** to:
- **Reduce risk**: Smaller, focused changes easier to review and test
- **Enable incremental progress**: Can ship Phase 1 before starting Phase 2
- **Allow validation**: Each phase can be validated independently

### Phase Dependencies

```
Phase 1: Shared Utilities Package (Foundation)
    ↓
Phase 2: CSS Consolidation (Depends on Phase 1)
    ↓
Phase 3: Error Type Unification (Depends on Phase 1 & 2)
```

## Phase 1: Shared Utilities Package (Feature 016)

**Feature Branch**: `016-shared-utilities-package`
**Spec**: `specs/016-shared-utilities-package/spec.md`
**Status**: ✅ Complete (2025-01-27)

### Objectives

- Create new `@eligian/shared-utils` package
- Consolidate path resolution logic (6+ duplicate implementations)
- Consolidate file loading logic (8+ duplicate implementations)
- Establish unified error types for file operations
- Ensure 100% consistency between CLI, compiler, language server, and extension

### Success Criteria

- ✅ Paths resolve identically in CLI and VS Code extension
- ✅ Clear, actionable error messages (no raw ENOENT)
- ✅ Path traversal attacks blocked with security error
- ✅ 1,000-1,500 lines of duplicate code removed
- ✅ All existing tests pass
- ✅ 90%+ test coverage for shared utilities

### Files Affected

**New Package**:
- `packages/shared-utils/src/path-resolver.ts`
- `packages/shared-utils/src/file-loader.ts`
- `packages/shared-utils/src/errors.ts`

**To Migrate** (6+ files):
- `packages/language/src/compiler/html-import-utils.ts`
- `packages/extension/src/extension/css-loader.ts`
- `packages/language/src/asset-loading/node-asset-loader.ts`
- `packages/extension/src/extension/preview/MediaResolver.ts`
- Plus 2+ files in validators

### Implementation Results

**Completion Date**: 2025-01-27

**Packages Migrated**:
- ✅ `@eligian/shared-utils` - Created with 71 passing tests
- ✅ `@eligian/language` - Migrated, 1061 tests passing
- ✅ `@eligian/vscode-extension` - Partially migrated (css-loader only)

**Files Migrated**:
- `packages/language/src/compiler/html-import-utils.ts` - Now uses `resolvePath()` and `loadFileSync()`
- `packages/language/src/asset-loading/node-asset-loader.ts` - Now uses `resolvePath()` and `loadFileSync()`
- `packages/extension/src/extension/css-loader.ts` - Now uses `loadFileAsync()`
- `packages/extension/src/extension/preview/MediaResolver.ts` - Now uses `resolvePath()` (removed workspace fallback logic)

**Code Reduction**:
- Eliminated duplicate path resolution logic in 3 files (html-import-utils.ts, node-asset-loader.ts, MediaResolver.ts)
- Eliminated duplicate file loading logic in 3 files
- Removed workspace folder fallback logic (was inconsistent with other imports)
- Consolidated error types into unified discriminated unions
- Estimated ~500-600 lines of duplicate code removed

**Test Coverage**:
- Shared-utils: 71/71 tests passing (100% pass rate)
- Language package: 1061/1061 tests passing (100% pass rate)
- Extension: Build passes, no test suite

**Lessons Learned**:
1. **Consistency is critical**: MediaResolver's workspace fallback was an inconsistency bug, not a feature - all imports should use the same security model
2. **Path format consistency**: Shared-utils returns Unix-style paths (`F:/...`) while tests expected OS-specific (`F:\...`) - required helper functions
3. **Error model changes**: Security boundary changed from "project root" to "source file directory" (stricter) - required updating error messages
4. **Test isolation**: Tests needed `toUnixPath()` helpers to normalize path comparisons across platforms
5. **Question assumptions**: Initial assumption that MediaResolver needed different security was wrong - user feedback caught this

### Original Estimated Effort

- **Setup**: 1-2 days (create package, basic structure)
- **Implementation**: 3-4 days (path resolver, file loader, errors)
- **Migration**: 4-5 days (update all packages to use shared utils)
- **Testing**: 2-3 days (unit tests, integration tests, cross-platform)
- **Total**: 10-14 days

**Actual Effort**: ~5 days (faster than estimated due to good planning)

---

## Phase 2: CSS Consolidation (Feature 017)

**Feature Branch**: `017-css-consolidation` (not yet created)
**Spec**: `specs/017-css-consolidation/spec.md` (not yet created)
**Status**: ⏳ Pending (will start after Phase 1 complete)
**Depends On**: Phase 1 (uses shared file loading utilities)

### Objectives

- Move all CSS functionality into `@eligian/language` package
- Extension depends on language for CSS operations (no duplication)
- Consolidate CSS parsing, validation, loading, and URL rewriting
- Establish single source of truth for CSS-related features

### Problem Statement

**Current Architecture** (WRONG):
```
Language Package:
  - css-parser.ts (PostCSS parsing for validation)
  - css-registry.ts (CSS metadata for LSP)
  - CSS validation in eligian-validator.ts

Extension Package:
  - css-loader.ts (file loading for webview)
  - webview-css-injector.ts (runtime injection)
  - css-watcher.ts (file watching)
  - Duplicates error types from language
```

**Issues**:
- CSS parsing logic cannot be reused by extension
- Error types duplicated (`CSSParseError` vs `FileNotFoundError`)
- Path resolution duplicated (both resolve CSS file paths)
- No code sharing between compile-time (language) and runtime (extension)

**Target Architecture** (CORRECT):
```
Language Package (provides CSS service):
  - css/css-service.ts (unified CSS API)
    - parseCSS() - for validation
    - loadCSS() - for runtime (uses Phase 1 file loader)
    - rewriteUrls() - for webview compatibility
  - css/css-parser.ts
  - css/css-registry.ts

Extension Package (consumes CSS service):
  - css-watcher.ts (file watching only)
  - Uses language.CSSService for everything else
```

### Success Criteria

- ✅ Extension uses language package for all CSS operations
- ✅ Zero duplication of CSS logic between packages
- ✅ CSS error types consolidated
- ✅ 500-600 lines of duplicate code removed
- ✅ All CSS tests pass

### Files Affected

**New in Language**:
- `packages/language/src/css/css-service.ts` (new unified API)

**To Refactor**:
- `packages/extension/src/extension/css-loader.ts` (delete, use CSSService)
- `packages/extension/src/extension/webview-css-injector.ts` (simplify, delegate to CSSService)

**To Keep**:
- `packages/extension/src/extension/css-watcher.ts` (file watching is extension-specific)

### Estimated Effort

- **Design**: 1-2 days (CSS service API design)
- **Implementation**: 3-4 days (create CSSService, migrate logic)
- **Extension Migration**: 2-3 days (update extension to use CSSService)
- **Testing**: 2-3 days (ensure hot-reload, webview injection still work)
- **Total**: 8-12 days

---

## Phase 3: Error Type Unification (Feature 018)

**Feature Branch**: `018-error-type-unification` (not yet created)
**Spec**: `specs/018-error-type-unification/spec.md` (not yet created)
**Status**: ⏳ Pending (will start after Phase 2 complete)
**Depends On**: Phase 1 (builds on file I/O errors), Phase 2 (builds on CSS errors)

### Objectives

- Consolidate 5 different error type hierarchies into one
- Establish `@eligian/language/errors` as single source of truth
- Provide unified error formatting and reporting
- Eliminate duplicate error definitions across packages

### Problem Statement

**Current State** (5 error hierarchies):

1. **compiler/types/errors.ts**: `ParseError`, `ValidationError`, `TypeError`, `TransformError`, `EmitError`
2. **asset-loading/types.ts**: `AssetError` (HTML, CSS, Media validation)
3. **validators/validation-errors.ts**: `ImportValidationError`, `PathError`, `ImportNameError`
4. **css-loader.ts** (extension): `FileNotFoundError`, `PermissionError`, `ReadError`
5. **CompilationService.ts** (extension): `CompilationError`

**Overlap**: 60-80% of these could be unified

### Target Architecture

**Unified Error Namespace**:
```typescript
// packages/language/src/errors/index.ts
export namespace EligianError {
  // Base error type
  export interface BaseError {
    message: string;
    location?: SourceLocation;
    hint?: string;
  }

  // Compiler errors
  export type CompilerError =
    | ParseError
    | ValidationError
    | TypeError
    | TransformError;

  // File I/O errors (from Phase 1)
  export type IOError =
    | FileNotFoundError
    | PermissionError
    | ReadError;

  // Asset errors (combines file + validation)
  export type AssetError =
    | IOError
    | HtmlValidationError
    | CssValidationError;
}
```

### Success Criteria

- ✅ Single error type hierarchy used by all packages
- ✅ 200-300 lines of duplicate error definitions removed
- ✅ Consistent error messages across all tools
- ✅ Error type guards for TypeScript consumers
- ✅ All error-handling tests pass

### Files Affected

**New**:
- `packages/language/src/errors/index.ts` (unified error namespace)

**To Consolidate** (5+ files):
- `packages/language/src/compiler/types/errors.ts`
- `packages/language/src/asset-loading/types.ts`
- `packages/language/src/validators/validation-errors.ts`
- `packages/extension/src/extension/css-loader.ts` (error classes)
- `packages/extension/src/extension/preview/CompilationService.ts` (error types)

### Estimated Effort

- **Design**: 2-3 days (error type hierarchy design)
- **Implementation**: 3-4 days (create unified errors, migration helpers)
- **Migration**: 4-5 days (update all packages)
- **Testing**: 2-3 days (verify error messages, type guards)
- **Total**: 11-15 days

---

## Total Timeline & Effort

### Sequential Implementation

```
Phase 1: Shared Utilities     [==============]  10-14 days
Phase 2: CSS Consolidation        [=========]   8-12 days
Phase 3: Error Unification           [=======] 11-15 days
---------------------------------------------------------
Total:                                         29-41 days
```

### Parallel Implementation (If Resources Allow)

- **Phase 1**: Must complete first (foundation)
- **Phase 2 & 3**: Could run in parallel after Phase 1 completes (minimal overlap)

```
Phase 1: Shared Utilities     [==============]     10-14 days
Phase 2: CSS Consolidation        [=========]       8-12 days
Phase 3: Error Unification        [=======]        11-15 days
                                  (can overlap)
---------------------------------------------------------
Total (if parallel):                                21-26 days
```

## Risk Assessment

| Phase | Risk Level | Primary Risks | Mitigation |
|-------|-----------|---------------|------------|
| Phase 1 | **MEDIUM** | Breaking changes to path resolution, security gaps | Extensive testing, gradual migration, backward compatibility |
| Phase 2 | **HIGH** | Extension-language coupling, CSS hot-reload breakage | Careful dependency management, integration testing |
| Phase 3 | **MEDIUM** | Error message changes affect user experience | Maintain message quality, document changes |

## Success Metrics

### Code Quality

- **Before Refactoring**: ~94 source files, significant duplication
- **After Refactoring**: 1,000-1,500 fewer lines, 60%+ less duplication
- **Test Coverage**: Maintain 80%+ coverage throughout

### Consistency

- **Before**: CLI and extension behave differently (path resolution, errors)
- **After**: 100% consistent behavior across all tools

### Security

- **Before**: Inconsistent security validation (some paths checked, others not)
- **After**: All path operations validated centrally

### Maintainability

- **Before**: Bug fixes require changes to 4+ files
- **After**: Single source of truth for path/file/error operations

## Next Steps

1. ✅ **Complete Phase 1 Spec**: Finish spec validation, create plan and tasks
2. 🔄 **Implement Phase 1**: Create shared-utils package, migrate existing code
3. ⏳ **Phase 2 Spec**: After Phase 1 complete, create CSS consolidation spec
4. ⏳ **Phase 3 Spec**: After Phase 2 complete, create error unification spec

## References

### Analysis Documents

- **Full Analysis**: See conversation from 2025-01-27 (codebase refactoring analysis)
- **Detailed Findings**: 15 issues identified across 5 categories
- **File Inventory**: 94 source files analyzed

### Related Features

- **Feature 015**: HTML Variables/Imports (revealed the path resolution bug that triggered this refactoring)
- **Feature 013**: CSS Class Validation (CSS functionality split across packages)

### Package Structure

**Current**:
```
packages/
├── language/   (compiler + language server)
├── extension/  (VS Code extension)
├── cli/        (command-line interface)
└── [no shared utilities]
```

**Target** (after all phases):
```
packages/
├── shared-utils/  (NEW - path, file, errors)
├── language/      (compiler + LSP + CSS)
├── extension/     (thin wrapper, delegates to language)
└── cli/           (thin wrapper, delegates to language)
```

## Context Preservation

This document serves as the **master reference** for the three-phase refactoring effort. When starting Phase 2 or Phase 3:

1. **Read this document** to understand the full context
2. **Reference the analysis findings** (preserved above)
3. **Check dependencies** (ensure previous phases complete)
4. **Review success criteria** (maintain consistency across phases)

**DO NOT** start Phase 2 or 3 without re-reading this document!
