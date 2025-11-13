# Tasks: Code Duplication Refactoring

**Input**: Design documents from `/specs/031-code-duplication-refactor/`
**Prerequisites**: plan.md ✅, spec.md ✅, quickstart.md ✅

**Tests**: This refactoring feature uses existing 1,483+ tests to verify behavior preservation. New unit tests will be added for extracted utilities.

**Organization**: Tasks are grouped by user story (refactoring phase) to enable independent implementation and testing of each priority tier.

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1-US7)
- Include exact file paths in descriptions

## Path Conventions
- Monorepo structure: `packages/language/src/`, `packages/shared-utils/src/`
- Test location: `packages/language/src/utils/__tests__/`
- Existing tests: `packages/language/src/__tests__/` (must pass without modification)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prepare workspace and verify baseline

- [ ] **T001** Verify all existing tests pass (`pnpm run test`) - establishes behavior baseline
- [ ] **T002** Verify coverage baseline ≥81.72% (`pnpm run test:coverage`)
- [ ] **T003** Verify code quality baseline (`pnpm run check && pnpm run typecheck`)
- [ ] **T004** Create `packages/language/src/utils/` directory structure
- [ ] **T005** Create `packages/language/src/utils/__tests__/` directory for utility tests
- [ ] **T006** Verify duplication analysis report at `DUPLICATION_ANALYSIS.md` is available

**Checkpoint**: Baseline established - refactoring can begin with confidence

---

## Phase 2: User Story 1 - Eliminate Critical String Literal Detection Duplication (Priority: P1) 🎯

**Goal**: Consolidate two identical string literal detection implementations into single shared utility

**Independent Test**: Extract `utils/string-utils.ts`, update both consumers, verify all existing completion and CSS validation tests pass without modification

### Implementation for US1

- [ ] **T007** [P] [US1] Read `eligian-completion-provider.ts:44-61` to understand `isCursorInString()` implementation
- [ ] **T008** [P] [US1] Read `css/context-detection.ts:125-165` to understand `isCursorInStringLiteral()` implementation
- [ ] **T009** [US1] Create `packages/language/src/utils/string-utils.ts` with `isOffsetInStringLiteral()` function (extract more comprehensive version from context-detection.ts)
- [ ] **T010** [US1] Add JSDoc documentation to `isOffsetInStringLiteral()` explaining parameters and behavior
- [ ] **T011** [US1] Create `packages/language/src/utils/__tests__/string-utils.spec.ts` with unit tests
  - Test cursor inside string literal
  - Test cursor outside string literal
  - Test cursor at string boundaries
  - Test with missing CST node
  - Test with empty string literals
- [ ] **T012** [US1] Update `eligian-completion-provider.ts` to import and use `isOffsetInStringLiteral()` from `../utils/string-utils.js`
- [ ] **T013** [US1] Remove old `isCursorInString()` implementation from `eligian-completion-provider.ts`
- [ ] **T014** [US1] Update `css/context-detection.ts` to import and use `isOffsetInStringLiteral()` from `../utils/string-utils.js`
- [ ] **T015** [US1] Remove old `isCursorInStringLiteral()` implementation from `css/context-detection.ts`
- [ ] **T016** [US1] Run completion tests to verify behavior preservation (`pnpm run test -- completion`)
- [ ] **T017** [US1] Run CSS validation tests to verify behavior preservation (`pnpm run test -- css`)
- [ ] **T018** [US1] Run Biome checks (`pnpm run check`)
- [ ] **T019** [US1] Run TypeScript compilation (`pnpm run typecheck`)

**Checkpoint**: String literal detection exists in exactly 1 location, all tests pass

---

## Phase 3: User Story 2 - Consolidate CSS Hover Markdown Builders (Priority: P1) 🎯

**Goal**: Consolidate 95% identical CSS class/ID markdown builders into generic function

**Independent Test**: Consolidate builders in `css/css-hover.ts`, verify CSS hover tests produce identical markdown output

### Implementation for US2

