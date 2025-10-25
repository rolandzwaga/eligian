# Tasks: Asset Import Syntax

**Input**: Design documents from `/specs/009-asset-import-syntax/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Feature Branch**: `009-asset-import-syntax`

**Tests**: This feature follows TDD principles from the project constitution (Principle II). All test tasks are written BEFORE implementation and must FAIL initially.

**Organization**: Tasks are grouped by user story (US1-US5) to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4, US5)
- Include exact file paths in descriptions

## Path Conventions
- **Monorepo structure**: `packages/language/src/`, `packages/language/src/__tests__/`
- Only `packages/language` is affected by this feature
- Grammar changes in `eligian.langium` automatically update `generated/ast.ts`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prepare workspace and create shared utilities needed by all user stories

- [X] T001 Create feature branch `009-asset-import-syntax` from main
- [X] T002 [P] Create utility module `packages/language/src/utils/asset-type-inference.ts` with `inferAssetType()` function (pure function, see data-model.md)
- [X] T003 [P] Create error types module `packages/language/src/validators/validation-errors.ts` with `PathError`, `ImportNameError`, `TypeInferenceError`, `DuplicateDefaultImportError` interfaces
- [X] T004 [P] Create constants module `packages/language/src/validators/validation-constants.ts` with `RESERVED_KEYWORDS`, `EXTENSION_MAP`, `AMBIGUOUS_EXTENSIONS` sets

**Checkpoint**: Shared utilities ready - grammar and validator work can begin

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core grammar rules that MUST be complete before ANY user story can be validated

**⚠️ CRITICAL**: No validator work can begin until this phase is complete

- [X] T005 Update grammar entry rule in `packages/language/src/eligian.langium` to add `(imports+=ImportStatement)*` before existing rules
- [X] T006 Add `ImportStatement` grammar rule in `packages/language/src/eligian.langium` (union of DefaultImport | NamedImport)
- [X] T007 Add `AssetType` grammar rule in `packages/language/src/eligian.langium` (alternatives: 'html' | 'css' | 'media')
- [X] T008 Run `npm run langium:generate` to regenerate AST types in `packages/language/src/generated/ast.ts`
- [X] T009 Create type guards `isDefaultImport()` and `isNamedImport()` in `packages/language/src/utils/ast-helpers.ts`

**Checkpoint**: Foundation ready - user story validation can now begin in parallel

---

## Phase 3: User Story 5 - Path Validation (Priority: P1) 🎯 MVP Component

**Goal**: Enforce relative paths for portability, reject absolute paths

**Independent Test**: Import with `./relative` path should parse and validate, import with `/absolute` path should fail validation

**Why First**: Path validation is critical infrastructure needed by all other stories. Without it, imports could have absolute paths that break portability.

### Tests for User Story 5 (TDD - Write First) ⚠️

**NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T010 [P] [US5] Parsing test: Parse default import with relative path in `packages/language/src/__tests__/parsing.spec.ts`
- [X] T011 [P] [US5] Parsing test: Parse named import with relative path in `packages/language/src/__tests__/parsing.spec.ts`
- [X] T012 [P] [US5] Validation test: Reject Unix absolute path (`/file`) in `packages/language/src/__tests__/validation.spec.ts`
- [X] T013 [P] [US5] Validation test: Reject Windows absolute path (`C:\file`) in `packages/language/src/__tests__/validation.spec.ts`
- [X] T014 [P] [US5] Validation test: Reject URL paths (`https://file`) in `packages/language/src/__tests__/validation.spec.ts`
- [X] T015 [P] [US5] Unit test: `validateImportPath()` with all path formats in `packages/language/src/validators/__tests__/import-path-validator.spec.ts`

### Implementation for User Story 5

- [X] T016 [US5] Create `validateImportPath()` pure function in `packages/language/src/validators/import-path-validator.ts` (returns `PathError | undefined`)
- [X] T017 [US5] Add `checkImportPath()` Langium validator method to `packages/language/src/eligian-validator.ts` (thin adapter calling `validateImportPath()`)
- [X] T018 [US5] Register `checkImportPath()` validator for both `DefaultImport` and `NamedImport` nodes in `packages/language/src/eligian-validator.ts`
- [X] T019 [US5] Run `npm run test` to verify all US5 tests pass

