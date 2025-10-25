# Research: VS Code Webview CSS Injection Patterns

**Research ID**: R001
**Feature**: 011 - Preview CSS Support
**Date**: 2025-10-25
**Status**: Complete

## Executive Summary

This document outlines recommended patterns for dynamically injecting and hot-reloading CSS files into VS Code webview previews. The research covers:

1. CSS injection approaches (link tags vs. style tags)
2. Hot-reload implementation using FileSystemWatcher and postMessage
3. Path resolution for CSS files and their referenced assets
4. Security considerations (Content Security Policy)

**Recommended Approach**: Use `<style>` tags with `textContent` for dynamic CSS injection, combined with FileSystemWatcher to monitor file changes and postMessage for hot-reload communication.

---

## 1. CSS Injection Approaches

### Option A: Link Tags with `asWebviewUri` (Recommended for Static CSS)

**Pattern**:
```typescript
// Extension side - generate webview HTML
const cssUri = panel.webview.asWebviewUri(
  vscode.Uri.file(path.join(context.extensionPath, 'media', 'styles.css'))
);

const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <link rel="stylesheet" href="${cssUri}" data-css-id="user-styles">
</head>
<body>...</body>
</html>`;
```

**Pros**:
- Standard HTML approach
- Browser handles caching automatically
- Clean separation of concerns
- Works with relative paths in CSS (background-image, fonts)

**Cons**:
- **Cannot hot-reload** - Changing `href` doesn't always trigger re-fetch due to browser caching
- Requires full HTML regeneration to update CSS paths
- More complex to track and replace individual CSS files

**Use Case**: Initial page load or when full webview refresh is acceptable.

---

### Option B: Style Tags with Inline CSS (Recommended for Hot-Reload)

**Pattern**:
```typescript
// Extension side - read CSS file and send to webview
const cssPath = path.join(workspaceRoot, 'styles', 'timeline.css');
const cssContent = fs.readFileSync(cssPath, 'utf8');

panel.webview.postMessage({
  type: 'css-update',
  cssId: 'timeline-css',
  content: cssContent
});
```

```javascript
// Webview side - receive and inject CSS
window.addEventListener('message', event => {
  const message = event.data;

  switch (message.type) {
    case 'css-update': {
      updateCSS(message.cssId, message.content);
      break;
    }
  }
});

function updateCSS(cssId, content) {
  // Find existing style tag or create new one
  let styleTag = document.querySelector(`style[data-css-id="${cssId}"]`);

  if (!styleTag) {
    styleTag = document.createElement('style');
    styleTag.setAttribute('data-css-id', cssId);
    document.head.appendChild(styleTag);
  }

  // Use textContent (NOT innerHTML) for security
  styleTag.textContent = content;
}
```

**Pros**:
- **True hot-reload** - CSS updates instantly without page refresh
- Fine-grained control over individual CSS files
- Track CSS by identifier (data-css-id)
- No caching issues

**Cons**:
- Relative paths in CSS (background-image, fonts) won't work without rewriting
- Larger message payloads (entire CSS content)
- Manual tracking of which CSS files are loaded

**Use Case**: Hot-reloading CSS during development/preview.

---

### Security Note: textContent vs innerHTML

**CRITICAL**: Always use `textContent` for CSS injection, never `innerHTML`:

```javascript
// ✅ CORRECT - Safe from XSS attacks
styleTag.textContent = cssContent;

// ❌ WRONG - Potential XSS vulnerability
styleTag.innerHTML = cssContent;
```

**Why**:
- `innerHTML` parses content as HTML, enabling XSS attacks if CSS contains malicious code
- `textContent` treats content as plain text only
- Security audits (browser extensions, enterprise) will reject `innerHTML` usage
- Performance: `textContent` is faster (no reflow, no CSS parsing)

**Source**: Stencil framework replaced innerHTML with textContent for CSS injection (security fix).

---

## 2. CSS Hot-Reload Implementation

### Architecture Overview

```
┌─────────────────────────────────────┐
│  Extension (Node.js)                │
│                                     │
│  1. FileSystemWatcher monitors CSS  │
│     workspace files                 │
│                                     │
│  2. On file change:                 │
│     - Read CSS file content         │
│     - Send via postMessage          │
└──────────────┬──────────────────────┘
               │ postMessage({ type: 'css-update', ... })
               ▼
