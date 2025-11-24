# Implementation Plan: Language Block Quick Fix

**Branch**: `038-language-quick-fixes` | **Date**: 2025-11-24 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/038-language-quick-fixes/spec.md`

## Summary

Implement an IDE quick fix that automatically generates a `languages` block when a developer has imported a labels file without declaring available languages. The quick fix parses the labels JSON file to extract unique language codes, generates a properly formatted `languages` block with all discovered languages (marking the first as default), and inserts it at the appropriate location in the file.

**Technical Approach**: Extend the existing `EligianCodeActionProvider` infrastructure (used for CSS code actions in Feature 013) to add a new `LanguageBlockCodeActionProvider`. The provider will detect missing language blocks when labels imports are present, parse the JSON labels file to extract language codes, and generate workspace edit actions to insert the formatted language block.

## Technical Context

**Language/Version**: TypeScript 5.x (Langium-based project)
**Primary Dependencies**: Langium (language server framework), vscode-languageserver-protocol (LSP types)
**Storage**: File system (read labels JSON files, write language blocks to .eligian files)
**Testing**: Vitest (unit tests), Langium test utilities (integration tests)
**Target Platform**: VS Code extension (language server)
**Project Type**: Single project (monorepo with language package)
**Performance Goals**:
  - Quick fix appears within 1 second of opening file (SC-006)
  - Complete workflow (detect → apply fix) < 5 seconds (SC-001)
  - Handle up to 50 language codes without degradation (SC-003)
**Constraints**:
  - Must preserve existing file content and formatting (FR-011)
  - Must work with relative and absolute label file paths
  - Must handle missing/invalid JSON files gracefully
**Scale/Scope**:
  - Single code action provider (~200-300 LOC)
  - JSON parsing logic (~100 LOC)
  - Language block generation (~50-100 LOC)
  - Test coverage: ~15-20 test cases

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Research Gate Check

✅ **I. Simplicity First**: Code action pattern already established in Feature 013 (CSS code actions). Reusing existing infrastructure.

✅ **II. Comprehensive Testing**: Will follow existing test patterns from `css-code-actions.spec.ts`

✅ **III. Type Safety with Effect**: Not applicable (LSP code actions are Promise-based, not Effect-based per Langium API)

✅ **IV. Clear Error Messages**: N/A (quick fix provides template on errors, no error messages to users)

✅ **V. Test-Driven Development**: Will write tests first per spec acceptance scenarios

✅ **VI. External Immutability, Internal Performance**: Code actions are inherently side-effect-free (return workspace edits)

✅ **VII. Functional Programming First**: Code action generation is pure transformation logic

✅ **VIII. Package Manager Discipline**: Using pnpm exclusively

✅ **XI. Code Quality with Biome**: All code will be checked with `pnpm run check`

✅ **XXIII. Testing with vitest-mcp Tools**: Will use vitest-mcp for all test execution

✅ **XXIV. Test Suite Maintenance**: Will use `createTestContext()` and test helpers from `test-helpers.ts`

✅ **XXV. Testing Guide Discipline**: Will consult `specs/TESTING_GUIDE.md` before writing tests

**Result**: ✅ PASSED - No constitution violations. Feature aligns with existing patterns.

### Post-Design Gate Check

✅ **I. Simplicity First**: Design uses clear module separation (parser, generator, position helper). No complex abstractions.

✅ **II. Comprehensive Testing**: Test plan covers all user stories with unit tests (parser, generator, position helper) and integration tests (full workflow).

✅ **III. Type Safety with Effect**: N/A (LSP APIs are Promise-based, not Effect-based)

✅ **IV. Clear Error Messages**: N/A (quick fix provides templates on errors, no error messages shown)

✅ **V. Test-Driven Development**: Will write tests before implementation per TDD workflow.

✅ **VI. External Immutability, Internal Performance**: All APIs are pure functions (static methods, immutable data structures).

✅ **VII. Functional Programming First**: Design uses functional patterns - pure functions, no classes with state, immutable data.

✅ **VIII. Package Manager Discipline**: All dependencies managed via pnpm.

✅ **IX. Langium Grammar Best Practices**: No grammar changes needed (LanguagesBlock already exists).

✅ **XI. Code Quality with Biome**: Quality gate includes `pnpm run check`.

✅ **XXIII. Testing with vitest-mcp Tools**: Quality gate uses `mcp__vitest__run_tests`.

✅ **XXIV. Test Suite Maintenance**: Will use `createTestContext()` and `setupCSSRegistry()` helpers.

✅ **XXV. Testing Guide Discipline**: Will consult `specs/TESTING_GUIDE.md` before writing tests.

**Architecture Review**:
- Module structure mirrors existing CSS code actions (proven pattern)
- API design follows existing `CSSCodeActionProvider` pattern
- Data model is simple and type-safe (8 types total, low complexity)
- No new dependencies required
- Clear separation of concerns (parsing, generation, positioning)

**Performance Review**:
- Async file I/O (non-blocking)
- Single AST traversal for positioning
- Set-based deduplication (O(n) complexity)
- Expected performance well under requirements (<100ms vs 1 second limit)

**Complexity Review**:
- Total implementation: ~400-500 LOC
- 4 modules with single responsibility each
- No complex algorithms (simple parsing, generation, traversal)
- Reuses existing infrastructure (no reinvention)

**Result**: ✅ PASSED - Design aligns with all applicable constitution principles. No violations. Ready for implementation.

## Project Structure

### Documentation (this feature)

```text
specs/038-language-quick-fixes/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output - Research findings
├── data-model.md        # Phase 1 output - Data structures
├── quickstart.md        # Phase 1 output - Usage guide
└── contracts/           # Phase 1 output - API contracts
    └── code-action-api.md
