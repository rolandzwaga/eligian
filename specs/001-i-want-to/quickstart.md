# Quickstart: Eligian Timeline Preview

**Feature**: Eligian Timeline Preview
**Date**: 2025-10-18
**Purpose**: Get developers started with implementing the preview feature

## Overview

This quickstart guides you through the minimal setup needed to create a working preview feature for the Eligian VS Code extension.

## Prerequisites

Before starting, ensure you have:
- [ ] VS Code extension development environment set up
- [ ] Eligian language package and compiler working
- [ ] Node.js 18+ installed
- [ ] Familiarity with VS Code extension API
- [ ] Access to the Eligius engine repository (sibling directory)

## Project Structure

The preview feature will be implemented in the `packages/extension` directory:

```
packages/extension/
├── src/
│   ├── extension/
│   │   ├── main.ts                    # Extension activation (add preview command)
│   │   ├── preview/                   # NEW: Preview feature
│   │   │   ├── PreviewPanel.ts        # Manages webview panel lifecycle
│   │   │   ├── PreviewManager.ts      # Singleton manager for all panels
│   │   │   ├── FileWatcher.ts         # Watches for file changes
│   │   │   ├── MediaResolver.ts       # Resolves media file URIs
│   │   │   └── templates/
│   │   │       └── preview.html       # Webview HTML template
│   │   └── commands/
│   │       └── preview.ts             # "Eligian: Preview Timeline" command
│   └── language/
│       └── main.ts                    # Language server (no changes)
├── media/                             # NEW: Assets for preview
│   ├── preview-styles.css
│   └── preview-error.css
└── package.json                       # Add command contributions
```

## Step 1: Add Preview Command (5 minutes)

### 1.1 Register Command in package.json

Add to `contributes.commands`:

```json
{
  "command": "eligian.preview",
  "title": "Eligian: Preview Timeline",
  "category": "Eligian",
  "icon": "$(open-preview)"
}
```

Add keybinding to `contributes.keybindings`:

```json
{
  "command": "eligian.preview",
  "key": "ctrl+k v",
  "mac": "cmd+k v",
  "when": "editorLangId == eligian"
}
```

Add to editor title menu:

```json
{
  "command": "eligian.preview",
  "when": "resourceLangId == eligian",
  "group": "navigation"
}
```

### 1.2 Implement Command Handler

Create `src/extension/commands/preview.ts`:

```typescript
import * as vscode from 'vscode';
import { PreviewManager } from '../preview/PreviewManager';

export function registerPreviewCommand(context: vscode.ExtensionContext): vscode.Disposable {
  return vscode.commands.registerCommand('eligian.preview', () => {
    const editor = vscode.window.activeTextEditor;

    if (!editor || editor.document.languageId !== 'eligian') {
      vscode.window.showErrorMessage('Please open an .eligian file to preview');
      return;
    }

    PreviewManager.getInstance(context).showPreview(editor.document.uri);
  });
}
```

### 1.3 Register in Extension Activation

Update `src/extension/main.ts`:

```typescript
import { registerPreviewCommand } from './commands/preview';

export function activate(context: vscode.ExtensionContext): void {
  // Existing activation code...

  // Register preview command
  context.subscriptions.push(registerPreviewCommand(context));
}
```

## Step 2: Create Preview Manager (15 minutes)

Create `src/extension/preview/PreviewManager.ts`:

```typescript
import * as vscode from 'vscode';
import { PreviewPanel } from './PreviewPanel';

export class PreviewManager {
  private static instance: PreviewManager;
  private panels = new Map<string, PreviewPanel>();
  private context: vscode.ExtensionContext;

  private constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  public static getInstance(context: vscode.ExtensionContext): PreviewManager {
    if (!PreviewManager.instance) {
      PreviewManager.instance = new PreviewManager(context);
    }
    return PreviewManager.instance;
  }

  public showPreview(documentUri: vscode.Uri): void {
    const key = documentUri.toString();

    // Reuse existing panel if available
    if (this.panels.has(key)) {
      this.panels.get(key)!.reveal();
      return;
    }

    // Create new panel
    const panel = new PreviewPanel(documentUri, this.context);
    this.panels.set(key, panel);

    // Clean up when panel is disposed
    panel.onDispose(() => {
      this.panels.delete(key);
    });
  }

  public dispose(): void {
    this.panels.forEach(panel => panel.dispose());
    this.panels.clear();
  }
}
```

