# Eligian Test Environment Guide

**Purpose**: Comprehensive guide to the Eligian test environment architecture, helper functions, and best practices for writing integration tests.

**Audience**: Developers writing or maintaining tests for the Eligian DSL language package.

**Last Updated**: 2025-11-05 (Feature 026)

---

## Table of Contents

1. [Overview](#overview)
2. [Langium Document Lifecycle](#langium-document-lifecycle)
3. [Test Helper Functions](#test-helper-functions)
4. [Multi-File Test Patterns](#multi-file-test-patterns)
5. [Common Pitfalls](#common-pitfalls)
6. [Troubleshooting Guide](#troubleshooting-guide)
7. [Best Practices](#best-practices)

---

## Overview

The Eligian test suite uses **Vitest** as the test runner and **Langium's test utilities** for parsing and validating DSL code. Tests are organized into two main categories:

- **Unit Tests**: Test individual functions/modules in isolation (validators, transformers, type checkers)
- **Integration Tests**: Test end-to-end DSL compilation with real Eligian source files

This guide focuses on integration testing patterns, particularly for multi-file scenarios involving library imports.

### Key Technologies

- **Langium**: Language server framework providing parsing, validation, and cross-reference resolution
- **Vitest**: Modern test framework with fast execution and ESM support
- **Mock File System**: In-memory file system for simulating multi-file scenarios without disk I/O

---

## Langium Document Lifecycle

Understanding how Langium processes documents is critical for writing correct integration tests.

### Document Lifecycle Phases

1. **Parsing**: Source text → Abstract Syntax Tree (AST)
2. **Workspace Registration**: Document added to `LangiumDocuments` registry
3. **Linking**: Cross-references resolved (e.g., imports, action calls)
4. **Validation**: Semantic rules checked (e.g., unknown actions, type errors)

### Workspace Management

The **Langium Workspace** is a registry of all active documents. It enables:
- Cross-document reference resolution (imports)
- Document lookup by URI
- Dependency tracking

**Key Services**:
- `LangiumDocuments`: Document registry (`getDocument(uri)`, `addDocument(doc)`)
- `DocumentBuilder`: Processes documents through lifecycle phases (`build(docs, options)`)
- `ScopeProvider`: Resolves symbol references (e.g., finding imported actions)

### Critical Timing Consideration

**Documents must be in the workspace BEFORE validation runs** for cross-document references to resolve correctly.

If a library file is not in the workspace when a main file's imports are validated, the scope provider's `getImportedActions()` method will fail to find the library document, causing "Unknown action" errors.

---

## Test Helper Functions

The `test-helpers.ts` module provides four main helper functions for test setup. Each has specific use cases and behavior.

### 1. `createTestContext()`

**Purpose**: Create a basic test environment with Langium services and parsing utilities.

**When to use**:
- Single-file tests (no imports)
- Tests that don't require file system access
- Most unit-style integration tests

**Behavior**:
- Uses `EmptyFileSystem` (no actual file I/O)
- Initializes Langium services
- Returns `parse()` and `parseAndValidate()` helpers

**Example**:
```typescript
import { createTestContext, type TestContext } from './test-helpers.js';

describe('Timeline Validation', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext(); // Initialize once per suite
  });

  test('validates timeline syntax', async () => {
    const { errors } = await ctx.parseAndValidate(`
      timeline "Test" in ".container" using raf {}
    `);
    expect(errors).toHaveLength(0);
  });
});
```

**Lifecycle**:
- Call in `beforeAll()` hook (expensive - initialize once per suite)
- Documents parsed with `ctx.parse()` are automatically added to workspace
- Workspace is shared across all tests in the suite

### 2. `createTestContextWithMockFS()`

**Purpose**: Create test environment with in-memory file system for multi-file scenarios.

**When to use**:
- Multi-file tests (library imports)
- Tests that validate file existence checks
- Tests needing file path resolution

**Behavior**:
- Uses `MockFileSystem` (in-memory Map<URI, content>)
- All other behavior identical to `createTestContext()`
- Returns `mockFs` object with `writeFile()`, `readFile()` methods

**Example**:
```typescript
import { createTestContextWithMockFS, type TestContext } from './test-helpers.js';

describe('Import Validation', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContextWithMockFS();

    // Add library file to mock FS
    ctx.mockFs!.writeFile('file:///test/animations.eligian', `
      library animations
      action fadeIn(selector: string) [
        selectElement(selector)
      ]
    `);
  });

  test('imports action from library', async () => {
    const { errors } = await ctx.parseAndValidate(`
      import { fadeIn } from "./animations.eligian"
    `, { documentUri: 'file:///test/main.eligian' });
    expect(errors).toHaveLength(0);
  });
});
```

**Critical**: Files must be written to `mockFs` BEFORE parsing documents that reference them.

### 3. `createLibraryDocument(ctx, code, uri)`

**Purpose**: Create and build a single library document, adding it to the workspace.

**When to use**:
- Setting up shared library files in `beforeAll()`
- Creating libraries that multiple tests import
- Ensuring library documents are available before dependent documents

**Behavior**:
1. Writes content to mock FS (if available)
2. Parses library code using `ctx.parse()` (adds to workspace)
3. Builds document with `DocumentBuilder.build()` (triggers validation)
4. Returns `LangiumDocument` object

**Example**:
```typescript
import { createTestContextWithMockFS, createLibraryDocument } from './test-helpers.js';

describe('Import Tests', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = createTestContextWithMockFS();

    // Create library once, used by all tests
    await createLibraryDocument(
      ctx,
      `
        library animations
        action fadeIn(selector: string) [ ... ]
        action fadeOut(selector: string) [ ... ]
      `,
      'file:///test/animations.eligian'
    );
  });

  test('can import fadeIn', async () => {
    const { errors } = await ctx.parseAndValidate(`
      import { fadeIn } from "./animations.eligian"
      timeline "T" in "#app" using raf {
        at 0s..1s fadeIn("#box")
      }
    `, { documentUri: 'file:///test/main.eligian' });
    expect(errors).toHaveLength(0);
  });

  test('can import fadeOut', async () => {
    const { errors } = await ctx.parseAndValidate(`
      import { fadeOut } from "./animations.eligian"
      timeline "T" in "#app" using raf {
        at 0s..1s fadeOut("#box")
      }
    `, { documentUri: 'file:///test/main2.eligian' });
    expect(errors).toHaveLength(0);
  });
});
```

**Key Advantage**: Library is created once in `beforeAll()`, shared across all tests in suite.

### 4. `setupDocuments(ctx, documents[])`

**Purpose**: Create multiple documents together for complex multi-file test scenarios.

**When to use**:
- Tests requiring multiple interdependent documents
- Complex import scenarios (multiple libraries, transitive imports)
- Tests validating cross-document interactions

**Behavior**:
1. Writes all documents to mock FS (if available)
2. Parses all documents using `ctx.parse()` (adds to workspace)
3. Builds ALL documents together with `DocumentBuilder.build()`
4. Returns `Map<URI, LangiumDocument>` for easy lookup

**Example**:
```typescript
import { createTestContextWithMockFS, setupDocuments } from './test-helpers.js';

test('validates imports across multiple files', async () => {
  const ctx = createTestContextWithMockFS();

  const docs = await setupDocuments(ctx, [
    {
      uri: 'file:///test/animations.eligian',
      content: `
        library animations
        action fadeIn(selector: string) [ ... ]
      `
    },
    {
      uri: 'file:///test/main.eligian',
      content: `
        import { fadeIn } from "./animations.eligian"
        timeline "T" in "#app" using raf {
          at 0s..1s fadeIn("#box")
        }
      `
    }
  ]);

  const mainDoc = docs.get('file:///test/main.eligian')!;
  const errors = mainDoc.diagnostics?.filter(d => d.severity === 1) ?? [];
  expect(errors).toHaveLength(0);
});
```

**When NOT to use**: If libraries can be shared across tests, prefer `createLibraryDocument()` in `beforeAll()` for better performance.

---

## Multi-File Test Patterns

### Pattern 1: Shared Libraries (Recommended)

**Use Case**: Multiple tests import from the same library files.

**Pattern**:
```typescript
describe('Feature Tests', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = createTestContextWithMockFS();

    // Create libraries once
    await createLibraryDocument(ctx, libraryCode1, 'file:///lib1.eligian');
    await createLibraryDocument(ctx, libraryCode2, 'file:///lib2.eligian');
  });

  test('test 1', async () => {
    const { errors } = await ctx.parseAndValidate(`
      import { action1 } from "./lib1.eligian"
      // ... use action1 ...
    `, { documentUri: 'file:///test1.eligian' });
    expect(errors).toHaveLength(0);
  });

  test('test 2', async () => {
    const { errors } = await ctx.parseAndValidate(`
      import { action2 } from "./lib2.eligian"
      // ... use action2 ...
    `, { documentUri: 'file:///test2.eligian' });
    expect(errors).toHaveLength(0);
  });
});
```

**Advantages**:
- Libraries created once, reused across all tests (performance)
- Clear separation between setup and test cases
- Follows DRY principle

### Pattern 2: Per-Test Documents

**Use Case**: Each test requires different library configurations or isolated state.

**Pattern**:
```typescript
describe('Feature Tests', () => {
  test('test with specific library config', async () => {
    const ctx = createTestContextWithMockFS();

    const docs = await setupDocuments(ctx, [
      { uri: 'file:///lib.eligian', content: '...' },
      { uri: 'file:///main.eligian', content: '...' }
    ]);

    const mainDoc = docs.get('file:///main.eligian')!;
    expect(mainDoc.diagnostics).toHaveLength(0);
  });

  test('test with different library config', async () => {
    const ctx = createTestContextWithMockFS();

    const docs = await setupDocuments(ctx, [
      { uri: 'file:///lib.eligian', content: '... different ...' },
      { uri: 'file:///main.eligian', content: '...' }
    ]);

    const mainDoc = docs.get('file:///main.eligian')!;
    expect(mainDoc.diagnostics).toHaveLength(0);
  });
});
```

**Advantages**:
- Complete test isolation
- No shared state between tests
- Can test different library configurations

**Disadvantages**:
- Slower (creates fresh context for each test)
- More verbose test code

### Pattern 3: Hybrid Approach

**Use Case**: Some libraries are shared, some are test-specific.

**Pattern**:
```typescript
describe('Feature Tests', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = createTestContextWithMockFS();

    // Shared library used by all tests
    await createLibraryDocument(ctx, sharedLib, 'file:///shared.eligian');
  });

  test('with additional library', async () => {
    // Create test-specific library
    await createLibraryDocument(ctx, specificLib, 'file:///specific.eligian');

    const { errors } = await ctx.parseAndValidate(`
      import { sharedAction } from "./shared.eligian"
      import { specificAction } from "./specific.eligian"
      // ... use both ...
    `, { documentUri: 'file:///test.eligian' });
    expect(errors).toHaveLength(0);
  });
});
```

---

## Common Pitfalls

### Pitfall 1: Creating Context in `beforeEach()`

**Problem**:
```typescript
// ❌ BAD: Recreates services for EVERY test (slow, wasteful)
beforeEach(() => {
  ctx = createTestContext();
});
```

**Solution**:
```typescript
// ✅ GOOD: Create once per suite
beforeAll(() => {
  ctx = createTestContext();
});
```

**Why**: Service initialization is expensive. Unless tests require complete isolation, share context across suite.

### Pitfall 2: Forgetting Mock FS

**Problem**:
```typescript
// ❌ BAD: No mock FS, imports will fail
const ctx = createTestContext();

const { errors } = await ctx.parseAndValidate(`
  import { fadeIn } from "./animations.eligian"
`);
// Result: File not found error
```

**Solution**:
```typescript
// ✅ GOOD: Use mock FS for imports
const ctx = createTestContextWithMockFS();
ctx.mockFs!.writeFile('file:///animations.eligian', '...');

const { errors } = await ctx.parseAndValidate(`
  import { fadeIn } from "./animations.eligian"
`, { documentUri: 'file:///main.eligian' });
```

### Pitfall 3: URI Mismatch

**Problem**:
```typescript
// ❌ BAD: URI paths don't match
ctx.mockFs!.writeFile('file:///test/lib.eligian', '...');

const { errors } = await ctx.parseAndValidate(`
  import { action } from "./lib.eligian"
`, { documentUri: 'file:///main.eligian' }); // Wrong directory!
```

**Solution**:
```typescript
// ✅ GOOD: Ensure URIs are in same directory
ctx.mockFs!.writeFile('file:///test/lib.eligian', '...');

const { errors } = await ctx.parseAndValidate(`
  import { action } from "./lib.eligian"
`, { documentUri: 'file:///test/main.eligian' }); // Same directory
```

**Why**: Relative imports (`./lib.eligian`) resolve relative to the importing document's directory.

### Pitfall 4: Not Awaiting Helper Functions

**Problem**:
```typescript
// ❌ BAD: Missing await
const docs = setupDocuments(ctx, [...]);
const doc = docs.get('...')!; // TypeError: docs is Promise, not Map!
```

**Solution**:
```typescript
// ✅ GOOD: Always await
const docs = await setupDocuments(ctx, [...]);
const doc = docs.get('...')!;
```

### Pitfall 5: Importing Non-Existent Actions

**Problem**:
```typescript
// ❌ BAD: Library defines fadeIn, but test imports fadeOut
await createLibraryDocument(ctx, `
  library animations
  action fadeIn(selector: string) [ ... ]
`, 'file:///lib.eligian');

const { errors } = await ctx.parseAndValidate(`
  import { fadeOut } from "./lib.eligian" // Error: fadeOut doesn't exist
`);
```

**Solution**: Ensure imported action names match library definitions exactly.

---

## Troubleshooting Guide

### Problem: "Unknown action: X" Error

**Symptoms**: Test fails with "Unknown action: X" error, even though action is defined in library.

**Possible Causes**:
1. Library document not in workspace
2. URI path mismatch
3. Action name typo
4. Library file not parsed before main file

**Debugging Steps**:
1. Verify library file is written to mock FS:
   ```typescript
   console.log(ctx.mockFs!.files); // Check if library URI is present
   ```

2. Verify document URIs match directory structure:
   ```typescript
   // Library: file:///test/lib.eligian
   // Main: file:///test/main.eligian (same directory for ./lib.eligian)
   ```

3. Verify library was built before main file validation:
   ```typescript
   // Use createLibraryDocument() in beforeAll()
   // OR ensure setupDocuments() includes library BEFORE main
   ```

4. Check action name spelling:
   ```typescript
   // Library: action fadeIn(...)
   // Import: import { fadeIn } from "..." // Must match exactly
   ```

### Problem: "File not found" Error

**Symptoms**: Import statement reports library file not found.

**Possible Causes**:
1. Missing mock FS
2. File not written to mock FS
3. URI path mismatch

**Debugging Steps**:
1. Ensure using `createTestContextWithMockFS()`:
   ```typescript
   const ctx = createTestContextWithMockFS(); // NOT createTestContext()
   ```

2. Verify file was written:
   ```typescript
   ctx.mockFs!.writeFile('file:///test/lib.eligian', '...');
   console.log(ctx.mockFs!.files.has('file:///test/lib.eligian')); // Should be true
   ```

3. Check import path resolution:
   ```typescript
   // If main is file:///test/main.eligian
   // Then "./lib.eligian" resolves to file:///test/lib.eligian
   ```

### Problem: Tests Pass Individually, Fail Together

**Symptoms**: Running one test passes, but running entire suite fails.

**Possible Causes**:
1. Shared context pollution
2. Documents not cleaned up between tests
3. Workspace state leak

**Solutions**:
1. Use `beforeAll()` for setup, not `beforeEach()`
2. Ensure each test uses unique document URIs
3. If isolation required, create fresh context per test (performance trade-off)

---

## Best Practices

### 1. Lifecycle Hook Usage

- **`beforeAll()`**: Use for test context creation (expensive operations)
- **`beforeEach()`**: Use for per-test setup that requires isolation (mocks, test data)
- **`afterEach()`**: Use for cleanup (mock restoration, state reset)

### 2. Test Organization

- **One integration test per file**: Prevents environment pollution (per Constitution Principle II)
- **Group related tests**: Use `describe()` blocks to organize test suites
- **Clear test names**: Use descriptive names that explain what's being tested

### 3. URI Conventions

- Use `file:///test/` prefix for test documents
- Use consistent directory structure within tests
- Name files descriptively: `file:///test/animations.eligian`, `file:///test/main.eligian`

### 4. Error Assertion Patterns

```typescript
// ✅ GOOD: Filter by severity explicitly
const errors = diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);
expect(errors).toHaveLength(0);

// ✅ GOOD: Check specific error codes
const importError = errors.find(e => e.code === 'unknown_action');
expect(importError).toBeDefined();
expect(importError?.message).toContain('fadeIn');

// ❌ BAD: Magic numbers
const errors = diagnostics.filter(d => d.severity === 1);
```

### 5. Mock FS Management

```typescript
// ✅ GOOD: Write files in beforeAll(), used by all tests
beforeAll(() => {
  ctx = createTestContextWithMockFS();
  ctx.mockFs!.writeFile('file:///shared.eligian', '...');
});

// ✅ GOOD: Write test-specific files inside test
test('specific case', () => {
  ctx.mockFs!.writeFile('file:///test-specific.eligian', '...');
  // ... test code ...
});
```

### 6. Documentation

- Document complex test setups
- Explain why specific helper functions are used
- Link to this guide when onboarding new developers

---

## Summary

**Key Takeaways**:
1. Use `createTestContext()` for single-file tests
2. Use `createTestContextWithMockFS()` + `createLibraryDocument()` for shared libraries
3. Use `setupDocuments()` for complex multi-file scenarios
4. Always create context in `beforeAll()`, not `beforeEach()`
5. Ensure URIs match directory structure for imports to resolve
6. Write libraries to mock FS BEFORE importing documents reference them

**When in Doubt**:
- Check existing tests in `import-validation.spec.ts` for working patterns
- Review this guide's troubleshooting section
- Add debug logging to trace document lifecycle

**Future Improvements**:
- Consider adding workspace inspection utilities for debugging
- Explore Langium's linking phase for better import resolution understanding
- Document advanced patterns (circular imports, transitive dependencies)

---

**Document Status**: Complete (2000+ words, covers all FR-008 through FR-011 requirements)
