# Implementation Tasks: HTML Variables

**Feature Branch**: `015-html-variables-the`
**Generated**: 2025-10-27
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

---

## Task Summary

**Total Tasks**: 32
**Parallelizable Tasks**: 18
**Sequential Tasks**: 14

**Tasks by User Story**:
- Setup & Foundational: 6 tasks
- User Story 1 (P1): 10 tasks (import HTML as variables)
- User Story 2 (P1): 6 tasks (layout vs import distinction)
- User Story 3 (P2): 8 tasks (validation)
- Polish & Integration: 2 tasks

**Implementation Strategy**: Test-first development (RED-GREEN-REFACTOR) per Constitution Principle II. Each user story is independently testable and delivers incremental value.

---

## Phase 1: Setup & Infrastructure

### T001 - Create HTML import test fixtures
**File**: `packages/language/src/__tests__/__fixtures__/html-imports/`
**Story**: Setup
**Description**: Create test fixture directory and sample HTML files for testing
**Actions**:
- Create directory structure: `__fixtures__/html-imports/valid/` and `__fixtures__/html-imports/invalid/`
- Create `valid/snippet.html` containing `<div>Hello World</div>`
- Create `valid/header.html` containing `<header><h1>Test Header</h1></header>`
- Create `valid/footer.html` containing `<footer>Test Footer</footer>`
- Create `valid/nested/component.html` in subdirectory
**Test**: Directory structure exists with all fixture files

---

## Phase 2: Foundational Tasks (Blocking Prerequisites)

### T002 - [P] Add HTMLImport grammar rule
**File**: `packages/language/src/eligian.langium`
**Story**: Foundational
**Description**: Add grammar rule for HTML import syntax
**Actions**:
- Add `HTMLImport` rule: `'import' name=ID 'from' path=STRING;`
- Update `Program` rule to include `(htmlImports+=HTMLImport)*` before layout declaration
- Ensure correct ordering: htmlImports → layout → cssImports → actions → timelines
**Test**: Grammar compiles without errors
**Dependencies**: None (can run in parallel with T003)

### T003 - [P] Implement PathResolverService (Effect-ts)
**File**: `packages/compiler/src/path-resolver.ts` (NEW)
**Story**: Foundational
**Description**: Create Effect-ts service for path resolution and security validation
**Actions**:
- Create `PathResolverService` Context.Tag with methods: `resolveHTMLPath`, `normalizePath`, `validateWithinProject`
- Implement path resolution using `path.resolve()` and `path.dirname()`
- Implement security check using `path.relative()` (detect `..` escapes)
- Define error types: `PathSecurityError`, `InvalidPathError`
- Create `PathResolverLive` Layer implementation
**Test**: Service compiles and exports correctly
**Dependencies**: None (can run in parallel with T002)
**Reference**: [contracts/path-resolver-api.ts](contracts/path-resolver-api.ts)

### T004 - [P] Implement HTMLLoaderService (Effect-ts)
**File**: `packages/compiler/src/html-loader.ts` (NEW)
**Story**: Foundational
**Description**: Create Effect-ts service for HTML file loading
**Actions**:
- Create `HTMLLoaderService` Context.Tag with methods: `loadHTML`, `validateFileSize`
- Implement file reading using `fs.promises.readFile` wrapped in `Effect.tryPromise`
- Define error types: `FileNotFoundError`, `PermissionDeniedError`, `ReadError`, `FileSizeError`
- Handle error codes: `ENOENT`, `EACCES`
- Create `HTMLLoaderLive` Layer implementation
**Test**: Service compiles and exports correctly
**Dependencies**: None (can run in parallel with T002, T003)
**Reference**: [contracts/html-loader-api.ts](contracts/html-loader-api.ts)

### T005 - Regenerate Langium artifacts
**File**: `packages/language/src/generated/`
**Story**: Foundational
**Description**: Regenerate Langium parser and AST types
**Actions**:
- Run `pnpm --filter @eligian/language run langium:generate`
- Verify `ast.ts` includes `HTMLImport` interface
- Verify no TypeScript errors in generated code
**Test**: Generated code compiles without errors
**Dependencies**: T002 (requires grammar changes)