## Step 3: Create Preview Panel (30 minutes)

Create `src/extension/preview/PreviewPanel.ts`:

```typescript
import * as vscode from 'vscode';
import { compile } from '../../../language/src/compiler/pipeline';
import { Effect } from 'effect';

export class PreviewPanel {
  private panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];
  private onDisposeEmitter = new vscode.EventEmitter<void>();

  constructor(
    private documentUri: vscode.Uri,
    private context: vscode.ExtensionContext
  ) {
    this.panel = this.createWebviewPanel();
    this.setupMessageHandling();
    this.setupFileWatcher();
    this.updatePreview();
  }

  public onDispose(callback: () => void): vscode.Disposable {
    return this.onDisposeEmitter.event(callback);
  }

  public reveal(): void {
    this.panel.reveal();
  }

  public dispose(): void {
    this.panel.dispose();
    this.disposables.forEach(d => d.dispose());
    this.onDisposeEmitter.fire();
  }

  private createWebviewPanel(): vscode.WebviewPanel {
    const panel = vscode.window.createWebviewPanel(
      'eligianPreview',
      `Preview: ${vscode.workspace.asRelativePath(this.documentUri)}`,
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          this.context.extensionUri,
          vscode.Uri.joinPath(this.documentUri, '..')
        ]
      }
    );

    panel.onDidDispose(() => this.dispose(), null, this.disposables);
    return panel;
  }

  private setupMessageHandling(): void {
    this.panel.webview.onDidReceiveMessage(
      message => this.handleWebviewMessage(message),
      null,
      this.disposables
    );
  }

  private setupFileWatcher(): void {
    // Watch for saves to this specific document
    const watcher = vscode.workspace.onDidSaveTextDocument(doc => {
      if (doc.uri.toString() === this.documentUri.toString()) {
        this.updatePreview();
      }
    });
    this.disposables.push(watcher);
  }

  private async updatePreview(): Promise<void> {
    try {
      const document = await vscode.workspace.openTextDocument(this.documentUri);
      const source = document.getText();

      // Compile using existing Eligian compiler
      const result = await Effect.runPromise(compile(source));

      // Send configuration to webview
      this.panel.webview.postMessage({
        type: 'updateConfig',
        payload: {
          config: result.config
        }
      });
    } catch (error: any) {
      // Show compilation error in webview
      this.panel.webview.postMessage({
        type: 'showError',
        payload: {
          message: error.message || 'Compilation failed'
        }
      });
    }
  }

  private handleWebviewMessage(message: any): void {
    switch (message.type) {
      case 'ready':
        this.updatePreview();
        break;
      case 'runtimeError':
        vscode.window.showErrorMessage(`Preview Error: ${message.payload.message}`);
        break;
    }
  }

  private getHtmlForWebview(): string {
    // TODO: Load from templates/preview.html
    return `<!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>Eligian Preview</title>
        </head>
        <body>
          <div id="preview-container"></div>
          <script>
            const vscode = acquireVsCodeApi();

            window.addEventListener('message', event => {
              const message = event.data;
              if (message.type === 'updateConfig') {
                // TODO: Initialize Eligius engine with config
                console.log('Received config:', message.payload.config);
              }
            });

            // Signal ready
            vscode.postMessage({ type: 'ready' });
          </script>
        </body>
      </html>`;
  }
}
```

## Step 4: Create HTML Template (20 minutes)

Create `src/extension/preview/templates/preview.html`:

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="
    default-src 'none';
    script-src 'unsafe-inline' https://cdn.jsdelivr.net;
    style-src 'unsafe-inline' https://cdn.jsdelivr.net;
    img-src vscode-resource: https: data:;
    media-src vscode-resource: https: data:;
    font-src https://cdn.jsdelivr.net;
  ">
  <title>Eligian Preview</title>

  <!-- Load jQuery (required by Eligius) -->
  <script src="https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js"></script>

  <!-- Load Eligius engine -->
  <!-- TODO: Replace with actual Eligius bundle URL or bundled version -->
  <script src="https://cdn.jsdelivr.net/npm/@eligius/engine@latest/dist/eligius.min.js"></script>

  <style>
    body {
      margin: 0;
      padding: 20px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
    }

    #preview-container {
      width: 100%;
      height: calc(100vh - 40px);
      border: 1px solid var(--vscode-panel-border);
      background: white;
    }

    #error-display {
      padding: 20px;
      background: var(--vscode-inputValidation-errorBackground);
      border: 1px solid var(--vscode-inputValidation-errorBorder);
      color: var(--vscode-inputValidation-errorForeground);
      margin-bottom: 20px;
      display: none;
    }

    #loading {
      text-align: center;
      padding: 50px;
    }
  </style>