- [ ] **T020** [P] [US2] Read `css/css-hover.ts:110-148` to understand `buildCSSClassMarkdown` and `buildCSSIDMarkdown` implementations
- [ ] **T021** [P] [US2] Read `css/css-hover.ts:162-194, 207-239` to understand `buildCSSClassInfo` and `buildCSSIDInfo` implementations
- [ ] **T022** [US2] Create `buildCSSIdentifierMarkdown(name, label, files)` function in `css/css-hover.ts` (consolidates class/ID markdown logic)
- [ ] **T023** [US2] Create `buildCSSIdentifierInfo(name, label, registry, documentUri, propertyGetter)` function in `css/css-hover.ts` (consolidates class/ID info logic)
- [ ] **T024** [US2] Add JSDoc documentation to both consolidated functions
- [ ] **T025** [US2] Update `buildCSSClassMarkdown` to call `buildCSSIdentifierMarkdown(name, "CSS Class", files)`
- [ ] **T026** [US2] Update `buildCSSIDMarkdown` to call `buildCSSIdentifierMarkdown(name, "CSS ID", files)`
- [ ] **T027** [US2] Update `buildCSSClassInfo` to call `buildCSSIdentifierInfo(name, "CSS Class", registry, documentUri, m => m.classLocations)`
- [ ] **T028** [US2] Update `buildCSSIDInfo` to call `buildCSSIdentifierInfo(name, "CSS ID", registry, documentUri, m => m.idLocations)`
- [ ] **T029** [US2] Run CSS hover tests to verify identical markdown output (`pnpm run test -- css-hover`)
- [ ] **T030** [US2] Measure duplication reduction (should be ~100 lines → <20 lines)
- [ ] **T031** [US2] Run Biome checks (`pnpm run check`)
- [ ] **T032** [US2] Run TypeScript compilation (`pnpm run typecheck`)

**Checkpoint**: CSS hover markdown/info building duplication reduced from 100+ lines to <20 lines

---

## Phase 4: User Story 3 - Unify Error Construction Pattern Across Validators (Priority: P2)

**Goal**: Extract repeated error construction pattern from 5+ validators into shared utility

**Independent Test**: Extract `utils/error-builder.ts`, update all validators, verify validation tests produce identical error messages

### Implementation for US3

- [ ] **T033** [P] [US3] Read error construction pattern from `validators/asset-type-validator.ts:62-81`
- [ ] **T034** [P] [US3] Read error construction pattern from `validators/default-import-validator.ts:51-58`
- [ ] **T035** [P] [US3] Read error construction pattern from `validators/import-name-validator.ts:54-79` (3 instances)
- [ ] **T036** [P] [US3] Read error construction pattern from `validators/import-path-validator.ts:50-54`
- [ ] **T037** [US3] Create `packages/language/src/utils/error-builder.ts` with `createValidationError()` function
- [ ] **T038** [US3] Add JSDoc documentation to `createValidationError()` with usage examples
- [ ] **T039** [US3] Create `packages/language/src/utils/__tests__/error-builder.spec.ts` with unit tests
  - Test error object structure (code, message, hint)
  - Test with different error definition functions
  - Test with multiple arguments
  - Test that code is correctly extracted
- [ ] **T040** [US3] Update `validators/asset-type-validator.ts` to use `createValidationError()`
- [ ] **T041** [US3] Update `validators/default-import-validator.ts` to use `createValidationError()`
- [ ] **T042** [US3] Update `validators/import-name-validator.ts` to use `createValidationError()` (3 instances)
- [ ] **T043** [US3] Update `validators/import-path-validator.ts` to use `createValidationError()`
- [ ] **T044** [US3] Search for remaining error construction patterns in other validators
- [ ] **T045** [US3] Run validation tests to verify identical error messages (`pnpm run test -- validation`)
- [ ] **T046** [US3] Run Biome checks (`pnpm run check`)
- [ ] **T047** [US3] Run TypeScript compilation (`pnpm run typecheck`)

**Checkpoint**: Error construction exists in exactly 1 utility function, all validators use it

---

## Phase 5: User Story 4 - Consolidate Hover Object Creation (Priority: P2)

**Goal**: Extract repeated Hover object creation pattern (6+ instances) into shared utility

**Independent Test**: Extract `utils/hover-utils.ts`, update all hover providers, verify hover tests pass with identical responses

### Implementation for US4

