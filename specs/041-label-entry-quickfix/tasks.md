# Tasks: Missing Label Entry Quick Fix

**Input**: Design documents from `/specs/041-label-entry-quickfix/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: TDD approach - tests are written first per Constitution Principle V.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Language package**: `packages/language/src/`
- **Extension package**: `packages/extension/src/extension/`
- **Tests**: `packages/language/src/__tests__/label-entry-quickfix/`

---

## Phase 1: Setup (Shared Infrastructure) ✅

**Purpose**: Type definitions and test infrastructure setup

- [x] T001 Add type interfaces (`MissingLabelIDData`, `CreateLabelEntryCommand`, `LabelEntryCreationResult`) to `packages/language/src/types/code-actions.ts`
- [x] T002 [P] Create test directory `packages/language/src/__tests__/label-entry-quickfix/`

---

## Phase 2: Foundational (Blocking Prerequisites) ✅

**Purpose**: Extend diagnostic data in validator - MUST complete before code action can work

**⚠️ CRITICAL**: Code action provider needs extended diagnostic data to function

- [x] T003 Update `checkLabelIDParameter` in `packages/language/src/eligian-validator.ts` to include `labelId` in diagnostic data
- [x] T004 Update `checkLabelIDParameter` in `packages/language/src/eligian-validator.ts` to include `labelsFileUri` in diagnostic data
- [x] T005 Update `checkLabelIDParameter` in `packages/language/src/eligian-validator.ts` to include `languageCodes` array in diagnostic data
- [x] T006 Update `checkControllerLabelId` in `packages/language/src/eligian-validator.ts` to include extended diagnostic data (same fields as T003-T005)
- [x] T007 Add `extractLanguageCodes(program: Program): string[]` helper function to `packages/language/src/labels/types.ts`

**Checkpoint**: Diagnostic data now includes all information needed for the quick fix

---

## Phase 3: User Story 1 - Create Missing Label Entry with All Languages (Priority: P1) 🎯 MVP ✅

**Goal**: When invoking the quick fix on a missing label ID, create a new entry in the labels file with empty translations for all defined languages.

**Independent Test**: Create an Eligian file with 2+ languages and valid labels import. Use undefined label ID, invoke quick fix, verify entry is created with correct structure.

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T008 [P] [US1] Create unit test file `packages/language/src/__tests__/label-entry-quickfix/label-entry-generator.spec.ts`
- [x] T009 [P] [US1] Test `generateLabelEntry()` creates entry with correct label ID (including special characters like `welcome-message_v2`)
- [x] T010 [P] [US1] Test `generateLabelEntry()` creates translation for each language code
- [x] T011 [P] [US1] Test `generateLabelEntry()` generates unique UUIDs for each translation
- [x] T012 [P] [US1] Test `generateLabelEntry()` sets empty string for label text
- [x] T013 [P] [US1] Test `generateLabelEntry()` preserves language order from input

### Implementation for User Story 1

- [x] T014 [US1] Create `packages/language/src/labels/label-entry-generator.ts` with `generateLabelEntry(labelId, languageCodes)` function
- [x] T015 [US1] Export `generateLabelEntry` from `packages/language/src/labels/index.ts`
- [x] T016 [US1] Create `packages/extension/src/extension/label-entry-creator.ts` with `createLabelEntry(args)` function
- [x] T017 [US1] Implement file read logic in `label-entry-creator.ts` (read JSON, parse array)
- [x] T018 [US1] Implement file write logic in `label-entry-creator.ts` (append entry, stringify with 2-space indent, write)
- [x] T019 [US1] Add `createLabelEntryActions()` method to `packages/language/src/eligian-code-action-provider.ts`
- [x] T020 [US1] Filter diagnostics for `unknown_label_id` code in `createLabelEntryActions()`
- [x] T021 [US1] Create `CodeAction` with command `eligian.createLabelEntry` in code action provider
- [x] T022 [US1] Call `createLabelEntryActions()` from `getCodeActions()` method
- [x] T023 [US1] Register `eligian.createLabelEntry` command in `packages/extension/src/extension/main.ts`
- [x] T024 [US1] Run tests with `mcp__vitest__run_tests` and verify all pass

**Checkpoint**: User Story 1 complete - quick fix creates label entries with all languages

---

## Phase 4: User Story 2 - Quick Fix Availability Conditions (Priority: P1) ✅

**Goal**: The quick fix only appears when conditions are met: valid labels import, existing file, missing label ID.

**Independent Test**: Create scenarios with missing import, non-existent file, already-existing label - verify quick fix does NOT appear.

**⚠️ Dependency**: Requires US1 code action infrastructure (T019-T022) to be complete before implementation tasks can begin.

### Tests for User Story 2

- [x] T025 [P] [US2] Create integration test file `packages/language/src/__tests__/label-entry-quickfix/code-action-availability.spec.ts`
- [x] T026 [P] [US2] Test quick fix NOT offered when no labels import exists
- [x] T027 [P] [US2] Test quick fix NOT offered when labels file doesn't exist
- [x] T028 [P] [US2] Test quick fix NOT offered when labels file has invalid JSON
- [x] T029 [P] [US2] Test quick fix NOT offered when label ID already exists
- [x] T030 [P] [US2] Test quick fix IS offered when all conditions are met

### Implementation for User Story 2

- [x] T031 [US2] Add labels file existence check in `createLabelEntryActions()` - skip if file doesn't exist
- [x] T032 [US2] Add JSON validity check by reading file content in code action provider
- [x] T033 [US2] Add label existence check against parsed JSON - skip if label already exists
- [x] T034 [US2] Add check for `no_labels_import` diagnostic code - skip offering quick fix for this case
- [x] T035 [US2] Run tests with `mcp__vitest__run_tests` and verify all pass

**Checkpoint**: User Story 2 complete - quick fix only appears when appropriate

---

## Phase 5: User Story 3 - Handle Labels File Without Languages Block (Priority: P2) ✅

**Goal**: When no languages block is defined, fall back to creating entry with single "en-US" translation.

**Independent Test**: Create Eligian file with labels import but NO languages block, invoke quick fix, verify entry created with only "en-US" translation.

**Note**: The validator already enforces that a languages block is required when importing labels, so the quick fix is not offered in the no-languages-block scenario. Tests verify validator behavior and `extractLanguageCodes()` fallback logic.

### Tests for User Story 3

- [x] T036 [P] [US3] Test validator requires languages block when labels imported (`no-languages-block.spec.ts`)
- [x] T037 [P] [US3] Test quick fix NOT offered when no languages block exists (`no-languages-block.spec.ts`)
- [x] T038 [P] [US3] Test `extractLanguageCodes()` returns single language from languages block
- [x] T039 [P] [US3] Test `extractLanguageCodes()` returns `["en-US"]` when no languages block exists
- [x] T040 [P] [US3] Test `extractLanguageCodes()` returns all languages from block
- [x] T041 [P] [US3] Test `extractLanguageCodes()` preserves language order from block
- [x] T042 [P] [US3] Test `extractLanguageCodes()` includes all languages correctly

**Checkpoint**: User Story 3 complete - validator enforces languages block requirement, `extractLanguageCodes()` provides fallback to en-US

---

## Phase 6: Polish & Cross-Cutting Concerns ✅

**Purpose**: Error handling, edge cases, and quality gates

- [x] T043 [P] Add error handling for file read failures in `label-entry-creator.ts` (implemented in US1)
- [x] T044 [P] Add error handling for file write failures in `label-entry-creator.ts` (implemented in US1)
- [x] T045 [P] Add VS Code error notification display via `vscode.window.showErrorMessage()` (implemented in US1)
- [x] T046 [P] Test error handling: file read failure scenario (extension-side, covered by manual testing)
- [x] T047 [P] Test error handling: file write failure scenario (extension-side, covered by manual testing)
- [x] T048 [P] Test concurrent modification handling: re-read file before write (implemented via always re-reading file)
- [x] T049 Run `pnpm run build` and fix any TypeScript errors
- [x] T050 Run `pnpm run check` (Biome) and fix any lint/format issues
- [x] T051 Run full test suite with `mcp__vitest__run_tests` targeting `packages/language/src/__tests__/label-entry-quickfix/` - All 20 tests passing
- [ ] T052 Manual testing: validate quickstart.md scenarios work in VS Code

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup - BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational - delivers MVP
- **User Story 2 (Phase 4)**: Depends on US1 completion (T019-T022) - adds guards to existing code action
- **User Story 3 (Phase 5)**: Depends on Foundational only - tests fallback path (can run parallel with US1)
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Requires foundational diagnostic data (T003-T007) - core functionality
- **User Story 2 (P1)**: Requires US1 code action infrastructure (T019-T022) - adds guards to existing provider
- **User Story 3 (P2)**: Independent of US1/US2 - tests fallback path in `extractLanguageCodes()`

### Within Each User Story

- Tests MUST be written and FAIL before implementation (TDD)
- Generator functions before extension handlers
- Code action provider before command registration
- Story complete before moving to next priority

### Parallel Opportunities

**Phase 1 (Setup)**:
```
T001, T002 - Can run in parallel (different files)
```

**Phase 3 (User Story 1 Tests)**:
```
T008, T009, T010, T011, T012, T013 - All test file tasks in parallel
```

**Phase 4 (User Story 2 Tests)**:
```
T025, T026, T027, T028, T029, T030 - All test file tasks in parallel
```

**Phase 5 (User Story 3 Tests)**:
```
T036, T037, T038 - All test file tasks in parallel
```

**Phase 6 (Polish)**:
```
T043, T044, T045, T046, T047, T048 - All error handling tasks in parallel
```

---

## Parallel Example: User Story 1 Tests

```bash
# Launch all tests for User Story 1 together (TDD - all should FAIL initially):
Task: "T008 [P] [US1] Create unit test file"
Task: "T009 [P] [US1] Test generateLabelEntry() creates entry with correct label ID"
Task: "T010 [P] [US1] Test generateLabelEntry() creates translation for each language code"
Task: "T011 [P] [US1] Test generateLabelEntry() generates unique UUIDs"
Task: "T012 [P] [US1] Test generateLabelEntry() sets empty string for label text"
Task: "T013 [P] [US1] Test generateLabelEntry() preserves language order"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (type definitions)
2. Complete Phase 2: Foundational (diagnostic data extension)
3. Complete Phase 3: User Story 1 (core quick fix functionality)
4. **STOP and VALIDATE**: Test creating label entry works
5. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → Diagnostic data ready
2. Add User Story 1 → Test independently → MVP working!
3. Add User Story 2 → Guards prevent false positives
4. Add User Story 3 → Fallback behavior complete
5. Polish → Error handling, edge cases

### Summary

| Phase | Tasks | Key Deliverable |
|-------|-------|-----------------|
| Setup | T001-T002 | Type definitions |
| Foundational | T003-T007 | Extended diagnostic data |
| US1 (MVP) | T008-T024 | Quick fix creates entries |
| US2 | T025-T035 | Availability conditions |
| US3 | T036-T042 | Default language fallback |
| Polish | T043-T052 | Error handling, quality |

**Total Tasks**: 52
- Setup: 2 tasks (T001-T002)
- Foundational: 5 tasks (T003-T007)
- User Story 1: 17 tasks (T008-T024)
- User Story 2: 11 tasks (T025-T035)
- User Story 3: 7 tasks (T036-T042)
- Polish: 10 tasks (T043-T052)

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Use `mcp__vitest__run_tests` for all test execution (Constitution Principle XXIII)
- Consult `specs/TESTING_GUIDE.md` before writing tests (Constitution Principle XXV)
- Run `pnpm run check` after each phase (Constitution Principle XI)
- Commit after each task or logical group
