# Implementation Tasks: Eligian Timeline Preview

**Branch**: `001-i-want-to` | **Date**: 2025-10-18 | **Plan**: [plan.md](./plan.md)

## Overview

This document provides a detailed, dependency-ordered breakdown of all implementation tasks for the Eligian Timeline Preview feature. Tasks are organized by user story priority (P1, P2, P3) and numbered sequentially. Tasks marked with [P] can be executed in parallel.

**Total Estimated Time**: 22 hours (across 7 phases)

## Task Categories

- **Setup Tasks** (S): Environment setup, configuration, dependencies
- **Foundational Tasks** (F): Core infrastructure needed by multiple features
- **Implementation Tasks** (I): Feature-specific implementation
- **Testing Tasks** (T): Unit tests, integration tests, manual testing
- **Polish Tasks** (P): Documentation, cleanup, optimization

---

## Phase 2: MVP - Basic Preview (4 hours)

**Goal**: Get a working webview that shows compiled JSON
**User Story**: US1 - Instant Timeline Preview (P1)

### Setup Tasks

**T001 [S]** - Add preview command contribution to package.json
**Time**: 15 minutes
**Details**:
- Add command contribution: `eligian.preview` with title "Eligian: Preview Timeline"
- Add keybinding: `Ctrl+K V` (Windows/Linux), `Cmd+K V` (Mac)
- Add context menu contribution for `.eligian` files
- Add command icon reference (use codicon `preview`)
**Acceptance**: Command appears in command palette, context menu, and keybinding works

**T002 [S]** - Create preview module structure
**Time**: 10 minutes
**Details**:
- Create `packages/extension/src/extension/preview/` directory
- Create empty files: `PreviewManager.ts`, `PreviewPanel.ts`, `CompilationService.ts`
- Create `packages/extension/src/extension/preview/templates/` directory
- Create empty files: `preview.html`, `error.html`
**Acceptance**: Directory structure matches plan.md specification

### Foundational Tasks

**T003 [F]** - Implement PreviewManager singleton
**Time**: 45 minutes
**Dependencies**: T002
**Details**:
- Create `PreviewManager` class with private constructor
- Implement `getInstance(context: ExtensionContext)` static method
- Add `Map<string, PreviewPanel>` to track panels by document URI
- Implement `showPreview(documentUri: Uri)` method:
  - Check if panel already exists for document → reuse if exists
  - Create new panel if not exists
  - Store panel in map
- Implement `dispose()` method to clean up all panels
- Add to extension's `subscriptions` array for cleanup
**Acceptance**:
- Only one PreviewManager instance exists
- Calling `showPreview()` twice for same file reuses panel
- Calling `showPreview()` for different files creates separate panels

**T004 [F]** - Implement PreviewPanel class structure
**Time**: 30 minutes
**Dependencies**: T002
**Details**:
- Create `PreviewPanel` class with constructor accepting:
  - `documentUri: Uri`
  - `extensionUri: Uri`
- Implement `createWebviewPanel()` private method:
  - Use `vscode.window.createWebviewPanel()`
  - ViewType: `eligianPreview`
  - Title: `Preview: ${filename}`
  - Options: `enableScripts: true`, `retainContextWhenHidden: true`
  - Local resource roots: workspace folders + extension URI
- Add `panel: WebviewPanel` property
- Add `isDisposed: boolean` property
- Implement `dispose()` method
- Wire up `panel.onDidDispose` to set `isDisposed = true`
**Acceptance**:
- Creating PreviewPanel instance creates webview panel
- Panel appears in editor with correct title
- Disposing panel sets `isDisposed` flag

**T005 [F]** - Create basic HTML template
**Time**: 30 minutes
**Dependencies**: T002
**Details**:
- Create `packages/extension/src/extension/preview/templates/preview.html`
- Add HTML structure with:
  - DOCTYPE and basic meta tags
  - Placeholder CSP meta tag (will update in Phase 4)
  - Container div for Eligius engine: `<div id="eligius-container"></div>`
  - Loading indicator: `<div id="loading">Compiling timeline...</div>`
  - Error container: `<div id="error-container" style="display:none"></div>`
  - Placeholder script tag for Eligius (comment for now)
  - Inline script for postMessage listener:
    ```javascript
    const vscode = acquireVsCodeApi();
    window.addEventListener('message', event => {
      const message = event.data;
      switch (message.type) {
        case 'updateConfig':
          // Placeholder: log config for now
          console.log('Received config:', message.payload);
          document.getElementById('loading').style.display = 'none';
          break;
        case 'showError':
          // Placeholder: show errors
          document.getElementById('loading').style.display = 'none';
          document.getElementById('error-container').style.display = 'block';
          document.getElementById('error-container').innerHTML =
            message.payload.errors.map(e => `<p>${e.message}</p>`).join('');
          break;
      }
    });
    // Send ready message
    vscode.postMessage({ type: 'ready' });
    ```
**Acceptance**:
- HTML file is valid
- PostMessage listener is set up
- Loading and error containers exist

**T006 [F]** - Implement HTML template loader in PreviewPanel
**Time**: 30 minutes
**Dependencies**: T004, T005
**Details**:
- Add `getHtmlForWebview()` private method to `PreviewPanel`
- Read `preview.html` template from `templates/` directory
- Replace placeholder variables:
  - `${cspSource}` → `panel.webview.cspSource`
  - `${extensionUri}` → webview URI for extension resources
- Set `panel.webview.html` in constructor
**Acceptance**:
- Webview displays HTML content
- Console shows no CSP errors (even with placeholder CSP)

