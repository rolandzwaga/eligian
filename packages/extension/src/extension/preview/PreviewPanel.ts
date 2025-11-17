// biome-ignore-all lint/correctness/noUnusedPrivateClassMembers: bullshit
/**
 * PreviewPanel.ts - Manages webview panel lifecycle
 *
 * Purpose: Encapsulates a single webview panel instance for previewing an .eligian file.
 * Handles panel creation, HTML loading, and cleanup.
 *
 * Constitution Principle I: Simplicity & Documentation
 * Constitution Principle VI: Functional Programming (immutable external API)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { extractCSSFiles } from '../css-loader.js';
import { CSSWatcherManager } from '../css-watcher.js';
import { WebviewCSSInjector } from '../webview-css-injector.js';
import { CompilationService } from './CompilationService.js';
import { EligiusEngineService, type EngineEvent } from './EligiusEngineService.js';
import { FileWatcher } from './FileWatcher.js';
import { MediaResolver } from './MediaResolver.js';

/**
 * Manages the lifecycle of a single preview webview panel.
 *
 * Responsibilities:
 * - Create and configure webview panel
 * - Load HTML template into webview
 * - Handle panel disposal and cleanup
 * - Notify listeners when panel is disposed
 *
 * @example
 * const panel = new PreviewPanel(documentUri, extensionUri);
 * panel.onDispose(() => console.log('Panel closed'));
 */
export class PreviewPanel {
  private static diagnostics: vscode.DiagnosticCollection | null = null;

  private panel: vscode.WebviewPanel;
  private documentUri: vscode.Uri;
  private extensionUri: vscode.Uri;
  private isDisposed = false;
  private disposables: vscode.Disposable[] = [];
  private disposeCallbacks: Array<() => void> = [];
  private compilationService: CompilationService;
  private fileWatcher: FileWatcher;
  private engineService: EligiusEngineService;
  private cssInjector: WebviewCSSInjector;
  private cssWatcher: CSSWatcherManager;
  private workspaceRoot: string;

  /**
   * Initialize the static diagnostics collection (called once per extension activation).
   */
  public static initializeDiagnostics(): vscode.DiagnosticCollection {
    if (!PreviewPanel.diagnostics) {
      PreviewPanel.diagnostics = vscode.languages.createDiagnosticCollection('eligian-preview');
    }
    return PreviewPanel.diagnostics;
  }

  /**
   * Dispose the static diagnostics collection (called on extension deactivation).
   */
  public static disposeDiagnostics(): void {
    if (PreviewPanel.diagnostics) {
      PreviewPanel.diagnostics.dispose();
      PreviewPanel.diagnostics = null;
    }
  }

  /**
   * Create a new preview panel.
   *
   * @param documentUri - URI of the .eligian file being previewed
   * @param extensionUri - URI of the extension root (for loading resources)
   */
  constructor(documentUri: vscode.Uri, extensionUri: vscode.Uri) {
    this.documentUri = documentUri;
    this.extensionUri = extensionUri;
    this.compilationService = new CompilationService();

    // Create webview panel
    this.panel = this.createWebviewPanel();

    // Set initial HTML
    this.panel.webview.html = this.getHtmlForWebview();

    // Handle panel disposal
    this.panel.onDidDispose(() => this.handleDispose(), null, this.disposables);

    // Handle messages from webview
    this.panel.webview.onDidReceiveMessage(
      message => this.handleWebviewMessage(message),
      null,
      this.disposables
    );

    // Set up Eligius engine service
    this.engineService = new EligiusEngineService(this.panel.webview);
    this.engineService.onEvent(event => this.handleEngineEvent(event));

    // Set up CSS injector for hot-reload (Feature 011)
    this.workspaceRoot =
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || path.dirname(documentUri.fsPath);
    this.cssInjector = new WebviewCSSInjector(this.panel.webview, this.workspaceRoot);

    // Set up CSS watcher for hot-reload (Feature 011 - User Story 2)
    this.cssWatcher = new CSSWatcherManager(filePath => this.handleCSSFileChange(filePath));

    // Set up file watching for auto-recompilation
    this.fileWatcher = new FileWatcher();
    this.fileWatcher.watch(this.documentUri, () => this.compileAndUpdate());

    // Trigger initial compilation
    this.compileAndUpdate();
  }

  /**
   * Create and configure the webview panel.
   */
  private createWebviewPanel(): vscode.WebviewPanel {
    const filename = path.basename(this.documentUri.fsPath);

    return vscode.window.createWebviewPanel(
      'eligianPreview', // ViewType
      `Preview: ${filename}`, // Title
      vscode.ViewColumn.Beside, // Show beside editor
      {
        enableScripts: true, // Allow JavaScript
        retainContextWhenHidden: true, // Keep state when hidden
        localResourceRoots: [
          this.extensionUri,
          // Add workspace folders for media access
          ...(vscode.workspace.workspaceFolders?.map(f => f.uri) || []),
        ],
      }
    );
  }

