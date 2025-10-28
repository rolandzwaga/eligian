# Quickstart: Unified Error Types

**Purpose**: Practical guide to using unified error types in the Eligian DSL

## Overview

The Eligian DSL provides a unified error namespace at `@eligian/language/errors` with:

- **Discriminated unions** with `_tag` field for type-safe pattern matching
- **Type guards** for runtime type checking
- **Constructor functions** for consistent error creation
- **Error formatters** for display in CLI and VS Code

All errors follow TypeScript best practices and enable exhaustive error handling.

## Quick Start

### 1. Import Error Types

```typescript
import {
  // Error types
  type CompilerError,
  type ParseError,
  type ValidationError,
  type AssetError,
  type IOError,
  type AllErrors,

  // Type guards
  isParseError,
  isValidationError,
  isAssetError,

  // Constructors
  createParseError,
  createValidationError,

  // Formatters
  formatError,
} from '@eligian/language/errors';
```

### 2. Create Errors with Constructors

```typescript
import { createParseError, createValidationError, createSourceLocation } from '@eligian/language/errors';

// Create a parse error
const parseError = createParseError(
  'Expected closing brace',
  createSourceLocation(42, 10, 'test.eligian'),
  '}',  // expected
  'EOF' // actual
);

// Create a validation error
const validationError = createValidationError(
  'UndefinedReference',
  "Action 'fadeIn' is not defined",
  createSourceLocation(15, 5, 'test.eligian'),
  'Define the action before using it, or check for typos'
);
```

### 3. Check Error Types with Type Guards

```typescript
import { isParseError, isValidationError, isAssetError } from '@eligian/language/errors';

function handleError(error: unknown): void {
  if (isParseError(error)) {
    console.log(`Parse error at ${error.location.line}:${error.location.column}`);
    console.log(`  Expected: ${error.expected}`);
    console.log(`  Got: ${error.actual}`);
    return;
  }

  if (isValidationError(error)) {
    console.log(`Validation error (${error.kind}): ${error.message}`);
    if (error.hint) {
      console.log(`  Hint: ${error.hint}`);
    }
    return;
  }

  if (isAssetError(error)) {
    console.log(`Asset error: ${error.message}`);
    return;
  }

  // Unknown error
  console.error('Unknown error:', error);
}
```

### 4. Pattern Match on Error Tags

```typescript
import { type CompilerError } from '@eligian/language/errors';

function formatCompilerError(error: CompilerError): string {
  switch (error._tag) {
    case 'ParseError':
      return `Parse error: ${error.message} (expected ${error.expected})`;

    case 'ValidationError':
      return `Validation error (${error.kind}): ${error.message}`;

    case 'TypeError':
      return `Type error: expected ${error.expected}, got ${error.actual}`;

    case 'TransformError':
      return `Transform error (${error.kind}): ${error.message}`;

    case 'OptimizationError':
      return `Optimization error in pass '${error.pass}': ${error.message}`;

    case 'EmitError':
      return `Emit error: ${error.message}`;

    default:
      // TypeScript ensures this is exhaustive
      const _exhaustive: never = error;
      return _exhaustive;
  }
}
```

### 5. Exhaustive Pattern Matching (NO Default Case)

TypeScript's exhaustiveness checking allows you to omit the `default` case when all variants are handled. If you add a new error type and forget to handle it, TypeScript will show a compile-time error.

