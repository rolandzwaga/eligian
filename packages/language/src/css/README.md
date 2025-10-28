# CSS Module

Unified CSS operations for the Eligian language package. Provides parsing, loading, and URL rewriting for CSS files used in both compile-time validation (language server) and runtime injection (VS Code extension).

## Overview

This module consolidates all CSS-related functionality into a single source of truth, eliminating ~500-600 lines of duplicate code across the language and extension packages.

## Architecture

```
packages/language/src/css/
├── css-service.ts          # Unified CSS operations (Feature 017)
├── css-parser.ts           # PostCSS-based parsing
├── css-registry.ts         # Centralized CSS metadata
├── selector-parser.ts      # CSS selector extraction
├── levenshtein.ts          # Edit distance for suggestions
├── css-completion.ts       # IDE autocompletion
├── css-hover.ts            # IDE hover information
├── css-code-actions.ts     # IDE quick fixes
├── context-detection.ts    # CSS usage context detection
├── code-action-helpers.ts  # Code action utilities
├── hover-detection.ts      # Hover target detection
└── index.ts                # Barrel exports
```

## CSS Service API (Feature 017)

The CSS service provides three core functions for working with CSS files:

### `generateCSSId(filePath: string): string`

Generates a stable unique identifier from a file path using SHA-256 hash (truncated to 16 hex characters).

**Example**:
```typescript
import { generateCSSId } from '@eligian/language';

const id = generateCSSId('/workspace/styles/main.css');
console.log(id); // 'a3f5b2c8d9e1f4b7'
```

**Use Case**: Tracking CSS files in webview (data-css-id attribute for hot-reload).

### `rewriteUrls(css: string, cssFilePath: string, converter: WebviewUriConverter): string`

Rewrites CSS `url()` paths to webview-compatible URIs for images, fonts, and other assets.

**Example**:
```typescript
import { rewriteUrls } from '@eligian/language';
import type { WebviewUriConverter } from '@eligian/language';

const css = ".bg { background: url('./image.png'); }";
const cssPath = '/workspace/styles/main.css';

// Provide platform-specific converter
const converter: WebviewUriConverter = {
  convertToWebviewUri: (fileUri) => ({
    scheme: 'vscode-webview',
    path: fileUri.path,
    toString: () => `vscode-webview://authority${fileUri.path}`
  })
};

const rewritten = rewriteUrls(css, cssPath, converter);
// ".bg { background: url('vscode-webview://authority/workspace/styles/image.png'); }"
```

**Use Case**: Making CSS assets load correctly in webview context.

**Features**:
- Skips absolute URLs (http://, https://, data:)
- Normalizes Windows backslashes to forward slashes
- Resolves relative paths (./image.png, ../fonts/font.woff)

### `loadCSS(filePath: string, converter: WebviewUriConverter): Promise<LoadedCSS>`

Loads a CSS file from disk, rewrites url() paths for webview compatibility, and generates a stable unique ID.

**Example**:
```typescript
import { loadCSS } from '@eligian/language';

const converter = /* ... webview URI converter ... */;
const loaded = await loadCSS('/workspace/styles/main.css', converter);

console.log(loaded.id);       // 'a3f5b2c8d9e1f4b7' (stable hash)
console.log(loaded.content);  // CSS with rewritten url() paths
```

**Returns**:
```typescript
interface LoadedCSS {
  content: string;  // CSS with rewritten url() paths
  id: string;       // Stable unique identifier (16-char hex)
}
```

**Throws**: Error with typed error information if file cannot be read (FileNotFoundError, PermissionError, ReadError).

## Platform-Agnostic Design

The CSS service uses domain-specific interfaces to avoid coupling to VS Code:

### `Uri` Interface

```typescript
interface Uri {
  scheme: string;      // 'file', 'vscode-webview', etc.
  path: string;        // Absolute path or resource path
  toString(): string;  // String representation
}
```

### `WebviewUriConverter` Interface

```typescript
interface WebviewUriConverter {
  convertToWebviewUri(fileUri: Uri): Uri;
}
```

**VS Code Implementation**:
```typescript
// packages/extension/src/extension/webview-uri-converter.ts
import * as vscode from 'vscode';
import type { Uri, WebviewUriConverter } from '@eligian/language';

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
```

This design allows the language package to remain free of VS Code dependencies while still supporting VS Code-specific webview URI conversion.

## CSS Parser

PostCSS-based parser for extracting CSS metadata (classes, IDs, rules, locations).

**Example**:
```typescript
import { parseCSS } from '@eligian/language/css-parser';

const result = parseCSS('.button { color: red; }', '/workspace/styles.css');

console.log(result.classes);  // ['button']
console.log(result.ids);      // []
console.log(result.errors);   // []
```

**Returns**:
```typescript
interface CSSParseResult {
  classes: string[];              // All CSS class names
  ids: string[];                  // All CSS IDs
  locations: Map<string, CSSSourceLocation>;  // Source locations
  rules: string[];                // All CSS rules
  errors: CSSParseError[];        // Syntax errors
}
```

## CSS Registry

Centralized CSS metadata tracking for language server features (validation, completion, hover).

**Example**:
```typescript
import { CSSRegistryService } from '@eligian/language';