┌─────────────────────────────────────┐
│  Webview (Browser)                  │
│                                     │
│  3. Receive message via             │
│     window.addEventListener         │
│                                     │
│  4. Update/create &lt;style&gt; tag      │
│     with CSS content                │
└─────────────────────────────────────┘
```

---

### Extension Side: FileSystemWatcher Setup

```typescript
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class PreviewPanel {
  private panel: vscode.WebviewPanel;
  private cssWatchers: Map<string, vscode.FileSystemWatcher> = new Map();

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly cssFiles: string[] // Paths from compilation result
  ) {
    this.panel = vscode.window.createWebviewPanel(
      'eligianPreview',
      'Eligian Preview',
      vscode.ViewColumn.Two,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.file(path.join(context.extensionPath, 'media')),
          // Allow workspace root for user CSS files
          vscode.Uri.file(vscode.workspace.workspaceFolders![0].uri.fsPath)
        ]
      }
    );

    this.setupCSSWatchers();
  }

  private setupCSSWatchers() {
    for (const cssFile of this.cssFiles) {
      // Create glob pattern for specific file
      const pattern = new vscode.RelativePattern(
        vscode.workspace.workspaceFolders![0],
        cssFile
      );

      const watcher = vscode.workspace.createFileSystemWatcher(pattern);

      // Watch for changes, creates, and deletes
      watcher.onDidChange(() => this.reloadCSS(cssFile));
      watcher.onDidCreate(() => this.reloadCSS(cssFile));
      watcher.onDidDelete(() => this.removeCSS(cssFile));

      this.cssWatchers.set(cssFile, watcher);

      // Initial load
      this.reloadCSS(cssFile);
    }
  }

  private reloadCSS(cssFile: string) {
    const workspaceRoot = vscode.workspace.workspaceFolders![0].uri.fsPath;
    const cssPath = path.join(workspaceRoot, cssFile);

    try {
      const cssContent = fs.readFileSync(cssPath, 'utf8');

      // Send to webview
      this.panel.webview.postMessage({
        type: 'css-update',
        cssId: this.generateCSSId(cssFile),
        content: cssContent,
        sourceFile: cssFile // For debugging
      });
    } catch (error) {
      console.error(`Failed to read CSS file: ${cssFile}`, error);
      // Optionally show error in webview
      this.panel.webview.postMessage({
        type: 'css-error',
        cssId: this.generateCSSId(cssFile),
        error: `Failed to load ${cssFile}: ${error.message}`
      });
    }
  }

  private removeCSS(cssFile: string) {
    this.panel.webview.postMessage({
      type: 'css-remove',
      cssId: this.generateCSSId(cssFile)
    });
  }

  private generateCSSId(cssFile: string): string {
    // Convert path to safe identifier
    // "styles/timeline.css" -> "css-styles-timeline-css"
    return `css-${cssFile.replace(/[\/\\\.]/g, '-')}`;
  }

  public dispose() {
    // Clean up watchers
    for (const watcher of this.cssWatchers.values()) {
      watcher.dispose();
    }
    this.cssWatchers.clear();
    this.panel.dispose();
  }
}
```

---

### Webview Side: Message Handler and CSS Injection

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none';
                 style-src 'unsafe-inline' ${webview.cspSource};
                 script-src ${webview.cspSource};">
  <title>Eligian Preview</title>

  <!-- Extension's base styles -->
  <link rel="stylesheet" href="${baseStylesUri}">

  <!-- User CSS injected dynamically here -->

</head>
<body>
  <div id="preview-root"></div>

  <script>
    (function() {
      const vscode = acquireVsCodeApi();

      // Track loaded CSS for debugging
      const loadedCSS = new Set();

      // Handle messages from extension
      window.addEventListener('message', event => {
        const message = event.data;

        switch (message.type) {
          case 'css-update': {
            updateCSS(message.cssId, message.content);
            console.log(`[CSS Hot-Reload] Updated: ${message.sourceFile}`);
            break;
          }

          case 'css-remove': {
            removeCSS(message.cssId);
            console.log(`[CSS Hot-Reload] Removed: ${message.cssId}`);
            break;
          }

          case 'css-error': {
            console.error(`[CSS Hot-Reload] Error:`, message.error);
            showCSSError(message.error);
            break;
          }
        }
      });

      /**
       * Update or create a style tag with CSS content
       * @param {string} cssId - Unique identifier for the CSS file
       * @param {string} content - CSS content to inject
       */
      function updateCSS(cssId, content) {
        let styleTag = document.querySelector(`style[data-css-id="${cssId}"]`);

        if (!styleTag) {
          styleTag = document.createElement('style');
          styleTag.setAttribute('data-css-id', cssId);
          styleTag.setAttribute('type', 'text/css');
          document.head.appendChild(styleTag);

          loadedCSS.add(cssId);
        }

        // IMPORTANT: Use textContent, NOT innerHTML (security)
        styleTag.textContent = content;
      }

      /**
       * Remove a style tag
       * @param {string} cssId - Unique identifier for the CSS file
       */
      function removeCSS(cssId) {
        const styleTag = document.querySelector(`style[data-css-id="${cssId}"]`);
        if (styleTag) {
          styleTag.remove();
          loadedCSS.delete(cssId);
        }
      }

      /**
       * Show CSS error in preview (optional)
       */
      function showCSSError(error) {
        // Display error banner in preview (implementation-specific)
        const banner = document.createElement('div');
        banner.className = 'css-error-banner';
        banner.textContent = error;
        document.body.prepend(banner);

        setTimeout(() => banner.remove(), 5000);
      }

    })();
  </script>
</body>
</html>
```

