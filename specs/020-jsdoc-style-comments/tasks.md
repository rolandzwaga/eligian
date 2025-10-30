# Tasks: JSDoc-Style Documentation Comments for Custom Actions

**Feature Branch**: `020-jsdoc-style-comments`
**Input**: Design documents from `/specs/020-jsdoc-style-comments/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Test-First Development (TDD) is REQUIRED per Constitution Principle VII. All tests must be written FIRST and FAIL before implementation begins (RED-GREEN-REFACTOR cycle).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [ ] T001 [P] Create directory structure: `packages/language/src/jsdoc/` with `__tests__/` subdirectory
- [ ] T002 [P] Create directory structure: `packages/compiler/src/jsdoc/` with `__tests__/` subdirectory
- [ ] T003 [P] Create directory structure: `packages/language/src/__tests__/jsdoc-integration/` for end-to-end IDE tests

---

## Phase 2: User Story 1 - Write Action Documentation (Priority: P1) 🎯 MVP

**Goal**: Enable developers to write JSDoc-style documentation comments (`/** ... */`) above custom action definitions with description text and `@param` tags

**Independent Test**: Can be fully tested by writing documentation comments above action definitions and verifying they are recognized by the language parser without errors

### Tests for User Story 1 (RED Phase - Write Failing Tests FIRST)

**⚠️ CRITICAL**: These tests MUST be written FIRST and MUST FAIL before any implementation code is written

- [ ] T004 [P] [US1] Create test file `packages/language/src/jsdoc/__tests__/jsdoc-parser.spec.ts` with failing unit tests:
  - Test: Parse JSDoc with description only (no params) → expect structured JSDocComment
  - Test: Parse JSDoc with `@param {type} name description` → expect JSDocParam with all fields
  - Test: Parse JSDoc with `@param name` (no type or description) → expect JSDocParam with name only
  - Test: Parse JSDoc with multiple `@param` tags → expect params array in correct order
  - Test: Parse malformed JSDoc (missing name in `@param`) → expect graceful degradation (null or partial)
  - Test: Parse JSDoc with markdown in description → expect markdown preserved
  - Test: Parse JSDoc with whitespace and line breaks in description → expect whitespace preserved (FR-007)
  - Test: Parse non-documentation comment `/* ... */` (single asterisk) → expect null/ignored (FR-018)
  - **Expected result at this stage**: ALL TESTS FAIL (parser doesn't exist yet)

- [ ] T005 [P] [US1] Create test file `packages/language/src/__tests__/parsing.spec.ts` additions with failing grammar tests:
  - Test: Parse action definition with JSDoc comment above → expect `$comment` property populated
  - Test: Parse action definition without JSDoc → expect `$comment` undefined
  - Test: Parse action with JSDoc containing `@param` tags → expect `$comment` contains raw JSDoc text
  - Test: Parse action with JSDoc separated by blank line → expect `$comment` undefined (only immediate association per FR-017)
  - Test: Parse action with non-doc comment `/* ... */` above → expect `$comment` undefined (FR-018)
  - **Expected result at this stage**: ALL TESTS FAIL (grammar extension doesn't exist yet)

- [ ] T006 [P] [US1] Create test file `packages/compiler/src/jsdoc/__tests__/jsdoc-extractor.spec.ts` with failing unit tests:
  - Test: Extract JSDoc from ActionDefinition with `$comment` → expect JSDocComment structure
  - Test: Extract JSDoc from ActionDefinition without `$comment` → expect null
  - Test: Extract JSDoc with mismatched param names → expect JSDoc returned as-is (no validation)
  - **Expected result at this stage**: ALL TESTS FAIL (extractor doesn't exist yet)

**Checkpoint**: Verify all User Story 1 tests are written and FAILING before proceeding to implementation

### Implementation for User Story 1 (GREEN Phase - Make Tests Pass)

**⚠️ Do NOT start implementation until all tests above are written and failing**

- [ ] T007 [US1] Extend Langium grammar in `packages/language/src/eligian.langium`:
  - Enable automatic JSDoc comment capture using Langium's `$comment` property feature
  - Verify grammar allows `/** ... */` comments directly above action definitions
  - Regenerate AST types by running `pnpm run langium:generate`
  - **Test validation**: Run T005 grammar tests → should now PASS

- [ ] T008 [US1] Implement JSDoc parser in `packages/language/src/jsdoc/jsdoc-parser.ts`:
  - Export `JSDocComment` interface (description: string, params: JSDocParam[])
  - Export `JSDocParam` interface (type?: string, name: string, description?: string)
  - Implement `parseJSDoc(commentText: string): JSDocComment | null` function:
    - Extract description text (everything before first `@param` tag)
    - Extract `@param` tags using regex: `/@param\s+(?:\{([^}]+)\})?\s+(\w+)\s*(.*)/`
    - Return structured JSDocComment object
    - Handle malformed JSDoc gracefully (return null on critical failure, partial on minor issues)
  - **Test validation**: Run T004 parser tests → should now PASS

- [ ] T009 [US1] Implement JSDoc extractor in `packages/compiler/src/jsdoc/jsdoc-extractor.ts`:
  - Export pure function `extractJSDoc(actionDef: ActionDefinition): JSDocComment | null`
  - Check for `actionDef.$comment` property
  - If present, call `parseJSDoc` from language package
  - Return parsed result or null
  - **Test validation**: Run T006 extractor tests → should now PASS

- [ ] T010 [US1] Run all User Story 1 tests together: `pnpm --filter @eligian/language test jsdoc-parser && pnpm --filter @eligian/language test parsing && pnpm --filter @eligian/compiler test jsdoc-extractor`
  - **Expected result**: ALL User Story 1 tests PASS (GREEN phase complete)

- [ ] T011 [US1] Run Biome code quality checks: `pnpm run check`
  - Fix any linting or formatting issues
  - **Expected result**: 0 errors, 0 warnings

- [ ] T012 [US1] Run TypeScript type checking: `pnpm run build`
  - Fix any TypeScript compilation errors
  - **Expected result**: Build succeeds with no type errors

**Checkpoint**: User Story 1 should be fully functional - developers can write JSDoc comments that are parsed correctly

---

## Phase 3: User Story 2 - Auto-Generate Documentation Templates (Priority: P2)

**Goal**: When developers type `/**` above an action definition, automatically generate a documentation template with placeholders for description and `@param` tags for each parameter, with types pre-filled using existing type inference

**Independent Test**: Can be fully tested by typing `/**` above various action definitions and verifying the generated template matches the action signature, without needing hover functionality

### Tests for User Story 2 (RED Phase - Write Failing Tests FIRST)

**⚠️ CRITICAL**: These tests MUST be written FIRST and MUST FAIL before any implementation code is written

- [ ] T013 [P] [US2] Create test file `packages/language/src/jsdoc/__tests__/jsdoc-template-generator.spec.ts` with failing unit tests:
  - Test: Generate template for action with no parameters → expect only description placeholder
  - Test: Generate template for action with typed parameter `(foo: string)` → expect `@param {string} foo`
  - Test: Generate template for action with untyped parameter → expect `@param {unknown} foo` (type inference unavailable in unit test)
  - Test: Generate template for action with 5 parameters → expect 5 `@param` lines in correct order
  - Test: Generate template for action with 20 parameters → expect 20 `@param` lines (performance test)
  - Test: Verify generated template includes blank description line ` * ` after opening `/**` (FR-011)
  - **Expected result at this stage**: ALL TESTS FAIL (generator doesn't exist yet)

- [ ] T014 [P] [US2] Create test file `packages/language/src/__tests__/jsdoc-integration/jsdoc-completion.spec.ts` with failing integration tests:
  - Test: Type `/**` on line above action with typed params → expect completion item with full template
  - Test: Type `/**` on line above action with untyped params → expect completion with type-inferred `@param` tags
  - Test: Type `/**` on line above action with no params → expect completion with only description placeholder
  - Test: Type `/**` on line NOT above an action → expect no JSDoc completion (standard completion)
  - Test: Completion trigger character is `*` → expect completion provider registered correctly
  - **Expected result at this stage**: ALL TESTS FAIL (completion provider extension doesn't exist yet)

**Checkpoint**: Verify all User Story 2 tests are written and FAILING before proceeding to implementation

### Implementation for User Story 2 (GREEN Phase - Make Tests Pass)

**⚠️ Do NOT start implementation until all tests above are written and failing**

- [ ] T015 [US2] Implement JSDoc template generator in `packages/language/src/jsdoc/jsdoc-template-generator.ts`:
  - Export `generateJSDocTemplate(action: ActionDefinition, typeInference?: TypeInferenceService): string` function
  - Generate opening `/**` and closing `*/` with proper indentation
  - Add blank line for description: ` * `
  - For each parameter:
    - Query type inference service if available (use `inferParameterType(param, action)`)
    - If type available: `@param {type} name`
    - If type unavailable: `@param {unknown} name`
  - Join lines with newlines
  - **Test validation**: Run T013 generator tests → should now PASS

- [ ] T016 [US2] Extend completion provider in `packages/language/src/eligian-completion-provider.ts`:
  - Override `getCompletion(document, params)` method
  - Check if `params.context?.triggerCharacter === '*'`
  - If yes, check if cursor is on line ending with `/**` and action definition is on next line
  - If yes, call `generateJSDocTemplate` with action definition
  - Return completion item with generated template as `insertText`
  - Set `insertTextFormat: InsertTextFormat.Snippet` for cursor positioning
  - If no JSDoc trigger, fall back to `super.getCompletion(document, params)`
  - **Test validation**: Run T014 completion tests → should now PASS

- [ ] T017 [US2] Register trigger character in `packages/language/src/eligian-module.ts`:
  - Add `*` to completion trigger characters in module configuration
  - Verify completion provider is properly registered with Langium services

- [ ] T018 [US2] Run all User Story 2 tests together: `pnpm --filter @eligian/language test jsdoc-template-generator && pnpm --filter @eligian/language test jsdoc-completion`
  - **Expected result**: ALL User Story 2 tests PASS (GREEN phase complete)

- [ ] T019 [US2] Run Biome code quality checks: `pnpm run check`
  - Fix any linting or formatting issues
  - **Expected result**: 0 errors, 0 warnings

- [ ] T020 [US2] Run TypeScript type checking: `pnpm run build`
  - Fix any TypeScript compilation errors
  - **Expected result**: Build succeeds with no type errors

**Checkpoint**: User Story 2 should be fully functional - typing `/**` generates templates with inferred types

---

## Phase 4: User Story 3 - View Documentation on Hover (Priority: P3)

**Goal**: When developers hover over an action invocation, display a formatted tooltip showing the action's documentation (description and parameter details) from its JSDoc comment

**Independent Test**: Can be fully tested by hovering over documented action invocations and verifying the tooltip shows the documentation from the action's definition

### Tests for User Story 3 (RED Phase - Write Failing Tests FIRST)

**⚠️ CRITICAL**: These tests MUST be written FIRST and MUST FAIL before any implementation code is written

- [ ] T021 [P] [US3] Create test file `packages/language/src/__tests__/jsdoc-integration/jsdoc-hover.spec.ts` with failing integration tests:
  - Test: Hover over action invocation with full JSDoc (description + params) → expect hover with formatted documentation
  - Test: Hover over action invocation with description only (no `@param` tags) → expect hover with description
  - Test: Hover over action invocation with no JSDoc → expect hover with signature only (baseline behavior)
  - Test: Hover over action invocation with malformed JSDoc → expect hover with signature only (graceful degradation)
  - Test: Hover over action invocation with markdown in JSDoc → expect markdown rendered (bold, italic, code spans)
  - Test: Hover timing < 300ms (performance test per SC-005)
  - **Expected result at this stage**: ALL TESTS FAIL (hover provider extension doesn't exist yet)

**Checkpoint**: Verify all User Story 3 tests are written and FAILING before proceeding to implementation

### Implementation for User Story 3 (GREEN Phase - Make Tests Pass)

**⚠️ Do NOT start implementation until all tests above are written and failing**

- [ ] T022 [US3] Extend hover provider in `packages/language/src/eligian-hover-provider.ts`:
  - Override `getHoverContent(document, params)` method
  - Find AST node at hover position using Langium utilities
  - Check if node is an action invocation (call site) using type guard
  - If yes, resolve action definition from invocation
  - Check if action definition has `$comment` property
  - If yes, parse JSDoc using `parseJSDoc` from `jsdoc-parser.ts`
  - Format JSDoc as markdown using new helper function
  - Return `Hover` object with markdown content
  - If no JSDoc or parsing fails, fall back to `super.getHoverContent(document, params)`
  - **Test validation**: Run T021 hover tests → should now PASS

- [ ] T023 [P] [US3] Create test file `packages/language/src/jsdoc/__tests__/jsdoc-formatter.spec.ts` with failing unit tests:
  - Test: Format JSDoc with description only → expect markdown with heading and description
  - Test: Format JSDoc with description + params → expect markdown with "Parameters:" section
  - Test: Format JSDoc with missing param descriptions → expect param line without description
  - Test: Format JSDoc with missing param types → expect "unknown" type shown
  - Test: Format JSDoc with markdown in description → expect markdown preserved (bold, italic, code)
  - **Expected result at this stage**: ALL TESTS FAIL (formatter doesn't exist yet)

- [ ] T024 [US3] Implement markdown formatter in `packages/language/src/jsdoc/jsdoc-formatter.ts`:
  - Export `formatJSDocAsMarkdown(jsdoc: JSDocComment): string` function
  - Format structure:
    ```markdown
    ### [Action Name]

    [Description]

    **Parameters:**
    - `paramName` (`type`) - Parameter description
    - `otherParam` (`string`) - Other parameter description
    ```
  - Handle missing descriptions gracefully (omit line if no description)
  - Handle missing parameter types (show "unknown" if type is undefined)
  - Preserve markdown formatting in descriptions (bold, italic, code spans, links)
  - **Test validation**: Run T023 formatter tests → should now PASS

- [ ] T025 [US3] Run all User Story 3 tests together: `pnpm --filter @eligian/language test jsdoc-hover && pnpm --filter @eligian/language test jsdoc-formatter`
  - **Expected result**: ALL User Story 3 tests PASS (GREEN phase complete)

- [ ] T026 [US3] Run Biome code quality checks: `pnpm run check`
  - Fix any linting or formatting issues
  - **Expected result**: 0 errors, 0 warnings

- [ ] T027 [US3] Run TypeScript type checking: `pnpm run build`
  - Fix any TypeScript compilation errors
  - **Expected result**: Build succeeds with no type errors

**Checkpoint**: All user stories should now be independently functional - complete JSDoc workflow works end-to-end

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories and final validation

- [ ] T028 [P] Create example file `examples/jsdoc-demo.eligian` demonstrating:
  - Action with full JSDoc (description + all params documented)
  - Action with partial JSDoc (description only)
  - Action with no JSDoc (undocumented)
  - Action with markdown in JSDoc description
  - Action with 10+ parameters (stress test)
  - Action invocations showing hover tooltip behavior

- [ ] T029 [P] Update project documentation in `CLAUDE.md`:
  - Add JSDoc feature section describing syntax and workflow
  - Document implementation files and their purposes
  - Add example usage patterns
  - Link to quickstart guide and specification

- [ ] T030 Run full test suite across all packages: `pnpm run test`
  - Verify all 298 existing tests still pass (no regressions)
  - Verify all new JSDoc tests pass
  - **Target**: 80% code coverage per Constitution Principle II

- [ ] T031 Performance validation against success criteria:
  - Verify SC-002: JSDoc template generation < 500ms (measure with 20-param action)
  - Verify SC-005: Hover tooltip display < 300ms (measure with performance profiler)
  - Verify SC-007: 20-parameter action works without degradation
  - Verify SC-008: Malformed JSDoc doesn't crash parser (test with invalid inputs)

- [ ] T032 Run quickstart.md validation:
  - Follow all steps in `quickstart.md` manually in VS Code
  - Verify auto-generation workflow works as documented
  - Verify hover tooltips display as shown in examples
  - Fix any discrepancies between docs and actual behavior

- [ ] T033 Code cleanup and refactoring:
  - Remove any unused imports or dead code
  - Ensure consistent error handling patterns
  - Add missing JSDoc comments to implementation functions (dogfooding!)
  - Verify all TODO comments are resolved or documented

- [ ] T034 Final Biome and TypeScript validation:
  - Run `pnpm run check` across all packages
  - Run `pnpm run build` to verify no type errors
  - Fix any remaining issues
  - **Expected result**: 0 errors, 0 warnings, clean build

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **User Story 1 (Phase 2)**: Depends on Setup completion - foundation for all documentation features
- **User Story 2 (Phase 3)**: Depends on User Story 1 (needs parser) - independent of User Story 3
- **User Story 3 (Phase 4)**: Depends on User Story 1 (needs parser) - independent of User Story 2
- **Polish (Phase 5)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Setup - No dependencies on other stories (FOUNDATION)
- **User Story 2 (P2)**: Can start after US1 complete - Needs JSDoc parser from US1
- **User Story 3 (P3)**: Can start after US1 complete - Needs JSDoc parser from US1
- **US2 and US3 can run in parallel** once US1 is complete (different files, no conflicts)

### Within Each User Story (TDD Cycle)

1. **RED Phase**: Write failing tests FIRST (verify they fail)
2. **GREEN Phase**: Implement code to make tests pass
3. **REFACTOR Phase**: Run Biome/TypeScript checks, clean up code
4. Story complete → Checkpoint validation

### Parallel Opportunities

- **Phase 1**: All setup tasks (T001-T003) can run in parallel [P]
- **Phase 2 (US1 Tests)**: T004, T005, T006 can run in parallel [P] (different test files)
- **Phase 3 (US2 Tests)**: T013, T014 can run in parallel [P] (different test files)
- **Phase 4 (US3 Tests)**: T021, T023 can run in parallel [P] (different test files)
- **Phase 5 (Polish)**: T028, T029 can run in parallel [P] (different files)
- **After US1 complete**: US2 (Phase 3) and US3 (Phase 4) can proceed in parallel (different team members or sequential prioritization)

---

## Parallel Example: After User Story 1 Complete

```bash
# US2 and US3 can proceed in parallel (no file conflicts):
# Developer A works on US2 (template generation + completion provider):
T013: Write template generator tests
T014: Write completion tests
T015: Implement template generator
T016: Implement completion provider extension
T017: Register trigger character
T018-T020: Validate US2

# Developer B works on US3 (hover provider):
T021: Write hover tests
T022: Implement hover provider extension
T023: Write formatter tests
T024: Implement markdown formatter
T025-T027: Validate US3
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T003)
2. Complete Phase 2: User Story 1 (T004-T012)
3. **STOP and VALIDATE**: Test User Story 1 independently
   - Developers can write JSDoc comments
   - Comments are parsed correctly
   - No crashes on malformed input
4. Deploy MVP if ready (basic JSDoc support without auto-generation or hover)

### Incremental Delivery

1. **Setup complete** → Foundation ready (T001-T003)
2. **Add User Story 1** → Test independently → Deploy/Demo (MVP - JSDoc parsing works)
3. **Add User Story 2** → Test independently → Deploy/Demo (Auto-generation works)
4. **Add User Story 3** → Test independently → Deploy/Demo (Hover tooltips work)
5. **Add Polish** → Final validation → Full release

Each story adds value without breaking previous stories.

### Test-First Development (Constitution Principle VII)

**CRITICAL**: For EVERY user story:
1. **RED Phase**: Write ALL tests FIRST
   - Run tests → Verify they FAIL
   - Do NOT proceed until all tests are failing
2. **GREEN Phase**: Implement code
   - Run tests → Verify they PASS
   - Stop when tests pass (no gold-plating)
3. **REFACTOR Phase**: Clean up
   - Run Biome checks
   - Run TypeScript build
   - Fix any quality issues

**Cycle**: RED → GREEN → REFACTOR → Checkpoint → Next Story

---

## Task Count Summary

- **Total Tasks**: 34 tasks
- **Phase 1 (Setup)**: 3 tasks
- **Phase 2 (US1 - Write Documentation)**: 9 tasks (3 test tasks + 6 implementation tasks)
- **Phase 3 (US2 - Auto-Generate Templates)**: 8 tasks (2 test tasks + 6 implementation tasks)
- **Phase 4 (US3 - View on Hover)**: 7 tasks (2 test tasks + 5 implementation tasks)
- **Phase 5 (Polish)**: 7 tasks

**Parallel Opportunities**: 12 tasks marked [P] for parallel execution

**Independent Test Criteria**:
- **US1**: Write JSDoc comments → Parser recognizes and structures them → No crashes on invalid input
- **US2**: Type `/**` above action → Template generates with correct params and types → Works for 0-20 parameters
- **US3**: Hover over action call → Tooltip shows documentation → Markdown renders correctly → <300ms response

**Suggested MVP Scope**: User Story 1 only (T001-T012) - Enables developers to write and validate JSDoc comments

---

## Notes

- **[P] tasks** = different files, no dependencies → can run in parallel
- **[Story] label** maps task to specific user story (US1, US2, US3) for traceability
- **TDD is MANDATORY**: Tests MUST be written FIRST and FAIL before implementation (Constitution Principle VII)
- **Each user story is independently testable**: Can stop after any story and have working feature
- **Commit after each task** or logical group (especially after each checkpoint)
- **Constitution compliance**: All principles verified in plan.md - no violations
- **Performance targets**: SC-002 (<500ms generation), SC-005 (<300ms hover), SC-007 (20 params without degradation)
- **No new dependencies**: Uses existing Langium, Vitest, Biome, TypeScript 5.9.3