### T006 - Run Biome and typecheck on foundational code
**File**: All modified files
**Story**: Foundational
**Description**: Ensure code quality before proceeding to user stories
**Actions**:
- Run `pnpm run check` (Biome format and lint)
- Run `pnpm run typecheck` (TypeScript validation)
- Fix any errors or warnings
**Test**: Both commands pass with 0 errors
**Dependencies**: T002, T003, T004, T005
**Checkpoint**: ✓ Foundational infrastructure ready for user story implementation

---

## Phase 3: User Story 1 - Import HTML as String Variables (P1)

**Goal**: Enable `import foo from './foo.html'` syntax to load HTML content as `@foo` variable

**Independent Test**: Import an HTML file and reference it in `setElementContent(@foo)`, verify HTML content is correctly embedded in compiled configuration

### T007 - Write parsing tests for HTML imports
**File**: `packages/language/src/__tests__/html-import-parsing.spec.ts` (NEW)
**Story**: US1
**Description**: Test-first: Write tests for HTML import parsing
**Actions**:
- Test single HTML import parsing (name and path extraction)
- Test multiple HTML imports in one program
- Test HTML import with relative path (`./`, `../`)
- Test HTML import with subdirectory path
- All tests should FAIL initially (RED phase)
**Test**: Test file runs, all tests fail as expected
**Dependencies**: T005 (requires generated AST types)
**Reference**: [quickstart.md](quickstart.md) Phase 1.1

### T008 - Verify parsing tests pass
**File**: `packages/language/src/eligian.langium` (verification only)
**Story**: US1
**Description**: Verify grammar correctly parses HTML imports (GREEN phase)
**Actions**:
- Run `pnpm --filter @eligian/language run test html-import-parsing`
- Verify all tests pass
- If tests fail: debug grammar rule and regenerate
**Test**: All parsing tests pass
**Dependencies**: T007 (tests written), T002 (grammar rule exists), T005 (artifacts regenerated)

### T009 - Write path resolver unit tests
**File**: `packages/compiler/src/__tests__/path-resolver.spec.ts` (NEW)
**Story**: US1
**Description**: Test-first: Write tests for path resolution
**Actions**:
- Test simple relative path resolution (`./file.html`)
- Test parent directory resolution (`../shared/file.html`)
- Test path normalization (backslash to forward slash)
- Test path with spaces and special characters
- All tests should FAIL initially (RED phase)
**Test**: Test file runs, all tests fail as expected
**Dependencies**: T003 (service interface exists)
**Reference**: [contracts/path-resolver-api.ts](contracts/path-resolver-api.ts) test cases

### T010 - Verify path resolver tests pass
**File**: `packages/compiler/src/path-resolver.ts` (verification only)
**Story**: US1
**Description**: Verify PathResolverService implementation works (GREEN phase)
**Actions**:
- Run `pnpm --filter @eligian/compiler run test path-resolver`
- Verify all tests pass
- If tests fail: debug implementation
**Test**: All path resolver tests pass
**Dependencies**: T009 (tests written), T003 (service implemented)

### T011 - Write HTML loader unit tests
**File**: `packages/compiler/src/__tests__/html-loader.spec.ts` (NEW)
**Story**: US1
**Description**: Test-first: Write tests for HTML file loading
**Actions**:
- Test loading valid HTML file (success case)
- Test loading missing file (FileNotFound error)
- Test file size validation
- Test UTF-8 encoding handling
- All tests should FAIL initially (RED phase)
**Test**: Test file runs, all tests fail as expected
**Dependencies**: T004 (service interface exists), T001 (test fixtures)
**Reference**: [contracts/html-loader-api.ts](contracts/html-loader-api.ts)

### T012 - Verify HTML loader tests pass
**File**: `packages/compiler/src/html-loader.ts` (verification only)
**Story**: US1
**Description**: Verify HTMLLoaderService implementation works (GREEN phase)
**Actions**:
- Run `pnpm --filter @eligian/compiler run test html-loader`
- Verify all tests pass
- If tests fail: debug implementation
**Test**: All HTML loader tests pass
**Dependencies**: T011 (tests written), T004 (service implemented)

