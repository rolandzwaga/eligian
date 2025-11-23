# Tasks: Language Block Quick Fix

**Input**: Design documents from `/specs/038-language-quick-fixes/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Following Constitution Principle V (TDD), all tests are written FIRST, verified to FAIL, then implementation follows. Tests are MANDATORY per project constitution.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Project structure: `packages/language/src/` (monorepo language package)
- Tests: `packages/language/src/__tests__/`
- All paths relative to repository root

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create module structure and basic infrastructure

- [ ] T001 Create labels/ directory structure in packages/language/src/labels/
- [ ] T002 Create test fixtures directory in packages/language/src/__tests__/language-quick-fix-integration/fixtures/
- [ ] T003 [P] Create types.ts file with shared type definitions in packages/language/src/labels/types.ts
- [ ] T004 [P] Create index.ts barrel export file in packages/language/src/labels/index.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T005 Create test fixture: valid-labels.json with multiple language codes (en-US, nl-NL, fr-FR, de-DE) in packages/language/src/__tests__/language-quick-fix-integration/fixtures/valid-labels.json
- [ ] T006 [P] Create test fixture: invalid-labels.json with malformed JSON in packages/language/src/__tests__/language-quick-fix-integration/fixtures/invalid-labels.json
- [ ] T007 [P] Create test fixture: empty-labels.json with empty array in packages/language/src/__tests__/language-quick-fix-integration/fixtures/empty-labels.json
- [ ] T008 Consult specs/TESTING_GUIDE.md for test patterns before writing tests (Constitution Principle XXV)

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Generate Language Block from Scratch (Priority: P1) 🎯 MVP

**Goal**: Automatically generate a language block from imported labels files by parsing the JSON and extracting all unique language codes, sorted alphabetically with the first marked as default.

**Independent Test**: Create an Eligian file with only a labels import, trigger the quick fix, and verify the generated language block contains all language codes from the labels file with the first language marked as default.

### Tests for User Story 1 (TDD - Write FIRST) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T009 [P] [US1] Write unit test: LabelsParser extracts language codes from valid JSON in packages/language/src/__tests__/labels/labels-parser.spec.ts
- [ ] T010 [P] [US1] Write unit test: LabelsParser deduplicates language codes in packages/language/src/__tests__/labels/labels-parser.spec.ts
- [ ] T011 [P] [US1] Write unit test: LabelsParser sorts language codes alphabetically in packages/language/src/__tests__/labels/labels-parser.spec.ts
- [ ] T012 [P] [US1] Write unit test: LabelsParser handles multiple labels files in packages/language/src/__tests__/labels/labels-parser.spec.ts
- [ ] T013 [P] [US1] Write unit test: LanguageBlockGenerator generates correct format with default marker in packages/language/src/__tests__/labels/language-block-generator.spec.ts
- [ ] T014 [P] [US1] Write unit test: LanguageBlockGenerator formats multiple languages correctly in packages/language/src/__tests__/labels/language-block-generator.spec.ts
- [ ] T015 [P] [US1] Write unit test: FilePositionHelper finds insertion point before imports in packages/language/src/__tests__/labels/file-position-helper.spec.ts
- [ ] T016 [P] [US1] Write unit test: FilePositionHelper finds insertion point at start of empty file in packages/language/src/__tests__/labels/file-position-helper.spec.ts
- [ ] T017 [US1] Write integration test: End-to-end quick fix generates language block from valid labels file in packages/language/src/__tests__/language-quick-fix-integration/basic-generation.spec.ts
- [ ] T018 [US1] Verify all User Story 1 tests FAIL (Red phase of TDD)

### Implementation for User Story 1

- [ ] T019 [P] [US1] Implement LabelsParser.extractLanguageCodes() - parse JSON and extract languageCode fields in packages/language/src/labels/labels-parser.ts
- [ ] T020 [P] [US1] Implement LanguageBlockGenerator.generate() - format language block text with proper syntax in packages/language/src/labels/language-block-generator.ts
- [ ] T021 [P] [US1] Implement FilePositionHelper.findInsertionPosition() - determine where to insert block in packages/language/src/labels/file-position-helper.ts
- [ ] T022 [US1] Implement LanguageBlockCodeActionProvider.provideCodeActions() skeleton - detect missing language block in packages/language/src/labels/language-block-code-actions.ts
- [ ] T023 [US1] Integrate parser, generator, and position helper into code action provider in packages/language/src/labels/language-block-code-actions.ts
- [ ] T024 [US1] Generate workspace edit with formatted language block text in packages/language/src/labels/language-block-code-actions.ts
- [ ] T025 [US1] Integrate LanguageBlockCodeActionProvider into EligianCodeActionProvider in packages/language/src/eligian-code-action-provider.ts
- [ ] T026 [US1] Run vitest-mcp tests for User Story 1: mcp__vitest__run_tests with target packages/language/src/__tests__/labels/ and packages/language/src/__tests__/language-quick-fix-integration/basic-generation.spec.ts
- [ ] T027 [US1] Verify all User Story 1 tests PASS (Green phase of TDD)

**Checkpoint**: At this point, User Story 1 should be fully functional - quick fix generates language block from valid labels files

---

## Phase 4: User Story 2 - Handle Missing or Invalid Labels Files (Priority: P2)

**Goal**: Gracefully handle error cases by generating a template language block when labels files are missing, invalid, or empty, allowing developers to continue working productively.

**Independent Test**: Create an Eligian file that imports a non-existent labels file, trigger the quick fix, and verify a basic template language block is generated with placeholder language codes.

### Tests for User Story 2 (TDD - Write FIRST) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T028 [P] [US2] Write unit test: LabelsParser handles missing file gracefully (returns empty array) in packages/language/src/__tests__/labels/labels-parser.spec.ts
- [ ] T029 [P] [US2] Write unit test: LabelsParser handles invalid JSON gracefully (returns empty array) in packages/language/src/__tests__/labels/labels-parser.spec.ts
- [ ] T030 [P] [US2] Write unit test: LabelsParser handles empty labels array (returns empty array) in packages/language/src/__tests__/labels/labels-parser.spec.ts
- [ ] T031 [P] [US2] Write unit test: LanguageBlockGenerator generates template when input is empty array in packages/language/src/__tests__/labels/language-block-generator.spec.ts
- [ ] T032 [P] [US2] Write integration test: Quick fix generates template for missing labels file in packages/language/src/__tests__/language-quick-fix-integration/error-handling.spec.ts
- [ ] T033 [P] [US2] Write integration test: Quick fix generates template for invalid JSON in packages/language/src/__tests__/language-quick-fix-integration/error-handling.spec.ts
- [ ] T034 [P] [US2] Write integration test: Quick fix generates template for empty labels file in packages/language/src/__tests__/language-quick-fix-integration/error-handling.spec.ts
- [ ] T035 [US2] Verify all User Story 2 tests FAIL (Red phase of TDD)

### Implementation for User Story 2

- [ ] T036 [P] [US2] Add try/catch error handling to LabelsParser.extractLanguageCodes() in packages/language/src/labels/labels-parser.ts
- [ ] T037 [P] [US2] Add template generation to LanguageBlockGenerator.generate() when input is empty in packages/language/src/labels/language-block-generator.ts
- [ ] T038 [US2] Update LanguageBlockCodeActionProvider to handle empty language codes (fallback to template) in packages/language/src/labels/language-block-code-actions.ts
- [ ] T039 [US2] Add logging for file read errors and JSON parse errors (for debugging) in packages/language/src/labels/labels-parser.ts
- [ ] T040 [US2] Run vitest-mcp tests for User Story 2: mcp__vitest__run_tests with target packages/language/src/__tests__/language-quick-fix-integration/error-handling.spec.ts
- [ ] T041 [US2] Verify all User Story 2 tests PASS (Green phase of TDD)

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently - quick fix handles all error cases gracefully

---

## Phase 5: User Story 3 - Smart Positioning and Formatting (Priority: P3)

**Goal**: Insert the language block at the optimal location (after comments, before imports) with proper whitespace separation, making the generated code feel natural and integrated.

**Independent Test**: Create Eligian files with various structures (with/without comments, with/without other imports) and verify the language block is always inserted in a logical, readable location.

### Tests for User Story 3 (TDD - Write FIRST) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T042 [P] [US3] Write unit test: FilePositionHelper detects file-level comments and inserts after them in packages/language/src/__tests__/labels/file-position-helper.spec.ts
- [ ] T043 [P] [US3] Write unit test: FilePositionHelper inserts before first import statement in packages/language/src/__tests__/labels/file-position-helper.spec.ts
- [ ] T044 [P] [US3] Write unit test: FilePositionHelper inserts before timeline if no imports in packages/language/src/__tests__/labels/file-position-helper.spec.ts
- [ ] T045 [P] [US3] Write unit test: LanguageBlockGenerator adds proper trailing newlines in packages/language/src/__tests__/labels/language-block-generator.spec.ts
- [ ] T046 [P] [US3] Write integration test: Quick fix inserts after file-level comments in packages/language/src/__tests__/language-quick-fix-integration/positioning.spec.ts
- [ ] T047 [P] [US3] Write integration test: Quick fix inserts before imports with proper spacing in packages/language/src/__tests__/language-quick-fix-integration/positioning.spec.ts
- [ ] T048 [P] [US3] Write integration test: Quick fix preserves existing file formatting in packages/language/src/__tests__/language-quick-fix-integration/positioning.spec.ts
- [ ] T049 [US3] Verify all User Story 3 tests FAIL (Red phase of TDD)

### Implementation for User Story 3

- [ ] T050 [P] [US3] Add comment detection logic to FilePositionHelper.findInsertionPosition() in packages/language/src/labels/file-position-helper.ts
- [ ] T051 [P] [US3] Add AST traversal to find first import/timeline/action node in packages/language/src/labels/file-position-helper.ts
- [ ] T052 [P] [US3] Add trailing newlines to LanguageBlockGenerator output in packages/language/src/labels/language-block-generator.ts
- [ ] T053 [US3] Update workspace edit to preserve existing line breaks and indentation in packages/language/src/labels/language-block-code-actions.ts
- [ ] T054 [US3] Run vitest-mcp tests for User Story 3: mcp__vitest__run_tests with target packages/language/src/__tests__/language-quick-fix-integration/positioning.spec.ts
- [ ] T055 [US3] Verify all User Story 3 tests PASS (Green phase of TDD)

**Checkpoint**: All user stories should now be independently functional - quick fix generates well-positioned, properly formatted language blocks

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Quality assurance, refactoring, and cross-cutting improvements

- [ ] T056 [P] Run full test suite with vitest-mcp: mcp__vitest__run_tests with target packages/language/src/__tests__/labels/ and packages/language/src/__tests__/language-quick-fix-integration/
- [ ] T057 [P] Run coverage analysis with vitest-mcp: mcp__vitest__analyze_coverage with target packages/language/src/labels/
- [ ] T058 Verify coverage meets baseline >80% (Constitution Principle II)
- [ ] T059 [P] Run Biome linting and formatting: pnpm run check (Constitution Principle XI)
- [ ] T060 [P] Run TypeScript compilation: pnpm run build
- [ ] T061 Code review and refactoring: simplify complex logic, improve readability (Constitution Principle I)
- [ ] T062 [P] Performance test: Verify quick fix handles 50+ language codes in <1 second (SC-003)
- [ ] T063 [P] Edge case testing: Verify deduplication, relative/absolute paths, multiple imports
- [ ] T064 Update quickstart.md with any implementation learnings (if needed)
- [ ] T065 Final quality gate check: All tests pass, coverage >80%, lint clean, build successful

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-5)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3)
- **Polish (Phase 6)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - Extends US1 implementation with error handling
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) - Extends US1 implementation with positioning logic

**Note**: US2 and US3 add to the same files created in US1, so sequential implementation (P1 → P2 → P3) is recommended for single developer. With multiple developers, US2 and US3 could be parallelized if careful about merge conflicts.

### Within Each User Story

- Tests (TDD) MUST be written and FAIL before implementation (Constitution Principle V)
- Unit tests before integration tests
- Implementation only after all tests written and verified to fail
- Verify tests pass after implementation (Green phase)
- Story complete before moving to next priority

### Parallel Opportunities

- **Phase 1 (Setup)**: All tasks marked [P] can run in parallel
- **Phase 2 (Foundational)**: All fixture creation tasks marked [P] can run in parallel
- **Within User Stories**: All unit tests marked [P] can be written in parallel
- **Phase 6 (Polish)**: Coverage, lint, build checks marked [P] can run in parallel
- **Between Stories**: US2 and US3 can start after US1 if multiple developers (merge carefully)

---

## Parallel Example: User Story 1

```bash
# Write all unit tests for User Story 1 in parallel:
Task T009: "Write unit test: LabelsParser extracts language codes"
Task T010: "Write unit test: LabelsParser deduplicates language codes"
Task T011: "Write unit test: LabelsParser sorts language codes alphabetically"
Task T012: "Write unit test: LabelsParser handles multiple labels files"
Task T013: "Write unit test: LanguageBlockGenerator generates correct format"
Task T014: "Write unit test: LanguageBlockGenerator formats multiple languages"
Task T015: "Write unit test: FilePositionHelper finds insertion point before imports"
Task T016: "Write unit test: FilePositionHelper finds insertion point at start"