**Checkpoint**: Path validation complete - all imports now enforce relative paths

---

## Phase 4: User Story 1 - Default Layout Import (Priority: P1) 🎯 MVP Component

**Goal**: Support `layout './layout.html'` syntax for main HTML template

**Independent Test**: Write `layout './layout.html'` in Eligian file, verify it parses without errors and rejects duplicate layout imports

**Why Second**: Most fundamental import type - every timeline needs a layout. Builds on path validation (US5).

### Tests for User Story 1 (TDD - Write First) ⚠️

- [X] T020 [P] [US1] Parsing test: Parse `layout` default import in `packages/language/src/__tests__/parsing.spec.ts`
- [X] T021 [P] [US1] Parsing test: Parse complete document with layout import + action in `packages/language/src/__tests__/parsing.spec.ts`
- [X] T022 [P] [US1] Validation test: Reject duplicate `layout` imports in `packages/language/src/__tests__/validation.spec.ts`
- [X] T023 [P] [US1] Unit test: `validateDefaultImports()` with layout duplicates in `packages/language/src/validators/__tests__/default-import-validator.spec.ts`

### Implementation for User Story 1

- [X] T024 [US1] Add `DefaultImport` grammar rule in `packages/language/src/eligian.langium` for `layout` keyword (see contracts/grammar-contract.langium)
- [X] T025 [US1] Run `npm run langium:generate` to update AST types
- [X] T026 [US1] Create `validateDefaultImports()` pure function in `packages/language/src/validators/default-import-validator.ts` (checks for duplicate layout imports)
- [X] T027 [US1] Add `checkDefaultImports()` Langium validator method to `packages/language/src/eligian-validator.ts` (thin adapter)
- [X] T028 [US1] Run `npm run test` to verify all US1 tests pass
- [X] T029 [US1] Run `npm run check` (Biome linting/formatting)

**Checkpoint**: Layout imports working - developers can specify main HTML template

---

## Phase 5: User Story 3 - CSS and Media Imports (Priority: P2)

**Goal**: Support `styles './main.css'` and `provider './video.mp4'` syntax

**Independent Test**: Write `styles './main.css'` and `provider './video.mp4'`, verify both parse without errors

**Why Third**: Completes the default import syntax for all three types. Builds on US1 infrastructure.

### Tests for User Story 3 (TDD - Write First) ⚠️

- [ ] T030 [P] [US3] Parsing test: Parse `styles` default import in `packages/language/src/__tests__/parsing.spec.ts`
- [ ] T031 [P] [US3] Parsing test: Parse `provider` default import in `packages/language/src/__tests__/parsing.spec.ts`
- [ ] T032 [P] [US3] Parsing test: Parse all three default imports together in `packages/language/src/__tests__/parsing.spec.ts`
- [ ] T033 [P] [US3] Validation test: Reject duplicate `styles` imports in `packages/language/src/__tests__/validation.spec.ts`
- [ ] T034 [P] [US3] Validation test: Reject duplicate `provider` imports in `packages/language/src/__tests__/validation.spec.ts`

### Implementation for User Story 3

- [ ] T035 [US3] Extend `DefaultImport` grammar rule in `packages/language/src/eligian.langium` to include `styles` and `provider` keywords
- [ ] T036 [US3] Run `npm run langium:generate` to update AST types
- [ ] T037 [US3] Update `validateDefaultImports()` in `packages/language/src/validators/default-import-validator.ts` to check styles and provider duplicates
- [ ] T038 [US3] Run `npm run test` to verify all US3 tests pass
- [ ] T039 [US3] Run `npm run check` (Biome)

**Checkpoint**: All default import types working - layout, styles, provider

---

## Phase 6: User Story 2 - Named HTML Imports (Priority: P2)

**Goal**: Support `import tooltip from './tooltip.html'` for reusable HTML snippets

**Independent Test**: Write `import tooltip from './tooltip.html'`, verify it parses and tooltip is recognized as valid identifier

**Why Fourth**: Named imports are more complex than default imports, but HTML is the most common use case.

### Tests for User Story 2 (TDD - Write First) ⚠️

