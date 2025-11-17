/**
 * PreviewManager.ts - Singleton manager for all preview panels
 *
 * Purpose: Centralized lifecycle management for preview panels.
 * Ensures only one preview per .eligian file to prevent resource waste.
 *
 * Constitution Principle I: Simplicity & Documentation
 * Constitution Principle VI: Functional Programming (immutable external API)
 */

import * as vscode from 'vscode';
import { PreviewPanel } from './PreviewPanel.js';

/**
 * Singleton manager that tracks and manages all open preview panels.
 *
 * Responsibilities:
 * - Ensure one preview panel per document
 * - Provide centralized panel creation and retrieval
 * - Clean up all panels on extension deactivation
 *
 * @example
 * const manager = PreviewManager.getInstance(context);
 * manager.showPreview(document.uri);
 */
export class PreviewManager {
  private panels: Map<string, PreviewPanel> = new Map();
  private context: vscode.ExtensionContext;
  private disposables: vscode.Disposable[] = [];

  /**
   * Private constructor enforces singleton pattern.
   */
  private constructor(context: vscode.ExtensionContext) {
    this.context = context;

    // Listen to active editor changes to reveal corresponding preview
    const editorChangeListener = vscode.window.onDidChangeActiveTextEditor(editor => {
      this.handleActiveEditorChange(editor);
    });
    this.disposables.push(editorChangeListener);
  }

  /**
   * Get the singleton instance of PreviewManager.
   *
   * @param context - VS Code extension context
   * @returns The singleton PreviewManager instance
   */
  public static getInstance(context: vscode.ExtensionContext): PreviewManager {
    if (!PreviewManager.instance) {
      PreviewManager.instance = new PreviewManager(context);
    }
    return PreviewManager.instance;
  }

  /**
   * Show preview for the given document URI.
   * Reuses existing panel if one exists for this document.
   *
   * @param documentUri - URI of the .eligian file to preview
   */
  public showPreview(documentUri: vscode.Uri): void {
    const key = documentUri.toString();

    // Reuse existing panel if it exists
    const existingPanel = this.panels.get(key);
    if (existingPanel) {
      existingPanel.reveal();
      return;
    }

    // Create new panel
    const panel = new PreviewPanel(documentUri, this.context.extensionUri);
    this.panels.set(key, panel);

    // Remove from map when panel is disposed
    panel.onDispose(() => {
      this.panels.delete(key);
    });
  }

  /**
   * Handle active editor changes.
   * If the active editor is an .eligian file with an open preview, reveal that preview.
   */
  private handleActiveEditorChange(editor: vscode.TextEditor | undefined): void {
    if (!editor) {
      return;
    }

    // Check if this is an .eligian file
    if (editor.document.languageId !== 'eligian') {
      return;
    }

    // Check if we have a preview for this file
    const key = editor.document.uri.toString();
    const panel = this.panels.get(key);

    if (panel) {
      console.log('[PreviewManager] Active editor changed to .eligian file, revealing preview');
      panel.reveal();
    }
  }

  /**
   * Dispose all preview panels.
   * Called on extension deactivation.
   */
  public dispose(): void {
    // Dispose all panels
    for (const panel of this.panels.values()) {
      panel.dispose();
    }
    this.panels.clear();

    // Dispose event listeners
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];

    PreviewManager.instance = null;
  }
}