```typescript
import { type CompilerError } from '@eligian/language/errors';

/**
 * Format CompilerError using exhaustive switch
 *
 * NO default case needed - TypeScript verifies all cases are handled.
 * If we add a new CompilerError variant and forget to handle it here,
 * TypeScript will show: "Function lacks ending return statement"
 */
function formatCompilerError(error: CompilerError): string {
  switch (error._tag) {
    case 'ParseError':
      return `Parse: ${error.message} (expected: ${error.expected ?? 'unknown'})`;
    case 'ValidationError':
      return `Validation: ${error.kind} - ${error.message}`;
    case 'TypeError':
      return `Type: expected ${error.expected}, got ${error.actual}`;
    case 'TransformError':
      return `Transform: ${error.kind} - ${error.message}`;
    case 'OptimizationError':
      return `Optimization (${error.pass}): ${error.message}`;
    case 'EmitError':
      return `Emit: ${error.message}`;
    // NO default case - TypeScript checks exhaustiveness
  }
}

/**
 * Alternative: Exhaustive checking with hierarchical type guards
 *
 * This pattern first checks the category (Compiler/Asset/IO), then
 * delegates to category-specific handlers.
 */
function formatAllErrors(error: AllErrors): string {
  // Check CompilerError (6 variants)
  if (
    error._tag === 'ParseError' ||
    error._tag === 'ValidationError' ||
    error._tag === 'TypeError' ||
    error._tag === 'TransformError' ||
    error._tag === 'OptimizationError' ||
    error._tag === 'EmitError'
  ) {
    return formatCompilerError(error);
  }

  // Check AssetError (4 variants)
  if (
    error._tag === 'HtmlImportError' ||
    error._tag === 'CssImportError' ||
    error._tag === 'CssParseError' ||
    error._tag === 'MediaImportError'
  ) {
    return formatAssetError(error);
  }

  // Check IOError (4 variants)
  if (
    error._tag === 'FileNotFoundError' ||
    error._tag === 'PermissionError' ||
    error._tag === 'ReadError' ||
    error._tag === 'SecurityError'
  ) {
    return formatIOError(error);
  }

  // If TypeScript allows this line, we have a bug in our type system
  const _exhaustive: never = error;
  throw new Error(`Unhandled error type: ${(_exhaustive as AllErrors)._tag}`);
}
```

**Benefits of exhaustive checking**:
- **Compile-time safety**: TypeScript catches missing cases at compile time
- **Maintainability**: When adding new error types, TypeScript shows all places that need updates
- **No runtime overhead**: Exhaustiveness checking is purely a compile-time feature
- **Self-documenting**: The absence of a default case signals that all cases are handled

### 6. Format Errors for Display

```typescript
import { formatError, formatErrors } from '@eligian/language/errors';

// Format a single error
const error = createParseError('Unexpected token', loc);
const formatted = formatError(error);
console.log(formatted.message);  // "test.eligian:42:10 Unexpected token"

// Format multiple errors with code snippets
const errors = [error1, error2, error3];
const formattedErrors = formatErrors(errors, {
  includeSnippet: true,
  contextLines: 2,
});

for (const formatted of formattedErrors) {
  console.log(`${formatted.severity.toUpperCase()}: ${formatted.message}`);
  if (formatted.codeSnippet) {
    console.log(formatted.codeSnippet);
  }
  if (formatted.hint) {
    console.log(`Hint: ${formatted.hint}`);
  }
}
```

## Real-World Examples

### Example 1: Compiler Pipeline Error Handling

```typescript
import {
  type CompilerError,
  isParseError,
  isValidationError,
  formatError,
} from '@eligian/language/errors';

async function compile(source: string): Promise<EligiusConfig | CompilerError[]> {
  try {
    // Parse
    const ast = await parse(source);

    // Validate
    const validationErrors = await validate(ast);
    if (validationErrors.length > 0) {
      return validationErrors;
    }

    // Transform
    const ir = await transform(ast);

    // Optimize
    const optimized = await optimize(ir);

    // Emit
    const config = await emit(optimized);

    return config;
  } catch (error: unknown) {
    // Handle unexpected errors
    if (isParseError(error)) {
      console.error('Parse failed:', formatError(error).message);
      return [error];
    }

    if (isValidationError(error)) {
      console.error('Validation failed:', formatError(error).message);
      return [error];
    }

    // Re-throw unknown errors
    throw error;
  }
}
```

