# Live Preview Feature: Research Document

## Executive Summary

This document outlines the technical research for implementing a live preview feature in the Eligian VS Code extension. The feature will display compiled timeline output in a webview panel, automatically updating as the user edits `.eligian` files.

**Key Finding**: The Eligius engine is browser-compatible and can run in VS Code webviews with proper configuration. The implementation requires careful handling of file watching, resource loading, and communication between extension and webview.

---

## 1. VS Code Webview API

### Decision: Use WebviewPanel with PostMessage Communication

**Chosen Approach**: Create a `WebviewPanel` with bidirectional message passing between extension and webview.

### Rationale

- **WebviewPanel** is the standard VS Code API for custom HTML content
- **PostMessage** provides type-safe, asynchronous communication
- Built-in lifecycle management (disposal, visibility changes)
- Security through Content Security Policy (CSP)
- Resource isolation via `localResourceRoots`

### Alternatives Considered

1. **Custom Text Editor API** - Rejected: Designed for editing binary/custom file formats, not for read-only previews
2. **Virtual Document Provider** - Rejected: Limited to text display, no interactive HTML/JavaScript
3. **External Browser Window** - Rejected: Poor integration, no workspace context

### Implementation Notes

#### Creating the Webview Panel

```typescript
import * as vscode from 'vscode';

// In extension activation
const panel = vscode.window.createWebviewPanel(
  'eligianPreview',           // View type identifier
  'Eligian Timeline Preview', // Panel title
  vscode.ViewColumn.Beside,   // Show beside editor
  {
    enableScripts: true,      // Required for Eligius engine
    retainContextWhenHidden: true, // Keep state when hidden
    localResourceRoots: [
      vscode.Uri.joinPath(context.extensionUri, 'media'),
      vscode.Uri.joinPath(context.extensionUri, 'preview')
    ]
  }
);
```

#### Communication Pattern: Extension → Webview

```typescript
// Extension sends compiled JSON to webview
panel.webview.postMessage({
  type: 'update',
  config: compiledEligiusJson,
  timestamp: Date.now()
});
```

#### Communication Pattern: Webview → Extension

```typescript
// In webview HTML
const vscode = acquireVsCodeApi();

// Send error back to extension
vscode.postMessage({
  type: 'error',
  message: 'Failed to initialize Eligius engine',
  details: errorObject
});

// In extension
panel.webview.onDidReceiveMessage(
  message => {
    switch (message.type) {
      case 'error':
        vscode.window.showErrorMessage(`Preview Error: ${message.message}`);
        break;
      case 'ready':
        // Webview is ready, send initial config
        break;
    }
  },
  undefined,
  context.subscriptions
);
```

#### Content Security Policy (CSP)

**Critical Security Requirement**: Webviews must define CSP to prevent XSS attacks.

```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none';
               script-src ${webview.cspSource} 'unsafe-inline';
               style-src ${webview.cspSource} 'unsafe-inline';
               img-src ${webview.cspSource} https: data:;
               media-src ${webview.cspSource} https: data:;
               font-src ${webview.cspSource};">
```

**CSP Directives Explanation**:
- `default-src 'none'` - Deny all by default
- `script-src ${webview.cspSource} 'unsafe-inline'` - Allow bundled scripts + inline (needed for Eligius)
- `style-src ${webview.cspSource} 'unsafe-inline'` - Allow styles + inline
- `img-src ${webview.cspSource} https: data:` - Allow images from extension, HTTPS, data URIs
- `media-src ${webview.cspSource} https: data:` - Allow video/audio from extension, HTTPS, data URIs
- `font-src ${webview.cspSource}` - Allow fonts from extension

**Note**: `'unsafe-inline'` is required because Eligius generates dynamic styles. This is acceptable in webview context since content is controlled by the extension.

#### Lifecycle Management

```typescript
// Track panel state
let currentPanel: vscode.WebviewPanel | undefined = undefined;

// Reuse existing panel or create new one
function getOrCreatePreviewPanel(): vscode.WebviewPanel {
  if (currentPanel) {
    currentPanel.reveal(vscode.ViewColumn.Beside);
    return currentPanel;
  }

  currentPanel = vscode.window.createWebviewPanel(/* ... */);

  // Clean up when panel is closed
  currentPanel.onDidDispose(
    () => {
      currentPanel = undefined;
      // Stop file watching if needed
    },
    null,
    context.subscriptions
  );

  return currentPanel;
}
```

