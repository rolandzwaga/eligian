# Research: VS Code File System Watcher Lifecycle Management

**Research ID**: R002
**Feature**: 011-preview-css-support
**Date**: 2025-10-25
**Focus**: CSS live reload file watcher implementation

## Executive Summary

This research investigates VS Code's `FileSystemWatcher` API for implementing CSS live reload in the Eligian preview webview. The implementation needs to watch up to 10 imported CSS files, handle rapid changes from auto-save, and properly manage watcher lifecycle to prevent memory leaks.

**Key Findings**:
- Use single watcher with glob pattern for multiple files (more efficient than multiple watchers)
- Implement 300ms debouncing for rapid auto-save events
- Always dispose watchers when preview closes or CSS imports change
- Keep recursive watching to minimum (use non-recursive for specific files)
- Add watchers to `context.subscriptions` for automatic cleanup

## 1. Watcher Creation

### 1.1 Core API

VS Code provides `vscode.workspace.createFileSystemWatcher()` for file watching:

```typescript
function createFileSystemWatcher(
  globPattern: GlobPattern,
  ignoreCreateEvents?: boolean,
  ignoreChangeEvents?: boolean,
  ignoreDeleteEvents?: boolean
): FileSystemWatcher
```

**Parameters**:
- `globPattern`: String pattern or `RelativePattern` for files to watch
- `ignoreCreateEvents`: Skip creation events (default: false)
- `ignoreChangeEvents`: Skip change events (default: false)
- `ignoreDeleteEvents`: Skip deletion events (default: false)

**Returns**: `FileSystemWatcher` with disposal method and event emitters

### 1.2 Single vs Multiple Watchers

**Recommended: Single Watcher with Specific File List**

For watching up to 10 CSS files, use a single watcher with a pattern that matches all CSS files in a specific location:

```typescript
// Option 1: Watch all CSS in a folder (if CSS files are co-located)
const watcher = vscode.workspace.createFileSystemWatcher(
  new vscode.RelativePattern(cssFolder, '*.css')
);

// Option 2: Watch workspace CSS files (if scattered)
const watcher = vscode.workspace.createFileSystemWatcher('**/*.css');
// Then filter events to only imported files
```

**Why Single Watcher?**
- **Performance**: Multiple identical watch requests are automatically deduplicated by VS Code
- **Resource efficiency**: Recursive file watching is resource-intensive
- **Simpler lifecycle**: Only one disposable to manage

**Alternative: Multiple Watchers for Specific Files**

If you need precise control over which files are watched:

```typescript
const watchers: vscode.FileSystemWatcher[] = [];

cssFilePaths.forEach(filePath => {
  const watcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(
      vscode.Uri.file(path.dirname(filePath)),
      path.basename(filePath)
    ),
    true,  // ignore create (file already exists)
    false, // watch changes
    false  // watch deletes
  );
  watchers.push(watcher);
});
```

**Trade-offs**:
- More precise control over which files trigger events
- More disposables to manage
- Potentially more resource usage (though VS Code deduplicates internally)

### 1.3 Glob Pattern Best Practices

**Workspace-Relative Patterns**:
```typescript
// Watch all CSS in first workspace folder
vscode.workspace.createFileSystemWatcher(
  new vscode.RelativePattern(
    vscode.workspace.workspaceFolders[0],
    '**/*.css'
  )
);
```

**Absolute Path Patterns** (for files outside workspace):
```typescript
// Watch CSS outside workspace (non-recursive)
vscode.workspace.createFileSystemWatcher(
  new vscode.RelativePattern(
    vscode.Uri.file('/absolute/path/to/folder'),
    '*.css'
  )
);
```

**Pattern Efficiency**:
- `**/*.css` - Recursive (scans all subfolders) - resource intensive
- `*.css` - Non-recursive (current folder only) - efficient
- Prefer non-recursive patterns when possible

### 1.4 Watcher Architecture

VS Code uses two internal implementations:

1. **Recursive Watching**: `ParcelWatcher` via parcel-watcher library (for folders)
2. **Non-Recursive Watching**: `NodeJSWatcherLibrary` via `fs.watch` (for specific files)

**Deduplication**: Identical watch requests (same path + correlation ID) are automatically consolidated to prevent wasteful duplicate monitoring.

**Path Suspension/Resume**: When watched paths don't exist initially or are deleted, the watcher suspends operations. Recovery uses either existing recursive watchers or polling via `fs.watchFile` every 5 seconds.

