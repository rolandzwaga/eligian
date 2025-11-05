# Implementation Plan: Multi-File Test Infrastructure for Library Imports

**Branch**: `025-during-the-previous` | **Date**: 2025-01-05 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/025-during-the-previous/spec.md`

## Summary

Extend the existing test infrastructure (`test-helpers.ts`) to support multi-file test scenarios with library imports. The current infrastructure supports single library document creation via `createLibraryDocument()` and mock file system testing via `createTestContextWithMockFS()`, but lacks bulk document setup, import chain validation, and cross-document reference testing helpers. This feature will add three new helper methods that enable comprehensive integration testing of import functionality, unblocking the 3 skipped tests from Feature 024.

## Technical Context

**Language/Version**: TypeScript 5.9.3 (Node.js 24.x)
**Primary Dependencies**: Langium 4.0.3 (LSP framework), Vitest 3.2.4 (testing)
**Storage**: N/A (in-memory mock file system for tests)
**Testing**: Vitest with existing test infrastructure (`createTestContext`, `setupCSSRegistry`)
**Target Platform**: Test infrastructure only (Node.js test environment)
**Project Type**: Monorepo (language package only)
**Performance Goals**: Multi-file test setup should complete in under 500ms for up to 10 library files
**Constraints**: Must maintain compatibility with existing test patterns, must use Langium's document management services (no custom registries)
**Scale/Scope**: Support up to 10 library files per test scenario (per spec.md success criteria SC-004)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with `.specify/memory/constitution.md`:

- [x] **Simplicity & Documentation**: Clear helper methods with well-documented APIs, no complex abstractions
- [x] **Comprehensive Testing**: Test helpers will be tested with integration tests demonstrating multi-file scenarios
- [x] **No Gold-Plating**: Solves real, documented need (unblocks Feature 024 skipped tests, enables import testing)
- [x] **Code Review**: Standard PR process applies
- [x] **UX Consistency**: Helper methods follow existing test-helpers.ts patterns (`createX`, `setupX` naming)
- [x] **Functional Programming**: Helpers are pure functions, no global state, compatible with Vitest test lifecycle

*All checks pass - no complexity tracking needed.*

## Project Structure

### Documentation (this feature)

```
specs/025-during-the-previous/
├── plan.md              # This file
├── research.md          # Phase 0 output (Langium document lifecycle, multi-file patterns)
├── data-model.md        # Phase 1 output (test helper API design, document state diagram)
├── quickstart.md        # Phase 1 output (usage examples, migration guide)
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (existing language package)

```
packages/language/src/
├── __tests__/
│   ├── test-helpers.ts              # MODIFY: Add multi-file helper methods
│   ├── mock-file-system.ts          # READ: Existing mock FS implementation
│   ├── import-validation.spec.ts    # READ: Existing multi-file test patterns
│   └── multi-file-helpers/          # NEW: Integration tests for new helpers
│       ├── setup-documents.spec.ts  # Test setupDocuments() helper
│       ├── validate-import-chain.spec.ts  # Test validateImportChain() helper
│       └── create-library-documents.spec.ts  # Test createLibraryDocuments() helper
└── eligian-scope-provider.ts        # READ: Import resolution logic
```

**Structure Decision**: This is an **enhancement** to the existing test infrastructure. No new packages or major modules needed - only extending `test-helpers.ts` with new helper methods and adding integration tests to verify the helpers work correctly. The implementation leverages existing Langium services (`LangiumDocuments`, `DocumentBuilder`, `ScopeProvider`) without introducing custom abstractions.

## Complexity Tracking

*No violations - all Constitution checks pass.*

## Phase 0: Research & Investigation

**Goal**: Understand Langium's document lifecycle, multi-file coordination, and existing test patterns to design helper methods that integrate seamlessly.

### Research Tasks

1. **Langium Document Lifecycle Analysis**
   - Task: Analyze Langium's document build pipeline (Parsed → Indexed → Linked → Validated)
   - Files: Langium documentation, `LangiumDocuments` service, `DocumentBuilder` service
   - Key questions: When are cross-references resolved? When are imports validated? What is the correct order for multi-document builds?
   - Output: Document build pipeline stages and requirements for multi-file coordination

