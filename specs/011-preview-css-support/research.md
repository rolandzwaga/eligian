# Research: Preview CSS Support with Live Reload

**Feature**: 011-preview-css-support
**Date**: 2025-10-25
**Status**: Complete

## Overview

This document consolidates research findings for implementing CSS loading and live reload in the Eligian VS Code extension preview. Research covered three critical areas: webview CSS injection, file system watchers, and URI conversion.

## R001: VS Code Webview CSS Injection Patterns

### Decision: Use `<style>` tags with `textContent` for hot-reload

**Rationale**:
- True hot-reload without page refresh (Eligius engine continues running)
- CSS updates instantly (no browser caching issues)
- Security best practice (textContent prevents XSS, innerHTML is vulnerable)
- Full control over CSS lifecycle (add, update, remove by ID)

**Alternatives Considered**:
- **`<link>` tags with href changes**: Rejected - causes full page reload, breaks timeline state
- **`<link>` with query params for cache busting**: Rejected - still causes reload, flickers
- **CSS-in-JS libraries**: Rejected - unnecessary complexity, adds dependencies

### Implementation Pattern

**Extension Side** (TypeScript):
```typescript
async function reloadCSS(cssFile: string, webview: vscode.Webview) {
  const cssContent = await fs.promises.readFile(cssFile, 'utf8');
  const cssId = generateCSSId(cssFile); // e.g., hash of file path

  webview.postMessage({
    type: 'css-update',
    cssId: cssId,
    content: cssContent,
    sourceFile: cssFile
  });
}
```

**Webview Side** (JavaScript in HTML):
```javascript
function updateCSS(cssId, content) {
  let styleTag = document.querySelector(`style[data-css-id="${cssId}"]`);
  if (!styleTag) {
    styleTag = document.createElement('style');
    styleTag.setAttribute('data-css-id', cssId);
    document.head.appendChild(styleTag);
  }
  // CRITICAL: Use textContent (NOT innerHTML) for security
  styleTag.textContent = content;
}

window.addEventListener('message', event => {
  if (event.data.type === 'css-update') {
    updateCSS(event.data.cssId, event.data.content);
  }
});
```

### CSS Relative Path Resolution

**Problem**: Inline `<style>` tags have no file context, so `url(./image.png)` paths don't resolve.

**Solution**: Rewrite CSS `url()` paths to webview URIs before sending:

```typescript
function rewriteCSSUrls(css: string, cssFilePath: string, webview: vscode.Webview): string {
  const cssDir = path.dirname(cssFilePath);
  const urlRegex = /url\(['"]?([^'")]+)['"]?\)/g;

  return css.replace(urlRegex, (match, urlPath) => {
    // Skip absolute URLs and data URIs
    if (urlPath.startsWith('http') || urlPath.startsWith('data:')) {
      return match;
    }

    // Resolve relative path and convert to webview URI
    const absolutePath = path.resolve(cssDir, urlPath);
    const webviewUri = webview.asWebviewUri(vscode.Uri.file(absolutePath));
    return `url('${webviewUri.toString()}')`;
  });
}
```

**Result**: `url('./image.png')` → `url('vscode-webview://1a2b3c/workspace/styles/image.png')`

### Content Security Policy

**Required CSP Configuration** (in HTML head):
```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none';
               style-src 'unsafe-inline' ${webview.cspSource};
               script-src ${webview.cspSource};
               img-src ${webview.cspSource} https: data:;
               font-src ${webview.cspSource} data:;">
```

**Key Directives**:
- `style-src 'unsafe-inline'` - Required for inline `<style>` tags (safe with textContent)
- `img-src ${webview.cspSource}` - Allow images from workspace via asWebviewUri
- `font-src ${webview.cspSource}` - Allow fonts from workspace
- `data:` - Support embedded assets (data URIs in CSS)

## R002: File System Watcher Lifecycle Management

### Decision: Single watcher with per-file debouncing

**Rationale**:
- Efficient: One watcher for CSS folder (non-recursive) vs 10 watchers for 10 files
- Simple disposal: One disposable to clean up vs tracking many
- Performance: Non-recursive watchers are 10x+ more efficient than recursive
- Flexible: Easy to add/remove files from tracking set

