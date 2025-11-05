# Tasks: Import Resolution Failures in Multi-File Test Scenarios

**Input**: Design documents from `/specs/026-investigation-and-fix/`
**Prerequisites**: plan.md (complete), spec.md (complete), research.md (complete), quickstart.md (complete)

**Tests**: Not applicable - existing tests validate the fix (3 skipped tests will be un-skipped after fix)

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions
- Test infrastructure only - no new source files
- Changes confined to: `packages/language/src/__tests__/`
- Documentation in: `specs/` directory

---

## Phase 1: Setup (No setup needed - existing project)

**Purpose**: Project already initialized, no setup tasks required for this investigation/fix.

---

## Phase 2: Foundational (No foundational tasks)

**Purpose**: This is a test infrastructure fix, not a feature implementation. No foundational work required.

**⚠️ Note**: This phase is intentionally empty - skip directly to user stories.

---

## Phase 3: User Story 1 - Root Cause Analysis (Priority: P1) 🎯 Investigation Phase

**Goal**: Identify the exact reason why `setupDocuments()` fails to resolve imported actions while `createLibraryDocument()` succeeds.

**Independent Test**: Root cause is identified and documented with specific evidence (code paths, workspace state comparisons, timing analysis).

### Investigation Tasks for User Story 1

- [ ] T001 [US1] Create minimal reproduction case using `createLibraryDocument()` in `packages/language/src/__tests__/debug-import-resolution.spec.ts` - verify it works (library file with `fadeIn`, main file imports and calls it)

- [ ] T002 [US1] Create identical test case using `setupDocuments()` in same file - verify it fails with "Unknown action: fadeIn" error

- [ ] T003 [US1] Add debug logging to scope provider's `getImportedActions()` method in `packages/language/src/eligian-scope-provider.ts` - trace when it's called, what URIs it resolves, and whether `documents.getDocument(resolvedUri)` returns document

- [ ] T004 [US1] Add debug logging to `setupDocuments()` in `packages/language/src/__tests__/test-helpers.ts` - trace document creation order, workspace registration timing, and build phase execution

- [ ] T005 [US1] Run reproduction tests with logging enabled - capture output showing exact failure point (when `getImportedActions()` is called, library document is missing from workspace or not ready)

- [ ] T006 [US1] Analyze Langium's `parseHelper()` source code - verify when documents are added to workspace (immediately after parsing or after build?)

- [ ] T007 [US1] Compare workspace state before/after `DocumentBuilder.build()` calls in both helpers - check if documents are registered at same point

- [ ] T008 [US1] Document findings in `specs/026-investigation-and-fix/research.md` - update with actual root cause, code paths, timing diagrams, and workspace state evidence

- [ ] T009 [US1] Update research.md with confirmed hypothesis - explain WHY `setupDocuments()` fails and WHY `createLibraryDocument()` works

- [ ] T010 [US1] Remove debug logging from all files - clean up temporary investigation code

**Checkpoint**: Root cause is identified and documented. Ready to implement fix.

---

## Phase 4: User Story 2 - Fix Implementation (Priority: P2) 🎯 Fix Phase

**Goal**: Fix `setupDocuments()` to correctly resolve imported actions across files, enabling 3 skipped tests to pass.

**Independent Test**: All 3 currently-skipped tests in `operation-validation.spec.ts` pass without modification after the fix is applied.

### Implementation Tasks for User Story 2

- [ ] T011 [US2] Based on root cause findings, implement fix in `packages/language/src/__tests__/test-helpers.ts` - modify `setupDocuments()` function (likely: ensure library documents are built before dependent documents, or ensure proper workspace registration timing)

- [ ] T012 [US2] Add regression test in `packages/language/src/__tests__/multi-file-helpers/setup-documents.spec.ts` - verify `setupDocuments()` now resolves imports correctly with minimal test case

- [ ] T013 [US2] Un-skip first test in `packages/language/src/__tests__/operation-validation.spec.ts` (line 194: "should NOT error on valid imported action call") - run test, verify it passes

- [ ] T014 [US2] Un-skip second test in `packages/language/src/__tests__/operation-validation.spec.ts` (line 235: "should validate multiple imported actions") - run test, verify it passes

- [ ] T015 [US2] Un-skip third test in `packages/language/src/__tests__/operation-validation.spec.ts` (line 271: "should validate mix of imported actions and builtin operations") - run test, verify it passes

- [ ] T016 [US2] Run full test suite regression check - execute `pnpm test` in `packages/language` directory, verify all 1483+ tests still pass with zero failures

- [ ] T017 [US2] Run Biome code quality checks - execute `pnpm run check` from project root, fix any formatting/linting issues in modified files

- [ ] T018 [US2] Run TypeScript type checking - execute `pnpm run typecheck` from project root, fix any type errors in modified files

