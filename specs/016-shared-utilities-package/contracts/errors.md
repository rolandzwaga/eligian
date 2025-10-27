# API Contract: Error Types

**Module**: `errors.ts`
**Purpose**: Unified error type definitions and type guards for file operations

## Error Type Definitions

All error types use discriminated unions with a `_tag` field for type-safe runtime discrimination. This enables exhaustive pattern matching and avoids class inheritance complexity.

### FileNotFoundError

Indicates a file does not exist at the specified path.

**Type Definition**:
```typescript
interface FileNotFoundError {
  readonly _tag: 'FileNotFoundError';
  readonly path: string;           // Absolute path that was not found
  readonly message: string;         // Human-readable error message
  readonly hint?: string;           // Optional suggestion for resolution
}
```

**Constructor**:
```typescript
function createFileNotFoundError(path: string): FileNotFoundError
```

**Example**:
```typescript
const error = createFileNotFoundError('/project/missing.css');
// => {
//      _tag: 'FileNotFoundError',
//      path: '/project/missing.css',
//      message: 'File not found: /project/missing.css',
//      hint: 'Check that the file exists and the path is correct'
//    }
```

---

### PermissionError

Indicates insufficient permissions to read the file.

**Type Definition**:
```typescript
interface PermissionError {
  readonly _tag: 'PermissionError';
  readonly path: string;           // Absolute path with permission issue
  readonly message: string;         // Human-readable error message
  readonly hint?: string;           // Optional suggestion for resolution
}
```

**Constructor**:
```typescript
function createPermissionError(path: string): PermissionError
```

**Example**:
```typescript
const error = createPermissionError('/etc/shadow');
// => {
//      _tag: 'PermissionError',
//      path: '/etc/shadow',
//      message: 'Permission denied: /etc/shadow',
//      hint: 'Ensure the file has read permissions for the current user'
//    }
```

---

### ReadError

Indicates an error occurred while reading the file (I/O error, encoding issue, etc.).

**Type Definition**:
```typescript
interface ReadError {
  readonly _tag: 'ReadError';
  readonly path: string;           // Absolute path where read failed
  readonly message: string;         // Human-readable error message
  readonly cause?: unknown;         // Original error from fs.readFile
  readonly hint?: string;           // Optional suggestion for resolution
}
```

**Constructor**:
```typescript
function createReadError(path: string, cause?: unknown): ReadError
```

**Example**:
```typescript
const error = createReadError('/project/corrupted.css', new Error('ENOENT'));
// => {
//      _tag: 'ReadError',
//      path: '/project/corrupted.css',
//      message: 'Failed to read file: /project/corrupted.css',
//      cause: Error('ENOENT'),
//      hint: 'Check that the file is not corrupted and is readable'
//    }
```

---

### SecurityError

Indicates a path traversal attempt (trying to escape project root with `../`).

**Type Definition**:
```typescript
interface SecurityError {
  readonly _tag: 'SecurityError';
  readonly path: string;           // Absolute path that failed security check
  readonly projectRoot: string;    // Project root boundary that was violated
  readonly message: string;         // Human-readable error message
  readonly hint?: string;           // Optional suggestion for resolution
}
```

**Constructor**:
```typescript
function createSecurityError(path: string, projectRoot: string): SecurityError
```

**Example**:
```typescript
const error = createSecurityError('/etc/passwd', '/project');
// => {
//      _tag: 'SecurityError',
//      path: '/etc/passwd',
//      projectRoot: '/project',
//      message: 'Path traversal detected: /etc/passwd is outside project root /project',
//      hint: 'Paths must not escape the project directory using .. segments'
//    }
```

---

## Type Guards

Type guards enable runtime type discrimination for error handling with full TypeScript type narrowing support.

### isFileNotFoundError

Checks if an error is a `FileNotFoundError`.

**Signature**:
```typescript
function isFileNotFoundError(error: unknown): error is FileNotFoundError
```

**Example**:
```typescript
if (isFileNotFoundError(error)) {
  console.error('File does not exist:', error.path);
}
```

---

### isPermissionError

Checks if an error is a `PermissionError`.

**Signature**:
```typescript
function isPermissionError(error: unknown): error is PermissionError
```

**Example**:
```typescript
if (isPermissionError(error)) {
  console.error('Cannot read file:', error.path);
}
```

---

### isReadError

Checks if an error is a `ReadError`.

**Signature**:
```typescript
function isReadError(error: unknown): error is ReadError
```

**Example**:
```typescript
if (isReadError(error)) {
  console.error('Read error:', error.message);
  if (error.cause) {
    console.error('Cause:', error.cause);
  }
}
```

---

### isSecurityError