## 2. Change Event Handling

### 2.1 Event Types

`FileSystemWatcher` provides three event emitters:

```typescript
interface FileSystemWatcher {
  onDidCreate: Event<Uri>;  // File/folder created
  onDidChange: Event<Uri>;  // File/folder modified
  onDidDelete: Event<Uri>;  // File/folder deleted
  dispose(): any;
}
```

**For CSS Live Reload**:
- `onDidChange`: Primary event - CSS file modified
- `onDidDelete`: Optional - handle CSS file deletion gracefully
- `onDidCreate`: Usually ignore (CSS already imported before preview opens)

### 2.2 Event Subscription Pattern

```typescript
const watcher = vscode.workspace.createFileSystemWatcher('**/*.css');

// Subscribe to change events
const changeSubscription = watcher.onDidChange((uri: vscode.Uri) => {
  console.log('File changed:', uri.fsPath);
  // Reload CSS in webview
});

// Subscribe to delete events
const deleteSubscription = watcher.onDidDelete((uri: vscode.Uri) => {
  console.log('File deleted:', uri.fsPath);
  // Remove CSS from webview
});

// Both subscriptions are Disposable objects
// Dispose individually or dispose the watcher (disposes all subscriptions)
```

### 2.3 Event Frequency and Filtering

**Event Duplication**: Multiple events can fire for the same file change. Debouncing is essential.

**Filtering Events**:
```typescript
// Track which CSS files are imported
const importedCssFiles = new Set<string>([
  '/path/to/style1.css',
  '/path/to/style2.css'
]);

watcher.onDidChange((uri: vscode.Uri) => {
  // Only process imported CSS files
  if (!importedCssFiles.has(uri.fsPath)) {
    return;
  }

  // Process change
  reloadCss(uri);
});
```

### 2.4 Debouncing Strategy

**Why Debounce?**
- Auto-save can trigger every 300ms-3s (depending on user settings)
- Build tools may write files multiple times in quick succession
- Prevent excessive webview reloads that degrade performance

**Recommended Timing**: **300ms debounce delay**

This balances responsiveness with stability:
- Short enough for quick feedback during development
- Long enough to batch rapid saves/changes
- Aligns with common auto-save intervals

**Implementation**:

```typescript
// Debounce utility function
function debounce<T extends (...args: any[]) => any>(
  callback: T,
  waitMs: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  return (...args: Parameters<T>): void => {
    clearTimeout(timeout);
    timeout = setTimeout(() => callback(...args), waitMs);
  };
}

// Usage with file watcher
const watcher = vscode.workspace.createFileSystemWatcher('**/*.css');

const reloadCss = (uri: vscode.Uri) => {
  console.log('Reloading CSS:', uri.fsPath);
  // Send message to webview to reload CSS
  panel.webview.postMessage({
    type: 'reloadCss',
    cssPath: uri.fsPath
  });
};

// Debounced handler (300ms delay)
const debouncedReload = debounce(reloadCss, 300);

watcher.onDidChange(debouncedReload);
watcher.onDidCreate(debouncedReload);
```

**Per-File Debouncing** (more advanced):

```typescript
// Debounce each file independently
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

watcher.onDidChange((uri: vscode.Uri) => {
  const filePath = uri.fsPath;

  // Clear existing timer for this file
  const existingTimer = debounceTimers.get(filePath);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  // Set new timer
  const timer = setTimeout(() => {
    reloadCss(uri);
    debounceTimers.delete(filePath);
  }, 300);

  debounceTimers.set(filePath, timer);
});
```

**Benefits of Per-File Debouncing**:
- Changes to different CSS files don't interfere with each other
- More precise control over reload timing
- Better UX when editing multiple CSS files simultaneously

## 3. Watcher Disposal

### 3.1 Why Disposal is Critical

**Memory Leaks**: Failing to dispose watchers is a common source of memory leaks in VS Code extensions.

**Resource Consumption**: Each watcher consumes system resources (file handles, memory for event buffers).

**Event Pollution**: Undisposed watchers continue emitting events, potentially triggering stale handlers.

### 3.2 Disposal Pattern

**Basic Disposal**:
```typescript
const watcher = vscode.workspace.createFileSystemWatcher('**/*.css');

// ... use watcher ...

// Dispose when done
watcher.dispose();
```

