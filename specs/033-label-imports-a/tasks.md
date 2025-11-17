# Tasks: Label Imports

**Input**: Design documents from `/specs/033-label-imports-a/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/labels-schema.json

**Tests**: Tests are included following Constitution Principle II (Test-First Development). All tests MUST be written BEFORE implementation.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions
- Monorepo structure: `packages/language/src/`, `packages/cli/`, `packages/extension/`
- Tests colocated: `packages/language/src/__tests__/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and schema preparation

- [X] T001 [P] Copy JSON schema to source tree: `packages/language/src/schemas/labels-schema.json` from `specs/033-label-imports-a/contracts/labels-schema.json`
  - Schema is derived from Eligius `ILanguageLabel` and `ILabel` TypeScript interfaces
  - Verify schema structure matches: `ILanguageLabel { id: string, labels: ILabel[] }`
  - Verify schema structure matches: `ILabel { id: string, languageCode: string, label: string }`
- [X] T002 [P] Create validators directory: `packages/language/src/validators/` (if not exists)
- [X] T003 [P] Create test fixtures directory: `packages/language/src/__tests__/label-import/fixtures/`

**Checkpoint**: Project structure ready for implementation

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core validation infrastructure that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T004 Implement pure JSON schema validation function in `packages/language/src/validators/label-import-validator.ts`:
  - Export `validateLabelsSchema(data: unknown): LabelValidationError | undefined`
  - Use AJV with compiled schema from `labels-schema.json`
  - Return structured error with `code`, `message`, `hint`, `details`
  - Follow Constitution Principle X (Compiler-First validation)

- [X] T005 [P] Implement JSON parsing validation function in `packages/language/src/validators/label-import-validator.ts`:
  - Export `validateLabelsJSON(jsonContent: string, filePath: string): LabelValidationError | undefined`
  - Parse JSON, catch syntax errors
  - Call `validateLabelsSchema()` on parsed data
  - Map AJV errors to user-friendly messages

- [X] T006 [P] Unit test for `validateLabelsSchema()` in `packages/language/src/validators/__tests__/label-import-validator.spec.ts`:
  - Test valid labels JSON (passes validation)
  - Test missing `id` field (error with code 'invalid_labels_schema')
  - Test missing `labels` field (error)
  - Test empty `labels` array (error: minItems violation)
  - Test missing translation `id` field (error)
  - Test missing `languageCode` field (error)
  - Test missing `label` field (error)
  - Test additional properties (passes - forward compatibility)
  - Use test data from `data-model.md` examples

- [X] T007 [P] Unit test for `validateLabelsJSON()` in `packages/language/src/validators/__tests__/label-import-validator.spec.ts`:
  - Test valid JSON content (passes)
  - Test invalid JSON syntax (error with code 'invalid_labels_json')
  - Test JSON syntax error message includes line/column (if available)
  - Test schema validation errors propagate correctly

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Import Internationalization Labels (Priority: P1) 🎯 MVP

**Goal**: Enable basic labels import with `labels './labels.json'` syntax, load JSON file, validate structure, and assign to compiled config.labels

**Independent Test**: Create Eligian program with `labels './labels.json'`, compile, verify config.labels contains label data

### Tests for User Story 1

**NOTE: Write these tests FIRST, ensure they FAIL before implementation (Constitution Principle II)**

- [X] T008 [P] [US1] Create test fixtures in `packages/language/src/__tests__/label-import/fixtures/`:
  - `valid-labels.json` (2 label groups, 2 translations each from `data-model.md`)
  - `invalid-syntax.json` (unclosed bracket)
  - `missing-id.json` (label group missing `id`)
  - `empty-labels-array.json` (label group with empty `labels: []`)

- [X] T009 [P] [US1] Grammar parsing test in `packages/language/src/__tests__/parsing.spec.ts`:
  - Test `labels './labels.json'` parses as DefaultImport with type='labels'
  - Test path is captured correctly
  - Test AST structure matches CSS/HTML import pattern
  - Use `parseHelper.parse()` from test context