- [ ] T040 [P] [US2] Parsing test: Parse single named import in `packages/language/src/__tests__/parsing.spec.ts`
- [ ] T041 [P] [US2] Parsing test: Parse multiple named imports in `packages/language/src/__tests__/parsing.spec.ts`
- [ ] T042 [P] [US2] Parsing test: Parse mixed default + named imports in `packages/language/src/__tests__/parsing.spec.ts`
- [ ] T043 [P] [US2] Validation test: Reject duplicate import names in `packages/language/src/__tests__/validation.spec.ts`
- [ ] T044 [P] [US2] Validation test: Reject reserved keyword as import name (`import if from './file'`) in `packages/language/src/__tests__/validation.spec.ts`
- [ ] T045 [P] [US2] Validation test: Reject operation name conflict (`import selectElement from './file'`) in `packages/language/src/__tests__/validation.spec.ts`
- [ ] T046 [P] [US2] Unit test: `validateImportName()` with all error cases in `packages/language/src/validators/__tests__/import-name-validator.spec.ts`

### Implementation for User Story 2

- [ ] T047 [US2] Add `NamedImport` grammar rule in `packages/language/src/eligian.langium` (without `as` clause for now - see contracts/grammar-contract.langium)
- [ ] T048 [US2] Run `npm run langium:generate` to update AST types
- [ ] T049 [US2] Create `validateImportName()` pure function in `packages/language/src/validators/import-name-validator.ts` (checks uniqueness, keywords, operations)
- [ ] T050 [US2] Add `checkImportNames()` Langium validator method to `packages/language/src/eligian-validator.ts` (thin adapter)
- [ ] T051 [US2] Update `packages/language/src/validators/validation-constants.ts` to include operation names from operation registry
- [ ] T052 [US2] Run `npm run test` to verify all US2 tests pass
- [ ] T053 [US2] Run `npm run check` (Biome)

**Checkpoint**: Named HTML imports working - developers can import reusable snippets

---

## Phase 7: User Story 4 - Type Inference and Override (Priority: P3)

**Goal**: Auto-detect asset type from extension, allow explicit `as type` override

**Independent Test**: Import `.html`/`.css`/`.mp4` files and verify type inference works, import `.xyz` file and verify error, add `as html` and verify it works

**Why Fifth**: Type inference is a nice-to-have for better UX. Most developers use standard extensions.

### Tests for User Story 4 (TDD - Write First) ⚠️

- [ ] T054 [P] [US4] Unit test: `inferAssetType()` with all extensions in `packages/language/src/utils/__tests__/asset-type-inference.spec.ts`
- [ ] T055 [P] [US4] Unit test: `inferAssetType()` case-insensitive (`.HTML` → `html`) in `packages/language/src/utils/__tests__/asset-type-inference.spec.ts`
- [ ] T056 [P] [US4] Unit test: `inferAssetType()` multiple extensions (`.min.html` → `html`) in `packages/language/src/utils/__tests__/asset-type-inference.spec.ts`
- [ ] T057 [P] [US4] Parsing test: Parse named import with explicit `as html` in `packages/language/src/__tests__/parsing.spec.ts`
- [ ] T058 [P] [US4] Parsing test: Parse named import with `as css` in `packages/language/src/__tests__/parsing.spec.ts`
- [ ] T059 [P] [US4] Parsing test: Parse named import with `as media` in `packages/language/src/__tests__/parsing.spec.ts`
- [ ] T060 [P] [US4] Validation test: Reject unknown extension without explicit type in `packages/language/src/__tests__/validation.spec.ts`
- [ ] T061 [P] [US4] Validation test: Reject ambiguous `.ogg` extension without explicit type in `packages/language/src/__tests__/validation.spec.ts`
- [ ] T062 [P] [US4] Validation test: Accept unknown extension with explicit `as` type in `packages/language/src/__tests__/validation.spec.ts`
- [ ] T063 [P] [US4] Unit test: `validateAssetType()` with all scenarios in `packages/language/src/validators/__tests__/asset-type-validator.spec.ts`

### Implementation for User Story 4