### Example 2: Asset Validation Error Handling

```typescript
import {
  type AssetError,
  isHtmlImportError,
  isCssImportError,
  isCssParseError,
  isMediaImportError,
  createHtmlImportError,
  createCssParseError,
} from '@eligian/language/errors';

async function validateAssets(imports: Import[]): Promise<AssetError[]> {
  const errors: AssetError[] = [];

  for (const imp of imports) {
    try {
      switch (imp.type) {
        case 'html': {
          const result = await validateHtml(imp.path);
          if (!result.valid) {
            errors.push(
              createHtmlImportError(
                imp.path,
                imp.absolutePath,
                result.errors[0].message,
                imp.location,
                {
                  line: result.errors[0].line,
                  column: result.errors[0].column,
                  hint: result.errors[0].hint,
                }
              )
            );
          }
          break;
        }

        case 'css': {
          const result = await validateCss(imp.path);
          if (!result.valid) {
            for (const cssError of result.errors) {
              errors.push(
                createCssParseError(
                  imp.absolutePath,
                  cssError.message,
                  cssError.line,
                  cssError.column,
                  cssError.source,
                  cssError.hint
                )
              );
            }
          }
          break;
        }

        case 'media': {
          const exists = await fileExists(imp.absolutePath);
          if (!exists) {
            errors.push(
              createMediaImportError(
                imp.path,
                imp.absolutePath,
                `Media file not found: ${imp.path}`,
                imp.location,
                'Check that the file exists and the path is correct'
              )
            );
          }
          break;
        }
      }
    } catch (error: unknown) {
      // Handle file I/O errors
      if (isFileNotFoundError(error)) {
        errors.push(
          createCssImportError(
            imp.path,
            imp.absolutePath,
            error.message,
            imp.location,
            error.hint
          )
        );
      }
    }
  }

  return errors;
}
```

### Example 3: VS Code Diagnostics Integration

```typescript
import {
  type AllErrors,
  type FormattedError,
  formatError,
  isCompilerError,
  isAssetError,
} from '@eligian/language/errors';
import * as vscode from 'vscode';

function convertToVSCodeDiagnostic(
  error: AllErrors,
  document: vscode.TextDocument
): vscode.Diagnostic {
  const formatted = formatError(error);

  // Create range from location
  const line = error.location ? error.location.line - 1 : 0; // VS Code uses 0-indexed lines
  const column = error.location ? error.location.column - 1 : 0;
  const length = error.location?.length ?? 1;
  const range = new vscode.Range(
    new vscode.Position(line, column),
    new vscode.Position(line, column + length)
  );

  // Create diagnostic
  const diagnostic = new vscode.Diagnostic(
    range,
    formatted.message,
    vscode.DiagnosticSeverity.Error
  );

  // Add code (error tag)
  diagnostic.code = error._tag;

  // Add hint as related information
  if (formatted.hint) {
    diagnostic.relatedInformation = [
      new vscode.DiagnosticRelatedInformation(
        new vscode.Location(document.uri, range),
        `Hint: ${formatted.hint}`
      ),
    ];
  }

  return diagnostic;
}

function showCompilationErrors(
  errors: AllErrors[],
  document: vscode.TextDocument
): void {
  const diagnosticCollection = vscode.languages.createDiagnosticCollection('eligian');

  const diagnostics = errors.map(error =>
    convertToVSCodeDiagnostic(error, document)
  );

  diagnosticCollection.set(document.uri, diagnostics);
}
```

### Example 4: CLI Error Reporting

