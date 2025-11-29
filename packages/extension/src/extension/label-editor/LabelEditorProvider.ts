// biome-ignore-all lint/correctness/noUnusedPrivateClassMembers: bullshit
/**
 * LabelEditorProvider.ts - Custom editor for label JSON files
 *
 * Purpose: Provides a webview-based GUI for editing label files without manually editing JSON.
 * Uses VSCode's CustomTextEditorProvider for automatic save/undo/redo integration.
 *
 * Constitution Principle I: Simplicity & Documentation
 * Constitution Principle VI: Functional Programming (immutable external API)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { consumePendingSelection } from '../label-entry-creator.js';
import { LabelFileWatcher } from './LabelFileWatcher.js';
import { searchWorkspace } from './LabelUsageTracker.js';
import {
  generateUUID,
  validateGroupId,
  validateLabelFileSchema,
  validateLabelText,
  validateLanguageCode,
  validateUUID,
} from './LabelValidation.js';
import type { LabelGroup, ToExtensionMessage, ToWebviewMessage, ValidationError } from './types.js';

/**
 * Custom text editor provider for label JSON files.
 *
 * Responsibilities:
 * - Create and manage webview for label editing
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
 * const provider = new LabelEditorProvider(context.extensionUri);
 * context.subscriptions.push(
 *   vscode.window.registerCustomEditorProvider(
 *     'eligian.labelEditor',
 *     provider,
 *     { webviewOptions: { retainContextWhenHidden: true } }
 *   )
 * );
 */
