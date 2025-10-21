# Tasks: Robust Type System with Typir Integration

**Input**: Design documents from `/specs/003-type-system-the/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Tests are NOT explicitly requested in the feature specification. Test migration tasks are included to ensure existing tests continue to pass (backward compatibility requirement).

**Organization**: Tasks are grouped by user story priority to enable incremental delivery and independent testing of each story.

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1-US6)
- Include exact file paths in descriptions

## Path Conventions
- Monorepo structure: `packages/language/src/` for implementation
- Tests: `packages/language/src/__tests__/`
- Package manager: **pnpm** (not npm)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install dependencies and create basic Typir integration structure

- [X] **T001** [P] [Setup] Install Typir dependencies: `pnpm add typir typir-langium --filter @eligian/language`
- [X] **T002** [P] [Setup] Create directory `packages/language/src/type-system-typir/`
- [X] **T003** [P] [Setup] Create file `packages/language/src/type-system-typir/eligian-specifics.ts` with `EligianSpecifics` interface
- [X] **T004** [P] [Setup] Create file `packages/language/src/type-system-typir/index.ts` for public exports
- [X] **T005** [Setup] Verify setup: `pnpm run build` succeeds without errors

**Checkpoint**: Typir packages installed, directory structure created

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core Typir integration that MUST be complete before ANY user story can function

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Typir Service Integration

- [X] **T006** [Foundation] Create `packages/language/src/type-system-typir/eligian-type-system.ts` with `EligianTypeSystem` class implementing `LangiumTypeSystemDefinition<EligianSpecifics>`
- [X] **T007** [Foundation] Implement empty `onInitialize()` method in `EligianTypeSystem` (will be filled in user story phases)
- [X] **T008** [Foundation] Implement empty `onNewAstNode()` method in `EligianTypeSystem` (currently no user-defined types needed)
- [X] **T009** [Foundation] Add `typir: TypirLangiumServices<EligianSpecifics>` to `EligianAddedServices` type in `packages/language/src/eligian-module.ts`
- [X] **T010** [Foundation] Add Typir service creation in `createEligianModule()`: `typir: () => createTypirLangiumServices(shared, reflection, new EligianTypeSystem(), {})`
- [X] **T011** [Foundation] Add `initializeLangiumTypirServices(Eligian, Eligian.typir)` call in `createEligianServices()` after service creation
- [X] **T012** [Foundation] Verify Typir integration: `pnpm run build` succeeds, language server starts without errors

**Checkpoint**: Foundation ready - Typir is integrated into Langium services, user story implementation can now begin

---

## Phase 3: User Story 1 - Real-Time Type Error Detection in IDE (Priority: P1) 🎯 MVP

**Goal**: Enable real-time type error detection for operation calls, showing errors within 500ms in VS Code Problems panel

**Independent Test**: Open a `.eligian` file in VS Code, write code with intentional type mismatches (e.g., passing a string to `animate()`'s duration parameter), verify red squiggles appear with descriptive error messages

### Primitive Types and Inference Rules

- [X] **T013** [P] [US1] In `onInitialize()`: Create `stringType` primitive with inference rules for `StringLiteral` and `TypeAnnotation` (type === 'string')
- [X] **T014** [P] [US1] In `onInitialize()`: Create `numberType` primitive with inference rules for `NumberLiteral` and `TypeAnnotation` (type === 'number')
- [X] **T015** [P] [US1] In `onInitialize()`: Create `booleanType` primitive with inference rules for `BooleanLiteral` and `TypeAnnotation` (type === 'boolean')
- [X] **T016** [P] [US1] In `onInitialize()`: Create `objectType` primitive with inference rules for `ObjectLiteral` and `TypeAnnotation` (type === 'object')
- [X] **T017** [P] [US1] In `onInitialize()`: Create `arrayType` primitive with inference rules for `ArrayLiteral` and `TypeAnnotation` (type === 'array')
- [X] **T018** [P] [US1] In `onInitialize()`: Create `unknownType` using `typir.factory.Top.create({ typeName: 'unknown' })` (top type compatible with all types)

### Operation Registry Integration

- [X] **T019** [US1] In `onInitialize()`: Create helper function `mapParameterTypeToTypirType(paramType, primitives)` to map `ParameterType` enum to Typir primitive types (see research.md for mapping logic)
- [X] **T020** [US1] In `onInitialize()`: Import `OPERATION_REGISTRY` from `packages/language/src/compiler/operations/registry.generated.ts`
- [X] **T021** [US1] In `onInitialize()`: Iterate over `OPERATION_REGISTRY` entries, create function type for each operation using `typir.factory.Functions.create()`
- [X] **T022** [US1] In `onInitialize()`: For each operation function type, register inference rule for operation calls using `.inferenceRuleForCalls()` with `validateArgumentsOfFunctionCalls: true` (enables automatic type checking)

### Basic Validation Rules

- [X] **T023** [US1] In `onInitialize()`: Register validation rule for `VariableDeclaration` using `typir.validation.Collector.addValidationRulesForAstNodes()`
- [X] **T024** [US1] In validation rule: Use `typir.validation.Constraints.ensureNodeIsAssignable()` to check variable initialization type matches declaration type
- [X] **T025** [US1] In validation rule: Format error messages to match existing format: "Cannot initialize variable '{name}' with type '{actual}'. Expected '{expected}'."

### Test Migration (User Story 1)

- [X] **T026** [US1] Run existing type system tests: `pnpm run test -- type-system.spec.ts`
- [X] **T027** [US1] Fix failing type annotation syntax tests (should mostly pass - grammar unchanged)
- [X] **T028** [US1] Fix failing type checking integration tests - verify Typir error messages match expected format
- [X] **T029** [US1] Update test assertions if needed to accommodate Typir error format differences (preserve semantics)

### Cleanup (User Story 1 Scope)

- [X] **T030** [US1] Remove type checking methods from `packages/language/src/eligian-validator.ts`: `checkTypeAnnotationsInAction()`, `checkTypeAnnotationsInStartOps()`, `checkTypeAnnotationsInEndOps()`
- [X] **T031** [US1] Remove helper methods from `eligian-validator.ts`: `collectTypeAnnotations()`, `validateTypeSequence()`, all type-related check methods
- [X] **T032** [US1] Remove type checking registration from `ValidationChecks<EligianAstType>` in `eligian-validator.ts`
- [X] **T033** [US1] Verify cleanup: `pnpm run build` succeeds, no imports referencing old type system

### Integration Testing (User Story 1)

- [ ] **T034** [US1] **Manual Test**: Open VS Code, create test `.eligian` file with operation call type mismatch (e.g., `animate({opacity: 1}, "slow")`), verify red squiggle appears
- [ ] **T035** [US1] **Manual Test**: Hover over error, verify error message shows: "Type mismatch: expected 'number' but got 'string'" (or similar Typir format)
- [ ] **T036** [US1] **Manual Test**: Check VS Code Problems panel, verify error appears within 500ms of typing
- [ ] **T037** [US1] **Manual Test**: Test with variable type mismatch, verify error location is accurate
- [ ] **T038** [US1] **Manual Test**: Test with typed action parameter mismatch, verify error shows expected vs actual type

**Checkpoint**: User Story 1 complete - Real-time type error detection works in VS Code for operation calls and variable declarations. Backward compatibility maintained (all existing tests pass).

---

## Phase 4: User Story 2 - Intelligent Code Completion Based on Types (Priority: P2)

**Goal**: Enable type-aware autocomplete that filters suggestions based on expected parameter types

**Independent Test**: Trigger autocomplete (Ctrl+Space) in an operation argument position, verify suggestions prioritize variables/expressions matching the expected type

**Dependencies**: Requires US1 (type inference must be working)

### Type-Aware Completion Provider Integration

- [ ] **T039** [US2] Research Typir-Langium completion provider API (check if Typir provides built-in completion integration)
- [ ] **T040** [US2] If Typir provides completion: Ensure `eligian-module.ts` completion provider uses `typir.Inference.inferType()` to get expected type context
- [ ] **T041** [US2] If manual integration needed: Update `packages/language/src/completion/eligian-completion-provider.ts` to query Typir for expected type at cursor position
- [ ] **T042** [US2] Filter completion suggestions: Prioritize variables/parameters whose inferred type matches expected type
- [ ] **T043** [US2] Add type annotation to completion item labels (e.g., `myVar: string`)

### Integration Testing (User Story 2)

- [ ] **T044** [US2] **Manual Test**: In operation call argument position, trigger autocomplete, verify variables of matching type appear first
- [ ] **T045** [US2] **Manual Test**: In operation call argument position, verify variables of incompatible type are de-prioritized or filtered
- [ ] **T046** [US2] **Manual Test**: Inside action with typed parameters, trigger autocomplete, verify parameters show with type annotations
- [ ] **T047** [US2] **Manual Test**: Measure autocomplete relevance: 60% reduction in irrelevant suggestions in typed code sections

**Checkpoint**: User Story 2 complete - Autocomplete filters suggestions by type context, improving productivity

---

## Phase 5: User Story 3 - Type Inference for Cleaner Code (Priority: P2)

**Goal**: Automatically infer parameter types from usage patterns, reducing boilerplate type annotations

**Independent Test**: Write action with unannotated parameter passed to operation, verify type is inferred and type checking works as if annotated

**Dependencies**: Requires US1 (primitive types and operation function types must exist)

### Parameter and Variable Inference Rules

- [ ] **T048** [P] [US3] In `onInitialize()`: Register inference rule for `Parameter` nodes - if `param.typeAnnotation` exists use it, else return `InferenceRuleNotApplicable` (let Typir infer from usage)
- [ ] **T049** [P] [US3] In `onInitialize()`: Register inference rule for `VariableDeclaration` - if `typeAnnotation` exists use it, else if `initialValue` exists return it (recursive inference), else return `unknownType`
- [ ] **T050** [P] [US3] In `onInitialize()`: Register inference rule for `VariableReference` - lookup `varRef.variable?.ref` and return declaration node (Typir infers from declaration)
- [ ] **T051** [P] [US3] In `onInitialize()`: Register inference rule for `ParameterReference` - lookup `paramRef.parameter?.ref` and return declaration node

### Test Migration (User Story 3)

- [ ] **T052** [US3] Run parameter type inference tests: `pnpm run test -- type-system.spec.ts` (filter inference tests)
- [ ] **T053** [US3] Fix failing inference tests - verify Typir inference matches current constraint collection/unification behavior
- [ ] **T054** [US3] Verify conflicting type usage reports clear error: "Cannot infer type: parameter is used as both 'string' and 'number'"

### Integration Testing (User Story 3)

- [ ] **T055** [US3] **Manual Test**: Write action with unannotated parameter passed to `selectElement()`, verify no type errors (inferred as 'string')
- [ ] **T056** [US3] **Manual Test**: Write action with unannotated parameter passed to `animate()` duration, verify no type errors (inferred as 'number')
- [ ] **T057** [US3] **Manual Test**: Write action with parameter passed to both string and number operations, verify conflict error appears
- [ ] **T058** [US3] **Manual Test**: Verify inference success rate: 90% of unannotated parameters with clear usage patterns are correctly inferred

**Checkpoint**: User Story 3 complete - Type inference works for parameters and variables, reducing annotation boilerplate

---

## Phase 6: User Story 4 - Cross-Reference Type Validation (Priority: P3)

**Goal**: Validate action calls use correct argument types based on action's parameter type annotations

**Independent Test**: Define action with typed parameters, call it with incorrect types, verify error at call site

**Dependencies**: Requires US1 (primitive types), US3 (inference rules for parameters)

### Action Call Type Validation

- [ ] **T059** [US4] Research Typir support for user-defined function types (actions are similar to functions)
- [ ] **T060** [US4] If needed in `onNewAstNode()`: Create function type for each user-defined action with typed parameters
- [ ] **T061** [US4] If needed: Register inference rule for action calls to check argument types against action parameter types
- [ ] **T062** [US4] Verify cross-reference validation: Typir should automatically check action call arguments if action function types are created

### Integration Testing (User Story 4)

- [ ] **T063** [US4] **Manual Test**: Define action `fadeIn(selector: string, duration: number)`, call with `fadeIn(123, "slow")`, verify two errors at call site
- [ ] **T064** [US4] **Manual Test**: Change action parameter type, verify all call sites are re-validated and new mismatches highlighted
- [ ] **T065** [US4] **Manual Test**: Call action with variable reference argument, verify variable type is checked against parameter type

**Checkpoint**: User Story 4 complete - Cross-reference type validation works for action calls

**Note**: This user story may require investigation of Typir's function type system. If Typir doesn't automatically handle user-defined functions, we may need to create function types in `onNewAstNode()` similar to how operation function types are created.

---

## Phase 7: User Story 5 - Gradual Type Adoption (Priority: P3)

**Goal**: Enable incremental type annotation adoption without breaking existing untyped code

**Independent Test**: Take existing `.eligian` file with no type annotations, run validation, verify no new errors. Add annotations to one action, verify type checking works for that action only.

**Dependencies**: Requires US1 (unknown type behavior must be correct)

### Backward Compatibility Validation

- [ ] **T066** [US5] Verify `unknownType` is properly configured as top type (compatible with all types in both directions)
- [ ] **T067** [US5] Verify parameters without annotations and no usage constraints remain `unknown` type
- [ ] **T068** [US5] Run full test suite: `pnpm run test` - all 298 tests must pass
- [ ] **T069** [US5] Fix any test failures related to untyped code generating false errors

### Integration Testing (User Story 5)

- [ ] **T070** [US5] **Manual Test**: Open existing `.eligian` file with no type annotations, verify no new type errors appear
- [ ] **T071** [US5] **Manual Test**: Add type annotation to one action parameter, verify type checking applies to that action only
- [ ] **T072** [US5] **Manual Test**: In file with mixed typed/untyped actions, verify typed action can call untyped action without false errors
- [ ] **T073** [US5] **Manual Test**: Verify 100% backward compatibility: all existing Eligian code works unchanged

**Checkpoint**: User Story 5 complete - Gradual type adoption works, backward compatibility verified

**Note**: This story is primarily validation-focused. The actual gradual typing behavior should already work if US1-US3 are implemented correctly (unknown type handling).

---

## Phase 8: User Story 6 - Complex Type Scenarios Support (Priority: P4)

**Goal**: Handle type checking in complex scenarios: if/else branches, for loops, nested operations

**Independent Test**: Write action with if/else, introduce type error in each branch, verify both errors detected with correct branch context

**Dependencies**: Requires US1-US3 (basic type checking and inference)

### Control Flow Type Checking

- [ ] **T074** [US6] Research Typir support for control flow type checking (if/else, for loops)
- [ ] **T075** [US6] If needed: Implement type environment cloning for if/else branches (Typir may handle automatically)
- [ ] **T076** [US6] If needed: Implement iterator type inference for `for` loops based on array element type
- [ ] **T077** [US6] Verify Typir handles nested operation sequences correctly

### Integration Testing (User Story 6)

- [ ] **T078** [US6] **Manual Test**: Write action with if/else, introduce type error in both branches, verify both errors reported with correct branch context
- [ ] **T079** [US6] **Manual Test**: Write action with for loop, use iterator with wrong type, verify error message references iterator correctly
- [ ] **T080** [US6] **Manual Test**: Write action calling another action in sequence, verify end-to-end call chain validation

**Checkpoint**: User Story 6 complete - Complex type scenarios are supported

**Note**: This story may require minimal work if Typir handles control flow automatically. Investigation (T074) will determine the scope.

---

## Phase 9: Final Cleanup and Documentation

**Purpose**: Remove old type system, update documentation, final testing

### Old Type System Removal

- [ ] **T081** [Cleanup] Delete directory `packages/language/src/type-system/` (custom type system)
- [ ] **T082** [Cleanup] Search codebase for imports from `type-system/`, remove or update to `type-system-typir/`
- [ ] **T083** [Cleanup] Verify deletion: `pnpm run build` succeeds, no broken imports

### Documentation Updates

- [ ] **T084** [P] [Cleanup] Update `packages/language/src/type-system-typir/README.md` with Typir integration details (if README exists, otherwise skip)
- [ ] **T085** [P] [Cleanup] Update `CLAUDE.md` with note about Typir migration and reference to local Typir documentation at `f:/projects/typir/`
- [ ] **T086** [P] [Cleanup] Create example file `examples/type-checking-demo.eligian` demonstrating type annotations, inference, and error detection

### Final Testing and Validation

- [ ] **T087** [Cleanup] Run full test suite: `pnpm run test` - all 298 tests must pass
- [ ] **T088** [Cleanup] Run Biome check: `pnpm run check` - 0 errors, 0 warnings
- [ ] **T089** [Cleanup] **Performance Test**: Measure type checking overhead on typical file (100-200 lines) - must be < 50ms
- [ ] **T090** [Cleanup] **Performance Test**: Measure type checking overhead on large file (1000+ lines) - must be < 200ms
- [ ] **T091** [Cleanup] **Performance Test**: Measure IDE responsiveness - type errors must appear within 500ms of typing
- [ ] **T092** [Cleanup] **Performance Test**: Test large file support - file with 50+ action definitions, 1000+ lines - verify no lag

### Success Criteria Validation

- [ ] **T093** [Cleanup] Verify all 298 existing tests pass (including 25 type system tests)
- [ ] **T094** [Cleanup] Verify type errors appear in IDE within 500ms
- [ ] **T095** [Cleanup] Verify autocomplete filters by type (60% reduction in irrelevant suggestions - manual assessment)
- [ ] **T096** [Cleanup] Verify 100% backward compatibility (untyped code works unchanged)
- [ ] **T097** [Cleanup] Verify error messages match existing format (95% similarity - manual review of sample errors)
- [ ] **T098** [Cleanup] Verify no performance regression (< 50ms for typical files)

**Checkpoint**: All user stories complete, old code removed, documentation updated, all success criteria met

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup (Phase 1) - BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational (Phase 2) - MVP priority
- **User Story 2 (Phase 4)**: Depends on User Story 1 (type inference must work)
- **User Story 3 (Phase 5)**: Depends on User Story 1 (primitive types must exist) - Can run in parallel with US2
- **User Story 4 (Phase 6)**: Depends on User Story 1 and 3 (needs primitives and inference)
- **User Story 5 (Phase 7)**: Depends on User Story 1-3 (validation of existing behavior)
- **User Story 6 (Phase 8)**: Depends on User Story 1-3 (builds on basic type checking)
- **Final Cleanup (Phase 9)**: Depends on all desired user stories being complete

### User Story Dependencies Graph

```
Setup (Phase 1)
    ↓