```typescript
import {
  type AllErrors,
  formatError,
  formatErrors,
  isCompilerError,
  isAssetError,
  isIOError,
} from '@eligian/language/errors';
import chalk from 'chalk';

function reportErrors(errors: AllErrors[]): void {
  console.error(chalk.red.bold(`\nCompilation failed with ${errors.length} error(s):\n`));

  const formatted = formatErrors(errors, {
    includeSnippet: true,
    contextLines: 2,
  });

  for (const error of formatted) {
    // Print location
    if (error.location) {
      const loc = error.location;
      const locationStr = loc.file
        ? `${loc.file}:${loc.line}:${loc.column}`
        : `${loc.line}:${loc.column}`;
      console.error(chalk.cyan(locationStr));
    }

    // Print message
    console.error(chalk.red(`  ${error.message}`));

    // Print code snippet
    if (error.codeSnippet) {
      console.error(chalk.gray(error.codeSnippet));
    }

    // Print hint
    if (error.hint) {
      console.error(chalk.yellow(`  💡 Hint: ${error.hint}`));
    }

    console.error(); // Blank line
  }

  // Exit with error code
  process.exit(1);
}
```

### Example 5: Exhaustive Error Handling

```typescript
import {
  type AllErrors,
  type CompilerError,
  type AssetError,
  type IOError,
} from '@eligian/language/errors';

function handleAllErrors(error: AllErrors): void {
  // Compiler errors
  if (isCompilerError(error)) {
    switch (error._tag) {
      case 'ParseError':
        console.log('Syntax error');
        break;
      case 'ValidationError':
        console.log(`Validation error: ${error.kind}`);
        break;
      case 'TypeError':
        console.log('Type mismatch');
        break;
      case 'TransformError':
        console.log(`Transform error: ${error.kind}`);
        break;
      case 'OptimizationError':
        console.log(`Optimization failed: ${error.pass}`);
        break;
      case 'EmitError':
        console.log('Emission failed');
        break;
      default:
        const _exhaustiveCompiler: never = error;
        throw new Error(`Unhandled compiler error: ${_exhaustiveCompiler}`);
    }
    return;
  }

  // Asset errors
  if (isAssetError(error)) {
    switch (error._tag) {
      case 'HtmlImportError':
        console.log('HTML validation failed');
        break;
      case 'CssImportError':
        console.log('CSS import failed');
        break;
      case 'CssParseError':
        console.log('CSS syntax error');
        break;
      case 'MediaImportError':
        console.log('Media file not found');
        break;
      default:
        const _exhaustiveAsset: never = error;
        throw new Error(`Unhandled asset error: ${_exhaustiveAsset}`);
    }
    return;
  }

  // I/O errors
  if (isIOError(error)) {
    switch (error._tag) {
      case 'FileNotFoundError':
        console.log('File not found');
        break;
      case 'PermissionError':
        console.log('Permission denied');
        break;
      case 'ReadError':
        console.log('Read failed');
        break;
      case 'SecurityError':
        console.log('Security violation');
        break;
      default:
        const _exhaustiveIO: never = error;
        throw new Error(`Unhandled I/O error: ${_exhaustiveIO}`);
    }
    return;
  }

  // TypeScript ensures this is exhaustive - this line should be unreachable
  const _exhaustive: never = error;
  throw new Error(`Unhandled error: ${_exhaustive}`);
}
```

## Migration Guide

### Migrating from Old Error Types

**Before** (old scattered error types):
```typescript
// OLD - multiple import locations
import { CompileError } from './compiler/types/errors.js';
import { AssetError } from './asset-loading/types.js';
import { FileNotFoundError } from '@eligian/shared-utils';

// OLD - inconsistent type guards
if (error && typeof error === 'object' && '_tag' in error && error._tag === 'ParseError') {
  // ...
}
```

**After** (unified error namespace):
```typescript
// NEW - single import location
import {
  type CompilerError,
  type AssetError,
  type FileNotFoundError,
  isParseError,
} from '@eligian/language/errors';

// NEW - type guard functions
if (isParseError(error)) {
  // TypeScript knows error is ParseError
}
```

### Step-by-Step Migration

1. **Update imports**:
   ```typescript
   // Replace old imports
   - import { ParseError } from './compiler/types/errors.js';
   + import { ParseError } from '@eligian/language/errors';
   ```

