# Implementation Plan: Looser Import Paths

**Branch**: `042-looser-import-paths` | **Date**: 2025-11-30 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/042-looser-import-paths/spec.md`

## Summary

Remove the security boundary restriction that prevents import paths from navigating to parent directories using `../`. Currently, `resolvePath()` in `@eligian/shared-utils` rejects paths that navigate outside the `.eligian` file's directory. This feature removes that restriction while maintaining the requirement for relative paths (starting with `./` or `../`).

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20+
**Primary Dependencies**: @eligian/shared-utils (path resolver), Langium (language server)
**Storage**: N/A (file system read-only operations)
**Testing**: Vitest
**Target Platform**: VS Code extension, CLI compiler (Windows/Unix)
**Project Type**: Monorepo (pnpm workspaces)
**Performance Goals**: Path resolution < 1ms per import
**Constraints**: Must maintain backwards compatibility with existing projects using `./` paths
**Scale/Scope**: ~5 files affected, ~50 lines changed, ~20 tests to update

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity First | ✅ Pass | Removing complexity (security boundary) makes code simpler |
| II. Comprehensive Testing | ✅ Pass | Tests will be updated to reflect new behavior |
| VI. External Immutability | ✅ Pass | API remains pure functions |
| VIII. Package Manager | ✅ Pass | Using pnpm |
| XIV. Windows Path Handling | ✅ Pass | Unix-style paths in source, internal normalization |
| XX. Testing Strategy | ✅ Pass | Tests co-located with code |
| XXIII. Testing Commands | ✅ Pass | Using pnpm test |
| XXV. Testing Guide | ✅ Pass | Will consult guide for test updates |

No violations requiring justification.

## Project Structure

### Documentation (this feature)

```text
specs/042-looser-import-paths/
├── plan.md              # This file
├── research.md          # Phase 0 output - not needed (straightforward change)
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (affected files)

```text
packages/
├── shared-utils/
│   ├── src/
│   │   ├── path-resolver.ts           # MODIFY: Remove security boundary check
│   │   └── errors.ts                  # KEEP: SecurityError still used for absolute paths
│   └── __tests__/
│       └── path-resolver.spec.ts      # MODIFY: Update tests for new behavior
│
├── language/
│   └── src/
│       ├── compiler/
│       │   └── html-import-utils.ts   # MODIFY: Update error message/comments
│       ├── asset-loading/
│       │   └── node-asset-loader.ts   # MODIFY: Update comments
│       └── __tests__/
│           ├── asset-loader.spec.ts   # MODIFY: Update tests
│           └── mock-asset-loader.ts   # KEEP: Already handles ../ (no security check)
│
└── extension/
    └── src/
        └── extension/
            └── preview/
                └── MediaResolver.ts   # MODIFY: Update comments, enable parent traversal
```

**Structure Decision**: Single-package changes across the monorepo. The core change is in `@eligian/shared-utils`, with ripple effects in dependent packages.

## Complexity Tracking

No violations requiring justification.

## Implementation Strategy

### Core Change

The change is focused on `resolvePath()` in `packages/shared-utils/src/path-resolver.ts`:

**Before**: Resolves path, then calls `validatePathSecurity()` which blocks paths outside baseDir
**After**: Resolves path, skip security validation (or remove it entirely)

### Options Considered

1. **Remove `validatePathSecurity()` entirely** - Simplest, but loses the function for potential future use
2. **Keep function, skip the call** - Maintains the code in case we want to re-enable
3. **Add parameter to control security check** - Most flexible but adds complexity

**Decision**: Option 1 - Remove `validatePathSecurity()` entirely. YAGNI principle - we can always add it back if needed.

### Files to Modify

1. **`packages/shared-utils/src/path-resolver.ts`**
   - Remove `validatePathSecurity()` function
   - Remove security check from `resolvePath()`
   - Update documentation/comments

2. **`packages/shared-utils/__tests__/path-resolver.spec.ts`**
   - Remove/update tests for `validatePathSecurity()`
   - Update `resolvePath()` tests to expect success for `../` paths

3. **`packages/language/src/compiler/html-import-utils.ts`**
   - Update error message (path resolution can still fail for non-existent files)
   - Update comments referencing security boundary

4. **`packages/language/src/asset-loading/node-asset-loader.ts`**
   - Update JSDoc comments referencing security validation

5. **`packages/extension/src/extension/preview/MediaResolver.ts`**
   - Update comments about security features
   - Verify parent traversal works correctly

### Test Updates

**Tests to Update** (from `path-resolver.spec.ts`):
- `validatePathSecurity` tests - REMOVE entire describe block
- `should block parent directory references` - CHANGE to expect success
- `should block path traversal escaping baseDir` - CHANGE to expect success (normalized path)
- `should block single-level parent directory navigation` - CHANGE to expect success
- `RULE 3: Paths navigating OUT OF baseDir are ILLEGAL` - REMOVE
- `RULE 4: Only same-directory and subdirectory paths are LEGAL` - UPDATE

**Tests to Add**:
- Verify `../shared/file.css` resolves correctly
- Verify `../../templates/header.html` resolves correctly
- Verify complex paths like `../../shared/../common/styles.css` normalize and resolve

### Backwards Compatibility

- All existing `./` paths continue to work unchanged
- Absolute path rejection continues to work unchanged
- The only behavioral change is allowing `../` to navigate to parent directories
