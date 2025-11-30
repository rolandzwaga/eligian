# Tasks: Looser Import Paths

**Input**: Design documents from `/specs/042-looser-import-paths/`
**Prerequisites**: plan.md, spec.md

**Tests**: Test updates included (modifying existing tests to reflect new behavior)

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Monorepo**: `packages/shared-utils/`, `packages/language/`, `packages/extension/`
- Paths shown below use the monorepo structure from plan.md

---

## Phase 1: Setup

**Purpose**: No setup required - this feature modifies existing code

*No tasks - the monorepo and all packages are already initialized*

---

## Phase 2: Foundational (Core Path Resolver Changes)

**Purpose**: Remove security boundary validation from the shared-utils package

**⚠️ CRITICAL**: All user stories depend on this phase completing successfully

- [x] T001 Remove `validatePathSecurity()` function and `SecurityValidationResult` type from `packages/shared-utils/src/path-resolver.ts`
- [x] T002 Remove security validation call from `resolvePath()` function in `packages/shared-utils/src/path-resolver.ts`
- [x] T003 Update file header comments to reflect new behavior (parent directory navigation allowed) in `packages/shared-utils/src/path-resolver.ts`
- [x] T004 Remove `createSecurityError` import from `packages/shared-utils/src/path-resolver.ts`
- [x] T005 Remove `validatePathSecurity` tests (entire describe block) from `packages/shared-utils/__tests__/path-resolver.spec.ts`
- [x] T006 Update `resolvePath` tests that expected failure for `../` paths to expect success in `packages/shared-utils/__tests__/path-resolver.spec.ts`

**Checkpoint**: Core path resolver now allows parent directory navigation. Run `pnpm --filter @eligian/shared-utils test` to verify.

---

## Phase 3: User Story 1 - Import Files from Parent Directory (Priority: P1) 🎯 MVP

**Goal**: Enable developers to import assets from parent directories using `../` syntax

**Independent Test**: Create test case with `../shared/file.css` and verify it resolves to the correct absolute path

### Tests for User Story 1

- [x] T007 [P] [US1] Add test for single parent directory resolution (`../shared/file.css`) in `packages/shared-utils/__tests__/path-resolver.spec.ts`
- [x] T008 [P] [US1] Add test for multiple parent directory resolution (`../../templates/header.html`) in `packages/shared-utils/__tests__/path-resolver.spec.ts`
- [x] T009 [P] [US1] Add test for complex normalized paths (`../../shared/../common/styles.css`) in `packages/shared-utils/__tests__/path-resolver.spec.ts`
- [x] T009a [P] [US1] Add edge case test for circular path segments (`./foo/../bar/../foo/styles.css`) in `packages/shared-utils/__tests__/path-resolver.spec.ts`
- [x] T009b [P] [US1] Add edge case test for excessive parent navigation (more `../` than directory depth) in `packages/shared-utils/__tests__/path-resolver.spec.ts`

### Implementation for User Story 1

- [x] T010 [US1] Verify `resolvePath()` correctly resolves paths with single `../` sequence in `packages/shared-utils/src/path-resolver.ts`
- [x] T011 [US1] Verify `resolvePath()` correctly resolves paths with multiple `../` sequences in `packages/shared-utils/src/path-resolver.ts`
- [x] T012 [US1] Verify path normalization handles mixed `.` and `..` segments correctly in `packages/shared-utils/src/path-resolver.ts`

**Checkpoint**: Parent directory imports work correctly. Run `pnpm --filter @eligian/shared-utils test` to verify all new tests pass.

---

## Phase 4: User Story 2 - Maintain Relative Path Requirement (Priority: P2)

**Goal**: Ensure absolute paths and protocol URLs remain blocked for portability

**Independent Test**: Verify absolute paths and URLs still produce errors

### Tests for User Story 2

- [x] T013 [P] [US2] Add/verify test for Unix absolute path rejection (`/var/www/styles.css`) in `packages/shared-utils/__tests__/path-resolver.spec.ts`
- [x] T014 [P] [US2] Add/verify test for Windows absolute path rejection (`C:\project\styles.css`) in `packages/shared-utils/__tests__/path-resolver.spec.ts`
- [x] T015 [P] [US2] Add/verify test for protocol URL rejection (`https://example.com/file.css`) in `packages/language/src/validators/__tests__/import-path-validator.spec.ts`

### Implementation for User Story 2

