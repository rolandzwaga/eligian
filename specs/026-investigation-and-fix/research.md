# Research: Import Resolution Investigation

**Feature**: Import Resolution Failures in Multi-File Test Scenarios
**Phase**: Phase 0 - Root Cause Analysis
**Date**: 2025-11-05

## Investigation Scope

This document captures the root cause analysis for why `setupDocuments()` fails to resolve imported actions while `createLibraryDocument()` succeeds.

## Key Questions to Answer

1. What are the exact execution differences between `createLibraryDocument()` and `setupDocuments()`?
2. When does the scope provider's `getImportedActions()` method fail to find actions?
3. Is the issue related to workspace registration timing, document build order, or validation lifecycle?
4. What is the Langium document lifecycle in test environments?

## Investigation Approach

### Step 1: Compare Helper Implementations

**`createLibraryDocument()` (from test-helpers.ts:608-629)**:
```typescript
export async function createLibraryDocument(
  ctx: TestContext,
  libraryCode: string,
  libraryUri: string
): Promise<LangiumDocument> {
  // 1. Write to mock FS (if available)
  if (ctx.mockFs) {
    ctx.mockFs.writeFile(libraryUri, content);
  }

  // 2. Parse library code (parseHelper adds to workspace automatically)
  const libraryDoc = await ctx.parse(libraryCode, { documentUri: libraryUri });

  // 3. Build document (triggers validation)
  await ctx.services.shared.workspace.DocumentBuilder.build([libraryDoc], {
    validation: true,
  });

  // 4. Return document
  return libraryDoc;
}
```

**`setupDocuments()` (from test-helpers.ts:650-671)**:
```typescript
export async function setupDocuments(
  ctx: TestContext,
  documents: Array<{ uri: string; content: string }>
): Promise<Map<string, LangiumDocument>> {
  const docs = new Map<string, LangiumDocument>();

  // 1. Write all to mock FS and parse (if available)
  for (const { uri, content } of documents) {
    if (ctx.mockFs) {
      ctx.mockFs.writeFile(uri, content);
    }
    const doc = await ctx.parse(content, { documentUri: uri });
    docs.set(uri, doc);
  }

  // 2. Build all documents together
  await ctx.services.shared.workspace.DocumentBuilder.build(Array.from(docs.values()), {
    validation: true,
  });

  return docs;
}
```

**Key Observation**: Both helpers appear structurally similar. Both:
- Write to mock FS
- Use `ctx.parse()` which should add documents to workspace
- Call `DocumentBuilder.build()` with validation

### Step 2: Analyze parseHelper Behavior

The `parseHelper()` function from Langium's `langium/test` package:
- Automatically adds parsed documents to the workspace
- Returns a `LangiumDocument` object
- Document should be available for cross-reference resolution

**Hypothesis 1**: Both helpers should work identically because they both use `parseHelper()`.

### Step 3: Review Scope Provider's getImportedActions()

**From eligian-scope-provider.ts:130-172**:
```typescript
public getImportedActions(program: any): ActionDefinition[] {
  const importedActions: ActionDefinition[] = [];
  const statements = program.statements || [];
  const libraryImports = statements.filter(isLibraryImport);

  for (const libraryImport of libraryImports) {
    // Resolve library file
    const currentUri = AstUtils.getDocument(program).uri;
    const originalPath = libraryImport.path;
    let importPath = originalPath;
    if (importPath.startsWith('./')) {
      importPath = importPath.substring(2);
    }
    const documentUriStr = currentUri.toString();
    const documentDir = documentUriStr.substring(0, documentUriStr.lastIndexOf('/'));
    const resolvedUri = URI.parse(`${documentDir}/${importPath}`);

    // Load library document from workspace
    const documents = this.eligianServices.shared.workspace.LangiumDocuments;
    const libraryDoc = documents.getDocument(resolvedUri);

    if (!libraryDoc || !libraryDoc.parseResult.value) continue;

    const library = libraryDoc.parseResult.value;
    if (!isLibrary(library)) continue;

    // Add each imported action to the list
    for (const actionImport of libraryImport.actions) {
      const actionName = actionImport.action.$refText || '';
      const action = library.actions?.find(a => a.name === actionName);
      if (action) {
        importedActions.push(action);
      }
    }
  }

  return importedActions;
}
```