- [ ] **T048** [P] [US4] Read Hover creation pattern from `css/css-hover.ts:68-72` (2 instances)
- [ ] **T049** [P] [US4] Read Hover creation pattern from `eligian-hover-provider.ts:114-119, 134-139, 151-156, 165-170` (4 instances)
- [ ] **T050** [US4] Create `packages/language/src/utils/hover-utils.ts` with `createMarkdownHover(markdown)` function
- [ ] **T051** [US4] Add JSDoc documentation to `createMarkdownHover()`
- [ ] **T052** [US4] Create `packages/language/src/utils/__tests__/hover-utils.spec.ts` with unit tests
  - Test Hover object structure
  - Test with various markdown inputs
  - Test with empty string
  - Test that MarkupContent kind is 'markdown'
- [ ] **T053** [US4] Update `css/css-hover.ts` to use `createMarkdownHover()` (2 call sites)
- [ ] **T054** [US4] Update `eligian-hover-provider.ts` to use `createMarkdownHover()` (4 call sites)
- [ ] **T055** [US4] Search for remaining Hover object creations in codebase
- [ ] **T056** [US4] Run hover provider tests to verify identical responses (`pnpm run test -- hover`)
- [ ] **T057** [US4] Run Biome checks (`pnpm run check`)
- [ ] **T058** [US4] Run TypeScript compilation (`pnpm run typecheck`)

**Checkpoint**: Hover object creation exists in exactly 1 utility function (down from 6+ instances)

---

## Phase 6: User Story 5 - Extract Markdown Building Utilities (Priority: P3)

**Goal**: Create reusable markdown builder utility to replace array-based building patterns (3+ instances)

**Independent Test**: Create `utils/markdown-builder.ts`, update CSS and eligian hover providers, verify generated markdown remains identical

### Implementation for US5

- [ ] **T059** [P] [US5] Read markdown building pattern from `css/css-hover.ts:111-124, 134-147`
- [ ] **T060** [P] [US5] Read markdown building pattern from `eligian-hover-provider.ts:196-245`
- [ ] **T061** [US5] Create `packages/language/src/utils/markdown-builder.ts` with `MarkdownBuilder` class
- [ ] **T062** [US5] Implement `heading(level, text)`, `text(content)`, `blank()`, `list(items)`, `codeBlock(code, language)`, `build()` methods
- [ ] **T063** [US5] Add JSDoc documentation to `MarkdownBuilder` class and all methods
- [ ] **T064** [US5] Create `packages/language/src/utils/__tests__/markdown-builder.spec.ts` with unit tests
  - Test each method individually
  - Test method chaining (fluent interface)
  - Test `build()` output formatting
  - Test with empty inputs
  - Test complex markdown generation scenarios
- [ ] **T065** [US5] Update CSS hover markdown generation to use `MarkdownBuilder`
- [ ] **T066** [US5] Update eligian hover markdown generation to use `MarkdownBuilder`
- [ ] **T067** [US5] Verify generated markdown remains identical (compare before/after outputs)
- [ ] **T068** [US5] Run hover tests to verify markdown correctness (`pnpm run test -- hover`)
- [ ] **T069** [US5] Run Biome checks (`pnpm run check`)
- [ ] **T070** [US5] Run TypeScript compilation (`pnpm run typecheck`)

**Checkpoint**: Markdown building uses consistent builder pattern across all features

---

## Phase 7: User Story 6 - Eliminate Type Guard Duplication (Priority: P3)

**Goal**: Remove manual type guard implementations in `ast-helpers.ts`, delegate to Langium-generated guards

**Independent Test**: Update `ast-helpers.ts` to delegate to generated guards, verify all AST traversal code works correctly

### Implementation for US6

