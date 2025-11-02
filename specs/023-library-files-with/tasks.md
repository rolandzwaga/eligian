# Tasks: Library Files with Action Imports

**Input**: Design documents from `/specs/023-library-files-with/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: All tasks follow test-first development (RED-GREEN-REFACTOR). Tests MUST be written and FAIL before implementation.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions
- Monorepo structure: `packages/language/src/`, `packages/compiler/src/`
- Tests: `packages/language/src/__tests__/`, `packages/compiler/src/__tests__/`
- Examples: `examples/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and test infrastructure setup

- [x] T001 [P] Create example library files in `examples/libraries/animations.eligian` with sample actions (fadeIn, fadeOut, slideIn)
- [x] T002 [P] Create example library files in `examples/libraries/utils.eligian` with sample actions (safeSelect, safeAddClass)
- [x] T003 [P] Create example program file in `examples/with-imports.eligian` that imports from library files
- [x] T004 Setup test helper utilities in `packages/language/src/__tests__/test-helpers.ts` for library file testing (if not already present)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core grammar infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T005 Extend Langium grammar in `packages/language/src/eligian.langium` with entry rule `entry EligianFile: Program | Library;`
- [x] T006 [P] Add Library grammar rule in `packages/language/src/eligian.langium`: `Library: 'library' name=ID (actions+=ActionDeclaration)*;`
- [x] T007 [P] Add LibraryImport grammar rule in `packages/language/src/eligian.langium`: `LibraryImport: 'import' '{' actions+=ActionImport (',' actions+=ActionImport)* '}' 'from' path=STRING;`
- [x] T008 [P] Add ActionImport grammar rule in `packages/language/src/eligian.langium`: `ActionImport: action=[ActionDefinition:ID] ('as' alias=ID)?;`
- [x] T009 [P] Add visibility modifier to ActionDeclaration in `packages/language/src/eligian.langium`: `(visibility='private')?`
- [x] T010 [P] Updated ImportStatement to include LibraryImport union variant (already had imports support from Feature 009)
- [x] T011 Regenerate Langium parser by running `pnpm run langium:generate` from `packages/language/`
- [x] T012 Run `pnpm run check && pnpm run typecheck` to verify grammar changes compile

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Create Reusable Action Library (Priority: P1) 🎯 MVP

**Goal**: Enable developers to create library files with reusable actions that are recognized and validated correctly

**Independent Test**: Create a `.eligian` file with `library` keyword and multiple action definitions, verify it's recognized as a library by the language server, and validate constraint violations (no timelines, no imports, no styles)

### Tests for User Story 1

**NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T013 [P] [US1] Write parsing test in `packages/language/src/__tests__/library-parsing.spec.ts`: Test library with single action
- [x] T014 [P] [US1] Write parsing test in `packages/language/src/__tests__/library-parsing.spec.ts`: Test library with multiple actions
- [x] T015 [P] [US1] Write parsing test in `packages/language/src/__tests__/library-parsing.spec.ts`: Test library name extraction
- [x] T016 [P] [US1] Write validation test in `packages/language/src/__tests__/library-validation.spec.ts`: Test error when library contains timeline (MUST FAIL initially)
- [x] T017 [P] [US1] Write validation test in `packages/language/src/__tests__/library-validation.spec.ts`: Test error when library contains styles import (MUST FAIL initially)
- [x] T018 [P] [US1] Write validation test in `packages/language/src/__tests__/library-validation.spec.ts`: Test error when library contains constants (MUST FAIL initially)
- [x] T019 [P] [US1] Write validation test in `packages/language/src/__tests__/library-validation.spec.ts`: Test error when library has duplicate action names (MUST FAIL initially)
- [x] T020 [P] [US1] Write validation test in `packages/language/src/__tests__/library-validation.spec.ts`: Test valid library with 5 actions passes (MUST FAIL initially)

### Implementation for User Story 1

