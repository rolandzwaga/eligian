# Data Model: Phase 4 - Validation Pipeline Unification

**Feature**: Phase 4 - Validation Pipeline Unification
**Date**: 2025-01-28
**Purpose**: Define entities, state management, and data structures for validation parity

## Overview

This feature introduces explicit state management for CSS registry and validation result comparison. The data model focuses on three key concerns:
1. **ValidationResult**: Normalized error/warning representation for comparison
2. **CSSRegistryState**: Document-scoped CSS metadata with explicit state clearing
3. **LangiumServiceInstance**: Shared services with documented stateful components

## Entity Definitions

### ValidationResult

**Purpose**: Represents a single validation error or warning from either IDE or compiler, normalized for comparison.

**Attributes**:
| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| message | string | Yes | Error message text (e.g., "Unknown CSS class: 'invalid'") |
| severity | 'error' \| 'warning' \| 'info' | Yes | Diagnostic severity level |
| location | SourceLocation | Yes | File, line, column, and length of the error |
| code | string | No | Error code for categorization (e.g., 'unknown_css_class') |
| hint | string | No | Actionable hint for fixing the error |

**Relationships**:
- Maps to Langium `Diagnostic` in IDE path
- Maps to compiler `ParseError | ValidationError` in compiler path

**Usage**:
```typescript
interface ValidationResult {
  message: string;
  severity: 'error' | 'warning' | 'info';
  location: SourceLocation;
  code?: string;
  hint?: string;
}

// Normalize Langium diagnostic
function normalizeLangiumDiagnostic(diagnostic: Diagnostic): ValidationResult {
  return {
    message: diagnostic.message,
    severity: diagnostic.severity === 1 ? 'error' : diagnostic.severity === 2 ? 'warning' : 'info',
    location: {
      file: diagnostic.uri,
      line: diagnostic.range.start.line,
      column: diagnostic.range.start.character,
      length: diagnostic.range.end.character - diagnostic.range.start.character
    },
    code: diagnostic.code as string,
    hint: diagnostic.data?.hint
  };
}

// Normalize compiler error
function normalizeCompilerError(error: ParseError | ValidationError): ValidationResult {
  return {
    message: error.message,
    severity: 'error',
    location: error.location,
    code: error._tag,
    hint: error.hint
  };
}
```

**Validation Rules**:
- Message must be non-empty
- Severity must be one of: 'error', 'warning', 'info'
- Location must have valid line/column numbers (>= 0)

---

### CSSRegistryState

**Purpose**: Tracks CSS metadata per document for validation, with explicit state management for compilation isolation.

**Attributes**:
| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| documentUri | string | Yes | Document URI (e.g., "file:///path/to/file.eligian") |
| cssFiles | Map<string, CSSParseResult> | Yes | CSS file URI → parsed metadata (classes, IDs, rules) |
| classes | Set<string> | Yes | All CSS classes available to this document |
| ids | Set<string> | Yes | All CSS IDs available to this document |
| errors | Map<string, CSSParseError[]> | Yes | CSS file URI → parse errors (if any) |

**Relationships**:
- One document can import multiple CSS files
- Multiple documents can import the same CSS file
- CSS file metadata shared across documents (performance optimization)

**State Management Operations**:
| Operation | Parameters | Returns | Description |
|-----------|-----------|---------|-------------|
| registerImports | documentUri: string, cssFileUris: string[] | void | Register which CSS files a document imports |
| getDocumentImports | documentUri: string | Set<string> | Get CSS file URIs imported by a document |
| getClassesForDocument | documentUri: string | Set<string> | Get all CSS classes available to a document |
| getIDsForDocument | documentUri: string | Set<string> | Get all CSS IDs available to a document |
| clearDocument | documentUri: string | void | **NEW**: Remove document-specific state |
| clearAll | | void | **NEW**: Reset entire registry state |

**Usage**:
```typescript
class CSSRegistryService {
  private documentImports: Map<string, Set<string>> = new Map();
  private cssFiles: Map<string, CSSParseResult> = new Map();
  private errors: Map<string, CSSParseError[]> = new Map();

  /**
   * Clear CSS metadata for a specific document
   * Removes document's CSS imports but keeps CSS file metadata
   * if other documents still reference it
   */
  clearDocument(documentUri: string): void {
    const imports = this.documentImports.get(documentUri);
    this.documentImports.delete(documentUri);

    // If no other documents import these CSS files, remove them
    if (imports) {
      for (const cssFileUri of imports) {
        const stillReferenced = Array.from(this.documentImports.values())
          .some(set => set.has(cssFileUri));
        if (!stillReferenced) {
          this.cssFiles.delete(cssFileUri);
          this.errors.delete(cssFileUri);
        }
      }
    }
  }

  /**
   * Reset entire CSS registry state
   * Removes all documents, CSS files, classes, and IDs
   * Use for complete state isolation between test runs
   */
  clearAll(): void {
    this.documentImports.clear();
    this.cssFiles.clear();
    this.errors.clear();
  }
}
```