### T013 - Write transformation tests for HTML variables
**File**: `packages/compiler/src/__tests__/ast-transformer.spec.ts` (MODIFY)
**Story**: US1
**Description**: Test-first: Write tests for HTML import transformation
**Actions**:
- Test HTML import creates variable in compilation scope
- Test variable resolution when referenced with `@variableName`
- Test HTML content embedded in operation parameter
- Test multiple HTML imports in one program
- All tests should FAIL initially (RED phase)
**Test**: Test file runs, new tests fail as expected
**Dependencies**: T005 (AST types), T003, T004 (services exist)

### T014 - Implement HTML import transformation in ast-transformer
**File**: `packages/compiler/src/ast-transformer.ts` (MODIFY)
**Story**: US1
**Description**: Transform HTML imports to variables and embed content (GREEN phase)
**Actions**:
- In `transformProgram()`: Loop through `program.htmlImports`
- For each import: Use PathResolverService to resolve path
- Use HTMLLoaderService to load HTML content
- Register variable in compilation scope: `{ name, type: 'string', value: htmlContent, mutable: false, scope: 'program' }`
- In variable resolution: Look up HTML variables and return content
- Embed HTML content in operation parameters where `@variableName` is referenced
**Test**: Transformation tests pass
**Dependencies**: T013 (tests written), T003 (PathResolver), T004 (HTMLLoader)
**Reference**: [research.md](research.md) Question 4, [quickstart.md](quickstart.md) Phase 5

### T015 - Write integration test for HTML import compilation
**File**: `packages/language/src/__tests__/html-import-integration.spec.ts` (NEW)
**Story**: US1
**Description**: End-to-end test for HTML import feature
**Actions**:
- Create test that imports HTML file and references it in operation
- Compile source to Eligius configuration
- Verify HTML content is embedded in operation parameter
- Verify multiple imports work correctly
- Test should FAIL initially (RED phase)
**Test**: Integration test runs, fails as expected
**Dependencies**: T001 (fixtures), T014 (transformation implemented)

### T016 - Verify integration test passes and run quality checks
**File**: All US1 files
**Story**: US1
**Description**: Verify end-to-end compilation works (GREEN phase) and ensure code quality
**Actions**:
- Run integration test: `pnpm --filter @eligian/language run test html-import-integration`
- Verify test passes
- Run `pnpm run check` (Biome)
- Run `pnpm run typecheck` (TypeScript)
- Fix any errors or warnings
**Test**: Integration test passes, Biome and typecheck pass
**Dependencies**: T015 (integration test written)
**Checkpoint**: ✓ User Story 1 complete - HTML imports work end-to-end

---

## Phase 4: User Story 2 - Distinguish Layout from Content Variables (P1)

**Goal**: Ensure `layout` keyword assigns to `layoutTemplate` while `import` creates variables (clear separation)

**Independent Test**: Use both `layout "./app.html"` and `import nav from './nav.html'` in same file, verify layout goes to `layoutTemplate` and import creates referenceable variable

### T017 - Write tests for layout vs import distinction
**File**: `packages/language/src/__tests__/layout-import-distinction.spec.ts` (NEW)
**Story**: US2
**Description**: Test-first: Verify layout and import are treated differently
**Actions**:
- Test `layout` keyword assigns HTML to `config.layoutTemplate`
- Test `import` keyword creates variable (NOT in layoutTemplate)
- Test both in same file (layout + import)
- Test error when attempting to reference `@layout` as variable
- All tests should FAIL initially (RED phase)
**Test**: Test file runs, all tests fail as expected
**Dependencies**: T014 (transformation exists)

### T018 - Implement layout vs import distinction in transformer
**File**: `packages/compiler/src/ast-transformer.ts` (MODIFY)
**Story**: US2
**Description**: Ensure layout and import are handled separately (GREEN phase)
**Actions**:
- Verify `transformProgram()` handles `program.layout` separately (assigns to `config.layoutTemplate`)
- Verify `program.htmlImports` creates variables (NOT layoutTemplate)
- Ensure both can coexist in same program
**Test**: Layout vs import tests pass
**Dependencies**: T017 (tests written)

