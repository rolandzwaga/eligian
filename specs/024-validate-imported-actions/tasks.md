# Tasks: Validate Imported Actions in Operation Context

**Input**: Design documents from `/specs/024-validate-imported-actions/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Feature Type**: Bug Fix (surgical modification to existing validator)
**Scope**: Single validator method + integration tests
**Tech Stack**: TypeScript 5.9.3, Langium 4.0.3, Vitest 3.2.4
**Target**: VS Code extension + CLI compiler (language package only)

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions
- **Language package**: `packages/language/src/`
- **Tests**: `packages/language/src/__tests__/`
- **Scope provider**: `packages/language/src/eligian-scope-provider.ts`
- **Validator**: `packages/language/src/eligian-validator.ts`

---

## Phase 1: Foundational (Enable Import Check) 🎯 MVP

**Purpose**: Make scope provider's `getImportedActions` method accessible to validator

**⚠️ CRITICAL**: This single change is the foundation that enables all user stories. Without it, the validator cannot query imported actions.

- [x] T001 [Foundational] Make `EligianScopeProvider.getImportedActions()` public in `packages/language/src/eligian-scope-provider.ts` line 129
  - **Change**: `private getImportedActions` → `public getImportedActions`
  - **Add JSDoc**: Document that method is used for validation and code completion (Feature 024)
  - **Verify**: Run `pnpm run typecheck` (should pass with no errors)
  - **Why foundational**: All user stories depend on validator being able to call this method

- [x] T002 [Foundational] Add import statement to validator in `packages/language/src/eligian-validator.ts`
  - **Add**: `import type { EligianScopeProvider } from './eligian-scope-provider.js';`
  - **Location**: Top of file with other imports
  - **Verify**: Run `pnpm run typecheck` (import should resolve)
  - **Why foundational**: Validator needs type reference to cast scope provider

**Checkpoint**: Foundation ready - validator can now access imported actions. All user stories can proceed.

---

## Phase 2: User Story 1 - Call Imported Actions Without Validation Errors (Priority: P1) 🎯 MVP

**Goal**: Fix core bug where imported actions are incorrectly flagged as "unknown operation"

**Independent Test**: Create two files - one defining an action, another importing and calling it - and verify zero validation errors appear.

**Why MVP**: This delivers immediate value by making the existing import feature actually usable. Without this fix, imported actions generate false errors.

### Tests for User Story 1 (Test-First Development)

**NOTE: Write these tests FIRST, ensure they FAIL before implementation (proves bug exists)**

- [x] T003 [P] [US1] Write failing test: "should NOT error on valid imported action call" in `packages/language/src/__tests__/operation-validation.spec.ts`
  - **Test code**:
    ```typescript
    test('should NOT error on valid imported action call', async () => {
      const { diagnostics } = await ctx.parseAndValidate(`
        styles "./test.css"
        import { fadeIn } from "./animations.eligian"
        action test() [
          fadeIn("#app", 1000)
        ]
        timeline "Demo" in "#app" using raf {
          at 0s..1s test()
        }
      `);
      const errors = diagnostics.filter((d) => d.severity === 1);
      expect(errors).toHaveLength(0);
    });
    ```
  - **Expected**: Test FAILS with "Unknown operation: fadeIn" (proves bug exists)
  - **Location**: Add to new test suite "Imported action validation" at end of file

- [x] T004 [P] [US1] Write test: "should validate multiple imported actions" in `packages/language/src/__tests__/operation-validation.spec.ts`
  - **Test code**:
    ```typescript
    test('should validate multiple imported actions', async () => {
      const { diagnostics } = await ctx.parseAndValidate(`
        styles "./test.css"
        import { fadeIn, fadeOut } from "./animations.eligian"
        action sequence() [
          fadeIn("#app", 1000)
          fadeOut("#app", 500)
        ]
        timeline "Demo" in "#app" using raf {
          at 0s..1s sequence()
        }
      `);
      const errors = diagnostics.filter((d) => d.severity === 1);
      expect(errors).toHaveLength(0);
    });
    ```
  - **Expected**: Test FAILS with multiple "Unknown operation" errors
  - **Location**: Same test suite as T003

- [x] T005 [P] [US1] Write test: "should validate mix of imported actions and builtin operations" in `packages/language/src/__tests__/operation-validation.spec.ts`
  - **Test code**:
    ```typescript
    test('should validate mix of imported actions and builtin operations', async () => {
      const { diagnostics } = await ctx.parseAndValidate(`
        styles "./test.css"
        import { fadeIn } from "./animations.eligian"
        action enhanced() [
          fadeIn("#app", 1000)
          selectElement("#app")
          addClass("visible")
        ]
        timeline "Demo" in "#app" using raf {
          at 0s..1s enhanced()
        }
      `);
      const errors = diagnostics.filter((d) => d.severity === 1);
      expect(errors).toHaveLength(0);
    });
    ```
  - **Expected**: Test FAILS with "Unknown operation: fadeIn"
  - **Location**: Same test suite as T003

- [x] T006 [US1] Run tests to verify they FAIL (proves bug exists)
  - **Command**: `pnpm test operation-validation.spec.ts`
  - **Expected**: Tests T003, T004, T005 should FAIL with "Unknown operation" errors
  - **Debug**: If tests pass, bug may already be fixed or test setup is wrong
  - **Why sequential**: Need to verify tests fail before implementing fix

### Implementation for User Story 1

- [x] T007 [US1] Modify `checkOperationExists` validator method in `packages/language/src/eligian-validator.ts` line 490
  - **Insert code** (after library action check, before operation check):
    ```typescript
    // Feature 024: Check if operation is an IMPORTED action
    if (program) {
      const scopeProvider = this.services.references.ScopeProvider as EligianScopeProvider;
      const importedActions = scopeProvider.getImportedActions(program);
      const importedAction = findActionByName(opName, importedActions);
      if (importedAction) {
        // This is a valid imported action call - skip operation validation
        return;
      }
    }
    ```
  - **Location**: Line 490 (after line 489 `}`, before line 492 `const error = validateOperationExists(opName);`)
  - **Code size**: 9 lines (includes comments)
  - **Why here**: After local/library checks, before operation check (matches validation flow from data-model.md)
  - **Depends on**: T001 (method must be public), T002 (import must exist)

- [x] T008 [US1] Run tests to verify they PASS (proves fix works)
  - **Command**: `pnpm test operation-validation.spec.ts`
  - **Expected**: All tests T003, T004, T005 should now PASS (zero errors)
  - **Debug**: If tests still fail, check code insertion location and scope provider call
  - **Depends on**: T007 (implementation complete)

- [x] T009 [US1] Run full test suite to verify no regressions
  - **Command**: `pnpm test`
  - **Expected**: All 1,569+ tests pass (1,565 existing + 4 new)
  - **Regression check**: Verify existing operation validation tests unchanged
  - **Depends on**: T008 (US1 tests passing)

**Checkpoint**: At this point, User Story 1 is fully functional - imported actions validate correctly, no regressions.

---

## Phase 3: User Story 2 - Distinguish Between Invalid Operations and Valid Imported Actions (Priority: P2)

**Goal**: Ensure validator still catches truly invalid operations (typos) while allowing imported actions

**Independent Test**: Mix imported actions with invalid operation names and verify only the truly invalid ones are flagged.

**Why P2**: Maintains quality of error detection - we need both imported actions to work AND invalid operations to still be caught.

### Tests for User Story 2

- [x] T010 [P] [US2] Write test: "should error on typo in imported action name" in `packages/language/src/__tests__/operation-validation.spec.ts`
  - **Test code**:
    ```typescript
    test('should error on typo in imported action name', async () => {
      const { diagnostics } = await ctx.parseAndValidate(`
        styles "./test.css"
        import { fadeIn } from "./animations.eligian"
        action test() [
          fadein("#app", 1000)  // Typo: lowercase 'i'
        ]
        timeline "Demo" in "#app" using raf {
          at 0s..1s test()
        }
      `);
      const errors = diagnostics.filter((d) => d.severity === 1);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('Unknown operation');
      expect(errors[0].message).toContain('fadein');
    });
    ```
  - **Expected**: Test should PASS (typo correctly flagged as error)
  - **Location**: Same "Imported action validation" test suite

- [x] T011 [US2] Run test to verify typo detection works
  - **Command**: `pnpm test operation-validation.spec.ts -t "should error on typo"`
  - **Expected**: Test T010 should PASS (typos still caught)
  - **Depends on**: T010 (test written)

- [x] T012 [US2] Run full test suite to verify error detection quality
  - **Command**: `pnpm test`
  - **Expected**: All tests pass, including existing "Unknown operation detection" suite (lines 20-132)
  - **Quality check**: Verify suggestions still work for typos (Levenshtein distance)
  - **Depends on**: T011 (US2 test passing)

**Checkpoint**: User Story 2 complete - imported actions validate correctly AND invalid operations still caught.

---

## Phase 4: User Story 3 - Clear Error Messages for Import Mismatches (Priority: P3)

**Goal**: Verify errors appear at import statements (not call sites) for non-existent actions

**Independent Test**: Import non-existent actions and verify errors appear at the import line with clear messages.

**Why P3**: This improves developer experience by showing errors at the right location. Since import validation already works (per spec assumptions), this is verification only.

### Verification for User Story 3 (No Implementation Needed)

- [x] T013 [P] [US3] Verify existing import validation tests in `packages/language/src/__tests__/`
  - **Search**: Look for tests validating import statements (e.g., "import validation", "library import")
  - **Check**: Tests should verify errors at import line for non-existent actions
  - **Expected**: Import validation already works (per spec assumptions)
  - **If missing**: May need to add tests for import statement validation (separate from usage validation)

- [x] T014 [US3] Manual test: Import non-existent action in VS Code
  - **Steps**:
    1. Open `.eligian` file in VS Code
    2. Write: `import { nonExistent } from "./library.eligian"`
    3. Verify error appears at import line (not at usage)
  - **Expected**: Error message: "Action 'nonExistent' not found in library"
  - **Location**: Error should be on import line, not on call site
  - **Depends on**: Extension running with updated validator

- [x] T015 [US3] Document verification results in `specs/024-validate-imported-actions/VERIFICATION.md`
  - **Content**: Results of T013 and T014
  - **If import validation missing**: Create issue for future work
  - **If working**: Document that User Story 3 requirement already met
  - **Depends on**: T013, T014 (verification complete)

**Checkpoint**: User Story 3 verified - errors appear at correct location (import statements).

---

## Phase 5: Code Quality & Documentation

**Purpose**: Ensure code quality, no regressions, and documentation is complete

- [x] T016 [P] [Quality] Run Biome check (format + lint) with auto-fix
  - **Command**: `pnpm run check`
  - **Expected**: 0 errors, 0 warnings
  - **Auto-fix**: If issues found, run `pnpm run check --apply`
  - **Files affected**: `eligian-scope-provider.ts`, `eligian-validator.ts`, `operation-validation.spec.ts`

- [x] T017 [P] [Quality] Run TypeScript type checking
  - **Command**: `pnpm -w run typecheck`
  - **Expected**: 0 errors
  - **Check**: Type safety for scope provider cast, import statement

- [x] T018 [Quality] Performance validation (verify <5ms overhead)
  - **Command**: `time pnpm test operation-validation.spec.ts`
  - **Baseline**: Record time before changes (if available)
  - **After fix**: Compare time after changes
  - **Expected**: <5% increase (negligible overhead per research.md)
  - **Depends on**: All implementation complete

- [x] T019 [P] [Documentation] Update CLAUDE.md if needed
  - **Check**: Does CLAUDE.md need updates for import validation feature?
  - **Location**: `CLAUDE.md` root of repository
  - **Add**: Brief mention of Feature 024 (imported action validation fix)
  - **Optional**: Only if import validation is a significant feature worth documenting

- [x] T020 [Documentation] Verify quickstart.md checklist complete
  - **File**: `specs/024-validate-imported-actions/quickstart.md`
  - **Check**: All 14 checklist items completed
  - **Success criteria**: All 6 success criteria from spec.md verified
  - **Depends on**: All previous tasks complete

**Checkpoint**: All quality checks pass, documentation complete, feature ready for commit.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 1)**: No dependencies - can start immediately
  - Tasks T001, T002 make scope provider accessible
  - **BLOCKS**: All user stories depend on this phase
- **User Story 1 (Phase 2)**: Depends on Foundational (T001, T002)
  - Core bug fix - imported actions validate correctly
  - **MVP**: This phase alone delivers immediate value
- **User Story 2 (Phase 3)**: Depends on User Story 1 complete
  - Verifies error detection quality maintained
  - **Integration**: Tests that fix doesn't break existing validation
- **User Story 3 (Phase 4)**: Independent of US1/US2 (verification only)
  - Can run in parallel with US2 if needed
  - **Verification**: Checks existing import validation
- **Code Quality (Phase 5)**: Depends on all implementation complete
  - Final quality gates before commit

### User Story Dependencies

- **User Story 1 (P1)**: Depends on Foundational (T001, T002) - No dependencies on other stories
- **User Story 2 (P2)**: Depends on User Story 1 (T007) - Tests integration with fix
- **User Story 3 (P3)**: Independent - Can run in parallel with US1/US2

### Within Each User Story

- **US1**: Tests (T003-T006) → Implementation (T007) → Verification (T008, T009)
- **US2**: Test (T010) → Verification (T011, T012)
- **US3**: Verification only (T013-T015)

### Parallel Opportunities

- **Foundational**: T001 and T002 can run sequentially (same concern - preparing validator access)
- **US1 Tests**: T003, T004, T005 can run in parallel (different test cases, same file - write together)
- **US2 Tests**: T010 runs in same file as US1 tests (write together)
- **US3 Verification**: T013, T014 can run in parallel (different verification methods)
- **Quality**: T016, T017, T019 can run in parallel (different files/concerns)

---

## Parallel Example: User Story 1 Tests

```bash
# Write all US1 tests together in single edit (parallel conception):
Task T003: "should NOT error on valid imported action call"
Task T004: "should validate multiple imported actions"
Task T005: "should validate mix of imported actions and builtin operations"