- [x] T021 [US1] Implement `checkLibraryContent` validator in `packages/language/src/eligian-validator.ts`: Validate library cannot contain timelines (error code `library_invalid_content`)
- [x] T022 [US1] Implement `checkLibraryContent` validator in `packages/language/src/eligian-validator.ts`: Validate library cannot contain styles imports (error code `library_invalid_content`)
- [x] T023 [US1] Implement `checkLibraryContent` validator in `packages/language/src/eligian-validator.ts`: Validate library cannot contain constants (error code `library_invalid_content`)
- [x] T024 [US1] Implement `checkLibraryContent` validator in `packages/language/src/eligian-validator.ts`: Validate library cannot contain imports (error code `library_invalid_content`)
- [x] T025 [US1] Implement `checkLibraryDuplicateActions` validator in `packages/language/src/eligian-validator.ts`: Validate unique action names within library (error code `library_duplicate_action`)
- [x] T026 [US1] Register new validators in `packages/language/src/eligian-validator.ts` class (if not auto-discovered)
- [x] T027 [US1] Run `pnpm run check && pnpm run typecheck` and fix any issues
- [x] T028 [US1] Verify all US1 tests pass: `pnpm --filter @eligian/language test library-parsing library-validation`

**Checkpoint**: At this point, User Story 1 should be fully functional - developers can create library files and get validation errors for invalid content

---

## Phase 4: User Story 2 - Import Actions from Library (Priority: P1) 🎯 MVP

**Goal**: Enable developers to import actions from library files and use them in timelines with identical behavior to local actions

**Independent Test**: Create a library file with actions, create a program that imports them, use imported actions in timeline, verify they work identically to local actions and compile correctly

### Tests for User Story 2

**NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T029 [P] [US2] Write parsing test in `packages/language/src/__tests__/import-parsing.spec.ts`: Test single action import syntax
- [x] T030 [P] [US2] Write parsing test in `packages/language/src/__tests__/import-parsing.spec.ts`: Test multiple action imports from same library
- [x] T031 [P] [US2] Write parsing test in `packages/language/src/__tests__/import-parsing.spec.ts`: Test import with alias syntax
- [x] T032 [P] [US2] Write parsing test in `packages/language/src/__tests__/import-parsing.spec.ts`: Test import path extraction
- [x] T033 [P] [US2] Write validation test in `packages/language/src/__tests__/import-validation.spec.ts`: Test error when library file not found (MUST FAIL initially)
- [x] T034 [P] [US2] Write validation test in `packages/language/src/__tests__/import-validation.spec.ts`: Test error when imported action doesn't exist (MUST FAIL initially)
- [x] T035 [P] [US2] Write validation test in `packages/language/src/__tests__/import-validation.spec.ts`: Test error when import conflicts with local action (MUST FAIL initially)
- [x] T036 [P] [US2] Write validation test in `packages/language/src/__tests__/import-validation.spec.ts`: Test error when duplicate imports from multiple libraries (MUST FAIL initially)
- [x] T037 [P] [US2] Write validation test in `packages/language/src/__tests__/import-validation.spec.ts`: Test alias resolves name conflicts (MUST FAIL initially)
- [ ] T038 [P] [US2] Write compilation test in `packages/compiler/src/__tests__/library-compilation.spec.ts`: Test imported action compiles identically to local action (MUST FAIL initially)
- [ ] T039 [P] [US2] Write compilation test in `packages/compiler/src/__tests__/library-merging.spec.ts`: Test imported actions are merged into program AST (MUST FAIL initially)
- [ ] T040 [P] [US2] Write compilation test in `packages/compiler/src/__tests__/library-merging.spec.ts`: Test aliased actions use alias name in compilation (MUST FAIL initially)

### Implementation for User Story 2