**Automatic Disposal via Extension Context**:
```typescript
export function activate(context: vscode.ExtensionContext) {
  const watcher = vscode.workspace.createFileSystemWatcher('**/*.css');

  // Add to subscriptions for automatic cleanup on extension deactivation
  context.subscriptions.push(watcher);

  // Watcher will be automatically disposed when extension deactivates
}
```

**Manual Disposal on Preview Close**:
```typescript
class EligianPreviewManager {
  private cssWatchers: vscode.FileSystemWatcher[] = [];

  createPreview(document: vscode.TextDocument) {
    const panel = vscode.window.createWebviewPanel(/* ... */);

    // Create CSS watcher
    const watcher = vscode.workspace.createFileSystemWatcher('**/*.css');
    watcher.onDidChange(this.reloadCss.bind(this));
    this.cssWatchers.push(watcher);

    // Dispose watcher when panel closes
    panel.onDidDispose(() => {
      this.cssWatchers.forEach(w => w.dispose());
      this.cssWatchers = [];
    });
  }
}
```

### 3.3 When to Dispose

**Trigger Events**:

1. **Preview Panel Closes**:
   ```typescript
   panel.onDidDispose(() => {
     cssWatcher.dispose();
   });
   ```

2. **Eligian File Changes** (new CSS imports):
   ```typescript
   // Old watcher disposal
   oldWatcher?.dispose();

   // Create new watcher for updated CSS imports
   const newWatcher = createCssWatcher(newCssImports);
   ```

3. **Extension Deactivates**:
   ```typescript
   export function deactivate() {
     // Clean up all watchers
     allWatchers.forEach(w => w.dispose());
   }
   ```

### 3.4 Disposal Lifecycle Example

**Complete Preview Manager with Proper Disposal**:

```typescript
class CssLiveReloadManager implements vscode.Disposable {
  private watcher: vscode.FileSystemWatcher | undefined;
  private importedCssFiles = new Set<string>();
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private panel: vscode.WebviewPanel,
    cssFiles: string[]
  ) {
    this.importedCssFiles = new Set(cssFiles);
    this.setupWatcher();
  }

  private setupWatcher() {
    // Dispose existing watcher if any
    this.watcher?.dispose();

    // Create new watcher
    this.watcher = vscode.workspace.createFileSystemWatcher('**/*.css');

    // Handle changes with debouncing
    this.watcher.onDidChange((uri) => {
      if (!this.importedCssFiles.has(uri.fsPath)) {
        return;
      }

      // Per-file debouncing
      const existingTimer = this.debounceTimers.get(uri.fsPath);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      const timer = setTimeout(() => {
        this.reloadCss(uri);
        this.debounceTimers.delete(uri.fsPath);
      }, 300);

      this.debounceTimers.set(uri.fsPath, timer);
    });
  }

  private reloadCss(uri: vscode.Uri) {
    this.panel.webview.postMessage({
      type: 'reloadCss',
      cssPath: uri.fsPath
    });
  }

  updateCssFiles(newCssFiles: string[]) {
    // Clear old timers
    this.debounceTimers.forEach(timer => clearTimeout(timer));
    this.debounceTimers.clear();

    // Update tracked files
    this.importedCssFiles = new Set(newCssFiles);

    // Recreate watcher with new files
    this.setupWatcher();
  }

  dispose() {
    // Clear all timers
    this.debounceTimers.forEach(timer => clearTimeout(timer));
    this.debounceTimers.clear();

    // Dispose watcher
    this.watcher?.dispose();
    this.watcher = undefined;
  }
}

// Usage in preview manager
export function createPreview(
  context: vscode.ExtensionContext,
  document: vscode.TextDocument
) {
  const panel = vscode.window.createWebviewPanel(/* ... */);

  // Parse CSS imports from document
  const cssFiles = extractCssImports(document);

  // Create live reload manager
  const liveReloadManager = new CssLiveReloadManager(panel, cssFiles);

  // Add to context for automatic cleanup
  context.subscriptions.push(liveReloadManager);

  // Dispose when panel closes
  panel.onDidDispose(() => {
    liveReloadManager.dispose();
  });

  // Update when document changes
  vscode.workspace.onDidChangeTextDocument((event) => {
    if (event.document === document) {
      const newCssFiles = extractCssImports(event.document);
      liveReloadManager.updateCssFiles(newCssFiles);
    }
  });
}
```

## 4. Performance Considerations

### 4.1 Watcher Limits

