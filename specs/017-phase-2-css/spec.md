# Feature Specification: Phase 2 - CSS Consolidation

**Feature Branch**: `017-phase-2-css`
**Created**: 2025-01-27
**Status**: Draft
**Input**: "Phase 2: CSS Consolidation - Move all CSS functionality into @eligian/language package to eliminate duplication between language server and VS Code extension"

**Depends On**: Feature 016 (Shared Utilities Package) - uses shared-utils for file loading

## User Scenarios & Testing *(mandatory)*

<!--
  This feature is an internal refactoring - no external user-facing behavior changes.
  User stories are written from a developer/maintainer perspective.
  Each story represents an independently testable code consolidation milestone.
-->

### User Story 1 - Create Unified CSS Service API (Priority: P1)

As a **maintainer**, I want a **single CSS service in the language package** so that **CSS operations (parsing, loading, URL rewriting) can be shared between language server and extension without duplication**.

**Why this priority**: This is the foundation - creates the new API that all other consolidation depends on. Without this, extension and language packages will continue to maintain separate CSS implementations.

**Independent Test**: Can be fully tested by creating the service module and verifying exports (parseCSS, loadCSS, rewriteUrls) are callable from language server tests. Delivers value by establishing the API contract.

**Acceptance Scenarios**:

1. **Given** the language package, **When** I import from `@eligian/language/css-service`, **Then** I can access `parseCSS()`, `loadCSS()`, and `rewriteUrls()` functions
2. **Given** CSS file content, **When** I call `parseCSS(content, filePath)`, **Then** I receive a `CSSParseResult` with classes, IDs, locations, rules, and errors
3. **Given** a CSS file path and webview, **When** I call `loadCSS(filePath, webview)`, **Then** I receive CSS content with URLs rewritten for webview compatibility
4. **Given** CSS content with `url()` references, **When** I call `rewriteUrls(css, cssFilePath, webview)`, **Then** relative paths are converted to webview URIs

---

### User Story 2 - Migrate Extension CSS Loader to Use Unified Service (Priority: P2)

As a **maintainer**, I want the **extension's css-loader.ts to delegate to the language package CSS service** so that **CSS loading logic is not duplicated between packages**.

**Why this priority**: Eliminates the first major duplication - CSS file loading and URL rewriting. Depends on P1 (CSS service exists).

**Independent Test**: Can be fully tested by updating css-loader.ts to import from language package, running extension build, and verifying webview CSS injection still works. Delivers value by removing ~150 lines of duplicate code.

**Acceptance Scenarios**:

1. **Given** css-loader.ts in extension package, **When** I refactor to use language package CSS service, **Then** `loadCSSFile()` delegates to `CSSService.loadCSS()`
2. **Given** css-loader.ts in extension package, **When** I refactor to use language package CSS service, **Then** `rewriteCSSUrls()` delegates to `CSSService.rewriteUrls()`
3. **Given** a preview webview with CSS imports, **When** CSS files are loaded, **Then** webview receives correctly rewritten CSS (identical to pre-refactor behavior)
4. **Given** css-loader.ts after refactoring, **When** I run extension tests, **Then** all existing CSS loading tests pass

---

### User Story 3 - Consolidate CSS Error Types (Priority: P3)

As a **maintainer**, I want **CSS error types (FileNotFoundError, PermissionError, ReadError, CSSParseError) unified in the language package** so that **both language server and extension use identical error handling**.

**Why this priority**: Eliminates error type duplication and ensures consistent error messages. Depends on P2 (extension using CSS service).

**Independent Test**: Can be fully tested by moving error classes to language package, updating imports in extension, and verifying error handling tests pass. Delivers value by removing ~50 lines of duplicate error definitions.

**Acceptance Scenarios**:

1. **Given** CSS error types in language package, **When** extension imports them, **Then** FileNotFoundError, PermissionError, ReadError, CSSParseError are available
2. **Given** a missing CSS file, **When** extension attempts to load it, **Then** error message matches language server error format
3. **Given** a CSS file with syntax errors, **When** extension attempts to parse it, **Then** CSSParseError includes line, column, and message
4. **Given** CSS error tests in extension, **When** I run tests after migration, **Then** all error handling tests pass

---

### User Story 4 - Verify Hot-Reload and Webview Injection Still Work (Priority: P2)

