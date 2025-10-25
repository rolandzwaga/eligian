# Asset Loading Integration Guide

## Overview

This guide explains how to integrate asset loading and validation into the Eligius DSL compiler pipeline. The asset validation infrastructure is **complete and ready** - this guide shows how to connect it.

## Current Status

✅ **Complete**: Asset validation infrastructure (84 tests passing)
✅ **Complete**: Integration module (`compiler-integration.ts`) with 25 tests
✅ **Complete**: AST traversal for extracting imports (`getImports()` utility exists, `extractImports()` implemented)
❌ **NOT INTEGRATED**: Validators are NOT called during compilation
❌ **DOES NOT WORK**: Feature is completely non-functional from user perspective
⏸️ **BLOCKED**: Requires implementing CLI/LSP integration steps below

## Architecture

```
External Code (CLI/LSP/Tests)
    │
    ├─> Parse source file
    │
    ├─> loadProgramAssets(program, filePath)
    │       │
    │       ├─> Extract imports from AST
    │       ├─> Resolve paths
    │       ├─> Validate assets
    │       └─> Load content
    │
    └─> Pass result to transformer
            │
            └─> Populate layoutTemplate, cssFiles, importMap
```

## Integration Options

### Option 1: External Integration (Recommended for Now)

**Use Case**: CLI, LSP, or any code that has access to file paths

**Advantages**:
- No changes to existing transformer
- Works immediately
- Clean separation of concerns

**Implementation**:

```typescript
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseSource, compile } from './compiler/pipeline';
import { loadProgramAssets } from './asset-loading';

// 1. Read source file
const sourceFilePath = resolve(process.cwd(), 'main.eligian');
const source = readFileSync(sourceFilePath, 'utf-8');

// 2. Parse to AST
const parseResult = await Effect.runPromise(parseSource(source, sourceFilePath));

// 3. Load and validate assets
const assetResult = loadProgramAssets(parseResult, sourceFilePath);

// 4. Handle validation errors
if (assetResult.errors.length > 0) {
  for (const error of assetResult.errors) {
    console.error(`${error.type}: ${error.message}`);
    console.error(`  File: ${error.filePath}`);
    console.error(`  Hint: ${error.hint}`);
    if (error.details) {
      console.error(`  Details: ${error.details}`);
    }
  }
  process.exit(1);
}

// 5. Compile (transformer doesn't have file path yet, so can't load assets)
const config = await Effect.runPromise(compile(source));

// 6. Merge asset content into config
config.layoutTemplate = assetResult.layoutTemplate || config.layoutTemplate;
config.cssFiles = assetResult.cssFiles;

// 7. Use config
console.log(JSON.stringify(config, null, 2));
```

### Option 2: Pipeline Integration (Future)

**Use Case**: Full integration with transformer

**Advantages**:
- Automatic asset loading
- Consistent error handling
- Single compilation step

**Requirements**:

1. **Add file path to compilation pipeline**:
```typescript
export const compile = (
  source: string,
  sourcePath?: string,  // NEW: Optional file path
  options: CompileOptions = {}
): Effect.Effect<IEngineConfiguration, CompileError>
```

2. **Pass file path through to transformer**:
```typescript
export const transformAST = (
  program: Program,
  sourcePath?: string  // NEW: Optional file path
): Effect.Effect<EligiusIR, TransformError>
```

3. **Load assets in transformer**:
```typescript
// In transformAST function
if (sourcePath) {
  const assetResult = loadProgramAssets(program, sourcePath);

  // Handle errors
  if (assetResult.errors.length > 0) {
    return yield* _(Effect.fail({
      _tag: 'TransformError',
      kind: 'AssetValidationError',
      message: 'Asset validation failed',
      // ... convert asset errors
    }));
  }

  // Use loaded content
  layoutTemplate = assetResult.layoutTemplate || generateLayoutTemplate(timelines);
  cssFiles = assetResult.cssFiles;
  // Store importMap in metadata or config
}
```

## ✅ Completed: AST Traversal

The integration module now has full AST traversal capability:

**Utilities Available:**
- `getImports()` - Extract import statements from Program AST (in `program-helpers.ts`)
- `extractImports()` - Convert import statements to ImportInfo (in `compiler-integration.ts`)
- `inferImportAssetType()` - Infer asset type from import statement (in `compiler-integration.ts`)
- `hasImports()` - Check if program has any imports (in `compiler-integration.ts`)

**Implementation:**
The `extractImports()` function handles:
- Default imports (`layout`, `styles`, `provider`) - infer type from keyword
- Named imports (`import foo from './file.ext'`) - infer from extension or explicit `as` clause
- Source location tracking for error reporting
- Type guards for safe AST traversal