### T019 - Write validation test for invalid layout reference
**File**: `packages/language/src/__tests__/validation.spec.ts` (MODIFY)
**Story**: US2
**Description**: Test-first: Ensure `@layout` reference is rejected
**Actions**:
- Test attempting to reference `@layout` in operation
- Verify error: "'layout' is a configuration property, not a variable"
- Test should FAIL initially (RED phase)
**Test**: Test runs, fails as expected
**Dependencies**: T005 (AST types)
**Reference**: [contracts/validator-api.ts](contracts/validator-api.ts)

### T020 - Implement validation for invalid layout reference
**File**: `packages/language/src/eligian-validator.ts` (MODIFY)
**Story**: US2
**Description**: Add validator to reject `@layout` references (GREEN phase)
**Actions**:
- Add `checkVariableReference()` method
- Check if variable name is 'layout'
- If yes: Report error with code `INVALID_LAYOUT_REFERENCE`
- Error message: "'layout' is a configuration property, not a variable. Use 'import' to create HTML variables."
**Test**: Invalid layout reference test passes
**Dependencies**: T019 (test written)

### T021 - Write integration test for layout + import coexistence
**File**: `packages/language/src/__tests__/layout-import-integration.spec.ts` (NEW)
**Story**: US2
**Description**: End-to-end test for layout and import in same file
**Actions**:
- Create test with both `layout` and `import` statements
- Verify layout HTML in `config.layoutTemplate`
- Verify import HTML available as variable (not in layoutTemplate)
- Test should FAIL initially (RED phase)
**Test**: Integration test runs, fails as expected
**Dependencies**: T001 (fixtures), T018 (distinction implemented)

### T022 - Verify US2 integration test and run quality checks
**File**: All US2 files
**Story**: US2
**Description**: Verify layout/import distinction works end-to-end (GREEN phase)
**Actions**:
- Run integration test: `pnpm --filter @eligian/language run test layout-import-integration`
- Verify test passes
- Run `pnpm run check` (Biome)
- Run `pnpm run typecheck` (TypeScript)
- Fix any errors or warnings
**Test**: Integration test passes, Biome and typecheck pass
**Dependencies**: T021 (integration test written)
**Checkpoint**: ✓ User Story 2 complete - Layout/import distinction clear

---

## Phase 5: User Story 3 - Validation of HTML Import Paths (P2)

**Goal**: Catch invalid paths, missing files, and security violations at compile-time

**Independent Test**: Provide invalid import paths (missing file, path escape, duplicate names) and verify appropriate compile-time errors

### T023 - Write tests for duplicate import name detection
**File**: `packages/language/src/__tests__/validation.spec.ts` (MODIFY)
**Story**: US3
**Description**: Test-first: Detect duplicate HTML import variable names
**Actions**:
- Test two imports with same variable name
- Verify error: "Variable '@foo' is already defined (first defined at line X)"
- Verify error code: `DUPLICATE_HTML_VARIABLE`
- Test should FAIL initially (RED phase)
**Test**: Test runs, fails as expected
**Dependencies**: T005 (AST types)
**Reference**: [contracts/validator-api.ts](contracts/validator-api.ts)

### T024 - Implement duplicate import name validation
**File**: `packages/language/src/eligian-validator.ts` (MODIFY)
**Story**: US3
**Description**: Add validator to detect duplicate names (GREEN phase)
**Actions**:
- Add `checkHTMLImportDuplicates()` method with `@Check` decorator
- Track seen names in Map
- Report error for duplicates with location of first definition
**Test**: Duplicate name test passes
**Dependencies**: T023 (test written)
**Reference**: [research.md](research.md) Question 5

### T025 - Write tests for missing file detection
**File**: `packages/language/src/__tests__/validation.spec.ts` (MODIFY)
**Story**: US3
**Description**: Test-first: Detect HTML files that don't exist
**Actions**:
- Test import with non-existent file path
- Verify error: "HTML file not found: ./missing.html"
- Verify error code: `HTML_FILE_NOT_FOUND`
- Test should FAIL initially (RED phase)
**Test**: Test runs, fails as expected
**Dependencies**: T005 (AST types)

