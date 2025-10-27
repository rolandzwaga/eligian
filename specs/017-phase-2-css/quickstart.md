# Quickstart: CSS Service Usage

**Feature**: 017-phase-2-css
**Target Audience**: Developers using the CSS service in extension or CLI

## Overview

The CSS service provides unified CSS operations (parsing, loading, URL rewriting) shared between language server and VS Code extension. This guide shows how to use the CSS service in different contexts.

---

## Installation

**Language Package** (already installed):
```bash
pnpm add @eligian/language
```

**No additional dependencies required** - CSS service uses existing postcss, shared-utils, and vscode.

---

## Quick Examples

### Example 1: Parse CSS File

Extract classes, IDs, and metadata from CSS file for validation:

```typescript
import { parseCSS } from '@eligian/language';
import * as fs from 'node:fs/promises';

// Load CSS file
const cssContent = await fs.readFile('./styles.css', 'utf-8');

// Parse CSS
const result = parseCSS(cssContent, '/workspace/styles.css');

// Access metadata
console.log('Classes:', Array.from(result.classes));
// → ['button', 'header', 'nav', 'footer']

console.log('IDs:', Array.from(result.ids));
// → ['main', 'app', 'sidebar']

// Check for errors
if (result.errors.length > 0) {
  console.error('Parse errors:');
  for (const error of result.errors) {
    console.error(`  ${error.filePath}:${error.line}:${error.column} - ${error.message}`);
  }
}

// Get class location (for IDE goto definition)
const buttonLocation = result.classLocations.get('button');
if (buttonLocation) {
  console.log(`class "button" defined at ${buttonLocation.filePath}:${buttonLocation.startLine}`);
}
```

**Use Case**: Language server CSS validation, IDE code completion

---

### Example 2: Load CSS for Webview (VS Code Extension)

Load CSS file and rewrite URLs for webview injection:

```typescript
import { loadCSS, type WebviewUriConverter, type Uri } from '@eligian/language';
import * as vscode from 'vscode';

// Create VS Code webview adapter
class VSCodeWebviewUriConverter implements WebviewUriConverter {
  constructor(private readonly webview: vscode.Webview) {}

  convertToWebviewUri(fileUri: Uri): Uri {
    const vscodeUri = vscode.Uri.file(fileUri.path);
    const webviewUri = this.webview.asWebviewUri(vscodeUri);
    return {
      scheme: webviewUri.scheme,
      path: webviewUri.path,
      toString: () => webviewUri.toString()
    };
  }
}

// Usage in extension
async function injectCSS(panel: vscode.WebviewPanel, cssFilePath: string) {
  const converter = new VSCodeWebviewUriConverter(panel.webview);

  const loadedCSS = await loadCSS(cssFilePath, converter);

  // Send to webview
  await panel.webview.postMessage({
    type: 'css-load',
    cssId: loadedCSS.id,
    content: loadedCSS.content, // URLs already rewritten
    sourceFile: cssFilePath,
    loadOrder: 0
  });
}
```

**Use Case**: VS Code extension webview CSS injection

---

### Example 3: Rewrite CSS URLs (Standalone)

Rewrite CSS url() paths without loading from file:

```typescript
import { rewriteUrls, type WebviewUriConverter, type Uri } from '@eligian/language';

// Mock converter for testing
class MockWebviewConverter implements WebviewUriConverter {
  convertToWebviewUri(fileUri: Uri): Uri {
    return {
      scheme: 'vscode-webview',
      path: fileUri.path,
      toString: () => `vscode-webview://authority${fileUri.path}`
    };
  }
}

// CSS with relative URLs
const css = `
.background {
  background-image: url('./images/bg.png');
}

.font {
  font-family: url('../fonts/custom.woff2');
}

.external {
  background: url('https://cdn.com/image.png');
}
`;

// Rewrite URLs
const converter = new MockWebviewConverter();
const rewritten = rewriteUrls(css, '/workspace/styles/main.css', converter);

console.log(rewritten);
// Output:
// .background {
//   background-image: url('vscode-webview://authority/workspace/styles/images/bg.png');
// }
//
// .font {
//   font-family: url('vscode-webview://authority/workspace/fonts/custom.woff2');
// }
//
// .external {
//   background: url('https://cdn.com/image.png'); // Unchanged (external URL)
// }
```

**Use Case**: CSS hot-reload, custom webview implementations

---

### Example 4: Error Handling

Handle file I/O errors using Result type pattern:

```typescript
import { loadCSS, type FileOperationError } from '@eligian/language';
import type { Result } from '@eligian/shared-utils';

