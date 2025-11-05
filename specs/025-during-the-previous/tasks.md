# Tasks: Multi-File Test Infrastructure for Library Imports

**Input**: Design documents from `/specs/025-during-the-previous/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: This feature uses Test-First Development (TDD) approach per Constitution Principle II

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions
- **Language package**: `packages/language/src/__tests__/`
- Tests organized in subdirectories: `multi-file-helpers/` for new helper tests
- Feature 024 tests: `operation-validation.spec.ts` (existing file to update)

---

## Phase 1: Setup (No Changes Needed)

**Purpose**: Project structure already exists - no setup tasks required

**Status**: ✅ Complete - existing test infrastructure in place

---

## Phase 2: Foundational (Prerequisites)

**Purpose**: Understand existing test infrastructure before adding new helpers

**⚠️ CRITICAL**: These research tasks must complete before helper implementation can begin

- [X] T001 [P] [Foundational] Read existing test-helpers.ts to understand current patterns (lines 1-250)
  - **File**: `packages/language/src/__tests__/test-helpers.ts`
  - **Goal**: Understand `createTestContext()`, `setupCSSRegistry()`, `createLibraryDocument()` patterns
  - **Output**: Identify naming conventions, return types, error handling patterns
  - **Why foundational**: New helpers must follow existing patterns for consistency

- [X] T002 [P] [Foundational] Read mock-file-system.ts to understand mock FS API (lines 1-150)
  - **File**: `packages/language/src/__tests__/mock-file-system.ts`
  - **Goal**: Understand `MockFileSystemProvider` API (writeFile, exists, readFile)
  - **Output**: Know how to integrate with mock FS in new helpers
  - **Why foundational**: New helpers must auto-detect and use mock FS

- [X] T003 [Foundational] Review Langium document services API from research.md
  - **File**: `specs/025-during-the-previous/research.md` (Section 2)
  - **Goal**: Understand `LangiumDocuments`, `DocumentBuilder`, `DocumentFactory` APIs
  - **Output**: Know correct service methods for document registration and building
  - **Why foundational**: Helpers wrap Langium services - must use APIs correctly

**Checkpoint**: Foundation understood - helper implementation can now begin

---

## Phase 3: User Story 1 - Create Library Files in Test Workspace (Priority: P1) 🎯 MVP

**Goal**: Test authors can create library files programmatically in test workspace using `setupDocuments()` helper

**Independent Test**: Create library file in test, import it in main file, verify document is in workspace and import resolves without errors

**Why MVP**: This is the foundational capability. Without bulk document creation, all other stories cannot work. Delivers immediate value by enabling basic multi-file test scenarios.

### Tests for User Story 1 (Test-First Development)

**NOTE: Write these tests FIRST, ensure they FAIL before implementation (proves helper doesn't exist yet)**

- [X] T004 [P] [US1] Write failing test: "should create single document in workspace" in `packages/language/src/__tests__/multi-file-helpers/setup-documents.spec.ts`
  - **Test code**:
    ```typescript
    test('should create single document in workspace', async () => {
      const ctx = createTestContextWithMockFS();

      const docs = await setupDocuments(ctx, [
        { uri: 'file:///test/lib.eligian', content: 'library lib action x() []' },
      ]);

      expect(docs.size).toBe(1);
      expect(docs.has('file:///test/lib.eligian')).toBe(true);

      const doc = docs.get('file:///test/lib.eligian')!;
      expect(doc.parseResult.value).toBeDefined();
      expect(doc.diagnostics?.filter(d => d.severity === 1)).toHaveLength(0);
    });
    ```
  - **Expected**: Test FAILS - `setupDocuments` is not defined
  - **Location**: New file `multi-file-helpers/setup-documents.spec.ts`
  - **Why test-first**: Proves the helper doesn't exist yet, defines expected API

- [X] T005 [P] [US1] Write failing test: "should create multiple documents and build together" in `packages/language/src/__tests__/multi-file-helpers/setup-documents.spec.ts`
  - **Test code**:
    ```typescript
    test('should create multiple documents and build together', async () => {
      const ctx = createTestContextWithMockFS();

      const docs = await setupDocuments(ctx, [
        { uri: 'file:///test/lib.eligian', content: 'library lib action x() [ selectElement("#app") ]' },
        { uri: 'file:///test/main.eligian', content: 'import { x } from "./lib.eligian" action y() [ x() ]' },
      ]);

      expect(docs.size).toBe(2);

      const mainDoc = docs.get('file:///test/main.eligian')!;
      const errors = mainDoc.diagnostics?.filter(d => d.severity === DiagnosticSeverity.Error) ?? [];
      expect(errors).toHaveLength(0);  // Import should resolve
    });
    ```
  - **Expected**: Test FAILS - `setupDocuments` is not defined
  - **Why test-first**: Defines multi-file coordination requirement

- [X] T006 [P] [US1] Write failing test: "should write to mock FS if available" in `packages/language/src/__tests__/multi-file-helpers/setup-documents.spec.ts`
  - **Test code**:
    ```typescript
    test('should write to mock FS if available', async () => {
      const ctx = createTestContextWithMockFS();

      await setupDocuments(ctx, [
        { uri: 'file:///test/lib.eligian', content: 'library lib' },
      ]);

      const exists = await ctx.mockFs!.exists(URI.parse('file:///test/lib.eligian'));
      expect(exists).toBe(true);

      const content = await ctx.mockFs!.readFile(URI.parse('file:///test/lib.eligian'));
      expect(content).toContain('library lib');
    });
    ```
  - **Expected**: Test FAILS - `setupDocuments` is not defined
  - **Why test-first**: Verifies mock FS integration requirement

- [X] T007 [US1] Run tests to verify they FAIL (proves helper doesn't exist)
  - **Command**: `pnpm test setup-documents.spec.ts`
  - **Expected**: All tests T004-T006 FAIL - "setupDocuments is not defined"
  - **Why sequential**: Verify tests fail before implementing helper

### Implementation for User Story 1

- [X] T008 [US1] Implement `setupDocuments()` helper in `packages/language/src/__tests__/test-helpers.ts` (after line ~175)
  - **Code structure**:
    ```typescript
    export async function setupDocuments(
      ctx: TestContext,
      documents: Array<{ uri: string; content: string }>
    ): Promise<Map<string, LangiumDocument>> {
      const docs = new Map<string, LangiumDocument>();

      // Parse all documents first
      for (const { uri, content } of documents) {
        if (ctx.mockFs) {
          ctx.mockFs.writeFile(uri, content);
        }
        const doc = await ctx.parse(content, { documentUri: uri });
        docs.set(uri, doc);
      }

      // Build all documents together (resolves cross-references)
      await ctx.services.shared.workspace.DocumentBuilder.build(
        Array.from(docs.values()),
        { validation: true }
      );

      return docs;
    }
    ```
  - **Location**: After `createLibraryDocument()` (line ~175)
  - **Code size**: ~20 lines (includes JSDoc)
  - **Imports needed**: `LangiumDocument`, `URI` (if not already imported)
  - **Why here**: Groups with existing document creation helpers

- [X] T009 [US1] Add JSDoc documentation to `setupDocuments()` helper
  - **Documentation**:
    ```typescript
    /**
     * Setup multiple documents in the test workspace with automatic building
     *
     * Documents are parsed and added to the workspace, then built together to
     * resolve cross-references (e.g., imports). All documents are validated.
     *
     * @param ctx Test context with Langium services
     * @param documents Array of {uri, content} pairs
     * @returns Map of URI → LangiumDocument for easy lookup
     *
     * @example
     * const docs = await setupDocuments(ctx, [
     *   { uri: 'file:///test/lib.eligian', content: 'library lib ...' },
     *   { uri: 'file:///test/main.eligian', content: 'import { x } from "./lib.eligian"' },
     * ]);
     * const mainDoc = docs.get('file:///test/main.eligian')!;
     */
    ```
  - **Why**: Clear documentation for future test authors

- [ ] T010 [US1] Run tests to verify they PASS (proves helper works)
  - **Command**: `pnpm test setup-documents.spec.ts`
  - **Expected**: All tests T004-T006 PASS - documents created, built, and in workspace
  - **Depends on**: T008 (implementation), T009 (documentation)

- [ ] T011 [US1] Run full test suite to verify no regressions
  - **Command**: `pnpm test`
  - **Expected**: All existing tests still pass (1,566 tests)
  - **Regression check**: New helper doesn't break existing test infrastructure

**Checkpoint**: At this point, `setupDocuments()` helper is functional - bulk document creation works independently

---

## Phase 4: User Story 2 - Test Imported Action Validation (Priority: P2)

**Goal**: Test authors can use `createLibraryDocuments()` helper to create libraries in `beforeAll()`, then write tests that import from those libraries

**Independent Test**: Create libraries in `beforeAll()`, parse main file with imports, verify zero validation errors

**Why P2**: This builds on US1 (setupDocuments) and enables the primary use case - validating imported actions in integration tests. This unblocks Feature 024 skipped tests.

### Tests for User Story 2 (Test-First Development)

- [ ] T012 [P] [US2] Write failing test: "should create library documents" in `packages/language/src/__tests__/multi-file-helpers/create-library-documents.spec.ts`
  - **Test code**:
    ```typescript
    test('should create library documents', async () => {
      const ctx = createTestContextWithMockFS();

      const libs = await createLibraryDocuments(ctx, [
        { uri: 'file:///test/lib1.eligian', content: 'library lib1 action x() []' },
        { uri: 'file:///test/lib2.eligian', content: 'library lib2 action y() []' },
      ]);

      expect(libs.size).toBe(2);
      expect(libs.has('file:///test/lib1.eligian')).toBe(true);
      expect(libs.has('file:///test/lib2.eligian')).toBe(true);
    });
    ```
  - **Expected**: Test FAILS - `createLibraryDocuments` is not defined
  - **Location**: New file `multi-file-helpers/create-library-documents.spec.ts`

- [ ] T013 [P] [US2] Write failing test: "should enable imports in subsequent tests" in `packages/language/src/__tests__/multi-file-helpers/create-library-documents.spec.ts`
  - **Test code**:
    ```typescript
    let ctx: TestContext;

    beforeAll(async () => {
      ctx = createTestContextWithMockFS();
      await createLibraryDocuments(ctx, [
        { uri: 'file:///test/animations.eligian', content: 'library animations action fadeIn(selector: string) [ selectElement(selector) ]' },
      ]);
    });

    test('should enable imports in subsequent tests', async () => {
      const { diagnostics } = await ctx.parseAndValidate(`
        import { fadeIn } from "./animations.eligian"
        action test() [ fadeIn("#app") ]
      `);

      const errors = diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);
      expect(errors).toHaveLength(0);
    });
    ```
  - **Expected**: Test FAILS - `createLibraryDocuments` is not defined
  - **Why test-first**: Proves the beforeAll pattern requirement

- [ ] T014 [US2] Run tests to verify they FAIL (proves helper doesn't exist)
  - **Command**: `pnpm test create-library-documents.spec.ts`
  - **Expected**: Tests T012-T013 FAIL - "createLibraryDocuments is not defined"

### Implementation for User Story 2

- [ ] T015 [US2] Implement `createLibraryDocuments()` helper in `packages/language/src/__tests__/test-helpers.ts` (after setupDocuments)
  - **Code**:
    ```typescript
    /**
     * Create multiple library documents (convenience wrapper around setupDocuments)
     *
     * This is a semantic wrapper - the name makes intent clear when creating
     * libraries in beforeAll() setup, but implementation delegates to setupDocuments.
     *
     * @param ctx Test context
     * @param libraries Array of {uri, content} pairs for library files
     * @returns Map of URI → LangiumDocument
     *
     * @example
     * beforeAll(async () => {
     *   ctx = createTestContextWithMockFS();
     *   await createLibraryDocuments(ctx, [
     *     { uri: 'file:///test/animations.eligian', content: 'library animations ...' },
     *   ]);
     * });
     */
    export async function createLibraryDocuments(
      ctx: TestContext,
      libraries: Array<{ uri: string; content: string }>
    ): Promise<Map<string, LangiumDocument>> {
      return setupDocuments(ctx, libraries);
    }
    ```
  - **Location**: After `setupDocuments()` helper
  - **Code size**: ~15 lines (includes JSDoc)
  - **Why simple**: Just delegates to `setupDocuments()` - semantic clarity only

- [ ] T016 [US2] Run tests to verify they PASS (proves helper works)
  - **Command**: `pnpm test create-library-documents.spec.ts`
  - **Expected**: Tests T012-T013 PASS - libraries created and imports resolve
  - **Depends on**: T015 (implementation)

- [ ] T017 [US2] Update Feature 024 skipped test T003 to use new helper in `packages/language/src/__tests__/operation-validation.spec.ts`
  - **Change**: Remove `.skip()`, use `setupDocuments()` to create library + main file
  - **Before**:
    ```typescript
    test.skip('should NOT error on valid imported action call', async () => {
      // NOTE: Requires multi-file test infrastructure
      const { diagnostics } = await ctx.parseAndValidate(`...`);
      // ...
    });
    ```
  - **After**:
    ```typescript
    test('should NOT error on valid imported action call', async () => {
      const ctx = createTestContextWithMockFS();

      const docs = await setupDocuments(ctx, [
        { uri: 'file:///test/animations.eligian', content: 'library animations action fadeIn(selector: string, duration: number) [ selectElement(selector) animate({opacity: 1}, duration) ]' },
        { uri: 'file:///test/main.eligian', content: 'styles "./test.css" import { fadeIn } from "./animations.eligian" action test() [ fadeIn("#app", 1000) ] timeline "Demo" in "#app" using raf { at 0s..1s test() }' },
      ]);

      setupCSSRegistry(ctx, 'file:///test/test.css', { classes: ['active'], ids: ['app'] });

      const mainDoc = docs.get('file:///test/main.eligian')!;
      const errors = mainDoc.diagnostics?.filter(d => d.severity === 1) ?? [];
      expect(errors).toHaveLength(0);
    });
    ```
  - **Location**: operation-validation.spec.ts, "Imported action validation" suite
  - **Depends on**: T008 (setupDocuments implemented)

- [ ] T018 [US2] Update Feature 024 skipped test T004 to use new helper in `packages/language/src/__tests__/operation-validation.spec.ts`
  - **Similar changes as T017** (remove `.skip()`, use `setupDocuments()`)
  - **Test**: "should validate multiple imported actions"

- [ ] T019 [US2] Update Feature 024 skipped test T005 to use new helper in `packages/language/src/__tests__/operation-validation.spec.ts`
  - **Similar changes as T017** (remove `.skip()`, use `setupDocuments()`)
  - **Test**: "should validate mix of imported actions and builtin operations"

- [ ] T020 [US2] Run operation-validation.spec.ts to verify Feature 024 tests pass
  - **Command**: `pnpm test operation-validation.spec.ts`
  - **Expected**: All Feature 024 tests (T003-T005) now PASS - imported actions validate correctly
  - **Depends on**: T017-T019 (tests updated)

**Checkpoint**: At this point, Feature 024 skipped tests are unblocked - import validation works end-to-end

---

## Phase 5: User Story 3 - Test Code Completion for Imports (Priority: P3)

**Goal**: Test authors can use `validateImportChain()` helper to validate entire import graphs (main → lib1 → lib2)

**Independent Test**: Create import chain (3 files), validate entire chain, verify all documents visited and zero errors

**Why P3**: This enhances debugging experience but is not critical for core functionality. Import chain validation helps catch circular imports and deep import errors.

### Tests for User Story 3 (Test-First Development)

- [ ] T021 [P] [US3] Write failing test: "should validate entire import chain" in `packages/language/src/__tests__/multi-file-helpers/validate-import-chain.spec.ts`
  - **Test code**:
    ```typescript
    test('should validate entire import chain', async () => {
      const ctx = createTestContextWithMockFS();

      await setupDocuments(ctx, [
        { uri: 'file:///test/base.eligian', content: 'library base action x() [ selectElement("#app") ]' },
        { uri: 'file:///test/enhanced.eligian', content: 'library enhanced import { x } from "./base.eligian" action y() [ x() ]' },
        { uri: 'file:///test/main.eligian', content: 'import { y } from "./enhanced.eligian" action z() [ y() ]' },
      ]);

      const result = await validateImportChain(ctx, 'file:///test/main.eligian');

      expect(result.hasErrors).toBe(false);
      expect(result.documents).toHaveLength(3);
      expect(result.allErrors.size).toBe(0);
    });
    ```
  - **Expected**: Test FAILS - `validateImportChain` is not defined
  - **Location**: New file `multi-file-helpers/validate-import-chain.spec.ts`

- [ ] T022 [P] [US3] Write failing test: "should detect errors in import chain" in `packages/language/src/__tests__/multi-file-helpers/validate-import-chain.spec.ts`
  - **Test code**:
    ```typescript
    test('should detect errors in import chain', async () => {
      const ctx = createTestContextWithMockFS();

      await setupDocuments(ctx, [
        { uri: 'file:///test/base.eligian', content: 'library base action x() [ selectElement("#app") ]' },
        { uri: 'file:///test/enhanced.eligian', content: 'library enhanced import { x } from "./base.eligian" action y() [ X() ]' },  // Typo: capital X
        { uri: 'file:///test/main.eligian', content: 'import { y } from "./enhanced.eligian" action z() [ y() ]' },
      ]);

      const result = await validateImportChain(ctx, 'file:///test/main.eligian');

      expect(result.hasErrors).toBe(true);
      expect(result.allErrors.has('file:///test/enhanced.eligian')).toBe(true);

      const errors = result.allErrors.get('file:///test/enhanced.eligian') ?? [];
      expect(errors.some(e => e.message.includes('X'))).toBe(true);
    });
    ```
  - **Expected**: Test FAILS - `validateImportChain` is not defined

- [ ] T023 [US3] Run tests to verify they FAIL (proves helper doesn't exist)
  - **Command**: `pnpm test validate-import-chain.spec.ts`
  - **Expected**: Tests T021-T022 FAIL - "validateImportChain is not defined"

### Implementation for User Story 3

- [ ] T024 [US3] Implement `validateImportChain()` helper in `packages/language/src/__tests__/test-helpers.ts` (after createLibraryDocuments)
  - **Code structure**:
    ```typescript
    export async function validateImportChain(
      ctx: TestContext,
      rootUri: string
    ): Promise<{
      documents: LangiumDocument[];
      allErrors: Map<string, Diagnostic[]>;
      hasErrors: boolean;
    }> {
      const visited = new Set<string>();
      const documents: LangiumDocument[] = [];
      const allErrors = new Map<string, Diagnostic[]>();

      function visitDocument(uri: string): void {
        if (visited.has(uri)) return;
        visited.add(uri);

        const doc = ctx.services.shared.workspace.LangiumDocuments.getDocument(URI.parse(uri));
        if (!doc) return;

        documents.push(doc);

        const errors = doc.diagnostics?.filter(d => d.severity === DiagnosticSeverity.Error) ?? [];
        if (errors.length > 0) {
          allErrors.set(uri, errors);
        }

        // Visit imported documents (recursively)
        const program = doc.parseResult.value as Program;
        for (const stmt of program.statements) {
          if (isLibraryImport(stmt)) {
            let libraryPath = stmt.path.replace(/^\.\//, '');
            if (!libraryPath.endsWith('.eligian')) {
              libraryPath += '.eligian';
            }
            const docUri = URI.parse(uri);
            const importUri = Utils.resolvePath(docUri, libraryPath);
            visitDocument(importUri.toString());
          }
        }
      }

      visitDocument(rootUri);

      return {
        documents,
        allErrors,
        hasErrors: allErrors.size > 0,
      };
    }
    ```
  - **Location**: After `createLibraryDocuments()` helper
  - **Code size**: ~40 lines (includes JSDoc)
  - **Imports needed**: `isLibraryImport`, `Program`, `Utils` (from Langium)

- [ ] T025 [US3] Add JSDoc documentation to `validateImportChain()` helper
  - **Documentation**:
    ```typescript
    /**
     * Validate entire import chain starting from root document
     *
     * Recursively traverses all import statements, collecting all reachable
     * documents and their validation errors. Handles circular imports by
     * tracking visited documents.
     *
     * @param ctx Test context
     * @param rootUri Absolute URI of root document to start traversal
     * @returns Result with documents, errors grouped by URI, and hasErrors flag
     *
     * @example
     * const result = await validateImportChain(ctx, 'file:///test/main.eligian');
     * expect(result.hasErrors).toBe(false);
     * expect(result.documents).toHaveLength(3);
     */
    ```

- [ ] T026 [US3] Run tests to verify they PASS (proves helper works)
  - **Command**: `pnpm test validate-import-chain.spec.ts`
  - **Expected**: Tests T021-T022 PASS - import chains validated correctly
  - **Depends on**: T024-T025 (implementation + documentation)

- [ ] T027 [US3] Run full test suite to verify all helpers work together
  - **Command**: `pnpm test`
  - **Expected**: All tests pass (1,566 existing + 9 new = 1,575 tests)
  - **Integration check**: All 3 helpers (setupDocuments, createLibraryDocuments, validateImportChain) work correctly

**Checkpoint**: All 3 user stories complete - full multi-file test infrastructure functional

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Code quality, documentation, and performance verification

- [ ] T028 [P] Run Biome check (format + lint) with auto-fix
  - **Command**: `pnpm run check`
  - **Expected**: 0 errors, 0 warnings
  - **Files affected**: `test-helpers.ts` (3 new helpers)
  - **Auto-fix**: If issues found, run `pnpm run check --apply`

- [ ] T029 [P] Run TypeScript type checking
  - **Command**: `pnpm -w run typecheck`
  - **Expected**: 0 errors
  - **Check**: Type safety for Map return types, async functions, Langium service calls

- [ ] T030 [P] Performance test: Verify 10 libraries complete in <500ms
  - **Test code** (add to `setup-documents.spec.ts`):
    ```typescript
    test('supports 10 library files within 500ms', async () => {
      const ctx = createTestContextWithMockFS();
      const startTime = performance.now();

      const libraries = Array.from({ length: 10 }, (_, i) => ({
        uri: `file:///test/lib${i}.eligian`,
        content: `library lib${i} action action${i}() [ selectElement("#app") ]`,
      }));

      await createLibraryDocuments(ctx, libraries);

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(500);  // SC-004 from spec.md
    });
    ```
  - **Expected**: Test passes, duration ~100-200ms (well under target)
  - **Spec criteria**: SC-004 requires <500ms for 10 libraries

- [ ] T031 Update test-helpers.ts exports to include new helpers
  - **Verify exports**:
    ```typescript
    export { setupDocuments } from './test-helpers.js';
    export { createLibraryDocuments } from './test-helpers.js';
    export { validateImportChain } from './test-helpers.js';
    ```
  - **Note**: May already be exported if using named exports

- [ ] T032 [P] Update quickstart.md with actual implementation notes (optional)
  - **File**: `specs/025-during-the-previous/quickstart.md`
  - **Add**: Any lessons learned during implementation
  - **Add**: Performance measurements from T030
  - **Optional**: Only if significant deviations from plan

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: ✅ Complete - no tasks needed
- **Foundational (Phase 2)**: No dependencies - reading tasks can start immediately
  - T001-T003 can all run in parallel [P]
  - BLOCKS all user stories until complete
- **User Stories (Phase 3-5)**: All depend on Foundational (Phase 2)
  - US1 (Phase 3): Can start after Foundational - No dependencies on other stories
  - US2 (Phase 4): Depends on US1 (`setupDocuments` must exist)
  - US3 (Phase 5): Can start after Foundational - No dependencies on US2
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Independent - only depends on Foundational
- **User Story 2 (P2)**: Depends on US1 (uses `setupDocuments()` internally)
- **User Story 3 (P3)**: Independent - only depends on Foundational (doesn't use US1/US2 helpers)

### Within Each User Story

- Tests MUST be written and FAIL before implementation (TDD approach)
- Helper implementation before tests can pass
- Feature 024 test updates (US2) depend on `setupDocuments()` being implemented (US1)

### Parallel Opportunities

- **Foundational** (Phase 2): All 3 reading tasks [P] can run in parallel
- **User Story 1 Tests** (Phase 3): T004, T005, T006 [P] can all be written in parallel
- **User Story 2 Tests** (Phase 4): T012, T013 [P] can be written in parallel
- **User Story 3 Tests** (Phase 5): T021, T022 [P] can be written in parallel
- **Polish** (Phase 6): T028, T029, T030, T032 [P] can all run in parallel
- **User Stories**: US1 and US3 can be worked on in parallel (US3 doesn't depend on US1)

---

## Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together (write in parallel):
Task: "Write failing test: should create single document in workspace"
Task: "Write failing test: should create multiple documents and build together"
Task: "Write failing test: should write to mock FS if available"

# After tests fail (T007 verifies), implement helper (sequential):
Task: "Implement setupDocuments() helper"
Task: "Add JSDoc documentation"

# Verify tests pass:
Task: "Run tests to verify they PASS"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 2: Foundational (reading tasks) - ~15 minutes
2. Complete Phase 3: User Story 1 (setupDocuments helper) - ~1 hour
3. **STOP and VALIDATE**: Run tests, verify helper works independently
4. Deploy if ready (enables basic multi-file testing)

**Estimated Time**: ~1.5 hours for MVP

### Incremental Delivery

1. Complete Foundational → Understanding established (~15 min)
2. Add User Story 1 → `setupDocuments()` works → Enable basic multi-file tests (~1 hour)
3. Add User Story 2 → Feature 024 tests unblocked → Import validation complete (~1.5 hours)
4. Add User Story 3 → Import chain validation → Debugging enhanced (~1 hour)
5. Polish → Code quality verified (~30 min)

**Total Estimated Time**: ~4.5 hours

### Parallel Team Strategy

With 2 developers:

1. Both complete Foundational together (~15 min)
2. Once Foundational is done:
   - Developer A: User Story 1 (setupDocuments)
   - Developer B: User Story 3 (validateImportChain) - independent of US1
3. Developer A then completes User Story 2 (depends on US1)
4. Both run Polish tasks in parallel

**Time Savings**: ~30% faster with parallel work

---

## Notes

- [P] tasks = different files or reading tasks, no dependencies
- [Story] label maps task to specific user story for traceability (US1, US2, US3)
- Each user story should be independently completable and testable
- Constitution Principle II: Test-First Development strictly enforced (RED-GREEN-REFACTOR)
- Verify tests fail before implementing (proves they're testing the right thing)
- Feature 024 integration (US2) validates the infrastructure end-to-end
- Performance test (T030) validates spec.md SC-004 success criteria
- Avoid: skipping test failures, implementing before tests, breaking existing tests