- [ ] **T071** [P] [US6] Read manual type guard implementations in `utils/ast-helpers.ts`
- [ ] **T072** [P] [US6] Read Langium-generated type guards in `generated/ast.ts`
- [ ] **T073** [US6] Identify which manual type guards duplicate generated guards
- [ ] **T074** [US6] Update `ast-helpers.ts` to import generated guards from `../generated/ast.js`
- [ ] **T075** [US6] Replace manual type guard implementations with delegations to generated guards
- [ ] **T076** [US6] Keep only wrapper functions that add domain logic beyond type checking
- [ ] **T077** [US6] Update JSDoc comments to clarify which functions are wrappers vs pure delegates
- [ ] **T078** [US6] Search codebase for imports of old type guards
- [ ] **T079** [US6] Update imports to use generated type guards or updated wrappers
- [ ] **T080** [US6] Run all tests to verify AST traversal code works correctly (`pnpm run test`)
- [ ] **T081** [US6] Measure duplication reduction in `ast-helpers.ts` (should be ~20+ lines)
- [ ] **T082** [US6] Run Biome checks (`pnpm run check`)
- [ ] **T083** [US6] Run TypeScript compilation (`pnpm run typecheck`)

**Checkpoint**: Type guard implementations reduced by 20+ lines, delegation to generated guards established

---

## Phase 8: User Story 7 - Extract Utility Functions (Priority: P3)

**Goal**: Extract low-impact utility duplications (completion factory, collection utils, path utils, CSS file reading)

**Independent Test**: Extract each utility, update consumers, verify affected tests pass without modification

### Implementation for US7 - Part 1: CSS File Reading

- [ ] **T084** [P] [US7] Read CSS file reading pattern from `css/css-code-actions.ts:70-79`
- [ ] **T085** [US7] Create `packages/language/src/utils/css-file-utils.ts` with `readCSSFileWithErrorHandling()` function
- [ ] **T086** [US7] Add JSDoc documentation to `readCSSFileWithErrorHandling()`
- [ ] **T087** [US7] Create `packages/language/src/utils/__tests__/css-file-utils.spec.ts` with unit tests
  - Test successful file reading
  - Test file not found error
  - Test permission denied error
  - Test fallback to empty string
  - Test error logging
- [ ] **T088** [US7] Update `css/css-code-actions.ts` to use `readCSSFileWithErrorHandling()`
- [ ] **T089** [US7] Search for other CSS file reading locations
- [ ] **T090** [US7] Run CSS code action tests (`pnpm run test -- css-code-actions`)

### Implementation for US7 - Part 2: Collection Utilities

- [ ] **T091** [P] [US7] Read Set-to-Array conversion pattern from `eligian-hover-provider.ts:72`
- [ ] **T092** [P] [US7] Read Set-to-Array conversion pattern from `css-code-actions.ts:54`
- [ ] **T093** [US7] Create `packages/language/src/utils/collection-utils.ts` with `setToArray()` function
- [ ] **T094** [US7] Add JSDoc documentation to `setToArray()`
- [ ] **T095** [US7] Create `packages/language/src/utils/__tests__/collection-utils.spec.ts` with unit tests
  - Test with various Set types
  - Test with empty Set
  - Test type preservation
- [ ] **T096** [US7] Update `eligian-hover-provider.ts` to use `setToArray()`
- [ ] **T097** [US7] Update `css-code-actions.ts` to use `setToArray()`
- [ ] **T098** [US7] Search for other Set-to-Array conversions
- [ ] **T099** [US7] Run hover and code action tests

### Implementation for US7 - Part 3: Path Utilities

- [ ] **T100** [P] [US7] Read file extension extraction pattern from `validators/asset-type-validator.ts:103-108`
- [ ] **T101** [US7] Add `getFileExtension(filePath)` function to `packages/shared-utils/src/path-utils.ts`
- [ ] **T102** [US7] Add JSDoc documentation to `getFileExtension()`
- [ ] **T103** [US7] Add unit tests for `getFileExtension()` in shared-utils test file
  - Test with various file extensions
  - Test with no extension
  - Test with multiple dots
  - Test with uppercase extensions (should lowercase)
- [ ] **T104** [US7] Update `validators/asset-type-validator.ts` to use `getFileExtension()`
- [ ] **T105** [US7] Search for other file extension extraction patterns
- [ ] **T106** [US7] Run asset type validator tests

### Implementation for US7 - Part 4: Completion Item Factory

- [ ] **T107** [P] [US7] Read CompletionItem construction patterns from completion providers
- [ ] **T108** [US7] Create `packages/language/src/completion/completion-item-factory.ts` with `createCompletionItem()` function
- [ ] **T109** [US7] Add JSDoc documentation to `createCompletionItem()`
- [ ] **T110** [US7] Create unit tests for completion item factory
  - Test CompletionItem structure
  - Test with various CompletionItemKind values
  - Test with and without documentation
  - Test with custom insertText
