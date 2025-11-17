---
description: "Task list for library file loading in compiler pipeline"
---

# Tasks: Library File Loading in Compiler Pipeline

**Input**: Design documents from `/specs/032-library-file-loading/`
**Prerequisites**: plan.md (complete), spec.md (complete), research.md (complete), data-model.md (complete)

**Tests**: Test-first development (Constitution Principle II). All tests MUST be written BEFORE implementation.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions
- Monorepo (pnpm workspace): `packages/language/src/compiler/`, `packages/cli/`
- Tests: `packages/language/src/compiler/__tests__/`
- Fixtures: `examples/libraries/`, test files in root

---

## Phase 1: Setup & Prerequisites

Prerequisites verification before beginning development.

| Task | Description | Scope |
|------|-------------|-------|
| **T001** | Verify dependencies installed: langium (language utilities), effect (pipeline), vscode-uri (path resolution) | Verify in `packages/language/package.json` |
| **T002** | Verify Feature 023 present: grammar (eligian.langium), scope provider (eligian-scope-provider.ts), validation (eligian-validator.ts) | Check that library import syntax and scope resolution infrastructure exists |

**Checkpoint**: All prerequisites verified, ready for development.

---

## Phase 2: Foundational (BLOCKS all user stories)

Setup test infrastructure and base fixtures required by all user stories.

| Task | Description | Scope |
|------|-------------|-------|
| **T003** [P] | Create fixtures directory structure `examples/libraries/` with subdirs: `chain/`, `cycle/`, `errors/` | New directories for nested/circular test cases |
| **T004** [P] | Verify fixture: `examples/libraries/animations.eligian` exists with fadeIn action (already exists in repo) | Existing fixture file |
| **T005** [P] | Verify fixture: `test-import.eligian` exists importing `./examples/libraries/animations.eligian` (already exists in repo) | Existing test file |

**Checkpoint**: Foundation ready. All fixtures in place, test infrastructure prepared.

---

## Phase 3: User Story 1 (P1) - CLI Compilation with Library Imports 🎯 MVP

**Goal**: Enable CLI to load libraries and resolve references during compilation.

**Independent Test**: Compile `test-import.eligian`, verify output JSON contains `fadeIn` operations from imported library.

**Success Criteria**:
- CLI loads library files referenced by `import` statements
- References in main file resolve to imported actions/constants
- Output JSON contains operations from both files
- No duplicate definitions when importing multiple times
- Relative path resolution works on all platforms

### Test Implementation (T006-T011) - TESTS FIRST