**T007 [F]** - Implement CompilationService wrapper
**Time**: 45 minutes
**Dependencies**: T002
**Details**:
- Create `CompilationService` class
- Implement `compile(documentUri: Uri)` async method:
  - Read file content using `workspace.fs.readFile()`
  - Decode bytes to string (UTF-8)
  - Import existing Eligian compiler: `import { compile } from '@eligian/language'`
  - Call compiler with source text
  - Return `CompilationResult` object:
    ```typescript
    interface CompilationResult {
      success: boolean;
      config: IEngineConfiguration | null;
      errors: CompilationError[];
      timestamp: number;
    }
    ```
  - Handle compiler errors and convert to `CompilationError[]` format
- Add timeout wrapper (5 seconds) using `Promise.race()`
**Acceptance**:
- Compiling valid `.eligian` file returns success with config
- Compiling invalid file returns failure with errors
- Compilation times out after 5 seconds

**T008 [I]** - Wire up preview command handler
**Time**: 30 minutes
**Dependencies**: T001, T003
**Details**:
- Create `packages/extension/src/extension/commands/preview.ts`
- Implement `registerPreviewCommand(context: ExtensionContext)` function:
  - Get active text editor
  - Check if document language is `eligian`
  - If not, show error: "Please open an .eligian file to preview"
  - If yes, call `PreviewManager.getInstance(context).showPreview(document.uri)`
- Export and register in `packages/extension/src/extension/main.ts`
- Add to `subscriptions` array
**Acceptance**:
- Running command with `.eligian` file open creates preview
- Running command with non-`.eligian` file shows error message

**T009 [I]** - Implement initial compilation on preview open
**Time**: 30 minutes
**Dependencies**: T004, T007
**Details**:
- Add `compileAndUpdate()` private async method to `PreviewPanel`:
  - Call `CompilationService.compile(documentUri)`
  - If success:
    - Send `updateConfig` message to webview
    - Log success to console
  - If failure:
    - Send `showError` message to webview
    - Log errors to console
- Call `compileAndUpdate()` in constructor after creating panel
- Add `onDidReceiveMessage` handler to log webview messages
**Acceptance**:
- Opening preview triggers compilation
- Valid file shows config in webview console
- Invalid file shows errors in error container

### Testing Tasks

**T010 [T]** - Manual test MVP
**Time**: 20 minutes
**Dependencies**: T001-T009
**Details**:
- Test command palette: "Eligian: Preview Timeline" appears
- Test keybinding: `Ctrl+K V` (or `Cmd+K V`) opens preview
- Test context menu: Right-click `.eligian` file → "Preview Timeline"
- Test with valid file: Webview opens, console shows compiled JSON
- Test with invalid file: Webview opens, error container shows errors
- Test reopen: Close preview, trigger again → new panel opens
- Test dispose: Close webview → panel disposed, no errors in console
**Acceptance**: All manual tests pass, no console errors

---

## Phase 3: File Watching & Auto-Update (3 hours)

**Goal**: Preview updates automatically on file save
**User Story**: US2 - Live Preview Updates (P2)

### Foundational Tasks

**T011 [F]** - Implement FileWatcher with debouncing
**Time**: 45 minutes
**Details**:
- Create `packages/extension/src/extension/preview/FileWatcher.ts`
- Create `FileWatcher` class with:
  - `debounceMap: Map<string, NodeJS.Timeout>` to track debounce timers
  - `DEBOUNCE_DELAY = 300` constant (milliseconds)
- Implement `watch(documentUri: Uri, callback: () => void)` method:
  - Subscribe to `workspace.onDidSaveTextDocument`
  - Filter events: only trigger if saved document URI matches watched URI
  - Clear existing timeout for this URI (if any)
  - Set new timeout: `setTimeout(() => callback(), DEBOUNCE_DELAY)`
  - Store timeout in `debounceMap`
- Implement `unwatch(documentUri: Uri)` method:
  - Clear timeout from `debounceMap`
  - Remove from map
- Implement `dispose()` method to clear all timeouts
**Acceptance**:
- Saving file triggers callback after 300ms
- Multiple rapid saves only trigger one callback (debouncing works)
- Unwatching stops callbacks

**T012 [I]** - Wire up file watching to PreviewPanel
**Time**: 30 minutes
**Dependencies**: T011
**Details**:
- Add `fileWatcher: FileWatcher` property to `PreviewPanel`
- In constructor, after creating panel:
  - Create `FileWatcher` instance
  - Call `fileWatcher.watch(documentUri, () => this.compileAndUpdate())`
- In `dispose()` method:
  - Call `fileWatcher.dispose()`
  - Dispose webview panel
**Acceptance**:
- Saving `.eligian` file triggers recompilation after 300ms
- Preview updates with new content
- Closing preview stops watching

**T013 [I]** - Add loading indicator during compilation
**Time**: 30 minutes
**Dependencies**: T012
**Details**:
- Add `isCompiling: boolean` property to `PreviewPanel`
- Modify `compileAndUpdate()`:
  - Set `isCompiling = true` at start
  - Send `{ type: 'showLoading' }` message to webview
  - Run compilation
  - Set `isCompiling = false` at end
  - Send result message (updateConfig or showError)
- Update `preview.html`:
  - Handle `showLoading` message type
  - Show loading indicator: `document.getElementById('loading').style.display = 'block'`
  - Hide error container
**Acceptance**:
- Loading indicator appears when compilation starts
- Loading indicator disappears when compilation completes
- Rapid saves don't cause loading flicker (debouncing prevents this)