# All three tests go in same file, can be written in single session
# Then run: pnpm test operation-validation.spec.ts (verifies all fail)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only) 🎯

1. Complete Phase 1: Foundational (T001, T002) - 5 minutes
2. Complete Phase 2: User Story 1 (T003-T009) - 20 minutes
3. **STOP and VALIDATE**: Run test suite, verify zero regressions
4. At this point: Core bug is fixed, imported actions work
5. Optional: Add US2/US3 for completeness

**Estimated Time**: 30-60 minutes for MVP (US1 only)

### Incremental Delivery

1. Foundational → Validator can access imported actions (5 min)
2. User Story 1 → Imported actions validate correctly (20 min) **[DEMO HERE - MVP COMPLETE]**
3. User Story 2 → Error detection quality verified (10 min)
4. User Story 3 → Import error location verified (10 min)
5. Code Quality → All quality gates pass (10 min)

**Total Time**: 55 minutes for complete feature

### Single Developer Strategy

**Recommended approach for this feature** (bug fix, not large feature):

1. Complete all phases sequentially (T001 → T020)
2. Test-first development (write failing tests, implement fix, verify passing)
3. No need for parallel team - small scope, single file modifications
4. Commit after Phase 2 (MVP) and again after Phase 5 (complete)

---

## Task Summary

