# Tasks: Enhanced Typir Integration for IDE Support

**Input**: Design documents from `/specs/021-enhanced-typir-integration/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅

**Tests**: Tests are MANDATORY per Constitution Principle II (Test-First Development). All tests written FIRST using RED-GREEN-REFACTOR workflow.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: User story (US1, US2, US3, US4, US5)
- File paths: `packages/language/src/type-system-typir/`

**Terminology Clarification**:
- **Specification Priorities**: P1 (US1+US2), P2 (US3), P3 (US4+US5)
- **Task Phases**: Phase 1 (Setup), Phase 2 (Foundation), Phase 3 (US1 implementation), etc.
- These are DIFFERENT organizational schemes - see mapping in Dependencies section below.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project structure and directory organization

- [ ] **T001** Create directory structure: `mkdir -p packages/language/src/type-system-typir/{types,inference,validation,utils}`
- [ ] **T002** Create `__tests__` directories for each module: `mkdir -p packages/language/src/type-system-typir/{types,inference,validation,utils}/__tests__`
- [ ] **T003** [P] Copy type contracts from spec: `cp specs/021-enhanced-typir-integration/contracts/typir-types.ts packages/language/src/type-system-typir/types/`
- [ ] **T004** [P] Verify Typir dependencies in `packages/language/package.json` (typir@1.0+, typir-langium@1.0+)

**Checkpoint**: Directory structure ready

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core utilities and type infrastructure needed by ALL user stories

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Utility Functions (Shared by Multiple Stories)

- [ ] **T005** [P] **[Util]** Write failing tests for time parser in `packages/language/src/type-system-typir/utils/__tests__/time-parser.spec.ts` (5 tests: valid 's', valid 'ms', invalid format, edge cases)
- [ ] **T006** **[Util]** Implement time parser in `packages/language/src/type-system-typir/utils/time-parser.ts` (make tests pass)
- [ ] **T007** [P] **[Util]** Write failing tests for asset type inferrer in `packages/language/src/type-system-typir/utils/__tests__/asset-type-inferrer.spec.ts` (8 tests: html, css, media extensions, unknown)
- [ ] **T008** **[Util]** Implement asset type inferrer in `packages/language/src/type-system-typir/utils/asset-type-inferrer.ts` (make tests pass)
- [ ] **T009** [P] **[Util]** Write failing tests for overlap detector in `packages/language/src/type-system-typir/utils/__tests__/overlap-detector.spec.ts` (6 tests: no overlap, partial overlap, full overlap, edge cases)
- [ ] **T010** **[Util]** Implement overlap detector in `packages/language/src/type-system-typir/utils/overlap-detector.ts` (make tests pass)

### Core Type System Integration Points

- [ ] **T011** **[Util]** Update `eligian-specifics.ts` to export new type definitions (ImportType, TimelineEventType, TimelineType)
- [ ] **T012** **[Util]** Add factory properties to `EligianTypeSystem` class in `eligian-type-system.ts` (importFactory, eventFactory, timelineFactory - stubs only)

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Import Statement Type Checking (Priority: P1) 🎯 MVP

**Goal**: Hover shows "Import<css>", validates duplicate default imports, warns on type mismatches

**Independent Test**: Write import statements (default and named), verify hover, validation errors, and type inference work

### Tests for US1 (Write FIRST, ensure FAIL)

- [ ] **T013** [P] **[US1]** Write failing integration test in `packages/language/src/__tests__/typir-import-validation.spec.ts`:
  - Test 1: Hover shows "Import<css>" for `styles './main.css'`
  - Test 2: Error on duplicate `layout` imports
  - Test 3: Warning on type mismatch (`import video from './intro.mp4' as html`)
  - Test 4: Hover shows "Import<html>" for explicit override
  - Test 5: Named import inference from extension
  - **NOTE**: File MUST be isolated (one integration test per file per Constitution)

- [ ] **T014** [P] **[US1]** Write failing unit tests for ImportType factory in `packages/language/src/type-system-typir/types/__tests__/import-type.spec.ts`:
  - Test 1: Factory creates ImportType with correct properties
  - Test 2: calculateTypeName returns "Import<assetType>"
  - Test 3: Default imports have isDefault=true
  - Test 4: Named imports have isDefault=false

### Implementation for US1

- [ ] **T015** [P] **[US1]** Create ImportType factory in `packages/language/src/type-system-typir/types/import-type.ts`:
  - Define ImportType type (assetType, path, isDefault)
  - Create CustomKind factory with calculateTypeName
  - Export createImportTypeFactory function

- [ ] **T016** [P] **[US1]** Implement import inference rules in `packages/language/src/type-system-typir/inference/import-inference.ts`:
  - Register DefaultImport inference rule (infer from keyword)
  - Register NamedImport inference rule (infer from extension or `as` clause)
  - Helper: inferAssetTypeFromKeyword (layout→html, styles→css, provider→media)

- [ ] **T017** [P] **[US1]** Write failing unit tests for import inference in `packages/language/src/type-system-typir/inference/__tests__/import-inference.spec.ts` (8 tests: each import type, edge cases)

- [ ] **T018** [P] **[US1]** Implement import validation rules in `packages/language/src/type-system-typir/validation/import-validation.ts`:
  - DefaultImport: Check duplicate default imports (traverse program)
  - NamedImport: Warn on asset type mismatch (FR-005):
    - Infer asset type from file extension using `inferAssetTypeFromExtension()` utility
    - Compare with explicit `as` clause type (if present)
    - If mismatch: Warning "Asset type '<explicit>' conflicts with inferred type '<inferred>' from file extension (path: '<path>')"
    - Example: `import video from './intro.mp4' as html` → Warning: "Asset type 'html' conflicts with inferred type 'media' from file extension (path: './intro.mp4')"

- [ ] **T019** [P] **[US1]** Write failing unit tests for import validation in `packages/language/src/type-system-typir/validation/__tests__/import-validation.spec.ts` (5 tests: duplicate detection, type mismatch warning)

- [ ] **T020** **[US1]** Register ImportType factory and rules in `eligian-type-system.ts`:
  - Call createImportTypeFactory in onInitialize()
  - Call registerImportInference(this)
  - Call registerImportValidation(this.typirServices)

- [ ] **T021** **[US1]** Run integration test T013 - should now PASS (GREEN phase)
- [ ] **T022** **[US1]** Run all US1 unit tests - should now PASS
- [ ] **T023** **[US1]** Build and test in VS Code extension (manual verification: hover, validation)
- [ ] **T024** **[US1]** Run `pnpm run check && pnpm run typecheck` (Biome + TypeScript per Constitution)
- [ ] **T025** **[US1]** Verify 80%+ coverage for US1 modules: `pnpm run test:coverage -- import`

**Checkpoint**: US1 complete - Import type checking fully functional and independently testable

---

## Phase 4: User Story 2 - Reserved Keyword Validation (Priority: P1)

**Goal**: Catch reserved keyword collisions in constant declarations

**Existing Work**: Constant type inference and hover already implemented in `eligian-type-system.ts:205-211`. This phase ONLY adds reserved keyword validation.

**Independent Test**: Declare constants with reserved keywords, verify validation errors

### Tests for US2 (Write FIRST, ensure FAIL)

- [ ] **T026** [P] **[US2]** Write failing integration test in `packages/language/src/__tests__/typir-constant-validation.spec.ts`:
  - Test 1: Error on `const if = 5` ('if' is reserved keyword)
  - Test 2: Error on `const timeline = "test"` ('timeline' is reserved keyword)
  - Test 3: Error on `const action = 42` ('action' is reserved keyword)
  - Test 4: No error on `const duration = 100` (valid name)
  - Test 5: No error on `const myVar = "test"` (valid name)
  - **NOTE**: File MUST be isolated (one integration test per file)
  - **NOTE**: Tests 3-5 from original spec are REMOVED (hover already works, no new tests needed)

- [ ] **T027** [P] **[US2]** Write failing unit tests for reserved keyword validation in `packages/language/src/type-system-typir/validation/__tests__/constant-validation.spec.ts`:
  - Test 1: Each reserved keyword detected ('if', 'else', 'for', 'in', 'break', 'continue', 'const', 'action', 'endable', 'timeline', 'at', 'sequence', 'stagger' - 13 keywords = 13 tests)
  - Test 2: Valid names pass ('duration', 'myVar', 'count', 'selector', 'items' - 5 tests)
  - Test 3: Edge cases (keywords as part of name: 'ifCondition' is valid - 2 tests)
  - **Total**: 20 unit tests

### Implementation for US2

- [ ] **T028** [P] **[US2]** Implement constant validation rules in `packages/language/src/type-system-typir/validation/constant-validation.ts`:
  - Check `VariableDeclaration.name` against RESERVED_KEYWORDS set (from `contracts/typir-types.ts`)
  - Validation rule for VariableDeclaration AST node
  - Error message: "'<keyword>' is a reserved keyword and cannot be used as a constant name"

- [ ] **T029** **[US2]** Register constant validation in `eligian-type-system.ts`:
  - Add import: `import { registerConstantValidation } from './validation/constant-validation.js';`
  - Call `registerConstantValidation(this.typirServices)` in `onInitialize()` after primitive types created

- [ ] **T030** **[US2]** Run integration test T026 - should now PASS (GREEN phase)
- [ ] **T031** **[US2]** Run unit test T027 - should now PASS
- [ ] **T032** **[US2]** Build and test in VS Code extension (manual verification: reserved keyword errors only)
- [ ] **T033** **[US2]** Run `pnpm run check && pnpm run typecheck`
- [ ] **T034** **[US2]** Verify 80%+ coverage for US2 modules: `pnpm run test:coverage -- constant-validation`

**Checkpoint**: US2 complete - Reserved keyword validation fully functional

**Task Count Reduction**: 10 tasks → 9 tasks (removed T028 "Enhance constant inference" - already done)

---

## Phase 5: User Story 3 - Timeline Event Validation (Priority: P2)

**Goal**: Validate time ranges, detect overlapping events, show timing on hover

**Independent Test**: Create timelines with various event configurations, verify validation works

### Tests for US3 (Write FIRST, ensure FAIL)

- [ ] **T036** [P] **[US3]** Write failing integration test in `packages/language/src/__tests__/typir-event-validation.spec.ts`:
  - Test 1: Error on negative start time (`at -1s..5s`)
  - Test 2: Error on end < start (`at 5s..2s`)
  - Test 3: Warning on overlapping events ([0s..5s] and [3s..7s])
  - Test 4: Error on negative sequence duration (`for -2s`)
  - Test 5: Error on zero stagger delay (`stagger 0s`)
  - Test 6: Hover shows "TimedEvent: 0s → 5s"
  - **NOTE**: File MUST be isolated

- [ ] **T037** [P] **[US3]** Write failing unit tests for TimelineEventType factory in `packages/language/src/type-system-typir/types/__tests__/timeline-event-type.spec.ts`:
  - Test 1: Factory creates TimedEvent type
  - Test 2: Factory creates SequenceEvent type
  - Test 3: Factory creates StaggerEvent type
  - Test 4: calculateTypeName returns correct format (8 tests total)

### Implementation for US3

- [ ] **T038** [P] **[US3]** Create TimelineEventType factory in `packages/language/src/type-system-typir/types/timeline-event-type.ts`:
  - Define TimelineEventType (eventKind, startTime, endTime, duration)
  - Create CustomKind factory with calculateTypeName
  - Export createEventTypeFactory function

- [ ] **T039** [P] **[US3]** Implement event inference rules in `packages/language/src/type-system-typir/inference/event-inference.ts`:
  - Register TimedEvent inference (parse startTime, endTime)
  - Register SequenceEvent inference (parse duration)
  - Register StaggerEvent inference (parse delay, duration)
  - Use parseTimeExpression utility from T006

- [ ] **T040** [P] **[US3]** Write failing unit tests for event inference in `packages/language/src/type-system-typir/inference/__tests__/event-inference.spec.ts` (12 tests: each event type, edge cases)

- [ ] **T041** [P] **[US3]** Implement event validation rules in `packages/language/src/type-system-typir/validation/event-validation.ts`:
  - TimedEvent: Validate startTime ≥ 0, endTime > startTime
  - SequenceEvent: Validate duration > 0
  - StaggerEvent: Validate delay > 0, items is array type
  - Timeline: Detect overlapping timed events (use overlap detector from T010)

- [ ] **T042** [P] **[US3]** Write failing unit tests for event validation in `packages/language/src/type-system-typir/validation/__tests__/event-validation.spec.ts` (15 tests: each validation rule, overlap detection)

- [ ] **T043** **[US3]** Register TimelineEventType factory and rules in `eligian-type-system.ts`:
  - Call createEventTypeFactory in onInitialize()
  - Call registerEventInference(this)
  - Call registerEventValidation(this.typirServices)

- [ ] **T044** **[US3]** Run integration test T036 - should now PASS (GREEN phase)
- [ ] **T045** **[US3]** Run all US3 unit tests - should now PASS
- [ ] **T046** **[US3]** Build and test in VS Code extension (manual verification: time validation, overlap warnings, hover)
- [ ] **T047** **[US3]** Run `pnpm run check && pnpm run typecheck`
- [ ] **T048** **[US3]** Verify 80%+ coverage for US3 modules: `pnpm run test:coverage -- event`

**Checkpoint**: US3 complete - Timeline event validation fully functional

---

## Phase 6: User Story 4 - Control Flow Type Checking (Priority: P3)

**Goal**: Validate if conditions (boolean) and for collections (array)

**Existing Work**: Action function types already implemented in `eligian-type-system.ts:246-346`. This phase ONLY adds IfStatement and ForStatement validation.

**Independent Test**: Write control flow statements with various types, verify validation

### Tests for US4 (Write FIRST, ensure FAIL)

- [ ] **T049** [P] **[US4]** Write failing integration test in `packages/language/src/__tests__/typir-control-flow.spec.ts`:
  - Test 1: Warning on non-boolean condition (`if ("string")`)
  - Test 2: Error on non-array collection (`for (item in "string")`)
  - Test 3: No error on valid array collection
  - Test 4: Validation of comparison expression
  - Test 5: Warning on empty if branch
  - **NOTE**: File MUST be isolated

- [ ] **T050** [P] **[US4]** Write failing unit tests for control flow validation in `packages/language/src/type-system-typir/validation/__tests__/control-flow-validation.spec.ts` (10 tests: each validation rule, edge cases)

### Implementation for US4

- [ ] **T051** [P] **[US4]** Implement control flow validation rules in `packages/language/src/type-system-typir/validation/control-flow-validation.ts`:
  - IfStatement: Validate condition is boolean (warning if not)
  - IfStatement: Warn on empty branches
  - ForStatement: Validate collection is array (error if not)
  - ForStatement: Warn on empty body

- [ ] **T052** **[US4]** Register control flow validation in `eligian-type-system.ts`:
  - Call registerControlFlowValidation(this.typirServices) in onInitialize()

- [ ] **T053** **[US4]** Run integration test T049 - should now PASS (GREEN phase)
- [ ] **T054** **[US4]** Run unit test T050 - should now PASS
- [ ] **T055** **[US4]** Build and test in VS Code extension (manual verification: control flow validation)
- [ ] **T056** **[US4]** Run `pnpm run check && pnpm run typecheck`
- [ ] **T057** **[US4]** Verify 80%+ coverage for US4 modules: `pnpm run test:coverage -- control-flow`

**Checkpoint**: US4 complete - Control flow type checking fully functional

---

## Phase 7: User Story 5 - Timeline Configuration Validation (Priority: P3)

**Goal**: Validate provider-source consistency, container selector syntax, empty timelines

**Independent Test**: Create timelines with various configurations, verify validation

### Tests for US5 (Write FIRST, ensure FAIL)

- [ ] **T058** [P] **[US5]** Write failing integration test in `packages/language/src/__tests__/typir-timeline-config.spec.ts`:
  - Test 1: Error on video without source
  - Test 2: Warning on RAF with source
  - Test 3: Error on invalid CSS selector
  - Test 4: Hover shows "Timeline<video>"
  - Test 5: Warning on timeline with no events
  - **NOTE**: File MUST be isolated

- [ ] **T059** [P] **[US5]** Write failing unit tests for TimelineType factory in `packages/language/src/type-system-typir/types/__tests__/timeline-type.spec.ts`:
  - Test 1: Factory creates TimelineType with correct properties
  - Test 2: calculateTypeName returns "Timeline<provider>"
  - Test 3: Circular dependency handling (events array)

### Implementation for US5

- [ ] **T060** [P] **[US5]** Create TimelineType factory in `packages/language/src/type-system-typir/types/timeline-type.ts`:
  - Define TimelineType (provider, containerSelector, source, events[])
  - Create CustomKind factory with calculateTypeName
  - Handle circular dependency (events reference TimelineEventType)
  - Export createTimelineTypeFactory function

- [ ] **T061** [P] **[US5]** Implement timeline inference rules in `packages/language/src/type-system-typir/inference/timeline-inference.ts`:
  - Register Timeline inference (infer provider, parse events)
  - Use TimelineEventType from T038

- [ ] **T062** [P] **[US5]** Write failing unit tests for timeline inference in `packages/language/src/type-system-typir/inference/__tests__/timeline-inference.spec.ts` (6 tests: each provider type, events)

- [ ] **T063** [P] **[US5]** Implement timeline validation rules in `packages/language/src/type-system-typir/validation/timeline-validation.ts`:
  - Timeline: Validate video/audio require source
  - Timeline: Warn if RAF/custom have source
  - Timeline: Validate CSS selector syntax (basic regex check)
  - Timeline: Warn if no events

- [ ] **T064** [P] **[US5]** Write failing unit tests for timeline validation in `packages/language/src/type-system-typir/validation/__tests__/timeline-validation.spec.ts` (10 tests: each validation rule)

- [ ] **T065** **[US5]** Register TimelineType factory and rules in `eligian-type-system.ts`:
  - Call createTimelineTypeFactory in onInitialize()
  - Call registerTimelineInference(this)
  - Call registerTimelineValidation(this.typirServices)

- [ ] **T066** **[US5]** Run integration test T058 - should now PASS (GREEN phase)
- [ ] **T067** **[US5]** Run all US5 unit tests - should now PASS
- [ ] **T068** **[US5]** Build and test in VS Code extension (manual verification: timeline validation, hover)
- [ ] **T069** **[US5]** Run `pnpm run check && pnpm run typecheck`
- [ ] **T070** **[US5]** Verify 80%+ coverage for US5 modules: `pnpm run test:coverage -- timeline`

**Checkpoint**: US5 complete - Timeline configuration validation fully functional

---

## Phase 8: Polish & Integration

**Purpose**: Final integration, performance validation, documentation updates

### Integration Testing

- [ ] **T071** [P] **[Integration]** Run full test suite: `pnpm test` (all 1323+ existing tests + 100+ new tests must pass)
- [ ] **T072** [P] **[Integration]** Performance benchmark: Validate 500-line document in <50ms, 2000-line document in <200ms
- [ ] **T073** [P] **[Integration]** Memory profiling: Verify <10MB memory increase after Typir integration

### Code Quality

- [ ] **T074** **[Quality]** Run Biome with auto-fix: `pnpm run check` (0 errors, 0 warnings)
- [ ] **T075** **[Quality]** Run TypeScript type checking: `pnpm run typecheck` (0 errors)
- [ ] **T076** **[Quality]** Verify 80%+ coverage for ALL modules: `pnpm run test:coverage` (Constitution requirement)
- [ ] **T077** **[Quality]** Review generated code for ESM import extensions (.js) per Constitution Principle IX

### Documentation

- [ ] **T078** [P] **[Docs]** Update `LANGUAGE_SPEC.md` with new validation behaviors (Constitution Principle XVII)
- [ ] **T079** [P] **[Docs]** Update `type-system-typir/README.md` with new features (ImportType, EventType, TimelineType)
- [ ] **T080** [P] **[Docs]** Create migration guide for users upgrading from older versions
- [ ] **T081** [P] **[Docs]** Update `CLAUDE.md` with new Typir integration architecture

### Final Verification

- [ ] **T082** **[Verify]** Test all acceptance scenarios from spec.md (25 scenarios across 5 user stories)
- [ ] **T083** **[Verify]** Manual IDE testing: Open VS Code, test hover, validation, completion for all 5 user stories
  - **Hover Verification** (CON-001): Verify hover shows types automatically via Typir-Langium binding:
    - ImportType: Hover over import statement shows "Import<css>" (US1)
    - ConstantType: Hover over constant shows inferred type "string"/"number" (US2 - already works)
    - TimelineEventType: Hover over timed event shows "TimedEvent: 0s → 5s" (US3)
    - TimelineType: Hover over timeline shows "Timeline<video>" (US5)
  - **Note**: No hover provider implementation needed - Typir-Langium handles this automatically
- [ ] **T084** **[Verify]** Edge case testing: Test all edge cases from spec.md (8 edge cases)
- [ ] **T085** **[Verify]** Cross-browser extension testing (if applicable)

**Checkpoint**: Feature complete - All 5 user stories fully functional, tested, and documented

---

## Task Summary

**Total Tasks**: 85
**Task Distribution**:
- Phase 1 (Setup): 4 tasks
- Phase 2 (Foundation): 8 tasks (6 utility tests + implementations, 2 integration points)
- Phase 3 (US1 - Import): 13 tasks (3 test files, 6 implementation, 4 verification)
- Phase 4 (US2 - Constant): 10 tasks (2 test files, 4 implementation, 4 verification)
- Phase 5 (US3 - Event): 13 tasks (3 test files, 6 implementation, 4 verification)
- Phase 6 (US4 - Control Flow): 9 tasks (2 test files, 3 implementation, 4 verification)
- Phase 7 (US5 - Timeline Config): 13 tasks (3 test files, 6 implementation, 4 verification)
- Phase 8 (Polish): 15 tasks (3 integration, 4 quality, 4 docs, 4 verification)

**Parallel Opportunities**:
- Phase 2: Utility tests and implementations (6 parallel tasks)
- Phase 3-7: Test files can be written in parallel within each phase
- Phase 3-7: Different modules (types, inference, validation) can be implemented in parallel after tests written
- Phase 8: Documentation updates can be done in parallel

**Test Coverage**:
- **Unit Tests**: ~90 tests across all modules
- **Integration Tests**: 5 integration test files (one per user story, isolated per Constitution)
- **Total New Tests**: ~100+ tests (meeting Constitution 80% coverage requirement)

---

## Dependencies

### User Story Completion Order

```
Phase 1 (Setup)
    ↓
