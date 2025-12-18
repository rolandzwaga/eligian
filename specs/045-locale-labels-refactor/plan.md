# Implementation Plan: Locale-Based Label Management Refactor

**Branch**: `045-locale-labels-refactor` | **Date**: 2025-12-17 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/045-locale-labels-refactor/spec.md`

## Summary

Migrate the Eligian DSL from legacy flat `ILanguageLabel[]` label format to Eligius 2.2.0's nested `ILocalesConfiguration` structure. This involves:
1. Updating grammar to support `locales` import keyword
2. Refactoring the Label Editor to handle nested locale data
3. Modifying the compiler to output `translationKey` instead of `labelId` for LabelController
4. Creating new validation, completion, and hover providers for translation keys

## Technical Context

**Language/Version**: TypeScript 5.x (Node.js 20+)
**Primary Dependencies**:
- Langium 3.x (grammar, LSP, validation)
- Effect-ts (compiler pipeline)
- Eligius 2.2.0 (runtime engine with new locale system)
- VS Code Extension API (label editor)

**Storage**: JSON files (`.json` locale files with `ILocalesConfiguration` schema)
**Testing**: Vitest (unit tests in `__tests__/` directories, `.spec.ts` files)
**Target Platform**: VS Code extension (Windows/Linux/macOS)
**Project Type**: Monorepo (pnpm workspaces)
**Performance Goals**:
- Autocomplete: <200ms response time
- Hot-reload: <300ms for locale file changes
- Validation: Real-time during typing

**Constraints**:
- Zero breaking changes to `.eligian` file syntax (new `locales` keyword replaces `labels`)
- Remove legacy label code and replace with new locale system

**Scale/Scope**:
- 7 user stories (2 P1, 3 P2, 2 P3)
- 20 functional requirements
- ~30 files to modify across language and extension packages

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence |
|-----------|--------|----------|
| I. Simplicity First | PASS | Follows existing patterns (CSS registry pattern for LocaleRegistry) |
| II. Comprehensive Testing | PASS | All changes require tests; 26+ existing label tests as baseline |
| III. Type Safety with Effect | PASS | Compiler changes use Effect pipeline |
| V. TDD | PASS | Tests written first for each component |
| VIII. Package Manager | PASS | Using pnpm exclusively |
| XI. Code Quality | PASS | Run `pnpm run check` after each task |
| XIII. File Extension | PASS | `.eligian` unchanged; locale files are `.json` |
| XIV. Windows Paths | PASS | All file operations use Windows-style paths |
| XV. Eligius Research | PASS | Import from `eligius` npm package only |
| XXIII. Testing Commands | PASS | Use `pnpm test` for all tests |
| XXIV. Test Helpers | PASS | Use `createTestContext()`, `DiagnosticSeverity` |
| XXV. Testing Guide | PASS | Consult `specs/TESTING_GUIDE.md` before writing tests |

**No violations identified.**

## Project Structure

### Documentation (this feature)

```text
specs/045-locale-labels-refactor/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (JSON schemas)
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
packages/
├── language/
│   └── src/
│       ├── eligian.langium                    # Grammar: add 'locales' keyword
│       ├── eligian-validator.ts               # Add translation key validation
│       ├── eligian-completion-provider.ts     # Add translation key completions
│       ├── eligian-hover-provider.ts          # Add translation key hover
│       ├── labels/                            # RENAME to locales/
│       │   ├── locale-parser.ts               # NEW: Parse ILocalesConfiguration
│       │   ├── translation-key-extractor.ts   # NEW: Extract dot-notation keys
│       │   └── types.ts                       # Update types for new format
│       ├── type-system-typir/
│       │   └── utils/
│       │       └── locale-registry.ts         # RENAME: label-registry.ts → locale-registry.ts
│       ├── validators/
│       │   └── locale-import-validator.ts     # RENAME: label-import-validator.ts
│       ├── schemas/
│       │   └── locales-schema.json            # NEW: JSON schema for ILocalesConfiguration
│       ├── compiler/
│       │   └── ast-transformer.ts             # Update LabelController: labelId → translationKey
│       └── __tests__/
│           ├── locale-import/                 # NEW test directory
│           ├── translation-key-validation/    # NEW test directory
│           └── translation-key-completion/    # NEW test directory
│
└── extension/
    └── src/
        └── extension/
            ├── label-editor/                  # REFACTOR: Major changes
            │   ├── LocaleEditorProvider.ts    # RENAME: LabelEditorProvider.ts
            │   ├── types.ts                   # Update message types for nested data
            │   ├── LocaleValidation.ts        # RENAME: LabelValidation.ts
            │   ├── templates/
            │   │   └── locale-editor.html     # RENAME: label-editor.html (new UI)
            │   └── __tests__/
            │       └── locale-editor.spec.ts  # NEW tests
            └── labels-watcher.ts              # RENAME to locales-watcher.ts
```

**Structure Decision**: Follows existing monorepo structure. Most changes are renames and modifications to existing files, preserving the established patterns (registry service, validator, completion provider).

## Complexity Tracking

> **No violations requiring justification**

## Implementation Phases

### Phase A: Foundation (P1 MVP)
1. Replace `labels` with `locales` grammar keyword
2. Create new `ILocalesConfiguration` schema and parser
3. Replace `LabelRegistry` with `LocaleRegistry` service
4. Update compiler to output `locales` with `translationKey`

### Phase B: Editor Refactor (P1)
1. Replace `LabelEditorProvider` with `LocaleEditorProvider` for nested locale format
2. Update webview UI for hierarchical key display
3. Remove legacy label editor code

### Phase C: Validation & IDE Features (P2)
1. Translation key validation with "Did you mean?" suggestions
2. Autocomplete for translation keys (dot-notation)
3. Hover documentation showing all locale translations

### Phase D: Advanced Features (P3)
1. Quick fix for creating new locale files
2. External $ref file resolution

## Key Technical Decisions

See [research.md](./research.md) for detailed analysis.

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Registry Pattern | Follow CSS registry pattern | Proven pattern in codebase |
| Nested Key Extraction | Recursive traversal with dot-join | Matches rosetta library's `t('nav.home')` API |
| Editor Data Model | By-key with locale columns | More intuitive for translators |
| Legacy Code | Remove entirely | Clean codebase, no legacy support needed |