---

### Performance Considerations

**Debouncing File Changes**:

File system watchers can fire multiple times for a single edit. Debounce CSS reloads:

```typescript
private reloadCSS(cssFile: string) {
  // Clear existing timeout for this file
  if (this.reloadTimers.has(cssFile)) {
    clearTimeout(this.reloadTimers.get(cssFile));
  }

  // Debounce: wait 100ms before reloading
  const timer = setTimeout(() => {
    this.doReloadCSS(cssFile);
    this.reloadTimers.delete(cssFile);
  }, 100);

  this.reloadTimers.set(cssFile, timer);
}
```

**Message Size**:

For very large CSS files (>1MB), consider:
- Compression (gzip before sending, decompress in webview)
- Incremental updates (diff-based patching)
- Lazy loading (only load CSS when needed)

---

## 3. Relative Path Resolution in CSS

### The Problem

CSS files often reference external resources:

```css
/* timeline.css */
.hero {
  background-image: url('./images/hero.png');
  font-family: 'CustomFont';
  src: url('../fonts/custom.woff2');
}
```

**Issue**: When CSS is injected via `<style>` tags, relative paths break because:
1. The CSS has no file URL context (it's inline)
2. Paths resolve relative to the HTML document (webview's `vscode-webview://` URL)
3. Browser cannot access local file system

---

### Solution 1: Rewrite Paths with `asWebviewUri` (Recommended)

**Pattern**: Rewrite all `url()` references to webview URIs before sending:

```typescript
private reloadCSS(cssFile: string) {
  const workspaceRoot = vscode.workspace.workspaceFolders![0].uri.fsPath;
  const cssPath = path.join(workspaceRoot, cssFile);
  const cssDir = path.dirname(cssPath);

  let cssContent = fs.readFileSync(cssPath, 'utf8');

  // Rewrite url() paths
  cssContent = this.rewriteCSSUrls(cssContent, cssDir);

  this.panel.webview.postMessage({
    type: 'css-update',
    cssId: this.generateCSSId(cssFile),
    content: cssContent
  });
}

private rewriteCSSUrls(css: string, cssDir: string): string {
  // Match url(...) in CSS
  const urlRegex = /url\(['"]?([^'")]+)['"]?\)/g;

  return css.replace(urlRegex, (match, urlPath) => {
    // Skip absolute URLs and data URIs
    if (urlPath.startsWith('http') ||
        urlPath.startsWith('data:') ||
        urlPath.startsWith('vscode-webview://')) {
      return match;
    }

    // Resolve relative path
    const absolutePath = path.resolve(cssDir, urlPath);
    const webviewUri = this.panel.webview.asWebviewUri(
      vscode.Uri.file(absolutePath)
    );

    return `url('${webviewUri.toString()}')`;
  });
}
```

**Example Transformation**:

```css
/* Before rewriting */
.hero {
  background-image: url('./images/hero.png');
}

/* After rewriting */
.hero {
  background-image: url('vscode-webview://1a2b3c4d/path/to/workspace/styles/images/hero.png');
}
```

**Pros**:
- Assets load correctly
- Works with all CSS features (fonts, images, etc.)
- No changes needed in webview

**Cons**:
- Must rewrite on every CSS update
- Adds processing overhead
- Complex regex for edge cases

---

### Solution 2: Use `<link>` with `asWebviewUri` Base Path

If using `<link>` tags, set a base path:

```typescript
const cssUri = panel.webview.asWebviewUri(
  vscode.Uri.file(path.join(workspaceRoot, 'styles', 'timeline.css'))
);

// Relative paths in CSS resolve relative to this URI
const html = `<link rel="stylesheet" href="${cssUri}">`;
```

**Limitation**: Only works with `<link>` tags, not `<style>` tags.

---

### Solution 3: Convert Assets to Data URIs (Limited Use)

For small images/fonts, embed as data URIs:

```typescript
private async embedAssets(css: string, cssDir: string): Promise<string> {
  const urlRegex = /url\(['"]?([^'")]+)['"]?\)/g;

  const promises = [];
  const replacements = [];

  for (const match of css.matchAll(urlRegex)) {
    const urlPath = match[1];
    if (urlPath.startsWith('http') || urlPath.startsWith('data:')) continue;

    const assetPath = path.resolve(cssDir, urlPath);
    const ext = path.extname(assetPath).toLowerCase();

    // Only embed small images
    if (['.png', '.jpg', '.gif', '.svg'].includes(ext)) {
      promises.push(
        fs.promises.readFile(assetPath).then(buffer => {
          const base64 = buffer.toString('base64');
          const mimeType = {
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.gif': 'image/gif',
            '.svg': 'image/svg+xml'
          }[ext];

          replacements.push({
            old: match[0],
            new: `url('data:${mimeType};base64,${base64}')`
          });
        })
      );
    }
  }

  await Promise.all(promises);

  for (const { old, new: newUrl } of replacements) {
    css = css.replace(old, newUrl);
  }

  return css;
}
```

**Pros**: Assets embedded, no external requests

**Cons**:
- Large CSS size
- Not suitable for fonts or large images
- Slows down hot-reload

---

## 4. Content Security Policy Configuration

### CSP Basics for Webviews

VS Code enforces strict Content Security Policy in webviews. You must explicitly allow:
- Scripts: `script-src`
- Styles: `style-src`
- Images: `img-src`
- Fonts: `font-src`

---

### Recommended CSP for CSS Hot-Reload

```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none';
               style-src 'unsafe-inline' ${webview.cspSource};
               script-src ${webview.cspSource};
               img-src ${webview.cspSource} https: data:;
               font-src ${webview.cspSource} data:;">
```

**Breakdown**:

| Directive | Value | Reason |
|-----------|-------|--------|
| `default-src 'none'` | Block all by default | Security best practice |
| `style-src 'unsafe-inline'` | Allow inline `<style>` tags | Required for `textContent` injection |
| `style-src ${webview.cspSource}` | Allow styles from webview URIs | For `<link>` tags if needed |
| `script-src ${webview.cspSource}` | Allow webview scripts | Required for `acquireVsCodeApi()` |
| `img-src ${webview.cspSource}` | Allow images from webview URIs | For CSS background-image |
| `img-src https:` | Allow external images | For remote assets (CDNs) |
| `img-src data:` | Allow data URIs | For embedded images |
| `font-src ${webview.cspSource}` | Allow fonts from webview URIs | For CSS @font-face |
| `font-src data:` | Allow font data URIs | For embedded fonts |

---

### Understanding `${webview.cspSource}`

**What it is**: A placeholder that VS Code replaces with the webview's unique security origin.

**Example**:
```
vscode-webview://1a2b3c4d5e6f
```

**Why needed**:
- Webviews have unique origins to prevent cross-webview attacks
- `${webview.cspSource}` ensures only YOUR webview can load resources

**Usage in TypeScript**:

```typescript
function getWebviewContent(webview: vscode.Webview): string {
  const csp = `default-src 'none';
               style-src 'unsafe-inline' ${webview.cspSource};`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="Content-Security-Policy" content="${csp}">
</head>
...`;
}
```

---

### CSP Debugging

**Common CSP Errors**:

```
Refused to load the stylesheet 'vscode-webview://...' because it violates the following Content Security Policy directive: "style-src 'none'".
```

**Solution**: Add `style-src ${webview.cspSource}` to CSP.

```
Refused to execute inline script because it violates the following Content Security Policy directive: "script-src 'none'".
```

**Solution**: Add `script-src ${webview.cspSource}` to CSP.

**Debugging Tips**:
1. Open webview DevTools: `Ctrl+Shift+P` → "Developer: Open Webview Developer Tools"
2. Check Console for CSP violations
3. Verify CSP meta tag in Elements tab
4. Test with permissive CSP first, then tighten

---

### LocalResourceRoots Configuration

**Purpose**: Restrict which directories webview can access.

```typescript
const panel = vscode.window.createWebviewPanel(
  'eligianPreview',
  'Eligian Preview',
  vscode.ViewColumn.Two,
  {
    enableScripts: true,
    localResourceRoots: [
      // Extension resources
      vscode.Uri.file(path.join(context.extensionPath, 'media')),

      // Workspace root (user CSS/assets)
      vscode.Uri.file(vscode.workspace.workspaceFolders![0].uri.fsPath),

      // Specific subdirectory (more restrictive)
      vscode.Uri.file(path.join(
        vscode.workspace.workspaceFolders![0].uri.fsPath,
        'assets'
      ))
    ]
  }
);
```

**Important**:
- `localResourceRoots` accepts **directories**, not files
- Files outside these roots return 401 Unauthorized
- Combine with CSP for defense in depth

---

## 5. Message Protocol Design

### Message Types

```typescript
// Extension → Webview messages
type ExtensionMessage =
  | { type: 'css-update'; cssId: string; content: string; sourceFile: string }
  | { type: 'css-remove'; cssId: string }
  | { type: 'css-error'; cssId: string; error: string }
  | { type: 'timeline-update'; config: EligiusConfig };

// Webview → Extension messages (optional)
type WebviewMessage =
  | { type: 'css-loaded'; cssId: string }
  | { type: 'css-load-failed'; cssId: string; error: string }
  | { type: 'ready' };
```

---

### Example: Bidirectional Communication

**Extension Side**:
```typescript
// Send CSS update
panel.webview.postMessage({
  type: 'css-update',
  cssId: 'timeline-css',
  content: cssContent
});

// Listen for webview responses
panel.webview.onDidReceiveMessage(
  message => {
    switch (message.type) {
      case 'css-loaded':
        console.log(`CSS loaded: ${message.cssId}`);
        break;
      case 'css-load-failed':
        vscode.window.showErrorMessage(
          `CSS failed to load: ${message.error}`
        );
        break;
    }
  },
  undefined,
  context.subscriptions
);
```

**Webview Side**:
```javascript
function updateCSS(cssId, content) {
  try {
    let styleTag = document.querySelector(`style[data-css-id="${cssId}"]`);

    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.setAttribute('data-css-id', cssId);
      document.head.appendChild(styleTag);
    }

    styleTag.textContent = content;

    // Notify extension of success
    vscode.postMessage({
      type: 'css-loaded',
      cssId: cssId
    });
  } catch (error) {
    // Notify extension of failure
    vscode.postMessage({
      type: 'css-load-failed',
      cssId: cssId,
      error: error.message
    });
  }
}
```

---

### Message Order Guarantees

**Important**: `postMessage` does NOT guarantee delivery order in high-frequency scenarios.

**Example Problem**:
```typescript
// Rapid updates
panel.webview.postMessage({ type: 'css-update', content: 'v1' });
panel.webview.postMessage({ type: 'css-update', content: 'v2' });
panel.webview.postMessage({ type: 'css-update', content: 'v3' });