# Then implement core modules in parallel:
Task T019: "Implement LabelsParser.extractLanguageCodes()"
Task T020: "Implement LanguageBlockGenerator.generate()"
Task T021: "Implement FilePositionHelper.findInsertionPosition()"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T004)
2. Complete Phase 2: Foundational (T005-T008) - CRITICAL
3. Complete Phase 3: User Story 1 (T009-T027)
   - Write all tests FIRST (T009-T018)
   - Verify tests FAIL
   - Implement (T019-T025)
   - Verify tests PASS
4. **STOP and VALIDATE**: Test User Story 1 independently
5. Deploy/demo if ready

**MVP Scope**: Just User Story 1 gives you a working quick fix that generates language blocks from valid labels files - the core value proposition.

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently → Deploy/Demo (now handles errors gracefully)
4. Add User Story 3 → Test independently → Deploy/Demo (now has perfect positioning)
5. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together (T001-T008)
2. Once Foundational is done:
   - Developer A: User Story 1 (T009-T027) - Core functionality
   - Developer B: User Story 2 (T028-T041) - Error handling (starts after US1 implementation files exist)
   - Developer C: User Story 3 (T042-T055) - Positioning (starts after US1 implementation files exist)
3. Stories integrate via shared files (coordinate merge conflicts)
4. Final polish together (T056-T065)

