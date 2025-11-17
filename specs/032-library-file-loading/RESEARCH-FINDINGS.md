# Research Findings: Langium Multi-Document Linking Architecture

**Date**: 2025-11-16
**Issue**: Library documents not being found by scope provider during CLI compilation
**Root Cause Analysis**: Incorrect understanding of Langium's workspace and linking architecture

---

## Problem Statement

When compiling `test-import.eligian` which imports `fadeIn` from `animations.eligian`, the CLI compiler fails with:

```
"Could not resolve reference to ActionDefinition named 'fadeIn'"
```

**Debug output showed**:
```
DEBUG: Workspace has 1 documents:
  - file:///projects/eligius/eligian/examples/libraries/animations.eligian (state=6)
```

The library document is loaded and in state 6 (Validated), but the main document cannot find it.

---

## Key Research Findings

### 1. Langium Document Build Pipeline

From `F:\projects\langium\packages\langium\src\workspace\document-builder.ts:387-416`:

The `DocumentBuilder.build()` method processes documents through **6 sequential states**:

1. **Parsed** (State 1) - AST created from text
2. **IndexedContent** (State 2) - Export symbols indexed globally
3. **ComputedScopes** (State 3) - Local symbols collected
4. **Linked** (State 4) - Cross-references resolved
5. **IndexedReferences** (State 5) - Reference index updated
6. **Validated** (State 6) - Validation checks run

**CRITICAL**: Linking (State 4) happens AFTER both documents are indexed (State 2). This means:
- Library documents must be in IndexedContent state BEFORE main document attempts linking
- All documents must be built together in a single `DocumentBuilder.build()` call

### 2. Workspace Initialization Pattern

From `F:\projects\langium\examples\domainmodel\src\cli\cli-util.ts:45-57`:

```typescript
export async function setRootFolder(fileName: string, services: LangiumCoreServices, root?: string): Promise<void> {
    if (!root) {
        root = path.dirname(fileName);
    }
    const folders: WorkspaceFolder[] = [{
        name: path.basename(root),
        uri: URI.file(root).toString()
    }];
    await services.shared.workspace.WorkspaceManager.initializeWorkspace(folders);
}
```

**Key insight**: CLI applications must call `WorkspaceManager.initializeWorkspace()` with workspace folders BEFORE loading documents. This enables:
- Automatic discovery of related files in the workspace
- Proper indexing of all files before any linking occurs

### 3. Document Loading Best Practice

From `F:\projects\langium\examples\domainmodel\src\cli\cli-util.ts:13-39`:

```typescript
export async function extractDocument<T extends AstNode>(...): Promise<LangiumDocument<T>> {
    const document = await services.shared.workspace.LangiumDocuments.getOrCreateDocument(URI.file(path.resolve(fileName)));
    await services.shared.workspace.DocumentBuilder.build([document], { validation: true });

    // Validation error checking...

    return document as LangiumDocument<T>;
}
```

**Pattern**: Use `getOrCreateDocument()` instead of `fromString()` in CLI contexts. This:
- Reads file from disk via FileSystemProvider
- Automatically manages document lifecycle
- Integrates with workspace folder discovery

### 4. Multi-Document Test Pattern

From `F:\projects\langium\examples\domainmodel\test\refs-index.test.ts:44-49`:

```typescript
async function updateDocuments(extendsFile: string, superFile: string): Promise<...> {
    const superDoc: LangiumDocument = await parseDocument(domainmodel, superFile);
    const extendsDoc: LangiumDocument = await parseDocument(domainmodel, extendsFile);

    await shared.workspace.DocumentBuilder.build([extendsDoc, superDoc]);
    return { 'super': superDoc, 'extends': extendsDoc };
}
```

**Key insight**: Pass ALL documents to `DocumentBuilder.build()` in a single call. This ensures:
- All documents reach IndexedContent state before any reach Linked state
- Scope provider can find symbols from all documents
- No race conditions between document states

### 5. Compiler Theory: Symbol Resolution Order

From web research (Carnegie Mellon CS:APP Chapter 7):

Traditional linkers use a **left-to-right, single-pass** algorithm:
1. Maintain set E (objects to merge) and set U (undefined symbols)
2. Scan inputs left-to-right
3. For each input, if it defines symbols in U, add to E
4. **Critical**: Once past a library, linker never revisits it

