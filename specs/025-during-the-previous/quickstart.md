# Quickstart: Multi-File Test Infrastructure for Library Imports

**Date**: 2025-01-05
**Spec**: [spec.md](./spec.md)
**Plan**: [plan.md](./plan.md)
**Research**: [research.md](./research.md)
**Data Model**: [data-model.md](./data-model.md)

## Overview

This guide demonstrates how to use the new multi-file test helpers to write integration tests for library imports. The infrastructure enables testing scenarios that require multiple documents (libraries and importing files) with automatic cross-reference resolution and validation.

---

## Quick Reference

### Helper Methods

```typescript
// Create multiple documents with automatic building
const docs = await setupDocuments(ctx, [
  { uri: 'file:///test/lib.eligian', content: '...' },
  { uri: 'file:///test/main.eligian', content: '...' },
]);

// Create library documents (semantic wrapper)
await createLibraryDocuments(ctx, [
  { uri: 'file:///test/animations.eligian', content: '...' },
]);

// Validate entire import chain
const result = await validateImportChain(ctx, 'file:///test/main.eligian');
```

### Test Context Setup

```typescript
import { createTestContextWithMockFS, setupCSSRegistry } from './test-helpers.js';

let ctx: TestContext;

beforeEach(() => {
  ctx = createTestContextWithMockFS();  // Mock FS required for imports

  // Setup CSS registry (if tests use CSS)
  setupCSSRegistry(ctx, 'file:///test/test.css', {
    classes: ['active', 'button'],
    ids: ['app', 'header'],
  });
});
```

---

## Example 1: Basic Import Test

### Scenario
Test that importing and calling an action from a library file works without validation errors.

### Code

```typescript
import { describe, test, expect, beforeEach } from 'vitest';
import {
  createTestContextWithMockFS,
  setupDocuments,
  setupCSSRegistry,
  DiagnosticSeverity,
  type TestContext,
} from './test-helpers.js';

describe('Import validation - basic', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestContextWithMockFS();
    setupCSSRegistry(ctx, 'file:///test/test.css', {
      classes: ['active'],
      ids: ['app'],
    });
  });

  test('should NOT error on valid imported action call', async () => {
    const docs = await setupDocuments(ctx, [
      // Library file
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
      // Main file that imports from library
      {
        uri: 'file:///test/main.eligian',
        content: `
          styles "./test.css"
          import { fadeIn } from "./animations.eligian"

          action test() [
            fadeIn("#app", 1000)
          ]

          timeline "Demo" in "#app" using raf {
            at 0s..1s test()
          }
        `
      }
    ]);

    const mainDoc = docs.get('file:///test/main.eligian')!;
    const errors = mainDoc.diagnostics?.filter(d => d.severity === DiagnosticSeverity.Error) ?? [];

    expect(errors).toHaveLength(0);
  });
});
```

### Key Points
- Use `createTestContextWithMockFS()` - mock FS required for import resolution
- Library and main file URIs must be in same directory (`file:///test/`)
- Import path uses `./` prefix: `import { fadeIn } from "./animations.eligian"`
- `setupDocuments()` builds all documents together (resolves cross-references)
- Filter diagnostics by `DiagnosticSeverity.Error` (ignore warnings)

---

## Example 2: Multiple Libraries

### Scenario
Test importing actions from multiple library files in the same main file.

### Code

```typescript
describe('Import validation - multiple libraries', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestContextWithMockFS();
    setupCSSRegistry(ctx, 'file:///test/test.css', {
      classes: ['button', 'active'],
      ids: ['app', 'sidebar'],
    });
  });

  test('should validate imports from multiple libraries', async () => {
    const docs = await setupDocuments(ctx, [
      // Library 1: animations
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
      // Library 2: utils
      {
        uri: 'file:///test/utils.eligian',
        content: `
          library utils
          action safeSelect(selector: string) [
            selectElement(selector)
          ]
        `
      },
      // Main file imports from both libraries
      {
        uri: 'file:///test/main.eligian',
        content: `
          styles "./test.css"
          import { fadeIn } from "./animations.eligian"
          import { safeSelect } from "./utils.eligian"

          action enhanced() [
            safeSelect("#app")
            fadeIn("#app", 1000)
            addClass("active")
          ]

          timeline "Demo" in "#app" using raf {
            at 0s..1s enhanced()
          }
        `
      }
    ]);

    const mainDoc = docs.get('file:///test/main.eligian')!;
    const errors = mainDoc.diagnostics?.filter(d => d.severity === DiagnosticSeverity.Error) ?? [];

    expect(errors).toHaveLength(0);
  });
});
```

