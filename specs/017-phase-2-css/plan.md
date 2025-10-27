# Implementation Plan: Phase 2 - CSS Consolidation

**Branch**: `017-phase-2-css` | **Date**: 2025-01-27 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/017-phase-2-css/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

**Primary Requirement**: Move all CSS functionality into `@eligian/language` package to eliminate duplication between language server and VS Code extension.

**Technical Approach**: Create a unified CSS service module (`css-service.ts`) in the language package that exports `parseCSS()`, `loadCSS()`, and `rewriteUrls()` functions. Migrate extension's `css-loader.ts` and `webview-css-injector.ts` to delegate to this service, removing 500-600 lines of duplicate code. Consolidate CSS error types (FileNotFoundError, PermissionError, ReadError, CSSParseError) in language package. Extension's `css-watcher.ts` remains unchanged (file watching is extension-specific).

**Dependencies**: Feature 016 (Shared Utilities Package) - CSS service uses shared-utils for file loading.

## Technical Context

**Language/Version**: TypeScript 5.0+ with ESM (`module: "NodeNext"`)
**Primary Dependencies**:
  - `postcss` (CSS parsing - already installed in language package)
  - `postcss-selector-parser` (selector parsing - already installed in language package)
  - `@eligian/shared-utils` (file loading from Phase 1)
  - `vscode` (webview API for URL rewriting - already installed in extension)

**Storage**: N/A (CSS files loaded from filesystem, no database)
**Testing**: Vitest (unit tests in language package, manual testing for extension)
**Target Platform**: Node.js ESM (language package) + VS Code Extension Host (extension)
**Project Type**: Monorepo with pnpm workspaces (language + extension packages)
**Performance Goals**:
  - CSS loading: <500ms initial load (current baseline)
  - CSS hot-reload: <300ms (current baseline)
  - Build time: <10% increase over current (minimal complexity added)

**Constraints**:
  - Zero user-visible behavior changes (100% backwards compatibility)
  - All 1061+ existing tests must pass
  - Extension hot-reload functionality must continue working identically
  - No new dependencies required (use existing postcss, shared-utils, vscode)

**Scale/Scope**:
  - 2 packages affected (language, extension)
  - ~500-600 lines of code to remove (duplication elimination)
  - ~200-300 lines of new code (css-service.ts + thin wrappers)
  - 130 existing CSS tests (must all pass)
  - 20-30 new tests (css-service.ts unit tests)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with `.specify/memory/constitution.md`:

- [x] **Simplicity & Documentation**: Approach is clear - move CSS logic to language package, extension delegates. Reduces complexity by eliminating duplication. Well-documented in spec.
- [x] **Comprehensive Testing**: Unit tests planned for css-service.ts (20-30 tests). All 130 existing CSS tests must pass (regression verification). Manual testing for extension (hot-reload, webview injection).
- [x] **No Gold-Plating**: Solves real, documented need - eliminates 500-600 lines of duplicate code. No speculative features added.
- [x] **Code Review**: Review process defined in spec (PR creation, approval required)
- [x] **UX Consistency**: Zero user-visible changes - all behavior identical after refactoring
- [x] **Functional Programming**: External immutability maintained. No Effect-ts needed (CSS operations are synchronous file I/O with sync wrappers for extension compatibility)

*All checks pass. No violations to justify.*

## Project Structure

### Documentation (this feature)

```
specs/017-phase-2-css/
├── plan.md              # This file (/speckit.plan command output)
├── spec.md              # Feature specification (already created)
├── research.md          # Phase 0 output (/speckit.plan command - generated below)
├── data-model.md        # Phase 1 output (/speckit.plan command - generated below)
├── quickstart.md        # Phase 1 output (/speckit.plan command - generated below)
├── contracts/           # Phase 1 output (css-service API contract)
│   └── css-service.ts   # TypeScript interface definitions
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```
packages/
├── language/                        # Language server and compiler
│   ├── src/
│   │   ├── css/
│   │   │   ├── css-service.ts       # NEW: Unified CSS service API
│   │   │   ├── css-parser.ts        # Existing: PostCSS parsing
│   │   │   ├── css-registry.ts      # Existing: CSS metadata for LSP
│   │   │   └── __tests__/
│   │   │       ├── css-service.spec.ts  # NEW: CSS service unit tests (20-30 tests)
│   │   │       ├── css-parser.spec.ts   # Existing: 44 tests
│   │   │       ├── css-registry.spec.ts # Existing: 34 tests
│   │   │       ├── levenshtein.spec.ts  # Existing: 42 tests
│   │   │       └── selector-parser.spec.ts  # Existing: 42 tests
│   │   ├── eligian-validator.ts     # Existing: CSS validation
│   │   └── index.ts                 # Update: Export css-service
│   └── package.json                 # Update: Add css-service to exports
│
└── extension/                       # VS Code extension
    ├── src/extension/
    │   ├── css-loader.ts            # REFACTOR: Thin wrapper, delegates to language package
    │   ├── webview-css-injector.ts  # REFACTOR: Uses language package CSS service
    │   └── css-watcher.ts           # UNCHANGED: File watching (extension-specific)
    └── package.json                 # No changes (already depends on @eligian/language)
