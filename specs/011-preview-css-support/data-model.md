# Data Model: Preview CSS Support

**Feature**: 011-preview-css-support
**Date**: 2025-10-25

## Overview

This document defines the data structures, state management, and lifecycle for CSS loading and live reload in the Eligian preview webview.

## Entities

### 1. CSSWatcherState

**Purpose**: Manages file system watchers for imported CSS files and tracks lifecycle.

**Properties**:
- `watcher: vscode.FileSystemWatcher | undefined` - Single watcher for CSS directory
- `trackedFiles: Set<string>` - Absolute paths of CSS files we're watching
- `debounceTimers: Map<string, NodeJS.Timeout>` - Per-file debounce timers (300ms)
- `cssDirectory: string` - Directory being watched (parent of CSS files)
- `isActive: boolean` - Whether watcher is currently active

**Lifecycle**:
1. **Creation**: When preview opens and CSS files are detected
2. **Active**: Watches for file changes, triggers reloads
3. **Disposal**: On preview close or Eligian file change (stop watching, clear timers)

**Invariants**:
- `trackedFiles` only contains paths within `cssDirectory`
- `debounceTimers` keys are subset of `trackedFiles`
- `watcher` exists iff `isActive` is true

**State Transitions**:
```
[Created] → startWatching() → [Active] → dispose() → [Disposed]
                                  ↓
                          updateTrackedFiles() (stays Active)
```

---

### 2. CSSLoadRequest

**Purpose**: Represents a CSS file loading operation (initial load or reload).

**Properties**:
- `filePath: string` - Absolute file system path to CSS file
- `cssId: string` - Unique identifier (hash of file path for tracking)
- `content: string` - CSS file content (raw text)
- `rewrittenContent: string` - CSS with url() paths rewritten to webview URIs
- `loadOrder: number` - Index in import order (for `<style>` tag ordering)
- `timestamp: number` - When load was initiated (for debouncing)

**Computed Properties**:
- `webviewUri: vscode.Uri` - Result of `webview.asWebviewUri(Uri.file(filePath))`
- `sourceFile: string` - Original file path for error messages

**Validation Rules**:
- `filePath` must exist on disk
- `filePath` must be within workspace (no traversal)
- `filePath` must have `.css` extension
- `loadOrder` must be >= 0
- `content` must be valid UTF-8 text

**Operations**:
- `load()`: Read file from disk, rewrite URLs, prepare for injection
- `reload()`: Re-read file, update content, preserve cssId and loadOrder
- `validate()`: Check path security, file existence

---

### 3. WebviewCSSMessage

**Purpose**: Message payload sent from extension to webview for CSS operations.

**Type Variants**:

#### css-load (Initial CSS injection)
```typescript
{
  type: 'css-load',
  cssId: string,           // Unique ID for tracking (hash of file path)
  content: string,         // Rewritten CSS content
  sourceFile: string,      // Original file path (for debugging)
  loadOrder: number        // Index for <style> tag ordering
}
```

#### css-reload (Hot-reload existing CSS)
```typescript
{
  type: 'css-reload',
  cssId: string,           // ID of CSS to replace
  content: string,         // Updated rewritten CSS content
  sourceFile: string       // Original file path
}
```

#### css-remove (Remove CSS from webview)
```typescript
{
  type: 'css-remove',
  cssId: string            // ID of CSS to remove
}
```

#### css-error (CSS loading failure)
```typescript
{
  type: 'css-error',
  cssId: string,           // ID of failed CSS
  filePath: string,        // Original file path
  error: string,           // Human-readable error message
  code: 'NOT_FOUND' | 'READ_ERROR' | 'PARSE_ERROR'
}
```

**Protocol Guarantees**:
- `cssId` uniquely identifies CSS file (stable across reloads)
- `loadOrder` establishes CSS cascade order (matches Eligian import order)
- Messages are idempotent (safe to send multiple times)