**Alternatives Considered**:
- **One watcher per file**: Rejected - inefficient, disposal complexity, 10+ watchers for 10 files
- **Recursive watcher (`**/*.css`)**: Rejected - much slower, watches entire workspace unnecessarily
- **Polling**: Rejected - CPU intensive, battery drain, missed changes

### Implementation Pattern

**Watcher Creation**:
```typescript
class CSSWatcherManager {
  private watcher: vscode.FileSystemWatcher | undefined;
  private trackedFiles = new Set<string>();
  private debounceTimers = new Map<string, NodeJS.Timeout>();

  startWatching(cssDir: string, cssFiles: string[], onChange: (file: string) => void) {
    // Single watcher for CSS directory
    const pattern = new vscode.RelativePattern(cssDir, '*.css');
    this.watcher = vscode.workspace.createFileSystemWatcher(pattern);

    // Track which CSS files we care about
    cssFiles.forEach(f => this.trackedFiles.add(f));

    // Handle changes with per-file debouncing
    this.watcher.onDidChange(uri => {
      const filePath = uri.fsPath;
      if (!this.trackedFiles.has(filePath)) return; // Ignore untracked CSS

      // Debounce: 300ms per file (independent timers)
      this.debounceChange(filePath, () => onChange(filePath), 300);
    });
  }

  private debounceChange(file: string, callback: () => void, delay: number) {
    const existing = this.debounceTimers.get(file);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.debounceTimers.delete(file);
      callback();
    }, delay);

    this.debounceTimers.set(file, timer);
  }

  dispose() {
    this.watcher?.dispose();
    this.debounceTimers.forEach(timer => clearTimeout(timer));
    this.debounceTimers.clear();
    this.trackedFiles.clear();
  }
}
```

### Debouncing Strategy

**Decision**: 300ms debounce per file

**Rationale**:
- Auto-save typically fires every 200-500ms
- 300ms is long enough to avoid double-reloads
- Short enough to feel instant (<500ms success criterion)
- Per-file debouncing prevents one file blocking others

**Alternatives Considered**:
- **100ms**: Rejected - too short, auto-save still causes double-reload
- **500ms**: Rejected - feels sluggish, misses SC-002 (<300ms reload time)
- **Global debounce**: Rejected - one file change blocks all others unnecessarily

### Disposal Management

**Critical Pattern**: Always dispose watchers to prevent memory leaks

```typescript
// Register with extension context for automatic cleanup
context.subscriptions.push(watcherManager);

// Dispose when preview closes
panel.onDidDispose(() => {
  watcherManager.dispose();
});

// Dispose when extension deactivates
export function deactivate() {
  watcherManager.dispose();
}
```

**Memory Leak Prevention**:
- Add watcher to `context.subscriptions` (VS Code cleans up on deactivate)
- Dispose in `panel.onDidDispose()` (cleanup when preview closes)
- Clear all debounce timers on dispose
- Null out references after disposal

## R003: Webview URI Conversion and Path Resolution

### Decision: Use asWebviewUri for all CSS files

**Rationale**:
- Security: Only approved paths accessible via `vscode-webview://` protocol
- Platform-independent: Works on Windows, Mac, Linux
- Workspace-relative: Paths relative to workspace folders
- Required: Webviews cannot access `file://` protocol directly

**Alternatives Considered**:
- **Base URL approach**: Rejected - requires `<base>` tag, complicates multi-directory CSS
- **Data URLs**: Rejected - large files, no caching, complicates reload
- **File protocol**: Rejected - security risk, VS Code blocks it

### Implementation Pattern

**Converting CSS File Paths**:
```typescript
function loadCSS(cssFilePath: string, webview: vscode.Webview): string {
  const cssUri = webview.asWebviewUri(vscode.Uri.file(cssFilePath));
  return cssUri.toString(); // vscode-webview://authority/path/to/file.css
}
```

**Windows Path Compatibility**:
```typescript
// CRITICAL: CSS doesn't accept backslashes in url()
const normalizedPath = cssFilePath.replace(/\\/g, '/');
const cssUri = webview.asWebviewUri(vscode.Uri.file(normalizedPath));
```

### Security Configuration