```

**Structure Decision**: Monorepo structure with two packages. Language package becomes the source of truth for CSS operations (parsing, loading, URL rewriting). Extension package becomes thin wrapper that delegates to language package. This eliminates duplication and establishes single source of truth.

## Complexity Tracking

*No constitutional violations. This section is empty.*

## Phase 0: Research & Unknowns

**Research Questions** (from Technical Context):

1. **PostCSS API for URL Rewriting**: How to use PostCSS to rewrite `url()` paths in CSS?
   - Current implementation uses regex (simple but brittle)
   - Should we use PostCSS for more robust parsing?
   - Performance implications?

2. **VS Code Webview API Requirements**: What are the requirements for passing webview instance to language package?
   - Language package is Node.js only (no VS Code imports normally)
   - Can we import `vscode` types in language package?
   - Should webview be passed as parameter or abstracted?

3. **Error Type Consolidation**: Where should CSS error types live?
   - shared-utils already has FileNotFoundError, PermissionError, ReadError
   - Should language package re-export these?
   - Should CSSParseError move to shared-utils or stay in language?

**Resolution Strategy**: Generate `research.md` with findings from:
- PostCSS documentation (via context7)
- VS Code API documentation (via context7)
- Existing css-loader.ts implementation analysis
- shared-utils error types analysis

## Phase 1: Design & Contracts

**Entity Extraction** (from spec):

1. **CSSService**: Unified CSS operations module
   - Methods: parseCSS, loadCSS, rewriteUrls
   - Integrations: css-parser.ts, shared-utils, postcss

2. **CSSParseResult**: CSS parsing output (already exists)
   - Fields: classes, ids, classLocations, idLocations, classRules, idRules, errors

3. **CSS Error Types**: Typed errors
   - FileNotFoundError, PermissionError, ReadError (from shared-utils)
   - CSSParseError (CSS-specific, in css-parser.ts)

**API Contract Generation**:

Contract files will be generated in `contracts/css-service.ts` with TypeScript interface definitions for:
- `CSSService` interface
- `parseCSS()` signature
- `loadCSS()` signature
- `rewriteUrls()` signature
- Error types re-exported

**Quickstart Generation**:

`quickstart.md` will provide:
- How to import css-service from language package
- Example: Parse CSS file
- Example: Load CSS for webview
- Example: Rewrite CSS URLs
- Error handling patterns

## Research Tasks (Phase 0)

The following research will be conducted and documented in `research.md`:

### Task 1: PostCSS URL Rewriting Best Practices

**Goal**: Determine if PostCSS should be used for URL rewriting or if regex is sufficient.

**Approach**:
- Consult context7 for PostCSS documentation
- Review existing `css-loader.ts` regex implementation
- Analyze performance trade-offs
- Document decision and rationale

**Decision Criteria**:
- Correctness: Does it handle all CSS url() patterns?
- Performance: Is it fast enough (<500ms for typical CSS files)?
- Simplicity: Is it easier to maintain than regex?

### Task 2: VS Code Webview API Integration

**Goal**: Determine how to integrate VS Code webview API in language package.

**Approach**:
- Review VS Code extension API documentation (via context7)
- Analyze webview.asWebviewUri() usage in current implementation
- Determine if `vscode` can be imported in language package
- Document integration pattern

**Decision Criteria**:
- Can language package import `vscode` types without runtime dependency?
- Should webview be passed as parameter or abstracted into interface?
- What's the impact on testing (mocking webview in unit tests)?

### Task 3: Error Type Architecture

**Goal**: Determine where CSS error types should be defined and how to avoid duplication.

**Approach**:
- Review shared-utils error types (FileNotFoundError, PermissionError, ReadError)
- Review css-parser.ts error types (CSSParseError)
- Determine if language package should re-export shared-utils errors
- Document error type organization

**Decision Criteria**:
- Single source of truth for each error type
- No duplication between packages
- Clear import paths for extension consumers

## Next Steps

After this plan is approved:

1. **Phase 0**: Execute research tasks, generate `research.md`
2. **Phase 1**: Generate `data-model.md`, `contracts/css-service.ts`, `quickstart.md`
3. **Agent Context Update**: Run `.specify/scripts/powershell/update-agent-context.ps1 -AgentType claude`
4. **Re-evaluate Constitution Check**: Verify design maintains compliance
5. **Phase 2**: Run `/speckit.tasks` to generate `tasks.md` (implementation tasks)

## Gates

**Phase 0 Gate**: All research questions resolved, documented in `research.md`
**Phase 1 Gate**: Data model, contracts, and quickstart complete
**Phase 2 Gate**: Constitution check passes after design, ready for task generation

---

**Status**: Planning complete, ready for Phase 0 research execution.