- [ ] T019 [US2] Test complex multi-file scenario - create new test in `packages/language/src/__tests__/multi-file-helpers/setup-documents.spec.ts` with multiple libraries and transitive imports, verify `setupDocuments()` handles it correctly

**Checkpoint**: `setupDocuments()` is fixed. All 3 skipped tests pass. Full test suite passes with zero regressions.

---

## Phase 5: User Story 3 - Test Environment Documentation (Priority: P3) 🎯 Documentation Phase

**Goal**: Create comprehensive test environment guide so future developers can write multi-file integration tests without encountering the same issues.

**Independent Test**: A developer unfamiliar with the test infrastructure can read the documentation and successfully write a multi-file integration test without requiring assistance.

### Documentation Tasks for User Story 3

- [ ] T020 [P] [US3] Copy `specs/026-investigation-and-fix/quickstart.md` to `specs/test-environment-guide.md` in project root - make it accessible for all developers

- [ ] T021 [US3] Update JSDoc comment for `createTestContext()` in `packages/language/src/__tests__/test-helpers.ts` - add link to `specs/test-environment-guide.md#createtestcontext` in @see tag

- [ ] T022 [US3] Update JSDoc comment for `createTestContextWithMockFS()` in `packages/language/src/__tests__/test-helpers.ts` - add link to `specs/test-environment-guide.md#createtestcontextwithmockfs` in @see tag

- [ ] T023 [US3] Update JSDoc comment for `createLibraryDocument()` in `packages/language/src/__tests__/test-helpers.ts` - add link to `specs/test-environment-guide.md#createlibrarydocument` in @see tag

- [ ] T024 [US3] Update JSDoc comment for `setupDocuments()` in `packages/language/src/__tests__/test-helpers.ts` - add link to `specs/test-environment-guide.md#setupdocuments` in @see tag, include note about fix from Feature 026

- [ ] T025 [US3] Update `specs/test-environment-guide.md` with actual root cause findings - replace hypothesis sections with confirmed explanation from research.md

- [ ] T026 [US3] Update troubleshooting section in `specs/test-environment-guide.md` - add specific debugging steps based on actual investigation findings

- [ ] T027 [US3] Add "What We Fixed in Feature 026" section to `specs/test-environment-guide.md` - document the specific issue, root cause, and solution for historical reference

- [ ] T028 [US3] Update CLAUDE.md if needed - add reference to test environment guide in "Testing Strategy" section (only if substantial changes warrant it)

**Checkpoint**: Comprehensive documentation is complete and linked from test helpers. Future developers have clear guidance.

---

## Phase 6: Polish & Cleanup

**Purpose**: Final cleanup and validation

- [ ] T029 [P] Remove `packages/language/src/__tests__/debug-import-resolution.spec.ts` - delete temporary reproduction test file created during investigation

- [ ] T030 Run final full test suite validation - execute `pnpm -w run test` from project root, verify all packages pass with zero failures

- [ ] T031 Run final Biome check - execute `pnpm run check` from project root, verify zero linting/formatting issues

- [ ] T032 Run final TypeScript check - execute `pnpm run typecheck` from project root, verify zero type errors

- [ ] T033 [P] Update `specs/026-investigation-and-fix/research.md` final status - mark as "COMPLETE" with summary of findings

- [ ] T034 [P] Update `specs/026-investigation-and-fix/plan.md` final status - mark Constitution Check items as validated post-implementation

**Checkpoint**: Feature complete. Ready for code review and PR.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Intentionally empty - no setup needed
- **Foundational (Phase 2)**: Intentionally empty - no foundational work needed
- **User Story 1 (Phase 3)**: Can start immediately (investigation)
- **User Story 2 (Phase 4)**: DEPENDS on User Story 1 completion (must know root cause before implementing fix)
- **User Story 3 (Phase 5)**: DEPENDS on User Story 2 completion (documentation needs fix details)
- **Polish (Phase 6)**: DEPENDS on User Story 3 completion

### User Story Dependencies

- **User Story 1 (P1 - Investigation)**: No dependencies - can start immediately
- **User Story 2 (P2 - Fix)**: STRICT dependency on US1 - cannot implement fix without understanding root cause
- **User Story 3 (P3 - Documentation)**: STRICT dependency on US2 - documentation needs actual fix details

### Within Each User Story

**User Story 1 (Investigation)**:
- T001 before T002 (need working case before comparing to failing case)
- T003, T004 can run in parallel (different files)
- T005 depends on T001-T004 (need logging in place before running tests)
- T006, T007 can run in parallel (different investigations)
- T008 depends on T005-T007 (document findings after analysis)
- T009 depends on T008 (update with confirmed hypothesis)
- T010 depends on T009 (cleanup after documentation)