**State Transition Diagram**:
```
[Empty Registry]
    ↓ registerImports(doc1, [css1, css2])
[doc1 → {css1, css2}]
    ↓ registerImports(doc2, [css1])
[doc1 → {css1, css2}, doc2 → {css1}]
    ↓ clearDocument(doc1)
[doc2 → {css1}]  (css2 removed, css1 kept)
    ↓ clearAll()
[Empty Registry]
```

**Validation Rules**:
- Document URI must be absolute path or file:// URI
- CSS file URIs must be absolute paths
- Clearing non-existent document is a no-op (idempotent)

---

### LangiumServiceInstance

**Purpose**: Represents the shared Langium services (parser, validator, workspace) with documented stateful components.

**Stateful Components**:
| Component | Type | State Managed | Clearing Strategy |
|-----------|------|---------------|-------------------|
| CSSRegistry | CSSRegistryService | CSS file metadata per document | Call `clearDocument(uri)` before each compilation |
| DocumentCache | LangiumDocuments | Parsed ASTs and validation results | Managed by Langium (implicit clearing) |
| WorkspaceManager | WorkspaceManager | Document index and cross-references | Managed by Langium (implicit clearing) |

**Service Structure**:
```typescript
interface LangiumServiceInstance {
  shared: {
    workspace: {
      LangiumDocuments: LangiumDocuments;       // Document cache (stateful)
      WorkspaceManager: WorkspaceManager;       // Workspace index (stateful)
      DocumentBuilder: DocumentBuilder;         // Build orchestrator
    };
  };
  Eligian: {
    css: {
      CSSRegistry: CSSRegistryService;          // CSS metadata (stateful - requires explicit clearing)
    };
    validation: {
      DocumentValidator: DocumentValidator;     // Validator (stateless)
      ValidationRegistry: ValidationRegistry;   // Validation rules (stateless)
    };
  };
}
```

**State Management Strategy**:
```typescript
// Compiler pipeline - explicit state reset
export const parseSource = (source: string, uri?: string): Effect.Effect<Program, ParseError> =>
  Effect.gen(function* (_) {
    const services = getOrCreateServices();

    // EXPLICIT STATE RESET before parsing
    if (uri) {
      services.Eligian.css.CSSRegistry.clearDocument(uri);
    }

    // Langium manages its own document cache clearing
    // We only need to manage CSS registry state

    // Continue with parsing...
  });

// IDE path - state managed by Langium lifecycle
// No explicit clearing needed (document builder handles it)
```

**Rationale for Singleton with State Reset**:
- Creating fresh Langium service is expensive (~50ms initialization)
- Singleton amortizes initialization cost across compilations
- Explicit state reset provides isolation without performance penalty
- Only CSS registry requires manual clearing (Langium manages other state)

---

## Data Flow Diagrams

### CSS Loading and Validation Flow (BEFORE - Race Condition)

```
Compiler Path:
┌─────────────┐
│ parseSource │
└──────┬──────┘
       │
       ├──> Load CSS files (SYNC)
       │    └──> cssRegistry.updateCSSFile()
       │
       └──> Validate document
            └──> checkClassNameParameter() ✓ (CSS already loaded)

IDE Path:
┌─────────────────┐
│ DocumentBuilder │
└────────┬────────┘
         │
         ├──> Build document (parse)
         │
         ├──> Validate document
         │    └──> checkClassNameParameter() ✗ (CSS not loaded yet!)
         │
         └──> onBuildPhase(Parsed) - Load CSS files (ASYNC)
              └──> cssRegistry.updateCSSFile()

Result: IDE shows CSS errors, compiler doesn't (race condition)
```

### CSS Loading and Validation Flow (AFTER - Synchronized)

```
Compiler Path:
┌─────────────┐
│ parseSource │
└──────┬──────┘
       │
       ├──> clearDocument(uri) [STATE RESET]
       │
       ├──> Load CSS files (SYNC)
       │    └──> cssRegistry.updateCSSFile()
       │
       └──> Validate document
            └──> checkClassNameParameter() ✓ (CSS already loaded)

IDE Path:
┌─────────────────┐
│ DocumentBuilder │
└────────┬────────┘
         │
         ├──> Build document (parse)
         │
         ├──> onBuildPhase(Parsed) - Load CSS files (ASYNC)
         │    └──> cssRegistry.updateCSSFile()
         │    └──> AWAIT completion [SYNCHRONIZATION BARRIER]
         │
         └──> Validate document
              └──> checkClassNameParameter() ✓ (CSS already loaded)

Result: Both show identical CSS errors (synchronized)
```

### State Isolation Flow (Sequential Compilations)