const registry = new CSSRegistryService();

// Update CSS file metadata
registry.updateCSSFile(fileUri, {
  classes: ['button', 'header'],
  ids: ['main', 'sidebar'],
  // ... other metadata
});

// Register document imports
registry.registerImports(documentUri, [cssFileUri]);

// Query available classes for a document
const classes = registry.getClassesForDocument(documentUri);
console.log(classes); // Set { 'button', 'header' }
```

## CSS Validation (Feature 013)

Real-time validation of CSS class names and selectors used in operation calls.

**Features**:
- Validates `className` parameters (addClass, removeClass, toggleClass, hasClass)
- Validates `selector` parameters (selectElement, selectAll)
- Provides "Did you mean?" suggestions using Levenshtein distance
- Validates CSS file syntax errors
- Hot-reloads validation when CSS files change

**Example Errors**:
```
Unknown CSS class: 'buttom' (Did you mean: 'button'?)
Unknown CSS class in selector: 'buton' (Did you mean: 'button'?)
Invalid CSS selector syntax: Unclosed attribute selector
CSS file './styles.css' has syntax errors (line 5, column 10): Unclosed block
```

## IDE Features

### CSS Completion

Autocompletion for CSS class names and IDs in:
- `className` parameters: `addClass("btn|")`
- `selector` parameters: `selectElement(".btn|")`
- String literals: `"button primary|"`

### CSS Hover

Hover information showing:
- CSS rule definition
- Source file location
- All properties in the rule

### CSS Code Actions

Quick fixes for:
- Adding missing CSS classes to files
- Creating CSS rules for undefined classes
- Fixing typos in class names

## Error Types

The CSS module uses error types from `@eligian/shared-utils`:

```typescript
import type {
  FileNotFoundError,
  PermissionError,
  ReadError
} from '@eligian/language';
```

These are discriminated unions with `_tag` field:

```typescript
type FileOperationError =
  | { _tag: 'FileNotFoundError'; path: string; }
  | { _tag: 'PermissionError'; path: string; }
  | { _tag: 'ReadError'; path: string; message: string; };
```

## Testing

**Unit Tests** (130 tests):
- `css-parser.spec.ts` - 44 tests (PostCSS parsing)
- `levenshtein.spec.ts` - 42 tests (edit distance)
- `css-registry.spec.ts` - 34 tests (metadata tracking)
- `selector-parser.spec.ts` - 42 tests (selector parsing)
- `css-service.spec.ts` - 7 tests (CSS service API)

**Integration Tests** (22 tests):
- CSS class validation tests
- CSS selector validation tests
- CSS hot-reload tests
- CSS file error handling tests

**Run Tests**:
```bash
cd packages/language
pnpm run test css
```

## Performance

- **CSS Parsing**: <50ms for typical stylesheets (PostCSS)
- **Validation**: Real-time with no noticeable lag
- **Hot-Reload**: CSS changes reflect in <300ms
- **Memory**: Minimal overhead (only stores class/ID names and locations)

## Migration Guide

### Before (Extension Package)

```typescript
// packages/extension/src/extension/css-loader.ts
import * as crypto from 'node:crypto';
import * as path from 'node:path';

function generateCSSId(filePath: string): string {
  const hash = crypto.createHash('sha256');
  hash.update(filePath);
  return hash.digest('hex').substring(0, 16);
}

function rewriteCSSUrls(css: string, cssFilePath: string, webview: vscode.Webview): string {
  // ~50 lines of duplicate code
}

async function loadCSSFile(filePath: string): Promise<string> {
  // ~30 lines of duplicate code
}
```

### After (Delegates to Language Package)

```typescript
// packages/extension/src/extension/css-loader.ts
import {
  generateCSSId as generateCSSIdInternal,
  loadCSS as loadCSSInternal,
  rewriteUrls as rewriteUrlsInternal
} from '@eligian/language';
import { VSCodeWebviewUriConverter } from './webview-uri-converter.js';

export function generateCSSId(filePath: string): string {
  return generateCSSIdInternal(filePath);
}

export function rewriteCSSUrls(css: string, cssFilePath: string, webview: vscode.Webview): string {
  const converter = new VSCodeWebviewUriConverter(webview);
  return rewriteUrlsInternal(css, cssFilePath, converter);
}

export async function loadCSSFile(filePath: string): Promise<string> {
  const dummyConverter = { convertToWebviewUri: (uri) => uri };
  const result = await loadCSSInternal(filePath, dummyConverter as any);
  return result.content;
}
```

**Result**: ~120 lines of duplicate code eliminated, extension now delegates to language package.

## Related Features

- **Feature 010**: Asset Loading & Validation (CSS import syntax)
- **Feature 011**: Preview CSS Support with Live Reload
- **Feature 013**: CSS Class and Selector Validation
- **Feature 016**: Shared Utilities Package (file loading)
- **Feature 017**: Phase 2 - CSS Consolidation (this module)

## References

- **Feature Spec**: `specs/017-phase-2-css/spec.md`
- **Implementation Plan**: `specs/017-phase-2-css/plan.md`
- **Tasks**: `specs/017-phase-2-css/tasks.md`
- **Quickstart Guide**: `specs/017-phase-2-css/quickstart.md`