**System Limits**:
- **Linux**: File handle limits can be exhausted by watching large folders recursively
- **macOS/Windows**: More generous limits, but still finite
- **VS Code Warning**: Displays notification when file handle limits are approached

**Recommended Limits**:
- Up to 10 watchers: No issues
- 10-50 watchers: Monitor resource usage
- 50+ watchers: Consider alternative approaches (single watcher with filtering)

### 4.2 Recursive vs Non-Recursive Watching

**Recursive Watching** (`**/*.css`):
- Monitors all subfolders
- Resource-intensive (uses parcel-watcher library)
- Respects `files.watcherExclude` settings
- Use when: CSS files are scattered across workspace

**Non-Recursive Watching** (`*.css`):
- Monitors specific folder only
- Efficient (uses `fs.watch`)
- Bypasses exclude settings
- Use when: CSS files are co-located in known folders

**Performance Impact**:
- Recursive: High CPU/memory for large folder trees
- Non-recursive: Minimal overhead

### 4.3 Exclude Rules

**Default Exclusions** (`files.watcherExclude`):
- `**/node_modules/**`
- `**/.git/**`
- Other common build/dependency folders

**Custom Exclusions**:
```typescript
// Watchers automatically respect user's files.watcherExclude settings
// Non-recursive watchers bypass excludes (useful for watching node_modules)
const watcher = vscode.workspace.createFileSystemWatcher(
  new vscode.RelativePattern(
    vscode.Uri.file('/path/to/node_modules'),
    '*.css'
  )
);
```

### 4.4 Performance Best Practices

**1. Minimize Recursive Watchers**:
```typescript
// ❌ Bad: Recursive watcher for few files
const watcher = vscode.workspace.createFileSystemWatcher('**/*.css');

// ✅ Good: Non-recursive watcher for specific files
const watcher = vscode.workspace.createFileSystemWatcher(
  new vscode.RelativePattern(
    vscode.Uri.file('/path/to/css'),
    '*.css'
  )
);
```

**2. Filter Events Early**:
```typescript
// Filter to only imported CSS files immediately
watcher.onDidChange((uri) => {
  if (!importedCssFiles.has(uri.fsPath)) {
    return; // Skip processing
  }
  reloadCss(uri);
});
```

**3. Debounce Aggressively**:
```typescript
// Use 300-500ms debounce to batch rapid changes
const debouncedReload = debounce(reloadCss, 300);
```

**4. Dispose Promptly**:
```typescript
// Dispose as soon as watcher is no longer needed
panel.onDidDispose(() => {
  watcher.dispose(); // Free resources immediately
});
```

**5. Use Event Ignore Flags**:
```typescript
// If you only care about changes, ignore create/delete
const watcher = vscode.workspace.createFileSystemWatcher(
  '**/*.css',
  true,  // ignore create
  false, // watch changes
  true   // ignore delete
);
```

### 4.5 Memory Leak Prevention Checklist

- [ ] Add watcher to `context.subscriptions`
- [ ] Dispose watcher in `panel.onDidDispose()`
- [ ] Clear debounce timers on disposal
- [ ] Null out watcher reference after disposal
- [ ] Remove event handlers before disposal (automatic via `dispose()`)
- [ ] Test disposal with VS Code memory profiler (Help > Toggle Developer Tools > Memory)

## 5. Recommended Implementation for CSS Live Reload

### 5.1 Architecture

```
EligianPreviewProvider
  └── CssLiveReloadManager (per preview panel)
        ├── FileSystemWatcher (single watcher for all CSS)
        ├── Debounce timers (Map<filePath, timeout>)
        └── Imported CSS tracking (Set<filePath>)
```

### 5.2 Implementation Plan

**Step 1: CSS Import Extraction**

Parse `.eligian` file to extract `@import` CSS paths:

```typescript
function extractCssImports(document: vscode.TextDocument): string[] {
  const cssFiles: string[] = [];
  const text = document.getText();
  const importRegex = /@import\s+["']([^"']+\.css)["']/g;

  let match;
  while ((match = importRegex.exec(text)) !== null) {
    const cssPath = match[1];
    // Resolve relative to document path
    const absolutePath = path.resolve(
      path.dirname(document.uri.fsPath),
      cssPath
    );
    cssFiles.push(absolutePath);
  }

  return cssFiles;
}
```

**Step 2: Watcher Setup**