- [x] T041 [P] [US2] Implement `checkImportFileExists` validator in `packages/language/src/eligian-validator.ts`: Validate library file exists using Langium document loader (error code `import_file_not_found`)
- [x] T042 [P] [US2] Implement `checkImportedActionsExist` validator in `packages/language/src/eligian-validator.ts`: Validate imported actions exist in library (error code `import_action_not_found`)
- [x] T042a [P] [US2] Implement fuzzy name matching for error suggestions in `packages/language/src/eligian-validator.ts`: Use Levenshtein distance (similar to CSS validation) to suggest similar action names when import fails (addresses FR-021)
- [x] T043 [US2] Implement `checkImportNameCollisions` validator in `packages/language/src/eligian-validator.ts`: Validate imports don't conflict with local actions or other imports (error code `import_name_collision`)
- [ ] T044 [US2] Implement import resolution in `packages/compiler/src/ast-transformer.ts`: Add `resolveImports()` function to load and collect imported actions
- [ ] T045 [US2] Implement action merging in `packages/compiler/src/ast-transformer.ts`: Merge imported actions into program's action array with alias handling
- [ ] T046 [US2] Update `transformProgram()` in `packages/compiler/src/ast-transformer.ts` to call `resolveImports()` before building action registry
- [ ] T047 [US2] Run `pnpm run check && pnpm run typecheck` and fix any issues
- [ ] T048 [US2] Verify all US2 tests pass: `pnpm --filter @eligian/language test import-parsing import-validation && pnpm --filter @eligian/compiler test library`

**Checkpoint**: At this point, User Stories 1 AND 2 should both work - MVP is complete (create libraries + import actions)

---

## Phase 5: User Story 3 - Private Action Encapsulation (Priority: P2)

**Goal**: Enable library authors to mark actions as `private` to hide implementation details and prevent external imports

**Independent Test**: Create a library with public and private actions, attempt to import private action from another file, verify validation blocks it, verify private actions can call each other within same library

### Tests for User Story 3

**NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T049 [P] [US3] Write validation test in `packages/language/src/__tests__/private-actions.spec.ts`: Test error when importing private action (MUST FAIL initially)
- [ ] T050 [P] [US3] Write validation test in `packages/language/src/__tests__/private-actions.spec.ts`: Test error when using `private` in program file (MUST FAIL initially)
- [ ] T051 [P] [US3] Write validation test in `packages/language/src/__tests__/private-actions.spec.ts`: Test private actions accessible within same library (MUST FAIL initially)
- [ ] T052 [P] [US3] Write scoping test in `packages/language/src/__tests__/library-scoping.spec.ts`: Test scope provider filters private actions from exports (MUST FAIL initially)
- [ ] T053 [P] [US3] Write scoping test in `packages/language/src/__tests__/library-scoping.spec.ts`: Test scope provider includes public actions in exports (MUST FAIL initially)

### Implementation for User Story 3

- [ ] T054 [US3] Implement custom scope provider in `packages/language/src/eligian-scope.ts`: Override `getScope()` to filter private actions when resolving imports
- [ ] T055 [US3] Implement `checkImportedActionsPublic` validator in `packages/language/src/eligian-validator.ts`: Validate imported actions are not private (error code `import_private_action`)
- [ ] T056 [US3] Implement `checkPrivateOnlyInLibraries` validator in `packages/language/src/eligian-validator.ts`: Validate `private` keyword only used in library files (error code `private_only_in_libraries`)
- [ ] T057 [US3] Register custom scope provider in `packages/language/src/eligian-module.ts` (replace default scope provider if needed)
- [ ] T058 [US3] Run `pnpm run check && pnpm run typecheck` and fix any issues
- [ ] T059 [US3] Verify all US3 tests pass: `pnpm --filter @eligian/language test private-actions library-scoping`

**Checkpoint**: At this point, User Stories 1, 2, AND 3 should work - private action encapsulation is functional

---

## Phase 6: User Story 4 - IDE Support for Imported Actions (Priority: P2)

**Goal**: Enable IDE features (auto-completion, hover docs, go-to-definition) for imported actions

**Independent Test**: Import an action with JSDoc documentation, verify hover shows docs, verify auto-completion suggests the action, verify go-to-definition jumps to library file

### Tests for User Story 4

**NOTE: Write these tests FIRST, ensure they FAIL before implementation**

**IMPORTANT**: Per Constitution Principle II, integration tests (T063-T064) MUST be isolated in separate files to prevent test environment pollution. Unit tests (T060-T062) CAN share files.