Foundational (Phase 2) [BLOCKS ALL]
    ↓
    ├─→ US1: Real-Time Type Error Detection (P1) 🎯 MVP
    │       ↓
    │       ├─→ US2: Intelligent Code Completion (P2)
    │       │
    │       ├─→ US3: Type Inference (P2) [can run parallel with US2]
    │       │       ↓
    │       │       ├─→ US4: Cross-Reference Validation (P3)
    │       │       │
    │       │       ├─→ US5: Gradual Type Adoption (P3) [validation only]
    │       │       │
    │       │       └─→ US6: Complex Scenarios (P4)
    │       │
    │       └─→ (US2 and US3 can merge)
    │               ↓
    └───────────────→ Final Cleanup (Phase 9)
```

### Within Each User Story

- Tests (if any) BEFORE implementation
- Primitive types BEFORE operation function types (US1)
- Inference rules AFTER primitive types (US1, US3)
- Validation rules AFTER inference rules (US1)
- Manual testing AFTER implementation
- Checkpoint validation BEFORE moving to next story

### Parallel Opportunities

**Phase 1 (Setup)**: All tasks can run in parallel (T001-T004 all marked [P])

**Phase 2 (Foundational)**: Sequential execution required (service integration tasks depend on each other)

**Phase 3 (US1)**:
- T013-T018 (primitive types) can run in parallel - all [P]
- T026-T029 (test migration) can run in parallel after T025
- T030-T033 (cleanup) can run in parallel after tests pass

**After Foundational**:
- US2 and US3 can be worked on in parallel by different developers (after US1)
- US4, US5, US6 can be worked on in parallel by different developers (after US1-US3)

---

## Parallel Example: User Story 1 (Primitive Types)

```bash
# Launch all primitive type creation tasks together:
# T013: Create stringType primitive
# T014: Create numberType primitive
# T015: Create booleanType primitive
# T016: Create objectType primitive
# T017: Create arrayType primitive
# T018: Create unknownType top type