**T014 [I]** - Handle active editor changes
**Time**: 45 minutes
**Dependencies**: T003
**Details**:
- Add `workspace.onDidChangeActiveTextEditor` listener in `PreviewManager`
- When active editor changes:
  - Check if new editor document is `.eligian`
  - Check if preview exists for this document
  - If yes, reveal/focus the preview panel
  - If no, do nothing (don't auto-open)
- Handle edge case: switching to non-`.eligian` file → do nothing
**Acceptance**:
- Switching between `.eligian` files with open previews focuses correct preview
- Switching to non-`.eligian` file doesn't affect previews
- Opening new `.eligian` file doesn't auto-create preview (user must trigger)

### Testing Tasks

**T015 [T]** - Manual test file watching
**Time**: 30 minutes
**Dependencies**: T011-T014
**Details**:
- Open `.eligian` file, trigger preview
- Edit file (change action name), save
- Verify: Loading indicator appears, preview updates within 2s
- Make multiple rapid edits, save 3 times quickly (within 1 second)
- Verify: Only one compilation happens (debouncing works)
- Open second `.eligian` file, trigger preview
- Switch between tabs
- Verify: Correct preview focuses when switching files
- Close one preview, edit its file, save
- Verify: No updates happen (watching stopped)
**Acceptance**: All manual tests pass, updates feel smooth, no thrashing

---

## Phase 4: Eligius Integration (4 hours)

**Goal**: Actually run Eligius engine with compiled config
**User Story**: US1 - Instant Timeline Preview (P1)

### Setup Tasks

**T016 [S] [P]** - Install Eligius and dependencies
**Time**: 10 minutes
**Details**:
- Run: `npm install --workspace=packages/extension jquery video-js lottie-web`
- Run: `npm install --workspace=packages/extension @eligius/engine` (or correct package name)
- Verify installation: Check `packages/extension/package.json` dependencies
**Acceptance**: Dependencies appear in package.json, node_modules populated

**T017 [S]** - Setup esbuild bundling for webview
**Time**: 45 minutes
**Dependencies**: T016
**Details**:
- Create `packages/extension/esbuild.webview.js` config file:
  ```javascript
  const esbuild = require('esbuild');

  esbuild.build({
    entryPoints: ['src/webview/preview.ts'],
    bundle: true,
    outfile: 'dist/webview/preview.js',
    platform: 'browser',
    format: 'iife',
    target: 'es2020',
    sourcemap: true,
    minify: process.env.NODE_ENV === 'production',
    external: [] // Bundle everything
  }).catch(() => process.exit(1));
  ```
- Add build script to `packages/extension/package.json`:
  - `"build:webview": "node esbuild.webview.js"`
- Update main build script to include webview build:
  - `"build": "npm run build:extension && npm run build:webview"`
- Create `.vscode/tasks.json` task for watch mode (optional)
**Acceptance**:
- Running `npm run build:webview` creates `dist/webview/preview.js`
- Bundle size is reasonable (<2MB target)

**T018 [S]** - Create webview TypeScript entry point
**Time**: 30 minutes
**Dependencies**: T017
**Details**:
- Create `packages/extension/src/webview/preview.ts`
- Import dependencies:
  ```typescript
  import $ from 'jquery';
  import { Engine } from '@eligius/engine'; // Or correct import
  // Import Video.js, Lottie if needed
  ```
- Add VS Code API typing:
  ```typescript
  declare function acquireVsCodeApi(): {
    postMessage(message: any): void;
    setState(state: any): void;
    getState(): any;
  };
  ```
- Create basic structure:
  - `const vscode = acquireVsCodeApi();`
  - `let engine: Engine | null = null;`
  - Empty message handler (will implement in T020)
  - Send ready message on load
**Acceptance**:
- File compiles without TypeScript errors
- esbuild bundle includes jQuery, Eligius, etc.

### Implementation Tasks

**T019 [I]** - Update HTML template to load bundled script
**Time**: 20 minutes
**Dependencies**: T017, T018
**Details**:
- Modify `PreviewPanel.getHtmlForWebview()`:
  - Generate script URI:
    ```typescript
    const scriptUri = panel.webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'preview.js')
    );
    ```
  - Pass to template as `${scriptUri}`
- Update `preview.html`:
  - Remove inline postMessage script (moved to preview.ts)
  - Add: `<script src="${scriptUri}"></script>`
- Update CSP:
  - Change to: `script-src ${cspSource};` (no unsafe-inline needed)
**Acceptance**:
- Webview loads bundled script successfully
- Console shows no CSP violations
- Console shows bundled libraries loaded (check for jQuery, etc.)

**T020 [I]** - Implement engine initialization in webview
**Time**: 60 minutes
**Dependencies**: T018, T019
**Details**:
- In `preview.ts`, implement message handler:
  ```typescript
  window.addEventListener('message', (event) => {
    const message = event.data;
    switch (message.type) {
      case 'updateConfig':
        initializeEngine(message.payload.config, message.payload.mediaBasePath);
        break;
      case 'showError':
        displayErrors(message.payload.errors);
        break;
      case 'showLoading':
        showLoadingIndicator();
        break;
    }
  });
  ```
- Implement `initializeEngine(config, mediaBasePath)`:
  - Dispose existing engine if present: `engine?.dispose()`
  - Clear container: `$('#eligius-container').empty()`
  - Create new engine instance:
    ```typescript
    engine = new Engine(config, {
      container: document.getElementById('eligius-container'),
      // Other Eligius options
    });
    ```
  - Start engine: `engine.start()`
  - Handle engine errors: catch and send `runtimeError` message to extension
- Implement `displayErrors(errors)`:
  - Hide loading indicator
  - Show error container
  - Render error list with line/column info
- Implement `showLoadingIndicator()`:
  - Show loading div
  - Hide error container
**Acceptance**:
- Webview receives config message
- Eligius engine initializes without errors
- Console shows engine lifecycle events

**T021 [I]** - Handle engine lifecycle (dispose on update)
**Time**: 30 minutes
**Dependencies**: T020
**Details**:
- Modify `initializeEngine()` to properly dispose previous engine:
  - Check `if (engine !== null)`
  - Call `engine.dispose()` or equivalent cleanup
  - Wait for disposal to complete (if async)
  - Set `engine = null`
  - Then create new engine
- Add error handling:
  - Wrap engine initialization in try-catch
  - On error, send `runtimeError` message to extension
  - Display error in webview
- Test rapid updates:
  - Ensure old engine is disposed before new one starts
  - No resource leaks or duplicate timelines
**Acceptance**:
- Updating preview disposes old engine cleanly
- New engine starts without conflicts
- No memory leaks over multiple updates

**T022 [I]** - Update PreviewPanel to pass config via postMessage
**Time**: 20 minutes
**Dependencies**: T020
**Details**:
- Modify `PreviewPanel.compileAndUpdate()`:
  - On successful compilation, prepare message:
    ```typescript
    const message = {
      type: 'updateConfig',
      payload: {
        config: result.config,
        mediaBasePath: '' // Empty for now, will implement in Phase 5
      }
    };
    ```
  - Send to webview: `this.panel.webview.postMessage(message)`
- Update error handling:
  - On compilation failure, send `showError` message with errors
**Acceptance**:
- Webview receives updateConfig message with compiled JSON
- Config is valid Eligius configuration
- Timeline initializes in webview

### Testing Tasks

**T023 [T]** - Test with RAF provider timeline
**Time**: 30 minutes
**Dependencies**: T016-T022
**Details**:
- Create test file: `packages/extension/test/fixtures/simple-raf.eligian`
  - Use RAF provider (requestAnimationFrame)
  - Add simple animation (e.g., move a div, change color)
  - Keep timeline short (5-10 seconds)
- Open file in VS Code
- Trigger preview
- Verify:
  - Webview opens
  - Eligius engine loads
  - RAF animation plays automatically
  - Animation is visible and smooth
  - Console shows no errors
- Edit animation parameters, save
- Verify: Animation updates automatically
**Acceptance**: RAF timeline plays smoothly, updates work

---

## Phase 5: Media Support (4 hours)

**Goal**: Support video/audio timelines with proper URI resolution
**User Story**: US1 - Instant Timeline Preview (P1)

### Implementation Tasks

**T024 [I]** - Implement MediaResolver module
**Time**: 60 minutes
**Details**:
- Create `packages/extension/src/extension/preview/MediaResolver.ts`
- Implement `MediaResolver` class:
  - Constructor accepts `workspace.workspaceFolders` and `webview` instance
  - Method: `resolveMediaPaths(config: IEngineConfiguration): IEngineConfiguration`
- Implement path resolution logic:
  - Walk config object recursively to find media references
  - For each media path (string matching video/audio/image extensions):
    - Check if absolute path → reject (security)
    - Check if HTTPS URL → allow as-is
    - Check if relative path → resolve:
      1. Try relative to document folder
      2. Try relative to each workspace folder
      3. If found: convert to absolute path
      4. Convert to webview URI: `webview.asWebviewUri(vscode.Uri.file(absolutePath))`
      5. Replace in config
    - If not found: log warning, keep original path (will error at runtime)
- Implement path traversal prevention:
  - Reject paths with `..` that escape workspace
  - Use `path.resolve()` to normalize, then check if result is within workspace
**Acceptance**:
- Relative paths resolve to webview URIs
- HTTPS URLs pass through unchanged
- Paths outside workspace are rejected
- Missing files log warnings but don't crash

**T025 [I]** - Walk compiled config to find media references
**Time**: 45 minutes
**Dependencies**: T024
**Details**:
- Implement recursive config walker:
  - Find all string properties that could be media paths
  - Common property names: `src`, `url`, `source`, `file`, `path`, `videoSrc`, `audioSrc`
  - Check file extension: `.mp4`, `.webm`, `.ogg`, `.mp3`, `.wav`, `.jpg`, `.png`, `.gif`
- Handle nested structures:
  - Timeline events array
  - Provider configurations
  - Action parameters
  - Operation data
- Build list of `MediaReference` objects:
  ```typescript
  interface MediaReference {
    path: string[];        // JSONPath to property
    originalValue: string; // Original path/URL
    type: 'video' | 'audio' | 'image';
  }
  ```
- Return updated config with resolved paths
**Acceptance**:
- All media references in config are found
- Nested references are detected
- Config structure is preserved

**T026 [I]** - Integrate MediaResolver into compilation flow
**Time**: 30 minutes
**Dependencies**: T024, T025
**Details**:
- Modify `PreviewPanel.compileAndUpdate()`:
  - After successful compilation:
    ```typescript
    const mediaResolver = new MediaResolver(
      vscode.workspace.workspaceFolders,
      this.panel.webview,
      this.documentUri
    );
    const resolvedConfig = mediaResolver.resolveMediaPaths(result.config);
    ```
  - Send resolved config to webview instead of original
- Update message payload:
  - Remove `mediaBasePath` (no longer needed)
  - Send resolved config directly
**Acceptance**:
- Media paths in config are webview URIs
- Webview can load media without CORS errors

**T027 [I]** - Update CSP for media sources
**Time**: 20 minutes
**Dependencies**: T026
**Details**:
- Modify `PreviewPanel.getHtmlForWebview()`:
  - Update CSP meta tag:
    ```typescript
    const csp = `
      default-src 'none';
      script-src ${webview.cspSource};
      style-src ${webview.cspSource} 'unsafe-inline';
      img-src ${webview.cspSource} https: data:;
      media-src ${webview.cspSource} https: data:;
      font-src ${webview.cspSource};
    `;
    ```
  - Explanation:
    - `script-src`: Only extension scripts (bundled)
    - `style-src`: Extension styles + inline (Eligius generates dynamic styles)
    - `img-src/media-src`: Extension resources + HTTPS URLs + data URIs
    - `font-src`: Extension fonts (for Video.js, etc.)
**Acceptance**:
- No CSP violations in console
- Media files load successfully
- HTTPS media URLs work

**T028 [I]** - Handle missing media files gracefully
**Time**: 30 minutes
**Dependencies**: T024
**Details**:
- Modify `MediaResolver.resolveMediaPaths()`:
  - For each media reference, check if file exists:
    ```typescript
    const exists = await workspace.fs.stat(uri).then(() => true, () => false);
    ```
  - If file doesn't exist:
    - Log warning to extension console
    - Add to `missingFiles` array
    - Keep original path in config (Eligius will handle error)
- After resolution, if `missingFiles.length > 0`:
  - Show VS Code warning notification:
    ```typescript
    vscode.window.showWarningMessage(
      `Preview: ${missingFiles.length} media file(s) not found: ${missingFiles.join(', ')}`
    );
    ```
- In webview, handle media load errors:
  - Listen for `error` events on video/audio elements
  - Display friendly error message in preview
**Acceptance**:
- Missing files show warning notification
- Preview still renders (shows error placeholder for missing media)
- User can identify which files are missing

### Testing Tasks

**T029 [T] [P]** - Create test media files
**Time**: 15 minutes
**Dependencies**: None
**Details**:
- Create `packages/extension/test/fixtures/media/` directory
- Add test video: `test-video.mp4` (small, <1MB, 5 seconds)
  - Use ffmpeg to create solid color video if needed:
    ```bash
    ffmpeg -f lavfi -i color=c=blue:s=320x240:d=5 -f lavfi -i sine=frequency=440:duration=5 test-video.mp4
    ```
- Add test audio: `test-audio.mp3` (small, <500KB, 5 seconds)
- Add test image: `test-image.jpg` (small, <100KB)
**Acceptance**: Test media files are committed to repo

**T030 [T]** - Create video timeline test fixture
**Time**: 20 minutes
**Dependencies**: T029
**Details**:
- Create `packages/extension/test/fixtures/video-timeline.eligian`
- Use video provider with test video:
  ```eligian
  timeline "Video Test" {
    provider video from "media/test-video.mp4"

    action showText(text: string) [
      selectElement("body")
      insertHTML(`<h1>${text}</h1>`)
    ]

    at 1s: showText("Hello at 1s")
    at 3s: showText("World at 3s")
  }
  ```
- Verify file compiles without errors
**Acceptance**: Fixture file is valid Eligian syntax

**T031 [T]** - Test video timeline in preview
**Time**: 30 minutes
**Dependencies**: T024-T028, T029, T030
**Details**:
- Open `video-timeline.eligian` in VS Code
- Trigger preview (`Ctrl+K V`)
- Verify:
  - Webview opens
  - Video loads and plays automatically
  - Timeline events trigger at correct times (1s, 3s)
  - Text appears on video overlay
  - Video controls work (if Video.js is used)
- Test path resolution:
  - Move video file to different folder
  - Update path in `.eligian` file
  - Save and verify preview updates correctly
- Test missing file:
  - Reference non-existent video: `from "missing.mp4"`
  - Verify warning notification appears
  - Verify preview shows error message
**Acceptance**: Video timeline works end-to-end, errors are handled gracefully

---

## Phase 6: Error Handling (3 hours)

**Goal**: Clear error feedback for compilation and runtime errors
**User Story**: US3 - Error Feedback in Preview (P2)

### Implementation Tasks

**T032 [I]** - Implement error display UI in webview
**Time**: 45 minutes
**Details**:
- Update `preview.html`:
  - Improve error container styling:
    ```html
    <div id="error-container" style="display:none">
      <h2>Compilation Errors</h2>
      <div id="error-list"></div>
      <button id="retry-button">Retry</button>
    </div>
    ```
- In `preview.ts`, implement `displayErrors(errors, sourceFile)`:
  - Clear previous errors
  - For each error:
    - Create error card with:
      - Error message
      - Line and column: `Line ${error.line}, Column ${error.column}`
      - Error code: `[${error.code}]`
      - Severity badge (error vs warning)
    - Add to error list
  - Show error container
  - Hide loading indicator
  - Wire up retry button: `vscode.postMessage({ type: 'retry' })`
- Add CSS styling for error cards:
  - Red border for errors, yellow for warnings
  - Monospace font for code references
  - Clear visual hierarchy
**Acceptance**:
- Errors display in readable format
- Line/column information is clear
- Retry button is visible

**T033 [I]** - Add DiagnosticsCollection for Problems panel
**Time**: 45 minutes
**Details**:
- In `PreviewPanel` or `PreviewManager`:
  - Create diagnostics collection:
    ```typescript
    const diagnostics = vscode.languages.createDiagnosticCollection('eligian-preview');
    ```
  - Add to extension subscriptions
- Modify `PreviewPanel.compileAndUpdate()`:
  - On compilation success: clear diagnostics for document
    ```typescript
    diagnostics.set(this.documentUri, []);
    ```
  - On compilation failure: add diagnostics
    ```typescript
    const vsDiagnostics = result.errors.map(error => {
      const range = new vscode.Range(
        error.line - 1, error.column - 1,
        error.line - 1, error.column - 1 + error.length
      );
      const diagnostic = new vscode.Diagnostic(
        range,
        error.message,
        error.severity === 'error'
          ? vscode.DiagnosticSeverity.Error
          : vscode.DiagnosticSeverity.Warning
      );
      diagnostic.code = error.code;
      diagnostic.source = 'Eligian Preview';
      return diagnostic;
    });
    diagnostics.set(this.documentUri, vsDiagnostics);
    ```
**Acceptance**:
- Compilation errors appear in Problems panel
- Clicking error navigates to source location
- Errors clear when compilation succeeds

**T034 [I]** - Handle runtime errors from Eligius engine
**Time**: 45 minutes
**Dependencies**: T020
**Details**:
- In `preview.ts`, wrap engine initialization in try-catch:
  ```typescript
  try {
    engine = new Engine(config, options);
    await engine.start();
  } catch (error) {
    vscode.postMessage({
      type: 'runtimeError',
      payload: {
        message: error.message,
        stack: error.stack
      }
    });
  }
  ```
- Listen for Eligius runtime errors (if engine provides error events):
  ```typescript
  engine.on('error', (error) => {
    vscode.postMessage({
      type: 'runtimeError',
      payload: { message: error.message }
    });
  });
  ```
- In `PreviewPanel`, handle `runtimeError` messages:
  - Add `onDidReceiveMessage` handler:
    ```typescript
    panel.webview.onDidReceiveMessage(message => {
      if (message.type === 'runtimeError') {
        vscode.window.showErrorMessage(
          `Eligian Preview Runtime Error: ${message.payload.message}`
        );
      }
    });
    ```
**Acceptance**:
- Runtime errors show in VS Code notification
- Error details are clear and actionable
- Preview doesn't crash on runtime error

**T035 [I]** - Implement retry functionality
**Time**: 30 minutes
**Dependencies**: T032
**Details**:
- In `preview.ts`, handle retry button click:
  ```typescript
  document.getElementById('retry-button').addEventListener('click', () => {
    vscode.postMessage({ type: 'retry' });
  });
  ```
- In `PreviewPanel`, handle retry message:
  ```typescript
  panel.webview.onDidReceiveMessage(message => {
    if (message.type === 'retry') {
      this.compileAndUpdate();
    }
  });
  ```
- Update UI during retry:
  - Hide error container
  - Show loading indicator
  - Trigger compilation
**Acceptance**:
- Clicking retry triggers recompilation
- Loading indicator appears
- If error is fixed, preview updates; if not, error shows again

### Testing Tasks

**T036 [T]** - Create error test fixtures
**Time**: 20 minutes
**Details**:
- Create `packages/extension/test/fixtures/syntax-error.eligian`:
  ```eligian
  timeline "Syntax Error Test" {
    provider raf

    at 1s: unknownAction()  // Error: action not defined
  }
  ```
- Create `packages/extension/test/fixtures/validation-error.eligian`:
  ```eligian
  timeline "Validation Error Test" {
    provider video from "missing-file.mp4"  // Error: file not found

    action test() [
      unknownOperation()  // Error: operation not in registry
    ]
  }
  ```
**Acceptance**: Fixtures compile with expected errors

**T037 [T]** - Manual test error handling
**Time**: 30 minutes
**Dependencies**: T032-T036
**Details**:
- Open `syntax-error.eligian`
- Trigger preview
- Verify:
  - Error appears in webview error container
  - Error appears in Problems panel
  - Error message is clear and includes line/column
  - Retry button is visible
- Fix error (define the action), save
- Verify:
  - Preview updates automatically
  - Error disappears from webview
  - Error disappears from Problems panel
- Open `validation-error.eligian`
- Verify:
  - Multiple errors show in list
  - Each error has correct line/column
- Click retry button
- Verify: Compilation runs again, errors persist (since not fixed)
**Acceptance**: All error scenarios handled gracefully, UX is clear

---

## Phase 7: Polish & Testing (4 hours)

**Goal**: Production-ready quality and comprehensive tests
**User Story**: All (polish applies to entire feature)

### Testing Tasks

**T038 [T]** - Write unit tests for PreviewManager
**Time**: 45 minutes
**Details**:
- Create `packages/extension/src/extension/preview/__tests__/PreviewManager.test.ts`
- Test cases:
  - `getInstance()` returns same instance (singleton)
  - `showPreview(uri)` creates new panel for new document
  - `showPreview(uri)` reuses panel for same document
  - `showPreview(uri2)` creates separate panel for different document
  - `dispose()` cleans up all panels
  - Disposing a panel removes it from manager's map
- Use Vitest (project standard)
- Mock VS Code API using `@vscode/test-electron` utilities
**Acceptance**: All tests pass, coverage >80%

**T039 [T] [P]** - Write unit tests for FileWatcher
**Time**: 45 minutes
**Details**:
- Create `packages/extension/src/extension/preview/__tests__/FileWatcher.test.ts`
- Test cases:
  - `watch(uri, callback)` triggers callback on file save
  - Callback is debounced (300ms delay)
  - Multiple rapid saves trigger only one callback
  - `unwatch(uri)` stops callbacks
  - `dispose()` clears all timeouts
  - Watching multiple files works independently
- Mock `workspace.onDidSaveTextDocument` event
- Use fake timers for debounce testing
**Acceptance**: All tests pass, debouncing verified

**T040 [T] [P]** - Write unit tests for MediaResolver
**Time**: 45 minutes
**Details**:
- Create `packages/extension/src/extension/preview/__tests__/MediaResolver.test.ts`
- Test cases:
  - Resolves relative path to workspace file
  - Converts file path to webview URI
  - HTTPS URLs pass through unchanged
  - Absolute paths are rejected (security)
  - Paths with `..` escaping workspace are rejected
  - Missing files log warning but don't crash
  - Walks nested config structure to find all media
  - Handles multiple media types (video, audio, image)
- Mock `workspace.fs.stat()` for file existence checks
- Mock `webview.asWebviewUri()` for URI conversion
**Acceptance**: All tests pass, security checks verified

**T041 [T] [P]** - Write unit tests for CompilationService
**Time**: 30 minutes
**Details**:
- Create `packages/extension/src/extension/preview/__tests__/CompilationService.test.ts`
- Test cases:
  - `compile(uri)` returns success for valid file
  - `compile(uri)` returns errors for invalid file
  - Compilation timeout after 5 seconds
  - File read errors are handled gracefully
- Mock `workspace.fs.readFile()`
- Mock compiler from `@eligian/language`
**Acceptance**: All tests pass, error handling verified

**T042 [T]** - Write integration tests for full preview flow
**Time**: 60 minutes
**Dependencies**: T038-T041
**Details**:
- Create `packages/extension/test/suite/preview.test.ts`
- Use VS Code Extension Test Runner
- Test cases:
  - End-to-end: Open file → trigger preview → webview appears
  - End-to-end: Edit file → save → preview updates
  - Multiple previews work independently
  - Closing preview disposes resources
  - Error handling: Invalid file → errors display
  - Media support: Video timeline → media loads
- Use test fixtures from previous phases
- Mock or use actual webview (depends on test runner capabilities)
**Acceptance**: All integration tests pass, full feature verified

**T043 [T]** - Performance testing with large timelines
**Time**: 30 minutes
**Details**:
- Create `packages/extension/test/fixtures/large-timeline.eligian`:
  - 100+ timeline events
  - Multiple actions with complex operations
  - Nested control flow (if/else, for loops)
  - File size ~50KB
- Open file, trigger preview
- Measure:
  - Compilation time (should be <1s)
  - Preview startup time (should be <3s)
  - Memory usage (should be <50MB per panel)
- Verify:
  - No performance degradation
  - No UI freezing
  - Preview remains responsive
- Test with multiple large files open simultaneously
**Acceptance**: Performance targets met (SC-001, SC-002 from spec.md)

**T044 [T]** - Edge case testing
**Time**: 45 minutes
**Details**:
- Test edge cases:
  - Empty `.eligian` file → shows error or empty preview
  - File with only comments → compiles but no timeline
  - Very short timeline (1ms duration) → plays correctly
  - Very long timeline (1 hour) → shows warning about duration
  - File with Unicode characters → compiles correctly
  - File with very long lines (>1000 chars) → compiles correctly
  - Multiple workspace folders → media resolution works
  - No workspace folder (single file mode) → shows appropriate error
  - Webview closed during compilation → doesn't crash
  - File deleted while preview open → shows error
- Document any limitations found
**Acceptance**: All edge cases handled gracefully, no crashes

### Polish Tasks

**T045 [P]** - Refine CSP and remove unsafe directives
**Time**: 30 minutes
**Details**:
- Review current CSP:
  ```
  script-src ${webview.cspSource};
  style-src ${webview.cspSource} 'unsafe-inline';
  ```
- Investigate removing `'unsafe-inline'` from `style-src`:
  - Extract inline styles from Eligius to separate CSS file
  - If not possible (Eligius generates dynamic styles), document why `'unsafe-inline'` is necessary
- Verify no other unsafe directives are needed
- Test with strictest possible CSP
**Acceptance**: CSP is as strict as possible, no console violations

**T046 [P] [P]** - Add icons and visual polish
**Time**: 30 minutes
**Details**:
- Create preview command icon:
  - Use VS Code codicon `preview` or create custom SVG
  - Add to `packages/extension/media/icons/preview.svg`
- Update command contribution in `package.json`:
  - Add icon reference: `"icon": "$(preview)"`
- Create CSS for webview:
  - Create `packages/extension/media/preview-styles.css`
  - Add professional styling for:
    - Loading indicator (spinner animation)
    - Error cards (clean, readable design)
    - Container layout (proper padding, responsive)
  - Load in `preview.html`: `<link rel="stylesheet" href="${stylesUri}">`
- Polish webview appearance:
  - Match VS Code theme colors (use CSS variables)
  - Add smooth transitions
  - Ensure accessibility (ARIA labels, keyboard navigation)
**Acceptance**: Preview looks professional, matches VS Code design language

**T047 [P] [P]** - Add JSDoc documentation
**Time**: 45 minutes
**Details**:
- Add JSDoc comments to all public APIs:
  - `PreviewManager`: Class, constructor, `getInstance()`, `showPreview()`
  - `PreviewPanel`: Class, constructor, `dispose()`, `compileAndUpdate()`
  - `FileWatcher`: Class, `watch()`, `unwatch()`, `dispose()`
  - `MediaResolver`: Class, `resolveMediaPaths()`
  - `CompilationService`: Class, `compile()`
- Documentation should include:
  - Purpose of class/method
  - Parameter descriptions with types
  - Return value description
  - Example usage (for complex APIs)
  - `@throws` tags for error conditions
- Follow TSDoc standard
**Acceptance**: All public APIs documented, documentation is clear

**T048 [P]** - Update README and user documentation
**Time**: 30 minutes
**Details**:
- Update `packages/extension/README.md`:
  - Add "Preview Timeline" feature section
  - Document keyboard shortcut (`Ctrl+K V` / `Cmd+K V`)
  - Document context menu option
  - Add screenshot of preview in action (if possible)
  - Document limitations:
    - Requires workspace folder for media resolution
    - Multi-root workspaces may have limited support
    - Large media files (>50MB) may be slow
- Update project-level documentation:
  - Add to `CHANGELOG.md` (prepare for release)
  - Update `PROJECT_PROGRESS.md` with completed feature
**Acceptance**: Documentation is complete, user-friendly, accurate

**T049 [P]** - Run Biome and fix all issues
**Time**: 20 minutes
**Details**:
- Run: `npm run check` (Biome auto-fix)
- Review any remaining issues:
  - Fix legitimate code issues
  - Update `biome.json` if false positives (with justification comments)
- Ensure zero warnings and errors
- Run: `npm run test` to verify no breakage
**Acceptance**: Biome check passes cleanly (constitution principle XI)

### Final Verification

**T050 [T]** - Manual testing checklist (comprehensive)
**Time**: 45 minutes
**Dependencies**: T001-T049
**Details**:
Run through complete manual testing checklist from plan.md:
- [ ] Open `.eligian` file, press `Ctrl+K V`, see preview (P1)
- [ ] Edit file, save, see update within 2s (P2)
- [ ] Open multiple files, verify separate previews (P1)
- [ ] Close preview, reopen, verify state reset (P1)
- [ ] Test with RAF timeline (animations work) (P1)
- [ ] Test with video timeline (video plays) (P1)
- [ ] Test with audio timeline (audio plays) (P1)
- [ ] Introduce syntax error, verify error display (P2)
- [ ] Reference missing media file, verify error (P2)
- [ ] Test with large file (100KB), verify performance (P3)
- [ ] Test with long timeline (100+ events), verify performance (P3)
- [ ] Verify all error messages are clear and actionable (P2)
- [ ] Verify no console errors or warnings (P2)
- [ ] Verify CSP compliance (no violations) (P2)
- [ ] Test keyboard shortcut, command palette, context menu (P1)

**Acceptance**: All checklist items pass, feature is production-ready

---

## Success Metrics Verification

After completing all tasks, verify these metrics from spec.md:

### P1 Metrics (Must Achieve)
- [ ] **SC-001**: Preview opens in <3s after command invocation
- [ ] **SC-002**: Preview updates in <2s after file save
- [ ] **SC-003**: Preview correctly renders 95% of valid `.eligian` files

### P2 Metrics (Should Achieve)
- [ ] Zero CSP violations in browser console
- [ ] All unit tests pass (80%+ coverage)
- [ ] Integration tests cover all P1/P2 user stories

### P3 Metrics (Nice to Have)
- [ ] Handles files up to 100KB without degradation
- [ ] Handles timelines with 100+ events smoothly

---

## Task Execution Strategy

### Parallel Execution Opportunities

Tasks marked with [P] can be executed in parallel:

**Setup Phase**:
- T016, T029 can run in parallel (different concerns)

**Testing Phase**:
- T038, T039, T040, T041 can run in parallel (independent unit tests)
- T046, T047 can run in parallel (visual polish vs. documentation)

**Serial Dependencies**:
- T001-T010 must run mostly in sequence (MVP builds incrementally)
- T011-T015 depend on Phase 2 completion
- T016-T023 depend on each other for bundling setup
- T024-T031 must run in sequence (media resolution is complex)

### Recommended Execution Order

1. **Phase 2** (MVP): T001 → T002 → T003-T007 [can parallelize some] → T008-T010
2. **Phase 3** (File Watching): T011 → T012-T014 → T015
3. **Phase 4** (Eligius): T016 → T017 → T018 [P] T029 → T019-T022 → T023
4. **Phase 5** (Media): T024 → T025 → T026-T028 → T030-T031
5. **Phase 6** (Errors): T032 [P] T033 → T034 → T035 → T036-T037
6. **Phase 7** (Polish): T038 [P] T039 [P] T040 [P] T041 → T042-T044 → T045 [P] T046 [P] T047 → T048-T049 → T050

---

## Constitution Compliance

All tasks must adhere to constitution principles:

- **Simplicity** (I): Avoid over-engineering, use standard patterns
- **Testing** (II): Write tests for all non-trivial code
- **No Gold-Plating** (III): Focus on P1/P2 user stories, defer P3 features
- **Documentation** (X): Add JSDoc for all public APIs
- **Biome Integration** (XI): Run `npm run check` after each task
- **ESM Imports** (IX): Use `.js` extensions for relative imports

---

## Post-Implementation

After completing all tasks:

1. **Review**: Check all acceptance criteria are met
2. **Test**: Run full test suite (`npm run test`)
3. **Biome**: Run `npm run check` (must pass)
4. **Commit**: Create git commits following project conventions
5. **PR**: Create pull request against `main` branch
6. **Documentation**: Update `PROJECT_PROGRESS.md` with completion status

---

## Deferred User Stories

The following user stories are intentionally deferred to post-launch iterations:

### User Story 4 - Timeline Playback Controls (Priority: P3)

**Status**: Deferred to post-launch

**Rationale**: Basic playback controls (play, pause, restart) are nice-to-have for testing but not essential for MVP. Developers can restart previews by re-triggering the command or editing timeline start times in code.

**Future Implementation**: See plan.md "Post-Launch" section (lines 484-495) for planned enhancements including:
- Playback controls (play/pause/restart buttons)
- Timeline scrubbing (seek to specific time)
- Breakpoints/debugging (pause at specific events)

**Acceptance Scenarios**: Documented in spec.md (lines 58-71) for future reference.

---

**Next Step**: Begin with T001 - Add preview command contribution to package.json