**Note**: Since all stories modify the same 4 core files, sequential implementation is safer. Parallel work requires careful coordination of file edits.

---

## TDD Workflow (Constitution Principle V)

**CRITICAL**: Follow Test-Driven Development strictly

For each user story:

1. **RED Phase**: Write all tests first (verify they FAIL)
   - Unit tests for each module
   - Integration tests for end-to-end scenarios
   - Run tests → should see FAILURES

2. **GREEN Phase**: Implement to make tests pass
   - Write minimal code to pass tests
   - Run tests → should see SUCCESS

3. **REFACTOR Phase**: Clean up implementation
   - Improve code quality (Constitution Principle I)
   - Ensure tests still pass

**Example for User Story 1**:
- Tasks T009-T018: Write tests, verify they fail
- Tasks T019-T025: Implement code to make tests pass
- Tasks T026-T027: Verify tests pass, refactor if needed

---

## Quality Gates (Constitution Requirements)

Before completing each user story, verify:

1. ✅ **Build**: `pnpm run build` passes (TypeScript compiles successfully)
2. ✅ **Lint**: `pnpm run check` passes (0 errors, 0 warnings)
3. ✅ **Tests**: Use vitest-mcp tools (Constitution Principle XXIII):
   - `mcp__vitest__set_project_root` to configure project
   - `mcp__vitest__run_tests` with appropriate target
   - Verify all tests pass (no failures in result)
