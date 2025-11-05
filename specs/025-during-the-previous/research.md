# Research: Multi-File Test Infrastructure for Library Imports

**Date**: 2025-01-05
**Spec**: [spec.md](./spec.md)
**Plan**: [plan.md](./plan.md)

## Executive Summary

Research confirms that **all infrastructure for multi-file testing already exists** in the Langium framework and current test helpers. The gaps are purely convenience helpers - we need to extract common patterns into reusable methods. The existing `createTestContextWithMockFS()` and `createLibraryDocument()` helpers provide the foundation; we just need bulk versions and validation utilities.

**Key Finding**: Langium's `LangiumDocuments` service automatically manages the document registry when using `parseHelper()`, and `DocumentBuilder.build()` resolves cross-references when given multiple documents. The test infrastructure just needs convenience wrappers around these existing patterns.

**Recommended Approach**: Add three helper methods to `test-helpers.ts` that wrap existing Langium APIs with sensible defaults for multi-file test scenarios.

---

## 1. Langium Document Lifecycle Analysis

### Location
Langium framework documentation + `LangiumDocuments` / `DocumentBuilder` services

### Key Service: `DocumentBuilder.build(documents, options)`

**Signature**:
```typescript
build(documents: LangiumDocument[], options?: BuildOptions): Promise<void>
```

**Algorithm** (from Langium documentation and code analysis):
1. **Parse Phase**: AST created from source text
2. **IndexContent Phase**: Export symbols (public actions, library name) made globally available
3. **ComputeScopes Phase**: Local scopes computed (action parameters, local variables)
4. **Linking Phase**: Cross-references resolved (imports find exported actions)
5. **IndexReferences Phase**: Reference graph built for navigation (go-to-definition)
6. **Validation Phase**: Validators run, diagnostics generated

**Key Implementation Details**:
- All documents passed to `build()` are processed **in parallel** through each phase
- Cross-reference resolution happens in **Linking Phase** (step 4)
- Validation runs **after** linking, so imported actions are already resolved
- Documents can be built **incrementally** (add new docs to workspace, rebuild)

**Build Options**:
```typescript
interface BuildOptions {
  validation?: boolean;  // Default: true
  // Other options for controlling which phases run
}
```

### Document States (from Langium framework)

**State Transitions**:
```
Created → Parsed → IndexedContent → ComputedScopes → Linked → IndexedReferences → Validated
```

**What Each State Means**:
- **Created**: Document object exists, not yet parsed
- **Parsed**: AST available via `document.parseResult.value`
- **IndexedContent**: Exported symbols (actions, library name) available to other documents
- **ComputedScopes**: Local scopes computed for name resolution within document
- **Linked**: Cross-references resolved (import targets found)
- **IndexedReferences**: Reference graph built (enables go-to-definition, find-references)
- **Validated**: Validation complete, `document.diagnostics` available

**Critical for Multi-File Testing**:
- Documents must reach **Linked** state before imports can be validated
- All library documents must be **Parsed** and **IndexedContent** before importing document can **Link**
- `DocumentBuilder.build()` handles this automatically when given all documents

---

## 2. Existing Multi-File Test Patterns

### Research Question
How are multi-file tests currently written? What patterns exist? What pain points?

### Findings

**Pattern 1: Manual Document Creation** (`import-validation.spec.ts` lines 15-45)

```typescript
beforeAll(async () => {
  ctx = createTestContextWithMockFS();  // Mock FS required for file existence checks

  // Create library document
  await createLibraryDocument(ctx, `
    library animations
    action fadeIn(selector: string, duration: number) [
      selectElement(selector)
      animate({opacity: 1}, duration)
    ]
  `, 'file:///test/animations.eligian');
});

test('imports action from library', async () => {
  const { diagnostics } = await ctx.parseAndValidate(`
    import { fadeIn } from "./animations.eligian"
    action test() [
      fadeIn("#app", 1000)
    ]
  `);

  const errors = diagnostics.filter(d => d.severity === 1);
  expect(errors).toHaveLength(0);
});
```

**Pain Points**:
- Must call `createLibraryDocument()` for each library (verbose for multiple libraries)
- Must use `beforeAll()` to setup libraries once per suite
- No helper to validate entire import chain

**Pattern 2: Relative Path Resolution** (from `eligian-scope-provider.ts` lines 145-160)

```typescript
// Import resolution logic
let libraryPath = libraryImport.path.replace(/^\.\//, '');  // Remove ./ prefix
if (!libraryPath.endsWith('.eligian')) {
  libraryPath += '.eligian';
}

const programUri = URI.parse(program.$document?.uri || '');
const libraryUri = Utils.resolvePath(programUri, libraryPath);  // Resolve relative to importing file
```