</head>
<body>
  <div id="error-display"></div>
  <div id="loading">Loading preview...</div>
  <div id="preview-container" style="display: none;"></div>

  <script>
    const vscode = acquireVsCodeApi();
    let engineInstance = null;

    // Handle messages from extension
    window.addEventListener('message', event => {
      const message = event.data;

      switch (message.type) {
        case 'updateConfig':
          initializeEngine(message.payload.config);
          break;
        case 'showError':
          showError(message.payload.message);
          break;
      }
    });

    function initializeEngine(config) {
      document.getElementById('loading').style.display = 'none';
      document.getElementById('error-display').style.display = 'none';
      document.getElementById('preview-container').style.display = 'block';

      try {
        // Dispose previous instance
        if (engineInstance) {
          engineInstance.dispose();
        }

        // Initialize Eligius engine
        // TODO: Replace with actual Eligius API
        engineInstance = new EligiusEngine(config, {
          containerSelector: '#preview-container'
        });

        engineInstance.start();
      } catch (error) {
        showError(error.message);
        vscode.postMessage({
          type: 'runtimeError',
          payload: { message: error.message, stack: error.stack }
        });
      }
    }

    function showError(message) {
      document.getElementById('loading').style.display = 'none';
      document.getElementById('preview-container').style.display = 'none';

      const errorDiv = document.getElementById('error-display');
      errorDiv.style.display = 'block';
      errorDiv.textContent = message;
    }

    // Signal ready to extension
    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>
```

## Step 5: Test the MVP (10 minutes)

### 5.1 Build and Run Extension

```bash
cd packages/extension
npm run build
```

Press F5 in VS Code to launch Extension Development Host.

### 5.2 Test Basic Flow

1. Open an `.eligian` file
2. Press `Ctrl+K V` (or run "Eligian: Preview Timeline" from command palette)
3. Verify webview panel opens to the side
4. Check browser console for "Received config" log
5. Modify the `.eligian` file and save
6. Verify preview updates automatically

### 5.3 Expected Behavior

✅ **Working**:
- Command appears in palette
- Webview opens when invoked
- File watcher detects saves
- Compilation runs successfully
- Configuration sent to webview

⚠️ **Not Yet Working** (expected):
- Eligius engine initialization (placeholder script)
- Timeline playback (Eligius API not integrated)
- Media loading (resolver not implemented)
- Error display (basic version only)

## Next Steps

After completing this quickstart:

1. **Integrate Real Eligius Engine** - Replace placeholder with actual Eligius bundle
2. **Implement Media Resolver** - Add `MediaResolver.ts` to handle file URIs
3. **Improve Error Handling** - Add compilation diagnostics and better error UI
4. **Add Debouncing** - Prevent thrashing on rapid file saves
5. **Test with Real Timelines** - Use existing example files

## Troubleshooting

### Webview Not Opening
- Check if command is registered in `package.json`
- Verify extension activation events include `onLanguage:eligian`
- Look for errors in Output panel (Extension Host)

### Compilation Fails
- Ensure language package is built (`npm run build` in `packages/language`)
- Check compiler is accessible from extension
- Verify `.eligian` file syntax is valid

### Webview Communication Fails
- Check browser console in webview (Developer: Open Webview Developer Tools)
- Verify CSP allows scripts
- Look for postMessage errors

## Development Tips

- Use VS Code's "Developer: Open Webview Developer Tools" to debug webview
- Enable extension development logging in `.vscode/launch.json`
- Test with simple timeline first (RAF provider, no media)
- Keep webview HTML separate from TypeScript for easier iteration

## Time Estimates

- **MVP (Steps 1-4)**: 1-2 hours
- **Eligius Integration**: 2-3 hours
- **Media Support**: 2-3 hours
- **Polish & Testing**: 2-4 hours
- **Total**: 7-12 hours for complete feature

## Success Criteria

You've successfully completed the quickstart when:
- [ ] Command is registered and appears in palette
- [ ] Webview opens when command is invoked
- [ ] Compilation runs on file save
- [ ] Configuration JSON appears in webview console
- [ ] Panel can be closed and reopened
- [ ] Multiple files can have separate previews
