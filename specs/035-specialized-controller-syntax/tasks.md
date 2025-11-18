# Tasks: Specialized Controller Syntax

**Input**: Design documents from `/specs/035-specialized-controller-syntax/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Test-first development (RED-GREEN-REFACTOR) as per Constitution Principle II

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure) ✅ COMPLETE

**Purpose**: Project initialization and metadata generation infrastructure

- [x] **T001** [P] [Setup] Run `pnpm run langium:generate` to regenerate Langium artifacts (ensures clean baseline)
- [x] **T002** [Setup] Verify Eligius npm package exports ctrlmetadata (inspect `node_modules/eligius/src/index.ts` for `export * as ctrlmetadata`)
- [x] **T003** [P] [Setup] Run existing tests to establish baseline (`pnpm test` - all existing tests must pass before proceeding)

---

## Phase 2: Foundational (Blocking Prerequisites) ✅ COMPLETE

**Purpose**: Controller metadata generation - MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: All user stories depend on generated controller metadata being available

### Metadata Generation

- [x] **T004** [Foundation] Modify `packages/language/src/completion/generate-metadata.ts`:
  - Add `ctrlmetadata` to import statement (line 13): `import { eventmetadata, metadata, ctrlmetadata } from 'eligius';`
  - Add `generateControllersMetadata()` function (similar to `generateTimelineEventsMetadata()` at lines 155-212)
  - Call `generateControllersMetadata(ctrlmetadata)` in `main()` function
  - Use contract interface from `specs/035-specialized-controller-syntax/contracts/metadata-generator.contract.ts` as guide

- [x] **T005** [Foundation] Run `tsx packages/language/src/completion/generate-metadata.ts` to generate `packages/language/src/completion/metadata/controllers.generated.ts`
  - Verify file contains 8 controller metadata objects
  - Verify CONTROLLERS constant array is exported
  - Verify structure matches `ControllerMetadata` interface from data-model.md

- [x] **T006** [P] [Foundation] Test metadata generation script:
  - Create `packages/language/src/completion/__tests__/generate-metadata.spec.ts`
  - Test: ctrlmetadata import succeeds
  - Test: All 8 controllers generated
  - Test: LabelController has labelId parameter with type 'ParameterType:labelId'
  - Test: NavigationController has json parameter with type 'ParameterType:object'

**Checkpoint**: Foundation ready - controller metadata available, user story implementation can now begin in parallel ✅

---

## Phase 3: User Story 1 - Universal Controller Addition Syntax (Priority: P1) 🎯 MVP ✅ COMPLETE

**Goal**: Implement `addController` syntax for ALL 8 controllers with parameter validation (count, type, unknown controller names)

**Independent Test**: Write `addController` statements for multiple controller types and verify: (1) compilation to correct JSON, (2) parameter count errors, (3) unknown controller errors

### Tests for User Story 1 (Test-First - RED phase)

**Write these tests FIRST, ensure they FAIL before implementation**

- [x] **T007** [P] [US1] Create `packages/language/src/__tests__/controller-validation.spec.ts`:
  - Import `createTestContext()`, `DiagnosticSeverity` from `test-helpers.js`
  - Test: Unknown controller name → error with code 'unknown_controller'
  - Test: Missing required parameter → error with code 'missing_required_parameter'
  - Test: Too many parameters → error with code 'too_many_parameters'
  - Test: Valid LabelController call with required parameter only → no errors
  - Test: Valid LabelController call with required + optional parameters → no errors
  - Test: Valid NavigationController call → no errors
  - Use `beforeAll(() => { ctx = createTestContext(); })` pattern

- [x] **T008** [P] [US1] Create `packages/language/src/__tests__/controller-transformation.spec.ts`:
  - Test: `addController('NavigationController', {pages: ["home"]})` transforms to `getControllerInstance` + `addControllerToElement`
  - Test: `addControllerToElement` operationData has correct structure
  - Test: `addController('NavigationController', {json: data})` transforms correctly
  - Test: Parameter mapping (JSON object parameters) for controllers

- [x] **T009** [US1] Run tests - verify ALL fail (RED phase): `pnpm --filter @eligian/language test controller`

### Implementation for User Story 1 (GREEN phase)

- [x] **T010** [US1] Add controller validation to `packages/language/src/eligian-validator.ts`:
  - Import `CONTROLLERS` from `./completion/metadata/controllers.generated.js`
  - Add `checkControllerCall(call: OperationCall, accept: ValidationAcceptor)` method
  - Implement controller name lookup (check if first arg string literal matches CONTROLLERS)
  - Implement parameter count validation (required vs provided)
  - Implement parameter type AST-level validation (no deep structural checks):
    - string: argument is StringLiteral or VariableRef node
    - number: argument is NumberLiteral or VariableRef node
    - object: argument is ObjectLiteral or VariableRef node
    - array: argument is ArrayLiteral or VariableRef node
    - (Type validation based on AST node type, not runtime value validation)
  - Use error codes from `specs/035-specialized-controller-syntax/contracts/controller-validator.contract.ts`
  - Add Levenshtein distance suggestions for controller name typos (reuse `packages/language/src/css/levenshtein.ts`)

- [x] **T011** [US1] Add controller transformation to `packages/language/src/compiler/ast-transformer.ts`:
  - Import `CONTROLLERS` from `../completion/metadata/controllers.generated.js`
  - Add `transformAddController(call: OperationCall)` method
  - Detect controller calls (first arg is known controller name)
  - Extract controller name from first argument
  - Map remaining arguments to parameter names using controller metadata order
  - Generate `getControllerInstance` operation with controller systemName
  - Generate `addControllerToElement` operation with parameter object
  - Preserve source location for debugging

- [x] **T012** [US1] Run tests - verify tests PASS (GREEN phase): `pnpm --filter @eligian/language test controller`

- [x] **T013** [US1] Run Biome formatting and linting: `pnpm run check`
  - Fix any formatting/linting issues

- [x] **T014** [P] [US1] Add integration test in `packages/language/src/__tests__/controller-compiler.spec.ts`:
  - End-to-end: DSL source with `addController` → parse → validate → transform → JSON output
  - Snapshot test: Verify JSON structure matches expected Eligius format
  - Test multiple controllers in single action
  - Test controllers in timeline events

**Checkpoint**: User Story 1 complete - ALL controllers work with basic validation, transformation tested, compiles to correct JSON ✅

**Commit**: `ee5bd22` - feat(035): Implement universal controller addition syntax (US1 - MVP)

---

## Phase 4: User Story 2 - Label ID Type Validation (Priority: P2) ✅ COMPLETE

**Goal**: Add specialized label ID validation for LabelController using Feature 034 infrastructure with Levenshtein suggestions

**Independent Test**: Write `addController('LabelController', "labelId")` with valid/invalid/typo labels and verify diagnostics with suggestions

### Tests for User Story 2 (Test-First - RED phase)

- [x] **T015** [P] [US2] Add to `packages/language/src/__tests__/controller-validation.spec.ts`:
  - Test: Valid label ID (exists in imported labels.json) → no errors
  - Test: Invalid label ID (doesn't exist) → error with code 'unknown_label_id'
  - Test: Typo label ID (within Levenshtein distance 2) → error includes "Did you mean: ..."
  - Test: No label imports → warning/error indicates no labels available for validation
  - Use manual parse + setup + validate pattern (adapted for labels)

- [x] **T016** [US2] Run tests - verify new tests FAIL (RED phase): `pnpm --filter @eligian/language test controller-validation`

### Implementation for User Story 2 (GREEN phase)

- [x] **T017** [US2] Modify `checkControllerCall()` in `packages/language/src/eligian-validator.ts`:
  - Import `validateLabelID` from `./type-system-typir/validation/label-id-validation.js`
  - Access LabelRegistryService via `this.services.labels.LabelRegistry`
  - For controller name 'LabelController':
    - Extract label ID from first parameter (must be string literal)
    - Get document URI from AST node
    - Call `validateLabelID(documentUri, labelId, labelRegistry)`
    - If invalid: generate error with Levenshtein suggestions
    - Use existing validateLabelID utility from Feature 034

- [x] **T018** [US2] Run tests - verify tests PASS (GREEN phase): `pnpm --filter @eligian/language test controller-validation`

- [x] **T019** [US2] Run Biome check: `pnpm run check`

- [x] **T020** [P] [US2] Add edge case tests:
  - Test: Multiple label controllers in same document → all validated independently
  - Test: Label ID with special characters validates correctly

**Checkpoint**: User Story 2 complete - Label ID validation works with typo suggestions, Feature 034 integration tested ✅

**Commit**: `a2ef62a` - feat(035): Add label ID validation for LabelController (US2)

**Note**: Updated US1 tests and compiler tests to properly set up labels for LabelController (required due to validation)

---

## Phase 5: User Story 3 - IDE Support with Autocomplete and Hover (Priority: P3)

**Goal**: Add IDE autocomplete for controller names and parameters, plus hover documentation

**Independent Test**: Trigger autocomplete/hover in VS Code and verify suggestions/documentation appear

### Tests for User Story 3 (Test-First - RED phase)

- [ ] **T021** [P] [US3] Create `packages/language/src/__tests__/controller-completion.spec.ts`:
  - Import `EligianCompletionProvider` from `../eligian-completion-provider.js`
  - Test: Autocomplete at `addController('|')` → returns all 8 controller names
  - Test: Controller suggestions include descriptions
  - Test: Autocomplete at `addController('LabelController', '|')` → returns label IDs (if labels imported)
  - Use mock CompletionParams with cursor position

- [ ] **T022** [P] [US3] Create `packages/language/src/__tests__/controller-hover.spec.ts`:
  - Import `EligianHoverProvider` from `../eligian-hover-provider.js`
  - Test: Hover on 'LabelController' → shows controller description + parameters
  - Test: Hover on label ID parameter → shows label metadata (translation count, languages)
  - Use mock HoverParams with cursor position

- [ ] **T023** [US3] Run tests - verify tests FAIL (RED phase): `pnpm --filter @eligian/language test controller-completion controller-hover`

### Implementation for User Story 3 (GREEN phase)

- [ ] **T024** [US3] Modify `packages/language/src/eligian-completion-provider.ts`:
  - Import `CONTROLLERS` from `./completion/metadata/controllers.generated.js`
  - Add `provideControllerNames()` method:
    - Detect cursor in `addController('|')` position
    - Return all controller names as CompletionItems
    - Set kind: CompletionItemKind.Class
    - Set documentation from controller metadata
  - Add `provideControllerParameters()` method:
    - Detect cursor in parameter position
    - Extract controller name from first argument
    - Lookup controller metadata
    - For labelId parameters: return label IDs from LabelRegistryService
    - For other types: return type hint only
  - Integrate into existing `getCompletion()` method

- [ ] **T025** [US3] Modify `packages/language/src/eligian-hover-provider.ts`:
  - Import `CONTROLLERS` from `./completion/metadata/controllers.generated.js`
  - Add `provideControllerHover()` method:
    - Format controller description as markdown
    - List required parameters with types
    - List optional parameters with defaults
    - Show dependency information
  - Add `provideParameterHover()` method:
    - For labelId: call LabelRegistryService to get label metadata
    - Format parameter documentation with type and description
  - Integrate into existing `getHoverContent()` method

- [ ] **T026** [US3] Run tests - verify tests PASS (GREEN phase): `pnpm --filter @eligian/language test controller-completion controller-hover`

- [ ] **T027** [US3] Run Biome check: `pnpm run check`

- [ ] **T028** [P] [US3] Manual VS Code test:
  - Open `.eligian` file in VS Code
  - Type `addController('` and trigger autocomplete (Ctrl+Space) → verify controller names appear
  - Select `LabelController` and move to second parameter → verify label IDs appear (if labels imported)
  - Hover over controller name → verify documentation appears
  - Verify performance: autocomplete <300ms (per SC-005)

**Checkpoint**: User Story 3 complete - IDE support works, autocomplete and hover tested, performance verified

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final touches, performance validation, comprehensive testing

- [ ] **T029** [P] [Polish] Add comprehensive test coverage:
  - Verify test coverage ≥80% (`pnpm test:coverage`)
  - Add missing unit tests for edge cases
  - Test backwards compatibility (old operation-based syntax still works)

- [ ] **T030** [P] [Polish] Performance benchmarking:
  - Validate controller name lookup <1ms
  - Validate parameter validation <10ms per addController call
  - Validate metadata generation <500ms at build time
  - Validate IDE autocomplete <300ms (SC-005)

- [ ] **T031** [P] [Polish] Quickstart validation:
  - Follow all examples in `specs/035-specialized-controller-syntax/quickstart.md`
  - Verify all 8 controllers compile correctly
  - Verify all error scenarios produce expected messages
  - Verify IDE support works as documented

- [ ] **T032** [Polish] Documentation updates:
  - Update CLAUDE.md with Specialized Controller Syntax section
  - Add example to LANGUAGE_SPEC.md (if applicable)
  - Update README.md with feature mention

- [ ] **T033** [P] [Polish] Run full test suite:
  - `pnpm -w run test` - all tests across all packages must pass
  - `pnpm -w run typecheck` - no TypeScript errors
  - `pnpm -w run build` - clean build

- [ ] **T034** [Polish] Biome final check: `pnpm run check` - zero errors, zero warnings

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3, 4, 5)**: All depend on Foundational phase completion
  - US1 (P1) can start immediately after Foundation
  - US2 (P2) depends on US1 (extends validation)
  - US3 (P3) depends on US1 (uses metadata), can run parallel with US2 if staffed
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Depends on Foundational (T004-T006) - Foundation provides CONTROLLERS metadata
- **User Story 2 (P2)**: Depends on User Story 1 (T010) - Extends checkControllerAddition() method
- **User Story 3 (P3)**: Depends on User Story 1 (CONTROLLERS metadata) - Can run parallel with US2