```

### Source Code (repository root)

```text
packages/language/
├── src/
│   ├── eligian-code-action-provider.ts  # Main orchestrator (EXISTING - will extend)
│   ├── labels/                          # NEW - Labels quick fix logic
│   │   ├── language-block-code-actions.ts      # Code action provider
│   │   ├── labels-parser.ts                    # JSON parsing + language extraction
│   │   ├── language-block-generator.ts         # Generate formatted language block
│   │   ├── file-position-helper.ts             # Determine insertion position
│   │   └── index.ts                            # Public exports
│   └── __tests__/                       # NEW - Test files
│       ├── language-quick-fix-integration/
│       │   ├── basic-generation.spec.ts        # US1: Basic generation
│       │   ├── error-handling.spec.ts          # US2: Error cases
│       │   ├── positioning.spec.ts             # US3: Smart positioning
│       │   └── fixtures/
│       │       ├── valid-labels.json
│       │       ├── invalid-labels.json
│       │       └── sample-programs.eligian
│       └── labels/
│           ├── labels-parser.spec.ts           # Unit tests for parser
│           ├── language-block-generator.spec.ts # Unit tests for generator
│           └── file-position-helper.spec.ts    # Unit tests for positioning
```

**Structure Decision**: Following existing pattern from Feature 013 (CSS code actions). New `labels/` directory under `packages/language/src/` contains the code action logic, mirroring the `css/` directory structure. Tests are co-located in `__tests__/` following constitution principle XX.

## Complexity Tracking

> No complexity violations to justify - feature uses existing patterns and infrastructure.

## Phase 0: Research & Technology Selection

See [research.md](research.md) for detailed findings.

**Key Research Questions**:
1. What is the exact structure of labels JSON files? (Answered: array of label groups with nested labels containing languageCode fields)
2. How does Langium's CodeActionProvider API work? (Answered: existing implementation in css-code-actions.ts provides template)
3. What is the algorithm for determining insertion position? (Research needed: AST traversal patterns)
4. How should we handle edge cases (multiple imports, missing files)? (Research needed: error handling patterns)

**Research Outputs**:
- Labels JSON schema analysis (from examples/demo-labels.json)
- Langium CodeActionProvider API patterns (from eligian-code-action-provider.ts)
- Workspace edit construction patterns (from css-code-actions.ts)
- Error handling strategies for file I/O failures

## Phase 1: Design & Contracts

See [data-model.md](data-model.md) for entity definitions.
See [quickstart.md](quickstart.md) for usage examples.
See [contracts/](contracts/) for API specifications.

**Key Design Decisions**:
1. **Code Action Provider Pattern**: Extend existing `EligianCodeActionProvider` with new `LanguageBlockCodeActionProvider` delegate
2. **Language Extraction Algorithm**:
   - Parse JSON as array of label groups
   - Extract `languageCode` from each label in each group
   - Deduplicate using Set
   - Sort alphabetically for consistent ordering
3. **Insertion Position Logic**:
   - Search for existing LanguagesBlock node (if found, skip quick fix)
   - Find first non-comment token in Program
   - Insert before first import or timeline declaration
4. **Template Generation**: When labels file missing/invalid, generate with `en-US` default

**Data Model**:
- `LanguageCodeInfo`: Extracted language code metadata
- `LanguageBlockQuickFixContext`: Context for generating the quick fix
- `InsertionPosition`: Line/column for workspace edit

**API Contract**:
- `LanguageBlockCodeActionProvider.provideCodeActions()`: Main entry point
- `LabelsParser.extractLanguageCodes()`: Parse JSON and extract codes
- `LanguageBlockGenerator.generate()`: Format language block text
- `FilePositionHelper.findInsertionPosition()`: Determine where to insert

## Phase 2: Implementation Tasks

*See `/speckit.tasks` command output (tasks.md) for detailed task breakdown.*

**Implementation will be broken into these phases**:

### Phase 2.1: Core Infrastructure (US1 - P1)
- Implement `LabelsParser.extractLanguageCodes()`
- Implement `LanguageBlockGenerator.generate()`
- Implement `FilePositionHelper.findInsertionPosition()`
- Implement `LanguageBlockCodeActionProvider` skeleton

### Phase 2.2: Quick Fix Integration (US1 - P1)
- Integrate provider into `EligianCodeActionProvider`
- Implement diagnostic detection (missing language block)
- Implement workspace edit generation
- Add basic integration tests

### Phase 2.3: Error Handling (US2 - P2)
- Add template generation for missing files
- Add template generation for invalid JSON
- Add error logging and graceful degradation
- Add error handling tests

### Phase 2.4: Smart Positioning (US3 - P3)
- Implement comment detection logic
- Implement proper whitespace insertion
- Add positioning tests
- Add edge case tests

### Phase 2.5: Quality Gates
- Run `pnpm run build` (verify TypeScript compilation)
- Run `pnpm run check` (verify Biome linting)
- Run vitest-mcp tests (verify all tests pass)
- Verify coverage meets baseline (>80%)

## Dependencies & Integration Points

**Existing Infrastructure (Reuse)**:
- `EligianCodeActionProvider` (main orchestrator)
- Langium `CodeActionProvider` interface
- VS Code LSP `CodeAction` and `WorkspaceEdit` types
- File system utilities (already used in css-code-actions.ts)

**New Dependencies**:
- None (all functionality uses existing infrastructure)

**Integration Points**:
1. **Validator Integration**: May need to add diagnostic for "missing language block when labels imported" (optional - quick fix can work without diagnostic)
2. **Grammar**: No changes needed (LanguagesBlock already exists)
3. **Extension**: No changes needed (code actions automatically registered via LSP)

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Labels JSON schema variations | Medium | Implement defensive parsing with fallbacks |
| File I/O performance with large labels files | Low | Async parsing, cache results in memory |
| Workspace edit conflicts with user edits | Low | Use LSP atomic edits, test with dirty buffers |
| Edge cases in positioning logic | Medium | Comprehensive test coverage for all positioning scenarios |

## Success Metrics Alignment

| Success Criterion | Implementation Strategy |
|------------------|------------------------|
| SC-001: <5 second workflow | Async file parsing, minimal processing |
| SC-002: 100% language code inclusion | Set-based deduplication, comprehensive tests |
| SC-003: Handle 50+ languages | Performance tests with large fixtures |
| SC-004: 95% correct generation | Extensive positioning tests, format validation |
| SC-005: 80% time reduction | N/A (measured by user feedback) |
| SC-006: <1 second appearance | Diagnostic-based triggering (instant) |

## Next Steps

1. ✅ Complete research.md (Phase 0)
2. ✅ Complete data-model.md (Phase 1)
3. ✅ Complete contracts/ (Phase 1)
4. ✅ Complete quickstart.md (Phase 1)
5. ⏭️ Run `/speckit.tasks` to generate implementation tasks (Phase 2)
6. ⏭️ Implement according to task breakdown
7. ⏭️ Validate against quality gates
