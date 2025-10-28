# Tasks: Error Type Unification

**Input**: Design documents from `/specs/018-error-type-unification/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Following Constitution Principle II (Test-First Development), all tests are written BEFORE implementation.

**Organization**: Tasks grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Exact file paths included in descriptions

## Path Conventions
- Language package: `packages/language/src/`
- Extension package: `packages/extension/src/`
- Shared utils: `packages/shared-utils/src/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create unified error namespace structure

- [ ] T001 Create `packages/language/src/errors/` directory structure
- [ ] T002 Create `packages/language/src/errors/__tests__/` directory for test files

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core error type definitions that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T003 [P] Create `packages/language/src/errors/base.ts` with BaseError type and SourceLocation type
- [ ] T004 [P] Create `packages/language/src/errors/compiler-errors.ts` with CompilerError union types (ParseError, ValidationError, TypeError, TransformError, OptimizationError, EmitError)
- [ ] T005 [P] Create `packages/language/src/errors/asset-errors.ts` with AssetError union types (HtmlImportError, CssImportError, CssParseError, MediaImportError)
- [ ] T006 [P] Create `packages/language/src/errors/io-errors.ts` that re-exports IOError types from `@eligian/shared-utils`
- [ ] T007 Create `packages/language/src/errors/index.ts` with barrel exports (AllErrors union, all error types, all type guards, all formatters)

**Checkpoint**: Foundation ready - unified error types exist, user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Consistent Error Messages Across All Tools (Priority: P1) 🎯 MVP

**Goal**: Ensure identical error messages across CLI, VS Code extension, and language server

**Independent Test**: Trigger same error (file not found, parse error, CSS error) in CLI and VS Code, verify identical messages

### Tests for User Story 1 (Test-First Development) ✅

**NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T008 [P] [US1] Write test `packages/language/src/errors/__tests__/error-consistency.spec.ts` - Test that formatError() produces consistent output for all error types
- [ ] T009 [P] [US1] Write integration test in `packages/language/src/__tests__/error-message-consistency.spec.ts` - Test CompilerError messages match across validator and CLI contexts
- [ ] T010 [P] [US1] Write integration test in `packages/extension/src/extension/__tests__/compilation-error-consistency.spec.ts` - Test CompilationService converts errors consistently

### Implementation for User Story 1

- [ ] T011 [P] [US1] Implement constructor functions in `packages/language/src/errors/compiler-errors.ts` (createParseError, createValidationError, etc.)
- [ ] T012 [P] [US1] Implement constructor functions in `packages/language/src/errors/asset-errors.ts` (createHtmlImportError, createCssImportError, etc.)
- [ ] T013 [US1] Create `packages/language/src/errors/formatters.ts` with formatError() function (depends on T003-T006)
- [ ] T014 [US1] Add formatErrorWithSnippet() function to `packages/language/src/errors/formatters.ts` (depends on T013)
- [ ] T015 [US1] Add formatForVSCode() function to `packages/language/src/errors/formatters.ts` for VS Code diagnostic conversion
- [ ] T016 [US1] Update `packages/extension/src/extension/preview/CompilationService.ts` to use formatForVSCode() instead of custom conversion logic
- [ ] T017 [US1] Export formatters from `packages/language/src/errors/index.ts`
- [ ] T018 [US1] Verify all T008-T010 tests now PASS (error messages consistent)

**Checkpoint**: At this point, User Story 1 should be fully functional - all tools use unified formatters for consistent messages

---

## Phase 4: User Story 2 - Unified Error Type Checking (Priority: P2)

**Goal**: Enable programmatic error type checking with type guards and exhaustive pattern matching

**Independent Test**: Write small tool that imports errors, uses type guards, handles all categories with TypeScript exhaustiveness checking

### Tests for User Story 2 (Test-First Development) ✅

- [ ] T019 [P] [US2] Write test `packages/language/src/errors/__tests__/type-guards.spec.ts` - Test all type guard functions (isParseError, isCompilerError, isIOError, isAssetError, etc.)
- [ ] T020 [P] [US2] Write test for exhaustive pattern matching in `packages/language/src/errors/__tests__/exhaustive-matching.spec.ts` - Test TypeScript exhaustiveness checking works
- [ ] T021 [P] [US2] Write integration test in `packages/language/src/__tests__/error-type-checking.spec.ts` - Test type guards narrow types correctly in real usage

### Implementation for User Story 2

