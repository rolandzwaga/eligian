# API Contract: File Loader

**Module**: `file-loader.ts`
**Purpose**: Load file contents with typed error handling (sync and async variants)

## API Functions

### loadFileSync

Synchronously loads a file's contents with comprehensive error handling.

**Signature**:
```typescript
function loadFileSync(absolutePath: string): FileLoadResult
```

**Parameters**:
- `absolutePath` (string): Absolute path to the file to load

**Returns**: `FileLoadResult`
- **Success**: `{ success: true, content: string }`
- **Failure**: `{ success: false, error: FileNotFoundError | PermissionError | ReadError }`

**Preconditions**:
- `absolutePath` MUST be an absolute path (not relative)
- Path should be normalized (use `normalizePath()` first if needed)

**Postconditions (Success)**:
- File content returned as UTF-8 string
- No trailing newlines added or removed (preserves original content)

**Postconditions (Failure)**:
- Returns typed error based on failure cause:
  - `FileNotFoundError` if file does not exist
  - `PermissionError` if insufficient read permissions
  - `ReadError` for other I/O errors (corrupted file, encoding issues, etc.)

**Examples**:

```typescript
// Success case
const result = loadFileSync('/project/styles/main.css');
// => { success: true, content: '.button { color: blue; }' }

// Failure case (file not found)
const result = loadFileSync('/project/missing.css');
// => {
//      success: false,
//      error: {
//        _tag: 'FileNotFoundError',
//        path: '/project/missing.css',
//        message: 'File not found: /project/missing.css',
//        hint: 'Check that the file exists and the path is correct'
//      }
//    }

// Failure case (permission denied)
const result = loadFileSync('/etc/shadow');
// => {
//      success: false,
//      error: {
//        _tag: 'PermissionError',
//        path: '/etc/shadow',
//        message: 'Permission denied: /etc/shadow',
//        hint: 'Ensure the file has read permissions for the current user'
//      }
//    }
```

**Error Conditions**:
- **File Not Found** (ENOENT): Returns `FileNotFoundError`
- **Permission Denied** (EACCES, EPERM): Returns `PermissionError`
- **Other I/O Errors** (EISDIR, EIO, etc.): Returns `ReadError`

**Performance**:
- Blocking operation (synchronous)
- Use for small files (<100KB) or when async is not possible
- For large files or concurrent loading, use `loadFileAsync()` instead

---

### loadFileAsync

Asynchronously loads a file's contents with comprehensive error handling.

**Signature**:
```typescript
function loadFileAsync(absolutePath: string): Promise<FileLoadResult>
```

**Parameters**:
- `absolutePath` (string): Absolute path to the file to load

**Returns**: `Promise<FileLoadResult>`
- **Success**: `Promise<{ success: true, content: string }>`
- **Failure**: `Promise<{ success: false, error: FileNotFoundError | PermissionError | ReadError }>`

**Preconditions**:
- `absolutePath` MUST be an absolute path (not relative)
- Path should be normalized (use `normalizePath()` first if needed)

**Postconditions (Success)**:
- File content returned as UTF-8 string
- No trailing newlines added or removed (preserves original content)
- Promise resolves with success result

**Postconditions (Failure)**:
- Promise resolves (NOT rejects) with failure result containing typed error
- Error type matches failure cause (FileNotFoundError, PermissionError, ReadError)

**Examples**:

```typescript
// Success case
const result = await loadFileAsync('/project/styles/main.css');
if (result.success) {
  console.log('CSS loaded:', result.content);
}

// Failure case (file not found)
const result = await loadFileAsync('/project/missing.css');
if (!result.success) {
  console.error('Load failed:', result.error.message);
  // result.error is FileNotFoundError
}

// Pattern matching on error type
const result = await loadFileAsync('/project/file.css');
if (!result.success) {
  if (result.error._tag === 'FileNotFoundError') {
    console.error('File does not exist:', result.error.path);
  } else if (result.error._tag === 'PermissionError') {
    console.error('Cannot read file:', result.error.path);
  } else {
    console.error('Read error:', result.error.message);
  }
}
```