**Webview Options** (required for resource access):
```typescript
const panel = vscode.window.createWebviewPanel(
  'eligianPreview',
  'Eligian Preview',
  vscode.ViewColumn.Two,
  {
    enableScripts: true,
    localResourceRoots: [
      vscode.Uri.file(workspaceFolder.uri.fsPath)
    ]
  }
);
```

**Path Validation** (prevent directory traversal):
```typescript
function validateCSSPath(cssPath: string, workspaceRoot: string): boolean {
  const resolved = path.resolve(workspaceRoot, cssPath);

  // Must be within workspace
  if (!resolved.startsWith(workspaceRoot)) {
    return false;
  }

  // Must not contain path traversal
  if (cssPath.includes('..') || cssPath.startsWith('/')) {
    return false;
  }

  return true;
}
```

### Base URL Strategy (Future Enhancement)

**Current**: Inline CSS with rewritten `url()` paths (R001)
**Future**: Could use `<base>` tag for true relative path resolution

```html
<base href="${webview.asWebviewUri(vscode.Uri.file(documentDir))}/">
<link rel="stylesheet" href="${cssUri}">
```

**Pros**: Simpler, CSS unchanged, relative paths work naturally
**Cons**: All CSS must be in same directory, complicates multi-directory imports

**Decision**: Use inline CSS (R001) for MVP, consider base URL approach later if needed

## Message Protocol

### Extension → Webview Messages

```typescript
type CSSMessage =
  | { type: 'css-load'; cssId: string; content: string; sourceFile: string; index: number }
  | { type: 'css-reload'; cssId: string; content: string; sourceFile: string }
  | { type: 'css-remove'; cssId: string }
  | { type: 'css-error'; cssId: string; error: string; sourceFile: string };
```

### Webview → Extension Messages (Optional Feedback)

```typescript
type WebviewMessage =
  | { type: 'css-loaded'; cssId: string }
  | { type: 'css-load-failed'; cssId: string; error: string };
```

## Implementation Recommendations

### Phase 1: Basic CSS Loading (MVP - P1)
1. Extract `cssFiles` from compiled Eligian config
2. Load CSS files from disk
3. Rewrite `url()` paths with `asWebviewUri`
4. Inject CSS into webview via postMessage + `<style>` tags
5. Configure CSP to allow resources

### Phase 2: Live Reload (P2)
1. Create single FileSystemWatcher for CSS directory
2. Track imported CSS files in Set
3. Debounce changes (300ms per file)
4. Reload CSS on change via postMessage
5. Proper disposal on preview close

### Phase 3: Error Handling (P3)
1. Catch file read errors (missing, locked, permission denied)
2. Show VS Code notification with file path
3. Keep previous valid CSS on error
4. Retry on fix (watcher detects change)

### Testing Strategy

**Unit Tests** (Vitest):
- CSS path rewriting (url() regex, absolute paths, data URLs)
- Debouncing logic (timing, per-file independence)
- Path validation (traversal, absolute paths)

**Integration Tests** (Manual):
- CSS loads in preview
- Changes reflect within 300ms
- Timeline state preserved during reload
- Multiple CSS files load in order
- Error notifications appear

**Memory Leak Tests**:
- Open/close preview 10 times
- Check VS Code DevTools Memory tab
- Verify watcher disposal (no leaks)

## References

- [VS Code Webview API](https://code.visualstudio.com/api/extension-guides/webview)
- [FileSystemWatcher API](https://code.visualstudio.com/api/references/vscode-api#FileSystemWatcher)
- [Webview CSP Guide](https://code.visualstudio.com/api/extension-guides/webview#content-security-policy)
- [Stencil CSS Injection Security Fix](https://github.com/ionic-team/stencil/actions/runs/7878387897)

## Key Takeaways

1. **CSS Hot-Reload**: Use inline `<style>` tags with `textContent`, not `<link>` tags
2. **File Watching**: Single watcher with 300ms per-file debouncing
3. **Path Resolution**: Rewrite CSS `url()` paths with `asWebviewUri`
4. **Security**: Configure CSP, validate paths, use textContent (not innerHTML)
5. **Disposal**: Always clean up watchers to prevent memory leaks
6. **Performance**: Non-recursive watchers, early filtering, aggressive debouncing