Phase 2 (Foundation) ← BLOCKING: Must complete before any user story
    ↓
┌────────────────────────────────────────────────────┐
│  Phase 3 (US1 - Import)         🎯 MVP             │
│  Phase 4 (US2 - Constant)       🎯 MVP             │
│  ↓ (Both can run in parallel)                      │
│  Phase 5 (US3 - Event)                             │
│  ↓                                                  │
│  Phase 6 (US4 - Control Flow)                      │
│  Phase 7 (US5 - Timeline Config)                   │
│  ↓ (Phases 6-7 can run in parallel)                │
└────────────────────────────────────────────────────┘
    ↓
Phase 8 (Polish & Integration)
```

### Suggested MVP Scope

**Minimum Viable Product (MVP)**: User Story 1 + User Story 2 (Phase 3-4)

**Rationale**:
- US1 (Import type checking) - Critical blocker, highest value
- US2 (Constant validation) - Quick win (4-hour implementation), prevents common mistakes
- Together: Provide immediate value with import/constant validation and hover support
- Independent testing: Both stories can be tested without other features
- Low complexity: Both are P1 priority and lowest complexity from research

**Incremental Delivery**:
1. **MVP Release**: US1 + US2 (Week 1-2, ~35 tests)
2. **Phase 2 Release**: Add US3 (Week 3-4, ~30 tests)
3. **Phase 3 Release** (Optional): Add US4 + US5 (Week 5-6, ~35 tests)

---

## Parallel Execution Examples

### Phase 2 (Foundation) - Maximum Parallelization

```bash
# All utility tests can be written in parallel
pnpm test:watch utils/__tests__/time-parser.spec.ts &          # T005
pnpm test:watch utils/__tests__/asset-type-inferrer.spec.ts &  # T007
pnpm test:watch utils/__tests__/overlap-detector.spec.ts &     # T009