async function loadCSSWithErrorHandling(filePath: string, converter: WebviewUriConverter) {
  try {
    const loadedCSS = await loadCSS(filePath, converter);

    console.log(`Loaded CSS: ${loadedCSS.id}`);
    console.log(`Content length: ${loadedCSS.content.length} characters`);

    return loadedCSS;

  } catch (error) {
    // loadCSS throws on error (backwards compatible with extension)
    console.error('Failed to load CSS:', error);

    // Show VS Code notification
    vscode.window.showErrorMessage(
      `CSS file not found: ${filePath}`,
      'Open File'
    ).then(selection => {
      if (selection === 'Open File') {
        vscode.commands.executeCommand('vscode.open', vscode.Uri.file(filePath));
      }
    });
  }
}
```

**Alternatively, use Result type** (if loadCSS returns Result instead of throwing):

```typescript
const result = await loadCSS(filePath, converter);

if (!result.success) {
  // Handle typed error
  switch (result.error._tag) {
    case 'FileNotFoundError':
      console.error(`File not found: ${result.error.path}`);
      vscode.window.showErrorMessage(`CSS file not found: ${result.error.path}`);
      break;

    case 'PermissionError':
      console.error(`Permission denied: ${result.error.path}`);
      vscode.window.showErrorMessage(`Permission denied reading CSS file: ${result.error.path}`);
      break;

    case 'ReadError':
      console.error(`Read failed: ${result.error.message}`);
      vscode.window.showErrorMessage(`Failed to read CSS file: ${result.error.message}`);
      break;
  }

  return null;
}

// Success
const loadedCSS = result.value;
console.log(`Loaded CSS: ${loadedCSS.id}`);
```

**Use Case**: Robust error handling with user-friendly messages

---

### Example 5: Generate CSS ID

Generate stable unique identifier for CSS files:

```typescript
import { generateCSSId } from '@eligian/language';

const id1 = generateCSSId('/workspace/styles/main.css');
console.log(id1); // → 'a3f5b2c8d9e1f4b7' (16-char hex)

const id2 = generateCSSId('/workspace/styles/main.css');
console.log(id1 === id2); // → true (stable - same path, same ID)

const id3 = generateCSSId('/workspace/styles/theme.css');
console.log(id1 === id3); // → false (different paths)

// Use as HTML attribute
const styleTag = `<style data-css-id="${id1}">...</style>`;
```

**Use Case**: Tracking CSS files in webview DOM

---

## API Reference

### Functions

#### `parseCSS(content: string, filePath: string): CSSParseResult`
- **Purpose**: Parse CSS and extract metadata
- **Returns**: Classes, IDs, locations, rules, and errors
- **Use**: Language server validation, IDE features

#### `loadCSS(filePath: string, converter: WebviewUriConverter): Promise<LoadedCSS>`
- **Purpose**: Load CSS file with URL rewriting
- **Returns**: Promise resolving to { content, id }
- **Use**: Extension webview CSS injection

#### `rewriteUrls(css: string, cssFilePath: string, converter: WebviewUriConverter): string`
- **Purpose**: Rewrite CSS url() paths
- **Returns**: CSS with webview-compatible URLs
- **Use**: CSS hot-reload, custom webview implementations

#### `generateCSSId(filePath: string): string`
- **Purpose**: Generate stable unique ID
- **Returns**: 16-character hex string (SHA-256 hash)
- **Use**: Tracking CSS files in webview DOM

### Types

#### `WebviewUriConverter`
Interface for converting file URIs to webview URIs. Must implement:
```typescript
interface WebviewUriConverter {
  convertToWebviewUri(fileUri: Uri): Uri;
}
```

#### `LoadedCSS`
Result of loadCSS() call:
```typescript
interface LoadedCSS {
  content: string; // CSS with rewritten URLs
  id: string;      // Stable unique identifier
}
```

#### `CSSParseResult`
Result of parseCSS() call:
```typescript
interface CSSParseResult {
  classes: Set<string>;
  ids: Set<string>;
  classLocations: Map<string, CSSSourceLocation>;
  idLocations: Map<string, CSSSourceLocation>;
  classRules: Map<string, string>;
  idRules: Map<string, string>;
  errors: CSSParseError[];
}
```

#### `FileOperationError`
Typed errors for file I/O:
```typescript
type FileOperationError =
  | { _tag: 'FileNotFoundError'; path: string; message: string }
  | { _tag: 'PermissionError'; path: string; message: string }
  | { _tag: 'ReadError'; path: string; message: string };
```

---

## Common Patterns

### Pattern 1: VS Code Extension CSS Injection

```typescript
import { loadCSS, generateCSSId } from '@eligian/language';
import { VSCodeWebviewUriConverter } from './webview-uri-converter';

class WebviewCSSInjector {
  private readonly converter: WebviewUriConverter;

  constructor(private readonly webview: vscode.Webview) {
    this.converter = new VSCodeWebviewUriConverter(webview);
  }

  async injectCSS(cssFiles: string[]): Promise<void> {
    for (let i = 0; i < cssFiles.length; i++) {
      const cssFile = cssFiles[i];

      try {
        const loadedCSS = await loadCSS(cssFile, this.converter);

        await this.webview.postMessage({
          type: 'css-load',
          cssId: loadedCSS.id,
          content: loadedCSS.content,
          sourceFile: cssFile,
          loadOrder: i
        });
      } catch (error) {
        console.error(`Failed to load CSS: ${cssFile}`, error);
      }
    }
  }
}
```

### Pattern 2: CSS Hot-Reload

```typescript
import { loadCSS } from '@eligian/language';
import * as vscode from 'vscode';

