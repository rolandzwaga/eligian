# API Contract: Path Resolver

**Module**: `path-resolver.ts`
**Purpose**: Resolve relative file paths to absolute paths with security validation and cross-platform normalization

## Path Resolution Rules (NON-NEGOTIABLE)

**CRITICAL**: These rules are absolute and must be enforced by all functions in this module:

1. **Import paths are ALWAYS relative to the `.eligian` file's directory**
   - The `.eligian` file's directory is the ONLY valid base directory for resolving imports
   - NEVER use `process.cwd()`, workspace root, or any other directory as the base

2. **Paths in `.eligian` files are ALWAYS Unix-style (forward slashes)**
   - Users write: `"./styles/main.css"` (always forward slashes, regardless of platform)
   - Backslashes are NEVER valid in `.eligian` source code (syntax error)

3. **Paths that navigate outside the project root are ILLEGAL**
   - LEGAL: `../shared/utils.ts` (if it stays within project root)
   - ILLEGAL: `../../../etc/passwd` (escapes project root - BLOCKED)
   - Security validation MUST block any path escaping the project root

4. **OS-specific path conversion happens internally for fs operations**
   - Input: Unix-style path from `.eligian` source (e.g., `"./styles/main.css"`)
   - Output: Absolute path normalized to Unix-style (e.g., `/project/src/styles/main.css`)
   - Conversion to OS-specific format (e.g., `C:\project\src\styles\main.css`) happens in file-loader, not here

## API Functions

### resolvePath

Resolves a relative path to an absolute path based on a base directory, with security validation to prevent path traversal.

**Signature**:
```typescript
function resolvePath(
  relativePath: string,
  baseDir: string
): PathResolutionResult
```

**Parameters**:
- `relativePath` (string): Relative path to resolve (e.g., `./styles/main.css`, `../header.html`)
- `baseDir` (string): Absolute path to the directory containing the source file (e.g., `/project/src`)

**Returns**: `PathResolutionResult`
- **Success**: `{ success: true, absolutePath: string }`
- **Failure**: `{ success: false, error: SecurityError }`

**Preconditions**:
- `baseDir` MUST be an absolute path
- `relativePath` MUST be a string (can be empty, resolved to baseDir)

**Postconditions (Success)**:
- Returned path is absolute
- Returned path uses forward slashes (`/`) for separators
- Returned path does not escape project root (validated automatically)
- Returned path is normalized (no `.` or `..` segments remaining)

**Postconditions (Failure)**:
- Returns `SecurityError` if resolved path escapes project root
- Project root is automatically detected as the nearest directory containing `package.json` or `.git`

**Examples**:

```typescript
// Success case
const result = resolvePath('./styles/main.css', '/project/src');
// => { success: true, absolutePath: '/project/src/styles/main.css' }

// Success case (parent directory, but within project)
const result = resolvePath('../shared/utils.ts', '/project/src/components');
// => { success: true, absolutePath: '/project/src/shared/utils.ts' }

// Failure case (path traversal attempt)
const result = resolvePath('../../../etc/passwd', '/project/src');
// => {
//      success: false,
//      error: {
//        _tag: 'SecurityError',
//        path: '/etc/passwd',
//        projectRoot: '/project',
//        message: 'Path traversal detected: /etc/passwd is outside project root /project',
//        hint: 'Paths must not escape the project directory using .. segments'
//      }
//    }
```

**Error Conditions**:
- **Path Traversal**: Returns `SecurityError` if resolved path is outside project root
- **Invalid baseDir**: Throws TypeError if baseDir is not absolute (development-time error, not runtime)

---

### validatePathSecurity

Validates that an absolute path does not escape the project root (path traversal detection).

**Signature**:
```typescript
function validatePathSecurity(
  absolutePath: string,
  projectRoot: string
): SecurityValidationResult
```

**Parameters**:
- `absolutePath` (string): Absolute path to validate (e.g., `/project/src/file.css`)
- `projectRoot` (string): Absolute path to project root directory (e.g., `/project`)

**Returns**: `SecurityValidationResult`
- **Success**: `{ valid: true }`
- **Failure**: `{ valid: false, error: SecurityError }`