- [ ] T022 [P] [US2] Implement compiler error type guards in `packages/language/src/errors/type-guards.ts` (isParseError, isValidationError, isTypeError, isTransformError, isOptimizationError, isEmitError, isCompilerError)
- [ ] T023 [P] [US2] Implement asset error type guards in `packages/language/src/errors/type-guards.ts` (isHtmlImportError, isCssImportError, isCssParseError, isMediaImportError, isAssetError)
- [ ] T024 [P] [US2] Implement IOError type guards in `packages/language/src/errors/type-guards.ts` (re-export from shared-utils: isFileNotFoundError, isPermissionError, isReadError, isSecurityError, isIOError)
- [ ] T025 [US2] Implement top-level type guard isEligianError() in `packages/language/src/errors/type-guards.ts` (depends on T022-T024)
- [ ] T026 [US2] Export all type guards from `packages/language/src/errors/index.ts`
- [ ] T027 [US2] Update example in `specs/018-error-type-unification/quickstart.md` showing exhaustive pattern matching with type guards
- [ ] T028 [US2] Verify all T019-T021 tests now PASS (type guards work correctly)

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently - tools have consistent messages AND programmatic type checking

---

## Phase 5: User Story 3 - Single Source of Truth for Error Definitions (Priority: P3)

**Goal**: All packages import from unified namespace, no duplicate definitions

**Independent Test**: Add new error type to unified namespace, verify all packages can import without changes

### Tests for User Story 3 (Test-First Development) ✅

- [ ] T029 [P] [US3] Write test in `packages/language/src/__tests__/single-source-of-truth.spec.ts` - Test adding new error type to unified namespace
- [ ] T030 [P] [US3] Write test in `packages/language/src/__tests__/no-duplicate-definitions.spec.ts` - Grep codebase to verify no duplicate error definitions remain (automated check)
- [ ] T031 [P] [US3] Write integration test in `packages/extension/src/extension/__tests__/error-import-consistency.spec.ts` - Test extension imports from unified namespace

### Implementation for User Story 3

#### Migrate compiler/types/errors.ts

- [ ] T032 [US3] Add deprecation warnings (`@deprecated`) to `packages/language/src/compiler/types/errors.ts` with migration guidance
- [ ] T033 [US3] Add re-exports in `packages/language/src/compiler/types/errors.ts` that point to unified types in `packages/language/src/errors/`
- [ ] T034 [US3] Update all imports in `packages/language/src/compiler/` files to use `@eligian/language/errors` instead of local `./types/errors.js`

#### Migrate asset-loading/types.ts

- [ ] T035 [US3] Add deprecation warnings to `packages/language/src/asset-loading/types.ts`
- [ ] T036 [US3] Add re-exports in `packages/language/src/asset-loading/types.ts` pointing to unified AssetError types
- [ ] T037 [US3] Update all imports in `packages/language/src/asset-loading/` files to use `@eligian/language/errors`

#### Migrate validators/validation-errors.ts

- [ ] T038 [US3] Add deprecation warnings to `packages/language/src/validators/validation-errors.ts`
- [ ] T039 [US3] Preserve ERROR_MESSAGES pattern in unified errors (move to formatters or keep as utility)
- [ ] T040 [US3] Add re-exports in `packages/language/src/validators/validation-errors.ts` pointing to unified types
- [ ] T041 [US3] Update all imports in `packages/language/src/validators/` files to use `@eligian/language/errors`

#### Migrate css/css-parser.ts

- [ ] T042 [US3] Add deprecation warnings to CSSParseError in `packages/language/src/css/css-parser.ts`
- [ ] T043 [US3] Update `packages/language/src/css/css-parser.ts` to use unified CSSParseError type from `@eligian/language/errors`
- [ ] T044 [US3] Update CSSSourceLocation to use unified SourceLocation from `@eligian/language/errors/base`

#### Migrate extension/preview/CompilationService.ts

- [ ] T045 [US3] Add deprecation warnings to CompilationError interface in `packages/extension/src/extension/preview/CompilationService.ts`
- [ ] T046 [US3] Update `packages/extension/src/extension/preview/CompilationService.ts` to import CompilerError from `@eligian/language/errors`
- [ ] T047 [US3] Simplify convertCompilerError() method to use unified type guards instead of custom checks

#### Verify migration completeness

- [ ] T048 [US3] Export unified types from `packages/language/src/index.ts` (top-level language package export)
- [ ] T049 [US3] Update `CLAUDE.md` with new error handling patterns (unified namespace location, type guard usage, migration guidance)
- [ ] T050 [US3] Verify all T029-T031 tests now PASS (single source of truth achieved)

