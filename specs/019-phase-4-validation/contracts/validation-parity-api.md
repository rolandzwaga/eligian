# Validation Parity API Contract

**Feature**: Phase 4 - Validation Pipeline Unification
**Purpose**: Define the interface for comparing IDE and compiler validation results
**Date**: 2025-01-28

## Overview

This API contract defines the functions used to verify that IDE (Langium language server) and Compiler (pipeline) produce identical validation results for the same Eligian source code.

## Type Definitions

### ValidationResult

Normalized validation error/warning representation used for comparison across environments.

```typescript
interface ValidationResult {
  /** Error message text (e.g., "Unknown CSS class: 'invalid'") */
  message: string;

  /** Diagnostic severity level */
  severity: 'error' | 'warning' | 'info';

  /** Source location of the error */
  location: SourceLocation;

  /** Optional error code for categorization */
  code?: string;

  /** Optional actionable hint for fixing the error */
  hint?: string;
}

interface SourceLocation {
  /** File path or URI */
  file?: string;

  /** Line number (0-indexed) */
  line: number;

  /** Column number (0-indexed) */
  column: number;

  /** Length of the error span (optional) */
  length?: number;
}
```

## Function Signatures

### getIDEValidationErrors

Gets validation errors from the IDE path (Langium language server).

**Signature**:
```typescript
function getIDEValidationErrors(
  source: string,
  uri?: string
): Promise<ValidationResult[]>
```

**Parameters**:
- `source`: Eligian DSL source code to validate
- `uri`: Optional document URI (defaults to generated memory URI)

**Returns**: Promise resolving to array of normalized validation results

**Implementation Strategy**:
```typescript
async function getIDEValidationErrors(source: string, uri?: string): Promise<ValidationResult[]> {
  const services = createEligianServices(EmptyFileSystem);
  const documentUri = uri || `file:///memory/test-${Date.now()}.eligian`;

  // Create document from source
  const document = services.shared.workspace.LangiumDocumentFactory.fromString(
    source,
    URI.parse(documentUri)
  );

  // Build with validation enabled
  await services.shared.workspace.DocumentBuilder.build([document], {
    validation: true
  });

  // Extract diagnostics
  const diagnostics = document.diagnostics || [];

  // Normalize to ValidationResult format
  return diagnostics.map(normalizeLangiumDiagnostic);
}
```

**Error Handling**:
- Parse errors are included in diagnostics
- Langium errors are caught and converted to ValidationResult
- Empty array returned if no errors

**Performance**:
- Expected: < 100ms for typical files
- Timeout: 2 seconds (configurable)

---

### getCompilerValidationErrors

Gets validation errors from the compiler path (pipeline).

**Signature**:
```typescript
function getCompilerValidationErrors(
  source: string,
  uri?: string
): Promise<ValidationResult[]>
```

**Parameters**:
- `source`: Eligian DSL source code to validate
- `uri`: Optional document URI (defaults to generated memory URI)

**Returns**: Promise resolving to array of normalized validation results

**Implementation Strategy**:
```typescript
async function getCompilerValidationErrors(source: string, uri?: string): Promise<ValidationResult[]> {
  const documentUri = uri || `file:///memory/test-${Date.now()}.eligian`;

  // Call compiler's parseSource function
  const result = await Effect.runPromise(
    parseSource(source, documentUri).pipe(
      Effect.mapError(error => [normalizeCompilerError(error)]),
      Effect.map(() => [] as ValidationResult[]),
      Effect.catchAll(errors => Effect.succeed(errors))
    )
  );

  return result;
}
```

**Error Handling**:
- Parse errors converted to ValidationResult
- Validation errors converted to ValidationResult
- Effect errors caught and normalized
- Empty array returned if no errors

**Performance**:
- Expected: < 100ms for typical files
- Timeout: 2 seconds (configurable)

---

### compareValidationResults

Compares two arrays of validation results for equality.

**Signature**:
```typescript
function compareValidationResults(
  ideResults: ValidationResult[],
  compilerResults: ValidationResult[]
): boolean
```

**Parameters**:
- `ideResults`: Validation results from IDE path
- `compilerResults`: Validation results from compiler path

**Returns**: `true` if results are identical, `false` otherwise

**Comparison Strategy**:
```typescript
function compareValidationResults(
  ideResults: ValidationResult[],
  compilerResults: ValidationResult[]
): boolean {
  // Different lengths = not equal
  if (ideResults.length !== compilerResults.length) {
    return false;
  }

  // Sort by location for consistent comparison
  const sortByLocation = (a: ValidationResult, b: ValidationResult) => {
    if (a.location.line !== b.location.line) {
      return a.location.line - b.location.line;
    }
    return a.location.column - b.location.column;
  };

  const sortedIDE = [...ideResults].sort(sortByLocation);
  const sortedCompiler = [...compilerResults].sort(sortByLocation);

  // Deep equality check
  for (let i = 0; i < sortedIDE.length; i++) {
    if (!isEqual(sortedIDE[i], sortedCompiler[i])) {
      return false;
    }
  }

  return true;
}

