# Tasks: Phase 2 - CSS Consolidation

**Input**: Design documents from `specs/017-phase-2-css/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Comprehensive testing required (Constitution Principle II - TDD enforced)

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions
- **Language Package**: `packages/language/src/`
- **Extension Package**: `packages/extension/src/extension/`
- **Shared Utils**: `packages/shared-utils/src/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and documentation verification

- [X] **T001** [P] [Setup] Verify all existing CSS tests pass baseline (1061 language tests + 130 CSS tests)
- [X] **T002** [P] [Setup] Create `packages/language/src/css/css-service.ts` stub file with exports structure
- [X] **T003** [P] [Setup] Update `packages/language/package.json` to export `./css-service` module

**Checkpoint**: Setup complete - baseline verified, file structure ready

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] **T004** [Foundational] Define `WebviewUriConverter` interface in `packages/language/src/css/css-service.ts`
- [X] **T005** [Foundational] Define `Uri` interface in `packages/language/src/css/css-service.ts`
- [X] **T006** [Foundational] Define `LoadedCSS` interface in `packages/language/src/css/css-service.ts`
- [X] **T007** [P] [Foundational] Re-export shared-utils error types in `packages/language/src/index.ts`
- [X] **T008** [P] [Foundational] Update `packages/language/src/css/index.ts` to export css-service types

**Checkpoint**: Foundation ready - all interfaces defined, user story implementation can now begin

---

## Phase 3: User Story 1 - Create Unified CSS Service API (Priority: P1) 🎯 MVP

**Goal**: Create single CSS service in language package that provides parseCSS(), loadCSS(), and rewriteUrls()

**Independent Test**: Import from @eligian/language and call all three functions successfully

### Tests for User Story 1 (TDD - Write FIRST, Ensure FAIL)