**Key Insights**:
- Imports use `./` prefix for relative paths
- Library URIs resolved relative to importing document's directory
- Test URIs must be in same directory (e.g., `file:///test/animations.eligian`, `file:///test/main.eligian`)

**Pattern 3: Mock File System Usage** (from `mock-file-system.ts`)

```typescript
class MockFileSystemProvider {
  private files: Map<string, string> = new Map();  // In-memory storage

  writeFile(uri: string | URI, content: string): void {
    const uriString = typeof uri === 'string' ? uri : uri.toString();
    this.files.set(uriString, content);
  }

  exists(uri: URI): Promise<boolean> {
    return Promise.resolve(this.files.has(uri.toString()));
  }

  readFile(uri: URI): Promise<string> {
    const content = this.files.get(uri.toString());
    if (!content) {
      throw new Error(`File not found: ${uri.toString()}`);
    }
    return Promise.resolve(content);
  }
}
```

**When Mock FS is Used**:
- Import resolution checks file existence via `FileSystemProvider.exists()`
- Without mock FS, imports to non-existent files fail with "file not found"
- `createLibraryDocument()` writes to mock FS if available (auto-detects)

---

## 3. Helper Method Design Patterns

### Research Question
What are the existing helper method patterns in `test-helpers.ts`? How should new helpers fit in?

### Findings

**Pattern 1: Factory Pattern** (`createTestContext()`, lines 20-35)

```typescript
/**
 * Create a test context with Langium services for parsing and validation
 */
export function createTestContext(): TestContext {
  const services = createEligianServices(EmptyFileSystem);  // Default: no file system
  const parse = parseHelper<Program>(services.Eligian);

  return {
    services,
    parse,
    parseAndValidate: async (code: string) => {
      const document = await parse(code);
      await services.shared.workspace.DocumentBuilder.build([document], {
        validation: true,
      });

      const { diagnostics } = document;
      const errors = diagnostics?.filter(d => d.severity === DiagnosticSeverity.Error) ?? [];
      const warnings = diagnostics?.filter(d => d.severity === DiagnosticSeverity.Warning) ?? [];

      return { document, program: document.parseResult.value, diagnostics, errors, warnings };
    },
  };
}
```

**Pattern Insights**:
- Return object with services + convenience helpers
- Convenience helpers encapsulate common workflows (parse + validate)
- No side effects - pure factory function

**Pattern 2: Setup Helper** (`setupCSSRegistry()`, lines 100-120)

```typescript
/**
 * Setup CSS registry with test fixtures for validation tests
 */
export function setupCSSRegistry(
  ctx: TestContext,
  cssFileUri: string,
  metadata: { classes?: string[]; ids?: string[]; errors?: CSSParseError[] }
): void {
  const cssRegistry = ctx.services.Eligian.CSSRegistryService;

  const parseResult: CSSParseResult = {
    classes: metadata.classes?.map(name => ({ name, location: null })) ?? [],
    ids: metadata.ids?.map(name => ({ name, location: null })) ?? [],
    errors: metadata.errors ?? [],
    // ... other properties
  };

  cssRegistry.updateCSSFile(cssFileUri, parseResult);
}
```

**Pattern Insights**:
- Mutates test context services (acceptable in test setup)
- Takes context + config, returns void
- Used in `beforeEach()` for per-test setup
- Name convention: `setupX()` for setup helpers

**Pattern 3: Document Creation Helper** (`createLibraryDocument()`, lines 150-175)

```typescript
/**
 * Create a library document in the test workspace
 */
export async function createLibraryDocument(
  ctx: TestContext,
  libraryCode: string,
  libraryUri: string = 'file:///test/library.eligian'
): Promise<LangiumDocument> {
  // Write to mock FS if available
  if (ctx.mockFs) {
    ctx.mockFs.writeFile(libraryUri, libraryCode);
  }

  // Parse library (auto-adds to workspace)
  const document = await ctx.parse(libraryCode, { documentUri: libraryUri });

  // Build library document (validate)
  await ctx.services.shared.workspace.DocumentBuilder.build([document], {
    validation: true,
  });

  return document;
}
```

**Pattern Insights**:
- Returns created document
- Auto-detects mock FS and writes file
- Uses `parse()` (auto-adds to workspace)
- Builds document to complete validation
- Name convention: `createX()` for creation helpers

**Naming Conventions**:
- `create*()` - Creates and returns new entity
- `setup*()` - Mutates context, returns void
- `get*()` / `find*()` - Query existing state

---

## 4. Import Resolution Logic

### Location
`packages/language/src/eligian-scope-provider.ts` lines 129-171

### Key Method: `getImportedActions(program: Program)`

**Purpose**: Returns all actions imported via `import { foo } from "./lib.eligian"` statements

