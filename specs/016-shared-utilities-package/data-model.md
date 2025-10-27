# Data Model: Shared Utilities Package

**Feature**: 016-shared-utilities-package
**Created**: 2025-01-27
**Purpose**: Define error types, data structures, and result types for shared utilities

## Overview

This document defines the data types used by the shared utilities package for path resolution, file loading, and error handling. All types use discriminated unions for type-safe error handling.

## Path Resolution Rules (NON-NEGOTIABLE)

**CRITICAL**: These rules govern all path operations:

1. **Import paths are ALWAYS relative to the `.eligian` file's directory** - Never relative to `process.cwd()` or workspace root
2. **Paths in `.eligian` files are ALWAYS Unix-style** - Forward slashes only, backslashes are syntax errors
3. **Paths escaping the project root are ILLEGAL** - Security validation blocks path traversal
4. **OS-specific conversion happens internally** - Users never see `C:\` paths in `.eligian` files

## Error Types

All errors use discriminated unions with a `_tag` field for runtime type discrimination. This enables type-safe error handling without class inheritance.

### FileNotFoundError

Indicates a file does not exist at the specified path.

```typescript
interface FileNotFoundError {
  readonly _tag: 'FileNotFoundError';
  readonly path: string;           // Absolute path that was not found
  readonly message: string;         // Human-readable error message
  readonly hint?: string;           // Optional suggestion for resolution
}
```

**Example**:
```typescript
{
  _tag: 'FileNotFoundError',
  path: '/project/styles/missing.css',
  message: 'File not found: /project/styles/missing.css',
  hint: 'Check that the file exists and the path is correct'
}
```

### PermissionError

Indicates insufficient permissions to read the file.

```typescript
interface PermissionError {
  readonly _tag: 'PermissionError';
  readonly path: string;           // Absolute path with permission issue
  readonly message: string;         // Human-readable error message
  readonly hint?: string;           // Optional suggestion for resolution
}
```

**Example**:
```typescript
{
  _tag: 'PermissionError',
  path: '/etc/shadow',
  message: 'Permission denied: /etc/shadow',
  hint: 'Ensure the file has read permissions for the current user'
}
```

### ReadError

Indicates an error occurred while reading the file (I/O error, encoding issue, etc.).

```typescript
interface ReadError {
  readonly _tag: 'ReadError';
  readonly path: string;           // Absolute path where read failed
  readonly message: string;         // Human-readable error message
  readonly cause?: unknown;         // Original error from fs.readFile
  readonly hint?: string;           // Optional suggestion for resolution
}
```

**Example**:
```typescript
{
  _tag: 'ReadError',
  path: '/project/corrupted.css',
  message: 'Failed to read file: /project/corrupted.css',
  cause: Error('ENOENT: no such file or directory'),
  hint: 'Check that the file is not corrupted and is readable'
}
```

### SecurityError

Indicates a path traversal attempt (trying to escape project root with `../`).

```typescript
interface SecurityError {
  readonly _tag: 'SecurityError';
  readonly path: string;           // Absolute path that failed security check
  readonly projectRoot: string;    // Project root boundary that was violated
  readonly message: string;         // Human-readable error message
  readonly hint?: string;           // Optional suggestion for resolution
}
```

**Example**:
```typescript
{
  _tag: 'SecurityError',
  path: '/etc/passwd',
  projectRoot: '/project',
  message: 'Path traversal detected: /etc/passwd is outside project root /project',
  hint: 'Paths must not escape the project directory using .. segments'
}
```

## Result Types

### PathResolutionResult

Result of resolving a relative path to an absolute path with security validation.

```typescript
type PathResolutionResult =
  | { readonly success: true; readonly absolutePath: string }
  | { readonly success: false; readonly error: SecurityError };
```

**Success Example**:
```typescript
{
  success: true,
  absolutePath: '/project/src/styles/main.css'
}
```

**Failure Example**:
```typescript
{
  success: false,
  error: {
    _tag: 'SecurityError',
    path: '/etc/passwd',
    projectRoot: '/project',
    message: 'Path traversal detected: /etc/passwd is outside project root /project',
    hint: 'Paths must not escape the project directory using .. segments'
  }
}
```

### FileLoadResult

Result of loading a file (sync or async).

```typescript
type FileLoadResult =
  | { readonly success: true; readonly content: string }
  | { readonly success: false; readonly error: FileNotFoundError | PermissionError | ReadError };
```

**Success Example**:
```typescript
{
  success: true,
  content: '.button { color: blue; }'
}
```

**Failure Example (File Not Found)**:
```typescript
{
  success: false,
  error: {
    _tag: 'FileNotFoundError',
    path: '/project/missing.css',
    message: 'File not found: /project/missing.css',
    hint: 'Check that the file exists and the path is correct'
  }
}
```

## Type Guards

Type guards enable runtime type discrimination for error handling.

### Error Type Guards

```typescript
function isFileNotFoundError(error: unknown): error is FileNotFoundError;
function isPermissionError(error: unknown): error is PermissionError;
function isReadError(error: unknown): error is ReadError;
function isSecurityError(error: unknown): error is SecurityError;
```

**Usage Example**:
```typescript
const result = loadFileSync('/project/file.css');
if (!result.success) {
  if (isFileNotFoundError(result.error)) {
    console.error('File not found:', result.error.path);
  } else if (isPermissionError(result.error)) {
    console.error('Permission denied:', result.error.path);
  } else if (isReadError(result.error)) {
    console.error('Read error:', result.error.message);
  }
}
```

## Design Rationale

### Why Discriminated Unions?

1. **Type Safety**: TypeScript can narrow types based on the `_tag` field, enabling exhaustive pattern matching
2. **No Inheritance**: Avoids class hierarchy complexity - just plain data types
3. **Serializable**: Can be JSON-serialized for IPC (VS Code extension ↔ language server)
4. **Pattern Matching**: Works well with TypeScript's type narrowing and switch statements

### Why Result Types?

1. **Explicit Error Handling**: Forces callers to handle both success and failure cases
2. **No Exceptions**: Avoids throwing exceptions - errors are data, not control flow
3. **Composable**: Result types can be mapped, chained, and transformed
4. **Clear Contracts**: API contracts explicitly state all possible outcomes

### Error Message Design

All error messages follow this pattern:
- **message**: Clear, actionable description of what went wrong
- **hint**: Optional suggestion for how to fix the issue (shown in IDE diagnostics)
- **path**: Always includes the file path for context
- **cause**: Original error from Node.js fs module (for debugging)

This aligns with Constitution Principle V (UX Consistency) - error messages must be clear and actionable.

## Cross-Platform Considerations

All paths are normalized to use forward slashes (`/`) for consistency:
- Windows: `C:\project\file.css` → `/c/project/file.css` (internal representation)
- Unix: `/project/file.css` → `/project/file.css` (unchanged)
- Paths are denormalized back to platform-specific format when displayed to users

This ensures path resolution behaves identically on Windows, macOS, and Linux.