```typescript
class CssLiveReloadManager {
  private watcher: vscode.FileSystemWatcher | undefined;
  private importedCssFiles = new Set<string>();
  private debounceTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private panel: vscode.WebviewPanel,
    private documentUri: vscode.Uri,
    cssFiles: string[]
  ) {
    this.importedCssFiles = new Set(cssFiles);
    this.setupWatcher();
  }

  private setupWatcher() {
    this.watcher?.dispose();

    // Get CSS folder (assuming all CSS in same folder as .eligian)
    const cssFolder = path.dirname(this.documentUri.fsPath);

    // Non-recursive watcher (efficient)
    this.watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(
        vscode.Uri.file(cssFolder),
        '*.css'
      ),
      true,  // ignore create
      false, // watch changes
      false  // watch deletes
    );

    // Change handler with debouncing
    this.watcher.onDidChange((uri) => {
      this.handleCssChange(uri);
    });

    // Delete handler
    this.watcher.onDidDelete((uri) => {
      this.handleCssDelete(uri);
    });
  }

  private handleCssChange(uri: vscode.Uri) {
    // Filter to imported files only
    if (!this.importedCssFiles.has(uri.fsPath)) {
      return;
    }

    // Per-file debouncing (300ms)
    const existingTimer = this.debounceTimers.get(uri.fsPath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.reloadCss(uri);
      this.debounceTimers.delete(uri.fsPath);
    }, 300);

    this.debounceTimers.set(uri.fsPath, timer);
  }

  private handleCssDelete(uri: vscode.Uri) {
    if (!this.importedCssFiles.has(uri.fsPath)) {
      return;
    }

    // Notify webview to remove CSS
    this.panel.webview.postMessage({
      type: 'removeCss',
      cssPath: uri.fsPath
    });
  }

  private reloadCss(uri: vscode.Uri) {
    // Read updated CSS content
    const cssContent = fs.readFileSync(uri.fsPath, 'utf8');

    // Send to webview
    this.panel.webview.postMessage({
      type: 'reloadCss',
      cssPath: uri.fsPath,
      content: cssContent
    });
  }

  updateCssFiles(newCssFiles: string[]) {
    // Clear timers
    this.debounceTimers.forEach(timer => clearTimeout(timer));
    this.debounceTimers.clear();

    // Update tracking
    this.importedCssFiles = new Set(newCssFiles);

    // No need to recreate watcher (same folder)
  }

  dispose() {
    this.debounceTimers.forEach(timer => clearTimeout(timer));
    this.debounceTimers.clear();
    this.watcher?.dispose();
    this.watcher = undefined;
  }
}
```

**Step 3: Integration with Preview Provider**

```typescript
export class EligianPreviewProvider {
  private liveReloadManagers = new Map<string, CssLiveReloadManager>();

  async showPreview(
    context: vscode.ExtensionContext,
    document: vscode.TextDocument
  ) {
    const panel = vscode.window.createWebviewPanel(/* ... */);

    // Extract CSS imports
    const cssFiles = extractCssImports(document);

    // Create live reload manager
    const manager = new CssLiveReloadManager(
      panel,
      document.uri,
      cssFiles
    );
    this.liveReloadManagers.set(document.uri.toString(), manager);

    // Add to context subscriptions
    context.subscriptions.push(manager);

    // Dispose on panel close
    panel.onDidDispose(() => {
      manager.dispose();
      this.liveReloadManagers.delete(document.uri.toString());
    });

    // Update on document change
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document === document) {
        const newCssFiles = extractCssImports(event.document);
        manager.updateCssFiles(newCssFiles);
      }
    });
  }
}
```

### 5.3 Webview Integration

**Webview Message Handler**:

```typescript
// In webview HTML/JavaScript
window.addEventListener('message', (event) => {
  const message = event.data;

  switch (message.type) {
    case 'reloadCss':
      reloadCssFile(message.cssPath, message.content);
      break;

    case 'removeCss':
      removeCssFile(message.cssPath);
      break;
  }
});

function reloadCssFile(cssPath: string, newContent: string) {
  // Find existing link tag
  let linkElement = document.querySelector(
    `link[data-css-path="${cssPath}"]`
  );

  if (!linkElement) {
    // Create new link element
    linkElement = document.createElement('link');
    linkElement.rel = 'stylesheet';
    linkElement.setAttribute('data-css-path', cssPath);
    document.head.appendChild(linkElement);
  }

  // Update href with cache-busting timestamp
  const dataUrl = `data:text/css;base64,${btoa(newContent)}`;
  linkElement.href = dataUrl;
}

function removeCssFile(cssPath: string) {
  const linkElement = document.querySelector(
    `link[data-css-path="${cssPath}"]`
  );
  linkElement?.remove();
}
```