### T026 - Implement missing file validation
**File**: `packages/language/src/eligian-validator.ts` (MODIFY)
**Story**: US3
**Description**: Check HTML file existence (GREEN phase)
**Actions**:
- Add `checkHTMLImportPathExists()` method
- Use PathResolverService to resolve path
- Use `fs.promises.access()` to check file exists
- Report `FileNotFoundError` or `PermissionDeniedError` as validation error
**Test**: Missing file test passes
**Dependencies**: T025 (test written), T003 (PathResolver)

### T027 - Write tests for path security validation
**File**: `packages/language/src/__tests__/validation.spec.ts` (MODIFY)
**Story**: US3
**Description**: Test-first: Detect paths escaping project directory
**Actions**:
- Test import with path `../../../etc/passwd`
- Verify error: "HTML imports must be within project directory"
- Verify error code: `HTML_PATH_SECURITY_VIOLATION`
- Test should FAIL initially (RED phase)
**Test**: Test runs, fails as expected
**Dependencies**: T005 (AST types)

### T028 - Implement path security validation
**File**: `packages/language/src/eligian-validator.ts` (MODIFY)
**Story**: US3
**Description**: Validate paths stay within project (GREEN phase)
**Actions**:
- Add `checkHTMLImportPathSecurity()` method
- Use PathResolverService.validateWithinProject()
- Report `PathSecurityError` as validation error
**Test**: Path security test passes
**Dependencies**: T027 (test written), T003 (PathResolver)
**Reference**: [research.md](research.md) Question 3

### T029 - Write integration test for validation errors
**File**: `packages/language/src/__tests__/html-import-validation-integration.spec.ts` (NEW)
**Story**: US3
**Description**: End-to-end test for all validation scenarios
**Actions**:
- Test duplicate names → error shown
- Test missing file → error shown
- Test path escape → error shown
- Test valid imports → no errors
- Test should FAIL initially (RED phase)
**Test**: Integration test runs, fails as expected
**Dependencies**: T001 (fixtures), T024, T026, T028 (validators implemented)

### T030 - Verify US3 integration test and run quality checks
**File**: All US3 files
**Story**: US3
**Description**: Verify validation works end-to-end (GREEN phase)
**Actions**:
- Run integration test: `pnpm --filter @eligian/language run test html-import-validation-integration`
- Verify test passes
- Run `pnpm run check` (Biome)
- Run `pnpm run typecheck` (TypeScript)
- Fix any errors or warnings
**Test**: Integration test passes, Biome and typecheck pass
**Dependencies**: T029 (integration test written)
**Checkpoint**: ✓ User Story 3 complete - Validation catches all error cases

---

## Phase 6: Polish & Integration

### T031 - Create example file with HTML imports
**File**: `examples/html-imports-demo.eligian` (NEW)
**Story**: Polish
**Description**: Create demonstration file showing HTML import usage
**Actions**:
- Create `examples/snippets/` directory
- Create `header.html`, `footer.html` fixture files
- Create `html-imports-demo.eligian` using both layout and imports
- Test compilation: `node packages/cli/bin/cli.js examples/html-imports-demo.eligian`
- Verify output JSON contains embedded HTML
**Test**: Example compiles successfully and produces valid Eligius configuration
**Dependencies**: T016, T022, T030 (all user stories complete)

### T032 - Run final coverage analysis and verification
**File**: All packages
**Story**: Polish
**Description**: Verify 80% test coverage and all quality checks pass
**Actions**:
- Run full test suite: `pnpm run test`
- Run coverage: `pnpm run test:coverage`
- Verify coverage ≥80% for business logic (per Constitution Principle II)
- Run `pnpm run check` (Biome)
- Run `pnpm run typecheck` (TypeScript)
- Run `pnpm run build` (verify compilation)
- If coverage <80%: Add missing tests
**Test**: All tests pass, coverage ≥80%, Biome/typecheck/build pass
**Dependencies**: All previous tasks
**Checkpoint**: ✓ Feature complete and ready for code review

---

## Dependency Graph

