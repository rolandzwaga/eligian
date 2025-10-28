# Data Model: Unified Error Type Hierarchy

**Date**: 2025-01-28
**Purpose**: Complete TypeScript type definitions for unified error namespace

## Overview

This document defines the unified error type hierarchy for the Eligian DSL. All errors use **discriminated unions** with a `_tag` field (TypeScript best practice) to enable exhaustive pattern matching and type-safe error handling.

The unified namespace consolidates **7 error hierarchies** from across the codebase into a single, consistent structure at `@eligian/language/src/errors/`.

## Design Principles

1. **Discriminated Unions**: All errors use `_tag` field for type discrimination
2. **Readonly Fields**: All error fields are readonly (external immutability)
3. **Optional Hints**: All errors provide optional `hint` field for actionable guidance
4. **Consistent Constructors**: Factory functions ensure consistent error creation
5. **Type Guards**: Runtime type checking for all error categories
6. **Re-export Pattern**: Shared-utils IOError types re-exported for convenience

## Base Error Type

All errors extend this conceptual base (using intersection types):

```typescript
/**
 * Base error structure (conceptual - not exported as standalone type)
 *
 * All errors in the Eligian DSL share these common fields.
 */
interface BaseError {
  readonly message: string;
  readonly location?: SourceLocation;  // Optional - not all errors have source location
  readonly hint?: string;              // Optional - actionable guidance for fixing the error
}
```

## Source Location Type

Shared location type for all errors that need source position:

```typescript
/**
 * Source code location for error reporting
 *
 * Tracks the position of AST nodes or text in source files to provide
 * helpful error messages with line/column information.
 */
export type SourceLocation = {
  readonly file?: string;   // Optional - file path or URI
  readonly line: number;    // Line number (1-indexed)
  readonly column: number;  // Column number (1-indexed)
  readonly length?: number; // Optional - length of the error span
};

/**
 * Create a source location from line and column
 */
export function createSourceLocation(
  line: number,
  column: number,
  file?: string,
  length?: number
): SourceLocation;

/**
 * Format source location as a string for error messages
 *
 * @example
 * formatSourceLocation({ file: 'test.eligian', line: 42, column: 10 })
 * // => "test.eligian:42:10"
 */
export function formatSourceLocation(loc: SourceLocation): string;
```

## Compiler Error Hierarchy

Errors from the compilation pipeline (parsing, validation, type checking, transformation, optimization, emission).

### Union Type

```typescript
/**
 * Union of all compilation errors
 *
 * These errors occur during the compilation pipeline from DSL source to Eligius JSON.
 */
export type CompilerError =
  | ParseError
  | ValidationError
  | TypeError
  | TransformError
  | OptimizationError
  | EmitError;
```

### ParseError

```typescript
/**
 * Parse error - syntax errors from Langium parser
 *
 * Occurs when the DSL source code has invalid syntax that prevents parsing.
 *
 * @example
 * // Missing closing brace
 * timeline "Demo" at 0s {
 *   at 0s selectElement("#box")
 * // ParseError: Expected '}' but got EOF
 */
export type ParseError = {
  readonly _tag: 'ParseError';
  readonly message: string;
  readonly location: SourceLocation;
  readonly expected?: string;  // Expected token/construct
  readonly actual?: string;    // Actual token/construct found
};
```

### ValidationError