- [ ] T064 [US4] Implement `inferAssetType()` function in `packages/language/src/utils/asset-type-inference.ts` (already created in T002)
- [ ] T065 [US4] Extend `NamedImport` grammar rule in `packages/language/src/eligian.langium` to add optional `('as' assetType=AssetType)?` clause
- [ ] T066 [US4] Run `npm run langium:generate` to update AST types
- [ ] T067 [US4] Create `validateAssetType()` pure function in `packages/language/src/validators/asset-type-validator.ts` (uses `inferAssetType()`)
- [ ] T068 [US4] Add `checkAssetTypes()` Langium validator method to `packages/language/src/eligian-validator.ts` (thin adapter)
- [ ] T069 [US4] Run `npm run test` to verify all US4 tests pass
- [ ] T070 [US4] Run `npm run check` (Biome)

**Checkpoint**: Type inference complete - all asset import features implemented

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, documentation, and cleanup

- [ ] T071 [P] Verify all examples in `specs/009-asset-import-syntax/quickstart.md` parse correctly
- [ ] T072 [P] Add comprehensive example file `examples/asset-imports-demo.eligian` demonstrating all import types
- [ ] T073 [P] Update main `README.md` with import syntax section (if needed)
- [ ] T074 Run full test suite: `npm run test` (all 379+ tests should pass)
- [ ] T075 Run Biome check: `npm run check` (should report 0 errors, 0 warnings)
- [ ] T076 Run build: `npm run build` (should complete without errors)
- [ ] T077 Test VS Code extension: Open `.eligian` file with imports, verify syntax highlighting and validation
- [ ] T078 [P] Code review: Verify all validators are pure functions (Constitution Principle X)
- [ ] T079 [P] Code review: Verify comprehensive tests (Constitution Principle II)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Story 5 (Phase 3)**: Depends on Foundational - Path validation is prerequisite for all imports
- **User Story 1 (Phase 4)**: Depends on US5 (path validation)
- **User Story 3 (Phase 5)**: Depends on US1 (extends default import infrastructure)
- **User Story 2 (Phase 6)**: Depends on US5 (path validation) - Can be done in parallel with US1/US3 if staffed
- **User Story 4 (Phase 7)**: Depends on US2 (extends named import infrastructure)
- **Polish (Phase 8)**: Depends on all user stories being complete

### User Story Dependencies

- **US5 (Path Validation)**: Foundation for all imports - NO dependencies on other stories
- **US1 (Layout)**: Depends on US5 - INDEPENDENT of US2, US3, US4
- **US3 (Styles/Provider)**: Depends on US1 (shares default import validator) - INDEPENDENT of US2, US4
- **US2 (Named HTML)**: Depends on US5 - INDEPENDENT of US1, US3, US4
- **US4 (Type Inference)**: Depends on US2 (extends named imports) - INDEPENDENT of US1, US3

### Within Each User Story

- Tests MUST be written and FAIL before implementation (TDD)
- Grammar changes before validator implementation
- `npm run langium:generate` after each grammar change
- Pure validator functions before Langium adapters
- Unit tests before integration tests
- Story complete (all tests passing) before moving to next priority

### Parallel Opportunities

**Setup Phase (Phase 1)**: All tasks marked [P] can run in parallel (T002, T003, T004)

**Foundational Phase (Phase 2)**: T005-T007 must be sequential (grammar rules), T009 can be parallel after T008

**After Foundational Complete**:
- US5 can start immediately (path validation)
- After US5 completes:
  - US1 (layout) and US2 (named imports) can run in parallel
  - US3 (styles/provider) must wait for US1
  - US4 (type inference) must wait for US2

**Within Each User Story**:
- All tests marked [P] can run in parallel (different test files)
- T002 (utility) can be implemented early (before US4 tests)

---

## Parallel Example: User Story 5 (Path Validation)

```bash
# Launch all tests for US5 together:
Task: "Parsing test: Parse default import with relative path"
Task: "Parsing test: Parse named import with relative path"
Task: "Validation test: Reject Unix absolute path"
Task: "Validation test: Reject Windows absolute path"
Task: "Validation test: Reject URL paths"
Task: "Unit test: validateImportPath() with all path formats"

# All 6 test tasks can run in parallel (different test files/suites)
```

---

## Parallel Example: User Story 4 (Type Inference)