2. **Existing Multi-File Test Patterns**
   - Task: Analyze existing tests that use library imports (import-validation.spec.ts, library-scoping.spec.ts)
   - Files: `packages/language/src/__tests__/import-validation.spec.ts`, `packages/language/src/__tests__/library-scoping.spec.ts`
   - Key patterns: How are library documents created? How are imports validated? How is the mock FS used?
   - Output: Document existing patterns and identify pain points

3. **Helper Method Design Patterns**
   - Task: Analyze existing helper methods in test-helpers.ts for API consistency
   - Files: `packages/language/src/__tests__/test-helpers.ts`
   - Key patterns: `createTestContext()` factory, `setupCSSRegistry()` setup helper, `createLibraryDocument()` document creation
   - Output: Document naming conventions, parameter patterns, return types

4. **Import Resolution Logic**
   - Task: Understand how EligianScopeProvider resolves library imports
   - Files: `packages/language/src/eligian-scope-provider.ts` (lines 129-171 - `getImportedActions`)
   - Key questions: How are relative paths resolved? How are library documents located? What URIs are expected?
   - Output: Document import resolution rules and URI patterns for test library files

**Deliverable**: `research.md` documenting:
- Langium document lifecycle and multi-file build requirements
- Existing multi-file test patterns with examples
- Helper method design patterns for consistency
- Import resolution logic and URI requirements
- Recommendations for helper method APIs

## Phase 1: Design Artifacts

**Prerequisites**: `research.md` complete

### Data Model

**Test Context Extension** (augment existing `TestContext`):
```typescript
interface TestContext {
  // Existing properties
  services: EligianServices;
  parse: ParseHelper<Program>;
  parseAndValidate: (code: string) => Promise<{...}>;
  mockFs?: MockFileSystemProvider;  // Optional mock FS

  // NEW: Multi-file helper methods
  setupDocuments?: (docs: DocumentSpec[]) => Promise<Map<string, LangiumDocument>>;
  validateImportChain?: (rootUri: string) => Promise<ImportChainResult>;
  createLibraryDocuments?: (libs: LibrarySpec[]) => Promise<Map<string, LangiumDocument>>;
}

interface DocumentSpec {
  uri: string;
  content: string;
}

interface LibrarySpec {
  uri: string;
  content: string;  // Full library code (with 'library' keyword)
}

interface ImportChainResult {
  documents: LangiumDocument[];
  allErrors: Map<string, Diagnostic[]>;
  hasErrors: boolean;
}
```