- [ ] T060 [P] [US4] Write completion test in `packages/language/src/__tests__/library-completion.spec.ts`: Test auto-completion suggests public actions from library (MUST FAIL initially)
- [ ] T061 [P] [US4] Write completion test in `packages/language/src/__tests__/library-completion.spec.ts`: Test auto-completion excludes private actions (MUST FAIL initially)
- [ ] T062 [P] [US4] Write completion test in `packages/language/src/__tests__/library-completion.spec.ts`: Test auto-completion shows action documentation (MUST FAIL initially)
- [ ] T063 [P] [US4] Write hover test in `packages/language/src/__tests__/library-hover.spec.ts` (SEPARATE FILE): Test hover on imported action shows JSDoc (MUST FAIL initially)
- [ ] T064 [P] [US4] Write definition test in `packages/language/src/__tests__/library-definition.spec.ts` (SEPARATE FILE): Test go-to-definition navigates to library file (MUST FAIL initially)

### Implementation for User Story 4

- [ ] T065 [US4] Extend `eligian-completion-provider.ts` in `packages/language/src/`: Add completion logic for import statements (suggest public actions from target library)
- [ ] T066 [US4] Update hover provider in `packages/language/src/eligian-hover-provider.ts` if needed (Langium cross-references should work automatically)
- [ ] T067 [US4] Verify definition provider works automatically via Langium cross-reference resolution (test manually if no test exists)
- [ ] T068 [US4] Run `pnpm run check && pnpm run typecheck` and fix any issues
- [ ] T069 [US4] Verify all US4 tests pass: `pnpm --filter @eligian/language test library-completion library-hover`

**Checkpoint**: At this point, all P2 user stories (US3, US4) should work - IDE integration is complete

---

## Phase 7: User Story 5 - Library Name Collision Prevention (Priority: P3)

**Goal**: Prevent actions from having names that conflict with built-in operations

**Independent Test**: Attempt to create a library action named after a built-in operation (e.g., `selectElement`), verify validation blocks it with clear error message

### Tests for User Story 5

**NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T070 [P] [US5] Write validation test in `packages/language/src/__tests__/library-validation.spec.ts`: Test error when library action name conflicts with built-in operation (MUST FAIL initially)
- [ ] T071 [P] [US5] Write validation test in `packages/language/src/__tests__/library-validation.spec.ts`: Test no error when library action has unique name (MUST FAIL initially)
- [ ] T072 [P] [US5] Write validation test in `packages/language/src/__tests__/import-validation.spec.ts`: Test error when import conflicts with built-in operation via alias (MUST FAIL initially)

### Implementation for User Story 5

- [ ] T073 [US5] Implement `checkActionNameCollisionWithBuiltins` validator in `packages/language/src/eligian-validator.ts`: Check action names against operation registry (error code `action_name_builtin_conflict`)
- [ ] T074 [US5] Run `pnpm run check && pnpm run typecheck` and fix any issues
- [ ] T075 [US5] Verify all US5 tests pass: `pnpm --filter @eligian/language test library-validation import-validation`

**Checkpoint**: All user stories (P1, P2, P3) should now be independently functional

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, language spec updates, and final quality assurance