**Error Conditions**:
- **File Not Found** (ENOENT): Returns `FileNotFoundError`
- **Permission Denied** (EACCES, EPERM): Returns `PermissionError`
- **Other I/O Errors** (EISDIR, EIO, etc.): Returns `ReadError`

**Performance**:
- Non-blocking operation (asynchronous)
- Suitable for large files or concurrent loading
- Prefer this over `loadFileSync()` in async contexts (language server, extension)

---

## Usage Patterns

### Pattern 1: Synchronous Loading (CLI)

```typescript
import { loadFileSync } from '@eligian/shared-utils';

function compileFile(filePath: string): void {
  const result = loadFileSync(filePath);

  if (!result.success) {
    console.error('Error:', result.error.message);
    if (result.error.hint) {
      console.error('Hint:', result.error.hint);
    }
    process.exit(1);
  }

  compile(result.content);
}
```

### Pattern 2: Asynchronous Loading (Extension)

```typescript
import { loadFileAsync } from '@eligian/shared-utils';

async function loadCSSForPreview(cssPath: string): Promise<string | null> {
  const result = await loadFileAsync(cssPath);

  if (!result.success) {
    // Show VS Code notification
    vscode.window.showErrorMessage(
      `Failed to load CSS: ${result.error.message}`
    );
    return null;
  }

  return result.content;
}
```

### Pattern 3: Error Type Discrimination

```typescript
import { loadFileSync, isFileNotFoundError, isPermissionError } from '@eligian/shared-utils';

function loadWithCustomHandling(filePath: string): string | null {
  const result = loadFileSync(filePath);

  if (!result.success) {
    if (isFileNotFoundError(result.error)) {
      // Create default file
      return createDefaultContent();
    } else if (isPermissionError(result.error)) {
      // Escalate to user
      throw new Error(`Permission denied: ${result.error.path}`);
    } else {
      // Log and return null
      console.error('Read error:', result.error.message);
      return null;
    }
  }

  return result.content;
}
```

### Pattern 4: Batch Loading (Async)

```typescript
import { loadFileAsync } from '@eligian/shared-utils';

async function loadMultipleFiles(filePaths: string[]): Promise<Map<string, string>> {
  const results = await Promise.all(
    filePaths.map(async (path) => {
      const result = await loadFileAsync(path);
      return { path, result };
    })
  );

  const loadedFiles = new Map<string, string>();

  for (const { path, result } of results) {
    if (result.success) {
      loadedFiles.set(path, result.content);
    } else {
      console.error(`Failed to load ${path}:`, result.error.message);
    }
  }

  return loadedFiles;
}
```

## Error Message Design

All errors follow a consistent pattern for UX consistency (Constitution Principle V):

**FileNotFoundError**:
- **message**: `"File not found: <path>"`
- **hint**: `"Check that the file exists and the path is correct"`

**PermissionError**:
- **message**: `"Permission denied: <path>"`
- **hint**: `"Ensure the file has read permissions for the current user"`

**ReadError**:
- **message**: `"Failed to read file: <path>"`
- **hint**: `"Check that the file is not corrupted and is readable"`
- **cause**: Original Node.js error (for debugging)

## Testing Guidance

**Unit Tests** (file-loader.spec.ts):
- Test `loadFileSync()` with existing file (success case)
- Test `loadFileSync()` with missing file (FileNotFoundError)
- Test `loadFileSync()` with permission-denied file (PermissionError)
- Test `loadFileAsync()` with same scenarios
- Test error type discrimination (isFileNotFoundError, etc.)
- Mock fs.readFileSync and fs.promises.readFile for deterministic tests

**Integration Tests** (integration/file-operations.spec.ts):
- Test loading real files from test fixtures
- Test concurrent loading with `loadFileAsync()` (Promise.all)
- Test error handling with actual file system errors