```typescript
/**
 * Validation error - semantic validation failures
 *
 * Occurs when the DSL syntax is valid but violates semantic rules
 * (undefined references, duplicate definitions, invalid scopes, etc.).
 *
 * @example
 * // Undefined action reference
 * timeline "Demo" at 0s {
 *   at 0s fadeIn("#box")  // ValidationError: Action 'fadeIn' not defined
 * }
 */
export type ValidationError = {
  readonly _tag: 'ValidationError';
  readonly kind: ValidationErrorKind;
  readonly message: string;
  readonly location: SourceLocation;
  readonly hint?: string;
};

/**
 * Validation error kinds
 *
 * Each kind represents a specific semantic validation rule violation.
 */
export type ValidationErrorKind =
  | 'UndefinedReference'        // Reference to undefined symbol
  | 'DuplicateDefinition'       // Duplicate action/timeline/provider
  | 'InvalidScope'              // Symbol used in wrong scope
  | 'MissingRequiredField'      // Required field missing
  | 'TimelineRequired'          // Timeline must have at least one event
  | 'UniqueEventIds'            // Event IDs must be unique
  | 'ValidTimeRange'            // Start time must be before end time
  | 'NonNegativeTimes'          // Times must be non-negative
  | 'ValidActionType'           // Action type must be valid
  | 'TargetRequired'            // Target selector required
  | 'ValidSelector'             // CSS selector must be valid
  | 'ActionNotDefined'          // Action referenced before definition
  | 'ParameterArityMismatch';   // Wrong number of arguments
```

### TypeError

```typescript
/**
 * Type error - type checking failures
 *
 * Occurs when operation arguments or action parameters have incompatible types.
 *
 * @example
 * action bad(selector: number) [
 *   selectElement(selector)  // TypeError: Expected 'string', got 'number'
 * ]
 */
export type TypeError = {
  readonly _tag: 'TypeError';
  readonly message: string;
  readonly location: SourceLocation;
  readonly expected: string;  // Expected type
  readonly actual: string;    // Actual type found
  readonly hint?: string;
};
```

### TransformError

```typescript
/**
 * Transform error - AST → IR transformation failures
 *
 * Occurs when the AST cannot be transformed to Eligius intermediate representation.
 *
 * @example
 * // Unknown AST node type (should never happen unless grammar changes)
 * TransformError: Unknown node type 'FutureConstruct'
 */
export type TransformError = {
  readonly _tag: 'TransformError';
  readonly kind: TransformErrorKind;
  readonly message: string;
  readonly location: SourceLocation;
  readonly astNode?: string;  // AST node type that failed
};

/**
 * Transform error kinds
 */
export type TransformErrorKind =
  | 'UnknownNode'        // AST node type not recognized
  | 'InvalidTimeline'    // Timeline structure invalid
  | 'InvalidEvent'       // Event structure invalid
  | 'InvalidAction'      // Action structure invalid
  | 'InvalidExpression'  // Expression cannot be evaluated
  | 'InvalidImport'      // Import statement invalid
  | 'ValidationError';   // Validation failed during transform
```

### OptimizationError

```typescript
/**
 * Optimization error - should rarely fail
 *
 * Occurs when an optimization pass encounters an unexpected state.
 * These errors are rare and usually indicate a bug in the optimizer.
 */
export type OptimizationError = {
  readonly _tag: 'OptimizationError';
  readonly message: string;
  readonly pass: string;  // Name of the optimization pass that failed
  readonly hint?: string;
};
```

### EmitError

```typescript
/**
 * Emit error - IR → Eligius JSON emission failures
 *
 * Occurs when the intermediate representation cannot be serialized to JSON.
 * These errors are rare and usually indicate invalid IR state.
 */
export type EmitError = {
  readonly _tag: 'EmitError';
  readonly message: string;
  readonly ir?: string;   // Stringified IR that failed to emit
  readonly hint?: string;
};
```

## Asset Error Hierarchy

Errors from asset validation (HTML, CSS, media files).

### Union Type

```typescript
/**
 * Union of all asset validation errors
 *
 * These errors occur when validating imported assets (HTML layouts, CSS stylesheets, media files).
 */
export type AssetError =
  | HtmlImportError
  | CssImportError
  | CssParseError
  | MediaImportError;
```

### HtmlImportError