```bash
# Launch all unit tests for type inference together:
Task: "Unit test: inferAssetType() with all extensions"
Task: "Unit test: inferAssetType() case-insensitive"
Task: "Unit test: inferAssetType() multiple extensions"

# Launch all parsing tests for 'as' clause together:
Task: "Parsing test: Parse named import with as html"
Task: "Parsing test: Parse named import with as css"
Task: "Parsing test: Parse named import with as media"

# Launch all validation tests together:
Task: "Validation test: Reject unknown extension without explicit type"
Task: "Validation test: Reject ambiguous .ogg extension"
Task: "Validation test: Accept unknown extension with explicit as type"
Task: "Unit test: validateAssetType() with all scenarios"
```

---

## Implementation Strategy

### MVP First (US5 + US1 Only)

1. Complete Phase 1: Setup → Shared utilities ready
2. Complete Phase 2: Foundational → Grammar foundation ready
3. Complete Phase 3: US5 (Path Validation) → Portability enforced
4. Complete Phase 4: US1 (Layout) → Layout imports working
5. **STOP and VALIDATE**: Test layout imports with relative paths
6. Deploy/demo basic import support (layout only)

**Rationale**: US5 + US1 = Minimum viable import feature (layout templates with path validation)

### Incremental Delivery

1. **Milestone 1**: Setup + Foundational + US5 + US1 → Layout imports (MVP!)
2. **Milestone 2**: Add US3 → Styles and provider imports
3. **Milestone 3**: Add US2 → Named HTML imports (code reuse)
4. **Milestone 4**: Add US4 → Type inference and explicit override (UX polish)
5. Each milestone adds value without breaking previous functionality

### Parallel Team Strategy

With multiple developers:

1. **Together**: Complete Setup + Foundational (T001-T009)
2. **Sequential (critical path)**: One developer completes US5 (path validation is prerequisite)
3. **Parallel (after US5)**:
   - Developer A: US1 (layout) → US3 (styles/provider)
   - Developer B: US2 (named imports) → US4 (type inference)
4. Stories integrate cleanly (no conflicts)

---

## Notes

- **[P] tasks** = different files/test suites, no dependencies, safe to parallelize
- **[Story] label** maps task to specific user story for traceability
- **TDD workflow**: Write tests first (they FAIL), implement feature, tests PASS
- **Grammar regeneration**: Run `npm run langium:generate` after every grammar change
- **Biome compliance**: Run `npm run check` after each story to maintain code quality (Constitution Principle XI)
- **Commit frequency**: Commit after each task or logical group (passing tests)
- **Checkpoint validation**: At each checkpoint, validate the user story works independently
- **Constitution compliance**: All validators are pure functions (Principle X), comprehensive tests (Principle II)

---

## Task Count Summary

- **Setup**: 4 tasks (T001-T004)
- **Foundational**: 5 tasks (T005-T009)
- **US5 (Path Validation)**: 10 tasks (T010-T019) - 6 tests, 4 implementation
- **US1 (Layout)**: 10 tasks (T020-T029) - 4 tests, 5 implementation, 1 lint
- **US3 (Styles/Provider)**: 10 tasks (T030-T039) - 5 tests, 4 implementation, 1 lint
- **US2 (Named HTML)**: 14 tasks (T040-T053) - 7 tests, 6 implementation, 1 lint
- **US4 (Type Inference)**: 17 tasks (T054-T070) - 10 tests, 6 implementation, 1 lint
- **Polish**: 9 tasks (T071-T079)
- **TOTAL**: 79 tasks

**Test Coverage**: 32 test tasks (40% of total) - validates comprehensive testing (Constitution Principle II)

**Parallel Opportunities**: 26 tasks marked [P] (33% of total)

---

## Suggested MVP Scope

**Recommended MVP**: Phases 1-4 (Setup + Foundational + US5 + US1)
- **Tasks**: T001-T029 (29 tasks)
- **Delivers**: Layout imports with path validation
- **Value**: Developers can specify main HTML template with portability enforcement
- **Tests**: 10 test tasks included (TDD compliance)

**Next Increment**: Add Phase 5 (US3)
- **Tasks**: T030-T039 (10 tasks)
- **Delivers**: Styles and provider imports (complete default import syntax)

**Full Feature**: All phases (T001-T079)
- **Delivers**: Complete asset import syntax with all user stories