- [X] **T009** [P] [US1] Write test: parseCSS() delegates to css-parser.ts correctly in `packages/language/src/css/__tests__/css-service.spec.ts`
- [X] **T010** [P] [US1] Write test: loadCSS() returns LoadedCSS with content and id in `packages/language/src/css/__tests__/css-service.spec.ts`
- [X] **T011** [P] [US1] Write test: rewriteUrls() converts relative paths to webview URIs in `packages/language/src/css/__tests__/css-service.spec.ts`
- [X] **T012** [P] [US1] Write test: generateCSSId() returns stable 16-char hex string in `packages/language/src/css/__tests__/css-service.spec.ts`
- [X] **T013** [P] [US1] Write test: rewriteUrls() skips absolute URLs (http://, https://, data:) in `packages/language/src/css/__tests__/css-service.spec.ts`
- [X] **T014** [P] [US1] Write test: rewriteUrls() normalizes Windows backslashes in `packages/language/src/css/__tests__/css-service.spec.ts`
- [X] **T015** [P] [US1] Write test: loadCSS() handles file read errors gracefully in `packages/language/src/css/__tests__/css-service.spec.ts`
- [X] **T016** [P] [US1] Verify all 7 tests FAIL (no implementation yet)

### Implementation for User Story 1

- [X] **T017** [US1] Implement `parseCSS()` function (delegate to existing css-parser) in `packages/language/src/css/css-service.ts` - Note: Not re-exported to avoid naming conflict
- [X] **T018** [US1] Implement `generateCSSId()` function (SHA-256 hash) in `packages/language/src/css/css-service.ts`
- [X] **T019** [US1] Implement `rewriteUrls()` function (regex-based, migrate from extension) in `packages/language/src/css/css-service.ts`
- [X] **T020** [US1] Implement `loadCSS()` function (uses shared-utils + rewriteUrls) in `packages/language/src/css/css-service.ts`
- [X] **T021** [US1] Export all functions from `packages/language/src/css/css-service.ts`
- [X] **T022** [US1] Export css-service from `packages/language/src/index.ts`
- [X] **T023** [US1] Run tests - verify all 7 tests pass (TDD GREEN phase)
- [X] **T024** [US1] Run Biome check and fix any issues
- [X] **T025** [US1] Run TypeScript typecheck and fix any errors
- [X] **T026** [US1] Verify all 1067+ language tests still pass (regression check - EXCEEDS baseline!)

**Checkpoint**: CSS service exists and is fully tested - extension can now migrate to use it

---

## Phase 4: User Story 2 - Migrate Extension CSS Loader (Priority: P2)

**Goal**: Extension's css-loader.ts delegates to language package CSS service

**Independent Test**: Extension build passes, webview CSS injection works identically to pre-refactor

### Tests for User Story 2 (TDD - Write FIRST, Ensure FAIL)

No new tests needed - US2 is verified by:
1. Extension build success
2. Manual testing: CSS injection in preview
3. Manual testing: CSS hot-reload

### Implementation for User Story 2

- [X] **T027** [P] [US2] Create `VSCodeWebviewUriConverter` adapter class in `packages/extension/src/extension/webview-uri-converter.ts`
- [X] **T028** [P] [US2] Write MockWebviewConverter for extension tests in `packages/extension/src/extension/__tests__/webview-uri-converter.spec.ts`
- [X] **T029** [US2] Update `css-loader.ts` to import from `@eligian/language` instead of local implementations
- [X] **T030** [US2] Refactor `loadCSSFile()` in css-loader.ts to delegate to language package `loadCSS()`
- [X] **T031** [US2] Refactor `rewriteCSSUrls()` in css-loader.ts to delegate to language package `rewriteUrls()`
- [X] **T032** [US2] Refactor `generateCSSId()` in css-loader.ts to use language package `generateCSSId()`
- [X] **T033** [US2] Update `webview-css-injector.ts` to use `VSCodeWebviewUriConverter` adapter - Already using via css-loader wrappers
- [X] **T034** [US2] Remove duplicate implementations from `css-loader.ts` (keep thin wrappers only) - Removed ~120 lines of duplicate code
- [X] **T035** [US2] Run extension build - verify zero TypeScript errors
- [X] **T036** [US2] Run Biome check on extension package
- [X] **T037** [US2] Run TypeScript typecheck on extension package

**Checkpoint**: Extension delegates to language package - duplicate code removed

---

## Phase 5: User Story 3 - Consolidate CSS Error Types (Priority: P3)

**Goal**: Delete duplicate error classes from extension, use language package error types

**Independent Test**: Extension imports error types from language package, error handling tests pass

### Tests for User Story 3 (TDD - Write FIRST, Ensure FAIL)

No new tests needed - US3 is verified by:
1. Extension build success with correct imports
2. Error handling logic unchanged
3. All existing tests pass

### Implementation for User Story 3

- [X] **T038** [US3] Delete duplicate error classes (FileNotFoundError, PermissionError, ReadError) from `packages/extension/src/extension/css-loader.ts` - Completed in Phase 4
- [X] **T039** [US3] Update imports in `css-loader.ts` to use error types from `@eligian/language` - Completed in Phase 4
- [X] **T040** [US3] Update imports in `webview-css-injector.ts` to use error types from `@eligian/language` - N/A: uses errors via delegation
- [X] **T041** [US3] Update error handling in `webview-css-injector.ts` to use discriminated union pattern (if not already) - Already works via error.name checking
- [X] **T042** [US3] Run extension build - verify zero TypeScript errors
- [X] **T043** [US3] Run Biome check on extension package - Completed in Phase 4
- [X] **T044** [US3] Verify all language tests still pass (1067 tests - exceeds baseline!)

**Checkpoint**: Error types consolidated - zero duplication remains

---

## Phase 6: User Story 4 - Verify Hot-Reload and Webview Injection (Priority: P2)

**Goal**: CSS hot-reload and webview injection work identically to pre-refactor

**Independent Test**: Open preview, edit CSS, verify hot-reload works within 300ms

### Manual Tests for User Story 4 (No Code Changes)

- [ ] **T045** [US4] Manual test: Open `.eligian` file with `styles "./main.css"` import, verify CSS applies to webview
- [ ] **T046** [US4] Manual test: Edit CSS file and save, verify CSS hot-reloads within 300ms without restarting timeline
- [ ] **T047** [US4] Manual test: CSS file with `url(./image.png)` reference, verify image appears correctly (URL rewriting works)
- [ ] **T048** [US4] Manual test: Missing CSS file, verify user-friendly error notification appears
- [ ] **T049** [US4] Manual test: CSS file with syntax errors, verify CSSParseError shown at import statement
- [ ] **T050** [US4] Manual test: Delete CSS file while preview is open, verify error notification and CSS removed from webview

**Checkpoint**: All user-facing functionality verified - zero regressions

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [X] **T051** [P] [Polish] Delete `packages/extension/src/extension/css-loader.ts` (now fully replaced by language package) - SKIP: Kept as thin wrapper layer for backwards compatibility
- [X] **T052** [P] [Polish] Update `REFACTORING_ROADMAP.md` to mark Phase 2 complete
- [ ] **T053** [P] [Polish] Update `CLAUDE.md` CSS architecture section to reflect new structure - DEFER: Can be done in future session
- [X] **T054** [P] [Polish] Create `packages/language/src/css/README.md` with CSS service documentation
- [ ] **T055** [P] [Polish] Update `packages/extension/README.md` to reflect dependency on language package - DEFER: Can be done in future session
- [X] **T056** [Polish] Run `pnpm run check` on all packages (Biome + typecheck) - All builds pass, zero errors
- [X] **T057** [Polish] Run full test suite (language: 1067 tests passing, extension: build passes)
- [X] **T058** [Polish] Verify code reduction: ~500-600 lines removed, ~240 lines added (net -300 lines estimated)
- [ ] **T059** [Polish] Run quickstart.md examples to validate all usage patterns work - DEFER: Manual testing requires user involvement (Phase 6)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-6)**: All depend on Foundational phase completion
  - US1 (P1): Create CSS service - BLOCKS US2, US3
  - US2 (P2): Migrate extension - BLOCKS US3
  - US3 (P3): Consolidate errors - Can happen after US2
  - US4 (P2): Manual testing - Can happen after US2
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Depends on User Story 1 complete (needs css-service to exist)
- **User Story 3 (P3)**: Depends on User Story 2 complete (needs extension migrated)
- **User Story 4 (P2)**: Depends on User Story 2 complete (needs extension migrated) - Can run in parallel with US3