```typescript
/**
 * HTML import error - HTML file validation failures
 *
 * Occurs when an imported HTML layout file has syntax errors or is missing.
 *
 * @example
 * layout "./missing.html"  // HtmlImportError: File not found
 * layout "./invalid.html"  // HtmlImportError: Unclosed <div> tag
 */
export type HtmlImportError = {
  readonly _tag: 'HtmlImportError';
  readonly filePath: string;       // Relative path from source file
  readonly absolutePath: string;   // Resolved absolute path
  readonly message: string;
  readonly location: SourceLocation;  // Location of import statement
  readonly line?: number;          // Line in HTML file (if syntax error)
  readonly column?: number;        // Column in HTML file (if syntax error)
  readonly hint?: string;
};
```

### CssImportError

```typescript
/**
 * CSS import error - CSS file validation failures
 *
 * Occurs when an imported CSS file has issues (missing, permission denied, etc.)
 * but NOT syntax errors (use CssParseError for syntax errors).
 *
 * @example
 * styles "./missing.css"  // CssImportError: File not found
 */
export type CssImportError = {
  readonly _tag: 'CssImportError';
  readonly filePath: string;       // Relative path from source file
  readonly absolutePath: string;   // Resolved absolute path
  readonly message: string;
  readonly location: SourceLocation;  // Location of import statement
  readonly hint?: string;
};
```

### CssParseError

```typescript
/**
 * CSS parse error - CSS syntax errors from PostCSS parser
 *
 * Occurs when an imported CSS file has invalid syntax.
 *
 * @example
 * styles "./broken.css"  // CssParseError: Unclosed block at line 5, column 10
 */
export type CssParseError = {
  readonly _tag: 'CssParseError';
  readonly filePath: string;       // Absolute file path
  readonly message: string;
  readonly line: number;           // Line in CSS file where error occurred
  readonly column: number;         // Column in CSS file where error occurred
  readonly source?: string;        // Source snippet showing error context
  readonly hint?: string;
};
```

### MediaImportError

```typescript
/**
 * Media import error - media file validation failures
 *
 * Occurs when an imported media file (video, audio, image) is missing or invalid.
 *
 * @example
 * provider VideoProvider({src: "./missing.mp4"})  // MediaImportError: File not found
 */
export type MediaImportError = {
  readonly _tag: 'MediaImportError';
  readonly filePath: string;       // Relative path from source file
  readonly absolutePath: string;   // Resolved absolute path
  readonly message: string;
  readonly location: SourceLocation;  // Location of import/reference
  readonly hint?: string;
};
```

## I/O Error Hierarchy (Re-exported)

File I/O errors from `@eligian/shared-utils` (already unified in Phase 1).

```typescript
/**
 * File operation errors - re-exported from @eligian/shared-utils
 *
 * These errors are already unified and used throughout the codebase.
 * We re-export them here for convenience.
 */

/**
 * File not found error
 */
export interface FileNotFoundError {
  readonly _tag: 'FileNotFoundError';
  readonly path: string;
  readonly message: string;
  readonly hint?: string;
}

/**
 * Permission denied error
 */
export interface PermissionError {
  readonly _tag: 'PermissionError';
  readonly path: string;
  readonly message: string;
  readonly hint?: string;
}

/**
 * File read error (I/O error, encoding issue, etc.)
 */
export interface ReadError {
  readonly _tag: 'ReadError';
  readonly path: string;
  readonly message: string;
  readonly cause?: unknown;
  readonly hint?: string;
}

/**
 * Security error (path traversal attempt)
 */
export interface SecurityError {
  readonly _tag: 'SecurityError';
  readonly path: string;
  readonly projectRoot: string;
  readonly message: string;
  readonly hint?: string;
}

/**
 * Union of all file I/O errors
 */
export type IOError = FileNotFoundError | PermissionError | ReadError | SecurityError;
```

## All Errors Union

Top-level union of all error types in the Eligian DSL.

```typescript
/**
 * Union of ALL errors in the Eligian DSL
 *
 * Use this type when you need to handle any error from the entire system.
 */
export type AllErrors = CompilerError | AssetError | IOError;
```

## Constructor Functions

Factory functions for creating error instances with consistent structure.

### Compiler Error Constructors