# After tests fail, implementations can be done in parallel
# (Different files, no dependencies)
vim utils/time-parser.ts &           # T006
vim utils/asset-type-inferrer.ts &   # T008
vim utils/overlap-detector.ts &      # T010
```

### Phase 3 (US1) - Parallel Implementation After Tests

```bash
# Step 1: Write ALL tests first (in parallel)
vim __tests__/typir-import-validation.spec.ts &           # T013
vim types/__tests__/import-type.spec.ts &                 # T014
vim inference/__tests__/import-inference.spec.ts &        # T017
vim validation/__tests__/import-validation.spec.ts &      # T019

# Step 2: After tests FAIL, implement in parallel (different files)
vim types/import-type.ts &          # T015
vim inference/import-inference.ts & # T016
vim validation/import-validation.ts & # T018

# Step 3: Integration (sequential)
vim eligian-type-system.ts          # T020 (updates single file, must be sequential)
```

### Phase 5 (US3) - Complex Module Parallelization

```bash
# Step 1: Tests first
vim __tests__/typir-event-validation.spec.ts &     # T036
vim types/__tests__/timeline-event-type.spec.ts &  # T037
vim inference/__tests__/event-inference.spec.ts &  # T040
vim validation/__tests__/event-validation.spec.ts & # T042