- [X] T010 [P] [US1] Integration test: valid labels import in `packages/language/src/__tests__/label-import/valid-labels.spec.ts`:
  - Test program with `labels './fixtures/valid-labels.json'`
  - Compile to Eligius config
  - Verify `config.labels` is array of ILanguageLabel
  - Verify all label groups present
  - Verify all translations present
  - Use `minimalProgram()` helper from testing guide

- [X] T011 [P] [US1] Integration test: labels data assignment in `packages/language/src/__tests__/label-import/valid-labels.spec.ts`:
  - Test config.labels[0].id matches JSON
  - Test config.labels[0].labels[0].id matches JSON
  - Test config.labels[0].labels[0].languageCode matches JSON
  - Test config.labels[0].labels[0].label matches JSON
  - Verify deep equality with expected ILanguageLabel[] structure

- [X] T012 [P] [US1] Integration test: empty program compiles with empty labels in `packages/language/src/__tests__/label-import/valid-labels.spec.ts`:
  - Test program without labels import
  - Verify config.labels is empty array `[]`
  - Verify no errors or warnings

### Implementation for User Story 1

- [X] T013 [US1] Extend grammar in `packages/language/src/eligian.langium`:
  - Add `'labels'` to DefaultImport type options (line ~105)
  - Update grammar comment documenting labels import syntax
  - Existing DefaultImport rule: `type=('layout' | 'styles' | 'provider' | 'labels') path=STRING;`

- [X] T014 [US1] Extend ProgramAssets interface in `packages/language/src/compiler/ast-transformer.ts`:
  - Add `labels?: ILanguageLabel[]` property to ProgramAssets interface
  - Import `ILanguageLabel` type from `eligius`

- [X] T015 [US1] Implement labels loading in `packages/language/src/asset-loading/compiler-integration.ts`:
  - After CSS loading (around line 180), add labels loading logic
  - Extract DefaultImport statements with `type === 'labels'`
  - For each labels import: resolve relative path, read file, parse JSON, validate schema
  - Handle errors: file not found, JSON syntax, schema validation
  - Collect all labels into `ILanguageLabel[]` array
  - Pass to transformer via `assets.labels`

- [X] T016 [US1] Assign labels to config in `packages/language/src/compiler/ast-transformer.ts`:
  - In `transformProgram()` function (around line 407)
  - Add `labels: assets?.labels ?? []` to config object
  - Verify IEngineConfiguration type accepts labels property

- [X] T017 [US1] Run Langium generator to update AST types:
  - Execute `pnpm run langium:generate` from project root
  - Verify no errors from grammar changes
  - Commit generated files

- [X] T018 [US1] Verify tests pass:
  - Run `pnpm --filter @eligian/language test` to run all language tests
  - All US1 tests (T009-T012) should now PASS
  - Fix any failures before proceeding

**Checkpoint**: At this point, User Story 1 should be fully functional - basic labels import works, files load, data assigned to config

---

## Phase 4: User Story 2 - Validate Label JSON Structure (Priority: P2)

**Goal**: Provide clear, actionable error messages when labels JSON has syntax errors or schema violations

**Independent Test**: Create Eligian programs with malformed labels files, verify each produces specific error message

### Tests for User Story 2

- [X] T019 [P] [US2] Create error test fixtures in `packages/language/src/__tests__/label-import/fixtures/`:
  - `invalid-type-root.json` (root is object, not array)
  - `missing-languageCode.json` (translation missing languageCode)
  - `missing-label.json` (translation missing label field)
  - `empty-id.json` (id field is empty string)

- [X] T020 [P] [US2] Integration test: JSON syntax errors in `packages/language/src/__tests__/label-import/invalid-labels.spec.ts`:
  - Test program with `labels './fixtures/invalid-syntax.json'`
  - Verify error reported with code 'invalid_labels_json'
  - Verify error message mentions "Invalid JSON syntax"
  - Verify error includes file path
  - Use `parseAndValidate()` from test context