**Document Lifecycle States** (Langium's DocumentBuilder pipeline):
```
1. Created     → Document created, not yet parsed
2. Parsed      → AST available, no indexing
3. Indexed     → Exported symbols available globally
4. Linked      → Cross-references resolved
5. Validated   → Validation complete, diagnostics available
```

**Multi-File Test Workflow**:
```
1. Create TestContext with mock FS
   ↓
2. Setup library documents (via setupDocuments or createLibraryDocuments)
   ↓
3. Library documents added to workspace
   ↓
4. Build library documents (Parsed → Validated)
   ↓
5. Parse main file that imports from libraries
   ↓
6. Main file added to workspace
   ↓
7. Build main file (resolves imports during Linked stage)
   ↓
8. Validate main file
   ↓
9. Assert zero errors for valid imports
```

### API Contracts

No external APIs - these are internal test helpers for package development.

### Quickstart Guide

**Usage Example 1: Basic Multi-File Setup**
```typescript
test('imports action from library', async () => {
  const ctx = createTestContextWithMockFS();

  // Setup library and main file in one call
  const docs = await ctx.setupDocuments([
    {
      uri: 'file:///test/animations.eligian',
      content: `
        library animations
        action fadeIn(selector: string, duration: number) [
          selectElement(selector)
          animate({opacity: 1}, duration)
        ]
      `
    },
    {
      uri: 'file:///test/main.eligian',
      content: `
        styles "./test.css"
        import { fadeIn } from "./animations.eligian"

        action test() [
          fadeIn("#app", 1000)
        ]
      `
    }
  ]);

  const mainDoc = docs.get('file:///test/main.eligian')!;
  const errors = mainDoc.diagnostics?.filter(d => d.severity === 1) ?? [];
  expect(errors).toHaveLength(0);
});
```

**Usage Example 2: Bulk Library Creation**
```typescript
beforeAll(async () => {
  ctx = createTestContextWithMockFS();

  // Create multiple libraries at once
  await ctx.createLibraryDocuments([
    { uri: 'file:///test/animations.eligian', content: `library animations ...` },
    { uri: 'file:///test/utils.eligian', content: `library utils ...` },
    { uri: 'file:///test/effects.eligian', content: `library effects ...` },
  ]);
});

test('imports from multiple libraries', async () => {
  const { diagnostics } = await ctx.parseAndValidate(`
    import { fadeIn } from "./animations.eligian"
    import { safeSelect } from "./utils.eligian"
    ...
  `);

  const errors = diagnostics.filter(d => d.severity === 1);
  expect(errors).toHaveLength(0);
});
```

**Usage Example 3: Import Chain Validation**
```typescript
test('validates entire import chain', async () => {
  const ctx = createTestContextWithMockFS();

  // Setup import chain: main → library1 → library2
  await ctx.setupDocuments([
    { uri: 'file:///test/library2.eligian', content: `library library2 ...` },
    { uri: 'file:///test/library1.eligian', content: `library library1 import { x } from "./library2.eligian" ...` },
    { uri: 'file:///test/main.eligian', content: `import { y } from "./library1.eligian" ...` },
  ]);

  // Validate entire chain
  const result = await ctx.validateImportChain('file:///test/main.eligian');

  expect(result.hasErrors).toBe(false);
  expect(result.documents).toHaveLength(3);
});
```

**Implementation Steps** (abbreviated):

1. Add `setupDocuments()` helper to test-helpers.ts
2. Add `createLibraryDocuments()` helper to test-helpers.ts
3. Add `validateImportChain()` helper to test-helpers.ts
4. Add integration tests for each helper method
5. Update Feature 024 skipped tests to use new helpers
6. Document helpers in test-helpers.ts JSDoc

**Agent Context Update**: Run update script after Phase 1 complete.

## Phase 2: Implementation Tasks

**Command**: Run `/speckit.tasks` to generate granular task breakdown.

This will create `tasks.md` with specific implementation tasks including:

- Test-first development (write failing tests for each helper)
- Implement `setupDocuments()` helper method
- Implement `createLibraryDocuments()` helper method
- Implement `validateImportChain()` helper method
- Update Feature 024 skipped tests (T003-T005) to use new helpers
- Verify all integration tests pass
- Run code quality checks (Biome + typecheck)
- Update test-helpers.ts JSDoc documentation

## Success Criteria Verification

From spec.md:

- **SC-001**: Test authors can create library files and test import scenarios in under 5 lines of test code
  - **Test**: Use `setupDocuments()` helper and verify < 5 lines for multi-file setup

- **SC-002**: Integration tests for imported action validation pass without requiring manual file creation in the workspace
  - **Test**: Verify Feature 024 tests (T003-T005) pass after updating to use new helpers

- **SC-003**: Test suite includes 100% coverage of import validation scenarios (valid imports, typos, multiple imports, mixed with operations)
  - **Test**: Run Feature 024 tests with all scenarios enabled (no skipped tests)

- **SC-004**: Test infrastructure supports creating up to 10 library files per test without performance degradation (tests complete in under 500ms)
  - **Test**: Create test with 10 library files, measure execution time

- **SC-005**: Zero test isolation failures caused by library document leakage between tests
  - **Test**: Run multiple tests with different library URIs, verify no cross-contamination

- **SC-006**: Test authors can verify code completion suggestions for imported actions in integration tests
  - **Test**: Create integration test for code completion with imported actions

## Notes

- **Minimal Scope**: This is a **test infrastructure enhancement**, not a language feature addition.
- **Existing Infrastructure**: Leverages existing Langium services (`LangiumDocuments`, `DocumentBuilder`) - no custom document management.
- **Test Strategy**: Add 3 integration tests for the 3 new helper methods, update 3 Feature 024 tests to use new helpers (total 6 tests)
- **No New Dependencies**: Uses existing test infrastructure and Langium APIs
- **Performance**: Multi-file setup should be fast (mock FS is in-memory, Langium document builds are efficient)
- **Backwards Compatibility**: Existing tests continue to work unchanged (helpers are additive, not breaking changes)
