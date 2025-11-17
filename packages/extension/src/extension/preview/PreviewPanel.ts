/**
 * PreviewPanel.ts - Manages webview panel lifecycle
 *
 * Purpose: Encapsulates a single webview panel instance for previewing an .eligian file.
 * Handles panel creation, HTML loading, and cleanup.
 *
 * Constitution Principle I: Simplicity & Documentation
 * Constitution Principle VI: Functional Programming (immutable external API)
 */

import * as path from 'node:path';
import * as vscode from 'vscode';
import { CSSWatcherManager } from '../css-watcher.js';
import { WebviewCSSInjector } from '../webview-css-injector.js';
import { CompilationService } from './CompilationService.js';
import { EligiusEngineService } from './EligiusEngineService.js';
import { FileWatcher } from './FileWatcher.js';

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
  private panel: vscode.WebviewPanel;
  private isDisposed = false;
  private disposeCallbacks: Array<() => void> = [];

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
   * Dispose the panel manually.
   */
  public dispose(): void {
    if (!this.isDisposed) {
      this.panel.dispose();
    }
  }
}