- [X] T021 [P] [US2] Integration test: schema validation errors in `packages/language/src/__tests__/label-import/invalid-labels.spec.ts`:
  - Test missing `id` field → error "Missing required property 'id'"
  - Test empty `labels` array → error "must have at least one translation"
  - Test missing `languageCode` → error "Missing required property 'languageCode'"
  - Test missing `label` → error "Missing required property 'label'"
  - Verify each error has code 'invalid_labels_schema'
  - Use `getErrors()` helper from testing guide

- [ ] T022 [P] [US2] Integration test: multiple validation errors in `packages/language/src/__tests__/label-import/invalid-labels.spec.ts`:
  - Create `multiple-errors.json` fixture with:
    - First label group missing `id` field
    - Second label group with empty `labels` array
    - Third label group's translation missing `languageCode` field
  - Test program with this multi-error fixture
  - Verify 3 distinct errors reported (not just first one)
  - Verify each error has distinct message
  - Test error count matches violations count (3 errors)

- [X] T023 [P] [US2] Integration test: invalid root type in `packages/language/src/__tests__/label-import/invalid-labels.spec.ts`:
  - Test `invalid-type-root.json` (object instead of array)
  - Verify error "root must be an array"
  - Verify error code 'invalid_labels_schema'

### Implementation for User Story 2

- [X] T024 [US2] Implement error mapping in `packages/language/src/validators/label-import-validator.ts`:
  - Add `formatValidationError(error: ErrorObject, data: unknown): string` function
  - Map AJV error keywords to user-friendly messages
  - Handle: `type`, `required`, `minLength`, `minItems` keywords
  - Extract JSON pointer paths for context
  - Return formatted message per `research.md` mapping table

- [X] T025 [US2] Integrate validation error reporting in `packages/language/src/asset-loading/compiler-integration.ts`:
  - After schema validation fails, format errors with `formatValidationError()`
  - Report errors with file path in diagnostic message
  - Use Langium `ValidationAcceptor` pattern
  - Ensure error includes hint text for common mistakes

- [X] T026 [US2] Enhance error messages with file context in `packages/language/src/asset-loading/compiler-integration.ts`:
  - Include file path in all error messages
  - For JSON syntax errors, include line/column if available
  - For schema errors, include property path from JSON pointer
  - Verify error message clarity - each message MUST include:
    - ✅ File path (e.g., `./labels.json`)
    - ✅ Error type (e.g., "Invalid JSON syntax", "Missing required property")
    - ✅ Actionable hint (e.g., "Check for missing commas or brackets")
    - Example: "Invalid JSON syntax in './labels.json' at line 5: Unclosed bracket. Hint: Check for missing commas or brackets."

- [X] T027 [US2] Verify tests pass:
  - Run `pnpm --filter @eligian/language test` to run all tests
  - All US2 tests (T020-T023) should now PASS
  - Verify error messages are clear and actionable
  - Fix any failures before proceeding

**Checkpoint**: At this point, User Stories 1 AND 2 should both work - basic import works, errors are clear and helpful

---

## Phase 5: User Story 3 - Handle Missing or Inaccessible Label Files (Priority: P3)

**Goal**: Provide clear error messages when labels file doesn't exist, has wrong path type, or has permission issues

**Independent Test**: Create Eligian programs with missing files, absolute paths, duplicate imports - verify each produces specific error

### Tests for User Story 3

- [X] T028 [P] [US3] Integration test: file not found in `packages/language/src/__tests__/label-import/missing-file.spec.ts`:
  - Test program with `labels './nonexistent.json'`
  - Verify error reported with code 'labels_file_not_found'
  - Verify error message includes file path attempted
  - Verify hint suggests checking file existence