As a **user**, I want **CSS hot-reload and webview injection to continue working after refactoring** so that **my development workflow is not disrupted**.

**Why this priority**: Critical for user-facing functionality - ensures refactoring doesn't break existing features. Tests end-to-end integration after code consolidation.

**Independent Test**: Can be fully tested by opening a preview, editing CSS files, and verifying changes appear without restarting timeline. Delivers value by ensuring zero regression in user-facing features.

**Acceptance Scenarios**:

1. **Given** an `.eligian` file with `styles "./main.css"` import, **When** I open the preview, **Then** CSS is applied to the webview
2. **Given** a preview with loaded CSS, **When** I edit the CSS file and save, **Then** CSS hot-reloads within 300ms without restarting timeline
3. **Given** a CSS file with `url(./image.png)` reference, **When** CSS is loaded in preview, **Then** image appears correctly (URL rewriting works)
4. **Given** a missing CSS file, **When** preview attempts to load it, **Then** I see a user-friendly error notification

---

### Edge Cases

- What happens when CSS file is deleted while preview is open? (Should show error notification, remove CSS from webview)
- How does system handle CSS files with Unicode characters in paths? (Should handle correctly via shared-utils path normalization)
- What happens when multiple CSS files reference the same image? (Should rewrite all URL references independently)
- How does system handle CSS files larger than 1MB? (Should load but may be slow - no special handling needed)
- What happens when CSS file has parse errors? (CSSParseError shown at import statement in DSL, CSS not loaded in preview)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Language package MUST export a unified CSS service module (`packages/language/src/css/css-service.ts`)
- **FR-002**: CSS service MUST provide `parseCSS(content: string, filePath: string): CSSParseResult` function
- **FR-003**: CSS service MUST provide `loadCSS(filePath: string, webview: Webview): Promise<{ content: string, id: string }>` function
- **FR-004**: CSS service MUST provide `rewriteUrls(css: string, cssFilePath: string, webview: Webview): string` function
- **FR-005**: Extension's css-loader.ts MUST delegate to language package CSS service (no duplicate implementations)
- **FR-006**: Extension's webview-css-injector.ts MUST use language package CSS service for loading and URL rewriting
- **FR-007**: CSS error types (FileNotFoundError, PermissionError, ReadError, CSSParseError) MUST be defined in language package only
- **FR-008**: Extension MUST import CSS error types from language package (no duplicate error class definitions)
- **FR-009**: CSS service MUST use shared-utils (`@eligian/shared-utils`) for file loading (leverages Phase 1)
- **FR-010**: All existing CSS functionality MUST continue working after refactoring (hot-reload, webview injection, error notifications)
- **FR-011**: Extension's css-watcher.ts MUST remain in extension package (file watching is extension-specific)

### Key Entities

- **CSSService**: Unified CSS operations module in language package
  - Exports: parseCSS, loadCSS, rewriteUrls
  - Integrates with: shared-utils (file loading), css-parser (parsing), postcss (URL rewriting)

- **CSSParseResult**: CSS parsing output (already exists in css-parser.ts)
  - Attributes: classes, ids, classLocations, idLocations, classRules, idRules, errors
  - Used by: language server validation, extension error reporting

- **CSS Error Types**: Typed errors for CSS operations
  - FileNotFoundError, PermissionError, ReadError (from shared-utils)
  - CSSParseError (CSS-specific, defined in css-parser.ts)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Extension package uses language package for 100% of CSS operations (zero duplicate CSS logic)
- **SC-002**: Code reduction: 500-600 lines of duplicate CSS code removed from extension package
- **SC-003**: All existing CSS tests pass (language package: 130 tests, extension: manual testing)
- **SC-004**: CSS hot-reload continues working within 300ms (no performance regression)
- **SC-005**: Webview CSS injection continues working with identical behavior (no user-visible changes)
- **SC-006**: CSS error messages are identical between language server and extension (unified error types)
- **SC-007**: Build time does not increase by more than 10% (minimal added complexity)

### Quality Gates

- **QG-001**: Extension build passes with zero TypeScript errors
- **QG-002**: Language package build passes with zero TypeScript errors
- **QG-003**: All language package tests pass (1061+ tests)
- **QG-004**: Manual testing: CSS hot-reload works in preview
- **QG-005**: Manual testing: CSS webview injection works in preview
- **QG-006**: Manual testing: CSS error notifications appear correctly
- **QG-007**: Biome check passes (zero lint errors)