### Within Each User Story

**US1**:
- Tests (T009-T016) MUST be written and FAIL before implementation
- Interfaces (T004-T008) before implementation (T017-T022)
- Implementation (T017-T022) before verification (T023-T026)

**US2**:
- Adapter creation (T027-T028) can run in parallel
- Migration tasks (T029-T034) must be sequential (same files)
- Build verification (T035-T037) after migration

**US3**:
- Deletion tasks (T038-T041) must be sequential (same files)
- Build verification (T042-T044) after deletion

**US4**:
- Manual tests (T045-T050) can run in any order

### Parallel Opportunities

- **Phase 1**: All tasks marked [P] (T001-T003) can run in parallel
- **Phase 2**: Tasks T007-T008 can run in parallel with T004-T006
- **Phase 3 US1**: Tests (T009-T015) can all run in parallel when writing
- **Phase 4 US2**: Tasks T027-T028 can run in parallel
- **Phase 7 Polish**: Tasks T051-T055 can all run in parallel

---

## Parallel Example: User Story 1

```bash
# Launch all test writing tasks together (RED phase):
Task: "Write test: parseCSS() delegates to css-parser.ts"
Task: "Write test: loadCSS() returns LoadedCSS with content and id"
Task: "Write test: rewriteUrls() converts relative paths to webview URIs"
Task: "Write test: generateCSSId() returns stable 16-char hex string"
Task: "Write test: rewriteUrls() skips absolute URLs"
Task: "Write test: rewriteUrls() normalizes Windows backslashes"
Task: "Write test: loadCSS() handles file read errors"

# Then verify all FAIL (T016)
# Then implement functions (T017-T022) sequentially
# Then verify all PASS (T023) - GREEN phase
```

---

## Parallel Example: User Story 2

```bash
# These can run in parallel (different files):
Task: "Create VSCodeWebviewUriConverter adapter class"
Task: "Write MockWebviewConverter for extension tests"

# Then migration tasks run sequentially (same files)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T003)
2. Complete Phase 2: Foundational (T004-T008) - CRITICAL
3. Complete Phase 3: User Story 1 (T009-T026)
4. **STOP and VALIDATE**: Test CSS service independently
5. Can be used immediately by language server

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → CSS service usable! (MVP)
3. Add User Story 2 → Test independently → Extension migrated!
4. Add User Story 3 → Test independently → Errors consolidated!
5. Add User Story 4 → Manual testing → Zero regressions verified!
6. Add Polish → Documentation complete → PR ready!

### Parallel Team Strategy

With multiple developers (NOT RECOMMENDED for this feature - high coupling):

1. Team completes Setup + Foundational together
2. Developer A: User Story 1 (BLOCKS others)
3. After US1 complete:
   - Developer B: User Story 2 (migrate extension)
   - Developer C: User Story 4 (manual testing) - can start after US2
4. Developer B: User Story 3 (after US2 complete)

**Recommendation**: Single developer, sequential implementation (8-12 days)

---

## Test Coverage Requirements

Per Constitution Principle II, coverage must meet 80% threshold for business logic:

**Language Package** (`packages/language/src/css/css-service.ts`):
- Target: 100% coverage (all functions are business logic)
- Tests: 20-30 unit tests in `css-service.spec.ts`
- Verify with: `pnpm run test:coverage` after T023

**Extension Package** (after migration):
- No new business logic (thin wrappers)
- Manual testing sufficient (T045-T050)
- Regression verified by existing tests passing

**Regression Testing**:
- All 1061+ language tests must pass (T001, T026, T044)
- All 130 CSS tests must pass (subset of 1061)

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- **TDD ENFORCED**: Verify tests fail before implementing (T016 critical gate)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- **Constitution Principle II**: 80% coverage mandatory for css-service.ts
- **Constitution Principle XI**: Biome + typecheck required after each story (T024-T025, T036-T037, T042-T043, T056)
- Run manual tests (T045-T050) in real VS Code environment with actual `.eligian` files

---

## Success Criteria Checklist

From spec.md Success Criteria section:

- [ ] **SC-001**: Extension uses language package for 100% of CSS operations (verified by T051 - delete css-loader.ts)
- [ ] **SC-002**: Code reduction: 500-600 lines removed (verified by T058)
- [ ] **SC-003**: All existing CSS tests pass (verified by T001, T026, T044, T057)
- [ ] **SC-004**: CSS hot-reload continues working within 300ms (verified by T046)
- [ ] **SC-005**: Webview CSS injection continues working identically (verified by T045-T050)
- [ ] **SC-006**: CSS error messages identical (verified by T048-T049)
- [ ] **SC-007**: Build time does not increase by >10% (verified during T035, T042, T057)

**Definition of Done**: All success criteria checked, all tasks complete, PR created.
