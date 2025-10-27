# Quickstart: Migrating to Shared Utilities

**Feature**: 016-shared-utilities-package
**Audience**: Developers migrating existing code to use `@eligian/shared-utils`

## Overview

This guide helps you migrate existing path resolution, file loading, and error handling code to use the shared utilities package. The migration ensures consistent behavior across CLI, compiler, language server, and VS Code extension.

## Path Resolution Rules (NON-NEGOTIABLE)

**CRITICAL**: Before migrating, understand these absolute rules:

1. **Import paths are ALWAYS relative to the `.eligian` file's directory**
   - ✅ CORRECT: `resolvePath('./header.html', '/project/src')` (baseDir = `.eligian` file's directory)
   - ❌ WRONG: `resolvePath('./header.html', process.cwd())` (NEVER use cwd)

2. **Paths in `.eligian` files are ALWAYS Unix-style (forward slashes)**
   - ✅ CORRECT: User writes `styles "./styles/main.css"` (forward slashes on ALL platforms)
   - ❌ WRONG: User writes `styles ".\styles\main.css"` (backslashes are syntax errors)

3. **Paths escaping the project root are ILLEGAL**
   - ✅ ALLOWED: `../shared/utils.ts` (if `/project/src/shared/utils.ts` is within project)
   - ❌ BLOCKED: `../../../etc/passwd` (escapes `/project` root - security error)

4. **OS-specific conversion happens internally**
   - Input: Unix-style path from user (e.g., `"./styles/main.css"`)
   - Resolution: Unix-style absolute path (e.g., `/project/src/styles/main.css`)
   - File loading: Converts to OS format internally (e.g., `C:\project\src\styles\main.css` on Windows)
   - Users NEVER see or write OS-specific paths in `.eligian` files

## Installation

### 1. Add Package Dependency

Add `@eligian/shared-utils` to your package's dependencies:

**For language package** (`packages/language/package.json`):
```json
{
  "dependencies": {
    "@eligian/shared-utils": "workspace:*"
  }
}
```

**For extension package** (`packages/extension/package.json`):
```json
{
  "dependencies": {
    "@eligian/shared-utils": "workspace:*"
  }
}
```

### 2. Install Dependencies

```bash
pnpm install
```

The `workspace:*` protocol tells pnpm to use the local workspace package.

## Migration Examples

### Example 1: Path Resolution (html-import-utils.ts)

**Before** (`packages/language/src/compiler/html-import-utils.ts`):
```typescript
import * as path from 'node:path';

function resolveHtmlPath(importPath: string, sourceFileDir: string): string {
  // Custom implementation - different from extension's logic
  const resolved = path.resolve(sourceFileDir, importPath);
  const normalized = resolved.replace(/\\/g, '/');
  return normalized;
}

// No security validation - path traversal possible!
```

**After**:
```typescript
import { resolvePath } from '@eligian/shared-utils';

function resolveHtmlPath(importPath: string, sourceFileDir: string): string {
  const result = resolvePath(importPath, sourceFileDir);

  if (!result.success) {
    throw new Error(result.error.message);
  }

  return result.absolutePath;  // Normalized, validated, cross-platform
}
```

**Benefits**:
- ✅ Path traversal security validation (blocks `../../../etc/passwd`)
- ✅ Cross-platform normalization (works on Windows and Unix)
- ✅ Consistent with extension's path resolution
- ✅ Clear error messages with hints

---

### Example 2: File Loading (css-loader.ts)

**Before** (`packages/extension/src/extension/css-loader.ts`):
```typescript
import * as fs from 'node:fs';

function loadCSSFile(cssPath: string): string {
  try {
    return fs.readFileSync(cssPath, 'utf-8');
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw new Error(`CSS file not found: ${cssPath}`);
    } else if (error.code === 'EACCES') {
      throw new Error(`Permission denied: ${cssPath}`);
    } else {
      throw new Error(`Failed to read CSS file: ${cssPath}`);
    }
  }
}
```

**After**:
```typescript
import { loadFileSync, isFileNotFoundError } from '@eligian/shared-utils';

function loadCSSFile(cssPath: string): string {
  const result = loadFileSync(cssPath);

  if (!result.success) {
    // Typed error handling with hints
    throw new Error(`${result.error.message}\n${result.error.hint || ''}`);
  }

  return result.content;
}
```

**Benefits**:
- ✅ Typed error discrimination (FileNotFoundError, PermissionError, ReadError)
- ✅ Consistent error messages across packages
- ✅ Helpful hints for users (shown in IDE diagnostics)
- ✅ No string-based error code checking

---

### Example 3: Async File Loading (MediaResolver.ts)

**Before** (`packages/extension/src/extension/preview/MediaResolver.ts`):
```typescript
import * as fs from 'node:fs/promises';

async function loadMediaFile(mediaPath: string): Promise<string | null> {
  try {
    return await fs.readFile(mediaPath, 'utf-8');
  } catch (error) {
    console.error('Failed to load media file:', error);
    return null;
  }
}
```

**After**:
```typescript
import { loadFileAsync } from '@eligian/shared-utils';

async function loadMediaFile(mediaPath: string): Promise<string | null> {
  const result = await loadFileAsync(mediaPath);

  if (!result.success) {
    console.error('Failed to load media file:', result.error.message);
    if (result.error.hint) {
      console.error('Hint:', result.error.hint);
    }
    return null;
  }

  return result.content;
}
```

**Benefits**:
- ✅ Typed error handling
- ✅ Clear error messages with hints
- ✅ No try-catch for flow control (errors are data, not exceptions)

---

### Example 4: Security Validation (validators)

**Before** (custom security checks):
```typescript
function validateImportPath(importPath: string, projectRoot: string): void {
  if (importPath.includes('..')) {
    throw new Error('Path traversal not allowed');
  }
}
```

**After**:
```typescript
import { validatePathSecurity, normalizePath } from '@eligian/shared-utils';

function validateImportPath(importPath: string, projectRoot: string): void {
  const normalized = normalizePath(importPath);
  const validation = validatePathSecurity(normalized, projectRoot);

  if (!validation.valid) {
    throw new Error(validation.error.message);
  }
}
```

**Benefits**:
- ✅ Robust security validation (checks resolved path, not just `..` presence)
- ✅ Clear error messages explaining the violation
- ✅ Consistent with shared utilities validation logic

---

## Testing Migration

After migrating code, verify behavior is unchanged:

### 1. Run Existing Tests

```bash
# Test the package you migrated
pnpm --filter @eligian/language test
pnpm --filter @eligian/extension test
```

All existing tests should still pass. If tests fail:
- Check that paths are resolved correctly
- Verify error handling logic matches new error types
- Update test expectations if error messages changed

### 2. Add Integration Tests

Add integration tests to verify shared utilities work correctly:

```typescript
// packages/language/src/__tests__/integration/shared-utils.spec.ts
import { describe, it, expect } from 'vitest';
import { resolvePath, loadFileSync } from '@eligian/shared-utils';

describe('Shared utilities integration', () => {
  it('resolves paths consistently with extension', () => {
    const result = resolvePath('./test.css', '/project/src');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.absolutePath).toBe('/project/src/test.css');
    }
  });

  it('loads files with typed errors', () => {
    const result = loadFileSync('/nonexistent/file.css');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error._tag).toBe('FileNotFoundError');
    }
  });
});
```

### 3. Manual Testing

Test the following scenarios manually:

**CLI Compiler**:
```bash
# Test HTML import path resolution
node packages/cli/bin/cli.js test.eligian

# Verify imports work correctly
```

**VS Code Extension**:
1. Open `.eligian` file with `styles "./test.css"` import
2. Verify CSS loads in preview
3. Change CSS file path to invalid path
4. Verify error message is clear and actionable

---

## Rollout Strategy

Migrate packages in this order to minimize risk:

### Phase 1: Language Package (Lowest Risk)

**Files to migrate**:
- `packages/language/src/compiler/html-import-utils.ts` (path resolution)
- `packages/language/src/asset-loading/node-asset-loader.ts` (file loading)

**Validation**:
- Run language package tests
- Test CLI compiler with HTML imports
- Verify Feature 015 examples still work

### Phase 2: Extension Package (Medium Risk)

**Files to migrate**:
- `packages/extension/src/extension/css-loader.ts` (file loading)
- `packages/extension/src/extension/preview/MediaResolver.ts` (path resolution)

**Validation**:
- Run extension tests
- Test CSS preview loading
- Test media file resolution
- Verify Feature 011 (CSS hot-reload) still works

### Phase 3: CLI and Compiler (Optional)

**Files to consider**:
- Any custom path resolution in CLI
- Any custom file loading in compiler

**Note**: Only migrate if these packages have duplicate implementations. If they already use the language package's utilities, no migration needed.

---

## Common Migration Patterns

### Pattern 1: Replace fs.readFileSync

**Old**:
```typescript
const content = fs.readFileSync(path, 'utf-8');
```

**New**:
```typescript
const result = loadFileSync(path);
if (!result.success) {
  throw new Error(result.error.message);
}
const content = result.content;
```

### Pattern 2: Replace path.resolve + normalize

**Old**:
```typescript
const resolved = path.resolve(baseDir, relativePath);
const normalized = resolved.replace(/\\/g, '/');
```

**New**:
```typescript
const result = resolvePath(relativePath, baseDir);
if (!result.success) {
  throw new Error(result.error.message);
}
const normalized = result.absolutePath;
```

### Pattern 3: Replace Custom Error Classes

**Old**:
```typescript
class FileNotFoundError extends Error {
  constructor(public path: string) {
    super(`File not found: ${path}`);
  }
}
```

**New**:
```typescript
import { createFileNotFoundError, type FileNotFoundError } from '@eligian/shared-utils';

const error = createFileNotFoundError(path);
// error is FileNotFoundError interface (not a class)
```

---

## Troubleshooting

### Issue: TypeScript Cannot Find Module

**Error**: `Cannot find module '@eligian/shared-utils'`

**Solution**:
1. Ensure `@eligian/shared-utils` is in your `package.json` dependencies
2. Run `pnpm install` from the workspace root
3. Rebuild the shared-utils package: `pnpm --filter @eligian/shared-utils run build`

### Issue: Paths Resolve Differently

**Symptom**: Paths that worked before migration now fail

**Solution**:
1. Check that you're passing absolute paths to `loadFileSync()` (not relative)
2. Use `resolvePath()` first to resolve relative paths
3. Verify `baseDir` parameter is the directory containing the source file (not the file itself)

### Issue: Tests Fail After Migration

**Symptom**: Tests that passed before migration now fail

**Solution**:
1. Check if tests relied on specific error messages (update expectations)
2. Verify tests use absolute paths (shared utilities are strict about this)
3. Mock shared utilities in tests if needed:
   ```typescript
   vi.mock('@eligian/shared-utils', () => ({
     loadFileSync: vi.fn(() => ({ success: true, content: 'mocked' }))
   }));
   ```

---

## Verification Checklist

After completing migration:

- [ ] All package tests pass (`pnpm test`)
- [ ] Biome linting passes (`pnpm run check`)
- [ ] TypeScript type checking passes (`pnpm run typecheck`)
- [ ] CLI compiler works with HTML imports
- [ ] VS Code extension loads CSS files correctly
- [ ] Error messages are clear and actionable
- [ ] No duplicate path resolution or file loading logic remains
- [ ] REFACTORING_ROADMAP.md updated (mark migration complete)

---

## Next Steps

After completing migration:

1. **Run full test suite**: `pnpm test` from workspace root
2. **Manual testing**: Test all affected features (HTML imports, CSS loading, etc.)
3. **Update documentation**: Mark migration complete in REFACTORING_ROADMAP.md
4. **Proceed to Phase 2**: CSS Consolidation (Feature 017) or Phase 3: Error Type Unification (Feature 018)

---

## Support

If you encounter issues during migration:

1. Check the API contracts in `specs/016-shared-utilities-package/contracts/`
2. Review the data model in `specs/016-shared-utilities-package/data-model.md`
3. Examine the test files in `packages/shared-utils/__tests__/`
4. Consult REFACTORING_ROADMAP.md for context and dependencies
