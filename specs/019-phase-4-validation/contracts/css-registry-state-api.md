# CSS Registry State Management API Contract

**Feature**: Phase 4 - Validation Pipeline Unification
**Purpose**: Define the interface for CSS registry state management and isolation
**Date**: 2025-01-28

## Overview

This API contract defines the methods added to `CSSRegistryService` to support explicit state management and compilation isolation. These methods ensure that each compilation is independent and CSS metadata doesn't leak between documents.

## Type Definitions

### CSSParseResult

Metadata extracted from parsing a CSS file.

```typescript
interface CSSParseResult {
  /** All CSS classes defined in the file */
  classes: Set<string>;

  /** All CSS IDs defined in the file */
  ids: Set<string>;

  /** All CSS rules (for advanced features) */
  rules: CSSRule[];

  /** Source locations of classes/IDs for error reporting */
  locations: Map<string, CSSSourceLocation>;
}

interface CSSSourceLocation {
  line: number;
  column: number;
  length?: number;
}
```

### CSSParseError

Error encountered when parsing a CSS file.

```typescript
interface CSSParseError {
  message: string;
  line: number;
  column: number;
  file: string;
}
```

## CSSRegistryService API

### Existing Methods (Context)

For reference, these are the existing methods in `CSSRegistryService`:

```typescript
class CSSRegistryService {
  /**
   * Update CSS file metadata after parsing
   * @param fileUri CSS file URI
   * @param metadata Parsed CSS metadata
   */
  updateCSSFile(fileUri: string, metadata: CSSParseResult): void;

  /**
   * Register which CSS files a document imports
   * @param documentUri Document URI
   * @param cssFileUris Array of CSS file URIs
   */
  registerImports(documentUri: string, cssFileUris: string[]): void;

  /**
   * Get CSS file URIs imported by a document
   * @param documentUri Document URI
   * @returns Set of CSS file URIs
   */
  getDocumentImports(documentUri: string): Set<string>;

  /**
   * Get all CSS classes available to a document
   * @param documentUri Document URI
   * @returns Set of CSS class names
   */
  getClassesForDocument(documentUri: string): Set<string>;

  /**
   * Get all CSS IDs available to a document
   * @param documentUri Document URI
   * @returns Set of CSS ID names
   */
  getIDsForDocument(documentUri: string): Set<string>;

  /**
   * Check if a CSS file has parse errors
   * @param fileUri CSS file URI
   * @returns true if file has errors
   */
  hasErrors(fileUri: string): boolean;

  /**
   * Get parse errors for a CSS file
   * @param fileUri CSS file URI
   * @returns Array of parse errors
   */
  getErrors(fileUri: string): CSSParseError[];
}
```

### New Methods (This Feature)

#### clearDocument

**Purpose**: Clear CSS metadata for a specific document, maintaining shared CSS files if other documents still reference them.

**Signature**:
```typescript
clearDocument(documentUri: string): void
```

**Parameters**:
- `documentUri`: Absolute URI of the document to clear (e.g., `file:///path/to/file.eligian`)

**Returns**: void (no return value)

**Behavior**:
1. Remove document from `documentImports` map
2. For each CSS file imported by the document:
   - Check if any other documents still import it
   - If no references remain, remove CSS file metadata
   - If references remain, keep CSS file metadata (shared)
3. Operation is idempotent (clearing non-existent document is no-op)

**Implementation**:
```typescript
clearDocument(documentUri: string): void {
  const imports = this.documentImports.get(documentUri);

  // Remove document's import registration
  this.documentImports.delete(documentUri);

  if (!imports) {
    return; // Document not registered, nothing to do
  }

  // Check each imported CSS file for lingering references
  for (const cssFileUri of imports) {
    const stillReferenced = Array.from(this.documentImports.values())
      .some(importSet => importSet.has(cssFileUri));

    // If no other documents reference this CSS file, remove it
    if (!stillReferenced) {
      this.cssFiles.delete(cssFileUri);
      this.errors.delete(cssFileUri);
    }
  }
}
```

**Use Cases**:
- Before compiling a document (ensure clean state)
- When document is closed in IDE
- When document no longer imports CSS files

**Example**:
```typescript
const registry = new CSSRegistryService();

// Setup document A with CSS
registry.registerImports('fileA.eligian', ['styles.css']);
registry.updateCSSFile('styles.css', { classes: new Set(['button']), ... });

// Setup document B with same CSS
registry.registerImports('fileB.eligian', ['styles.css']);

// Clear document A
registry.clearDocument('fileA.eligian');

// styles.css still available (fileB references it)
expect(registry.getClassesForDocument('fileB.eligian')).toContain('button');

// Clear document B
registry.clearDocument('fileB.eligian');

// styles.css removed (no references remain)
expect(registry.getClassesForDocument('fileB.eligian')).toEqual(new Set());
```