## 6. Testing Strategy

### 6.1 Manual Testing

**Test Cases**:

1. **Single CSS Change**:
   - Open preview
   - Modify one CSS file
   - Verify reload after 300ms
   - Check no duplicate reloads

2. **Rapid Changes (Auto-Save)**:
   - Enable auto-save (300ms interval)
   - Type rapidly in CSS file
   - Verify single reload after typing stops

3. **Multiple CSS Files**:
   - Import 10 CSS files
   - Modify different files in quick succession
   - Verify independent debouncing per file

4. **Disposal**:
   - Open preview
   - Close preview
   - Verify watcher disposed (check memory usage)
   - Modify CSS file
   - Verify no reload (watcher inactive)

5. **CSS Import Changes**:
   - Add new CSS import
   - Verify watcher tracks new file
   - Remove CSS import
   - Verify changes to removed file don't trigger reload

### 6.2 Memory Leak Testing

**VS Code Developer Tools**:

1. Open Command Palette > "Developer: Toggle Developer Tools"
2. Go to Memory tab
3. Take heap snapshot before opening preview
4. Open preview with 10 CSS files
5. Take heap snapshot
6. Close preview
7. Take heap snapshot
8. Verify watcher objects are collected (search for "FileSystemWatcher")

**Expected Results**:
- Watcher count increases when preview opens
- Watcher count decreases to original when preview closes
- No retained FileSystemWatcher objects after closure

## 7. References

### 7.1 Official Documentation

- [VS Code API - FileSystemWatcher](https://code.visualstudio.com/api/references/vscode-api#FileSystemWatcher)
- [VS Code API - workspace.createFileSystemWatcher](https://code.visualstudio.com/api/references/vscode-api#workspace.createFileSystemWatcher)
- [File Watcher Internals Wiki](https://github.com/microsoft/vscode/wiki/File-Watcher-Internals)

### 7.2 Performance Resources

- [Reducing VSCode Memory Consumption](https://dev.to/claudiodavi/reducing-vscode-memory-consumption-527k)
- [Avoiding Memory Leaks in Visual Studio Extensions](https://devblogs.microsoft.com/visualstudio/avoiding-memory-leaks-in-visual-studio-editor-extensions/)
- [File Watcher Issues Wiki](https://github.com/microsoft/vscode/wiki/File-Watcher-Issues)

## 8. Recommendations

### 8.1 Implementation Approach

**For CSS Live Reload in Eligian Preview**:

1. **Use Single Watcher**: Create one non-recursive watcher for CSS folder
2. **Filter Events**: Only process changes to imported CSS files
3. **Per-File Debouncing**: 300ms delay per file for auto-save tolerance
4. **Proper Disposal**: Dispose on preview close and add to context subscriptions
5. **Webview Hot Reload**: Use data URLs to bypass browser cache

### 8.2 Configuration

**Watcher Settings**:
- Pattern: `*.css` (non-recursive, same folder as `.eligian`)
- Ignore create: `true` (CSS already imported)
- Ignore change: `false` (primary reload trigger)
- Ignore delete: `false` (handle gracefully in webview)

**Debounce Timing**:
- 300ms default (balances responsiveness and stability)
- Configurable via extension settings (optional)

### 8.3 Future Enhancements

**Performance Optimizations**:
- Partial CSS reload (only changed rules, not entire file)
- CSS source maps for better debugging
- Incremental parsing (only re-parse changed CSS)

**Developer Experience**:
- Show reload indicator in preview
- Error notifications for CSS parse failures
- Configurable debounce delay in settings

## 9. Conclusion

VS Code's `FileSystemWatcher` API provides robust file watching with proper lifecycle management. For CSS live reload:

- Single watcher with non-recursive pattern is most efficient
- 300ms per-file debouncing handles auto-save gracefully
- Proper disposal via `context.subscriptions` and `panel.onDidDispose()` prevents memory leaks
- Webview data URLs enable instant hot reload without cache issues

The recommended implementation balances performance, developer experience, and code maintainability for watching up to 10 CSS files in the Eligian preview.