```
Compilation A (with CSS):
┌─────────────┐
│ parseSource │
│ (fileA.eli) │
└──────┬──────┘
       │
       ├──> clearDocument(fileA) [CLEAN STATE]
       ├──> Load fileA CSS (styles.css)
       ├──> Validate fileA ✓
       └──> Registry State: { fileA → {styles.css} }

Compilation B (no CSS):
┌─────────────┐
│ parseSource │
│ (fileB.eli) │
└──────┬──────┘
       │
       ├──> clearDocument(fileB) [CLEAN STATE]
       │    └──> Removes fileA CSS (not referenced by fileB)
       ├──> Validate fileB ✓
       └──> Registry State: {} (empty)

Result: fileB doesn't see fileA's CSS classes (isolated)
```

## API Contracts

See detailed API contracts in [contracts/](./contracts/) directory:
- [validation-parity-api.md](./contracts/validation-parity-api.md) - Validation result comparison API
- [css-registry-state-api.md](./contracts/css-registry-state-api.md) - CSS registry state management API

## Testing Considerations

### Unit Test Data Fixtures

**ValidationResult Comparison**:
```typescript
const ideError: ValidationResult = {
  message: "Unknown CSS class: 'invalid'",
  severity: 'error',
  location: { file: 'test.eligian', line: 5, column: 20, length: 7 },
  code: 'unknown_css_class',
  hint: "Did you mean: 'valid'?"
};

const compilerError: ValidationResult = {
  message: "Unknown CSS class: 'invalid'",
  severity: 'error',
  location: { file: 'test.eligian', line: 5, column: 20, length: 7 },
  code: 'unknown_css_class',
  hint: "Did you mean: 'valid'?"
};

// Deep equality check
expect(compareValidationResults([ideError], [compilerError])).toBe(true);
```

**CSS Registry State Isolation**:
```typescript
const registry = new CSSRegistryService();

// Setup fileA with CSS
registry.registerImports('fileA.eligian', ['styles.css']);
registry.updateCSSFile('styles.css', { classes: new Set(['button']), ids: new Set() });

// Clear fileA
registry.clearDocument('fileA.eligian');

// Verify styles.css removed
expect(registry.getClassesForDocument('fileA.eligian')).toEqual(new Set());
```

### Integration Test Scenarios

**Scenario 1: CSS Validation Parity**
- Input: `.eligian` file with invalid CSS class reference
- Expected IDE Output: Error at line 5, column 20
- Expected Compiler Output: Error at line 5, column 20
- Verification: Both outputs match exactly

**Scenario 2: Sequential Compilation Isolation**
- Input: Compile fileA (with CSS), then fileB (no CSS)
- Expected: fileB validation doesn't see fileA CSS classes
- Verification: fileB errors don't reference fileA classes

**Scenario 3: Repeated Compilation Determinism**
- Input: Compile fileA twice
- Expected: Both compilations produce identical results
- Verification: Validation results match exactly

## Implementation Notes

### Performance Characteristics

**CSSRegistryService State Operations**:
- `clearDocument()`: O(n) where n = number of CSS files imported by document
- `clearAll()`: O(1) (clears maps/sets)
- Memory overhead: Negligible (< 1KB per document)
- State reset overhead: < 1ms per compilation

**ValidationResult Comparison**:
- Comparison: O(n) where n = number of validation errors
- Normalization: O(1) per error
- Memory overhead: Negligible (temporary objects)

### Edge Cases

**Edge Case 1: Multiple Documents Importing Same CSS**
- Scenario: doc1 and doc2 both import styles.css
- Expected: Clearing doc1 doesn't remove styles.css (doc2 still needs it)
- Implementation: Reference counting in `clearDocument()`

**Edge Case 2: Clearing Non-Existent Document**
- Scenario: `clearDocument('nonexistent.eligian')`
- Expected: No error, operation is idempotent
- Implementation: Check existence before clearing

**Edge Case 3: CSS File Parse Errors**
- Scenario: Imported CSS file has syntax errors
- Expected: Error shown at import statement, not at every CSS class usage
- Implementation: Validation checks `hasErrors(cssFileUri)` before class validation

## Migration Notes

**No Breaking Changes**:
- All changes are additive (new methods) or internal (state management)
- Existing API surface unchanged
- Backwards compatible with existing `.eligian` files

**Deprecation Strategy**:
- `compiler/types/errors.ts` deleted (Feature 018 cleanup)
- All imports updated to `@eligian/language/errors`
- No runtime deprecation warnings needed (compile-time only)

## Summary

This data model provides:
1. **Normalized validation results** for cross-environment comparison
2. **Explicit CSS registry state management** for compilation isolation
3. **Documented Langium service state** for clear understanding of stateful components

All changes maintain backwards compatibility while fixing the root causes of validation inconsistencies.