# All can run in parallel - different primitive types, no dependencies
```

---

## Parallel Example: Test Migration (User Story 1)

```bash
# Launch all test migration tasks together (after T025):
# T026: Run existing tests
# T027: Fix type annotation syntax tests
# T028: Fix type checking integration tests
# T029: Update test assertions

# All can run in parallel if different test categories
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T005) - ~30 minutes
2. Complete Phase 2: Foundational (T006-T012) - ~2 hours
3. Complete Phase 3: User Story 1 (T013-T038) - ~8-12 hours
4. **STOP and VALIDATE**: Test User Story 1 independently (T034-T038)
5. If validation passes: MVP is ready! Real-time type error detection works.
6. Can deploy/demo at this point

**Estimated MVP Timeline**: 11-15 hours

### Incremental Delivery

1. **Foundation** (Setup + Foundational) → ~2.5 hours → Typir integrated
2. **MVP** (+ User Story 1) → ~11-15 hours → Type error detection works!
3. **Enhanced** (+ User Story 2) → +3-4 hours → Smart autocomplete
4. **Complete** (+ User Story 3) → +3-4 hours → Type inference
5. **Advanced** (+ User Story 4-6) → +4-6 hours → Cross-ref, gradual typing, complex scenarios
6. **Polish** (+ Final Cleanup) → +2-3 hours → Documentation, performance validation