**Critical Line**: `const libraryDoc = documents.getDocument(resolvedUri);`

This line retrieves the library document from the workspace. If this returns `undefined`, import resolution fails.

### Step 4: Test Context Differences

**Working tests (import-validation.spec.ts)**:
- Use `createTestContextWithMockFS()` in `beforeAll()`
- Call `createLibraryDocument()` in `beforeAll()` to set up libraries
- Library documents are created ONCE and persist across all tests

**Failing tests (operation-validation.spec.ts skipped tests)**:
- Create NEW `TestContext` with `createTestContextWithMockFS()` INSIDE each test
- Call `setupDocuments()` INSIDE each test
- Fresh context for each test (documents don't persist)

**Hypothesis 2**: The issue might be related to test context lifecycle, not the helpers themselves.

### Step 5: Workspace Registration Timing

Langium's `parseHelper()` behavior:
1. Parses source code to AST
2. Creates `LangiumDocument` object
3. **Automatically adds document to workspace via `LangiumDocuments.addDocument()`**
4. Returns document

**Both helpers use `ctx.parse()` which wraps `parseHelper()`**, so documents SHOULD be in workspace before building.

### Step 6: Build Order Hypothesis

**Hypothesis 3**: When `DocumentBuilder.build()` is called with multiple documents:
- Documents might be built in parallel
- Validation might run before all documents are fully linked
- Library document might not be "ready" when main document tries to resolve imports

**Counter-evidence**: `createLibraryDocument()` builds documents separately (one at a time), while `setupDocuments()` builds all together. If build order was the issue, building separately should fail.

### Step 7: Deep Investigation Required

To definitively identify the root cause, we need to:

1. **Add debug logging** to trace document registration and workspace state
2. **Verify workspace contains documents** at validation time
3. **Check if `getDocument()` returns documents** during import resolution
4. **Examine Langium's internal document lifecycle** to understand when documents are "ready" for cross-reference resolution

## Findings

**ACTUAL ROOT CAUSE** (confirmed via code analysis):

The issue is **NOT** with test infrastructure (`setupDocuments()` or `createLibraryDocument()`). **Both helpers work correctly** for document registration and workspace management.

**The real problem is a validator bug**: `checkTimelineOperationCall()` in `eligian-validator.ts` does NOT check imported actions when validating direct timeline calls.

### Evidence

**File**: `packages/language/src/eligian-validator.ts`
**Method**: `checkTimelineOperationCall()` (lines 921-969)

**Missing Logic**: The validator only checks local actions:
```typescript
const action = findActionByName(callName, program);  // LOCAL actions only!
if (!action) {
  // Error: Unknown action
}
```

**Comparison**: `checkOperationExists()` (lines 465-515) **correctly** checks imported actions:
```typescript
// Check if operation is an IMPORTED action (Feature 024)
if (program && this.services) {
  const scopeProvider = this.services.references.ScopeProvider as EligianScopeProvider;
  const importedActions = scopeProvider.getImportedActions(program);
  const importedAction = findActionByName(opName, importedActions);
  if (importedAction) {
    return;  // Valid imported action - success
  }
}
```

### Why This Appears as Helper Difference

1. **import-validation.spec.ts** (uses `createLibraryDocument()`): Tests pass because they **never test direct timeline calls** with imported actions
2. **operation-validation.spec.ts** (uses `setupDocuments()`): Tests are **skipped** because they DO test direct timeline calls like `at 0s..5s fadeIn("#box", 1000)`

The helpers work identically - the difference is what the tests are validating.

### Call Path Analysis

**Scenario**: Timeline with imported action call
```eligian
import { fadeIn } from "./animations.eligian"
timeline "T" in "#app" using raf {
  at 0s..5s fadeIn("#box", 1000)  // Direct timeline call
}
```

**Validation Flow**:
1. AST node: `OperationCall` (unified syntax from Feature 006)
2. Validator: `checkTimelineOperationCall()` runs **first**
3. Logic: Searches LOCAL actions only → doesn't find `fadeIn` (it's imported)
4. Result: Emits "Unknown action: fadeIn" error
5. Problem: Never checks `scopeProvider.getImportedActions(program)`