export class LabelEditorProvider implements vscode.CustomTextEditorProvider {
  // Track if we're currently applying an edit from the webview
  private isApplyingWebviewEdit = false;

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
    try {
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
          'label-editor',
          'templates'
        ),
      ],
    };

    // 2. Load HTML template
    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

    // 3. Set up message handler
    webviewPanel.webview.onDidReceiveMessage((message: ToExtensionMessage) => {
      this.handleWebviewMessage(message, document, webviewPanel);
    });

    // 4. Set up TextDocument change listener (Microsoft pattern: ONLY update on EXTERNAL changes)
    const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(e => {
      if (e.document.uri.toString() === document.uri.toString()) {
        console.log('[LabelEditorProvider] onDidChangeTextDocument fired');
        console.log('[LabelEditorProvider]   - contentChanges.length:', e.contentChanges.length);
        console.log('[LabelEditorProvider]   - isApplyingWebviewEdit:', this.isApplyingWebviewEdit);

        // ONLY update webview if:
        // 1. Change was NOT from webview (external change like undo/redo/file watcher)
        // 2. AND there are actual content changes (not just state updates)
        if (!this.isApplyingWebviewEdit && e.contentChanges.length > 0) {
          console.log('[LabelEditorProvider] External content change detected, updating webview');
          this.updateWebview(document, webviewPanel);
        } else {
          console.log('[LabelEditorProvider] Skipping reload - webview edit or no content changes');
        }
      }
    });

    // T059: Set up file watcher for external changes
    const fileWatcher = new LabelFileWatcher(document.uri, async _fileUri => {
      // Re-parse JSON and update webview
      const labels = this.parseLabels(document.getText());
      const reloadMessage: ToWebviewMessage = {
        type: 'reload',
        labels,
      };
      webviewPanel.webview.postMessage(reloadMessage);

      // Show info message
      vscode.window.showInformationMessage('Label file was modified externally. Reloaded.');
    });

    // 5. Register disposables for cleanup
    webviewPanel.onDidDispose(() => {
      changeDocumentSubscription.dispose();
      fileWatcher.dispose();
    });
  }

  /**
   * Parse JSON text into LabelGroup array.
   * Handles malformed JSON gracefully.
   * Auto-fixes missing or invalid UUIDs on translations.
   *
   * @param text - Raw JSON text from TextDocument
   * @returns Parsed label groups or empty array on error
   */
  private parseLabels(text: string): LabelGroup[] {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        const labels = parsed as LabelGroup[];

        // Auto-fix missing or invalid UUIDs (User Story 3)
        for (const group of labels) {
          if (group.labels && Array.isArray(group.labels)) {
            for (const translation of group.labels) {
              // Check if UUID is missing or invalid
              if (!translation.id || !validateUUID(translation.id)) {
                translation.id = generateUUID();
              }
            }
          }
        }

        // If we auto-fixed UUIDs, the webview will receive updated data
        // and send an 'update' message to sync the document
        return labels;
      }
      return [];
    } catch (error) {
      console.error('Failed to parse label JSON:', error);
      return [];
    }
  }

  /**
   * Handle messages from the webview.
   *
   * @param message - Message from webview (ToExtensionMessage)
   * @param document - The document being edited
   * @param webviewPanel - The webview panel
   */
  private handleWebviewMessage(
    message: ToExtensionMessage,
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel
  ): void {
    switch (message.type) {
      case 'ready':
        // Parse document and send initialize message
        {
          const labels = this.parseLabels(document.getText());
          // Check for pending label selection (Feature 041 - auto-select newly created labels)
          const selectedLabelId = consumePendingSelection(document.uri.toString());
          const initMessage: ToWebviewMessage = {
            type: 'initialize',
            labels,
            filePath: document.uri.fsPath,
            selectedLabelId,
          };
          webviewPanel.webview.postMessage(initMessage);
        }
        break;

      case 'update':
        // Update document (DON'T trigger webview reload - Microsoft pattern)
        {
          console.log('[LabelEditorProvider] Received update message from webview');
          const json = JSON.stringify(message.labels, null, 2);
          const edit = new vscode.WorkspaceEdit();
          edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), json);

          console.log('[LabelEditorProvider] Applying workspace edit (flagged as webview edit)');
          this.isApplyingWebviewEdit = true;
          vscode.workspace.applyEdit(edit).then(() => {
            this.isApplyingWebviewEdit = false;
            console.log('[LabelEditorProvider] Workspace edit complete');
          });
        }
        break;

      case 'request-save':
        // Validate and save (document is already up-to-date from 'update' messages)
        {
          const errors = this.validateLabels(message.labels);
          console.log('[LabelEditorProvider] Validation errors:', errors.length);
          if (errors.length > 0) {
            console.log(
              '[LabelEditorProvider] VALIDATION ERRORS:',
              JSON.stringify(errors, null, 2)
            );
            const errorMessage: ToWebviewMessage = {
              type: 'validation-error',
              errors,
            };
            webviewPanel.webview.postMessage(errorMessage);
          } else {
            // Document is already up-to-date, just save
            console.log('[LabelEditorProvider] No errors, saving document');
            document.save().then(success => {
              console.log('[LabelEditorProvider] Save complete');
              const saveMessage: ToWebviewMessage = {
                type: 'save-complete',
                success,
              };
              webviewPanel.webview.postMessage(saveMessage);
            });
          }
        }
        break;

      case 'validate':
        // Run validation and send errors
        {
          const errors = this.validateLabels(message.labels);
          const errorMessage: ToWebviewMessage = {
            type: 'validation-error',
            errors,
          };
          webviewPanel.webview.postMessage(errorMessage);
        }
        break;

      case 'check-usage':
        // Query label usage in .eligian files
        {
          this.checkLabelUsage(message.groupId).then(usageFiles => {
            const usageMessage: ToWebviewMessage = {
              type: 'usage-check-response',
              groupId: message.groupId,
              usageFiles,
            };
            webviewPanel.webview.postMessage(usageMessage);
          });
        }
        break;

      case 'request-delete':
        // Show VS Code native confirmation dialog
        {
          let confirmMessage = `Delete label group '${message.groupId}'?`;
          if (message.usageFiles.length > 0) {
            confirmMessage = `Label '${message.groupId}' is used in ${message.usageFiles.length} file(s):\n${message.usageFiles.join('\n')}\n\nDelete anyway?`;
          }

          vscode.window
            .showWarningMessage(confirmMessage, { modal: true }, 'Delete')
            .then(choice => {
              if (choice === 'Delete') {
                const confirmMessage: ToWebviewMessage = {
                  type: 'delete-confirmed',
                  index: message.index,
                };
                webviewPanel.webview.postMessage(confirmMessage);
              }
            });
        }
        break;
    }
  }

  /**
   * Update the webview with current document state.
   *
   * @param document - The document being edited
   * @param webviewPanel - The webview panel
   */
  private updateWebview(document: vscode.TextDocument, webviewPanel: vscode.WebviewPanel): void {
    console.log('[LabelEditorProvider] updateWebview called');
    const labels = this.parseLabels(document.getText());
    console.log('[LabelEditorProvider] Parsed labels, count:', labels.length);
    const reloadMessage: ToWebviewMessage = {
      type: 'reload',
      labels,
    };
    console.log('[LabelEditorProvider] Posting reload message to webview');
    webviewPanel.webview.postMessage(reloadMessage);
    console.log('[LabelEditorProvider] reload message posted');
  }

  /**
   * Get the HTML content for the webview.
   *
   * @param webview - The webview to load HTML into
   * @returns HTML string with interpolated URIs
   */
  private getHtmlForWebview(webview: vscode.Webview): string {
    // Load HTML template
    const templatePath = path.join(
      this.extensionUri.fsPath,
      'src',
      'extension',
      'label-editor',
      'templates',
      'label-editor.html'
    );

    let html = fs.readFileSync(templatePath, 'utf8');

    // Get webview script URI
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'out', 'media', 'label-editor.js')
    );

    // Replace placeholders
    html = html.replace(/\$\{webviewUri\}/g, scriptUri.toString());
    html = html.replace(/\$\{cspSource\}/g, webview.cspSource);

    return html;
  }

  /**
   * Validate labels array
   */
  private validateLabels(labels: LabelGroup[]): ValidationError[] {
    const errors: ValidationError[] = [];
    const groupIds = labels.map(g => g.id);

    for (const group of labels) {
      // Validate group ID (pass current group ID to exclude from duplicate check)
      const groupIdError = validateGroupId(group.id, groupIds, group.id);
      if (groupIdError) {
        errors.push({ ...groupIdError, groupId: group.id });
      }

      // Validate translations
      for (const translation of group.labels) {
        const langError = validateLanguageCode(translation.languageCode);
        if (langError) {
          errors.push({
            ...langError,
            groupId: group.id,
            translationId: translation.id,
          });
        }

        const labelError = validateLabelText(translation.label);
        if (labelError) {
          errors.push({
            ...labelError,
            groupId: group.id,
            translationId: translation.id,
          });
        }
      }
    }

    return errors;
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
