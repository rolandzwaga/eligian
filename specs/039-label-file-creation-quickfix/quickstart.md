# Quickstart: Label File Creation Quick Fix

**Feature**: 039-label-file-creation-quickfix
**Date**: 2025-11-24

## For Users

### What This Feature Does

When you reference a labels file in your Eligian code that doesn't exist yet, VS Code will offer a quick fix to create it automatically. The quick fix:
- Creates the file with the correct structure
- Optionally adds example entries with all your languages
- Opens the file in the label editor for you to start working immediately

### How to Use

1. **Write a labels import** in your `.eligian` file:
   ```eligian
   labels "./localization/app.json"
   ```

2. **If the file doesn't exist**, you'll see an error diagnostic (red squiggly line)

3. **Trigger the quick fix**:
   - **Option 1**: Click the light bulb icon (💡) that appears
   - **Option 2**: Press `Ctrl+.` (Windows/Linux) or `Cmd+.` (Mac) with cursor on the error
   - **Option 3**: Right-click → "Quick Fix..."

4. **Select "Create labels file"** from the menu

5. **File is created** and opens automatically in the label editor

### With Languages Block

If you have a languages block defined:

```eligian
languages {
  * "nl-NL" "Nederlands"
  "en-US" "English"
  "fr-FR" "Français"
}

labels "./localization/app.json"  // File doesn't exist yet
```

The created file will contain an example entry with all your languages:

```json
[
  {
    "id": "example.label",
    "nl-NL": "Voorbeeld NL",
    "en-US": "Example EN",
    "fr-FR": "Exemple FR"
  }
]
```

You can duplicate this entry and modify it to add your own labels.

### Without Languages Block

If you don't have a languages block:

```eligian
labels "./localization/app.json"  // File doesn't exist yet
```

The created file will contain an empty array:

```json
[]
```

You can add entries manually as your project structure develops.

### Nested Paths

The quick fix automatically creates any necessary parent directories:

```eligian
labels "./data/localization/v2/app.json"
```

If `data/`, `data/localization/`, or `data/localization/v2/` don't exist, they'll all be created.

### Error Handling

If file creation fails (e.g., permission denied), you'll see a clear error message explaining the issue. Check:
- Folder permissions
- Disk space
- Path validity for your operating system

---

## For Developers

### Architecture Overview

**Components**:
1. **Language Server** (`packages/language/src/eligian-validator.ts`):
   - Detects missing labels files during validation
   - Creates diagnostic with code `"missing_labels_file"`

2. **Code Action Provider** (`packages/language/src/eligian-code-actions.ts`):
   - Detects `"missing_labels_file"` diagnostic
   - Offers quick fix with command `eligian.createLabelsFile`
   - Prepares command arguments (file path, content, language codes)

3. **Extension Command** (`packages/extension/src/extension/label-file-creator.ts`):
   - Receives command from language server
   - Creates directories using VS Code workspace API
   - Writes file with content
   - Opens file in label editor

### Quick Implementation Guide

#### Step 1: Add Diagnostic in Validator

**File**: `packages/language/src/eligian-validator.ts`

```typescript
// In checkLabelsImports() method
if (!fileExists(resolvedPath)) {
  accept('error', 'Labels file does not exist', {
    node: labelsImport,
    property: 'path',
    code: 'missing_labels_file',
    data: {
      importPath: labelsImport.path,
      resolvedPath,
      hasLanguagesBlock: !!program.languages,
      languageCodes: program.languages?.languages.map(l => l.code) ?? []
    }
  });
}
```

#### Step 2: Add Code Action

**File**: `packages/language/src/eligian-code-actions.ts`

```typescript
getCodeActions(document, range, context): CodeAction[] {
  const actions: CodeAction[] = [];

  for (const diagnostic of context.diagnostics) {
    if (diagnostic.code === 'missing_labels_file') {
      actions.push(this.createLabelsFileAction(diagnostic, document));
    }
  }

  return actions;
}

private createLabelsFileAction(diagnostic: Diagnostic, document): CodeAction {
  const data = diagnostic.data as MissingLabelsFileData;
  const content = data.hasLanguagesBlock
    ? this.generateTemplate(data.languageCodes)
    : '[]';

  return {
    title: 'Create labels file',
    kind: CodeActionKind.QuickFix,
    diagnostics: [diagnostic],
    command: {
      command: 'eligian.createLabelsFile',
      title: 'Create labels file',
      arguments: [{
        filePath: data.resolvedPath,
        content,
        documentUri: document.uri,
        languageCodes: data.languageCodes
      }]
    }
  };
}

private generateTemplate(languageCodes: string[]): string {
  const entry: any = { id: 'example.label' };
  for (const code of languageCodes) {
    entry[code] = `${this.getLanguageName(code)} ${code}`;
  }
  return JSON.stringify([entry], null, 2);
}
```

#### Step 3: Register Extension Command

**File**: `packages/extension/src/extension/main.ts`