**Total Timeline**: 23-33 hours (matches quickstart.md estimate)

### Parallel Team Strategy

With 2-3 developers after Foundational phase completes:

1. **Week 1**: All developers complete Setup + Foundational together
2. **Week 1-2**:
   - Developer A: User Story 1 (MVP)
   - Developer B: Research US2 (completion integration)
   - Developer C: Research US3 (inference patterns in Typir examples)
3. **Week 2**:
   - Developer A: US2 (builds on US1)
   - Developer B: US3 (parallel with US2)
   - Developer C: US4 preparation
4. **Week 3**:
   - Developer A: Final Cleanup
   - Developer B: US5 (validation)
   - Developer C: US6 (complex scenarios)

---

## Notes

- **[P]** tasks = different files, no dependencies, can run in parallel
- **[Story]** label (US1-US6) maps task to specific user story for traceability
- Each user story should be independently completable and testable
- **pnpm**, not npm - use `pnpm add`, `pnpm run build`, `pnpm run test`
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Run `pnpm run check` (Biome) after each task to ensure code quality
- Verify tests don't break backward compatibility (all 298 tests must pass)
- Manual testing in VS Code is critical for IDE integration validation
- Performance targets: < 50ms overhead for typical files, < 500ms IDE response time

### Estimated Effort by Phase