**Checkpoint**: All user stories should now be independently functional - consistent messages (US1), type checking (US2), single source (US3)

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T051 [P] Write test `packages/language/src/errors/__tests__/formatters.spec.ts` - Comprehensive formatter tests (formatError, formatErrorWithSnippet, formatForVSCode)
- [ ] T052 Run full test suite: `pnpm run test` - Verify all 1067+ existing tests still pass (SC-005: Zero regressions)
- [ ] T053 Run test coverage: `pnpm run test:coverage` - Verify 80%+ coverage for new error handling code (Constitution Principle II)
- [ ] T054 [P] Measure code reduction: `git diff --shortstat` - Verify 200-300 lines eliminated (SC-002)
- [ ] T055 [P] Grep audit: Verify 5+ error locations consolidated to 1 (SC-006)
- [ ] T056 [P] Update `specs/018-error-type-unification/quickstart.md` with real-world examples using final implementation
- [ ] T057 Code cleanup: Remove temporary debug logging, ensure code quality
- [ ] T058 Run Biome check: `pnpm run check` - Format and lint all new code
- [ ] T059 Run TypeScript check: `pnpm run build` - Verify zero type errors
- [ ] T060 Create migration checklist in `specs/018-error-type-unification/MIGRATION.md` for future reference

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-5)**: All depend on Foundational phase completion
  - User stories can proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3)
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Depends on Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Depends on Foundational (Phase 2) - Independent of US1
- **User Story 3 (P3)**: Depends on Foundational (Phase 2) - Uses formatters/guards from US1/US2 but can be implemented independently

### Within Each User Story

- Tests MUST be written and FAIL before implementation (Test-First Development)
- Constructor functions before formatters (US1)
- Type guards before exports (US2)
- Deprecation warnings before re-exports (US3)
- Re-exports before import updates (US3)
- Import updates before migration verification (US3)

### Parallel Opportunities

- **Phase 1**: Both setup tasks can run in parallel
- **Phase 2**: All 5 foundational tasks (T003-T007) can run in parallel (different files)
- **US1 Tests**: T008, T009, T010 can run in parallel (different files)
- **US1 Implementation**: T011, T012 can run in parallel (different files)
- **US2 Tests**: T019, T020, T021 can run in parallel (different files)
- **US2 Implementation**: T022, T023, T024 can run in parallel (different files)
- **US3 Tests**: T029, T030, T031 can run in parallel (different files)
- **US3 Migration**: Migration of different files (T032-T034, T035-T037, T038-T041, T042-T044, T045-T047) can run in parallel
- **Phase 6 Polish**: T051, T054, T055, T056 can run in parallel (different concerns)
- **Different user stories**: US1, US2, US3 can be worked on in parallel by different team members after Foundational phase

---

## Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together (Test-First Development):
Task: "Write test error-consistency.spec.ts"
Task: "Write integration test error-message-consistency.spec.ts"
Task: "Write integration test compilation-error-consistency.spec.ts"

# Launch all constructor functions together:
Task: "Implement constructor functions in compiler-errors.ts"
Task: "Implement constructor functions in asset-errors.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T002)
2. Complete Phase 2: Foundational (T003-T007) - CRITICAL
3. Complete Phase 3: User Story 1 (T008-T018)
4. **STOP and VALIDATE**: Test User Story 1 independently
   - Trigger file not found in CLI and VS Code → verify identical message
   - Trigger parse error in both → verify identical message
   - Trigger CSS error in both → verify identical message
5. Deploy/demo if ready (MVP delivers consistent error messages!)

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready (T001-T007)
2. Add User Story 1 → Test independently → Deploy/Demo (Consistent messages! 🎯)
3. Add User Story 2 → Test independently → Deploy/Demo (Type checking! 🔍)
4. Add User Story 3 → Test independently → Deploy/Demo (Single source! 🏛️)
5. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together (T001-T007)
2. Once Foundational is done:
   - Developer A: User Story 1 (T008-T018)
   - Developer B: User Story 2 (T019-T028)
   - Developer C: User Story 3 (T029-T050)
3. Stories complete and integrate independently

---

## Task Summary

**Total Tasks**: 60
- **Phase 1 (Setup)**: 2 tasks
- **Phase 2 (Foundational)**: 5 tasks (BLOCKING)
- **Phase 3 (US1 - P1 MVP)**: 11 tasks (3 tests + 8 implementation)
- **Phase 4 (US2 - P2)**: 10 tasks (3 tests + 7 implementation)
- **Phase 5 (US3 - P3)**: 22 tasks (3 tests + 19 migration)
- **Phase 6 (Polish)**: 10 tasks

**Parallel Opportunities**: 25+ tasks can run in parallel (marked [P])

**Test-First Development**: All 9 test tasks written BEFORE implementation (Constitution Principle II)

**Independent Test Criteria**:
- **US1**: Error messages identical across CLI and VS Code for same error
- **US2**: Type guards enable exhaustive pattern matching in TypeScript
- **US3**: New error type added in <10 minutes without touching multiple packages

**Suggested MVP Scope**: Phase 1-3 only (US1 - Consistent Error Messages)

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- **Verify tests FAIL before implementing** (Test-First Development)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Run `pnpm run check` and `pnpm run build` after each phase
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