**Preconditions**:
- Both `absolutePath` and `projectRoot` MUST be absolute paths
- Paths MUST be normalized (use `normalizePath()` first if needed)

**Postconditions (Success)**:
- `absolutePath` is within `projectRoot` (or equal to it)

**Postconditions (Failure)**:
- Returns `SecurityError` with details about the violation

**Examples**:

```typescript
// Success case
const result = validatePathSecurity('/project/src/file.css', '/project');
// => { valid: true }

// Failure case (outside root)
const result = validatePathSecurity('/etc/passwd', '/project');
// => {
//      valid: false,
//      error: {
//        _tag: 'SecurityError',
//        path: '/etc/passwd',
//        projectRoot: '/project',
//        message: 'Path traversal detected: /etc/passwd is outside project root /project',
//        hint: 'Paths must not escape the project directory using .. segments'
//      }
//    }
```

**Error Conditions**:
- **Outside Project Root**: Returns `SecurityError` if path is not a descendant of projectRoot

---

### normalizePath

Normalizes a file path to use forward slashes and resolve `.` and `..` segments, ensuring cross-platform consistency.

**Signature**:
```typescript
function normalizePath(filePath: string): string
```

**Parameters**:
- `filePath` (string): Path to normalize (can be relative or absolute, Windows or Unix format)

**Returns**: Normalized path string with forward slashes

**Preconditions**:
- `filePath` can be any valid path string (relative, absolute, Windows, Unix)

**Postconditions**:
- Returned path uses forward slashes (`/`) as separators
- `.` and `..` segments are resolved
- Multiple consecutive slashes are collapsed to single slash
- Trailing slashes are removed (except for root `/`)

**Examples**:

```typescript
// Windows path
const normalized = normalizePath('C:\\project\\src\\file.css');
// => 'C:/project/src/file.css'

// Unix path with .. segments
const normalized = normalizePath('/project/src/../dist/file.css');
// => '/project/dist/file.css'

// Relative path
const normalized = normalizePath('./src/./file.css');
// => 'src/file.css'

// Multiple slashes
const normalized = normalizePath('/project//src///file.css');
// => '/project/src/file.css'
```

**Error Conditions**:
- None (always succeeds, returns normalized path)

---

## Usage Patterns

### Pattern 1: Resolve and Load File

```typescript
import { resolvePath } from '@eligian/shared-utils';
import { loadFileSync } from '@eligian/shared-utils';

function loadImportedFile(importPath: string, sourceFileDir: string): string {
  // Step 1: Resolve path with security validation
  const pathResult = resolvePath(importPath, sourceFileDir);
  if (!pathResult.success) {
    throw new Error(pathResult.error.message);
  }

  // Step 2: Load file
  const fileResult = loadFileSync(pathResult.absolutePath);
  if (!fileResult.success) {
    throw new Error(fileResult.error.message);
  }

  return fileResult.content;
}
```

### Pattern 2: Validate Before Processing

```typescript
import { validatePathSecurity, normalizePath } from '@eligian/shared-utils';

function processUserPath(userPath: string, projectRoot: string): void {
  // Normalize first
  const normalized = normalizePath(userPath);

  // Validate security
  const validation = validatePathSecurity(normalized, projectRoot);
  if (!validation.valid) {
    console.error('Security violation:', validation.error.message);
    return;
  }

  // Safe to process
  processFile(normalized);
}
```

### Pattern 3: Cross-Platform Path Handling

```typescript
import { normalizePath } from '@eligian/shared-utils';

// Works on both Windows and Unix
const cssPath = normalizePath(process.platform === 'win32'
  ? 'C:\\project\\styles\\main.css'
  : '/project/styles/main.css'
);
// => Always returns: 'C:/project/styles/main.css' or '/project/styles/main.css'
```

## Testing Guidance

**Unit Tests** (path-resolver.spec.ts):
- Test `resolvePath()` with relative paths (./file, ../file)
- Test path traversal detection (../../../../etc/passwd)
- Test normalizePath() with Windows and Unix paths
- Test validatePathSecurity() with valid and invalid paths

**Integration Tests** (cross-platform.spec.ts):
- Test path resolution on Windows and Unix (mock path.sep)
- Test that paths resolve identically regardless of platform
- Test project root detection across different directory structures