- [ ] T076 [P] Update `LANGUAGE_SPEC.md` with library file syntax: `library` keyword, action definitions only
- [ ] T077 [P] Update `LANGUAGE_SPEC.md` with import statement syntax: `import { action1, action2 } from "./lib.eligian"`
- [ ] T078 [P] Update `LANGUAGE_SPEC.md` with private visibility modifier documentation
- [ ] T079 [P] Update `LANGUAGE_SPEC.md` with import aliasing syntax: `import { action as alias } from "./lib.eligian"`
- [ ] T080 [P] Add library file examples to `LANGUAGE_SPEC.md` (animations library, utils library)
- [ ] T081 [P] Add import usage examples to `LANGUAGE_SPEC.md` (single import, multiple imports, aliased imports)
- [ ] T082 Update `examples/libraries/animations.eligian` with complete, documented examples matching quickstart.md
- [ ] T083 Update `examples/libraries/utils.eligian` with private action examples matching quickstart.md
- [ ] T084 Update `examples/with-imports.eligian` with comprehensive usage examples matching quickstart.md
- [ ] T085 Run full test suite: `pnpm --filter @eligian/language test && pnpm --filter @eligian/compiler test`
- [ ] T086 Run coverage check: `pnpm --filter @eligian/language test:coverage` - verify ≥80% coverage for business logic (if below threshold, follow Constitution Principle II Coverage Verification exception process: document files/functions, provide justification, get user approval)
- [ ] T087 Run code quality checks: `pnpm run check && pnpm run typecheck` - verify no errors
- [ ] T088 Manual validation: Test library creation + import + compilation workflow end-to-end in VS Code
- [ ] T089 Manual validation: Verify IDE features work (completion, hover, go-to-definition) in VS Code
- [ ] T090 [P] Code cleanup: Remove any debug logging, temporary comments, or TODOs
- [ ] T091 [P] Code review preparation: Self-review all changes for constitution compliance

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-7)**: All depend on Foundational phase completion
  - US1 (P1) can start after Phase 2 - No dependencies on other stories
  - US2 (P1) can start after Phase 2 - No dependencies on other stories (but typically sequenced after US1)
  - US3 (P2) can start after Phase 2 - No dependencies on other stories
  - US4 (P2) can start after Phase 2 - No dependencies on other stories
  - US5 (P3) can start after Phase 2 - No dependencies on other stories
- **Polish (Phase 8)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - Independently testable
- **User Story 2 (P1)**: Can start after Foundational (Phase 2) - Independently testable (imports build on US1 grammar)
- **User Story 3 (P2)**: Can start after Foundational (Phase 2) - Independently testable
- **User Story 4 (P2)**: Can start after Foundational (Phase 2) - Independently testable
- **User Story 5 (P3)**: Can start after Foundational (Phase 2) - Independently testable

### Within Each User Story

- Tests (RED-GREEN-REFACTOR) MUST be written and FAIL before implementation
- Validators before scope provider (scope provider uses validation context)
- Validation before compilation (compilation assumes valid input)
- Tests must pass before moving to next user story

### Parallel Opportunities

- **Phase 1 (Setup)**: All tasks (T001-T004) can run in parallel
- **Phase 2 (Foundational)**: Tasks T006-T010 (grammar rules) can run in parallel after T005 (entry rule)
- **Phase 3 (US1 Tests)**: All test tasks (T013-T020) can run in parallel
- **Phase 4 (US2 Tests)**: All test tasks (T029-T040) can run in parallel
- **Phase 5 (US3 Tests)**: All test tasks (T049-T053) can run in parallel
- **Phase 6 (US4 Tests)**: All test tasks (T060-T064) can run in parallel
- **Phase 7 (US5 Tests)**: All test tasks (T070-T072) can run in parallel
- **Phase 8 (Polish)**: Documentation tasks (T076-T081) can run in parallel, example updates (T082-T084) can run in parallel
- **User Stories**: After Phase 2 completes, all user stories (Phase 3-7) can be worked on in parallel by different team members

---

## Parallel Example: User Story 1 (Library Creation)

```bash
# Launch all tests for User Story 1 together (RED phase):
Task: "Write parsing test: library with single action"
Task: "Write parsing test: library with multiple actions"
Task: "Write parsing test: library name extraction"
Task: "Write validation test: error when library contains timeline"
Task: "Write validation test: error when library contains styles"
Task: "Write validation test: error when library contains constants"
Task: "Write validation test: error when duplicate action names"
Task: "Write validation test: valid library passes"

# After tests written and failing, implement validators sequentially (GREEN phase):
Task: "Implement checkLibraryContent validator: no timelines"
Task: "Implement checkLibraryContent validator: no styles"
Task: "Implement checkLibraryContent validator: no constants"
Task: "Implement checkLibraryContent validator: no imports"
Task: "Implement checkLibraryDuplicateActions validator"
```

---

## Parallel Example: User Story 2 (Import Actions)