Checks if an error is a `SecurityError`.

**Signature**:
```typescript
function isSecurityError(error: unknown): error is SecurityError
```

**Example**:
```typescript
if (isSecurityError(error)) {
  console.error('Security violation:', error.message);
  console.error('Project root:', error.projectRoot);
}
```

---

## Usage Patterns

### Pattern 1: Exhaustive Error Handling

```typescript
import {
  isFileNotFoundError,
  isPermissionError,
  isReadError,
  isSecurityError,
  type FileLoadError
} from '@eligian/shared-utils';

function handleFileError(error: FileLoadError): void {
  if (isFileNotFoundError(error)) {
    console.error('File not found:', error.path);
    console.error('Hint:', error.hint);
  } else if (isPermissionError(error)) {
    console.error('Permission denied:', error.path);
    console.error('Hint:', error.hint);
  } else if (isReadError(error)) {
    console.error('Read error:', error.message);
    if (error.cause) {
      console.error('Cause:', error.cause);
    }
  } else {
    // TypeScript knows this is unreachable (exhaustiveness check)
    const _exhaustiveCheck: never = error;
  }
}
```

### Pattern 2: Switch-Based Pattern Matching

```typescript
import type { FileLoadError } from '@eligian/shared-utils';

function formatError(error: FileLoadError): string {
  switch (error._tag) {
    case 'FileNotFoundError':
      return `File not found: ${error.path}`;
    case 'PermissionError':
      return `Permission denied: ${error.path}`;
    case 'ReadError':
      return `Read error: ${error.message}`;
    default:
      // TypeScript ensures exhaustiveness
      const _exhaustiveCheck: never = error;
      return 'Unknown error';
  }
}
```

### Pattern 3: VS Code Diagnostics Integration

```typescript
import { loadFileSync, isFileNotFoundError } from '@eligian/shared-utils';
import * as vscode from 'vscode';

function loadFileWithDiagnostics(
  path: string,
  document: vscode.TextDocument,
  range: vscode.Range
): string | null {
  const result = loadFileSync(path);

  if (!result.success) {
    const diagnostic = new vscode.Diagnostic(
      range,
      result.error.message,
      vscode.DiagnosticSeverity.Error
    );

    if (result.error.hint) {
      diagnostic.relatedInformation = [
        new vscode.DiagnosticRelatedInformation(
          new vscode.Location(document.uri, range),
          result.error.hint
        )
      ];
    }

    diagnosticCollection.set(document.uri, [diagnostic]);
    return null;
  }

  return result.content;
}
```

### Pattern 4: Error Serialization (IPC)

```typescript
import type { FileLoadError } from '@eligian/shared-utils';

// Errors are plain objects - can be JSON-serialized for IPC
function sendErrorToLanguageServer(error: FileLoadError): void {
  const serialized = JSON.stringify(error);
  languageClient.sendNotification('file-load-error', serialized);
}

// Receiving side can parse and type-guard
function handleError(serialized: string): void {
  const error = JSON.parse(serialized) as FileLoadError;

  if (isFileNotFoundError(error)) {
    // Handle file not found
  }
}
```

## Design Rationale

### Why Discriminated Unions?

1. **Type Safety**: TypeScript narrows types based on `_tag` field
2. **Exhaustiveness Checking**: TypeScript ensures all cases handled in switch/if-else
3. **No Inheritance**: Avoids class hierarchy complexity
4. **Serializable**: Plain objects can be JSON-serialized for IPC (VS Code extension ↔ language server)

### Why Constructor Functions?

1. **Consistency**: Ensure all errors have correct structure and default messages
2. **DRY**: Avoid repeating message templates across codebase
3. **Testability**: Easy to mock error creation in tests
4. **Evolution**: Can add new fields to errors without breaking existing code

### Error Message Conventions

All error messages follow these conventions:
- **Actionable**: Tell user what went wrong and how to fix it
- **Specific**: Include file paths and relevant context
- **Consistent**: Same format across all error types
- **Hints**: Optional suggestions for resolution (shown in IDE diagnostics)

This aligns with Constitution Principle V (UX Consistency) and Principle XXII (Accessibility - clear error messages).

## Testing Guidance

**Unit Tests** (errors.spec.ts):
- Test error constructor functions (correct structure, message format)
- Test type guards (positive and negative cases)
- Test exhaustiveness checking (TypeScript compiler should catch missing cases)
- Test error serialization (JSON.stringify → JSON.parse roundtrip)

**Integration Tests**:
- Test error types used in `loadFileSync()` and `loadFileAsync()`
- Test error types used in `resolvePath()` and `validatePathSecurity()`
- Verify error messages match specifications