### Key Points
- Multiple import statements are supported: each imports from a different library
- All libraries must be in `setupDocuments()` array (so cross-references resolve)
- Order doesn't matter - `DocumentBuilder` resolves dependencies automatically

---

## Example 3: Shared Libraries (beforeAll)

### Scenario
Use `beforeAll()` to create shared libraries once per suite, then write multiple tests that import from those libraries.

### Code

```typescript
describe('Import validation - shared libraries', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = createTestContextWithMockFS();

    // Create shared libraries (used by all tests in this suite)
    await createLibraryDocuments(ctx, [
      {
        uri: 'file:///test/animations.eligian',
        content: `
          library animations
          action fadeIn(selector: string, duration: number) [
            selectElement(selector)
            animate({opacity: 1}, duration)
          ]
          action fadeOut(selector: string, duration: number) [
            selectElement(selector)
            animate({opacity: 0}, duration)
          ]
        `
      },
      {
        uri: 'file:///test/utils.eligian',
        content: `
          library utils
          action safeSelect(selector: string) [
            selectElement(selector)
          ]
        `
      },
    ]);
  });

  beforeEach(() => {
    setupCSSRegistry(ctx, 'file:///test/test.css', {
      classes: ['active'],
      ids: ['app'],
    });
  });

  test('imports fadeIn only', async () => {
    const { diagnostics } = await ctx.parseAndValidate(`
      styles "./test.css"
      import { fadeIn } from "./animations.eligian"

      action test() [
        fadeIn("#app", 1000)
      ]

      timeline "Demo" in "#app" using raf {
        at 0s..1s test()
      }
    `);

    const errors = diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);
    expect(errors).toHaveLength(0);
  });

  test('imports fadeOut only', async () => {
    const { diagnostics } = await ctx.parseAndValidate(`
      styles "./test.css"
      import { fadeOut } from "./animations.eligian"

      action test() [
        fadeOut("#app", 500)
      ]

      timeline "Demo" in "#app" using raf {
        at 0s..1s test()
      }
    `);

    const errors = diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);
    expect(errors).toHaveLength(0);
  });

  test('imports from multiple libraries', async () => {
    const { diagnostics } = await ctx.parseAndValidate(`
      styles "./test.css"
      import { fadeIn } from "./animations.eligian"
      import { safeSelect } from "./utils.eligian"

      action test() [
        safeSelect("#app")
        fadeIn("#app", 1000)
      ]

      timeline "Demo" in "#app" using raf {
        at 0s..1s test()
      }
    `);

    const errors = diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);
    expect(errors).toHaveLength(0);
  });
});
```

### Key Points
- `beforeAll()` creates libraries once (performance optimization)
- Each test uses `ctx.parseAndValidate()` for main file (libraries already in workspace)
- Main file uses auto-generated URI (no need to specify `documentUri`)
- All tests share same libraries - suitable for read-only validation tests

---

## Example 4: Error Detection (Typos)

### Scenario
Test that the validator correctly catches typos in imported action names.

### Code