| Task | Description | File |
|------|-------------|------|
| **T006** [P] [US1] | **Unit test**: `extractLibraryImports()` - No imports, single import, multiple imports, deduplication | `packages/language/src/compiler/__tests__/library-loading.spec.ts` lines 1-50 |
| **T007** [P] [US1] | **Unit test**: `resolveLibraryPath()` - Relative paths (`./lib/`), parent paths (`../lib/`), Windows paths (`.\lib\`), absolute paths | lines 51-120 |
| **T008** [P] [US1] | **Unit test**: `loadLibraryFile()` - Success case, file not found error, permission denied error, encoding errors | lines 121-180 |
| **T009** [P] [US1] | **Unit test**: `parseLibraryDocument()` - Valid library document, syntax errors, non-library type errors | lines 181-240 |
| **T010** [P] [US1] | **Unit test**: `linkLibraryDocuments()` - Single library linking, multiple libraries, re-linking main document | lines 241-300 |
| **T011** [US1] | **Integration test**: CLI compilation with single library - Compile `test-import.eligian` with `animations.eligian`, verify output JSON structure | `packages/cli/src/__tests__/cli-library.spec.ts` lines 1-80 |

**Test Organization**: Write all tests first (T006-T011) before ANY implementation begins. Use test fixtures:
- Create `packages/language/src/compiler/__tests__/__fixtures__/libraries/` subdirectory
- Add test CSS files for setup helpers
- Mock FileSystem effects for error scenarios

### Implementation (T012-T020) - AFTER TESTS PASS

| Task | Description | File | Implementation Notes |
|------|-------------|------|----------------------|
| **T012** [US1] | Implement `extractLibraryImports()` function - Parse import statements, return URI array | `packages/language/src/compiler/pipeline.ts` ~line 340 | Extract from AST, deduplicate by URI |
| **T013** [US1] | Implement `resolveLibraryPath()` function - Convert relative paths to absolute URIs | `packages/language/src/compiler/pipeline.ts` ~line 360 | Use vscode-uri, handle platform differences |
| **T014** [US1] | Implement `loadLibraryFile()` function - Read file content, handle errors | `packages/language/src/compiler/pipeline.ts` ~line 380 | Use FileSystem effect, typed errors |
| **T015** [US1] | Implement `parseLibraryDocument()` function - Parse library file with Langium, validate type | `packages/language/src/compiler/pipeline.ts` ~line 400 | Return AstNode, check Root type |
| **T016** [US1] | Implement `linkLibraryDocuments()` function - Add library actions to symbol table | `packages/language/src/compiler/pipeline.ts` ~line 420 | Update scoping/name resolution |
| **T017** [US1] | Integrate library loading into main pipeline - Insert after CSS loading (~line 340), before validation | `packages/language/src/compiler/pipeline.ts` ~line 340 | Add to Effect pipeline with proper error handling |
| **T018** [US1] | Execute integration test T011 - Compile test-import.eligian, verify acceptance criteria | Run test | `pnpm test -- cli-library.spec.ts` |
| **T019** [US1] | Format and lint code - Apply Biome auto-fix to all modified files | Apply tool | `pnpm run check` - MUST PASS |
| **T020** [US1] | Run full test suite - Ensure no regressions, all tests passing | Run tests | `pnpm run test` - ALL TESTS MUST PASS |

**Checkpoint**: US1 fully functional. CLI loads single libraries, resolves references, generates correct JSON output.

---

## Phase 4: User Story 2 (P2) - Error Reporting for Library Failures

**Goal**: Clear, actionable error messages for library loading failures.

**Independent Test**: Broken imports and missing files produce helpful errors in CLI output.

**Success Criteria**:
- File not found errors show search paths attempted
- Parse errors show library filename + line number
- Invalid library type errors explain what's wrong
- Error messages guide user to fix (e.g., "Did you mean: `import './lib/actions.eligian'`?")

### Test Implementation (T021-T027) - TESTS FIRST

| Task | Description | File |
|------|-------------|------|
| **T021** [P] [US2] | **Unit test**: Format `FileNotFound` error - Expected paths shown, suggestion for similar files | `packages/language/src/compiler/__tests__/library-errors.spec.ts` lines 1-40 |
| **T022** [P] [US2] | **Unit test**: Format `ParseError` - Filename, line/column, syntax error message | lines 41-90 |
| **T023** [P] [US2] | **Unit test**: Format `InvalidLibrary` error - Not a library file, incompatible version | lines 91-140 |
| **T024** [P] [US2] | Create fixture: `examples/libraries/errors/missing-library.eligian` - Imports non-existent file | New fixture |
| **T025** [P] [US2] | Create fixture: `examples/libraries/errors/broken-library.eligian` - Imports syntactically invalid library | New fixture |
| **T026** [US2] | **Integration test**: Missing library error - CLI shows helpful error message with search paths | `packages/cli/src/__tests__/cli-library-errors.spec.ts` lines 1-50 |
| **T027** [US2] | **Integration test**: Library syntax error - Error includes library filename and line number | lines 51-100 |

### Implementation (T028-T033) - AFTER TESTS PASS

| Task | Description | File | Implementation Notes |
|------|-------------|------|----------------------|
| **T028** [US2] | Define `LibraryLoadError` type - Tagged union: FileNotFound, ParseError, InvalidLibrary, CircularDependency | `packages/language/src/compiler/pipeline.ts` ~line 50 | Export for use in error-reporter |
| **T029** [US2] | Implement `formatLibraryError()` function - Convert LibraryLoadError to readable message with suggestions | `packages/language/src/compiler/error-reporter.ts` ~line 200 | Include source context, actionable guidance |
| **T030** [US2] | Update error handling in pipeline - Map file errors to FileNotFound, parse errors to ParseError, type errors to InvalidLibrary, cycle detection to CircularDependency; format via formatLibraryError() | `packages/language/src/compiler/pipeline.ts` ~line 340 | Use Effect.mapError for proper error propagation |
| **T031** [US2] | Execute integration tests T026-T027 - Verify error messages are clear and helpful | Run tests | `pnpm test -- cli-library-errors.spec.ts` |
| **T032** [US2] | Format and lint code - Apply Biome auto-fix | Apply tool | `pnpm run check` - MUST PASS |
| **T033** [US2] | Run full test suite - Ensure US1 + US2 working together, no regressions | Run tests | `pnpm run test` - ALL TESTS MUST PASS |

**Checkpoint**: US1 AND US2 work independently and together. Users see clear errors for library failures.

---

## Phase 5: User Story 3 (P3) - Nested Dependencies

**Goal**: Enable libraries to import other libraries, with cycle detection.

**Independent Test**: Chain `a.eligian` → `b.eligian` → `c.eligian` compiles successfully. Cycle `a.eligian` → `b.eligian` → `a.eligian` produces error.

**Success Criteria**:
- Libraries can import other libraries (transitive dependencies)
- Circular dependencies detected and reported (prevent infinite loops)
- No redundant loading (each file loaded once)
- Deep nesting supported (10+ levels in <2 seconds)
- Clear error messages for cycles (show dependency chain)

### Test Implementation (T034-T040) - TESTS FIRST

| Task | Description | File |
|------|-------------|------|
| **T034** [P] [US3] | **Unit test**: Cycle detection - No cycle (A→B), cycle (A→B→A), loading stack cleared between documents | `packages/language/src/compiler/__tests__/library-recursive.spec.ts` lines 1-60 |
| **T035** [P] [US3] | **Unit test**: Recursive loading - Single level (A imports B), nested (A→B→C), with cycles, no redundant loads | lines 61-140 |
| **T036** [P] [US3] | Create fixtures directory: `examples/libraries/chain/` - Chain: a.eligian→b.eligian→c.eligian (each imports previous) | New fixtures |
| **T037** [P] [US3] | Create fixtures directory: `examples/libraries/cycle/` - Cycles: cycle-a.eligian→cycle-b.eligian→cycle-a.eligian | New fixtures |
| **T038** [US3] | **Integration test**: Nested dependencies (3 levels) - Compile chain a→b→c, verify actions available in output | `packages/cli/src/__tests__/cli-library-recursive.spec.ts` lines 1-80 |
| **T039** [US3] | **Integration test**: Circular dependency detection - Compile cycle-a, get error showing cycle chain | lines 81-150 |
| **T040** [US3] | **Integration test**: Deep nesting (10 levels) - Compile deeply nested chain, verify completes in <2 seconds | lines 151-200 |

### Implementation (T041-T046) - AFTER TESTS PASS

| Task | Description | File | Implementation Notes |
|------|-------------|------|----------------------|
| **T041** [US3] | Implement cycle detection - Track `loadingStack` (currently loading) and `loadedDocuments` (finished) | `packages/language/src/compiler/pipeline.ts` ~line 430 | Prevent infinite recursion, allow reuse of loaded docs |
| **T042** [US3] | Implement `loadLibraryRecursive()` function - Recursive loading with cycle detection | `packages/language/src/compiler/pipeline.ts` ~line 460 | Call extractLibraryImports for each library, recurse |
| **T043** [US3] | Refactor library loading to use recursive function - Replace T017 integration point with recursive version | `packages/language/src/compiler/pipeline.ts` ~line 340 | Update pipeline to use loadLibraryRecursive() |
| **T044** [US3] | Execute integration tests T038-T040 - Verify nested deps work, cycles detected, performance acceptable | Run tests | `pnpm test -- cli-library-recursive.spec.ts` |
| **T045** [US3] | Format and lint code - Apply Biome auto-fix | Apply tool | `pnpm run check` - MUST PASS |
| **T046** [US3] | Run full test suite - Ensure US1 + US2 + US3 working together, all tests passing | Run tests | `pnpm run test` - ALL TESTS MUST PASS |

**Checkpoint**: All user stories functional. Libraries can import libraries, cycles detected, deep nesting supported.

---

## Phase 6: Polish & Cross-Cutting Concerns

Final quality assurance, documentation, and verification before release.

| Task | Description | Action | Target |
|------|-------------|--------|--------|
| **T047** [P] | Run test coverage analysis | `pnpm run test:coverage` | Identify gaps |
| **T048** | Verify coverage threshold met | Review coverage report | **80%+ on library-related code** |
| **T049** [P] | Add missing tests (if coverage <80%) | Write tests for uncovered branches | Achieve 80%+ coverage |
| **T050** [P] | Update TECHNICAL_OVERVIEW.md (Constitution Principle XXVI) | Document library loading architecture, design decisions | `f:/projects/eligius/eligian/TECHNICAL_OVERVIEW.md` |
| **T051** | Performance benchmarking | Compile with 1, 5, 10, 20 library chain | Measure time, memory |
| **T052** | Document performance in quickstart.md | Add performance guidelines and benchmarks | `specs/032-library-file-loading/quickstart.md` |
| **T053** | Final end-to-end test | Compile realistic multi-file example (animations, utilities, main) | Verify complete workflow |
| **T054** | Run full workspace test suite | `pnpm -w run test` | ALL TESTS MUST PASS |
| **T055** | Run full workspace linting | `pnpm -w run check` | **0 errors, 0 warnings** |
| **T056** | Verify all success criteria | Review against Feature 032 spec success criteria (SC-001 through SC-004) | ALL CRITERIA MET |

**Checkpoint**: Feature complete, tested, documented, ready for integration.

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup)
    ↓
Phase 2 (Foundational) ← BLOCKS all user stories
    ↓
Phase 3 (US1) ← INDEPENDENT MVP
    ↓
Phase 4 (US2) ← Builds on US1
    ├─→ Phase 5 (US3) ← Can run parallel with US2 after US1 completes
    ↓
Phase 6 (Polish) ← Runs after all stories complete
```

### User Story Dependencies

- **US1 (P1)**: Independent MVP. No dependencies. Can be delivered first.
- **US2 (P2)**: Depends on US1 infrastructure. Error handling uses functions from US1.
- **US3 (P3)**: Depends on US1 infrastructure. Recursion extends US1's linear loading.

**Parallel Opportunities**:
- US2 and US3 can run in parallel after US1 core functions (T012-T016) complete
- T024-T025 (US2 fixtures) can run while T021-T023 (US2 unit tests) are in progress
- T036-T037 (US3 fixtures) can run while T034-T035 (US3 unit tests) are in progress

### Within-Story Execution Order

**Mandatory Sequence**:
1. **Tests First** (T00x-T01x-ish per story) - Write ALL tests before implementation
2. **Implementation** (T01x-T02x-ish per story) - Implement functions to make tests pass
3. **Integration** (T01x final per story) - Run integration tests, verify acceptance criteria
4. **Quality** (T01x final per story) - Run linting, full test suite

**Why Tests First** (Constitution Principle II):
- Clarifies acceptance criteria before coding
- Prevents implementation errors from breaking untested code
- Makes refactoring safe (tests verify behavior)
- Reduces debugging time (test failures pinpoint issues)

---

## Parallel Execution Strategy

### Example: US1 Development (Fully Parallel)

**Day 1 - Tests (T006-T010)**:
```bash
# Terminal 1: Unit test development
# Write T006, T007, T008, T009, T010 tests
# These run in parallel - different test files
pnpm test -- library-loading.spec.ts

# Terminal 2: Integration test development (parallel)
# Write T011 test while terminal 1 is writing other tests
pnpm test -- cli-library.spec.ts --watch
```

**Day 2 - Implementation (T012-T016)**:
```bash
# All these implementations are independent, can run tests in parallel
T012: extractLibraryImports()        # Test T006
T013: resolveLibraryPath()           # Test T007
T014: loadLibraryFile()              # Test T008
T015: parseLibraryDocument()         # Test T009
T016: linkLibraryDocuments()         # Test T010

# Run each test after implementation completes:
pnpm test -- library-loading.spec.ts
```

**Day 3 - Integration & Quality**:
```bash
# Run all tests
pnpm run test

# Apply linting (auto-fix)
pnpm run check

# Verify no regressions
pnpm test -- cli-library.spec.ts
```

### Example: US2 + US3 in Parallel (After US1 Core Complete)

Once T012-T016 (US1 core implementation) pass:

**Terminal 1 (US2 Tests & Implementation)**:
```bash
# T021-T027: Write error tests and fixtures
# T028-T033: Implement error formatting and handling
pnpm test -- library-errors.spec.ts --watch
```

**Terminal 2 (US3 Tests & Implementation)** - Parallel:
```bash
# T034-T040: Write recursive tests and fixtures
# T041-T046: Implement recursive loading and cycle detection
pnpm test -- library-recursive.spec.ts --watch
```

**Merge Point**: Phase 6 (Polish) - All US1, US2, US3 complete

---

## Implementation Strategy

### MVP First (Minimum Viable Product)

**Deliver US1 before US2/US3**:
1. US1 is a complete, shippable feature (CLI can load libraries)
2. Enables early user feedback and testing
3. Provides stable foundation for US2/US3

**User Value Progression**:
- US1: "I can load a single library and use its actions"
- US1+US2: "I get clear errors when something goes wrong"
- US1+US2+US3: "I can organize code into multiple library files with automatic resolution"

### Incremental Delivery

**Release Schedule**:
1. **v0.1.0** (US1 only): Basic library loading, happy path
   - Feature complete, production-ready
   - Known limitations: single-level only, minimal error messages
2. **v0.2.0** (US1+US2): Error handling
   - User-friendly error messages
   - Better diagnostics for debugging
3. **v0.3.0** (US1+US2+US3): Nested dependencies
   - Full transitive dependency support
   - Enterprise-grade solution

### Team-Based Parallel Strategy (If Applicable)

If working with a team:

**Team Member 1** (US1):
- T001-T020: Setup through US1 completion
- Owns `pipeline.ts` changes for library loading core

**Team Member 2** (US2):
- Starts after US1 core functions exist (T012-T016)
- T021-T033: Error reporting and handling
- Owns `error-reporter.ts` changes

**Team Member 3** (US3):
- Starts after US1 core functions exist (T012-T016)
- T034-T046: Nested dependencies
- Extends `pipeline.ts` for recursion

**Integration Point**: Phase 6 (Polish)
- Combine all changes, run full test suite
- Fix any interaction issues
- Optimize performance together

---

## Notes & Conventions

### Task Metadata

- **[P]**: Task can run in parallel (different files, no blocking dependencies)
  - Example: T006, T007, T008, T009, T010 are independent unit tests → all [P]
  - Example: T012, T013, T014, T015, T016 are independent implementations → can be [P] but sequential safer

- **[US1/US2/US3]**: Task belongs to this user story
  - Enables traceability and story-based delivery
  - All US1 tasks can be delivered before US2/US3 start

- **File Paths**: Always include exact file paths and line numbers
  - Example: `packages/language/src/compiler/pipeline.ts` ~line 340
  - Helps implementer locate code quickly

### Quality Standards

**Test-First is NON-NEGOTIABLE**:
- Write ALL tests before ANY implementation
- Tests define acceptance criteria
- Implementation makes tests pass
- No exceptions (per Constitution Principle II)

**Run Checks After Every Change**:
- After each task: `pnpm run check` (format + lint)
- Must show: **0 errors, 0 warnings**
- Ensures code quality, consistency, maintainability

**Commit After Each Story**:
- US1 complete → commit with message: "Implement library file loading (US1)"
- US2 complete → commit: "Add library error reporting (US2)"
- US3 complete → commit: "Add nested library dependencies (US3)"
- Enables easy rollback, clear history, atomic features

### Files Modified by Feature

```
packages/language/src/compiler/
├── pipeline.ts              # Main changes (library loading orchestration)
├── error-reporter.ts        # Error formatting
├── __tests__/
│   ├── library-loading.spec.ts        # US1 unit tests
│   ├── library-errors.spec.ts         # US2 unit tests
│   └── library-recursive.spec.ts      # US3 unit tests
└── (no new files for Phase 1, all extensions)

packages/cli/src/
├── __tests__/
│   ├── cli-library.spec.ts            # US1 integration test
│   ├── cli-library-errors.spec.ts     # US2 integration test
│   └── cli-library-recursive.spec.ts  # US3 integration test
└── (no changes to CLI code itself - uses pipeline.ts)

examples/
├── libraries/
│   ├── simple/
│   │   └── animations.eligian        # Reusable actions
│   ├── chain/
│   │   ├── a.eligian
│   │   ├── b.eligian
│   │   └── c.eligian
│   ├── cycle/
│   │   ├── cycle-a.eligian
│   │   └── cycle-b.eligian
│   └── errors/
│       ├── missing-library.eligian
│       └── broken-library.eligian
└── test-import.eligian                # Main test fixture
```

### Expected Test Output Example

After all phases complete:

```
✓ library-loading.spec.ts (5 tests)
  ✓ extractLibraryImports
  ✓ resolveLibraryPath
  ✓ loadLibraryFile
  ✓ parseLibraryDocument
  ✓ linkLibraryDocuments

✓ library-errors.spec.ts (3 tests)
  ✓ format FileNotFound error
  ✓ format ParseError
  ✓ format InvalidLibrary error

✓ library-recursive.spec.ts (2 tests)
  ✓ cycle detection
  ✓ recursive loading

✓ cli-library.spec.ts (1 test)
  ✓ CLI compilation with single library

✓ cli-library-errors.spec.ts (2 tests)
  ✓ missing library error
  ✓ library syntax error

✓ cli-library-recursive.spec.ts (3 tests)
  ✓ nested dependencies (3 levels)
  ✓ circular dependency detection
  ✓ deep nesting (10 levels)

TOTAL: 16 tests passing
Coverage: 82% (library-related code)
Time: 1250ms
```