2. **Use type guards**:
   ```typescript
   // Replace manual type checks
   - if (error._tag === 'ParseError') {
   + if (isParseError(error)) {
   ```

3. **Use constructors**:
   ```typescript
   // Replace object literals
   - const error = { _tag: 'ParseError', message: '...', location: loc };
   + const error = createParseError('...', loc);
   ```

4. **Use formatters**:
   ```typescript
   // Replace manual formatting
   - const msg = `${error.location.file}:${error.location.line} ${error.message}`;
   + const msg = formatError(error).message;
   ```

## Best Practices

### 1. Always Use Type Guards

```typescript
// ✅ Good - type-safe
if (isParseError(error)) {
  console.log(error.expected);  // TypeScript knows 'expected' exists
}

// ❌ Bad - unsafe
if (error._tag === 'ParseError') {
  console.log((error as ParseError).expected);  // Manual casting required
}
```

### 2. Use Constructor Functions

```typescript
// ✅ Good - consistent structure
const error = createParseError('Unexpected token', loc, '}', 'EOF');

// ❌ Bad - easy to forget fields
const error = { _tag: 'ParseError', message: 'Unexpected token', location: loc };
```

### 3. Leverage Exhaustive Checking

```typescript
// ✅ Good - TypeScript ensures all cases handled
switch (error._tag) {
  case 'ParseError': return '...';
  case 'ValidationError': return '...';
  case 'TypeError': return '...';
  case 'TransformError': return '...';
  case 'OptimizationError': return '...';
  case 'EmitError': return '...';
  default:
    const _exhaustive: never = error;
    throw new Error(`Unhandled: ${_exhaustive}`);
}

// ❌ Bad - might miss cases
if (error._tag === 'ParseError') return '...';
if (error._tag === 'ValidationError') return '...';
// Forgot other cases!
```

### 4. Provide Helpful Hints

```typescript
// ✅ Good - actionable hint
createValidationError(
  'UndefinedReference',
  "Action 'fadeIn' is not defined",
  loc,
  'Define the action before using it, or check for typos'
);

// ❌ Bad - no hint
createValidationError(
  'UndefinedReference',
  "Action 'fadeIn' is not defined",
  loc
);
```

### 5. Use Formatters for Display

```typescript
// ✅ Good - consistent formatting
const formatted = formatError(error);
console.error(formatted.message);

// ❌ Bad - manual formatting
console.error(`${error.location?.file}:${error.location?.line} ${error.message}`);
```

## Testing Error Handling

```typescript
import { describe, it, expect } from 'vitest';
import {
  createParseError,
  createValidationError,
  isParseError,
  isValidationError,
} from '@eligian/language/errors';

describe('Error Handling', () => {
  it('should create and identify parse errors', () => {
    const error = createParseError('Test', loc);

    expect(isParseError(error)).toBe(true);
    expect(isValidationError(error)).toBe(false);
    expect(error._tag).toBe('ParseError');
  });

  it('should format errors correctly', () => {
    const error = createParseError('Unexpected token', loc, '}', 'EOF');
    const formatted = formatError(error);

    expect(formatted.severity).toBe('error');
    expect(formatted.message).toContain('Unexpected token');
  });

  it('should handle exhaustive type checking', () => {
    const error = createParseError('Test', loc);

    const result = formatCompilerError(error);

    expect(result).toContain('Parse error');
  });
});
```

## Summary

The unified error namespace provides:

- ✅ **Type-safe error handling** with discriminated unions
- ✅ **Runtime type checking** with type guard functions
- ✅ **Consistent error creation** with constructor functions
- ✅ **Formatted display** with error formatter utilities
- ✅ **Exhaustive checking** enforced by TypeScript
- ✅ **Single import location** for all error types

Use this guide as a reference when working with errors in the Eligian DSL.