```typescript
describe('Import validation - error detection', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestContextWithMockFS();
    setupCSSRegistry(ctx, 'file:///test/test.css', {
      classes: [],
      ids: ['app'],
    });
  });

  test('should error on typo in imported action name', async () => {
    const docs = await setupDocuments(ctx, [
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
            fadein("#app", 1000)  // Typo: lowercase 'i'
          ]

          timeline "Demo" in "#app" using raf {
            at 0s..1s test()
          }
        `
      }
    ]);

    const mainDoc = docs.get('file:///test/main.eligian')!;
    const errors = mainDoc.diagnostics?.filter(d => d.severity === DiagnosticSeverity.Error) ?? [];

    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.message.includes('fadein'))).toBe(true);
    expect(errors.some(e => e.message.includes('Unknown operation'))).toBe(true);
  });

  test('should error on non-existent action', async () => {
    const docs = await setupDocuments(ctx, [
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
            fadeIn("#app", 1000)     // Valid
            nonExistent("#app")      // Error: not imported, not built-in
          ]

          timeline "Demo" in "#app" using raf {
            at 0s..1s test()
          }
        `
      }
    ]);

    const mainDoc = docs.get('file:///test/main.eligian')!;
    const errors = mainDoc.diagnostics?.filter(d => d.severity === DiagnosticSeverity.Error) ?? [];

    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.message.includes('nonExistent'))).toBe(true);
  });
});
```

### Key Points
- Typos in imported action names trigger "Unknown operation" errors
- Validator correctly distinguishes imported actions from typos
- Use `errors.some(e => e.message.includes('...'))` to check error messages

---

## Example 5: Import Chain Validation

### Scenario
Test a chain of imports where Library A imports from Library B, and Main imports from Library A.

### Code

```typescript
describe('Import validation - import chains', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestContextWithMockFS();
    setupCSSRegistry(ctx, 'file:///test/test.css', {
      classes: [],
      ids: ['app'],
    });
  });

  test('validates entire import chain', async () => {
    const docs = await setupDocuments(ctx, [
      // Bottom of chain: base library
      {
        uri: 'file:///test/base.eligian',
        content: `
          library base
          action baseAction(selector: string) [
            selectElement(selector)
          ]
        `
      },
      // Middle of chain: library that imports base
      {
        uri: 'file:///test/enhanced.eligian',
        content: `
          library enhanced
          import { baseAction } from "./base.eligian"

          action enhancedAction(selector: string) [
            baseAction(selector)
            addClass("enhanced")
          ]
        `
      },
      // Top of chain: main file imports enhanced
      {
        uri: 'file:///test/main.eligian',
        content: `
          styles "./test.css"
          import { enhancedAction } from "./enhanced.eligian"

          action test() [
            enhancedAction("#app")
          ]

          timeline "Demo" in "#app" using raf {
            at 0s..1s test()
          }
        `
      }
    ]);

    // Validate entire chain using helper
    const result = await validateImportChain(ctx, 'file:///test/main.eligian');

    expect(result.hasErrors).toBe(false);
    expect(result.documents).toHaveLength(3);
    expect(result.allErrors.size).toBe(0);

    // Verify documents are in expected order (depth-first traversal)
    const uris = result.documents.map(d => d.uri.toString());
    expect(uris).toContain('file:///test/main.eligian');
    expect(uris).toContain('file:///test/enhanced.eligian');
    expect(uris).toContain('file:///test/base.eligian');
  });

  test('detects errors in import chain', async () => {
    const docs = await setupDocuments(ctx, [
      {
        uri: 'file:///test/base.eligian',
        content: `
          library base
          action baseAction(selector: string) [
            selectElement(selector)
          ]
        `
      },
      {
        uri: 'file:///test/enhanced.eligian',
        content: `
          library enhanced
          import { baseAction } from "./base.eligian"

          action enhancedAction(selector: string) [
            baseaction(selector)  // Typo: lowercase 'a'
          ]
        `
      },
      {
        uri: 'file:///test/main.eligian',
        content: `
          styles "./test.css"
          import { enhancedAction } from "./enhanced.eligian"

          action test() [
            enhancedAction("#app")
          ]

          timeline "Demo" in "#app" using raf {
            at 0s..1s test()
          }
        `
      }
    ]);

    const result = await validateImportChain(ctx, 'file:///test/main.eligian');

    expect(result.hasErrors).toBe(true);
    expect(result.allErrors.size).toBeGreaterThan(0);

    // Error should be in enhanced.eligian
    const enhancedErrors = result.allErrors.get('file:///test/enhanced.eligian') ?? [];
    expect(enhancedErrors.length).toBeGreaterThan(0);
    expect(enhancedErrors.some(e => e.message.includes('baseaction'))).toBe(true);
  });
});
```

### Key Points
- `validateImportChain()` traverses entire import graph
- Returns all documents in the chain
- Groups errors by document URI for debugging
- Detects errors anywhere in the chain (not just the root document)

---

## Example 6: Performance Test (10 Libraries)

### Scenario
Verify that the infrastructure supports creating up to 10 library files without performance degradation (<500ms per spec.md SC-004).

### Code

```typescript
import { describe, test, expect, beforeEach } from 'vitest';
import {
  createTestContextWithMockFS,
  createLibraryDocuments,
  setupCSSRegistry,
  type TestContext,
} from './test-helpers.js';

describe('Import validation - performance', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestContextWithMockFS();
  });

  test('supports 10 library files within 500ms', async () => {
    const startTime = performance.now();

    // Create 10 library files
    const libraries = Array.from({ length: 10 }, (_, i) => ({
      uri: `file:///test/lib${i}.eligian`,
      content: `
        library lib${i}
        action action${i}(selector: string) [
          selectElement(selector)
        ]
      `
    }));

    await createLibraryDocuments(ctx, libraries);

    const endTime = performance.now();
    const duration = endTime - startTime;

    expect(duration).toBeLessThan(500);  // Success criteria: <500ms

    // Verify all libraries are in workspace
    for (let i = 0; i < 10; i++) {
      const uri = `file:///test/lib${i}.eligian`;
      const doc = ctx.services.shared.workspace.LangiumDocuments.getDocument(URI.parse(uri));
      expect(doc).toBeDefined();
    }
  });
});
```

### Key Points
- Use `performance.now()` to measure execution time
- Generate libraries programmatically using `Array.from()`
- Verify all documents are registered in workspace after creation

---

## Example 7: Test Isolation

### Scenario
Verify that documents from one test don't leak into another test.

### Code

```typescript
describe('Import validation - test isolation', () => {
  test('test 1 creates lib1', async () => {
    const ctx = createTestContextWithMockFS();

    await createLibraryDocuments(ctx, [
      { uri: 'file:///test/lib1.eligian', content: 'library lib1 ...' },
    ]);

    const doc = ctx.services.shared.workspace.LangiumDocuments.getDocument(URI.parse('file:///test/lib1.eligian'));
    expect(doc).toBeDefined();
  });

  test('test 2 should NOT see lib1', async () => {
    const ctx = createTestContextWithMockFS();  // Fresh context

    const doc = ctx.services.shared.workspace.LangiumDocuments.getDocument(URI.parse('file:///test/lib1.eligian'));
    expect(doc).toBeUndefined();  // lib1 from test 1 should not exist
  });

  test('test 3 creates lib2', async () => {
    const ctx = createTestContextWithMockFS();

    await createLibraryDocuments(ctx, [
      { uri: 'file:///test/lib2.eligian', content: 'library lib2 ...' },
    ]);

    // lib2 exists
    const lib2 = ctx.services.shared.workspace.LangiumDocuments.getDocument(URI.parse('file:///test/lib2.eligian'));
    expect(lib2).toBeDefined();

    // lib1 from test 1 does NOT exist
    const lib1 = ctx.services.shared.workspace.LangiumDocuments.getDocument(URI.parse('file:///test/lib1.eligian'));
    expect(lib1).toBeUndefined();
  });
});
```

### Key Points
- Each test creates fresh `TestContext` (no shared state)
- Documents from one test don't leak into another
- Use `beforeEach()` if tests share setup logic

---

## Common Patterns

### Pattern 1: Simple Import Test (MVP)

```typescript
test('basic import', async () => {
  const ctx = createTestContextWithMockFS();

  const docs = await setupDocuments(ctx, [
    { uri: 'file:///test/lib.eligian', content: 'library lib ...' },
    { uri: 'file:///test/main.eligian', content: 'import { x } from "./lib.eligian"' },
  ]);

  const mainDoc = docs.get('file:///test/main.eligian')!;
  const errors = mainDoc.diagnostics?.filter(d => d.severity === 1) ?? [];
  expect(errors).toHaveLength(0);
});
```

### Pattern 2: Shared Libraries (beforeAll)

```typescript
let ctx: TestContext;