#### Resource Loading Strategy

**Decision**: Use `webview.asWebviewUri()` for all local resources.

```typescript
function getWebviewContent(
  webview: vscode.Webview,
  extensionUri: vscode.Uri
): string {
  // Convert local paths to webview URIs
  const eligiusScriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'preview', 'eligius.bundle.js')
  );

  const previewScriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'preview', 'preview.js')
  );

  const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'preview', 'preview.css')
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="...">
  <link rel="stylesheet" href="${styleUri}">
  <title>Eligian Timeline Preview</title>
</head>
<body>
  <div id="preview-container"></div>
  <script src="${eligiusScriptUri}"></script>
  <script src="${previewScriptUri}"></script>
</body>
</html>`;
}
```

---

## 2. File Watching in VS Code Extensions

### Decision: Use `workspace.onDidSaveTextDocument` with Debouncing

**Chosen Approach**: Watch for save events on active `.eligian` documents, debounce rapid saves, and recompile/update preview.

### Rationale

- **Save events are explicit user actions** - Avoids constant recompilation during typing
- **Built-in VS Code API** - No custom file system watching needed
- **Language-specific filtering** - Only watch `.eligian` files
- **Debouncing prevents thrashing** - Handle rapid Ctrl+S keypresses gracefully

### Alternatives Considered

1. **`onDidChangeTextDocument`** - Rejected: Too frequent, would trigger on every keystroke (expensive compilation)
2. **File System Watcher (`createFileSystemWatcher`)** - Rejected: Redundant for active editor files, adds complexity
3. **Polling** - Rejected: Inefficient, high CPU usage, poor UX

### Implementation Notes

#### Basic Save Watcher

```typescript
import * as vscode from 'vscode';

function setupFileWatcher(
  context: vscode.ExtensionContext,
  onEligianFileSaved: (document: vscode.TextDocument) => void
): void {
  // Watch for save events
  const saveWatcher = vscode.workspace.onDidSaveTextDocument(
    (document) => {
      // Only process .eligian files
      if (document.languageId === 'eligian') {
        onEligianFileSaved(document);
      }
    }
  );

  context.subscriptions.push(saveWatcher);
}
```

#### Debouncing Strategy

**Problem**: User might save multiple times quickly (Ctrl+S spam), causing unnecessary recompilations.

**Solution**: Debounce with a short delay (300-500ms).

```typescript
class PreviewManager {
  private debounceTimer: NodeJS.Timeout | undefined;
  private readonly debounceDelay = 300; // milliseconds

  constructor(private panel: vscode.WebviewPanel) {}

  onDocumentSaved(document: vscode.TextDocument): void {
    // Clear existing timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Set new timer
    this.debounceTimer = setTimeout(() => {
      this.updatePreview(document);
    }, this.debounceDelay);
  }

  private async updatePreview(document: vscode.TextDocument): Promise<void> {
    try {
      // Compile the document
      const config = await compileEligianDocument(document);

      // Send to webview
      this.panel.webview.postMessage({
        type: 'update',
        config: config
      });
    } catch (error) {
      // Handle compilation errors
      vscode.window.showErrorMessage(
        `Failed to compile: ${error.message}`
      );
    }
  }

  dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
  }
}
```

#### Handling Active Editor Changes

**Requirement**: When user switches between `.eligian` files, preview should update.

```typescript
function setupActiveEditorWatcher(
  context: vscode.ExtensionContext,
  previewManager: PreviewManager
): void {
  const editorWatcher = vscode.window.onDidChangeActiveTextEditor(
    (editor) => {
      if (!editor) {
        return;
      }

      // Check if it's an .eligian file
      if (editor.document.languageId === 'eligian') {
        // Update preview immediately (no debounce needed for editor switches)
        previewManager.updatePreviewForDocument(editor.document);
      }
    }
  );

  context.subscriptions.push(editorWatcher);
}
```

#### Performance Considerations

1. **Compilation Performance**: Eligian compiler must be fast (<100ms for typical files)
2. **JSON Transfer Size**: Compiled JSON might be large; consider compression for big timelines
3. **Memory Management**: Dispose old webview resources properly when switching files
4. **Background Compilation**: Consider offloading compilation to worker thread if it becomes slow

**Recommended Thresholds**:
- Small files (<100 lines): Instant compilation
- Medium files (100-500 lines): <200ms compilation acceptable
- Large files (>500 lines): Show progress indicator if >500ms

---

## 3. Eligius Engine Browser Compatibility

### Decision: Eligius is Browser-Compatible with Minor Configuration

**Finding**: Eligius can run in browser/webview contexts with appropriate bundling and dependency management.

### Rationale

Based on examination of the Eligius repository:

1. **ES Module Format**: Eligius is distributed as ESM (`"type": "module"` in package.json)
2. **Browser Dependencies**: Uses jQuery, Video.js (browser libraries)
3. **Window/Document Access**: Eligius requires `window` and `document` objects (present in webviews)
4. **No Node.js-Specific APIs**: Does not use `fs`, `path`, or other Node.js modules

### Evidence from Eligius Source

```typescript
// From eligius/src/engine-factory.ts
constructor(
  private resourceImporter: IResourceImporter,
  windowRef: Window,  // Expects browser Window object
) {
  const jqWin = $(windowRef);  // Uses jQuery
  // ...
}
```

```typescript
// From eligius/src/operation/get-query-params.ts
const searchParams = new URLSearchParams(window.location.search);
// Uses browser APIs
```

### Peer Dependencies Required

From `eligius/package.json`:
```json
"peerDependencies": {
  "jquery": "3.7.1",
  "lottie-web": "5.13.0",
  "video.js": "8.21.0"
}
```

### Alternatives Considered

1. **Server-Side Rendering** - Rejected: Overkill, requires running Node.js server
2. **Static JSON Preview** - Rejected: Doesn't show actual runtime behavior
3. **External Browser** - Rejected: Poor integration with VS Code

### Implementation Notes

#### Bundling Strategy

**Option 1: CDN Dependencies (Recommended for MVP)**

```html
<!-- In webview HTML -->
<head>
  <!-- Load dependencies from CDN -->
  <script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/video.js@8.21.0/dist/video.min.js"></script>
  <link href="https://cdn.jsdelivr.net/npm/video.js@8.21.0/dist/video-js.min.css" rel="stylesheet">

  <!-- Load bundled Eligius -->
  <script src="${eligiusBundleUri}"></script>
</head>
```

**Pros**:
- Simple implementation
- Smaller extension bundle size
- Always up-to-date dependencies

**Cons**:
- Requires internet connection
- CSP must allow CDN domains
- Potential version mismatches

**Option 2: Bundled Dependencies (Recommended for Production)**

Bundle Eligius + dependencies into a single file using esbuild/webpack:

```javascript
// esbuild.config.js
import esbuild from 'esbuild';

esbuild.build({
  entryPoints: ['preview/preview-main.ts'],
  bundle: true,
  outfile: 'preview/eligius.bundle.js',
  platform: 'browser',
  format: 'iife',
  external: [], // Bundle everything
  globalName: 'EligiusPreview',
  define: {
    'process.env.NODE_ENV': '"production"'
  }
});
```

**Pros**:
- Works offline
- Consistent versions
- Faster load time (single request)
- Better CSP security (no external domains)

**Cons**:
- Larger extension size
- Must update bundle when Eligius updates

#### Creating Browser Bundle

**Step 1**: Create preview entry point

```typescript
// preview/preview-main.ts
import { EngineFactory, EligiusResourceImporter } from 'eligius';
import type { IEngineConfiguration } from 'eligius';
import $ from 'jquery';
import 'video.js'; // Side effect import

// Make available globally for webview
(window as any).EligiusPreview = {
  EngineFactory,
  EligiusResourceImporter,
  $
};

// Setup message handler
const vscode = acquireVsCodeApi();

window.addEventListener('message', async (event) => {
  const message = event.data;

  switch (message.type) {
    case 'update':
      await initializePreview(message.config);
      break;
  }
});