- **Total Tasks**: 20
- **Foundational**: 2 tasks (T001-T002)
- **User Story 1**: 7 tasks (T003-T009) - Core bug fix
- **User Story 2**: 3 tasks (T010-T012) - Error detection quality
- **User Story 3**: 3 tasks (T013-T015) - Verification only
- **Code Quality**: 5 tasks (T016-T020) - Quality gates

**Files Modified**:
- `packages/language/src/eligian-scope-provider.ts` (1 line change - make method public)
- `packages/language/src/eligian-validator.ts` (1 import + 9 lines code)
- `packages/language/src/__tests__/operation-validation.spec.ts` (4 new tests)

**Test Coverage**:
- 4 new integration tests (US1: 3 tests, US2: 1 test)
- All existing 1,565+ tests must pass (regression check)
- Total: 1,569+ tests after feature complete

---

## Success Criteria Verification

From [spec.md](./spec.md):

- **SC-001**: Developers can use imported actions without false errors
  - ✅ **Verified by**: T008 (US1 tests passing)

- **SC-002**: 100% of valid imported action calls pass validation
  - ✅ **Verified by**: T004, T005 (multiple scenarios)

- **SC-003**: Validator distinguishes between imported actions and invalid operations
  - ✅ **Verified by**: T011 (US2 typo test)

- **SC-004**: Code completion suggests imported actions within 500ms
  - ✅ **Already working** (Feature 023 US4, no changes needed)

- **SC-005**: Validation errors at import statements for non-existent actions
  - ✅ **Verified by**: T013, T014 (US3 verification)

- **SC-006**: Existing operation validation tests pass without modification
  - ✅ **Verified by**: T009, T012 (full test suite regression checks)

---

## Notes

- **[P] tasks**: Different files or independent concerns (can run in parallel)
- **[Story] label**: Maps task to specific user story for traceability
- **Test-first**: All tests written before implementation (TDD approach)
- **Surgical fix**: Minimal code changes (1 line + 1 import + 9 lines)
- **No regressions**: All existing tests must pass (verified at T009, T012)
- **Performance**: <5ms overhead (verified at T018)
- **Commit points**: After T009 (MVP), after T020 (complete)

**Common Issues** (from quickstart.md):
- If tests fail after fix: Check code insertion location (line 490)
- If TypeScript errors: Verify T001 complete (method is public)
- If import resolution fails: Check test setup (may need multi-file infrastructure)