**Performance**:
- Time Complexity: O(n + m) where n = CSS files imported by document, m = total documents
- Space Complexity: O(1) (no additional allocations)
- Expected Time: < 1ms for typical cases (< 10 CSS files, < 100 documents)

**Thread Safety**: Not thread-safe (single-threaded JavaScript, no concurrent access)

---

#### clearAll

**Purpose**: Reset entire CSS registry state, removing all documents and CSS files.

**Signature**:
```typescript
clearAll(): void
```

**Parameters**: None

**Returns**: void (no return value)

**Behavior**:
1. Clear `documentImports` map (remove all document registrations)
2. Clear `cssFiles` map (remove all CSS file metadata)
3. Clear `errors` map (remove all parse errors)
4. Operation is idempotent (clearing empty registry is no-op)

**Implementation**:
```typescript
clearAll(): void {
  this.documentImports.clear();
  this.cssFiles.clear();
  this.errors.clear();
}
```

**Use Cases**:
- Before test suite runs (ensure clean state)
- When IDE workspace is closed
- When compiler process restarts

**Example**:
```typescript
const registry = new CSSRegistryService();

// Setup multiple documents
registry.registerImports('fileA.eligian', ['styles.css']);
registry.registerImports('fileB.eligian', ['theme.css']);
registry.updateCSSFile('styles.css', { classes: new Set(['button']), ... });
registry.updateCSSFile('theme.css', { classes: new Set(['dark']), ... });

// Verify state
expect(registry.getDocumentImports('fileA.eligian').size).toBeGreaterThan(0);
expect(registry.getDocumentImports('fileB.eligian').size).toBeGreaterThan(0);

// Clear all
registry.clearAll();

// Verify clean state
expect(registry.getDocumentImports('fileA.eligian').size).toBe(0);
expect(registry.getDocumentImports('fileB.eligian').size).toBe(0);
expect(registry.getClassesForDocument('fileA.eligian')).toEqual(new Set());
expect(registry.getClassesForDocument('fileB.eligian')).toEqual(new Set());
```

**Performance**:
- Time Complexity: O(1) (map.clear() is constant time)
- Space Complexity: O(1) (no allocations)
- Expected Time: < 1ms

**Thread Safety**: Not thread-safe (single-threaded JavaScript)

---

## Integration Points

### Compiler Pipeline Integration

The compiler pipeline calls `clearDocument()` before parsing to ensure state isolation:

```typescript
// packages/language/src/compiler/pipeline.ts

export const parseSource = (source: string, uri?: string): Effect.Effect<Program, ParseError> =>
  Effect.gen(function* (_) {
    const services = getOrCreateServices();

    // EXPLICIT STATE RESET before parsing
    if (uri) {
      services.Eligian.css.CSSRegistry.clearDocument(uri);
    }

    // Continue with parsing and CSS loading...
    const document = yield* _(/* parse document */);

    // Load CSS files for this document
    // ...

    // Validate with clean CSS state
    const diagnostics = yield* _(/* validate */);

    return document.parseResult.value;
  });
```

### IDE Language Server Integration

The IDE may call `clearDocument()` when documents are closed or modified:

```typescript
// packages/extension/src/language/main.ts

// Optional: Clear document on close
connection.onDidCloseTextDocument(params => {
  const documentUri = params.textDocument.uri;
  services.Eligian.css.CSSRegistry.clearDocument(documentUri);
});

// Optional: Clear document before re-parsing
connection.onDidChangeTextDocument(async params => {
  const documentUri = params.textDocument.uri;
  services.Eligian.css.CSSRegistry.clearDocument(documentUri);

  // Re-parse and load CSS
  // ...
});
```

**Note**: IDE clearing is **optional** - Langium's document builder already manages document state. The critical integration point is the **compiler**, where state pollution occurs.

---

## State Transition Diagrams

### clearDocument() Behavior

```
Initial State:
documentImports: {
  fileA → {styles.css, theme.css}
  fileB → {styles.css}
}
cssFiles: {
  styles.css → {classes: {button}, ...}
  theme.css → {classes: {dark}, ...}
}

After clearDocument('fileA'):
documentImports: {
  fileB → {styles.css}
}
cssFiles: {
  styles.css → {classes: {button}, ...}  // Kept (fileB references it)
  // theme.css removed (no references)
}

After clearDocument('fileB'):
documentImports: {}
cssFiles: {}  // All CSS files removed (no references)
```

### clearAll() Behavior

```
Initial State:
documentImports: {fileA → {styles.css}, fileB → {theme.css}}
cssFiles: {styles.css → {...}, theme.css → {...}}
errors: {broken.css → [{...}]}

After clearAll():
documentImports: {}
cssFiles: {}
errors: {}
```

---

## Error Handling

**No Exceptions Thrown**:
- Both methods are idempotent and never throw
- Clearing non-existent document/file is no-op
- Invalid URIs are handled gracefully (logged, ignored)