# Step 2: After tests FAIL, implement (maximum parallelization)
vim types/timeline-event-type.ts &    # T038 (different file)
vim inference/event-inference.ts &    # T039 (different file)
vim validation/event-validation.ts &  # T041 (different file)
```

---

## Implementation Strategy

### Test-First Development (Constitution Mandate)

**RED-GREEN-REFACTOR Workflow** (Strictly Enforced):

1. **RED**: Write failing test FIRST
   - Describe desired behavior in test
   - Run test, verify it FAILS
   - Commit test (shows test written before implementation)

2. **GREEN**: Write MINIMUM code to pass
   - Implement feature
   - Run test, verify it PASSES
   - Commit implementation

3. **REFACTOR**: Improve code quality
   - Keep tests green while refactoring
   - Run Biome + typecheck after refactoring
   - Commit refactored code

**Example** (T013 → T015-T020 → T021):
```bash
# RED: Write failing test
vim packages/language/src/__tests__/typir-import-validation.spec.ts
pnpm test typir-import-validation  # MUST FAIL
git commit -m "test: Add failing test for import type checking (US1)"

# GREEN: Implement to pass test
vim packages/language/src/type-system-typir/types/import-type.ts
vim packages/language/src/type-system-typir/inference/import-inference.ts
vim packages/language/src/type-system-typir/validation/import-validation.ts
vim packages/language/src/type-system-typir/eligian-type-system.ts
pnpm test typir-import-validation  # MUST PASS
git commit -m "feat(US1): Implement import type checking with hover support"

