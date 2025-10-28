# Research: Error Type Unification

**Date**: 2025-01-28
**Purpose**: Analyze existing error type hierarchies across packages to design unified error namespace

## Executive Summary

The Eligian codebase contains **7 error type hierarchies** across 5 packages (3 in language package, 1 in shared-utils, 2 in extension, 1 deprecated). These hierarchies overlap significantly:

- **3 SourceLocation definitions** (compiler, asset-loading, CSS parser)
- **2 File I/O error sets** (shared-utils unified ✅, extension deprecated)
- **3 Asset validation patterns** (HTML, CSS, media - inconsistent structures)
- **Inconsistent discriminants**: Some use `_tag`, others `code` or `type`

**Recommendation**: Consolidate into single namespace at `@eligian/language/src/errors/` using discriminated unions (TypeScript best practice), re-export shared-utils IOError types, and provide type guards + formatters for all error categories.

## Analysis Methodology

**Research Steps**:
1. Grep codebase for error type definitions: `class \w+Error|interface \w+Error|type \w+Error`
2. Read each error definition file to extract structure
3. Map error types by purpose and usage context
4. Identify overlap and inconsistencies
5. Evaluate best practices from existing implementations

**Sources Analyzed**: 7 error hierarchies across 51 files

## Detailed Analysis

### 1. Compiler Errors (packages/language/src/compiler/types/errors.ts)

**Purpose**: Compilation pipeline errors from parsing through emission

**Implementation Pattern**: ✅ Excellent - serves as template for unification

```typescript
// Union of all compilation errors
export type CompileError =
  | ParseError
  | ValidationError
  | TypeError
  | TransformError
  | OptimizationError
  | EmitError;

// Discriminated union example
export type ParseError = {
  readonly _tag: 'ParseError';          // Discriminant for pattern matching
  readonly message: string;
  readonly location: SourceLocation;
  readonly expected?: string;           // Parser-specific context
  readonly actual?: string;
};
```

**Error Types**:
- `ParseError` - Syntax errors from Langium parser
- `ValidationError` - Semantic validation (13 kinds: UndefinedReference, DuplicateDefinition, etc.)
- `TypeError` - Type checking failures
- `TransformError` - AST → IR transformation (6 kinds: UnknownNode, InvalidTimeline, etc.)
- `OptimizationError` - Optimization pass failures
- `EmitError` - IR → JSON emission failures

**Fields by Type**:
| Type | `_tag` | `message` | `location` | Other Fields |
|------|--------|-----------|------------|--------------|
| ParseError | ✅ | ✅ | ✅ | `expected`, `actual` |
| ValidationError | ✅ | ✅ | ✅ | `kind`, `hint` |
| TypeError | ✅ | ✅ | ✅ | `expected`, `actual`, `hint` |
| TransformError | ✅ | ✅ | ✅ | `kind`, `astNode` |
| OptimizationError | ✅ | ✅ | ❌ | `pass`, `hint` |
| EmitError | ✅ | ✅ | ❌ | `ir`, `hint` |

**Constructor Pattern**:
```typescript
export const createParseError = (
  message: string,
  location: SourceLocation,
  expected?: string,
  actual?: string
): ParseError => ({
  _tag: 'ParseError',
  message,
  location,
  expected,
  actual,
});
```

**Strengths**:
- Discriminated unions enable exhaustive type checking
- Constructor functions ensure consistent error creation
- Readonly fields prevent accidental mutation
- Clear separation by pipeline stage

**Weaknesses**:
- No type guards provided (consumers must check `_tag` manually)
- No error formatting utilities
- Optimization/Emit errors lack location (acceptable for their context)

**Usage Context**:
- Effect.fail() in compilation pipeline
- Langium validator error reporting
- CLI error display

### 2. Asset Loading Errors (packages/language/src/asset-loading/types.ts)

**Purpose**: Asset validation errors for HTML, CSS, and media files

**Implementation Pattern**: ⚠️ Needs Refactoring - uses interfaces instead of discriminated unions

```typescript
export interface AssetError {
  type: 'missing-file' | 'invalid-html' | 'invalid-css' | 'load-error';  // NOT _tag!
  filePath: string;        // Relative path
  absolutePath: string;    // Resolved absolute path
  sourceLocation: SourceLocation;  // DUPLICATE definition
  message: string;
  hint: string;
  details?: string;
}

export interface HtmlValidationError {
  message: string;
  line: number;
  column: number;
  hint: string;
}

export interface CssValidationError {  // Nearly identical to HtmlValidationError
  message: string;
  line: number;
  column: number;
  hint: string;
}

export interface MediaValidationError {
  message: string;
  absolutePath: string;
  hint: string;
}
```