async function initializePreview(config: IEngineConfiguration) {
  try {
    const factory = new EngineFactory(
      new EligiusResourceImporter(),
      window
    );
    const engine = factory.createEngine(config);
    await engine.init();

    vscode.postMessage({ type: 'ready' });
  } catch (error) {
    vscode.postMessage({
      type: 'error',
      message: error.message
    });
  }
}
```

**Step 2**: Bundle for browser

```bash
cd packages/extension
npm install --save-dev esbuild
npx esbuild preview/preview-main.ts \
  --bundle \
  --outfile=preview/eligius.bundle.js \
  --platform=browser \
  --format=iife \
  --global-name=EligiusPreview
```

#### Eligius Configuration Requirements

The compiled Eligian code must produce valid `IEngineConfiguration`:

```typescript
interface IEngineConfiguration {
  engine: { systemName: 'EligiusEngine' };
  containerSelector: string;  // jQuery selector for preview container
  timelineProviderSettings: {
    animation?: { vendor: string; systemName: string };
    video?: { vendor: string; systemName: string };
    audio?: { vendor: string; systemName: string };
  };
  layoutTemplate?: string;  // HTML for initial layout
  timelines: Array<{
    type: 'animation' | 'video' | 'audio';
    uri: string;
    duration: number;
    timelineActions: Array<{ /* ... */ }>;
  }>;
  // ... other properties
}
```

---

## 4. Media Resource Loading in Webviews

### Decision: Use `asWebviewUri()` for Local Media, Support HTTPS URLs

**Chosen Approach**: Convert local file paths to webview URIs, allow HTTPS media sources.

### Rationale

- **Security**: Webviews cannot access `file://` URIs directly
- **Cross-Platform**: `asWebviewUri()` handles Windows/Mac/Linux path differences
- **Flexibility**: Support both local development files and production CDN resources

### Alternatives Considered

1. **Base64 Encoding** - Rejected: Massive file sizes for video, poor performance
2. **Local Web Server** - Rejected: Complex setup, port management issues
3. **Virtual File System** - Rejected: Not necessary, built-in URI handling sufficient

### Implementation Notes

#### Converting Media Paths

**Problem**: User's `.eligian` file references media like:

```eligian
timeline "video-annotation" using video from "presentation.mp4" {
  // ...
}
```

The path `"presentation.mp4"` is relative to the workspace, not accessible from webview.

**Solution**: Rewrite media URIs during compilation/preview generation.

```typescript
interface MediaResource {
  originalPath: string;   // "presentation.mp4"
  resolvedPath: string;   // "/Users/dev/project/presentation.mp4"
  webviewUri?: string;    // "vscode-webview://..."
}

async function resolveMediaResource(
  webview: vscode.Webview,
  mediaPath: string,
  documentUri: vscode.Uri
): Promise<string> {
  // Handle absolute HTTPS URLs (CDN)
  if (mediaPath.startsWith('http://') || mediaPath.startsWith('https://')) {
    return mediaPath; // Use as-is
  }

  // Handle data URIs
  if (mediaPath.startsWith('data:')) {
    return mediaPath; // Use as-is
  }

  // Handle relative paths
  const documentDir = vscode.Uri.joinPath(documentUri, '..');
  const absolutePath = vscode.Uri.joinPath(documentDir, mediaPath);

  // Check if file exists
  try {
    await vscode.workspace.fs.stat(absolutePath);
  } catch {
    throw new Error(`Media file not found: ${mediaPath}`);
  }

  // Convert to webview URI
  return webview.asWebviewUri(absolutePath).toString();
}
```

#### Updating Configuration for Webview

When sending compiled JSON to webview, rewrite all media paths:

```typescript
async function prepareConfigForWebview(
  config: IEngineConfiguration,
  webview: vscode.Webview,
  documentUri: vscode.Uri
): Promise<IEngineConfiguration> {
  const updatedConfig = { ...config };

  // Update timeline provider URIs
  for (const timeline of updatedConfig.timelines) {
    if (timeline.uri && !timeline.uri.startsWith('http')) {
      timeline.uri = await resolveMediaResource(
        webview,
        timeline.uri,
        documentUri
      );
    }
  }

  // Update other media references (images in layoutTemplate, etc.)
  // ... additional processing

  return updatedConfig;
}
```

