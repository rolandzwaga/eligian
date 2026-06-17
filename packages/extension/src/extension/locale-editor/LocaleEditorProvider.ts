// biome-ignore-all lint/correctness/noUnusedPrivateClassMembers: bullshit
/**
 * LocaleEditorProvider.ts - Custom editor for locale JSON files
 *
 * Purpose: Provides a webview-based GUI for editing locale files without manually editing JSON.
 * Uses VSCode's CustomTextEditorProvider for automatic save/undo/redo integration.
 *
 * Constitution Principle I: Simplicity & Documentation
 * Constitution Principle VI: Functional Programming (immutable external API)
 *
 * Feature 045: Refactored to use ILocalesConfiguration format with KeyTreeNode[] for navigation.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ILocalesConfiguration } from 'eligius';
import * as vscode from 'vscode';
import { buildKeyTree, extractLocales } from './key-tree-builder.js';
import { LocaleFileWatcher } from './LocaleFileWatcher.js';
import { searchWorkspace } from './LocaleUsageTracker.js';
import { validateLabelFileSchema } from './LocaleValidation.js';
import { parseLabels } from './locale-config-validation.js';
import { keyTreeToSerializable, parseLocalesConfiguration } from './locale-editor-utils.js';
import { handleWebviewMessage } from './locale-message-handler.js';
import type { LocaleToWebviewMessage, ToExtensionMessage, ToWebviewMessage } from './types.js';

/**
 * Custom text editor provider for locale JSON files.
 *
 * Responsibilities:
 * - Create and manage webview for locale editing
 * - Parse JSON from TextDocument into LabelGroup[]
 * - Handle bidirectional messaging with webview
 * - Update TextDocument when webview sends changes
 * - Watch for external file changes and reload webview
 *
 * Architecture:
 * - Uses CustomTextEditorProvider (NOT CustomEditorProvider) for text-based editing
 * - VSCode's TextDocument is source of truth (automatic undo/redo/save)
 * - Webview displays and edits parsed JSON structure
 * - All changes flow: Webview → Provider → TextDocument → Webview (reload)
 *
 * @example
 * const provider = new LocaleEditorProvider(context.extensionUri);
 * context.subscriptions.push(
 *   vscode.window.registerCustomEditorProvider(
 *     'eligian.localeEditor',
 *     provider,
 *     { webviewOptions: { retainContextWhenHidden: true } }
 *   )
 * );
 */
export class LocaleEditorProvider implements vscode.CustomTextEditorProvider {
  // Track which documents are currently having a webview-originated edit applied
  // (keyed by document URI). Per-document so that one document's save cannot make
  // another document ignore its external changes.
  private applyingWebviewEdits = new Set<string>();

  // Current configuration state per document (keyed by document URI)
  private documentConfigs = new Map<string, ILocalesConfiguration>();

  // Cached raw HTML template (static file, read lazily on first webview open)
  private htmlTemplate?: string;

  /**
   * Apply a webview-originated edit while flagging the document so the
   * onDidChangeTextDocument listener does not treat it as an external change.
   * The flag is always cleared — including when applyEdit rejects — so a failed
   * edit cannot permanently freeze external-change handling for the document.
   */
  private applyWebviewEdit(document: vscode.TextDocument, edit: vscode.WorkspaceEdit): void {
    const key = document.uri.toString();
    this.applyingWebviewEdits.add(key);
    vscode.workspace.applyEdit(edit).then(
      () => {
        this.applyingWebviewEdits.delete(key);
      },
      () => {
        this.applyingWebviewEdits.delete(key);
      }
    );
  }

  /**
   * Save the document, reporting failure as `false` rather than letting the
   * thenable reject unobserved.
   */
  private async trySaveDocument(document: vscode.TextDocument): Promise<boolean> {
    try {
      return await document.save();
    } catch (error) {
      console.error('Failed to save locale document:', error);
      return false;
    }
  }