```typescript
/**
 * Create a ParseError
 */
export function createParseError(
  message: string,
  location: SourceLocation,
  expected?: string,
  actual?: string
): ParseError;

/**
 * Create a ValidationError
 */
export function createValidationError(
  kind: ValidationErrorKind,
  message: string,
  location: SourceLocation,
  hint?: string
): ValidationError;

/**
 * Create a TypeError
 */
export function createTypeError(
  message: string,
  location: SourceLocation,
  expected: string,
  actual: string,
  hint?: string
): TypeError;

/**
 * Create a TransformError
 */
export function createTransformError(
  kind: TransformErrorKind,
  message: string,
  location: SourceLocation,
  astNode?: string
): TransformError;

/**
 * Create an OptimizationError
 */
export function createOptimizationError(
  message: string,
  pass: string,
  hint?: string
): OptimizationError;

/**
 * Create an EmitError
 */
export function createEmitError(
  message: string,
  ir?: string,
  hint?: string
): EmitError;
```

### Asset Error Constructors

```typescript
/**
 * Create an HtmlImportError
 */
export function createHtmlImportError(
  filePath: string,
  absolutePath: string,
  message: string,
  location: SourceLocation,
  options?: {
    line?: number;
    column?: number;
    hint?: string;
  }
): HtmlImportError;

/**
 * Create a CssImportError
 */
export function createCssImportError(
  filePath: string,
  absolutePath: string,
  message: string,
  location: SourceLocation,
  hint?: string
): CssImportError;

/**
 * Create a CssParseError
 */
export function createCssParseError(
  filePath: string,
  message: string,
  line: number,
  column: number,
  source?: string,
  hint?: string
): CssParseError;

/**
 * Create a MediaImportError
 */
export function createMediaImportError(
  filePath: string,
  absolutePath: string,
  message: string,
  location: SourceLocation,
  hint?: string
): MediaImportError;
```

### I/O Error Constructors (Re-exported)

```typescript
/**
 * Create a FileNotFoundError
 */
export function createFileNotFoundError(path: string): FileNotFoundError;

/**
 * Create a PermissionError
 */
export function createPermissionError(path: string): PermissionError;

/**
 * Create a ReadError
 */
export function createReadError(path: string, cause?: unknown): ReadError;

/**
 * Create a SecurityError
 */
export function createSecurityError(path: string, projectRoot: string): SecurityError;
```

## Type Guard Functions

Runtime type checking for all error categories.

### Compiler Error Type Guards

```typescript
/**
 * Check if error is a ParseError
 */
export function isParseError(error: unknown): error is ParseError;

/**
 * Check if error is a ValidationError
 */
export function isValidationError(error: unknown): error is ValidationError;

/**
 * Check if error is a TypeError
 */
export function isTypeError(error: unknown): error is TypeError;

/**
 * Check if error is a TransformError
 */
export function isTransformError(error: unknown): error is TransformError;

/**
 * Check if error is an OptimizationError
 */
export function isOptimizationError(error: unknown): error is OptimizationError;

/**
 * Check if error is an EmitError
 */
export function isEmitError(error: unknown): error is EmitError;

/**
 * Check if error is any CompilerError
 */
export function isCompilerError(error: unknown): error is CompilerError;
```

### Asset Error Type Guards

```typescript
/**
 * Check if error is an HtmlImportError
 */
export function isHtmlImportError(error: unknown): error is HtmlImportError;

/**
 * Check if error is a CssImportError
 */
export function isCssImportError(error: unknown): error is CssImportError;

/**
 * Check if error is a CssParseError
 */
export function isCssParseError(error: unknown): error is CssParseError;

/**
 * Check if error is a MediaImportError
 */
export function isMediaImportError(error: unknown): error is MediaImportError;

/**
 * Check if error is any AssetError
 */
export function isAssetError(error: unknown): error is AssetError;
```

### I/O Error Type Guards (Re-exported)