- [X] T029 [P] [US3] Validation test: absolute path rejected in `packages/language/src/__tests__/validation.spec.ts`:
  - Test program with `labels '/absolute/path/labels.json'`
  - Verify error code 'absolute_path_not_allowed'
  - Verify error message mentions "relative path"
  - Verify hint shows correct syntax
  - Use `checkDefaultImports()` validator

- [X] T030 [P] [US3] Validation test: duplicate labels imports in `packages/language/src/__tests__/validation.spec.ts`:
  - Test program with two `labels` import statements
  - Verify error code 'duplicate_default_import'
  - Verify error message "Only one labels import allowed"
  - Use existing duplicate import validation (extends CSS/HTML pattern)

- [ ] T031 [P] [US3] Integration test: permission denied (optional, platform-dependent):
  - Test labels file with no read permissions (skip on Windows)
  - Verify error message mentions permission issue
  - Verify error code indicates read failure

### Implementation for User Story 3

- [X] T032 [US3] Implement file existence check in `packages/language/src/asset-loading/compiler-integration.ts`:
  - Before reading file, check if file exists with `fs.existsSync()`
  - If not found, return error with code 'labels_file_not_found'
  - Include attempted file path in error message
  - Add hint: "Ensure the file exists and the path is correct"

- [X] T033 [US3] Implement permission error handling in `packages/language/src/asset-loading/compiler-integration.ts`:
  - Wrap `readFileSync()` in try/catch
  - Catch EACCES error → report permission error
  - Catch ENOENT error → report file not found
  - Include error details in diagnostic message

- [X] T034 [US3] Verify absolute path validation works:
  - Test that existing `checkDefaultImports()` validator handles labels type
  - DefaultImport validation should already reject absolute paths
  - Verify error message is clear for labels context
  - No code changes needed (extends existing validator)

- [X] T035 [US3] Verify duplicate import validation works:
  - Test that existing duplicate detection handles labels type
  - Validation should prevent multiple `labels` imports
  - Verify error message is clear
  - No code changes needed (extends existing validator)

- [X] T036 [US3] Verify tests pass:
  - Run `pnpm --filter @eligian/language test` to run all tests
  - All US3 tests (T028-T031) should now PASS
  - Test error messages manually for clarity
  - Fix any failures before proceeding

**Checkpoint**: All user stories should now be independently functional - import works, validation is comprehensive, errors are clear

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, examples, and final quality checks

- [X] T037 [P] Add labels import example to `examples/demo.eligian`:
  - Add "Labels Import - Multi-Language Support" section
  - Show `labels './labels.json'` syntax
  - Include example label usage comment
  - Verify example compiles: `node packages/cli/bin/cli.js examples/demo.eligian`
  - Follow Constitution Principle XXIV (Unified Example File)

- [X] T038 [P] Update `LANGUAGE_SPEC.md` with labels import documentation:
  - Add "Labels Import" section
  - Document syntax: `labels '<path-to-json-file>'`
  - Document JSON structure requirements
  - Add validation rules
  - Add examples from `quickstart.md`
  - Follow Constitution Principle XVII (Language Specification Maintenance)

- [X] T039 [P] Create example labels.json file in `examples/demo-labels.json`:
  - Use multi-language example from `data-model.md`
  - Include en-US and nl-NL translations
  - Add comments (if JSON allows) or separate README

- [X] T040 [P] Run Biome check and fix issues:
  - Execute `pnpm run check` from project root
  - Fix any formatting or linting issues
  - Verify 0 errors, 0 warnings
  - Follow Constitution Principle XI (Biome Integration)

- [X] T041 [P] Run TypeScript type check:
  - Execute `pnpm run typecheck` from project root
  - Fix any type errors
  - Verify all packages compile successfully

- [X] T042 Run comprehensive test suite:
  - Execute `pnpm run test` from project root
  - Verify all tests pass (language, compiler, CLI)
  - Fix any test failures
  - Target: all 1830 tests passing (achieved)