### Within Each User Story

- Tests (T007-T009, T015-T016, T021-T023) MUST be written FIRST and FAIL
- Implementation tasks follow test tasks
- Biome check runs after implementation
- Integration tests run after unit tests pass

### Parallel Opportunities

**Phase 1 (Setup)**: All tasks [P] can run in parallel (T001, T002, T003)

**Phase 2 (Foundation)**: Sequential (metadata generation must complete before tests)

**Phase 3 (US1 Tests)**: T007, T008 can run in parallel [P]

**Phase 3 (US1 Implementation)**: T010, T011 can run in parallel [P] (different files)

**Phase 4 (US2)**: Sequential (depends on US1 completion)

**Phase 5 (US3 Tests)**: T021, T022 can run in parallel [P]

**Phase 5 (US3 Implementation)**: T024, T025 can run in parallel [P] (different files)

**Phase 6 (Polish)**: T029, T030, T031, T033 can run in parallel [P]

---

## Parallel Example: User Story 1 Tests

```bash
# Launch all tests for User Story 1 together:
Task: "[US1] Create controller-validation.spec.ts with unknown controller, missing param, too many param tests"
Task: "[US1] Create controller-transformation.spec.ts with transformation and parameter mapping tests"

# Both tasks create independent test files - can be done in parallel
```