  /**
   * Get HTML content for the webview.
   * Loads template from templates/preview.html and replaces placeholders.
   */
  private getHtmlForWebview(): string {
    const templatePath = path.join(
      this.extensionUri.fsPath,
      'src',
      'extension',
      'preview',
      'templates',
      'preview.html'
    );

    // Read template file
    let html = fs.readFileSync(templatePath, 'utf-8');

    // Replace CSP source placeholder
    const cspSource = this.panel.webview.cspSource;
    html = html.replace(/\$\{cspSource\}/g, cspSource);

    // Replace extension URI placeholder (for future resource loading)
    const extensionUri = this.panel.webview.asWebviewUri(this.extensionUri).toString();
    html = html.replace(/\$\{extensionUri\}/g, extensionUri);

    // Generate script URI for bundled webview script (in out/media after build)
    const scriptPath = vscode.Uri.joinPath(this.extensionUri, 'out', 'media', 'preview.js');
    const scriptUri = this.panel.webview.asWebviewUri(scriptPath).toString();
    html = html.replace(/\$\{scriptUri\}/g, scriptUri);

    return html;
  }

  /**
   * Reveal the panel (bring to front).
   */
  public reveal(): void {
    this.panel.reveal();
  }

  /**
   * Register a callback to be invoked when the panel is disposed.
   *
   * @param callback - Function to call on disposal
   */
  public onDispose(callback: () => void): void {
    this.disposeCallbacks.push(callback);
  }

  /**
   * Handle panel disposal.
   */
  private handleDispose(): void {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;

    // Destroy Eligius engine
    this.engineService.destroy();

    // Stop watching file
    this.fileWatcher.dispose();

    // Stop watching CSS files (Feature 011 - US2)
    this.cssWatcher.dispose();

    // Notify listeners
    for (const callback of this.disposeCallbacks) {
      callback();
    }

    // Clean up disposables
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }

  /**
   * Dispose the panel manually.
   */
  public dispose(): void {
    if (!this.isDisposed) {
      this.panel.dispose();
    }
  }

  /**
   * Compile the document and update the preview.
   */
  private async compileAndUpdate(): Promise<void> {
    console.log('[Preview] Starting compilation for:', this.documentUri.fsPath);

    try {
      // Show loading state
      console.log('[Preview] Sending showLoading message');
      await this.panel.webview.postMessage({ type: 'showLoading' });

      // Compile the document
      console.log('[Preview] Calling compilation service...');
      const result = await this.compilationService.compile(this.documentUri);
      console.log('[Preview] Compilation result:', {
        success: result.success,
        errorCount: result.errors.length,
      });

      if (result.success && result.config) {
        // Resolve media paths to webview URIs
        console.log('[Preview] Resolving media paths...');
        const mediaResolver = new MediaResolver(this.panel.webview, this.documentUri);
        const resolvedConfig = mediaResolver.resolveMediaPaths(result.config);

        // Check for missing media files
        const missingFiles = mediaResolver.getMissingFiles();
        if (missingFiles.length > 0) {
          console.warn('[Preview] Missing media files:', missingFiles);
          vscode.window.showWarningMessage(
            `Preview: ${missingFiles.length} media file(s) not found: ${missingFiles.join(', ')}`
          );
        }

        // Send successful compilation result to webview
        console.log('[Preview] Sending updateConfig message with resolved config');
        await this.panel.webview.postMessage({
          type: 'updateConfig',
          payload: {
            config: resolvedConfig,
          },
        });

        // Clear diagnostics on successful compilation
        if (PreviewPanel.diagnostics) {
          PreviewPanel.diagnostics.set(this.documentUri, []);
        }

        // Initialize Eligius engine with the compiled config
        console.log('[Preview] Initializing Eligius engine');
        await this.engineService.initialize(resolvedConfig);

        // Inject CSS files into preview (Feature 011 - US1)
        const cssFiles = extractCSSFiles(resolvedConfig);
        if (cssFiles.length > 0) {
          // Convert relative paths to absolute paths
          // CSS file paths are relative to the .eligian file's directory, not workspace root
          const sourceFileDir = path.dirname(this.documentUri.fsPath);
          const absoluteCSSFiles = cssFiles.map(file =>
            path.isAbsolute(file) ? file : path.resolve(sourceFileDir, file)
          );

          console.log(`[Preview] Injecting ${cssFiles.length} CSS file(s):`, absoluteCSSFiles);
          await this.cssInjector.injectCSS(absoluteCSSFiles);

          // Start watching CSS files for hot-reload (Feature 011 - US2)
          this.cssWatcher.startWatching(absoluteCSSFiles, this.workspaceRoot);
        }

        console.log(`[Preview] ✓ Successfully compiled ${path.basename(this.documentUri.fsPath)}`);
      } else {
        // Add diagnostics to Problems panel
        if (PreviewPanel.diagnostics) {
          const vsDiagnostics = result.errors.map(error => {
            const line = (error.line || 1) - 1; // VS Code uses 0-based line numbers
            const column = (error.column || 1) - 1; // VS Code uses 0-based column numbers
            const length = error.length || 1;

            const range = new vscode.Range(line, column, line, column + length);

            const diagnostic = new vscode.Diagnostic(
              range,
              error.message,
              error.severity === 'warning'
                ? vscode.DiagnosticSeverity.Warning
                : vscode.DiagnosticSeverity.Error
            );

            if (error.code) {
              diagnostic.code = error.code;
            }
            diagnostic.source = 'Eligian Preview';

            return diagnostic;
          });

          PreviewPanel.diagnostics.set(this.documentUri, vsDiagnostics);
        }

        // Send errors to webview
        console.log('[Preview] Sending showError message with errors:', result.errors);
        await this.panel.webview.postMessage({
          type: 'showError',
          payload: {
            errors: result.errors,
            sourceFile: path.basename(this.documentUri.fsPath),
          },
        });

        console.error(
          `[Preview] ✗ Compilation failed for ${path.basename(this.documentUri.fsPath)}:`,
          result.errors
        );
      }
    } catch (error) {
      // Handle unexpected errors
      console.error('[Preview] ✗ Unexpected compilation error:', error);
      console.error('[Preview] Error stack:', error instanceof Error ? error.stack : 'No stack');

      await this.panel.webview.postMessage({
        type: 'showError',
        payload: {
          errors: [
            {
              message: error instanceof Error ? error.message : String(error),
              severity: 'error',
            },
          ],
          sourceFile: path.basename(this.documentUri.fsPath),
        },
      });
    }
  }