#### CSP for Media Loading

**Critical**: CSP must allow media sources:

```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none';
               media-src ${webview.cspSource} https: data:;">
```

- `${webview.cspSource}` - Allows `vscode-webview://` URIs
- `https:` - Allows CDN-hosted media
- `data:` - Allows data URIs (small embedded media)

#### Video.js Integration

Eligius uses Video.js for video timeline providers. Ensure Video.js can load from webview URIs:

```javascript
// In preview webview
const player = videojs('video-element', {
  sources: [{
    src: webviewUri,  // vscode-webview:// URI
    type: 'video/mp4'
  }]
});
```

**Known Issue**: Video.js may have issues with custom URI schemes. Test thoroughly.

**Workaround**: If Video.js fails with webview URIs, consider using native `<video>` element or `HTMLMediaElement` directly.

#### Performance Considerations

1. **Large Video Files**: Loading 100MB+ videos in webview may be slow
2. **Streaming**: Webview URIs don't support HTTP range requests (no seeking in large files)
3. **Memory**: Multiple large videos in timeline may exhaust webview memory

**Recommendations**:
- Warn users about large media files (>50MB)
- Suggest using shorter clips for development
- Consider showing static preview for large video timelines

---

## 5. Error Handling Patterns

### Decision: Multi-Level Error Display with Contextual Help

**Chosen Approach**:
1. **Compilation Errors**: Show in VS Code Problems panel + inline diagnostics
2. **Runtime Errors**: Display in preview webview + notification
3. **Resource Errors**: Actionable error messages with suggestions

### Rationale

- **Compilation errors** are caught early (syntax, validation)
- **Runtime errors** occur in webview (Eligius engine failures)
- **Resource errors** need user action (missing files, wrong paths)

### Implementation Notes

#### Compilation Error Display

**Use VS Code Diagnostics API:**

```typescript
import * as vscode from 'vscode';

const diagnosticCollection = vscode.languages.createDiagnosticCollection('eligian');

function showCompilationError(
  document: vscode.TextDocument,
  error: CompilationError
): void {
  const diagnostic = new vscode.Diagnostic(
    new vscode.Range(
      error.line - 1,
      error.column,
      error.line - 1,
      error.column + error.length
    ),
    error.message,
    vscode.DiagnosticSeverity.Error
  );

  // Add related information
  if (error.hint) {
    diagnostic.relatedInformation = [
      new vscode.DiagnosticRelatedInformation(
        new vscode.Location(document.uri, diagnostic.range),
        error.hint
      )
    ];
  }

  diagnosticCollection.set(document.uri, [diagnostic]);
}
```

#### Runtime Error Display in Webview

**Show errors directly in preview:**

```html
<!-- In webview HTML -->
<div id="preview-container"></div>
<div id="error-display" style="display: none;">
  <div class="error-icon">⚠️</div>
  <h2 class="error-title">Timeline Preview Error</h2>
  <p class="error-message"></p>
  <details class="error-details">
    <summary>Technical Details</summary>
    <pre class="error-stack"></pre>
  </details>
  <button onclick="retryPreview()">Retry</button>
</div>
```

```javascript
// In preview script
function showError(title, message, details) {
  document.getElementById('preview-container').style.display = 'none';
  document.getElementById('error-display').style.display = 'block';

  document.querySelector('.error-title').textContent = title;
  document.querySelector('.error-message').textContent = message;
  document.querySelector('.error-stack').textContent = JSON.stringify(details, null, 2);
}

window.addEventListener('error', (event) => {
  showError(
    'JavaScript Error',
    event.message,
    { filename: event.filename, lineno: event.lineno }
  );

  // Report to extension
  vscode.postMessage({
    type: 'runtime-error',
    error: {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno
    }
  });
});
```

#### Resource Error Handling

**Provide actionable suggestions:**