function isEqual(a: ValidationResult, b: ValidationResult): boolean {
  return (
    a.message === b.message &&
    a.severity === b.severity &&
    a.location.line === b.location.line &&
    a.location.column === b.location.column &&
    a.location.length === b.location.length &&
    a.location.file === b.location.file &&
    a.code === b.code &&
    a.hint === b.hint
  );
}
```

**Equality Rules**:
- Message must match exactly
- Severity must match exactly
- Location (line, column, length, file) must match exactly
- Code must match (undefined == undefined)
- Hint must match (undefined == undefined)
- Results are sorted by location before comparison (order doesn't matter)

**Edge Cases**:
- Empty arrays: Returns `true` (both have no errors)
- Different error counts: Returns `false` immediately
- Same errors, different order: Returns `true` (sorted before comparison)
- Undefined vs null: Treats as equal (both falsy)

---

## Helper Functions

### normalizeLangiumDiagnostic

Converts Langium Diagnostic to ValidationResult.

**Signature**:
```typescript
function normalizeLangiumDiagnostic(diagnostic: Diagnostic): ValidationResult
```

**Implementation**:
```typescript
function normalizeLangiumDiagnostic(diagnostic: Diagnostic): ValidationResult {
  const severityMap: Record<number, 'error' | 'warning' | 'info'> = {
    1: 'error',
    2: 'warning',
    3: 'info',
    4: 'info'
  };

  return {
    message: diagnostic.message,
    severity: severityMap[diagnostic.severity] || 'error',
    location: {
      file: diagnostic.uri,
      line: diagnostic.range.start.line,
      column: diagnostic.range.start.character,
      length: diagnostic.range.end.character - diagnostic.range.start.character
    },
    code: diagnostic.code as string | undefined,
    hint: diagnostic.data?.hint
  };
}
```

---

### normalizeCompilerError

Converts compiler error (ParseError | ValidationError) to ValidationResult.

**Signature**:
```typescript
function normalizeCompilerError(error: ParseError | ValidationError | TypeError): ValidationResult
```

**Implementation**:
```typescript
function normalizeCompilerError(error: CompilerError): ValidationResult {
  return {
    message: error.message,
    severity: 'error',
    location: error.location,
    code: error._tag,
    hint: error.hint
  };
}
```

---

## Usage Example

```typescript
import { describe, test, expect } from 'vitest';
import { getIDEValidationErrors, getCompilerValidationErrors, compareValidationResults } from './parity-helpers.js';

describe('IDE and Compiler Validation Parity', () => {
  test('CSS class validation produces identical errors', async () => {
    const source = `
      styles "./test.css"
      timeline "Test" at 0s {
        at 0s selectElement(".invalid-class")
      }
    `;

    const ideErrors = await getIDEValidationErrors(source);
    const compilerErrors = await getCompilerValidationErrors(source);

    // Verify both produce errors
    expect(ideErrors.length).toBeGreaterThan(0);
    expect(compilerErrors.length).toBeGreaterThan(0);

    // Verify errors are identical
    expect(compareValidationResults(ideErrors, compilerErrors)).toBe(true);
  });

  test('valid code produces no errors in both environments', async () => {
    const source = `
      styles "./test.css"
      timeline "Test" at 0s {
        at 0s selectElement(".button")
      }
    `;

    const ideErrors = await getIDEValidationErrors(source);
    const compilerErrors = await getCompilerValidationErrors(source);

    // Both should have zero errors
    expect(ideErrors).toEqual([]);
    expect(compilerErrors).toEqual([]);

    // Empty arrays are equal
    expect(compareValidationResults(ideErrors, compilerErrors)).toBe(true);
  });
});
```

## Test Coverage Requirements

**Unit Tests**:
- `normalizeLangiumDiagnostic()` handles all severity levels ✅
- `normalizeCompilerError()` handles all error types ✅
- `compareValidationResults()` handles empty arrays ✅
- `compareValidationResults()` handles different lengths ✅
- `compareValidationResults()` handles different order ✅
- `isEqual()` handles undefined fields ✅

**Integration Tests**:
- Parse errors produce identical results ✅
- Validation errors produce identical results ✅
- CSS errors produce identical results ✅
- Asset errors produce identical results ✅
- Valid code produces no errors in both ✅

## Performance Characteristics

| Function | Expected Time | Timeout |
|----------|--------------|---------|
| `getIDEValidationErrors()` | < 100ms | 2s |
| `getCompilerValidationErrors()` | < 100ms | 2s |
| `compareValidationResults()` | < 10ms | N/A |

**Optimization Notes**:
- Sorting is O(n log n) where n = number of errors (typically < 50)
- Deep equality is O(n) where n = number of errors
- No DOM manipulation or file I/O in comparison
- Results can be cached per source string for repeated tests

## Dependencies

- **Langium**: `LangiumDocumentFactory`, `DocumentBuilder`, `Diagnostic`
- **Effect-ts**: `Effect.runPromise()`, error handling
- **Compiler**: `parseSource()` from `packages/language/src/compiler/pipeline.ts`
- **Error Types**: Unified error namespace from `@eligian/language/errors`

## Backwards Compatibility

- **No Breaking Changes**: This is a new testing API, no existing code affected
- **Additive**: Functions added to test helpers, not exported in public API
- **Internal Use**: Only used by parity test suite, not exposed to users