```typescript
/**
 * Check if error is a FileNotFoundError
 */
export function isFileNotFoundError(error: unknown): error is FileNotFoundError;

/**
 * Check if error is a PermissionError
 */
export function isPermissionError(error: unknown): error is PermissionError;

/**
 * Check if error is a ReadError
 */
export function isReadError(error: unknown): error is ReadError;

/**
 * Check if error is a SecurityError
 */
export function isSecurityError(error: unknown): error is SecurityError;

/**
 * Check if error is any IOError
 */
export function isIOError(error: unknown): error is IOError;
```

## Error Formatting

Utilities for formatting errors for display in CLI and VS Code.

```typescript
/**
 * Formatted error for display (CLI, VS Code diagnostics)
 */
export type FormattedError = {
  readonly severity: 'error' | 'warning' | 'info';
  readonly message: string;
  readonly location?: SourceLocation;
  readonly hint?: string;
  readonly codeSnippet?: string;
  readonly relatedInfo?: ReadonlyArray<RelatedInfo>;
};

/**
 * Related information for multi-location errors
 */
export type RelatedInfo = {
  readonly message: string;
  readonly location: SourceLocation;
};

/**
 * Format an error for display
 *
 * Converts any error to a user-friendly formatted error with location,
 * message, hint, and optional code snippet.
 *
 * @example
 * const error = createParseError('Expected }', loc);
 * const formatted = formatError(error);
 * // formatted.message = "test.eligian:42:10 Expected }"
 */
export function formatError(
  error: AllErrors,
  options?: {
    includeSnippet?: boolean;
    contextLines?: number;
  }
): FormattedError;

/**
 * Format multiple errors for display
 */
export function formatErrors(
  errors: AllErrors[],
  options?: {
    includeSnippet?: boolean;
    contextLines?: number;
  }
): FormattedError[];
```

## Migration Pattern

For migrating existing error usages to the unified namespace:

### Step 1: Add Adapter Re-exports

Old error locations re-export from new namespace with deprecation warnings:

```typescript
// OLD: packages/language/src/compiler/types/errors.ts
/**
 * @deprecated Import from '@eligian/language/errors' instead
 */
export type { CompilerError, ParseError, ValidationError } from '../errors/index.js';
```

### Step 2: Update Imports

Change imports to use new unified namespace:

```typescript
// OLD
import { ParseError } from './compiler/types/errors.js';

// NEW
import { ParseError } from './errors/index.js';
```

### Step 3: Remove Deprecated Files

After all consumers migrated, delete old error definition files.

## Design Rationale

### Why Discriminated Unions?

- **Exhaustive Checking**: TypeScript ensures all cases are handled
- **Type Safety**: No runtime casting needed
- **Pattern Matching**: Works naturally with switch statements
- **Composability**: Easy to create union types of unions

### Why `_tag` Field?

- **TypeScript Convention**: Standard pattern for discriminated unions
- **IDE Support**: Better autocomplete and type narrowing
- **Consistency**: Matches Effect-ts and other FP libraries

### Why Optional `location`?

Not all errors have source locations (e.g., OptimizationError, EmitError).
Making it optional avoids artificial locations like `{ line: 0, column: 0 }`.

### Why Optional `hint`?

Some errors are self-explanatory, others need guidance. Optional hints
allow flexibility without requiring boilerplate hints for simple errors.

### Why Re-export IOError?

The shared-utils IOError types are already well-designed and widely used.
Re-exporting them avoids duplication and maintains compatibility.

## Implementation Checklist

- [ ] Create `packages/language/src/errors/` directory
- [ ] Implement base types (SourceLocation, AllErrors union)
- [ ] Implement CompilerError hierarchy with constructors and type guards
- [ ] Implement AssetError hierarchy with constructors and type guards
- [ ] Re-export IOError from shared-utils
- [ ] Implement error formatting utilities
- [ ] Add comprehensive unit tests for all type guards
- [ ] Add comprehensive unit tests for all constructors
- [ ] Add comprehensive unit tests for error formatting
- [ ] Update existing consumers to use unified namespace
- [ ] Add deprecation warnings to old error locations
- [ ] Remove deprecated files after migration complete