---

## Parallel Example: User Story 1 Implementation

```bash
# After tests are written and failing (RED phase):
Task: "[US1] Add controller validation to eligian-validator.ts"
Task: "[US1] Add controller transformation to ast-transformer.ts"

# Both tasks modify different files - can be done in parallel
# Run tests after both complete to enter GREEN phase
```

---

## Parallel Example: User Story 3 Implementation

```bash
# After tests are written and failing:
Task: "[US3] Modify eligian-completion-provider.ts with controller autocomplete"
Task: "[US3] Modify eligian-hover-provider.ts with controller hover documentation"

# Different files - can be done in parallel
```

---

## Implementation Strategy

### MVP Scope (Minimum Viable Product)

**Just User Story 1 (P1)** delivers:
- ✅ `addController` syntax for all 8 controllers
- ✅ Parameter count validation
- ✅ Parameter type validation
- ✅ Unknown controller detection with suggestions
- ✅ Transformation to Eligius JSON
- ✅ Backwards compatibility

**Deploy Decision**: US1 alone is production-ready and delivers core value

### Incremental Delivery

**MVP (US1)**: Core syntax + basic validation → Deploy
**MVP + US2**: Add label ID validation with typo suggestions → Deploy
**Full Feature (US1 + US2 + US3)**: Add IDE support → Deploy

