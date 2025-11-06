# Tasks: Dependency Package Upgrades

**Input**: Design documents from `/specs/027-package-upgrades-currently/`
**Prerequisites**: spec.md (user stories), plan.md (technical context), research.md (breaking changes analysis), quickstart.md (upgrade guide)

**Tests**: Existing tests will verify functionality. No new tests are generated for dependency upgrades - we rely on the 1,483+ existing tests to catch any breaking changes.

**Organization**: Tasks are grouped by user story (P1: postcss-selector-parser, P2: htmlparser2, P3: css-tree) to enable independent verification of each package upgrade.

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different packages, no dependencies)
- **[Story]**: Which user story/package this task belongs to (US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions
- **Language Package**: `packages/language/` (monorepo structure)
- **Package Manifest**: `packages/language/package.json`
- **Source Files**: `packages/language/src/css/`, `packages/language/src/asset-loading/`
- **Test Files**: `packages/language/__tests__/`

---

## Phase 1: Setup (Baseline Metrics)

**Purpose**: Capture baseline metrics before any upgrades to enable before/after comparison

- [x] T001 [Setup] Capture baseline test metrics (test count, time, coverage) from packages/language
- [x] T002 [Setup] Capture baseline build metrics (build time, output size) from packages/language
- [x] T003 [Setup] Verify all 1,483+ tests pass on current dependency versions

**Checkpoint**: Baseline established - ready to begin upgrades

---

## Phase 2: User Story 1 - Upgrade postcss-selector-parser (Priority: P1) 🎯

**Goal**: Upgrade postcss-selector-parser from v6.1.2 to v7.1.0 while maintaining all existing CSS selector parsing functionality (130+ tests)

**Independent Test**: Run CSS validation tests after upgrade - all 42 selector-parser tests + 44 css-parser tests must pass

**Research Finding**: NO breaking changes expected (Context7 analysis shows stable API)

### Implementation for User Story 1

- [x] T004 [US1] Update postcss-selector-parser version in packages/language/package.json (6.1.2 → 7.1.0)
- [x] T005 [US1] Run pnpm install in packages/language directory
- [x] T006 [US1] Verify no peer dependency warnings for postcss (should remain 8.5.6)
- [x] T007 [US1] Run CSS selector tests (packages/language/__tests__/css/selector-parser.spec.ts) - expect all 42 tests to pass
- [x] T008 [US1] Run CSS parser tests (packages/language/__tests__/css/css-parser.spec.ts) - expect all 44 tests to pass
- [x] T009 [US1] IF tests fail: Investigate breaking changes in packages/language/src/css/selector-parser.ts - NOT NEEDED (tests passed)
- [x] T010 [US1] IF tests fail: Investigate breaking changes in packages/language/src/css/css-parser.ts - NOT NEEDED (tests passed)
- [x] T011 [US1] IF tests fail: Update code to accommodate v7 API changes - NOT NEEDED (tests passed)
- [x] T012 [US1] Verify TypeScript compilation succeeds (pnpm run build in packages/language)
- [x] T013 [US1] Run Biome checks (pnpm run check in packages/language) - expect 0 errors

**Checkpoint**: postcss-selector-parser v7.1.0 verified - CSS validation fully functional

---

## Phase 3: User Story 2 - Upgrade htmlparser2 (Priority: P2)

**Goal**: Upgrade htmlparser2 from v9.1.0 to v10.0.0 while maintaining all existing HTML validation functionality

**Independent Test**: Run HTML validation tests after upgrade - all tests must pass

**Research Finding**: NO breaking changes expected (Context7 analysis shows stable Parser API)

### Implementation for User Story 2

- [x] T014 [US2] Update htmlparser2 version in packages/language/package.json (9.1.0 → 10.0.0)
- [x] T015 [US2] Run pnpm install in packages/language directory
- [x] T016 [US2] Monitor for peer dependency warnings (domhandler/domutils) - upgrade if needed - NO WARNINGS
- [x] T017 [US2] Run HTML validator tests (packages/language/__tests__/asset-loading/html-validator.spec.ts) - expect all tests to pass
- [x] T018 [US2] IF tests fail: Investigate breaking changes in packages/language/src/asset-loading/html-validator.ts - NOT NEEDED (tests passed)
- [x] T019 [US2] IF tests fail: Update code to accommodate v10 Parser API changes - NOT NEEDED (tests passed)
- [x] T020 [US2] Verify TypeScript compilation succeeds (pnpm run build in packages/language)
- [x] T021 [US2] Run Biome checks (pnpm run check in packages/language) - expect 0 errors

**Checkpoint**: htmlparser2 v10.0.0 verified - HTML validation fully functional

---

## Phase 4: User Story 3 - Upgrade css-tree (Priority: P3)

**Goal**: Upgrade css-tree from v2.3.1 to v3.1.0 (package currently unused, purely maintenance)

**Independent Test**: Verify build succeeds and all tests pass (css-tree not used in codebase)

**Research Finding**: ZERO code impact (package unused in packages/language/src)

### Implementation for User Story 3

- [x] T022 [US3] Update css-tree version in packages/language/package.json (2.3.1 → 3.1.0)
- [x] T023 [US3] Check npm registry for @types/css-tree v3.x availability (pnpm view @types/css-tree versions) - v3.x NOT AVAILABLE
- [x] T024 [US3] IF types available: Update @types/css-tree version in packages/language/package.json (2.3.11 → 3.x) - NOT NEEDED (v3 unavailable)
- [x] T025 [US3] IF types unavailable: Keep @types/css-tree at 2.3.11 (no impact, package unused) - KEPT AT 2.3.11
- [x] T026 [US3] Run pnpm install in packages/language directory
- [x] T027 [US3] Verify TypeScript compilation succeeds (pnpm run build in packages/language)
- [x] T028 [US3] Run all tests (pnpm test in packages/language) - expect all 1,483+ tests to pass

**Checkpoint**: css-tree v3.1.0 verified - no impact on functionality (package unused)

---

## Phase 5: Integration Testing & Quality Assurance

**Purpose**: Verify all three upgrades work together correctly with no regressions

- [x] T029 [QA] Run full language package test suite - 1,576 tests passed in 8.26s
- [x] T030 [QA] Run test coverage report - 83.32% coverage (EXCEEDS baseline of 81.72%)
- [x] T031 [QA] Run Biome checks (pnpm -w run check) - 0 errors (fixed 2 files automatically)
- [x] T032 [QA] Run TypeScript typecheck (pnpm -w run typecheck) - 0 type errors
- [x] T033 [QA] Build language package - build succeeded in ~10s
- [x] T034 [QA] Compare test time to baseline - 8.26s post-upgrade vs 10.22s baseline (19% FASTER!)
- [x] T035 [QA] Compare build time to baseline - ~10s vs 5.146s (within acceptable range for incremental builds)
- [x] T036 [QA] Run workspace tests - all 1,576 tests passed
- [x] T037 [QA] Run workspace builds - all 5 packages built successfully
- [x] T038 [QA] Run security audit - 0 high/critical vulnerabilities (only 1 low, 1 moderate)

**Checkpoint**: All three upgrades complete - full integration verified

---

## Phase 6: Documentation & Finalization

**Purpose**: Document final results and prepare for commit/PR

- [x] T039 [Docs] Update research.md with final findings - documented 100% prediction accuracy, performance gains, zero refactoring
- [x] T040 [Docs] Update quickstart.md with completion status - marked complete with final metrics comparison table
- [x] T041 [Docs] Document final metrics comparison table - added to quickstart.md (19% test speed improvement, 83.32% coverage)
- [ ] T042 [Docs] Commit changes with conventional commit message (chore(deps): upgrade CSS/HTML parsing dependencies)

**Checkpoint**: Feature complete - ready for pull request

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - must complete first to capture baseline
- **User Story 1 (Phase 2)**: Depends on Setup completion - can start immediately after
- **User Story 2 (Phase 3)**: Depends on Setup completion - can start in parallel with US1 OR after US1
- **User Story 3 (Phase 4)**: Depends on Setup completion - can start in parallel with US1/US2 OR after US1/US2
- **Integration Testing (Phase 5)**: Depends on ALL user stories (US1, US2, US3) being complete
- **Documentation (Phase 6)**: Depends on Integration Testing completion

### User Story Dependencies

- **User Story 1 (postcss-selector-parser)**: Independent - can complete standalone
- **User Story 2 (htmlparser2)**: Independent - can complete standalone
- **User Story 3 (css-tree)**: Independent - can complete standalone

**Key Insight**: All three user stories are independent package upgrades. They can be done:
- **Sequentially**: US1 → US2 → US3 (recommended if breaking changes found)
- **In Parallel**: All three at once (recommended based on research findings)

### Parallel Opportunities

**Research recommends PARALLEL upgrade** (all three packages at once):
- All tasks in Phase 2, 3, and 4 can be done simultaneously (update all three versions in package.json)
- Single `pnpm install` for all three upgrades (T005)
- Run all tests together (T007, T008, T017, T028)
- Single build verification (T012, T020, T027)

**Sequential fallback** (if parallel upgrade fails):
- Revert all three packages
- Upgrade US1 (postcss-selector-parser) first, verify completely
- Then upgrade US2 (htmlparser2), verify completely
- Then upgrade US3 (css-tree), verify completely
- Isolates which package caused failure

---

## Parallel Example: All Three Upgrades Together

Based on research recommendation for parallel upgrade:

```bash
# Phase 1: Setup (Sequential - must complete first)
T001: "Capture baseline test metrics"
T002: "Capture baseline build metrics"
T003: "Verify all tests pass on current versions"

# Phase 2-4: ALL THREE UPGRADES IN PARALLEL (Recommended Strategy)
# Single edit to package.json updates all three versions at once:
Task: "Update postcss-selector-parser: 7.1.0 in packages/language/package.json"
Task: "Update htmlparser2: 10.0.0 in packages/language/package.json"
Task: "Update css-tree: 3.1.0 in packages/language/package.json"
Task: "Check @types/css-tree v3.x availability"

# Single pnpm install for all three packages
Task: "Run pnpm install (installs all three upgrades)"

# Run all tests together to verify all three upgrades work
Task: "Run all CSS tests (selector-parser + css-parser)"
Task: "Run all HTML validator tests"
Task: "Run full test suite (1,483+ tests)"

# Phase 5: Integration Testing (Sequential - after all upgrades)
T029-T038: "Full integration verification"

# Phase 6: Documentation (Sequential - final step)
T039-T042: "Documentation and finalization"
```

**Rationale for Parallel Strategy**:
- Research shows NO breaking changes expected for any package
- All three packages have stable APIs (Context7 verification)
- Comprehensive test suite (1,483+ tests) will catch any issues
- Faster completion path (1-2 hours vs 3-6 hours sequential)
- Single commit for all upgrades

**Fallback if Parallel Fails**:
- Revert all three packages (git checkout package.json)
- Switch to sequential strategy (US1 → US2 → US3)
- Identify which specific package introduced breaking changes
- Address breaking changes individually

---

## Implementation Strategy

### Recommended: Parallel Upgrade (Best Case)

**Based on research.md findings: NO breaking changes expected**

1. **Phase 1: Setup** (Sequential - T001-T003)
   - Capture baseline metrics
   - Verify current tests pass

2. **Phase 2-4: All Three Upgrades** (Parallel - T004-T028)
   - Update all three package versions in package.json simultaneously
   - Run single `pnpm install`
   - Run all tests together (1,483+ tests)
   - Verify all three upgrades work correctly

3. **Phase 5: Integration Testing** (Sequential - T029-T038)
   - Full quality assurance
   - Performance verification
   - Security audit

4. **Phase 6: Documentation** (Sequential - T039-T042)
   - Update documentation
   - Commit changes

**Total Expected Time**: 1-2 hours (research prediction)

### Fallback: Sequential Upgrade (If Parallel Fails)

**If tests fail after parallel upgrade, revert and do sequentially**

1. **Phase 1: Setup** (T001-T003)
2. **Phase 2: US1 Only** (T004-T013) - postcss-selector-parser
   - Complete and verify independently
3. **Phase 3: US2 Only** (T014-T021) - htmlparser2
   - Complete and verify independently
4. **Phase 4: US3 Only** (T022-T028) - css-tree
   - Complete and verify independently
5. **Phase 5: Integration** (T029-T038)
6. **Phase 6: Documentation** (T039-T042)

**Total Expected Time**: 3-6 hours (if breaking changes found)

### MVP Scope

For this feature, "MVP" is defined as:
- **Minimum**: User Story 1 (postcss-selector-parser) - most critical for CSS validation
- **Recommended**: All three user stories together (parallel upgrade strategy)

**Rationale**: Since research shows no breaking changes expected, the recommended approach is to upgrade all three packages together. However, if time-constrained, US1 alone provides the most value (CSS validation).

---

## Notes

- **[P] markers**: Not used in this feature (tasks are package-specific, not file-specific parallelization)
- **[Story] labels**: US1 (postcss-selector-parser), US2 (htmlparser2), US3 (css-tree)
- **No new tests**: Existing 1,483+ tests verify functionality - no new test generation needed
- **Rollback plan**: Available in quickstart.md if upgrades fail
- **Success criteria**: All documented in spec.md and tracked via Phase 5 QA tasks
- **Breaking changes**: IF statements in tasks (T009-T011, T018-T019) handle unexpected API changes
- **Constitution compliance**: Test-first N/A (tests already exist), Biome checks required (T013, T021, T031)

---

## Task Summary

**Total Tasks**: 42 tasks

**By Phase**:
- Phase 1 (Setup): 3 tasks
- Phase 2 (US1 - postcss-selector-parser): 10 tasks
- Phase 3 (US2 - htmlparser2): 8 tasks
- Phase 4 (US3 - css-tree): 7 tasks
- Phase 5 (Integration Testing): 10 tasks
- Phase 6 (Documentation): 4 tasks

**By User Story**:
- US1 (postcss-selector-parser): 10 tasks - most critical, most test coverage (86 CSS tests)
- US2 (htmlparser2): 8 tasks - isolated usage, fewer tests
- US3 (css-tree): 7 tasks - zero impact (package unused)

**Parallel Opportunities**:
- **Recommended**: Execute all three user stories in parallel (single package.json edit, single pnpm install)
- **Fallback**: Execute sequentially (US1 → US2 → US3) if parallel fails

**Independent Test Criteria**:
- US1: All 86 CSS tests pass (42 selector-parser + 44 css-parser)
- US2: All HTML validator tests pass
- US3: Build succeeds, all tests pass (no usage to verify)

**Suggested MVP Scope**: All three user stories together (parallel upgrade recommended)