class CSSWatcherManager {
  async handleCSSFileChange(filePath: string, converter: WebviewUriConverter) {
    try {
      // Reload CSS file
      const loadedCSS = await loadCSS(filePath, converter);

      // Send reload message to webview
      await this.webview.postMessage({
        type: 'css-reload',
        cssId: loadedCSS.id,
        content: loadedCSS.content,
        sourceFile: filePath
      });

      console.log(`Hot-reloaded CSS: ${filePath}`);

    } catch (error) {
      console.error(`Failed to reload CSS: ${filePath}`, error);

      // Show error notification (rate-limited)
      this.showCSSError(filePath, error);
    }
  }
}
```

### Pattern 3: Language Server CSS Validation

```typescript
import { parseCSS } from '@eligian/language';
import type { ValidationAcceptor } from 'langium';

function validateCSSImport(
  cssFilePath: string,
  cssContent: string,
  accept: ValidationAcceptor
) {
  // Parse CSS
  const result = parseCSS(cssContent, cssFilePath);

  // Report parse errors
  for (const error of result.errors) {
    accept('error', error.message, {
      node: cssImportNode,
      code: 'invalid_css_file',
      data: {
        line: error.line,
        column: error.column,
        source: error.source
      }
    });
  }

  // Store metadata for validation
  cssRegistry.updateCSSFile(cssFilePath, result);
}
```

---

## Testing

### Unit Test Example

```typescript
import { describe, it, expect } from 'vitest';
import { rewriteUrls, type WebviewUriConverter, type Uri } from '@eligian/language';

// Mock converter
class MockConverter implements WebviewUriConverter {
  convertToWebviewUri(fileUri: Uri): Uri {
    return {
      scheme: 'vscode-webview',
      path: fileUri.path,
      toString: () => `vscode-webview://authority${fileUri.path}`
    };
  }
}

describe('rewriteUrls', () => {
  it('should rewrite relative url() paths', () => {
    const css = ".bg { background: url('./image.png'); }";
    const converter = new MockConverter();

    const result = rewriteUrls(css, '/workspace/styles/main.css', converter);

    expect(result).toContain('vscode-webview://authority/workspace/styles/image.png');
  });

  it('should skip absolute http URLs', () => {
    const css = ".bg { background: url('http://example.com/image.png'); }";
    const converter = new MockConverter();

    const result = rewriteUrls(css, '/workspace/main.css', converter);

    expect(result).toBe(css); // Unchanged
  });
});
```

---

## Migration Guide

### From Extension css-loader.ts to Language Package

**Before** (extension package):
```typescript
import { loadCSSFile, rewriteCSSUrls } from './css-loader.js';

const css = await loadCSSFile(filePath);
const rewritten = rewriteCSSUrls(css, filePath, webview);
```

**After** (language package):
```typescript
import { loadCSS } from '@eligian/language';
import { VSCodeWebviewUriConverter } from './webview-uri-converter.js';

const converter = new VSCodeWebviewUriConverter(webview);
const loadedCSS = await loadCSS(filePath, converter);
// loadedCSS.content already has rewritten URLs
```

**Key Changes**:
1. Import from `@eligian/language` instead of local file
2. Create `VSCodeWebviewUriConverter` adapter (~20 lines)
3. Use `loadCSS()` instead of `loadCSSFile() + rewriteCSSUrls()`
4. Delete `css-loader.ts` from extension package

---

## Troubleshooting

### Q: "Cannot find module '@eligian/language'"
**A**: Ensure language package is built:
```bash
cd packages/language
pnpm run build
```

### Q: "CSS URLs not rewriting correctly"
**A**: Check that WebviewUriConverter is implemented correctly:
```typescript
// Verify converter returns valid URIs
const testUri: Uri = { scheme: 'file', path: '/test.png', toString: () => 'file:///test.png' };
const converted = converter.convertToWebviewUri(testUri);
console.log(converted.toString()); // Should be vscode-webview://...
```

### Q: "CSS file not found errors"
**A**: Check file path is absolute (not relative):
```typescript
// ❌ Wrong - relative path
await loadCSS('./styles.css', converter);

// ✅ Correct - absolute path
await loadCSS(path.resolve(workspaceRoot, './styles.css'), converter);
```

### Q: "CSS hot-reload not working"
**A**: Verify CSS watcher is set up correctly and calls loadCSS() on file change.

---

## Next Steps

- **Implementation Guide**: See `tasks.md` (generated by `/speckit.tasks`)
- **API Contract**: See `contracts/css-service.ts` for full interface definitions
- **Data Model**: See `data-model.md` for entity relationships

---

**Quickstart Status**: ✅ Complete - Ready for implementation