---

### 4. CSSInjectionState

**Purpose**: Tracks injected CSS in webview (webview-side state).

**Properties** (in webview JavaScript):
- `loadedCSS: Map<cssId, HTMLStyleElement>` - Map of cssId to <style> tags
- `loadOrder: Map<cssId, number>` - Load order for each CSS (for re-ordering)
- `sourceFiles: Map<cssId, string>` - Original file paths (for debugging)

**Operations** (webview JavaScript):
```javascript
function injectCSS(cssId, content, loadOrder) {
  let styleTag = loadedCSS.get(cssId);
  if (!styleTag) {
    styleTag = document.createElement('style');
    styleTag.setAttribute('data-css-id', cssId);
    styleTag.setAttribute('data-load-order', loadOrder.toString());
    document.head.appendChild(styleTag);
    loadedCSS.set(cssId, styleTag);
  }
  styleTag.textContent = content; // Use textContent (NOT innerHTML) for security
  loadOrder.set(cssId, loadOrder);
}

function reloadCSS(cssId, content) {
  const styleTag = loadedCSS.get(cssId);
  if (styleTag) {
    styleTag.textContent = content; // Hot-reload: just update content
  }
}

function removeCSS(cssId) {
  const styleTag = loadedCSS.get(cssId);
  if (styleTag) {
    styleTag.remove();
    loadedCSS.delete(cssId);
    loadOrder.delete(cssId);
  }
}
```

**Invariants**:
- `loadedCSS` keys match `loadOrder` keys
- `<style>` tags ordered by `data-load-order` attribute (CSS cascade)
- All `<style>` tags have `data-css-id` attribute

---

### 5. CSSErrorState

**Purpose**: Tracks CSS loading errors and fallback behavior.

**Properties**:
- `failedFiles: Map<filePath, ErrorInfo>` - Files that failed to load
- `lastValidContent: Map<cssId, string>` - Previous valid CSS content (fallback)
- `errorNotifications: Map<cssId, vscode.Disposable>` - Active error notifications

**ErrorInfo Structure**:
```typescript
{
  filePath: string,
  error: Error,
  timestamp: number,
  attempts: number,        // Number of retry attempts
  lastAttempt: number      // Timestamp of last retry
}
```

**Behavior**:
- On error: Show VS Code notification, keep previous valid CSS
- On fix: Auto-reload via watcher, clear error state
- Rate limiting: Max 3 error notifications per minute per file

---

## State Management

### Extension State (Extension Host)

**Global State** (per extension):
```typescript
{
  activeWatchers: Map<panelId, CSSWatcherState>,  // Active watchers per preview
  cssCache: Map<filePath, { content: string, mtime: number }>  // File cache
}
```

**Per-Preview State** (per webview panel):
```typescript
{
  panelId: string,
  webview: vscode.Webview,
  watcherState: CSSWatcherState,
  loadedCSS: Map<cssId, CSSLoadRequest>,
  errorState: CSSErrorState
}
```

### Webview State (Webview Context)

**State** (in webview JavaScript):
```javascript
{
  loadedCSS: Map<cssId, HTMLStyleElement>,
  loadOrder: Map<cssId, number>,
  sourceFiles: Map<cssId, string>
}
```

---

## Lifecycle Flows

### Initial CSS Load Flow

1. **Extract CSS Files**: Get `cssFiles` array from compiled Eligian config
2. **Create Watcher**: Initialize `CSSWatcherState` for CSS directory
3. **Load CSS**: For each CSS file, create `CSSLoadRequest` and load content
4. **Rewrite URLs**: Convert `url()` paths to webview URIs
5. **Inject CSS**: Send `css-load` messages to webview (in order)
6. **Webview Inject**: Create `<style>` tags with content

### CSS Hot-Reload Flow