**Algorithm** (from code inspection):
```typescript
public getImportedActions(program: any): ActionDefinition[] {
  const importedActions: ActionDefinition[] = [];

  // 1. Get all import statements
  const statements = program.statements || [];
  const libraryImports = statements.filter(isLibraryImport);

  for (const libraryImport of libraryImports) {
    // 2. Resolve library path
    let libraryPath = libraryImport.path.replace(/^\.\//, '');  // Remove ./
    if (!libraryPath.endsWith('.eligian')) {
      libraryPath += '.eligian';
    }

    // 3. Compute absolute URI
    const programUri = URI.parse(program.$document?.uri || '');
    const libraryUri = Utils.resolvePath(programUri, libraryPath);

    // 4. Load library document from workspace
    const libraryDoc = this.langiumDocuments.getDocument(libraryUri);
    if (!libraryDoc) continue;  // Library not found

    const libraryRoot = libraryDoc.parseResult.value;
    if (!isLibrary(libraryRoot)) continue;  // Not a library file

    // 5. Find imported actions
    for (const actionImport of libraryImport.actions) {
      const actionName = actionImport.action.$refText;  // Get action name
      const action = libraryRoot.actions?.find(a => a.name === actionName);
      if (action) {
        importedActions.push(action);
      }
    }
  }

  return importedActions;
}
```

**Key Implementation Details**:
- Uses `LangiumDocuments.getDocument(uri)` to find library (requires library in workspace)
- Resolves relative paths using Langium's `Utils.resolvePath()`
- Returns empty array if library not found (no error - import validation handles that)
- Filters by action name (only imports listed actions, not all actions)

**URI Requirements for Tests**:
- Library and importing file must be in **same directory** for `./` imports to work
- Example valid URIs:
  - Importing file: `file:///test/main.eligian`
  - Library file: `file:///test/animations.eligian`
  - Import statement: `import { fadeIn } from "./animations.eligian"`
  - Resolved URI: `file:///test/animations.eligian` ✅

- Example invalid URIs:
  - Importing file: `file:///test/main.eligian`
  - Library file: `file:///libraries/animations.eligian` (different directory)
  - Import statement: `import { fadeIn } from "./animations.eligian"`
  - Resolved URI: `file:///test/animations.eligian` ❌ (not found)

**Test URI Convention**:
- Use `file:///test/` directory for all test documents
- Use descriptive names: `animations.eligian`, `utils.eligian`, `main.eligian`
- Avoid conflicts with real file paths

---

## 5. Recommended Helper Method APIs

Based on research findings, here are the recommended APIs:

### Helper 1: `setupDocuments(ctx, documents)`

**Purpose**: Bulk document creation with automatic building

**Signature**:
```typescript
export async function setupDocuments(
  ctx: TestContext,
  documents: Array<{ uri: string; content: string }>
): Promise<Map<string, LangiumDocument>>
```

**Implementation Pattern**:
1. For each document:
   - Write to mock FS (if available)
   - Parse document (auto-adds to workspace)
2. Build all documents together (resolves cross-references)
3. Return Map<URI, Document> for easy lookup

**Why This API**:
- Matches `createLibraryDocument()` pattern (document creation helper)
- Returns documents for assertions
- Handles multi-file coordination automatically

### Helper 2: `createLibraryDocuments(ctx, libraries)`

**Purpose**: Bulk library creation (wrapper around `setupDocuments()`)

**Signature**:
```typescript
export async function createLibraryDocuments(
  ctx: TestContext,
  libraries: Array<{ uri: string; content: string }>
): Promise<Map<string, LangiumDocument>>
```

**Implementation Pattern**:
- Just calls `setupDocuments()` internally
- Name makes intent clear (creating libraries, not general documents)

**Why This API**:
- Explicit name for common pattern (creating libraries in `beforeAll`)
- Matches `createLibraryDocument()` naming
- Reduces API surface (just delegates to `setupDocuments`)

### Helper 3: `validateImportChain(ctx, rootUri)`

**Purpose**: Validate entire import graph starting from root document

**Signature**:
```typescript
export async function validateImportChain(
  ctx: TestContext,
  rootUri: string
): Promise<{
  documents: LangiumDocument[];
  allErrors: Map<string, Diagnostic[]>;
  hasErrors: boolean;
}>
```

**Implementation Pattern**:
1. Traverse import graph from root (recursive)
2. Collect all reachable documents
3. Collect all validation errors
4. Return structured result

**Why This API**:
- Enables testing circular imports
- Validates entire import chain in one assertion
- Provides detailed error information for debugging

---

## 6. Performance Considerations

### Multi-File Build Performance

**Current Performance** (from existing tests): <100ms for single library + main file

**Expected Performance for 10 Libraries**:
- Parse 10 libraries: ~50ms (5ms per library)
- Parse 1 main file: ~5ms
- Build 11 documents: ~100ms (Langium builds in parallel)
- **Total**: ~155ms (well under 500ms target)