```bash
# Launch all parsing tests for US2 together:
Task: "Write parsing test: single action import syntax"
Task: "Write parsing test: multiple action imports"
Task: "Write parsing test: import with alias"
Task: "Write parsing test: import path extraction"

# Launch all validation tests for US2 together:
Task: "Write validation test: library file not found"
Task: "Write validation test: imported action doesn't exist"
Task: "Write validation test: import conflicts with local action"
Task: "Write validation test: duplicate imports from multiple libraries"
Task: "Write validation test: alias resolves conflicts"

# Launch all compilation tests for US2 together:
Task: "Write compilation test: imported action compiles identically"
Task: "Write compilation test: imported actions merged into AST"
Task: "Write compilation test: aliased actions use alias name"

# Implementation can parallelize validation and compilation:
Developer A: "Implement import validators (T041-T043)"
Developer B: "Implement import resolution and merging (T044-T046)"
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 Only)

1. Complete Phase 1: Setup (examples and test infrastructure)
2. Complete Phase 2: Foundational (grammar changes - CRITICAL blocker)
3. Complete Phase 3: User Story 1 (create libraries)
4. **CHECKPOINT**: Validate US1 independently - can create library files with correct validation
5. Complete Phase 4: User Story 2 (import actions)
6. **CHECKPOINT**: Validate US1 + US2 together - MVP is complete
7. Deploy/demo MVP functionality

### Incremental Delivery

1. Complete Setup + Foundational → Grammar ready for all stories
2. Add User Story 1 → Test independently → Commit with message: `feat(spec-023): Implement library file creation and validation`
3. Add User Story 2 → Test independently → Commit with message: `feat(spec-023): Implement action imports and compilation`
4. **CHECKPOINT**: MVP ready (create libraries + import actions)
5. Add User Story 3 → Test independently → Commit with message: `feat(spec-023): Implement private action encapsulation`
6. Add User Story 4 → Test independently → Commit with message: `feat(spec-023): Implement IDE support for imported actions`
7. Add User Story 5 → Test independently → Commit with message: `feat(spec-023): Implement name collision prevention`
8. Complete Phase 8 (Polish) → Commit with message: `docs(spec-023): Update LANGUAGE_SPEC.md and examples`
9. Each commit adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together (CRITICAL - blocks everything)
2. Once Foundational is done (grammar complete):
   - Developer A: User Story 1 (library creation)
   - Developer B: User Story 2 (import actions)
   - Developer C: User Story 3 (private actions)
   - Developer D: User Story 4 (IDE support)
   - Developer E: User Story 5 (name collision prevention)
3. Each developer works through RED-GREEN-REFACTOR cycle for their story
4. Stories integrate independently via shared grammar foundation

### Test-First Development (Constitution Principle II)

**CRITICAL**: All tasks follow RED-GREEN-REFACTOR workflow:

1. **RED**: Write failing test that describes desired behavior (BEFORE ANY IMPLEMENTATION)
2. **GREEN**: Write MINIMUM code necessary to make the test pass
3. **REFACTOR**: Improve code quality while keeping tests green
4. **NEVER**: Write implementation before test exists

**Example for US1 Task T016**:
```typescript
// RED: Write test that MUST FAIL initially
test('library with timeline shows error', () => {
  const code = `library myLib
    action test() []
    timeline "Test" at 0s {}`;
  const errors = validate(code);
  expect(errors).toContainEqual(expect.objectContaining({
    code: 'library_invalid_content',
    message: expect.stringContaining('Library files cannot contain timelines')
  }));
  // This test WILL FAIL initially - that's expected and required!
});

// Run test: pnpm test -- should see RED (failure)

// GREEN: Implement validator to make test pass
checkLibraryContent(library: Library, accept: ValidationAcceptor): void {
  if (library.timelines?.length > 0) {
    accept('error', 'Library files cannot contain timelines', {
      node: library,
      code: 'library_invalid_content'
    });
  }
}

// Run test: pnpm test -- should see GREEN (pass)

// REFACTOR: Clean up implementation while tests stay green
```

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- **Test-First Development is NON-NEGOTIABLE** (Constitution Principle II)
- Verify tests FAIL before implementing (RED phase)
- Commit after each user story phase completes (Constitution Principle XXIII)
- Do NOT push to remote until feature is complete
- Stop at any checkpoint to validate story independently
- Run `pnpm run check && pnpm run typecheck` after each implementation task
- Achieve 80% test coverage or get user approval for exceptions (Constitution Principle II)