1. **File Change**: Watcher detects CSS file change
2. **Debounce**: Wait 300ms (per-file timer)
3. **Reload**: Create new `CSSLoadRequest`, load updated content
4. **Rewrite URLs**: Convert `url()` paths again
5. **Inject Update**: Send `css-reload` message to webview
6. **Webview Update**: Update existing `<style>` tag content

### CSS Error Flow

1. **Error Detected**: File read fails (not found, permission denied)
2. **Update Error State**: Add to `failedFiles` map
3. **Show Notification**: Display VS Code error message with file path
4. **Keep Previous CSS**: Webview retains last valid CSS (no change)
5. **Watch for Fix**: Watcher continues monitoring
6. **Auto-Retry**: On file change, attempt reload automatically

### Cleanup Flow

1. **Preview Close**: User closes preview panel
2. **Dispose Watcher**: Call `watcherState.dispose()`
3. **Clear Timers**: Cancel all debounce timers
4. **Clear State**: Remove from `activeWatchers` map
5. **Dispose Notifications**: Clear all error notifications

---

## Data Flow Diagrams

### Initial Load
```
[Eligian File] → [Compiler] → [cssFiles Array]
                                      ↓
[Extension] → Load CSS → Rewrite URLs → [css-load Message]
                                              ↓
                                        [Webview] → Inject <style>
```

### Hot Reload
```
[CSS File Change] → [FileSystemWatcher] → [Debounce 300ms]
                                                ↓
[Extension] → Load CSS → Rewrite URLs → [css-reload Message]
                                              ↓
                                [Webview] → Update <style>.textContent
```

### Error Handling
```
[CSS Load Error] → [Extension] → Show Notification + Keep Previous CSS
                                           ↓
                                  [CSSErrorState.lastValidContent]
                                           ↓
                              [Watch for Fix] → Auto-retry on change
```

---

## Security Considerations

### Path Validation
- All CSS file paths MUST be validated before loading
- Reject absolute paths (`/`, `C:\`)
- Reject path traversal (`..`, `../`)
- Reject paths outside workspace

### Content Security
- Use `textContent` (NOT `innerHTML`) for CSS injection (prevents XSS)
- Configure CSP to allow `style-src 'unsafe-inline'` (required for inline styles)
- Use `asWebviewUri` for all resource URLs (enforces security boundary)

### Resource Access
- Configure `localResourceRoots` to workspace only
- Validate all `url()` paths in CSS before rewriting
- Skip external URLs (http://, https://) - don't rewrite

---

## Performance Considerations

### Debouncing
- 300ms per-file debounce (balances responsiveness vs reload frequency)
- Independent timers per file (one slow file doesn't block others)
- Clear timers on disposal (prevent memory leaks)

### File Watching
- Single watcher for CSS directory (efficient)
- Non-recursive pattern (`*.css` not `**/*.css`) - 10x faster
- Early filtering (only process tracked files)

### Caching
- Cache CSS content with mtime (avoid redundant reads)
- Invalidate on watcher event (ensures fresh content)
- Cache max 10 files (spec limit)

---

## Testing Strategy

### Unit Tests (Vitest)
- `CSSWatcherState`: Creation, tracking, debouncing, disposal
- `CSSLoadRequest`: Path validation, URL rewriting, content loading
- `WebviewCSSMessage`: Message serialization, type validation
- `CSSErrorState`: Error tracking, fallback behavior

### Integration Tests (Manual)
- CSS loads in preview on open
- CSS hot-reloads within 300ms of save
- Multiple CSS files load in correct order
- Timeline state preserved during reload
- Error notifications appear on failures
- Watchers disposed on preview close (no leaks)

---

## References

- [VS Code FileSystemWatcher API](https://code.visualstudio.com/api/references/vscode-api#FileSystemWatcher)
- [VS Code Webview API](https://code.visualstudio.com/api/extension-guides/webview)
- Feature Spec: [spec.md](./spec.md)
- Research: [research.md](./research.md)