## Architecture Changes

### Current Architecture (Before Refactoring)

```
Language Package (packages/language/):
  - src/css/css-parser.ts         (PostCSS parsing)
  - src/css/css-registry.ts       (CSS metadata for LSP)
  - src/eligian-validator.ts      (CSS validation)

Extension Package (packages/extension/):
  - src/extension/css-loader.ts           (file loading, URL rewriting)  ❌ DUPLICATE
  - src/extension/webview-css-injector.ts (runtime injection, uses css-loader)
  - src/extension/css-watcher.ts          (file watching)
```

**Issues**:
- `css-loader.ts` duplicates functionality from shared-utils and css-parser
- Error types (FileNotFoundError, etc.) defined in both packages
- URL rewriting logic in extension, not shared with language server
- No code reuse between compile-time (language) and runtime (extension)

### Target Architecture (After Refactoring)

```
Language Package (packages/language/):
  - src/css/css-service.ts        (NEW: unified CSS API)
    - parseCSS() → delegates to css-parser.ts
    - loadCSS() → uses shared-utils + rewriteUrls()
    - rewriteUrls() → migrated from extension css-loader.ts
  - src/css/css-parser.ts         (PostCSS parsing)
  - src/css/css-registry.ts       (CSS metadata for LSP)
  - src/eligian-validator.ts      (CSS validation)

Extension Package (packages/extension/):
  - src/extension/css-loader.ts           (THIN WRAPPER: delegates to language package) ✓
  - src/extension/webview-css-injector.ts (runtime injection, uses language package) ✓
  - src/extension/css-watcher.ts          (file watching only) ✓
```

**Benefits**:
- ✅ Single source of truth for CSS operations
- ✅ Error types unified in language package
- ✅ Extension becomes thin wrapper around language package
- ✅ 500-600 lines of duplicate code removed

## Files Affected

### New Files

- `packages/language/src/css/css-service.ts` - Unified CSS service API

### Files to Refactor (Extension → Delegates to Language)

- `packages/extension/src/extension/css-loader.ts`
  - Before: 179 lines (implements loadCSSFile, rewriteCSSUrls, error types)
  - After: ~50 lines (thin wrapper, delegates to language package)
  - Changes: Import from language package, remove duplicate implementations

- `packages/extension/src/extension/webview-css-injector.ts`
  - Before: Uses local css-loader.ts
  - After: Uses language package CSS service
  - Changes: Update imports, delegate loading/rewriting to CSS service

### Files to Keep (Extension-Specific)

- `packages/extension/src/extension/css-watcher.ts`
  - Reason: File watching is extension-specific (uses vscode.FileSystemWatcher)
  - No changes needed

### Files to Export (Language Package)

- `packages/language/src/css/css-parser.ts`
  - Add to package.json exports: `"./css-service": "./out/css/css-service.js"`
  - Export CSSParseError type for extension consumption

## Testing Strategy

### Unit Tests (Language Package)

- **CSS Service Tests** (new: `packages/language/src/css/__tests__/css-service.spec.ts`)
  - Test `parseCSS()` delegates to css-parser correctly
  - Test `loadCSS()` uses shared-utils and rewriteUrls()
  - Test `rewriteUrls()` converts relative paths to webview URIs
  - Test error handling (FileNotFoundError, CSSParseError, etc.)
  - Target: 20-30 tests

### Integration Tests (Extension Package)

- **CSS Loader Tests** (update existing)
  - Verify css-loader.ts delegates to language package
  - Verify error types match language package
  - Target: 10-15 tests

- **Webview Injector Tests** (manual)
  - Open preview with CSS imports
  - Edit CSS file, verify hot-reload works
  - Add CSS errors, verify error notifications appear
  - Verify images in CSS load correctly (URL rewriting)

### Regression Tests

- **Existing CSS Tests** (language package: 130 tests)
  - All existing CSS parser, registry, validation tests must pass
  - No changes to test expectations

- **Extension Build Test**
  - Extension must build without TypeScript errors
  - Extension must run in VS Code without runtime errors

## Dependencies

### Direct Dependencies

- **Feature 016 (Shared Utilities Package)**: CSS service uses shared-utils for file loading
  - `loadFileAsync()` from shared-utils
  - `FileNotFoundError`, `PermissionError`, `ReadError` types from shared-utils