### Integration Gap

- **Feature 024** (library imports): Implemented imported action resolution in `checkOperationExists()`
- **Feature 006** (unified syntax): Introduced direct timeline calls
- **Gap**: The two features weren't fully integrated - imported action checking missing from timeline validation path

## Decisions

**Decision 1**: Fix the validator bug, not the test infrastructure
- Add imported action checking to `checkTimelineOperationCall()`
- Follow the same pattern as `checkOperationExists()` (Feature 024)
- Minimal change: ~10 lines of code in one method

**Decision 2**: Update spec understanding
- Original spec assumed test infrastructure issue (based on symptom observation)
- Actual root cause is validator logic gap between Features 006 and 024
- Fix affects **production code** (validator), not test helpers - updates spec constraint FR-007

**Decision 3**: Validate fix thoroughly
- Un-skip 3 tests in `operation-validation.spec.ts`
- All 3 should pass immediately after validator fix
- Run full regression suite (1483+ tests) to ensure no side effects
- Test with both `setupDocuments()` AND `createLibraryDocument()` patterns

## Alternatives Considered

**Alternative 1**: Replace `setupDocuments()` with `createLibraryDocument()` in failing tests
- **Rejected**: Doesn't solve root cause, just works around it
- Tests should be able to use either helper

**Alternative 2**: Change production code to fix import resolution
- **Rejected**: Production code works correctly (16 passing import tests prove this)
- Issue is test infrastructure, not production validator

**Alternative 3**: Skip multi-file integration tests entirely
- **Rejected**: Multi-file tests are valuable for validating library import feature
- Need robust test infrastructure for future development

## Open Questions

1. Does Langium's `DocumentBuilder` have ordering requirements for dependent documents?
2. Does `parseHelper()` guarantee documents are in workspace before returning?
3. Is there a timing window where documents are parsed but not yet "ready" for cross-reference resolution?
4. Do we need to call a "linking" phase explicitly before validation?

These questions will be answered during hands-on investigation in the implementation phase.

## Status

**FIX COMPLETE** ✅

### Implementation Summary

**Root Cause**: The validator method `checkTimelineOperationCall()` in [eligian-validator.ts](../../packages/language/src/eligian-validator.ts:921-969) was missing logic to check imported actions when validating direct timeline action calls (Feature 006 unified syntax).

**Fix Applied**: Added imported action checking following the same pattern as `checkOperationExists()` method (Feature 024):

```typescript
// Check if it's an IMPORTED action (Feature 024 pattern)
if (this.services) {
  const scopeProvider = this.services.references.ScopeProvider as EligianScopeProvider;
  const importedActions = scopeProvider.getImportedActions(program);
  const importedAction = findActionByName(callName, importedActions);
  if (importedAction) {
    // Valid imported action call - success
    return;
  }
}
```

**Test Results**:
- ✅ All 3 previously-skipped tests now pass ([operation-validation.spec.ts:194-367](../../packages/language/src/__tests__/operation-validation.spec.ts#L194-L367))
- ✅ Full test suite passes: 1577 tests passing, 12 skipped
- ✅ Zero regressions

**Files Modified**:
1. [eligian-validator.ts](../../packages/language/src/eligian-validator.ts) - Added imported action checks (lines 940-956)
2. [operation-validation.spec.ts](../../packages/language/src/__tests__/operation-validation.spec.ts) - Un-skipped 3 tests, added CSS registry setup

### Open Questions - ANSWERED

1. **Does Langium's `DocumentBuilder` have ordering requirements?**
   - Answer: No - Both helpers work identically. Order doesn't matter for cross-reference resolution.

2. **Does `parseHelper()` guarantee workspace registration?**
   - Answer: Yes - Documents are added to workspace immediately after parsing.

3. **Is there a timing window issue?**
   - Answer: No timing issue - The validator simply wasn't checking imported actions for timeline calls.

4. **Do we need explicit linking phase?**
   - Answer: No - `DocumentBuilder.build()` with `validation: true` handles all phases correctly.

**Conclusion**: Test infrastructure (`setupDocuments()` and `createLibraryDocument()`) works correctly. The issue was incomplete Feature 006 + Feature 024 integration in the validator.