4. ✅ **Coverage**: >80% coverage (Constitution Principle II)
5. ✅ **Documentation**: Update quickstart.md if behavior changes

---

## Notes

- [P] tasks = different files, no dependencies, can run in parallel
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- TDD is MANDATORY per Constitution Principle V (not optional)
- Use test helpers from `test-helpers.ts` (Constitution Principle XXIV)
- Consult `specs/TESTING_GUIDE.md` before writing tests (Constitution Principle XXV)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- File paths are exact - copy into implementation tasks

---

## Task Count Summary

- **Phase 1 (Setup)**: 4 tasks
- **Phase 2 (Foundational)**: 4 tasks
- **Phase 3 (US1)**: 19 tasks (10 tests + 9 implementation)
- **Phase 4 (US2)**: 14 tasks (8 tests + 6 implementation)
- **Phase 5 (US3)**: 14 tasks (8 tests + 6 implementation)
- **Phase 6 (Polish)**: 10 tasks
- **Total**: 65 tasks

**Parallel Opportunities**: 35 tasks marked [P] (53% can run in parallel)

**MVP Scope**: Phase 1 + Phase 2 + Phase 3 (User Story 1) = 27 tasks

**Independent Tests**:
- US1: Create file with labels import → trigger quick fix → verify language block generated
- US2: Import non-existent file → trigger quick fix → verify template generated
- US3: File with comments → trigger quick fix → verify block positioned after comments