  /**
   * Handle messages received from the webview.
   */
  private handleWebviewMessage(message: any): void {
    switch (message.type) {
      case 'ready':
        console.log('[Preview] Webview ready');
        break;

      case 'retry':
        // User clicked retry button - recompile
        console.log('[Preview] Retry requested by user');
        this.compileAndUpdate();
        break;

      case 'runtimeError':
        // Runtime error from Eligius engine
        console.error('[Preview] Runtime error from Eligius:', message.payload.message);
        vscode.window.showErrorMessage(`Eligian Preview Runtime Error: ${message.payload.message}`);
        break;

      // Route engine events to engine service
      case 'initialized':
      case 'error':
      case 'playbackStarted':
      case 'playbackPaused':
      case 'playbackStopped':
      case 'destroyed':
        this.engineService.handleEvent(message as EngineEvent);
        break;

      default:
        console.log('[Preview] Unknown message type:', message.type);
    }
  }

  /**
   * Handle engine events from the webview.
   */
  private handleEngineEvent(event: EngineEvent): void {
    console.log('[Preview] Engine event received:', event.type);

    // Log engine state changes for debugging
    switch (event.type) {
      case 'initialized':
        if (event.payload.success) {
          console.log('[Preview] ✓ Eligius engine initialized successfully');
        } else {
          console.error('[Preview] ✗ Eligius engine initialization failed');
        }
        break;

      case 'error':
        console.error('[Preview] ✗ Engine error:', event.payload.message);
        // Show error notification to user
        vscode.window.showErrorMessage(`Eligian Preview: ${event.payload.message}`);
        break;

      case 'playbackStarted':
        console.log('[Preview] ▶ Playback started');
        break;

      case 'playbackPaused':
        console.log('[Preview] ⏸ Playback paused');
        break;

      case 'playbackStopped':
        console.log('[Preview] ⏹ Playback stopped');
        break;

      case 'destroyed':
        console.log('[Preview] Engine destroyed');
        break;
    }
  }

  /**
   * Handle CSS file change events from the watcher (hot-reload)
   */
  private async handleCSSFileChange(filePath: string): Promise<void> {
    console.log('[Preview] CSS file changed, reloading:', filePath);

    try {
      await this.cssInjector.reloadCSS(filePath);
      console.log('[Preview] ✓ CSS hot-reloaded successfully');
    } catch (error) {
      console.error('[Preview] ✗ CSS hot-reload failed:', error);
    }
  }
}