// Webview might receive: v1 → v3 → v2 (out of order!)
```

**Solution**: Add sequence numbers:

```typescript
private cssSequence = 0;

private reloadCSS(cssFile: string) {
  const seq = ++this.cssSequence;

  panel.webview.postMessage({
    type: 'css-update',
    cssId: cssFile,
    content: cssContent,
    sequence: seq
  });
}
```

```javascript
// Webview side - track highest sequence
const cssSequences = new Map();

function updateCSS(cssId, content, sequence) {
  const lastSeq = cssSequences.get(cssId) || 0;

  if (sequence < lastSeq) {
    console.warn(`Ignoring out-of-order CSS update: ${sequence} < ${lastSeq}`);
    return;
  }

  // Apply update
  styleTag.textContent = content;
  cssSequences.set(cssId, sequence);
}
```

---

## 6. Recommended Implementation Strategy

### Phase 1: Basic CSS Loading (No Hot-Reload)

1. **Compile Eligian DSL** → Extract CSS file paths
2. **Read CSS files** → Generate webview HTML with `<link>` tags
3. **Use `asWebviewUri`** → Convert CSS paths to webview URIs
4. **Configure CSP** → Allow styles from webview source
5. **Set `localResourceRoots`** → Allow workspace access

**Deliverable**: Static CSS loading on preview open.

---

### Phase 2: CSS Hot-Reload

1. **Setup FileSystemWatcher** → Monitor CSS files from compilation
2. **Implement `reloadCSS()`** → Read file + send via postMessage
3. **Add webview message handler** → Update `<style>` tags with `textContent`
4. **Debounce file changes** → Avoid rapid-fire updates
5. **Add error handling** → Show CSS load failures in preview

**Deliverable**: Live CSS updates without webview refresh.

---

### Phase 3: Asset Path Rewriting

1. **Parse CSS for `url()`** → Extract relative paths
2. **Resolve paths** → Convert to absolute file system paths
3. **Rewrite with `asWebviewUri`** → Generate webview-safe URIs
4. **Update CSP** → Allow `img-src` and `font-src` from webview source
5. **Test with fonts/images** → Verify assets load

**Deliverable**: CSS with working background images and fonts.

---

### Phase 4: Polish

1. **Add CSS load indicators** → Show loading state in preview
2. **Implement CSS error banner** → Display syntax errors
3. **Add sequence numbers** → Prevent out-of-order updates
4. **Optimize large CSS** → Consider compression for >100KB files
5. **Add telemetry** → Track CSS reload frequency (optional)

**Deliverable**: Production-ready CSS hot-reload.

---

## 7. Testing Checklist

### CSS Injection Tests

- [ ] Single CSS file loads correctly
- [ ] Multiple CSS files load in order
- [ ] CSS updates when file changes on disk
- [ ] CSS removes when file deleted
- [ ] CSS re-adds when file created
- [ ] Rapid file changes don't cause race conditions
- [ ] Large CSS files (>1MB) load without timeout
- [ ] Invalid CSS syntax shows error (doesn't break preview)
- [ ] CSS with `@import` handled correctly (if supported)
- [ ] CSS with media queries applies correctly

### Path Resolution Tests

- [ ] Relative image paths resolve: `url('./image.png')`
- [ ] Parent directory paths resolve: `url('../image.png')`
- [ ] Absolute workspace paths resolve: `url('/assets/image.png')`
- [ ] Font paths resolve: `url('./fonts/custom.woff2')`
- [ ] SVG backgrounds resolve: `url('./icon.svg')`
- [ ] Data URIs pass through unchanged: `url('data:...')`
- [ ] External URLs pass through: `url('https://cdn.com/image.png')`
- [ ] Paths with spaces work: `url('./my image.png')`
- [ ] Paths with special characters work: `url('./image@2x.png')`

### CSP Tests

- [ ] Inline styles allowed: `<style>` tags work
- [ ] External styles allowed: `<link>` tags work (if used)
- [ ] Images load from workspace
- [ ] Images load from external URLs (if allowed)
- [ ] Fonts load from workspace
- [ ] Data URIs load (images, fonts)
- [ ] CSP violations logged in DevTools
- [ ] `localResourceRoots` restricts access correctly

### Hot-Reload Tests

- [ ] CSS updates without page refresh
- [ ] Eligius timeline continues playing during update
- [ ] Multiple CSS files update independently
- [ ] CSS update doesn't reset page scroll position
- [ ] CSS update doesn't lose JS state (counters, timers)
- [ ] File watcher cleans up on preview close
- [ ] Debouncing prevents rapid-fire updates (save repeatedly)
- [ ] Out-of-order messages handled correctly (sequence numbers)

### Error Handling Tests

- [ ] Missing CSS file shows error (doesn't crash preview)
- [ ] Invalid CSS syntax shows error (doesn't crash preview)
- [ ] Inaccessible file (permissions) shows error
- [ ] Deleted CSS file removes styles
- [ ] CSS load timeout shows error (if implemented)

---

## 8. Performance Benchmarks

### Target Metrics

| Metric | Target | Acceptable | Poor |
|--------|--------|------------|------|
| CSS load time | <50ms | <200ms | >500ms |
| CSS update latency | <100ms | <300ms | >1s |
| File watcher overhead | <5% CPU | <10% CPU | >20% CPU |
| Message size (per CSS) | <50KB | <200KB | >500KB |
| Memory per CSS file | <100KB | <500KB | >2MB |

### Profiling Tips

**Extension Side**:
```typescript
const start = Date.now();
const cssContent = fs.readFileSync(cssPath, 'utf8');
const rewritten = this.rewriteCSSUrls(cssContent, cssDir);
this.panel.webview.postMessage({ type: 'css-update', ... });
console.log(`CSS reload took ${Date.now() - start}ms`);
```

**Webview Side**:
```javascript
window.addEventListener('message', event => {
  const start = performance.now();
  updateCSS(event.data.cssId, event.data.content);
  console.log(`CSS update took ${performance.now() - start}ms`);
});
```

---

## 9. Known Limitations

### VS Code Limitations

1. **No native hot-reload**: VS Code doesn't provide built-in CSS hot-reload (issue #93146 closed as out-of-scope)
2. **CSP restrictions**: Cannot use `eval()` or inline event handlers
3. **File system access**: Webviews cannot directly access `file://` URIs
4. **Message size limits**: Very large messages (>10MB) may fail
5. **No cross-webview communication**: Each webview is isolated