# REFACTOR: Improve code quality
pnpm run check && pnpm run typecheck
# Fix any issues, keep tests green
git commit -m "refactor(US1): Clean up import type checking code"
```

### Incremental Integration

**Migration Strategy** (from plan.md):
1. Keep Langium validators during transition (T020, T030, etc.)
2. Run both validators in parallel
3. Compare results in tests
4. Remove Langium validators only after Typir proven stable (Phase 8)

**Performance Validation** (T072):
- Benchmark after each user story completes
- Target: <50ms for 500 lines, <200ms for 2000 lines
- If exceeds target, optimize before proceeding to next story

### Coverage Verification

**After Each User Story** (T025, T035, T048, T057, T070):
```bash
pnpm run test:coverage -- <module-name>
# Example: pnpm run test:coverage -- import

# Verify 80%+ coverage per Constitution Principle II
# If below 80%:
#   1. STOP immediately
#   2. Identify missing tests
#   3. Write tests to reach 80%
#   4. Get user approval if 80% impossible
```

**Final Verification** (T076):
```bash
pnpm run test:coverage  # Full coverage report
# Verify ALL modules ≥ 80% coverage
# Exception process: Document + user approval required
```

---

## Notes

### Constitution Compliance

This task list complies with:
- **Principle II**: Test-First Development (RED-GREEN-REFACTOR workflow enforced)
- **Principle II**: Integration tests isolated in separate files (T013, T026, T036, T049, T058 are all isolated)
- **Principle II**: 80% coverage verification after each story and final (T025, T035, T048, T057, T070, T076)
- **Principle IX**: ESM import extensions checked in T077
- **Principle XI**: Biome + typecheck after each story (T024, T034, T047, T056, T069)
- **Principle XVII**: LANGUAGE_SPEC.md updated in T078

### Performance Targets

From spec.md Success Criteria:
- **SC-004**: Import validation < 10ms overhead (verify in T025)
- **SC-007**: Constant validation < 5ms overhead (verify in T035)
- **SC-012**: Timeline event validation < 20ms overhead (verify in T048)
- **SC-016**: Control flow validation < 10ms overhead (verify in T057)
- **SC-019**: Timeline config validation < 5ms overhead (verify in T070)
- **SC-020**: Total Typir overhead < 50ms for 500 lines (verify in T072)
- **SC-021**: Total Typir overhead < 200ms for 2000 lines (verify in T072)

### Success Criteria Verification

**Checkpoint Tasks** (T082-T085):
- All 26 success criteria from spec.md
- All 25 acceptance scenarios
- All 8 edge cases
- Manual IDE verification for each user story

---

**End of Tasks Document**
