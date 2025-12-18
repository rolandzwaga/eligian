# Tasks: Locale-Based Label Management Refactor

**Input**: Design documents from `/specs/045-locale-labels-refactor/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/locales-schema.json

**Tests**: Included per constitution principle II (Comprehensive Testing) and V (TDD).

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story (US1-US7) this task belongs to
- Exact file paths from plan.md structure

## Workflow Requirements

**Before starting implementation:**
- [ ] **PREREQUISITE**: Read and ingest `specs/TESTING_GUIDE.md` for test patterns, helpers, and common mistakes

**After completing each task:**
- [ ] Run `pnpm run check` to verify code quality
- [ ] Run `pnpm test` to verify tests pass
- [ ] **Commit the completed work** before moving to the next task

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project preparation and schema foundation

- [ ] T001 Copy locales-schema.json from specs/045-locale-labels-refactor/contracts/ to packages/language/src/schemas/locales-schema.json
- [ ] T002 [P] Create packages/language/src/locales/ directory (new module for locale parsing)
- [ ] T003 [P] Create packages/language/src/locales/types.ts with TranslationKeyMetadata, LocaleFileMetadata, LocaleParseError interfaces from data-model.md
- [ ] T004 [P] Create packages/language/src/locales/index.ts exporting all public APIs

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T005 Replace 'labels' keyword with 'locales' keyword in grammar in packages/language/src/eligian.langium
- [ ] T006 Run `pnpm run build` to regenerate Langium parser after grammar change
- [ ] T007 [P] Create translation key extractor extractTranslationKeys() in packages/language/src/locales/translation-key-extractor.ts per research.md R2
- [ ] T008 Create LocaleParser class in packages/language/src/locales/locale-parser.ts for parsing ILocalesConfiguration JSON
- [ ] T009 Create LocaleRegistryService class in packages/language/src/locales/locale-registry.ts following CSS Registry pattern per research.md R6
- [ ] T010 Register LocaleRegistryService in packages/language/src/eligian-module.ts
- [ ] T011 Remove legacy label code (label-registry.ts, label-import-validator.ts, labels-schema.json) and related imports
- [ ] T012 Run `pnpm test` and fix any broken tests due to legacy removal

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Import and Use Locale Data (Priority: P1) 🎯 MVP

**Goal**: Enable developers to import locale files and compile with `translationKey` instead of `labelId`

**Independent Test**: Create `.eligian` file with `locales "./locales.json"` import, compile, verify output has `locales` config and `translationKey` in LabelController

### Tests for User Story 1

- [ ] T013 [P] [US1] Create test fixture packages/language/src/__tests__/fixtures/valid-locales.json with nested ILocalesConfiguration format
- [ ] T014 [P] [US1] Create parsing test packages/language/src/__tests__/locale-import/valid-locales.spec.ts - verify locales keyword parses correctly
- [ ] T015 [P] [US1] Create compiler test packages/language/src/__tests__/locale-import/compiler-output.spec.ts - verify translationKey output

### Implementation for User Story 1

- [ ] T016 [US1] Implement locale file loading in packages/language/src/asset-loading/compiler-integration.ts to handle 'locales' imports
- [ ] T017 [US1] Update ast-transformer.ts to emit translationKey instead of labelId for LabelController in packages/language/src/compiler/ast-transformer.ts per research.md R6
- [ ] T018 [US1] Add locale file validation in packages/language/src/validators/locale-import-validator.ts against locales-schema.json
- [ ] T019 [US1] Update LocaleRegistryService to extract and register translation keys on locale file import
- [ ] T020 [US1] Integrate locale import with document validation lifecycle in packages/language/src/eligian-validator.ts
- [ ] T021 [US1] Run `pnpm run check` and `pnpm test` to verify all tests pass

**Checkpoint**: US1 complete - `locales` import and `translationKey` compilation working

---

## Phase 4: User Story 2 - Edit Locale Data in Visual Editor (Priority: P1)

**Goal**: Refactor existing Label Editor to handle nested `ILocalesConfiguration` format

**Independent Test**: Open locale JSON file in VS Code, verify tree view displays keys, edit translation, save, verify JSON updated

**⚠️ CRITICAL**: This is a REFACTOR of existing code, not creation of new files.

**Current State** (needs migration):
- `LabelEditorProvider.ts` → uses `LabelGroup[]` with flat structure
- `types.ts` → defines `LabelGroup { id, labels: Translation[] }`
- `label-editor.html` → renders flat label groups

**Target State**:
- `LocaleEditorProvider.ts` → uses `ILocalesConfiguration` with nested structure
- `types.ts` → defines `KeyTreeNode` for hierarchical display
- `locale-editor.html` → renders translation key tree with locale columns

### Phase 4A: File Renames and Scaffolding

- [ ] T022 [US2] Rename packages/extension/src/extension/label-editor/ directory to locale-editor/ (git mv for history)
- [ ] T023 [US2] Rename LabelEditorProvider.ts to LocaleEditorProvider.ts and update class name
- [ ] T024 [US2] Rename LabelValidation.ts to LocaleValidation.ts and update exports
- [ ] T025 [US2] Rename LabelFileWatcher.ts to LocaleFileWatcher.ts and update class name
- [ ] T026 [US2] Rename templates/label-editor.html to templates/locale-editor.html
- [ ] T027 [US2] Update all imports across extension package to use new file names
- [ ] T028 [US2] Update packages/extension/package.json to register LocaleEditorProvider for locale JSON files
- [ ] T029 [US2] Run `pnpm run build` to verify no broken imports

### Phase 4B: Data Model Migration

**Purpose**: Replace `LabelGroup`/`Translation` interfaces with `ILocalesConfiguration`-compatible types

- [ ] T030 [P] [US2] Create test packages/extension/src/extension/locale-editor/__tests__/data-model-migration.spec.ts for new data structures
- [ ] T031 [US2] Update types.ts: Add KeyTreeNode interface for hierarchical key display:
  ```typescript
  interface KeyTreeNode {
    key: string;              // Full dot-notation key (e.g., "nav.home")
    segment: string;          // Last segment (e.g., "home")
    translations: Map<string, string>; // localeCode → translation
    children: KeyTreeNode[];  // For hierarchy display (optional)
  }
  ```
- [ ] T032 [US2] Update types.ts: Replace LabelGroup/Translation in ToWebviewMessage with ILocalesConfiguration
- [ ] T033 [US2] Update types.ts: Replace LabelGroup/Translation in ToExtensionMessage with ILocalesConfiguration
- [ ] T034 [US2] Create locale-editor/key-tree-builder.ts: Convert ILocalesConfiguration to KeyTreeNode[]
- [ ] T035 [US2] Create locale-editor/locale-serializer.ts: Convert KeyTreeNode[] back to ILocalesConfiguration for saving

### Phase 4C: LocaleEditorProvider Refactor

**Purpose**: Update provider to handle nested locale structure

- [ ] T036 [P] [US2] Create test packages/extension/src/extension/locale-editor/__tests__/locale-editor-provider.spec.ts
- [ ] T037 [US2] Update LocaleEditorProvider.loadDocument() to parse ILocalesConfiguration JSON
- [ ] T038 [US2] Update LocaleEditorProvider.saveDocument() to serialize back to ILocalesConfiguration
- [ ] T039 [US2] Update 'initialize' message handler to send KeyTreeNode[] to webview
- [ ] T040 [US2] Implement 'add-key' message handler: Add key to ALL locales with empty string value
- [ ] T041 [US2] Implement 'update-translation' message handler: Update specific locale's translation
- [ ] T042 [US2] Implement 'delete-key' message handler: Remove key from ALL locales with confirmation
- [ ] T043 [US2] Implement 'rename-key' message handler: Rename key across ALL locales (preserving translations)

### Phase 4D: Webview UI Refactor

**Purpose**: Update HTML/JS to render translation key tree with locale columns

- [ ] T044 [P] [US2] Create test packages/extension/src/extension/locale-editor/__tests__/webview-rendering.spec.ts
- [ ] T045 [US2] Update locale-editor.html: Replace flat group list with tree view for translation keys
- [ ] T046 [US2] Update locale-editor.html: Add locale columns (one per language code) with inline editing
- [ ] T047 [US2] Update locale-editor.ts: Handle KeyTreeNode[] rendering with expandable tree structure
- [ ] T048 [US2] Update locale-editor.ts: Implement inline cell editing for translations
- [ ] T049 [US2] Update locale-editor.ts: Add "Add Key" button with dot-notation input
- [ ] T050 [US2] Update locale-editor.ts: Add "Add Language" button to add new locale column
- [ ] T051 [US2] Update locale-editor-core.ts: Update message sending for new data structures

### Phase 4E: Validation (FR-015, FR-016)

- [ ] T052 [P] [US2] Create test packages/extension/src/extension/locale-editor/__tests__/locale-validation.spec.ts
- [ ] T053 [US2] Update LocaleValidation.ts: Validate language code format (xx-XX pattern) per FR-016
- [ ] T054 [US2] Update LocaleValidation.ts: Validate translation key format (alphanumeric, dots, underscores, hyphens) per FR-015
- [ ] T055 [US2] Add validation error display in webview UI (red border, tooltip)

### Phase 4F: Usage Tracking and Advanced Features (FR-017, FR-018)

- [ ] T056 [P] [US2] Create test packages/extension/src/extension/locale-editor/__tests__/usage-tracking.spec.ts
- [ ] T057 [US2] Implement usage tracking: Scan .eligian files for translation key references per FR-017
- [ ] T058 [US2] Display usage count badge next to each translation key in tree view
- [ ] T059 [US2] Show usage file list on hover/click for each translation key
- [ ] T060 [US2] Integrate LocaleEditorProvider with VS Code undo/redo stack per FR-018

### Phase 4G: Cleanup and Verification

- [ ] T061 [US2] Remove any remaining legacy LabelGroup/Translation code
- [ ] T062 [US2] Update extension README with new locale editor documentation
- [ ] T063 [US2] Run `pnpm run check` to verify code quality
- [ ] T064 [US2] Run `pnpm test` to verify all tests pass
- [ ] T065 [US2] Manual test: Open a nested locale JSON, edit translations, save, verify JSON structure preserved

**Checkpoint**: US2 complete - Visual locale editor working with tree view, nested key editing, validation, usage tracking, and undo/redo

---

## Phase 5: User Story 3 - Translation Key Autocomplete (Priority: P2) ✅ COMPLETE

**Goal**: Autocomplete suggestions for translation keys in LabelController calls

**Status**: Already implemented in previous phases. Translation key extractor and completion provider working.

**Verification**:
- [ ] T066 [US3] Verify translation key completion works: Type `addController("LabelController", "` and trigger autocomplete
- [ ] T067 [US3] Verify filtered completions work with partial key input (e.g., "nav.")

**Checkpoint**: US3 verified - Translation key autocomplete working

---

## Phase 6: User Story 4 - Hover Documentation for Translation Keys (Priority: P2) ✅ COMPLETE

**Goal**: Show all locale translations when hovering over a translation key

**Status**: Already implemented. Hover provider updated with "Translation Key" terminology.

**Verification**:
- [ ] T068 [US4] Verify hover on `"nav.home"` in LabelController shows translations for all locales
- [ ] T069 [US4] Verify hover on unknown key shows appropriate warning

**Checkpoint**: US4 verified - Hover documentation for translation keys working

---

## Phase 7: User Story 5 - Validate Translation Key Existence (Priority: P2) ✅ COMPLETE

**Goal**: Warn when using non-existent translation keys with "Did you mean?" suggestions

**Status**: Already implemented. Validation uses "translation key" terminology in messages.

**Verification**:
- [ ] T070 [US5] Verify typo `"nav.homee"` produces warning with "Did you mean?" suggestion
- [ ] T071 [US5] Verify valid key produces no error

**Checkpoint**: US5 verified - Translation key validation with suggestions working

---

## Phase 8: User Story 6 - Create New Locale File via Quick Fix (Priority: P3)

**Goal**: Quick fix to create locale file from `languages` block when file doesn't exist

**Independent Test**: Write `locales "./locales.json"` for non-existent file, click quick fix, verify file created

### Tests for User Story 6

- [ ] T072 [P] [US6] Create test packages/language/src/__tests__/locale-quickfix/create-locale-file.spec.ts

### Implementation for User Story 6

- [ ] T073 [US6] Create packages/language/src/lsp/locale-file-code-actions.ts for locale file quick fix
- [ ] T074 [US6] Generate initial locale structure from languages block entries
- [ ] T075 [US6] Register code action provider in packages/language/src/eligian-module.ts
- [ ] T076 [US6] Run `pnpm run check` and `pnpm test` to verify all tests pass

**Checkpoint**: US6 complete - Quick fix locale file creation working

---

## Phase 9: User Story 7 - External Locale File References (Priority: P3)

**Goal**: Support `$ref` syntax for external locale files per language

**Independent Test**: Create locale with `{ "en-US": { "$ref": "./en-US.json" } }`, verify resolved correctly

### Tests for User Story 7

- [ ] T077 [P] [US7] Create test packages/language/src/__tests__/locale-ref/external-ref.spec.ts
- [ ] T078 [P] [US7] Create test for circular reference detection
- [ ] T079 [P] [US7] Create test for missing external file error

### Implementation for User Story 7

- [ ] T080 [US7] Update packages/language/src/locales/translation-key-extractor.ts to resolve $ref files
- [ ] T081 [US7] Add circular reference detection with visited file tracking
- [ ] T082 [US7] Create packages/language/src/locales/ref-resolver.ts for file loading
- [ ] T083 [US7] Add validation error for missing external files
- [ ] T084 [US7] Run `pnpm run check` and `pnpm test` to verify all tests pass

**Checkpoint**: US7 complete - External locale file references working

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Final cleanup and integration testing

- [ ] T085 [P] Run quickstart.md validation scenarios manually
- [ ] T086 Verify all locale-related tests pass with `pnpm test`
- [ ] T087 Run `pnpm run check` for final lint/format validation
- [ ] T088 Run `pnpm run build` to verify successful build

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies - start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 - **BLOCKS all user stories**
- **Phase 3-9 (User Stories)**: All depend on Phase 2 completion
  - US1 and US2 are both P1 and can run in parallel
  - US3, US4, US5 are P2 and depend on US1 (need registry populated)
  - US6, US7 are P3 and can run after US1
- **Phase 10 (Polish)**: Depends on all desired user stories complete

### User Story Dependencies

```
                    ┌─────────────────────┐
                    │ Phase 2: Foundation │
                    └──────────┬──────────┘
                               │
           ┌───────────────────┼───────────────────┐
           │                   │                   │
           ▼                   ▼                   ▼
    ┌────────────┐      ┌────────────┐      ┌────────────┐
    │ US1 (P1)   │      │ US2 (P1)   │      │ US6 (P3)   │
    │ MVP Import │      │ Editor     │      │ Quick Fix  │
    └─────┬──────┘      └────────────┘      └────────────┘
          │
    ┌─────┴─────────────────────────┐
    │                               │
    ▼                               ▼
┌────────────┐              ┌────────────┐
│ US3 (P2)   │              │ US7 (P3)   │
│ Completion │              │ $ref       │
└─────┬──────┘              └────────────┘
      │
┌─────┴─────────────────────┐
│                           │
▼                           ▼
┌────────────┐       ┌────────────┐
│ US4 (P2)   │       │ US5 (P2)   │
│ Hover      │       │ Validation │
└────────────┘       └────────────┘
```

### Parallel Opportunities

**Within Phase 2:**
- T007, T008 can run in parallel (different files)

**Within Phase 3 (US1):**
- T013, T014, T015 tests can run in parallel

**Across User Stories (after Phase 2):**
- US1 and US2 can be developed in parallel (different packages)
- US6 and US7 can be developed in parallel (different features)

---

## Parallel Example: User Story 1

```bash
# Launch tests in parallel:
Task: T013 - Create test fixture valid-locales.json
Task: T014 - Create parsing test valid-locales.spec.ts
Task: T015 - Create compiler test compiler-output.spec.ts
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL)
3. Complete Phase 3: User Story 1 (Import + Compile)
4. **STOP and VALIDATE**: Test `locales` import works end-to-end
5. Deploy/demo if ready

### Recommended Incremental Delivery

1. **Week 1**: Setup + Foundation + US1 (MVP - basic import working)
2. **Week 2**: US2 (Visual editor)
3. **Week 3**: US3 + US4 + US5 (IDE features - completion, hover, validation)
4. **Week 4**: US6 + US7 (Quick fix, $ref support) + Polish

---

## Summary

| Phase | Tasks | User Story | Priority | Status |
|-------|-------|------------|----------|--------|
| Phase 1: Setup | 4 (T001-T004) | - | - | ✅ Complete |
| Phase 2: Foundational | 8 (T005-T012) | - | - | ✅ Complete |
| Phase 3: US1 Import | 9 (T013-T021) | US1 | P1 (MVP) | ✅ Complete |
| Phase 4: US2 Editor | 44 (T022-T065) | US2 | P1 | ❌ **TODO** |
| Phase 5: US3 Autocomplete | 2 (T066-T067) | US3 | P2 | ✅ Complete (verify) |
| Phase 6: US4 Hover | 2 (T068-T069) | US4 | P2 | ✅ Complete (verify) |
| Phase 7: US5 Validation | 2 (T070-T071) | US5 | P2 | ✅ Complete (verify) |
| Phase 8: US6 Quick Fix | 5 (T072-T076) | US6 | P3 | ❌ Not started |
| Phase 9: US7 $ref | 8 (T077-T084) | US7 | P3 | ⚠️ Partial |
| Phase 10: Polish | 4 (T085-T088) | - | - | Pending |
| **Total** | **88** | 7 stories | | |

### Remaining Work Summary

**Critical (P1)**:
- **Phase 4 (US2)**: 44 tasks to refactor Visual Editor from `LabelGroup` to `ILocalesConfiguration`

**Optional (P3)**:
- **Phase 8 (US6)**: 5 tasks for Quick Fix locale file creation
- **Phase 9 (US7)**: 8 tasks for $ref file resolution (schema ready, resolution not implemented)

---

## Notes

- All tasks follow checklist format: `- [ ] [ID] [P?] [Story?] Description with file path`
- TDD approach: Tests marked first in each user story phase
- Run `pnpm run check` and `pnpm test` at each checkpoint
- **CRITICAL**: Read `specs/TESTING_GUIDE.md` before writing any tests (Constitution Principle XXV)
- Use `createTestContext()` and `DiagnosticSeverity` from test helpers
- **Commit after each task**: Create atomic commits for each completed task before moving to the next