**User Story 2 (Fix)**:
- T011 is first (implement fix)
- T012 depends on T011 (test the fix)
- T013-T015 can run sequentially (un-skipping tests one by one to isolate failures if any)
- T016 depends on T013-T015 (full regression after un-skipping)
- T017, T018 can run in parallel (different checks)
- T019 depends on T011 (test complex scenario with fix in place)

**User Story 3 (Documentation)**:
- T020 is first (copy quickstart to root)
- T021-T024 can all run in parallel (updating different JSDoc comments - independent edits)
- T025-T027 must be sequential (editing same file - test-environment-guide.md)
- T028 is independent (can run in parallel with T025-T027 if needed)

**Polish**:
- T029 can be anytime after US1 complete
- T030-T032 can run in parallel (different validation commands)
- T033, T034 can run in parallel (updating different markdown files)

### Parallel Opportunities

**Limited parallelization in this feature** (investigation/fix is inherently sequential):

- Phase 3 (US1): T003 + T004 in parallel, T006 + T007 in parallel
- Phase 4 (US2): T017 + T018 in parallel
- Phase 5 (US3): T021-T024 in parallel (4 JSDoc updates), T033 + T034 in parallel
- Phase 6 (Polish): T030-T032 in parallel, T033 + T034 in parallel

**Cannot parallelize**:
- User stories themselves (US2 depends on US1, US3 depends on US2)
- Investigation tasks (must trace execution sequentially)
- Fix tasks (single file modification)

---

## Parallel Example: User Story 3 (Documentation)

```bash
# Launch JSDoc updates in parallel (all different function comments):
Task: "Update JSDoc for createTestContext() in test-helpers.ts"
Task: "Update JSDoc for createTestContextWithMockFS() in test-helpers.ts"
Task: "Update JSDoc for createLibraryDocument() in test-helpers.ts"
Task: "Update JSDoc for setupDocuments() in test-helpers.ts"

# Launch final validations in parallel:
Task: "Run full test suite validation (pnpm -w run test)"
Task: "Run Biome check (pnpm run check)"
Task: "Run TypeScript check (pnpm run typecheck)"
```

---

## Implementation Strategy

### Sequential Delivery (Required for this feature)

1. **Complete Phase 3: User Story 1 (Investigation)**
   - CRITICAL: Must identify root cause before any fix attempt
   - STOP and VALIDATE: Document findings in research.md
   - Output: Confirmed understanding of why `setupDocuments()` fails

2. **Complete Phase 4: User Story 2 (Fix)**
   - Implement fix based on US1 findings
   - STOP and VALIDATE: 3 skipped tests now pass, full test suite passes
   - Output: Working `setupDocuments()` helper

3. **Complete Phase 5: User Story 3 (Documentation)**
   - Create comprehensive guide with actual findings
   - STOP and VALIDATE: Developer can write multi-file test following guide
   - Output: Test environment guide accessible to all developers

4. **Complete Phase 6: Polish**
   - Final cleanup and validation
   - Output: Feature complete, ready for PR

### Why No Parallel Delivery

This feature is **inherently sequential** by design:
- Cannot fix without understanding (US2 depends on US1)
- Cannot document without fix details (US3 depends on US2)
- Investigation tasks must run sequentially to trace execution flow

### MVP Scope

**MVP = User Story 1 + User Story 2** (Investigation + Fix)

Rationale:
- US1 identifies the problem (investigation)
- US2 solves the problem (fix)
- US3 is valuable but not blocking (documentation can be added later)

If time-constrained, deliver US1 + US2, defer US3 to follow-up PR.

---

## Notes

- No [P] markers on most tasks (investigation and fix are sequential)
- [P] markers only on truly independent tasks (JSDoc updates, validation commands)
- Each user story has clear [Story] labels (US1, US2, US3)
- User Story 1 is pure investigation (no code changes to production or test helpers)
- User Story 2 is the fix (minimal changes to test-helpers.ts)
- User Story 3 is documentation (no code changes)
- Avoid: rushing to fix before understanding root cause (US2 depends on US1)
- Verify: 3 skipped tests pass, full test suite regression clean
- Commit after each user story completion (per Constitution Principle XXIII)
- Clean workspace after investigation (remove debug logging, temp files)

**Total Tasks**: 34
- **Setup**: 0 (no setup needed)
- **Foundational**: 0 (no foundational work needed)
- **US1 (Investigation)**: 10 tasks
- **US2 (Fix)**: 9 tasks
- **US3 (Documentation)**: 9 tasks
- **Polish**: 6 tasks

**Parallel Opportunities**: Limited (11 tasks can run in parallel within their phases)

**Suggested MVP**: US1 + US2 (19 tasks) - delivers working fix with zero regressions