```typescript
async function handleResourceError(
  error: ResourceError,
  documentUri: vscode.Uri
): Promise<void> {
  let message = `Preview Error: ${error.message}`;
  let actions: string[] = [];

  if (error.type === 'media-not-found') {
    message = `Media file not found: ${error.resourcePath}`;
    actions = [
      'Open Workspace Folder',
      'Change Media Path'
    ];
  } else if (error.type === 'media-load-failed') {
    message = `Failed to load media: ${error.resourcePath}`;
    actions = [
      'Check File Format',
      'Try Different File'
    ];
  }

  const choice = await vscode.window.showErrorMessage(
    message,
    ...actions
  );

  // Handle user choice
  switch (choice) {
    case 'Open Workspace Folder':
      vscode.commands.executeCommand('vscode.openFolder');
      break;
    case 'Change Media Path':
      // Open document at error location
      const editor = await vscode.window.showTextDocument(documentUri);
      editor.selection = new vscode.Selection(error.line, 0, error.line, 0);
      break;
    // ... other actions
  }
}
```

#### Common Error Scenarios

1. **Invalid Eligian Syntax**
   - Show in Problems panel
   - Red squiggly underline
   - Hint: "Expected ']' after operation list"

2. **Missing Media File**
   - Show notification
   - Action: "Select File"
   - Preview shows placeholder image

3. **Eligius Engine Initialization Failure**
   - Show in preview webview
   - Details: Stack trace, config dump
   - Action: "Retry" or "Reset Preview"

4. **Unsupported Timeline Provider**
   - Show warning notification
   - Fallback: Show static JSON view
   - Suggestion: "Video.js not available, using animation provider"

5. **Large File Performance Issues**
   - Show progress indicator
   - Warning after 5 seconds: "Large timeline detected, preview may be slow"
   - Action: "Cancel Preview"

---

## Implementation Roadmap

### Phase 1: Basic Webview (MVP)
- [ ] Create webview panel command
- [ ] Load static HTML with sample Eligius config
- [ ] Test Eligius engine in webview context
- [ ] Implement postMessage communication

### Phase 2: File Watching & Compilation
- [ ] Watch for `.eligian` file saves
- [ ] Compile on save
- [ ] Send compiled JSON to webview
- [ ] Handle active editor changes

### Phase 3: Media Resource Support
- [ ] Resolve relative media paths
- [ ] Convert to webview URIs
- [ ] Test with video timeline provider
- [ ] Handle missing file errors

### Phase 4: Error Handling & UX
- [ ] Compilation error diagnostics
- [ ] Runtime error display in preview
- [ ] Actionable error notifications
- [ ] Loading states and progress indicators

### Phase 5: Polish & Performance
- [ ] Debouncing for rapid saves
- [ ] Memory management for large files
- [ ] CSP refinement
- [ ] Bundle optimization

---

## Open Questions

1. **Video.js Compatibility**: Does Video.js work reliably with `vscode-webview://` URIs?
   - **Action**: Prototype and test with sample video file
   - **Risk**: May need custom media element implementation

2. **Bundle Size**: How large will the Eligius + dependencies bundle be?
   - **Action**: Create test bundle and measure
   - **Threshold**: <2MB acceptable for extension

3. **Compilation Performance**: Can we compile in <100ms for typical files?
   - **Action**: Benchmark compiler with representative `.eligian` files
   - **Fallback**: Show progress indicator for slow compilations

4. **Workspace Context**: How to handle media paths in multi-root workspaces?
   - **Action**: Test with multi-root workspace setup
   - **Solution**: Resolve relative to `.eligian` file location

5. **Preview State Persistence**: Should preview state survive VS Code restarts?
   - **Decision**: No for MVP (user can re-open preview)
   - **Future**: Implement `WebviewPanelSerializer` if requested

---

## References

- [VS Code Webview API Documentation](https://code.visualstudio.com/api/extension-guides/webview)
- [VS Code Extension Samples - Webview](https://github.com/microsoft/vscode-extension-samples/tree/main/webview-sample)
- [Eligius Library Documentation](https://rolandzwaga.github.io/eligius/)
- [Eligius GitHub Repository](https://github.com/rolandzwaga/eligius)
- [Content Security Policy Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [Video.js Documentation](https://videojs.com/)

---

**Document Version**: 1.0
**Last Updated**: 2025-10-18
**Author**: Research conducted via Claude Code analysis