  /**
   * Show a modal warning, swallowing any rejection (returns `undefined` so the
   * caller treats it as "not confirmed").
   */
  private async tryShowWarning(message: string): Promise<string | undefined> {
    try {
      return await vscode.window.showWarningMessage(message, { modal: true }, 'Delete');
    } catch (error) {
      console.error('Failed to show confirmation dialog:', error);
      return undefined;
    }
  }

  constructor(
    // Used in Phase 4 to resolve webview URIs
    private readonly extensionUri: vscode.Uri
  ) {}

  /**
   * Called when a custom editor is opened.
   *
   * @param document - The TextDocument being edited (label JSON file)
   * @param webviewPanel - The webview panel to display the editor UI
   * @param token - Cancellation token
   */
  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    // T056: Validate schema before opening custom editor
    // Support both new ILocalesConfiguration format and legacy LabelGroup[] format
    try {
      const parseResult = parseLocalesConfiguration(document.getText());

      if (!parseResult.success) {
        // Try legacy format validation as fallback
        const parsed = JSON.parse(document.getText());
        const schemaError = validateLabelFileSchema(parsed);

        if (schemaError) {
          // T057: Show error and offer to open in text editor
          const action = await vscode.window.showErrorMessage(
            `Invalid label file format: ${schemaError}`,
            'Open in Text Editor'
          );

          if (action === 'Open in Text Editor') {
            // Open with default JSON editor
            await vscode.commands.executeCommand('vscode.openWith', document.uri, 'default');
          }

          // Close the custom editor panel
          webviewPanel.dispose();
          return;
        }
      }
    } catch (error) {
      // T057: Handle JSON parse errors
      const action = await vscode.window.showErrorMessage(
        `Invalid JSON file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'Open in Text Editor'
      );

      if (action === 'Open in Text Editor') {
        await vscode.commands.executeCommand('vscode.openWith', document.uri, 'default');
      }

      webviewPanel.dispose();
      return;
    }

    // 1. Configure webview options
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, 'out', 'media'),
        vscode.Uri.joinPath(
          this.extensionUri,
          'packages',
          'extension',
          'src',
          'extension',
          'locale-editor',
          'templates'
        ),
      ],
    };

    // 2. Load HTML template
    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

    // 3. Set up message handler
    webviewPanel.webview.onDidReceiveMessage((message: ToExtensionMessage) => {
      // Fire-and-forget: the handler awaits its own I/O internally and reports
      // failures back to the webview, so a rejection here cannot go unhandled.
      void handleWebviewMessage(message, document, webviewPanel, {
        documentConfigs: this.documentConfigs,
        saveConfig: (doc, config) => this.saveConfig(doc, config),
        applyWebviewEdit: (doc, edit) => this.applyWebviewEdit(doc, edit),
        trySaveDocument: doc => this.trySaveDocument(doc),
        tryShowWarning: msg => this.tryShowWarning(msg),
        checkLabelUsage: id => this.checkLabelUsage(id),
      });
    });

    // 4. Set up TextDocument change listener (Microsoft pattern: ONLY update on EXTERNAL changes)
    const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(e => {
      if (e.document.uri.toString() === document.uri.toString()) {
        // ONLY update webview if:
        // 1. Change was NOT from this webview (external change like undo/redo/file watcher)
        // 2. AND there are actual content changes (not just state updates)
        if (
          !this.applyingWebviewEdits.has(document.uri.toString()) &&
          e.contentChanges.length > 0
        ) {
          this.updateWebview(document, webviewPanel);
        }
      }
    });

    // T059: Set up file watcher for external changes
    const fileWatcher = new LocaleFileWatcher(document.uri, async _fileUri => {
      // Re-parse JSON and update webview with new format
      const parseResult = parseLocalesConfiguration(document.getText());
      if (parseResult.success && parseResult.config) {
        const config = parseResult.config;
        this.documentConfigs.set(document.uri.toString(), config);
        const keyTree = buildKeyTree(config);
        const reloadMessage: LocaleToWebviewMessage = {
          type: 'reload',
          locales: extractLocales(config),
          keyTree: keyTreeToSerializable(keyTree),
        };
        webviewPanel.webview.postMessage(reloadMessage);
      } else {
        // Fallback to legacy format
        const labels = parseLabels(document.getText());
        const reloadMessage: ToWebviewMessage = {
          type: 'reload',
          labels,
        };
        webviewPanel.webview.postMessage(reloadMessage);
      }

      // Show info message
      vscode.window.showInformationMessage('Label file was modified externally. Reloaded.');
    });

    // 5. Register disposables for cleanup
    webviewPanel.onDidDispose(() => {
      changeDocumentSubscription.dispose();
      fileWatcher.dispose();
      // Clean up stored config
      this.documentConfigs.delete(document.uri.toString());
    });
  }

  /**
   * Save ILocalesConfiguration to document.
   */
  private saveConfig(document: vscode.TextDocument, config: ILocalesConfiguration): void {
    const json = JSON.stringify(config, null, 2);
    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), json);
    this.applyWebviewEdit(document, edit);
  }

  /**
   * Update the webview with current document state.
   *
   * @param document - The document being edited
   * @param webviewPanel - The webview panel
   */
  private updateWebview(document: vscode.TextDocument, webviewPanel: vscode.WebviewPanel): void {
    console.log('[LocaleEditorProvider] updateWebview called');

    // Try new ILocalesConfiguration format first
    const parseResult = parseLocalesConfiguration(document.getText());
    if (parseResult.success && parseResult.config) {
      const config = parseResult.config;
      this.documentConfigs.set(document.uri.toString(), config);
      const keyTree = buildKeyTree(config);
      console.log('[LocaleEditorProvider] Parsed config, keys:', keyTree.length);
      const reloadMessage: LocaleToWebviewMessage = {
        type: 'reload',
        locales: extractLocales(config),
        keyTree: keyTreeToSerializable(keyTree),
      };
      console.log('[LocaleEditorProvider] Posting reload message to webview');
      webviewPanel.webview.postMessage(reloadMessage);
    } else {
      // Fallback to legacy format
      const labels = parseLabels(document.getText());
      console.log('[LocaleEditorProvider] Parsed labels, count:', labels.length);
      const reloadMessage: ToWebviewMessage = {
        type: 'reload',
        labels,
      };
      console.log('[LocaleEditorProvider] Posting reload message to webview');
      webviewPanel.webview.postMessage(reloadMessage);
    }
    console.log('[LocaleEditorProvider] reload message posted');
  }

  /**
   * Get the HTML content for the webview.
   *
   * @param webview - The webview to load HTML into
   * @returns HTML string with interpolated URIs
   */
  private getHtmlForWebview(webview: vscode.Webview): string {
    // Load the HTML template once and cache it — the file is static, so reading
    // it synchronously on every editor open needlessly blocks the extension host.
    if (this.htmlTemplate === undefined) {
      const templatePath = path.join(
        this.extensionUri.fsPath,
        'src',
        'extension',
        'locale-editor',
        'templates',
        'locale-editor.html'
      );
      this.htmlTemplate = fs.readFileSync(templatePath, 'utf8');
    }

    let html = this.htmlTemplate;

    // Get webview script URI
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'out', 'media', 'locale-editor.js')
    );

    // Replace placeholders
    html = html.replace(/\$\{webviewUri\}/g, scriptUri.toString());
    html = html.replace(/\$\{cspSource\}/g, webview.cspSource);

    return html;
  }

  /**
   * Check if label group is used in .eligian files (T065)
   * Returns array of file paths where the label is used
   *
   * @param groupId - The label group ID to search for
   * @returns Promise resolving to array of file paths
   */
  private async checkLabelUsage(groupId: string): Promise<string[]> {
    const usageUris = await searchWorkspace(groupId);
    // Convert URIs to file paths for display in webview
    return usageUris.map(uri => uri.fsPath);
  }
}