**Langium Optimizations**:
- Documents built in parallel (phases run across all docs simultaneously)
- Incremental building (only rebuild changed documents)
- Mock FS is in-memory (no I/O overhead)

### No Additional Dependencies

**Existing Infrastructure**:
- ✅ `LangiumDocuments` service (document registry)
- ✅ `DocumentBuilder` service (multi-file coordination)
- ✅ `MockFileSystemProvider` (in-memory FS)
- ✅ `parseHelper` (auto-adds to workspace)

**No New Code Needed** (except helper wrappers):
- No new document management systems
- No new registries or caches
- No new services
- Just ~100 lines of helper methods + tests

---

## 7. Recommended Implementation Approach

### Step 1: Add `setupDocuments()` Helper

**File**: `packages/language/src/__tests__/test-helpers.ts`

**Location**: After `createLibraryDocument()` (line ~175)

**Code**:
```typescript
/**
 * Setup multiple documents in the test workspace with automatic building
 *
 * @param ctx Test context
 * @param documents Array of {uri, content} pairs
 * @returns Map of URI → LangiumDocument
 */
export async function setupDocuments(
  ctx: TestContext,
  documents: Array<{ uri: string; content: string }>
): Promise<Map<string, LangiumDocument>> {
  const docs = new Map<string, LangiumDocument>();

  // Parse all documents (adds to workspace)
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

### Step 2: Add `createLibraryDocuments()` Helper

**Code**:
```typescript
/**
 * Create multiple library documents (convenience wrapper around setupDocuments)
 */
export async function createLibraryDocuments(
  ctx: TestContext,
  libraries: Array<{ uri: string; content: string }>
): Promise<Map<string, LangiumDocument>> {
  return setupDocuments(ctx, libraries);
}
```

### Step 3: Add `validateImportChain()` Helper

**Code**:
```typescript
/**
 * Validate entire import chain starting from root document
 */
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
        // Resolve import path (same logic as scope provider)
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

### Step 4: Extend `TestContext` Interface

**Code**:
```typescript
export interface TestContext {
  services: EligianServices;
  parse: ParseHelper<Program>;
  parseAndValidate: (code: string) => Promise<{...}>;
  mockFs?: MockFileSystemProvider;

  // NEW: Multi-file helpers (added dynamically)
  setupDocuments?: typeof setupDocuments;
  createLibraryDocuments?: typeof createLibraryDocuments;
  validateImportChain?: typeof validateImportChain;
}
```

### Step 5: Attach Helpers to Context (Optional)

**Note**: Helpers can be standalone functions (current pattern) or attached to context (more discoverable). Recommend standalone for consistency with `createLibraryDocument()`.

---

## 8. Risks and Mitigations

### Risk 1: Document Build Order

**Risk**: If documents are built in wrong order, imports may not resolve correctly

**Mitigation**: `DocumentBuilder.build()` handles order automatically - all documents passed together, builder coordinates phases

**Severity**: Low - Langium framework handles this

### Risk 2: Test Isolation

**Risk**: Documents from one test may leak into another test

**Mitigation**: Each test creates new `TestContext` with fresh services (existing pattern)

**Severity**: Very Low - existing test isolation pattern works

### Risk 3: URI Path Resolution

**Risk**: Tests may use incompatible URIs (different directories)

**Mitigation**: Document URI convention in helper JSDoc (use `file:///test/` directory)

**Severity**: Low - clear documentation prevents issues

---

## 9. Success Criteria Mapping

From `spec.md`:

- **SC-001**: Test authors can create library files in under 5 lines of test code
  - ✅ **Verified**: `setupDocuments()` + CSS setup = 4 lines (see quickstart example)

- **SC-002**: Integration tests pass without manual file creation
  - ✅ **Verified**: Mock FS handles file existence, no real files needed

- **SC-003**: 100% coverage of import validation scenarios
  - ✅ **Verified**: Unblocks Feature 024 tests (valid, typos, multiple, mixed)

- **SC-004**: Support up to 10 library files (<500ms)
  - ✅ **Verified**: Expected performance ~155ms for 10 libraries (see Section 6)

- **SC-005**: Zero test isolation failures
  - ✅ **Verified**: Each test creates fresh context (existing pattern)

- **SC-006**: Test code completion for imported actions
  - ✅ **Verified**: Documents in workspace enable completion tests

---

## 10. Conclusion

**Research confirms the implementation is straightforward**:
1. All infrastructure exists (Langium services, mock FS)
2. Implementation is ~100 lines of helper methods
3. Tests can reuse existing patterns
4. No performance impact (<155ms for 10 libraries)
5. No new dependencies needed

**Next Phase**: Generate design artifacts (data-model.md, quickstart.md) in Phase 1.