**Recommendation**: Deploy after each user story completion for faster user feedback

### Test-First Development (RED-GREEN-REFACTOR)

**Required per Constitution Principle II**:

1. **RED**: Write tests first, ensure they FAIL
   - US1: T007-T009 → Run tests → All fail ❌
   - US2: T015-T016 → Run tests → All fail ❌
   - US3: T021-T023 → Run tests → All fail ❌

2. **GREEN**: Implement minimum code to pass tests
   - US1: T010-T012 → Run tests → All pass ✅
   - US2: T017-T018 → Run tests → All pass ✅
   - US3: T024-T026 → Run tests → All pass ✅

3. **REFACTOR**: Clean up, optimize, format
   - Each US: Biome check, performance validation
   - Polish phase: Final refactoring

### Estimated Effort

**Phase 2 (Foundation)**: 2-3 hours (metadata generation)
**Phase 3 (US1)**: 6-8 hours (core validation + transformation)
**Phase 4 (US2)**: 3-4 hours (label ID validation)
**Phase 5 (US3)**: 4-6 hours (IDE support)
**Phase 6 (Polish)**: 2-3 hours (testing, docs)

**Total**: 17-24 hours (2-3 days for one developer)

---

## Task Summary

**Total Tasks**: 34
**Setup**: 3 tasks
**Foundation**: 3 tasks (BLOCKING)
**User Story 1 (P1)**: 8 tasks (core MVP)
**User Story 2 (P2)**: 6 tasks (label validation)
**User Story 3 (P3)**: 8 tasks (IDE support)
**Polish**: 6 tasks

**Parallel Opportunities**: 15 tasks marked [P]

**Test Tasks**: 9 tasks (test-first for all user stories)
**Implementation Tasks**: 13 tasks
**Validation Tasks**: 9 tasks (Biome, performance, coverage)
**Documentation Tasks**: 3 tasks

**Critical Path**: Setup → Foundation (BLOCKING) → US1 → US2 → US3 → Polish

**MVP Delivery**: Foundation + US1 (11 tasks total)