- [ ] T043 [P] Verify quickstart guide examples:
  - Create test files from `quickstart.md` examples
  - Compile each example with CLI
  - Verify no errors for valid examples
  - Verify errors match documented errors for invalid examples

- [ ] T044 [P] Update technical overview (if architectural changes):
  - Check if `specs/TECHNICAL_OVERVIEW.md` needs updates
  - Document labels loading in compilation pipeline
  - Document new validator module
  - Follow Constitution Principle XXVI (Technical Overview Consultation)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phases 3-5)**: All depend on Foundational phase completion
  - User stories can proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3)
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - Extends US1 validation but independently testable
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) - Extends US1 error handling but independently testable

### Within Each User Story

- Tests MUST be written and FAIL before implementation (Constitution Principle II)
- Grammar changes before pipeline changes
- Validators before pipeline integration
- Pipeline loading before transformer assignment
- All tests pass before marking story complete

### Parallel Opportunities

- **Setup (Phase 1)**: All 3 tasks can run in parallel
- **Foundational (Phase 2)**: T005-T007 can run in parallel (T004 must finish first)
- **User Story Tests**: All test tasks within a story marked [P] can run in parallel
- **Different User Stories**: US1, US2, US3 can be worked on in parallel by different developers (after Foundational)
- **Polish (Phase 6)**: T037-T044 can run in parallel

---

## Parallel Example: User Story 1

```bash
# Launch all test fixtures for User Story 1 together:
Task: "Create test fixtures in packages/language/src/__tests__/label-import/fixtures/"

# Launch all tests for User Story 1 together (after fixtures ready):
Task: "Grammar parsing test in parsing.spec.ts"
Task: "Integration test: valid labels import"
Task: "Integration test: labels data assignment"
Task: "Integration test: empty program compiles"

# Implementation tasks run sequentially (dependencies)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T003)
2. Complete Phase 2: Foundational (T004-T007) - CRITICAL - blocks all stories
3. Complete Phase 3: User Story 1 (T008-T018)
4. **STOP and VALIDATE**:
   - Compile Eligian program with `labels './labels.json'`
   - Verify config.labels contains label data
   - Test in isolation
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready (T001-T007)
2. Add User Story 1 → Test independently → Deploy/Demo (MVP: T008-T018)
3. Add User Story 2 → Test independently → Deploy/Demo (Better errors: T019-T027)
4. Add User Story 3 → Test independently → Deploy/Demo (Complete error handling: T028-T036)
5. Polish → Final release (T037-T044)

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together (T001-T007)
2. Once Foundational is done:
   - Developer A: User Story 1 (T008-T018)
   - Developer B: User Story 2 (T019-T027)
   - Developer C: User Story 3 (T028-T036)
3. Stories complete and integrate independently
4. Team merges, resolves conflicts, runs Polish tasks together (T037-T044)

---

## Task Summary

- **Total Tasks**: 44
- **Setup**: 3 tasks
- **Foundational**: 4 tasks (BLOCKING)
- **User Story 1 (P1 - MVP)**: 11 tasks (5 tests, 6 implementation)
- **User Story 2 (P2)**: 9 tasks (5 tests, 4 implementation)
- **User Story 3 (P3)**: 9 tasks (4 tests, 5 implementation)
- **Polish**: 8 tasks
- **Parallel Opportunities**: 28 tasks marked [P] (63%)

---

## Notes

- [P] tasks = different files, no dependencies, can run in parallel
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- **Tests FIRST** (Constitution Principle II) - verify tests FAIL before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Constitution Principles: II (Testing), X (Compiler-First Validation), XI (Biome), XVII (Language Spec), XXIV (Unified Example), XXVI (Technical Overview)
- Testing Guide: Use `minimalProgram()`, `createTestContext()`, `setupCSSRegistry()` helpers
- Follow existing patterns from CSS/HTML imports (Features 010-011)