### Implementation Limitations

1. **Path rewriting complexity**: Regex-based URL rewriting may miss edge cases
2. **CSS `@import` not supported**: Would require recursive CSS parsing
3. **Source maps unavailable**: CSS errors show line numbers from rewritten CSS
4. **No CSS minification**: CSS sent as-is (could compress)
5. **Relative path base**: Cannot change base URL for relative paths in `<style>` tags

---

## 10. Alternative Approaches Considered

### Approach: Use iframe with blob: URL

**Pattern**: Create CSS blob, inject into iframe with dedicated origin.

**Rejected**:
- No access to `acquireVsCodeApi()` in iframe
- Eligius timeline would need to run in iframe (complex integration)
- Blob URLs don't solve relative path issues

---

### Approach: Use webpack-dev-server for Development

**Pattern**: Run webpack-dev-server locally, load CSS from `localhost:8080`.

**Rejected**:
- Requires user to run separate dev server
- CSP would need to allow `localhost` (security risk)
- Not suitable for production/distribution
- Breaks "one-click preview" UX

---

### Approach: Use VS Code's "Developer: Reload Webviews" Command

**Pattern**: Register webview serializer, reload via command palette.

**Rejected**:
- Requires manual user action (not automatic)
- Restarts entire webview (loses Eligius timeline state)
- Poor DX compared to hot-reload