beforeAll(async () => {
  ctx = createTestContextWithMockFS();
  await createLibraryDocuments(ctx, [
    { uri: 'file:///test/lib.eligian', content: '...' },
  ]);
});

test('test 1', async () => {
  const { diagnostics } = await ctx.parseAndValidate('...');
  // ...
});
```

### Pattern 3: Error Detection

```typescript
test('typo detection', async () => {
  const docs = await setupDocuments(ctx, [
    { uri: 'file:///test/lib.eligian', content: 'library lib action foo() [...]' },
    { uri: 'file:///test/main.eligian', content: 'import { foo } from "./lib.eligian" action x() [ Foo() ]' },  // Typo: capital F
  ]);

  const mainDoc = docs.get('file:///test/main.eligian')!;
  const errors = mainDoc.diagnostics?.filter(d => d.severity === 1) ?? [];
  expect(errors.length).toBeGreaterThan(0);
  expect(errors.some(e => e.message.includes('Foo'))).toBe(true);
});
```

---

## Troubleshooting

### Issue 1: "File not found" errors for imports

**Symptom**: Import validation shows "file not found" error even though library is created

**Cause**: Mock FS not used or library URI doesn't match import path

**Solution**:
- Use `createTestContextWithMockFS()` (not `createTestContext()`)
- Ensure library and main file URIs are in same directory
- Verify import path matches library filename: `import { x } from "./lib.eligian"` → `file:///test/lib.eligian`

