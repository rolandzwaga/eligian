# API Contract: Component Interfaces

**Feature**: 011-preview-css-support
**Date**: 2025-10-25

## Overview

This contract defines the public interfaces and responsibilities for CSS loading components in the Eligian VS Code extension.

---

## CSSLoader

**Purpose**: Pure functions for CSS file loading and path conversion.

**Module**: `packages/extension/src/extension/css-loader.ts`

### Functions

#### `loadCSSFile(filePath: string): Promise<string>`

**Description**: Load CSS file content from disk.

**Parameters**:
- `filePath: string` - Absolute path to CSS file

**Returns**: `Promise<string>` - CSS file content (UTF-8)

**Throws**:
- `FileNotFoundError` - File doesn't exist
- `PermissionError` - Insufficient permissions to read
- `ReadError` - File read failed (locked, network error)

**Example**:
```typescript
const cssContent = await loadCSSFile('/workspace/styles/main.css');
```

**Validation**:
- Path MUST be absolute
- File MUST exist
- File MUST have `.css` extension

---

#### `convertToWebviewUri(filePath: string, webview: vscode.Webview): vscode.Uri`

**Description**: Convert file system path to webview-compatible URI.

**Parameters**:
- `filePath: string` - Absolute file system path
- `webview: vscode.Webview` - Webview instance for URI conversion

