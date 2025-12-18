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
import { consumePendingSelection } from '../label-entry-creator.js';
import { buildKeyTree, extractLocales } from './key-tree-builder.js';
import { LocaleFileWatcher } from './LocaleFileWatcher.js';
import { searchWorkspace } from './LocaleUsageTracker.js';
import {
  generateUUID,
  validateGroupId,
  validateLabelFileSchema,
  validateLabelText,
  validateLanguageCode,
  validateUUID,
} from './LocaleValidation.js';
import {
  addKeyToConfig,
  deleteKeyFromConfig,
  keyTreeToSerializable,
  parseLocalesConfiguration,
  renameKeyInConfig,
  updateTranslationInConfig,
} from './locale-editor-utils.js';
import type {
  LabelGroup,
  LocaleToExtensionMessage,
  LocaleToWebviewMessage,
  LocaleValidationError,
  ToExtensionMessage,
  ToWebviewMessage,
  ValidationError,
} from './types.js';

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
  // Track if we're currently applying an edit from the webview
  private isApplyingWebviewEdit = false;

  // Current configuration state per document (keyed by document URI)
  private documentConfigs = new Map<string, ILocalesConfiguration>();

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
      this.handleWebviewMessage(message, document, webviewPanel);
    });

    // 4. Set up TextDocument change listener (Microsoft pattern: ONLY update on EXTERNAL changes)
    const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(e => {
      if (e.document.uri.toString() === document.uri.toString()) {
        console.log('[LocaleEditorProvider] onDidChangeTextDocument fired');
        console.log('[LocaleEditorProvider]   - contentChanges.length:', e.contentChanges.length);
        console.log(
          '[LocaleEditorProvider]   - isApplyingWebviewEdit:',
          this.isApplyingWebviewEdit
        );

        // ONLY update webview if:
        // 1. Change was NOT from webview (external change like undo/redo/file watcher)
        // 2. AND there are actual content changes (not just state updates)
        if (!this.isApplyingWebviewEdit && e.contentChanges.length > 0) {
          console.log('[LocaleEditorProvider] External content change detected, updating webview');
          this.updateWebview(document, webviewPanel);
        } else {
          console.log(
            '[LocaleEditorProvider] Skipping reload - webview edit or no content changes'
          );
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
        const labels = this.parseLabels(document.getText());
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
   * Supports both new LocaleToExtensionMessage and legacy ToExtensionMessage formats.
   *
   * @param message - Message from webview
   * @param document - The document being edited
   * @param webviewPanel - The webview panel
   */
  private handleWebviewMessage(
    message: LocaleToExtensionMessage | ToExtensionMessage,
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel
  ): void {
    switch (message.type) {
      case 'ready':
        // Parse document and send initialize message
        // Try new ILocalesConfiguration format first
        {
          const parseResult = parseLocalesConfiguration(document.getText());
          if (parseResult.success && parseResult.config) {
            const config = parseResult.config;
            this.documentConfigs.set(document.uri.toString(), config);
            const keyTree = buildKeyTree(config);
            // Check for pending key selection (Feature 041 - auto-select newly created keys)
            const selectedKey = consumePendingSelection(document.uri.toString());
            const initMessage: LocaleToWebviewMessage = {
              type: 'initialize',
              locales: extractLocales(config),
              keyTree: keyTreeToSerializable(keyTree),
              filePath: document.uri.fsPath,
              selectedKey,
            };
            webviewPanel.webview.postMessage(initMessage);
          } else {
            // Fallback to legacy format
            const labels = this.parseLabels(document.getText());
            const selectedLabelId = consumePendingSelection(document.uri.toString());
            const initMessage: ToWebviewMessage = {
              type: 'initialize',
              labels,
              filePath: document.uri.fsPath,
              selectedLabelId,
            };
            webviewPanel.webview.postMessage(initMessage);
          }
        }
        break;

      // New ILocalesConfiguration message handlers (T040-T043)
      case 'update-translation':
        // Update a single translation value
        {
          const config = this.documentConfigs.get(document.uri.toString());
          if (config) {
            const updated = updateTranslationInConfig(
              config,
              message.key,
              message.locale,
              message.value
            );
            this.documentConfigs.set(document.uri.toString(), updated);
            this.saveConfig(document, updated);
          }
        }
        break;

      case 'add-key':
        // Add a new translation key
        {
          const config = this.documentConfigs.get(document.uri.toString());
          if (config) {
            const fullKey = message.parentKey
              ? `${message.parentKey}.${message.newSegment}`
              : message.newSegment;
            const updated = addKeyToConfig(config, fullKey);
            this.documentConfigs.set(document.uri.toString(), updated);
            this.saveConfig(document, updated);
          }
        }
        break;

      case 'delete-key':
        // Delete a translation key
        {
          const config = this.documentConfigs.get(document.uri.toString());
          if (config) {
            const updated = deleteKeyFromConfig(config, message.key);
            this.documentConfigs.set(document.uri.toString(), updated);
            this.saveConfig(document, updated);
          }
        }
        break;

      case 'rename-key':
        // Rename a translation key
        {
          const config = this.documentConfigs.get(document.uri.toString());
          if (config) {
            const updated = renameKeyInConfig(config, message.oldKey, message.newKey);
            this.documentConfigs.set(document.uri.toString(), updated);
            this.saveConfig(document, updated);
          }
        }
        break;

      case 'add-locale':
        // Add a new locale to the configuration
        {
          const config = this.documentConfigs.get(document.uri.toString());
          if (config) {
            // Add empty locale entry
            const updated: ILocalesConfiguration = {
              ...config,
              [message.locale]: {},
            };
            this.documentConfigs.set(document.uri.toString(), updated);
            this.saveConfig(document, updated);
          }
        }
        break;

      // Legacy message handlers (for backward compatibility)
      case 'update':
        // Update document (DON'T trigger webview reload - Microsoft pattern)
        {
          console.log('[LocaleEditorProvider] Received update message from webview');
          const legacyMessage = message as ToExtensionMessage & { type: 'update' };
          const json = JSON.stringify(legacyMessage.labels, null, 2);
          const edit = new vscode.WorkspaceEdit();
          edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), json);

          console.log('[LocaleEditorProvider] Applying workspace edit (flagged as webview edit)');
          this.isApplyingWebviewEdit = true;
          vscode.workspace.applyEdit(edit).then(() => {
            this.isApplyingWebviewEdit = false;
            console.log('[LocaleEditorProvider] Workspace edit complete');
          });
        }
        break;

      case 'request-save':
        // Validate and save
        {
          // For new format, document is already up-to-date
          const config = this.documentConfigs.get(document.uri.toString());
          if (config) {
            // New format: validate config and save
            const errors = this.validateLocaleConfig(config);
            if (errors.length > 0) {
              const errorMessage: LocaleToWebviewMessage = {
                type: 'validation-error',
                errors,
              };
              webviewPanel.webview.postMessage(errorMessage);
            } else {
              document.save().then(success => {
                const saveMessage: LocaleToWebviewMessage = {
                  type: 'save-complete',
                  success,
                };
                webviewPanel.webview.postMessage(saveMessage);
              });
            }
          } else {
            // Legacy format
            const legacyMessage = message as ToExtensionMessage & { type: 'request-save' };
            const errors = this.validateLabels(legacyMessage.labels);
            if (errors.length > 0) {
              const errorMessage: ToWebviewMessage = {
                type: 'validation-error',
                errors,
              };
              webviewPanel.webview.postMessage(errorMessage);
            } else {
              document.save().then(success => {
                const saveMessage: ToWebviewMessage = {
                  type: 'save-complete',
                  success,
                };
                webviewPanel.webview.postMessage(saveMessage);
              });
            }
          }
        }
        break;

      case 'validate':
        // Run validation and send errors (legacy only)
        {
          const legacyMessage = message as ToExtensionMessage & { type: 'validate' };
          const errors = this.validateLabels(legacyMessage.labels);
          const errorMessage: ToWebviewMessage = {
            type: 'validation-error',
            errors,
          };
          webviewPanel.webview.postMessage(errorMessage);
        }
        break;

      case 'check-usage':
        // Query label/key usage in .eligian files
        {
          const key = 'key' in message ? message.key : (message as any).groupId;
          this.checkLabelUsage(key).then(usageFiles => {
            if ('key' in message) {
              // New format
              const usageMessage: LocaleToWebviewMessage = {
                type: 'usage-check-response',
                key: message.key,
                usageFiles,
              };
              webviewPanel.webview.postMessage(usageMessage);
            } else {
              // Legacy format
              const usageMessage: ToWebviewMessage = {
                type: 'usage-check-response',
                groupId: (message as any).groupId,
                usageFiles,
              };
              webviewPanel.webview.postMessage(usageMessage);
            }
          });
        }
        break;

      case 'request-delete':
        // Show VS Code native confirmation dialog
        {
          if ('key' in message) {
            // New format
            let confirmMsg = `Delete translation key '${message.key}'?`;
            if (message.usageFiles.length > 0) {
              confirmMsg = `Key '${message.key}' is used in ${message.usageFiles.length} file(s):\n${message.usageFiles.join('\n')}\n\nDelete anyway?`;
            }

            vscode.window.showWarningMessage(confirmMsg, { modal: true }, 'Delete').then(choice => {
              if (choice === 'Delete') {
                const confirmMessage: LocaleToWebviewMessage = {
                  type: 'delete-confirmed',
                  key: message.key,
                };
                webviewPanel.webview.postMessage(confirmMessage);
              }
            });
          } else {
            // Legacy format
            const legacyMessage = message as ToExtensionMessage & { type: 'request-delete' };
            let confirmMsg = `Delete label group '${legacyMessage.groupId}'?`;
            if (legacyMessage.usageFiles.length > 0) {
              confirmMsg = `Label '${legacyMessage.groupId}' is used in ${legacyMessage.usageFiles.length} file(s):\n${legacyMessage.usageFiles.join('\n')}\n\nDelete anyway?`;
            }

            vscode.window.showWarningMessage(confirmMsg, { modal: true }, 'Delete').then(choice => {
              if (choice === 'Delete') {
                const confirmMessage: ToWebviewMessage = {
                  type: 'delete-confirmed',
                  index: legacyMessage.index,
                };
                webviewPanel.webview.postMessage(confirmMessage);
              }
            });
          }
        }
        break;
    }
  }

  /**
   * Save ILocalesConfiguration to document.
   */
  private saveConfig(document: vscode.TextDocument, config: ILocalesConfiguration): void {
    const json = JSON.stringify(config, null, 2);
    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), json);

    this.isApplyingWebviewEdit = true;
    vscode.workspace.applyEdit(edit).then(() => {
      this.isApplyingWebviewEdit = false;
    });
  }

  /**
   * Validate ILocalesConfiguration.
   */
  private validateLocaleConfig(config: ILocalesConfiguration): LocaleValidationError[] {
    const errors: LocaleValidationError[] = [];

    for (const [locale, data] of Object.entries(config)) {
      // Validate locale code format
      const langError = validateLanguageCode(locale);
      if (langError) {
        errors.push({
          locale,
          field: 'locale',
          message: langError.message,
          code: langError.code,
        });
      }

      // Validate translation values recursively
      this.validateLocaleData(data, locale, '', errors);
    }

    return errors;
  }

  /**
   * Recursively validate locale data.
   */
  private validateLocaleData(
    data: unknown,
    locale: string,
    keyPath: string,
    errors: LocaleValidationError[]
  ): void {
    if (typeof data === 'object' && data !== null && !('$ref' in data)) {
      for (const [key, value] of Object.entries(data)) {
        const fullKey = keyPath ? `${keyPath}.${key}` : key;

        if (typeof value === 'string') {
          const labelError = validateLabelText(value);
          if (labelError) {
            errors.push({
              key: fullKey,
              locale,
              field: 'label',
              message: labelError.message,
              code: labelError.code,
            });
          }
        } else if (typeof value === 'object' && value !== null) {
          this.validateLocaleData(value, locale, fullKey, errors);
        }
      }
    }
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
      const labels = this.parseLabels(document.getText());
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
    // Load HTML template
    const templatePath = path.join(
      this.extensionUri.fsPath,
      'src',
      'extension',
      'locale-editor',
      'templates',
      'locale-editor.html'
    );

    let html = fs.readFileSync(templatePath, 'utf8');

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