**Validation**:
- Document URIs should be absolute paths or file:// URIs
- No validation enforced (defensive programming - handle any input)

**Logging**:
```typescript
clearDocument(documentUri: string): void {
  if (!documentUri) {
    console.warn('[CSSRegistry] clearDocument called with empty URI');
    return;
  }

  const imports = this.documentImports.get(documentUri);
  // ... continue as normal
}
```

---

## Testing Requirements

### Unit Tests

**clearDocument() Tests**:
```typescript
test('clearDocument removes document imports', () => {
  const registry = new CSSRegistryService();
  registry.registerImports('fileA.eligian', ['styles.css']);

  registry.clearDocument('fileA.eligian');

  expect(registry.getDocumentImports('fileA.eligian').size).toBe(0);
});

test('clearDocument keeps CSS file if other documents reference it', () => {
  const registry = new CSSRegistryService();
  registry.registerImports('fileA.eligian', ['styles.css']);
  registry.registerImports('fileB.eligian', ['styles.css']);
  registry.updateCSSFile('styles.css', { classes: new Set(['button']), ... });

  registry.clearDocument('fileA.eligian');

  // styles.css still available (fileB references it)
  expect(registry.getClassesForDocument('fileB.eligian')).toContain('button');
});

test('clearDocument is idempotent', () => {
  const registry = new CSSRegistryService();

  // Clear non-existent document (should not throw)
  expect(() => registry.clearDocument('nonexistent.eligian')).not.toThrow();

  // Clear twice (should not throw)
  registry.registerImports('fileA.eligian', ['styles.css']);
  registry.clearDocument('fileA.eligian');
  expect(() => registry.clearDocument('fileA.eligian')).not.toThrow();
});
```

**clearAll() Tests**:
```typescript
test('clearAll resets entire registry', () => {
  const registry = new CSSRegistryService();
  registry.registerImports('fileA.eligian', ['styles.css']);
  registry.registerImports('fileB.eligian', ['theme.css']);
  registry.updateCSSFile('styles.css', { classes: new Set(['button']), ... });
  registry.updateCSSFile('theme.css', { classes: new Set(['dark']), ... });

  registry.clearAll();

  expect(registry.getDocumentImports('fileA.eligian').size).toBe(0);
  expect(registry.getDocumentImports('fileB.eligian').size).toBe(0);
  expect(registry.getClassesForDocument('fileA.eligian')).toEqual(new Set());
});

test('clearAll is idempotent', () => {
  const registry = new CSSRegistryService();

  // Clear empty registry (should not throw)
  expect(() => registry.clearAll()).not.toThrow();

  // Clear twice (should not throw)
  registry.clearAll();
  expect(() => registry.clearAll()).not.toThrow();
});
```

### Integration Tests

**State Isolation Tests**:
```typescript
test('sequential compilations are independent', async () => {
  const sourceA = `
    styles "./styles.css"
    timeline "FileA" at 0s {}
  `;

  const sourceB = `
    timeline "FileB" at 0s {
      at 0s selectElement(".button")  // Should error - no CSS imported
    }
  `;

  await compile(sourceA, 'fileA.eligian');
  const errorsB = await compile(sourceB, 'fileB.eligian');

  // fileB should error (doesn't see fileA's CSS)
  expect(errorsB).toContainEqual(
    expect.objectContaining({ message: expect.stringContaining('CSS class') })
  );
});
```

---

## Performance Benchmarks

Expected performance characteristics:

| Operation | Input Size | Expected Time |
|-----------|-----------|---------------|
| `clearDocument()` | 1 document, 1 CSS file | < 0.1ms |
| `clearDocument()` | 1 document, 10 CSS files | < 0.5ms |
| `clearDocument()` | 10 documents referencing same CSS | < 1ms |
| `clearAll()` | 10 documents, 10 CSS files | < 0.1ms |
| `clearAll()` | 100 documents, 100 CSS files | < 1ms |

**Optimization Notes**:
- No file I/O operations (in-memory only)
- Map/Set operations are optimized by V8
- No deep copying (reference cleanup only)

---

## Backwards Compatibility

**No Breaking Changes**:
- New methods added, existing methods unchanged
- Internal state structure unchanged
- No changes to public API surface (besides new methods)

**Migration**:
- No migration needed
- Existing code continues to work
- New methods are opt-in (compiler uses them, IDE may use them)

---

## Dependencies

- **TypeScript**: Map, Set data structures
- **Langium**: No direct dependencies (pure utility methods)
- **Effect-ts**: No dependencies (state management is imperative)

---

## Summary

This API provides explicit state management for CSS registry through two methods:
- `clearDocument(documentUri)`: Clear document-specific state with reference counting
- `clearAll()`: Reset entire registry state

Both methods are idempotent, non-throwing, and performant (< 1ms). The compiler uses `clearDocument()` to ensure compilation isolation, fixing the state pollution bug.