### Package Dependencies

- **Language Package**: postcss, postcss-selector-parser (already installed)
- **Extension Package**: @eligian/language (already installed)
- **No new dependencies required**

## Migration Plan

### Phase 1: Create CSS Service (2-3 days)

1. Create `packages/language/src/css/css-service.ts`
2. Implement `parseCSS()` (delegates to css-parser.ts)
3. Implement `loadCSS()` (uses shared-utils + rewriteUrls)
4. Implement `rewriteUrls()` (migrate from extension css-loader.ts)
5. Export from package.json
6. Write unit tests

### Phase 2: Migrate Extension (2-3 days)

1. Update `packages/extension/src/extension/css-loader.ts`
   - Import from language package
   - Remove duplicate implementations
   - Keep thin wrapper for backwards compatibility
2. Update `packages/extension/src/extension/webview-css-injector.ts`
   - Import from language package
   - Update calls to use CSS service
3. Update imports throughout extension
4. Run extension build and fix TypeScript errors

### Phase 3: Testing and Validation (1-2 days)

1. Run language package tests (ensure 1061+ tests pass)
2. Run extension build (ensure zero TypeScript errors)
3. Manual testing: Preview with CSS imports
4. Manual testing: CSS hot-reload
5. Manual testing: CSS error notifications
6. Manual testing: CSS URL rewriting (images, fonts)
7. Update documentation

### Phase 4: Cleanup (1 day)

1. Remove unused error type definitions from extension
2. Run Biome check and fix any issues
3. Update REFACTORING_ROADMAP.md with Phase 2 completion
4. Create PR

## Rollback Plan

If critical bugs are discovered after merge:

1. **Revert PR**: Git revert the merge commit
2. **Fallback**: Extension continues using local css-loader.ts (keep old implementation in git history)
3. **Investigation**: Identify root cause in CSS service
4. **Fix Forward**: Apply fixes to CSS service, re-test, re-merge

## Open Questions

None - this is a well-defined internal refactoring with clear success criteria.

## Assumptions

1. **No Breaking Changes**: Extension behavior remains identical (CSS loading, hot-reload, error handling)
2. **Performance**: No noticeable performance regression (CSS operations are already fast)
3. **Backwards Compatibility**: Old extension code kept in git history for reference
4. **Testing**: Manual testing sufficient for extension (no automated UI tests available)

## Related Features

- **Feature 010** (Asset Loading & Validation): Introduced CSS import syntax
- **Feature 011** (Preview CSS Support with Live Reload): Implemented CSS hot-reload and webview injection
- **Feature 013** (CSS Class and Selector Validation): Uses css-parser.ts and css-registry.ts
- **Feature 016** (Shared Utilities Package - Phase 1): Provides file loading utilities used by CSS service

## Documentation Updates

- `REFACTORING_ROADMAP.md`: Mark Phase 2 complete
- `CLAUDE.md`: Update CSS architecture section
- `packages/language/src/css/README.md`: Add CSS service documentation
- `packages/extension/README.md`: Update to reflect dependency on language package

## Risks and Mitigation

| Risk | Severity | Mitigation |
|------|----------|------------|
| CSS hot-reload breaks after refactoring | HIGH | Extensive manual testing, keep old code in git history |
| URL rewriting behavior differs | MEDIUM | Unit tests for rewriteUrls(), side-by-side comparison |
| Extension build errors | LOW | Gradual migration, fix TypeScript errors incrementally |
| Performance regression | LOW | Profile CSS loading before/after, ensure <10% increase |
| Error message changes confuse users | LOW | Verify error messages identical, update docs if needed |

## Definition of Done

- [ ] CSS service module created in language package
- [ ] Extension css-loader.ts delegates to language package
- [ ] Extension webview-css-injector.ts delegates to language package
- [ ] CSS error types consolidated in language package
- [ ] All language package tests pass (1061+ tests)
- [ ] Extension build passes with zero TypeScript errors
- [ ] Manual testing: CSS hot-reload works
- [ ] Manual testing: Webview CSS injection works
- [ ] Manual testing: CSS error notifications work
- [ ] Biome check passes (zero lint errors)
- [ ] REFACTORING_ROADMAP.md updated
- [ ] Documentation updated
- [ ] PR created and reviewed