---

## 11. Future Enhancements

### CSS Source Maps

**Goal**: Map CSS errors to original source files.

**Implementation**:
1. Generate source map during path rewriting
2. Include source map in message or separate file
3. Use browser DevTools to display original CSS

---

### CSS Compression

**Goal**: Reduce message size for large CSS files.

**Implementation**:
1. Compress CSS with gzip on extension side
2. Decompress in webview using `pako` library
3. Only for CSS >50KB

---

### CSS Module Support

**Goal**: Support CSS Modules with local scoping.

**Implementation**:
1. Parse CSS for `:local()` and `:global()` pseudo-classes
2. Generate unique class names
3. Provide class name mapping to Eligius config

---

### Live CSS Error Highlighting

**Goal**: Show CSS syntax errors inline in webview.

**Implementation**:
1. Parse CSS with `postcss` on extension side
2. Extract error line numbers and messages
3. Display error banner in preview with source location

---

## 12. References

### Official Documentation

- [VS Code Webview API](https://code.visualstudio.com/api/extension-guides/webview)
- [VS Code API Reference - Webview](https://code.visualstudio.com/api/references/vscode-api#Webview)
- [VS Code FileSystemWatcher](https://code.visualstudio.com/api/references/vscode-api#FileSystemWatcher)

### Community Resources

- [GitHub Issue #93146: Allow hot-reloading content in webviews](https://github.com/microsoft/vscode/issues/93146)
- [Stack Overflow: VSCode Extension webview external html and css](https://stackoverflow.com/questions/56182144/vscode-extension-webview-external-html-and-css)
- [Ken Muse: Improved Blogging With Visual Studio Code Webviews](https://www.kenmuse.com/blog/improve-blogging-with-vs-code-webviews/)

### Security

- [MDN: Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [Stencil CSS Injection Security Fix](https://github.com/ionic-team/stencil/actions/runs/7878387897/job/21496636556)

---

## Appendix: Complete Working Example

See implementation in:
- `packages/extension/src/preview/preview-panel.ts` (Extension side)
- `packages/extension/media/preview.html` (Webview side)

**Key Files**:
```
packages/extension/
├── src/
│   └── preview/
│       ├── preview-panel.ts        # Main preview panel class
│       ├── css-manager.ts          # CSS file watching and reloading
│       └── path-rewriter.ts        # URL rewriting for assets
└── media/
    ├── preview.html                # Webview HTML template
    ├── preview-styles.css          # Base preview styles
    └── preview-script.js           # Webview message handler
```

---

**End of Research Document**