### Issue 2: "Unknown operation" errors for valid imported actions

**Symptom**: Validator reports "Unknown operation" for imported action that exists

**Cause**: Documents not built together (cross-references not resolved)

**Solution**:
- Use `setupDocuments()` to create library and main file together
- Don't manually call `DocumentBuilder.build()` - `setupDocuments()` handles it

### Issue 3: Documents leak between tests

**Symptom**: Test sees documents created in previous test

**Cause**: Shared `TestContext` between tests

**Solution**:
- Use `beforeEach()` to create fresh context per test
- Don't reuse context across tests unless intentional (shared libraries)

### Issue 4: Performance issues with many libraries

**Symptom**: Test takes longer than expected with multiple libraries

**Cause**: Creating libraries individually instead of in bulk

**Solution**:
- Use `setupDocuments()` or `createLibraryDocuments()` to create all libraries at once
- Don't call `createLibraryDocument()` in a loop - it builds each document separately

---

## Migration Guide (Feature 024 Tests)

### Before (Skipped Tests)

```typescript
test.skip('should NOT error on valid imported action call', async () => {
  // NOTE: Requires multi-file test infrastructure
  const { diagnostics } = await ctx.parseAndValidate(`...`);
  // ...
});
```

### After (Using New Infrastructure)

```typescript
test('should NOT error on valid imported action call', async () => {
  const ctx = createTestContextWithMockFS();

  const docs = await setupDocuments(ctx, [
    { uri: 'file:///test/lib.eligian', content: '...' },
    { uri: 'file:///test/main.eligian', content: '...' },
  ]);

  setupCSSRegistry(ctx, 'file:///test/test.css', { classes: ['active'], ids: ['app'] });

  const mainDoc = docs.get('file:///test/main.eligian')!;
  const errors = mainDoc.diagnostics?.filter(d => d.severity === 1) ?? [];
  expect(errors).toHaveLength(0);
});
```

### Migration Steps

1. Remove `.skip` from test
2. Create test context with mock FS: `createTestContextWithMockFS()`
3. Replace inline code with `setupDocuments()` call (library + main file)
4. Add CSS registry setup (if needed)
5. Get main document from returned Map
6. Filter diagnostics as before

---

## Best Practices

1. **Always use mock FS** - Import resolution requires file existence checks
2. **Use same directory** - Keep all test documents in `file:///test/` directory
3. **Create documents together** - Use `setupDocuments()` to build all docs at once
4. **Fresh context per test** - Use `beforeEach()` unless sharing libraries intentionally
5. **Filter diagnostics** - Use `DiagnosticSeverity.Error` to ignore warnings
6. **Setup CSS registry** - If tests use `styles "./file.css"`, add CSS registry setup
7. **Meaningful URIs** - Use descriptive filenames: `animations.eligian`, not `lib1.eligian`

---

## Checklist (Before Feature Complete)

- [ ] All Feature 024 skipped tests (T003-T005) updated to use new helpers
- [ ] Integration tests added for `setupDocuments()`, `createLibraryDocuments()`, `validateImportChain()`
- [ ] Performance test added (10 libraries, <500ms)
- [ ] Test isolation verified (no leakage between tests)
- [ ] JSDoc added to all helper methods
- [ ] Example tests demonstrate all patterns (basic, multiple, shared, errors, chains)

---

**Implementation Time Estimate**: 3-5 hours (including tests)

**Complexity**: Low (helper wrappers around existing Langium services)

**Test Coverage**: 6 new tests (3 helper integration tests + 3 Feature 024 updates)