- [ ] **T111** [US7] Update completion providers (actions, operations, events) to use factory
- [ ] **T112** [US7] Run completion provider tests

### Implementation for US7 - Part 5: Service Initialization Investigation

- [ ] **T112a** [P] [US7] Search codebase for service initialization patterns (`services || { ... }`)
- [ ] **T112b** [US7] If 2+ instances found: Create service initialization factory in `utils/service-factory.ts`
- [ ] **T112c** [US7] If 2+ instances found: Add unit tests for service factory
- [ ] **T112d** [US7] If 2+ instances found: Update consumers to use factory
- [ ] **T112e** [US7] If <2 instances found: Document as not needed in completion notes

**Note**: FR-013 is conditional - only implement if duplication justifies extraction.

### US7 Final Verification

- [ ] **T113** [US7] Run all tests to verify behavior preservation (`pnpm run test`)
- [ ] **T114** [US7] Run Biome checks (`pnpm run check`)
- [ ] **T115** [US7] Run TypeScript compilation (`pnpm run typecheck`)

**Checkpoint**: All low-impact utilities extracted and consumers updated

---

## Phase 9: Polish & Final Verification

**Purpose**: Verify all success criteria met, ensure code quality, complete documentation

### Coverage & Quality Verification

- [ ] **T116** [P] Run full test suite and verify all 1,483+ tests pass (`pnpm run test`)
- [ ] **T117** [P] Run coverage verification and confirm ≥81.72% (`pnpm run test:coverage`)
- [ ] **T118** [P] Run Biome checks and confirm zero errors/warnings (`pnpm run check`)
- [ ] **T119** [P] Run TypeScript compilation and confirm zero errors (`pnpm run typecheck`)

### Success Criteria Verification

- [ ] **T120** Measure code reduction (count duplicated lines removed vs utility code added)
  - Target: 150-200 lines reduced
  - Document actual reduction in completion notes
- [ ] **T121** Verify string literal detection in exactly 1 location (`utils/string-utils.ts`)
- [ ] **T122** Verify CSS hover duplication reduced from 100+ lines to <20 lines
- [ ] **T123** Verify error construction in exactly 1 utility (`utils/error-builder.ts`)
- [ ] **T124** Verify hover creation in exactly 1 utility (`utils/hover-utils.ts`)
- [ ] **T125** Verify type guard implementations reduced by 20+ lines in `ast-helpers.ts`
- [ ] **T126** Benchmark build time and verify within 5% of baseline
  - Baseline: Record before refactoring
  - After: Measure after all refactorings
  - Document results

### Documentation & Cleanup

- [ ] **T127** Update `quickstart.md` with final usage examples (if needed)
- [ ] **T128** Search codebase for any remaining duplication patterns
- [ ] **T129** Verify all new utility modules have comprehensive JSDoc documentation
- [ ] **T130** Verify all imports use `.js` extensions (ESM compliance)
- [ ] **T131** Review and clean up any temporary files or comments

### Phase Tracking

- [ ] **T132** Document time spent on Phase 1 (High Priority) - target: 2-4 hours
- [ ] **T133** Document time spent on Phase 2 (Medium Priority) - target: 4-6 hours
- [ ] **T134** Document time spent on Phase 3 (Low Priority) - target: 2-3 hours
- [ ] **T135** Verify total effort within 8-13 hours estimate

**Checkpoint**: All success criteria met, refactoring complete

---

## Task Dependencies & Execution Order

### Critical Path (Must Complete in Order)

1. **Phase 1 Setup** (T001-T006) → Establishes baseline
2. **US1-US7 can execute in parallel after baseline established**
   - Each user story is independent
   - Within each story, tasks have dependencies (read → create utility → update consumers → test)
3. **Phase 9 Polish** (T116-T135) → Final verification after all stories complete

### Parallel Execution Opportunities

**After Phase 1 Complete** (baseline established), these can run in parallel:

- **Track 1: US1** (T007-T019) - String utils - 2-4 hours
- **Track 2: US2** (T020-T032) - CSS hover consolidation - 2-4 hours
- **Track 3: US3** (T033-T047) - Error builder - 2-3 hours
- **Track 4: US4** (T048-T058) - Hover utils - 1-2 hours
- **Track 5: US5** (T059-T070) - Markdown builder - 2-3 hours
- **Track 6: US6** (T071-T083) - Type guards - 1-2 hours
- **Track 7: US7** (T084-T115) - Miscellaneous utilities - 2-3 hours

**Parallelization Strategy**:
- High priority (US1-US3) should complete first for maximum impact
- Medium/low priority (US4-US7) can overlap with high priority
- Each track is fully independent (different files, no shared state)

### Within-Story Dependencies

**Example: US1 (String Utils)**
- T007, T008 can run in parallel (reading different files)
- T009 depends on T007, T008 (need understanding before extraction)
- T010, T011 can run in parallel with T009 (documentation and tests)
- T012-T015 are sequential (update consumers one at a time)
- T016-T019 can run in parallel (different test suites)

**Example: US7 (Multiple Utilities)**
- Parts 1-4 can run in parallel (different utilities, different files)
- Within each part, tasks are sequential (read → create → test)

---

## Implementation Strategy

### MVP Scope (Recommended)

**Target: User Stories 1-3 (High Priority - P1 & P2)**
- US1: String literal detection (critical infrastructure)
- US2: CSS hover consolidation (user-facing, 100+ lines)
- US3: Error construction (affects 5+ validators)

**Benefits**:
- Eliminates most critical duplications (135+ lines)
- Addresses highest-risk areas (hot paths, user-facing features)
- Delivers immediate maintainability improvement
- Provides clear value for code review

### Full Feature Scope

**Target: All User Stories 1-7**
- Completes all 12 identified duplications
- Reduces code by 150-200 lines total
- Establishes comprehensive utility library
- Sets pattern for future refactoring

### Incremental Delivery

Each user story completion is a valid checkpoint for:
- Code review and merge
- Demonstrating progress
- Validating approach
- Gathering feedback

**Suggested Merge Points**:
1. After US1-US3 complete (high priority done)
2. After US4-US6 complete (medium priority done)
3. After US7 complete (all work done)

---

## Testing Notes

### Existing Tests (Behavior Preservation)

- **Critical**: All 1,483+ existing tests must pass without modification
- If any test fails, refactoring introduced a behavioral regression
- Tests serve as behavioral specification (prove identical behavior)

### New Tests (Utility Coverage)

- Each new utility module gets comprehensive unit tests
- Unit tests verify utility behavior in isolation
- Coverage target: ≥81.72% maintained or improved

### Test Execution Per Story

Each user story includes test verification tasks:
- Run relevant test suite after consumer updates
- Run full test suite at story completion
- Run coverage verification after each phase

### Constitutional Compliance

- **Test-First**: New utility tests written before or alongside implementation
- **No Test Modifications**: Existing tests remain unchanged (proves preservation)
- **Coverage Verification**: Mandatory after each phase (SC-003)

---

## Summary

**Total Tasks**: 140 tasks across 9 phases
**Estimated Effort**: 8-13 hours (per spec success criteria)
**Task Breakdown by User Story**:
- Setup: 6 tasks (Phase 1)
- US1 (String Utils): 13 tasks
- US2 (CSS Hover): 13 tasks
- US3 (Error Builder): 15 tasks
- US4 (Hover Utils): 11 tasks
- US5 (Markdown Builder): 12 tasks
- US6 (Type Guards): 13 tasks
- US7 (Misc Utilities): 37 tasks (5 parts including service init investigation)
- Polish & Verification: 20 tasks (Phase 9)

**Parallel Opportunities**: US1-US7 can execute in parallel after baseline (Phase 1) complete

**Independent Testing**: Each user story has clear verification criteria and test checkpoints

**MVP Recommendation**: Complete US1-US3 first (high priority, 135+ lines reduced, 2-8 hours effort)

**Success Metrics**:
- 150-200 lines of duplicated code eliminated
- 7 new utility modules created
- All 1,483+ tests pass without modification
- Coverage remains ≥81.72%
- Zero linting/type errors
- Build time within 5% of baseline