**Issues**:
1. `AssetError.type` field (not `_tag`) - inconsistent with compiler errors
2. Separate `SourceLocation` definition duplicates compiler's
3. `HtmlValidationError` and `CssValidationError` are identical (could be unified)
4. No discriminated union (can't use type guards)
5. `MediaValidationError` lacks location info (inconsistent)

**Strengths**:
- Clear field naming (`filePath` vs `absolutePath`)
- Includes `hint` for actionable error messages
- Validation result types (`HtmlValidationResult`, etc.)

**Usage Context**:
- Asset type validator in Langium validator
- Import statement validation

### 3. Import Validation Errors (packages/language/src/validators/validation-errors.ts)

**Purpose**: Import statement validation (path format, name conflicts, type inference)

**Implementation Pattern**: ⚠️ Needs Refactoring - uses `code` instead of `_tag`

```typescript
export interface ImportValidationError {
  code: string;          // NOT _tag!
  message: string;
  hint: string;
}

export interface PathError extends ImportValidationError {
  code: 'ABSOLUTE_PATH' | 'INVALID_PATH_FORMAT';
}

export interface ImportNameError extends ImportValidationError {
  code: 'DUPLICATE_IMPORT_NAME' | 'RESERVED_KEYWORD' | 'OPERATION_NAME_CONFLICT';
}

export interface TypeInferenceError extends ImportValidationError {
  code: 'UNKNOWN_EXTENSION' | 'AMBIGUOUS_EXTENSION';
  extension: string;
}

export interface DuplicateDefaultImportError extends ImportValidationError {
  code: 'DUPLICATE_DEFAULT_IMPORT';
  importType: 'layout' | 'styles' | 'provider';
}
```

**Error Message Templates** (✅ Good Pattern):
```typescript
export const ERROR_MESSAGES = {
  ABSOLUTE_PATH: {
    message: "Import path must be relative...",
    hint: "Use './filename.ext' or '../folder/filename.ext'..."
  },
  DUPLICATE_IMPORT_NAME: (name: string) => ({
    message: `Duplicate import name '${name}'...`,
    hint: 'Choose a different name...'
  }),
  // ... more templates
};
```

**Issues**:
1. Uses `code` field instead of `_tag` (can't use TypeScript discriminated unions)
2. Interface inheritance (not union types) - less composable
3. No location information (where in source file?)

**Strengths**:
- ERROR_MESSAGES template pattern is excellent (reusable, consistent)
- Clear error categories
- Contextual fields (extension, importType)

**Recommendation**: Convert to discriminated unions, preserve ERROR_MESSAGES pattern

### 4. Extension CSS Loader Errors (packages/extension/src/extension/css-loader.ts)

**Status**: ✅ **DEPRECATED in Phase 2**

**Previous Implementation** (Phase 1):
```typescript
export class FileNotFoundError extends Error {
  constructor(public path: string, message?: string) {
    super(message || `File not found: ${path}`);
    this.name = 'FileNotFoundError';
  }
}
// + PermissionError, ReadError classes
```

**Phase 2 Migration**:
```typescript
// NOW USES: @eligian/shared-utils/errors
import {
  type FileNotFoundError,
  type PermissionError,
  type ReadError,
  isFileNotFoundError,
  isPermissionError,
  isReadError,
} from '@eligian/shared-utils';
```

**Lesson Learned**: Class-based errors migrated to discriminated unions successfully. Extension code simplified from ~180 lines to ~90 lines (50% reduction).

### 5. Extension Compilation Errors (packages/extension/src/extension/preview/CompilationService.ts)

**Purpose**: Wrapper for compiler errors in VS Code extension

**Implementation Pattern**: ⚠️ Simplified interface loses context

```typescript
export interface CompilationError {
  message: string;
  line?: number;        // Flattened from SourceLocation
  column?: number;      // Flattened from SourceLocation
  length?: number;
  code?: string;
  severity: 'error' | 'warning';
}

export interface CompilationResult {
  success: boolean;
  config: IEngineConfiguration | null;
  errors: CompilationError[];
  timestamp: number;
}
```

**Error Conversion** (from compiler errors):
```typescript
private convertCompilerError(error: unknown): CompilationError[] {
  if (error && typeof error === 'object' && '_tag' in error) {
    const compileError = error as CompileError;
    return [{
      message: compileError.message || 'Compilation failed',
      line: 'location' in compileError ? compileError.location?.line : undefined,
      column: 'location' in compileError ? compileError.location?.column : undefined,
      code: compileError._tag,
      severity: 'error',
    }];
  }
  // ... fallback
}
```

**Issues**:
1. Loses error type information (all become `CompilationError`)
2. Loses hint and other contextual fields
3. Manual conversion logic (error-prone)

**Strengths**:
- Simplified for VS Code diagnostics
- Includes timestamp for cache invalidation

**Recommendation**: Use unified error formatters instead of manual conversion

### 6. CSS Parse Errors (packages/language/src/css/css-parser.ts)

**Purpose**: CSS syntax errors from PostCSS parser

**Implementation Pattern**: ⚠️ Interface embedded in result type

```typescript
export interface CSSParseError {
  message: string;
  filePath: string;
  line: number;
  column: number;
  source?: string;    // Source snippet
}

export interface CSSSourceLocation {  // DUPLICATE definition
  filePath: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export interface CSSParseResult {
  classes: Set<string>;
  ids: Set<string>;
  classLocations: Map<string, CSSSourceLocation>;
  idLocations: Map<string, CSSSourceLocation>;
  classRules: Map<string, string>;
  idRules: Map<string, string>;
  errors: CSSParseError[];  // Embedded in result
}
```

**Issues**:
1. `CSSSourceLocation` duplicates `SourceLocation` concept (different field names)
2. Not a discriminated union (can't pattern match)
3. Embedded in `CSSParseResult` (not standalone error type)

**Strengths**:
- Includes source snippet for display
- Clear field naming

**Recommendation**: Use unified `SourceLocation`, make `CSSParseError` a discriminated union

### 7. Shared Utils IOError (packages/shared-utils/src/errors.ts - Phase 1)

**Status**: ✅ **Already Unified in Phase 1**

**Implementation Pattern**: ✅ Excellent - serves as template

```typescript
export interface FileNotFoundError {
  readonly _tag: 'FileNotFoundError';  // Discriminated union
  readonly path: string;
  readonly message: string;
  readonly hint?: string;
}

export interface PermissionError {
  readonly _tag: 'PermissionError';
  readonly path: string;
  readonly message: string;
  readonly hint?: string;
}

export interface ReadError {
  readonly _tag: 'ReadError';
  readonly path: string;
  readonly message: string;
  readonly cause?: unknown;
  readonly hint?: string;
}

export interface SecurityError {
  readonly _tag: 'SecurityError';
  readonly path: string;
  readonly projectRoot: string;
  readonly message: string;
  readonly hint?: string;
}

export type FileOperationError = FileNotFoundError | PermissionError | ReadError | SecurityError;
```

**Type Guards** (✅ Excellent Pattern):
```typescript
export function isFileNotFoundError(error: unknown): error is FileNotFoundError {
  return (
    typeof error === 'object' &&
    error !== null &&
    '_tag' in error &&
    error._tag === 'FileNotFoundError'
  );
}
// + isPermissionError, isReadError, isSecurityError
```

**Constructor Functions** (✅ Excellent Pattern):
```typescript
export function createFileNotFoundError(path: string): FileNotFoundError {
  return {
    _tag: 'FileNotFoundError',
    path,
    message: `File not found: ${path}`,
    hint: 'Check that the file exists and the path is correct',
  };
}
// + createPermissionError, createReadError, createSecurityError
```

**Strengths**:
- Discriminated unions with `_tag` field
- Type guards for runtime checking
- Constructor functions ensure consistency
- Readonly fields prevent mutation
- Clear error messages with actionable hints

**Usage**: File loading in html-import-utils, node-asset-loader, extension/css-loader (Phase 2)

**Recommendation**: Re-export from language package for convenience

## Overlap Matrix

| Error Type | Compiler | Asset Loading | Validators | CSS Parser | Shared Utils | Extension |
|------------|----------|---------------|------------|------------|--------------|-----------|
| SourceLocation | ✅ | ✅ (dup) | ❌ | ✅ (dup) | ❌ | ❌ |
| File I/O Errors | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ (dep) |
| HTML Validation | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| CSS Validation | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ |
| Media Validation | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Import Errors | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Compilation Wrapper | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

## Inconsistencies Identified

### 1. Discriminant Field Names
- **Compiler**: `_tag` (TypeScript best practice) ✅
- **Asset Loading**: `type` (not standard)
- **Validators**: `code` (not standard)
- **Shared Utils**: `_tag` ✅

**Decision**: Standardize on `_tag` (TypeScript discriminated union convention)

### 2. Location Field Structures
- **Compiler**: `SourceLocation` with `file`, `line`, `column`, optional `length`
- **Asset Loading**: Duplicate `SourceLocation` definition
- **CSS Parser**: `CSSSourceLocation` with `startLine`, `startColumn`, `endLine`, `endColumn`
- **Validators**: No location field

**Decision**: Use compiler's `SourceLocation`, extend if range needed

### 3. Error Message Patterns
- **Validators**: ERROR_MESSAGES template object ✅ (good pattern)
- **Shared Utils**: Constructor functions with inline messages ✅ (good pattern)
- **Others**: Inline message strings (harder to maintain)

**Decision**: Use constructor functions + optional message templates

### 4. Hint Field Presence
- **Compiler**: Some error types have `hint`, others don't
- **Asset Loading**: All have `hint` ✅
- **Validators**: All have `hint` ✅
- **Shared Utils**: All have optional `hint` ✅

**Decision**: All errors should have optional `hint` field

## Best Practices Identified

### From Shared Utils (Phase 1):
1. **Discriminated unions** with `_tag` field
2. **Type guards** for runtime checking
3. **Constructor functions** for consistency
4. **Readonly fields** prevent mutation
5. **Clear hints** make errors actionable

### From Compiler Errors:
1. **Union types** group related errors
2. **Kind enums** for subtypes (ValidationErrorKind, TransformErrorKind)
3. **Context fields** (expected/actual, astNode, pass, ir)
4. **Separation by concern** (parsing, validation, transformation)

### From Validators:
1. **ERROR_MESSAGES** template pattern for consistency
2. **Reusable message functions** (e.g., `DUPLICATE_IMPORT_NAME(name)`)

## Consolidation Recommendations

### 1. Unified BaseError Type
```typescript
export interface BaseError {
  readonly message: string;
  readonly location?: SourceLocation;  // Optional (not all errors have location)
  readonly hint?: string;              // Optional actionable guidance
}
```

### 2. Discriminated Union Pattern
```typescript
export type ParseError = BaseError & {
  readonly _tag: 'ParseError';
  readonly expected?: string;
  readonly actual?: string;
};

export type CompilerError =
  | ParseError
  | ValidationError
  | TypeError
  | TransformError
  | OptimizationError
  | EmitError;
```

### 3. Type Guard Pattern
```typescript
export function isParseError(error: unknown): error is ParseError {
  return (
    typeof error === 'object' &&
    error !== null &&
    '_tag' in error &&
    error._tag === 'ParseError'
  );
}
```

### 4. Constructor Pattern
```typescript
export function createParseError(
  message: string,
  location: SourceLocation,
  expected?: string,
  actual?: string
): ParseError {
  return {
    _tag: 'ParseError',
    message,
    location,
    expected,
    actual,
  };
}
```

### 5. Error Formatter Pattern
```typescript
export function formatError(error: AllErrors): string {
  const locationStr = error.location
    ? `${error.location.file}:${error.location.line}:${error.location.column}`
    : '';
  const hintStr = error.hint ? `\nHint: ${error.hint}` : '';
  return `${locationStr} ${error.message}${hintStr}`;
}
```

## Migration Path

### Phase 1: Create Unified Namespace
- Create `packages/language/src/errors/` with all unified types
- Re-export shared-utils IOError types
- Provide type guards and constructors

### Phase 2: Add Adapter Re-Exports
- Old locations re-export from new namespace
- Add `@deprecated` JSDoc warnings

### Phase 3: Migrate Consumers
- Update imports to `@eligian/language/errors`
- One package at a time (language → extension → CLI)

### Phase 4: Remove Deprecated
- Delete old files after full migration
- Update documentation

## Conclusion

**Recommendation**: Create unified error namespace at `@eligian/language/src/errors/` using:
- Discriminated unions with `_tag` field (TypeScript best practice)
- Type guards for all error categories
- Constructor functions for consistency
- Error formatters for display
- Re-export shared-utils IOError types

**Benefits**:
- 200-300 lines of duplicate code eliminated
- Consistent error messages across tools
- Type-safe error handling
- Single import location
- Easier maintenance

**Next Steps**: Design unified error type hierarchy in `data-model.md`