**Returns**: `vscode.Uri` - Webview URI (vscode-webview:// protocol)

**Example**:
```typescript
const uri = convertToWebviewUri('/workspace/images/logo.png', webview);
// uri.toString() === 'vscode-webview://authority/workspace/images/logo.png'
```

**Validation**:
- Path MUST be absolute
- Path MUST be within workspace (`localResourceRoots`)

---

#### `rewriteCSSUrls(css: string, cssFilePath: string, webview: vscode.Webview): string`

**Description**: Rewrite `url()` paths in CSS to webview URIs.

**Parameters**:
- `css: string` - CSS content
- `cssFilePath: string` - Absolute path to CSS file (for resolving relative paths)
- `webview: vscode.Webview` - Webview instance for URI conversion

**Returns**: `string` - CSS with rewritten url() paths

**Example**:
```typescript
const original = ".bg { background: url('./image.png'); }";
const rewritten = rewriteCSSUrls(original, '/workspace/styles/main.css', webview);
// rewritten === ".bg { background: url('vscode-webview://.../styles/image.png'); }"
```

**Behavior**:
- Rewrites relative paths (./file, ../file)
- Skips absolute URLs (http://, https://)
- Skips data URIs (data:image/...)
- Normalizes Windows paths (backslash → forward slash)

**URL Patterns Handled**:
- `url(./file.png)` → Relative to CSS file
- `url("../file.png")` → Relative to CSS file
- `url('file.png')` → Relative to CSS file
- `url(http://...)` → Skip (external)
- `url(data:...)` → Skip (data URI)

---

#### `extractCSSFiles(config: IEngineConfiguration): string[]`

**Description**: Extract CSS file paths from compiled Eligius configuration.

**Parameters**:
- `config: IEngineConfiguration` - Compiled Eligius configuration

**Returns**: `string[]` - Array of CSS file paths (relative to document)

**Example**:
```typescript
const config = await compile(source, { sourceUri: docPath });
const cssFiles = extractCSSFiles(config);
// cssFiles === ['./styles/main.css', './styles/theme.css']
```

**Behavior**:
- Reads `config.cssFiles` array
- Paths are relative to Eligian document
- Returns empty array if no CSS files

---

#### `generateCSSId(filePath: string): string`

**Description**: Generate stable unique identifier for CSS file.

**Parameters**:
- `filePath: string` - Absolute file path

**Returns**: `string` - Unique CSS ID (SHA-256 hash, 16 hex chars)

**Example**:
```typescript
const id = generateCSSId('/workspace/styles/main.css');
// id === 'a3f5b2c8d9e1f4b7'
```

**Guarantees**:
- Same file path → Same ID (stable)
- Different file paths → Different IDs (unique)
- ID is filesystem-independent (works across machines)

---

### Testing

**Unit Tests** (`css-loader.spec.ts`):
- [ ] `loadCSSFile` reads file content correctly
- [ ] `loadCSSFile` throws on missing file
- [ ] `loadCSSFile` throws on permission error
- [ ] `convertToWebviewUri` converts path correctly
- [ ] `rewriteCSSUrls` rewrites relative paths
- [ ] `rewriteCSSUrls` skips external URLs
- [ ] `rewriteCSSUrls` skips data URIs
- [ ] `rewriteCSSUrls` handles Windows paths
- [ ] `extractCSSFiles` returns cssFiles array
- [ ] `generateCSSId` returns consistent IDs

---

## CSSWatcher

**Purpose**: Lifecycle management for file system watchers.

**Module**: `packages/extension/src/extension/css-watcher.ts`

### Class

#### `CSSWatcherManager`

**Description**: Manages CSS file watchers and debouncing.

**Constructor**:
```typescript
constructor()
```

**Methods**:

##### `startWatching(cssDir: string, cssFiles: string[], onChange: (file: string) => void): void`

**Description**: Start watching CSS files for changes.

**Parameters**:
- `cssDir: string` - Directory containing CSS files
- `cssFiles: string[]` - Array of absolute file paths to watch
- `onChange: (file: string) => void` - Callback when file changes (debounced)

**Example**:
```typescript
const watcher = new CSSWatcherManager();
watcher.startWatching(
  '/workspace/styles',
  ['/workspace/styles/main.css', '/workspace/styles/theme.css'],
  (file) => reloadCSS(file)
);
```

**Behavior**:
- Creates single `FileSystemWatcher` for `cssDir` (non-recursive)
- Tracks `cssFiles` in Set (filters events)
- Debounces changes (300ms per file, independent timers)
- Calls `onChange` after debounce period

**Guarantees**:
- Only one watcher created per instance
- Multiple calls to `startWatching` update tracked files (doesn't create new watcher)

---

##### `updateTrackedFiles(cssFiles: string[]): void`

**Description**: Update the set of tracked CSS files without recreating watcher.

**Parameters**:
- `cssFiles: string[]` - New array of absolute file paths to watch

**Example**:
```typescript
watcher.updateTrackedFiles(['/workspace/styles/main.css']); // Removes theme.css
```

**Use Case**: When Eligian file changes and CSS imports change.

---

##### `dispose(): void`

**Description**: Stop watching and clean up resources.

**Example**:
```typescript
watcher.dispose();
```

**Behavior**:
- Disposes `FileSystemWatcher`
- Clears all debounce timers
- Clears tracked files set
- Nulls references

**Critical**: MUST be called to prevent memory leaks.

---

### Testing

**Unit Tests** (`css-watcher.spec.ts`):
- [ ] `startWatching` creates watcher
- [ ] `onChange` called after debounce (300ms)
- [ ] Multiple rapid changes only trigger one `onChange`
- [ ] Per-file debouncing (one file doesn't block another)
- [ ] `updateTrackedFiles` adds/removes files
- [ ] `dispose` cleans up watcher and timers
- [ ] `dispose` prevents memory leaks (no active timers)

---

## WebviewCSSInjector

**Purpose**: Webview integration for CSS injection.

**Module**: `packages/extension/src/extension/webview-css-injector.ts`

### Class

#### `WebviewCSSInjector`

**Description**: Handles CSS injection into webview.

**Constructor**:
```typescript
constructor(webview: vscode.Webview, workspaceRoot: string)
```

**Methods**:

##### `injectCSS(cssFiles: string[]): Promise<void>`

**Description**: Initial CSS load when preview opens.

**Parameters**:
- `cssFiles: string[]` - Array of absolute CSS file paths

**Example**:
```typescript
const injector = new WebviewCSSInjector(panel.webview, workspaceRoot);
await injector.injectCSS(['/workspace/styles/main.css', '/workspace/styles/theme.css']);
```

**Behavior**:
- Loads all CSS files from disk
- Rewrites `url()` paths to webview URIs
- Sends `css-load` messages to webview (in order)
- Tracks loaded CSS by `cssId`

**Error Handling**:
- File read error → Send `css-error` message + VS Code notification
- Continue loading remaining files (don't fail entire batch)

---

##### `reloadCSS(cssFile: string): Promise<void>`

**Description**: Hot-reload single CSS file after change.

**Parameters**:
- `cssFile: string` - Absolute path to changed CSS file

**Example**:
```typescript
await injector.reloadCSS('/workspace/styles/main.css');
```

**Behavior**:
- Loads CSS file from disk
- Rewrites `url()` paths
- Sends `css-reload` message to webview
- Updates tracked CSS content

**Error Handling**:
- File read error → Send `css-error` message + notification
- Keep previous valid CSS in webview

---

##### `removeCSS(cssFile: string): void`

**Description**: Remove CSS from webview (import removed).

**Parameters**:
- `cssFile: string` - Absolute path to removed CSS file

**Example**:
```typescript
injector.removeCSS('/workspace/styles/theme.css');
```

**Behavior**:
- Sends `css-remove` message to webview
- Removes from tracked CSS

---

##### `showCSSError(cssFile: string, error: string): void`

**Description**: Display CSS error notification to user.

**Parameters**:
- `cssFile: string` - CSS file path
- `error: string` - Error message

**Example**:
```typescript
injector.showCSSError('/workspace/styles/main.css', 'File not found');
```

**Behavior**:
- Shows VS Code error notification with file path
- Includes "Open File" action button (if file exists)
- Rate-limited (max 3 per minute per file)

---

### Testing

**Unit Tests** (`webview-css-injector.spec.ts`):
- [ ] `injectCSS` sends messages in correct order
- [ ] `injectCSS` handles file read errors
- [ ] `reloadCSS` sends `css-reload` message
- [ ] `reloadCSS` handles errors gracefully
- [ ] `removeCSS` sends `css-remove` message
- [ ] `showCSSError` displays notification
- [ ] Error notifications rate-limited

---

## Integration

### Usage Pattern

**Extension Activation** (`main.ts`):
```typescript
export function activate(context: vscode.ExtensionContext) {
  const previewCommand = vscode.commands.registerCommand('eligian.preview', async (uri) => {
    // Compile Eligian file
    const source = await vscode.workspace.fs.readFile(uri);
    const config = await compile(source.toString(), { sourceUri: uri.fsPath });

    // Extract CSS files
    const cssFiles = extractCSSFiles(config);
    const absoluteCSSFiles = cssFiles.map(f => path.resolve(path.dirname(uri.fsPath), f));

    // Create webview
    const panel = vscode.window.createWebviewPanel('eligianPreview', 'Preview', ...);

    // Setup CSS injection
    const injector = new WebviewCSSInjector(panel.webview, workspaceFolder.uri.fsPath);
    await injector.injectCSS(absoluteCSSFiles);

    // Setup watcher
    const watcher = new CSSWatcherManager();
    const cssDir = path.dirname(absoluteCSSFiles[0]); // Assume same directory
    watcher.startWatching(cssDir, absoluteCSSFiles, (file) => injector.reloadCSS(file));

    // Cleanup on close
    panel.onDidDispose(() => {
      watcher.dispose();
    });

    context.subscriptions.push(panel);
  });

  context.subscriptions.push(previewCommand);
}
```

---

## Error Handling Strategy

### Extension Side
1. **File Not Found**: Show notification, send `css-error`, continue with other CSS
2. **Permission Denied**: Show notification, send `css-error`, continue
3. **Read Error**: Show notification, send `css-error`, retry on watcher event
4. **Path Validation**: Show notification, skip file, log error

### Webview Side
1. **Unknown Message**: Log warning, ignore
2. **Missing cssId**: Log error, ignore
3. **CSP Violation**: Send `css-load-failed` (optional)

---

## Performance Targets

**From Success Criteria**:
- **SC-001**: CSS loads in <500ms on preview open
- **SC-002**: CSS changes reflect in <300ms after save
- **SC-005**: Support up to 10 imported CSS files

**Design Decisions to Meet Targets**:
- Single watcher (efficient)
- 300ms debounce (balances responsiveness vs reload frequency)
- Non-recursive watch pattern (10x faster)
- Per-file debouncing (parallel file independence)

---

## References

- Feature Spec: [spec.md](../spec.md)
- Research: [research.md](../research.md)
- Data Model: [data-model.md](../data-model.md)
- Message Protocol: [webview-messages.md](./webview-messages.md)