```typescript
// In activate() function
context.subscriptions.push(
  vscode.commands.registerCommand(
    'eligian.createLabelsFile',
    async (args: CreateLabelsFileCommand) => {
      await createLabelsFile(args);
    }
  )
);
```

#### Step 4: Implement File Creation

**File**: `packages/extension/src/extension/label-file-creator.ts` (new file)

```typescript
import * as vscode from 'vscode';
import * as path from 'path';

export async function createLabelsFile(args: CreateLabelsFileCommand): Promise<FileCreationResult> {
  try {
    const fileUri = vscode.Uri.file(args.filePath);
    const dirPath = path.dirname(args.filePath);

    // Create parent directories
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(dirPath));

    // Write file
    await vscode.workspace.fs.writeFile(
      fileUri,
      Buffer.from(args.content, 'utf8')
    );

    // Open in label editor
    let editorOpened = false;
    try {
      await vscode.commands.executeCommand('eligian.openLabelEditor', fileUri);
      editorOpened = true;
    } catch {
      // Fallback to default editor
      await vscode.window.showTextDocument(fileUri);
      editorOpened = true;
    }

    return { success: true, filePath: args.filePath, editorOpened };
  } catch (error: any) {
    vscode.window.showErrorMessage(
      `Failed to create labels file: ${error.message}`
    );
    return {
      success: false,
      filePath: args.filePath,
      error: {
        code: mapErrorCode(error),
        message: error.message
      },
      editorOpened: false
    };
  }
}
```

### Testing

#### Unit Tests

**File**: `packages/language/src/__tests__/label-file-creation/template-generation.spec.ts`

```typescript
import { describe, test, expect } from 'vitest';

describe('Label File Template Generation', () => {
  test('should generate empty array when no languages block', () => {
    const content = generateLabelsFileContent(false, []);
    expect(content).toBe('[]');
  });

  test('should generate template with language codes', () => {
    const content = generateLabelsFileContent(true, ['nl-NL', 'en-US']);
    const parsed = JSON.parse(content);

    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe('example.label');
    expect(parsed[0]['nl-NL']).toBeDefined();
    expect(parsed[0]['en-US']).toBeDefined();
  });

  test('should handle 50 language codes', () => {
    const codes = Array.from({ length: 50 }, (_, i) => `l${i}-C${i}`);
    const content = generateLabelsFileContent(true, codes);
    const parsed = JSON.parse(content);

    expect(Object.keys(parsed[0])).toHaveLength(51); // 50 + id
  });
});
```

#### Integration Tests

**File**: `packages/language/src/__tests__/label-file-creation/empty-file-creation.spec.ts`

```typescript
import { describe, test, expect, beforeAll } from 'vitest';
import { createTestContext } from '../test-helpers.js';

describe('Empty Labels File Creation', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = createTestContext();
  });

  test('should offer quick fix for missing labels file', async () => {
    const code = `
      labels "./missing.json"
      timeline "test" at 0s {}
    `;

    const { program, errors } = await ctx.parseAndValidate(code);

    // Check diagnostic
    const missingFileError = errors.find(e => e.code === 'missing_labels_file');
    expect(missingFileError).toBeDefined();

    // Check quick fix offered
    const actions = ctx.getCodeActions(program, missingFileError.range);
    expect(actions).toHaveLength(1);
    expect(actions[0].title).toBe('Create labels file');
  });
});
```

### Path Normalization

Reuse the existing path resolution from asset loading:

```typescript
import { resolveAssetPath } from './asset-loading/compiler-integration.js';

// In validator
const resolvedPath = resolveAssetPath(
  labelsImport.path,
  document.uri
);
```

### Language Code Extraction

Access the languages block from the AST:

```typescript
const languageCodes = program.languages?.languages.map(lang => lang.code) ?? [];
const hasLanguagesBlock = languageCodes.length > 0;
```

### Error Handling

Map VS Code file system errors to user-friendly messages:

```typescript
function mapErrorCode(error: any): FileErrorCode {
  if (error.code === 'EACCES' || error.code === 'EPERM') {
    return FileErrorCode.PermissionDenied;
  }
  if (error.code === 'EINVAL') {
    return FileErrorCode.InvalidPath;
  }
  return FileErrorCode.FileSystemError;
}
```

### Performance Considerations

- **Diagnostic Creation**: ~1ms (no file I/O during validation)
- **Code Action Generation**: ~5ms (JSON serialization)
- **File Creation**: <100ms (depends on disk I/O)
- **Editor Opening**: <500ms (depends on extension host)

Total expected time: <3 seconds (meets SC-001).

### References

- **Spec**: [spec.md](spec.md)
- **Data Model**: [data-model.md](data-model.md)
- **Research**: [research.md](research.md)
- **Contracts**:
  - [create-labels-file-command.json](contracts/create-labels-file-command.json)
  - [file-creation-result.json](contracts/file-creation-result.json)
  - [labels-file-template.json](contracts/labels-file-template.json)