- [x] T016 [US2] Verify `validateImportPath()` in `packages/language/src/validators/import-path-validator.ts` still rejects absolute paths
- [x] T017 [US2] Verify `isAbsolutePath()` function still detects Unix, Windows, and protocol absolute paths in `packages/language/src/validators/import-path-validator.ts`

**Checkpoint**: Absolute paths and URLs still blocked. Run `pnpm --filter @eligian/language test -- import-path-validator` to verify.

---

## Phase 5: User Story 3 - Clear Error Messages for Missing Files (Priority: P3)

**Goal**: Provide helpful error messages with resolved paths when files are not found

**Independent Test**: Create import to non-existent file and verify error includes resolved absolute path

### Tests for User Story 3

- [x] T018 [US3] Add test verifying error messages include resolved absolute path for missing files in `packages/language/src/asset-loading/__tests__/asset-loader.spec.ts`

### Implementation for User Story 3

- [x] T019 [US3] Verify error messages from `NodeAssetLoader.loadFile()` include resolved path in `packages/language/src/asset-loading/node-asset-loader.ts`
- [x] T020 [US3] Update error message in `resolveHTMLPath()` to reflect new behavior (path resolution, not security violation) in `packages/language/src/compiler/html-import-utils.ts`

**Checkpoint**: Error messages include resolved paths. Run `pnpm --filter @eligian/language test -- asset-loader` to verify.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Update comments and documentation across all affected packages

- [x] T021 [P] Update JSDoc comments in `packages/language/src/asset-loading/node-asset-loader.ts` to remove security violation references
- [x] T022 [P] Update comments in `packages/extension/src/extension/preview/MediaResolver.ts` to reflect new path resolution behavior
- [x] T023 [P] Update comments in `packages/language/src/compiler/html-import-utils.ts` to remove security boundary references
- [x] T024 Run full test suite `pnpm test` to verify no regressions across all packages
- [x] T025 Run build `pnpm run build` to verify TypeScript compilation succeeds
- [x] T026 Run linter `pnpm run check` to verify code quality

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No tasks - skip
- **Foundational (Phase 2)**: No dependencies - start immediately - BLOCKS all user stories
- **User Stories (Phase 3-5)**: All depend on Foundational phase completion
  - User stories can proceed sequentially in priority order (P1 → P2 → P3)
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Depends on Foundational (Phase 2) - Core functionality
- **User Story 2 (P2)**: Depends on Foundational (Phase 2) - Verify existing behavior preserved
- **User Story 3 (P3)**: Depends on Foundational (Phase 2) - Error message improvements

### Within Each User Story

- Tests can run in parallel within a story
- Implementation tasks are sequential (verify behavior after code changes)

### Parallel Opportunities

- T007, T008, T009, T009a, T009b can run in parallel (different test cases)
- T013, T014, T015 can run in parallel (different validators)
- T021, T022, T023 can run in parallel (different files)

---

## Parallel Example: User Story 1 Tests

```bash
# Launch all tests for User Story 1 together:
Task: T007 "Add test for single parent directory resolution in packages/shared-utils/__tests__/path-resolver.spec.ts"
Task: T008 "Add test for multiple parent directory resolution in packages/shared-utils/__tests__/path-resolver.spec.ts"
Task: T009 "Add test for complex normalized paths in packages/shared-utils/__tests__/path-resolver.spec.ts"
Task: T009a "Add edge case test for circular path segments in packages/shared-utils/__tests__/path-resolver.spec.ts"
Task: T009b "Add edge case test for excessive parent navigation in packages/shared-utils/__tests__/path-resolver.spec.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 2: Foundational (T001-T006)
2. Complete Phase 3: User Story 1 (T007-T012)
3. **STOP and VALIDATE**: Run `pnpm --filter @eligian/shared-utils test`
4. Deploy if ready - parent directory imports work!

### Incremental Delivery

1. Foundational → Core change complete
2. Add User Story 1 → Parent imports work → Validate
3. Add User Story 2 → Absolute paths blocked → Validate
4. Add User Story 3 → Good error messages → Validate
5. Polish → All documentation updated

### Single Developer Strategy

Execute sequentially:
1. T001-T006 (Foundational)
2. T007-T012 (User Story 1)
3. T013-T017 (User Story 2)
4. T018-T020 (User Story 3)
5. T021-T026 (Polish)

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Run `pnpm test` after each phase to verify no regressions
- Run `pnpm run check` before committing to ensure code quality