**Langium's approach is better**: The IndexedContent phase builds a global symbol index BEFORE linking starts, avoiding this single-pass limitation.

---

## What We Did Wrong

### ❌ Incorrect Approach (Current Implementation)

```typescript
// In parseSource() - lines 178-221
if (uri) {
  // Load library documents
  for (const importPath of importPaths) {
    await Effect.runPromise(parseLibraryDocument(content, libraryUri));
  }

  // Then build main document separately
  await services.shared.workspace.DocumentBuilder.build([mainDocument], {
    validation: false,
  });
}
```

**Problems**:
1. Library documents built separately from main document
2. Main document builds before libraries are indexed
3. Scope provider has no way to find library symbols during main document's linking phase
4. Workspace not initialized, so no automatic file discovery

### ✅ Correct Approach (Based on Research)

From Langium examples and architecture:

```typescript
// In CLI main or in parseSource for CLI context:

// Step 1: Initialize workspace with root folder
await services.shared.workspace.WorkspaceManager.initializeWorkspace([{
  name: 'workspace',
  uri: URI.file(path.dirname(absolutePath)).toString()
}]);

// Step 2: Use getOrCreateDocument for main file (auto-discovers libraries)
const mainDoc = await services.shared.workspace.LangiumDocuments.getOrCreateDocument(
  URI.file(absolutePath)
);

// Step 3: Extract library paths and load them
const imports = extractLibraryImports(mainDoc.parseResult.value);
const libraryDocs = [];
for (const importPath of imports) {
  const libraryUri = resolveLibraryPath(URI.file(absolutePath), importPath);
  const libDoc = await services.shared.workspace.LangiumDocuments.getOrCreateDocument(libraryUri);
  libraryDocs.push(libDoc);
}

// Step 4: Build ALL documents together in ONE call
await services.shared.workspace.DocumentBuilder.build(
  [mainDoc, ...libraryDocs],
  { validation: true }
);
```

---

## Implementation Strategy

### Option A: Workspace-Based (Recommended for CLI)

**Location**: Modify `packages/cli/src/main.ts`

1. Before compilation, call `WorkspaceManager.initializeWorkspace()` with input file's directory
2. Use `getOrCreateDocument()` instead of `parseSource()`
3. Let workspace auto-discover library files
4. Build all documents together

**Pros**:
- Follows Langium best practices (see domainmodel example)
- Automatic discovery of related files
- Cleaner separation: CLI owns workspace setup, compiler stays pure
- Easier to extend (e.g., watch mode, multi-file projects)

**Cons**:
- Requires changes in CLI package, not just language package
- More invasive change

### Option B: Manual Document Collection (Simpler)

**Location**: Modify `packages/language/src/compiler/pipeline.ts`

1. In `parseSource()`, when URI is provided:
   - Extract library imports from temp parse
   - Load all library documents via `getOrCreateDocument()`
   - Build main + all libraries together in one call
2. Keep workspace initialization minimal

**Pros**:
- Smaller change scope
- Keeps logic in language package
- Works for both CLI and tests

**Cons**:
- Doesn't leverage workspace auto-discovery
- Have to manually track related files
- Less idiomatic for Langium

---

## Recommended Solution: Hybrid Approach

1. **CLI Layer** (`packages/cli/src/main.ts`):
   - Initialize workspace with root folder
   - Use `getOrCreateDocument()` for main file

2. **Language Layer** (`packages/language/src/compiler/pipeline.ts`):
   - Keep current library loading logic for tests (no workspace)
   - For CLI context (when workspace is initialized), rely on workspace discovery

3. **Detection**: Check if workspace folders are initialized to decide which path to take

---

## Next Steps

1. Remove debug logging from `pipeline.ts`
2. Implement workspace initialization in CLI main.ts
3. Update `parseSource()` to detect workspace context
4. Test with `test-import.eligian`
5. Verify all tests still pass

---

## References

- **Langium Multi-Document Example**: `F:\projects\langium\examples\domainmodel\test\refs-index.test.ts`
- **Langium CLI Pattern**: `F:\projects\langium\examples\domainmodel\src\cli\cli-util.ts`
- **DocumentBuilder Source**: `F:\projects\langium\packages\langium\src\workspace\document-builder.ts`
- **WorkspaceManager Source**: `F:\projects\langium\packages\langium\src\workspace\workspace-manager.ts`
- **Compiler Linking Theory**: Carnegie Mellon CS:APP Chapter 7