### Story Completion Order
```
Setup (T001)
  ↓
Foundational (T002-T006) [Blocking - must complete before user stories]
  ↓
┌─────────────────┴─────────────────┐
│                                   │
User Story 1 (T007-T016)       [Independent, can proceed after foundational]
  ↓
User Story 2 (T017-T022)       [Depends on US1 transformer]
  ↓
User Story 3 (T023-T030)       [Independent of US2, depends on foundational services]
  ↓
└─────────────────┬─────────────────┘
                  ↓
Polish & Integration (T031-T032)
```

### Parallel Execution Opportunities

**Phase 1 (Setup)**:
- T001 standalone

**Phase 2 (Foundational)**:
- T002 [P] (grammar)
- T003 [P] (PathResolver)
- T004 [P] (HTMLLoader)
- Then T005 (regenerate) → T006 (quality)

**Phase 3 (User Story 1)**:
- T007-T008: parsing tests (sequential)
- T009-T010: path resolver tests (sequential)
- T011-T012: HTML loader tests (sequential)
- Tests T007, T009, T011 can run in parallel (different files)
- T013-T014: transformation (sequential)
- T015-T016: integration (sequential)

**Phase 4 (User Story 2)**:
- T017-T018: distinction tests (sequential)
- T019-T020: validation (sequential)
- T017 and T019 can run in parallel (different test files)
- T021-T022: integration (sequential)

**Phase 5 (User Story 3)**:
- T023-T024: duplicate detection (sequential)
- T025-T026: missing file detection (sequential)
- T027-T028: path security (sequential)
- Tests T023, T025, T027 can run in parallel (same test file, different test blocks)
- T029-T030: integration (sequential)

**Phase 6 (Polish)**:
- T031-T032: sequential

---

## Implementation Strategy

### MVP Scope (Minimum Viable Product)
**Deliver**: User Story 1 only (T001-T016)
- Core import functionality
- Basic path resolution
- File loading with error handling
- Variable registration and referencing
- End-to-end compilation

**Value**: Developers can import HTML files and use them as variables (primary use case)

**Timeframe**: 6-8 hours (test-first development)

### Incremental Delivery

**Phase 1 MVP** (US1): HTML imports work
**Phase 2 Enhancement** (US2): Layout/import distinction clear
**Phase 3 Hardening** (US3): Comprehensive validation

Each phase is independently testable and delivers incremental value.

---

## Task Execution Notes

### Test-First Workflow (Required by Constitution Principle II)
1. **RED**: Write failing test
2. **GREEN**: Write minimum code to pass test
3. **REFACTOR**: Improve code while keeping tests green
4. **NEVER**: Write implementation before test exists

### Code Quality Checkpoints
- After foundational tasks: T006
- After User Story 1: T016
- After User Story 2: T022
- After User Story 3: T030
- Final verification: T032

### File Modification Summary
**New Files**:
- `packages/compiler/src/path-resolver.ts`
- `packages/compiler/src/html-loader.ts`
- `packages/compiler/src/__tests__/path-resolver.spec.ts`
- `packages/compiler/src/__tests__/html-loader.spec.ts`
- `packages/language/src/__tests__/html-import-parsing.spec.ts`
- `packages/language/src/__tests__/html-import-integration.spec.ts`
- `packages/language/src/__tests__/layout-import-distinction.spec.ts`
- `packages/language/src/__tests__/layout-import-integration.spec.ts`
- `packages/language/src/__tests__/html-import-validation-integration.spec.ts`
- `examples/html-imports-demo.eligian`
- Test fixtures in `__fixtures__/html-imports/`

**Modified Files**:
- `packages/language/src/eligian.langium` (grammar)
- `packages/language/src/eligian-validator.ts` (validation)
- `packages/compiler/src/ast-transformer.ts` (transformation)
- `packages/language/src/__tests__/validation.spec.ts` (validation tests)
- `packages/compiler/src/__tests__/ast-transformer.spec.ts` (transformation tests)

---

## Ready for Implementation

All tasks are defined with clear actions, dependencies, and test criteria. Proceed with T001 to begin implementation.

For detailed implementation guidance, see [quickstart.md](quickstart.md).