See [compiler-integration.ts:204-284](packages/language/src/asset-loading/compiler-integration.ts#L204-L284) for implementation details.

## Usage Examples

### Example 1: CLI Compilation

```typescript
#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Effect } from 'effect';
import { parseSource, compile } from '@eligian/language/compiler';
import { loadProgramAssets } from '@eligian/language/asset-loading';

async function main() {
  const inputFile = process.argv[2];
  const outputFile = process.argv[3] || 'output.json';

  try {
    // Read source
    const sourcePath = resolve(process.cwd(), inputFile);
    const source = readFileSync(sourcePath, 'utf-8');

    // Parse
    const program = await Effect.runPromise(parseSource(source, sourcePath));

    // Load assets
    const assets = loadProgramAssets(program, sourcePath);

    // Check for errors
    if (assets.errors.length > 0) {
      console.error('Asset validation errors:');
      for (const error of assets.errors) {
        console.error(`  ${error.message}`);
        console.error(`    Hint: ${error.hint}`);
      }
      process.exit(1);
    }

    // Compile
    const config = await Effect.runPromise(compile(source));

    // Merge assets
    config.layoutTemplate = assets.layoutTemplate || config.layoutTemplate;
    config.cssFiles = assets.cssFiles;

    // Write output
    writeFileSync(outputFile, JSON.stringify(config, null, 2));
    console.log(`Compiled successfully: ${outputFile}`);
  } catch (error) {
    console.error('Compilation failed:', error);
    process.exit(1);
  }
}

main();
```

### Example 2: LSP Integration

```typescript
import { loadProgramAssets } from '@eligian/language/asset-loading';
import type { Diagnostic } from 'vscode-languageserver';

// In document validation
async function validateDocument(uri: string, document: TextDocument) {
  const diagnostics: Diagnostic[] = [];

  // Parse document
  const program = parseSource(document.getText());

  // Load and validate assets
  const filePath = URI.parse(uri).fsPath;
  const assetResult = loadProgramAssets(program, filePath);

  // Convert asset errors to LSP diagnostics
  for (const error of assetResult.errors) {
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: {
        start: {
          line: error.sourceLocation.line,
          character: error.sourceLocation.column,
        },
        end: {
          line: error.sourceLocation.line,
          character: error.sourceLocation.column + 1,
        },
      },
      message: error.message,
      source: 'eligian-asset-loader',
      code: error.type,
    });
  }

  return diagnostics;
}
```

### Example 3: Testing

```typescript
import { describe, it, expect } from 'vitest';
import { parseSource } from './compiler/pipeline';
import { loadProgramAssets } from './asset-loading';

describe('Asset Loading', () => {
  it('should load valid HTML layout', async () => {
    const source = `
      layout './test.html'

      timeline main {
        at 0s selectElement("#root")
      }
    `;

    const program = await Effect.runPromise(parseSource(source));
    const result = loadProgramAssets(program, __filename);

    expect(result.errors).toHaveLength(0);
    expect(result.layoutTemplate).toContain('<!DOCTYPE html>');
  });

  it('should report missing file error', async () => {
    const source = `
      layout './missing.html'
    `;

    const program = await Effect.runPromise(parseSource(source));
    const result = loadProgramAssets(program, __filename);

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].type).toBe('missing-file');
  });
});
```

## Error Handling

Asset errors are structured and provide rich context:

```typescript
interface AssetError {
  type: 'missing-file' | 'invalid-html' | 'invalid-css' | 'load-error';
  filePath: string;          // Relative path: './layout.html'
  absolutePath: string;      // Resolved path: '/project/src/layout.html'
  sourceLocation: {          // Location in .eligian file
    file: string;
    line: number;
    column: number;
  };
  message: string;           // 'HTML validation error: unclosed tag <div>'
  hint: string;              // 'Add closing tag </div>'
  details?: string;          // 'Line 42, Column 15 in layout.html'
}
```

## Next Steps (Optional Enhancements)

1. ✅ **DONE**: Implement `getImports()` utility in `program-helpers.ts`
2. ✅ **DONE**: Implement `extractImports()` function in `compiler-integration.ts`
3. ✅ **DONE**: Add integration tests with real `.eligian` files (25 tests passing)
4. **Optional**: Add source file path to pipeline for automatic asset loading
5. **Optional**: Update transformer to use `loadProgramAssets()` (after pipeline changes)

## Benefits of This Approach

✅ **Non-Breaking**: Existing code continues to work
✅ **Incremental**: Can integrate step-by-step
✅ **Flexible**: Works from CLI, LSP, tests, etc.
✅ **Testable**: Integration module is independently testable
✅ **Clean**: Clear separation between parsing, validation, and compilation

## Conclusion

The asset validation infrastructure exists and passes tests, but is **NOT INTEGRATED** and **DOES NOT WORK**.

**Status**: ❌ **NOT FUNCTIONAL** - Infrastructure exists but not wired up
- 109 tests passing (validators work in isolation)
- Zero regressions
- Full AST traversal implemented
- Comprehensive error reporting exists
- Cross-platform file I/O works

**BUT**:
- Validators are NOT called during compilation
- Users do NOT see file existence errors
- Users do NOT see HTML/CSS validation errors
- Feature is completely non-functional from user perspective

**Required to Complete**: Implement CLI integration (Option 1) AND LSP integration (Option 2) as described above.