| Phase | Tasks | Estimated Time |
|-------|-------|----------------|
| Phase 1: Setup | T001-T005 | 30 min |
| Phase 2: Foundational | T006-T012 | 2 hours |
| Phase 3: US1 | T013-T038 | 8-12 hours |
| Phase 4: US2 | T039-T047 | 3-4 hours |
| Phase 5: US3 | T048-T058 | 3-4 hours |
| Phase 6: US4 | T059-T065 | 2-3 hours |
| Phase 7: US5 | T066-T073 | 1-2 hours |
| Phase 8: US6 | T074-T080 | 2-3 hours |
| Phase 9: Cleanup | T081-T098 | 2-3 hours |
| **Total** | **98 tasks** | **23-33 hours** |

### Key Risks and Mitigation

- **Risk**: Typir API doesn't support feature we need (e.g., action call validation)
  - **Mitigation**: Research tasks (T039, T059, T074) identify gaps early, fallback to manual implementation
- **Risk**: Performance regression in large files
  - **Mitigation**: Performance tests (T089-T092) in final cleanup catch issues before completion
- **Risk**: Test migration reveals incompatibility
  - **Mitigation**: Test migration in US1 (T026-T029) allows early detection, adjustment of approach

### Success Indicators

- ✅ All 298 tests pass (T093)
- ✅ Type errors appear within 500ms in IDE (T094)
- ✅ Autocomplete 60% more relevant (T095)
- ✅ 100% backward compatibility (T096)
- ✅ Error messages match format (T097)
- ✅ No performance regression (T098)
