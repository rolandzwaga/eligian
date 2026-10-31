/**
 * Webview message handling for {@link LocaleEditorProvider}.
 *
 * The provider's `handleWebviewMessage` switch (both the ILocalesConfiguration
 * and legacy LabelGroup[] protocols) was extracted here verbatim (W3
 * decomposition). Instance-coupled operations (config cache, save/edit, save &
 * warning helpers, usage lookup) are passed via {@link LocaleMessageDeps}; the
 * pure parse/validate helpers are imported directly.
 */

import type { ILocalesConfiguration } from 'eligius';
import * as vscode from 'vscode';
import { consumePendingSelection } from '../label-entry-creator.js';
import { buildKeyTree, extractLocales } from './key-tree-builder.js';
import { parseLabels, validateLabels, validateLocaleConfig } from './locale-config-validation.js';
import {
  addKeyToConfig,
  deleteKeyFromConfig,
  findKeyConflict,
  findUnsafeKeySegment,
  keyTreeToSerializable,
  parseLocalesConfiguration,
  renameKeyInConfig,
  updateTranslationInConfig,
} from './locale-editor-utils.js';
import type {
  LocaleToExtensionMessage,
  LocaleToWebviewMessage,
  ToExtensionMessage,
  ToWebviewMessage,
} from './types.js';

/**
 * Warn the user (and report true) when `key` cannot be created because an existing
 * translation sits on its path. The edit is then skipped so nothing is lost.
 */
function warnOnKeyConflict(config: ILocalesConfiguration, key: string, locale?: string): boolean {
  const unsafe = findUnsafeKeySegment(key);
  if (unsafe !== undefined) {
    vscode.window.showWarningMessage(`Cannot use key '${key}': '${unsafe}' is a reserved name.`);
    return true;
  }
  const blocker = findKeyConflict(config, key, locale);
  if (blocker === undefined) return false;
  vscode.window.showWarningMessage(
    `Cannot use key '${key}': '${blocker}' is already a translation, not a group.`
  );
  return true;
}

/**
 * Get the cached configuration for a document, or warn that edits are refused.
 * The cache is dropped whenever the document stops parsing as a locale
 * configuration, so a missing entry means the JSON is currently invalid; editing
 * then would overwrite the user's text with stale state.
 */
function requireConfig(
  document: vscode.TextDocument,
  deps: LocaleMessageDeps
): ILocalesConfiguration | undefined {
  const config = deps.documentConfigs.get(document.uri.toString());
  if (!config) {
    vscode.window.showWarningMessage(
      'The locale file currently contains invalid JSON. Fix it in the text editor before editing here.'
    );
  }
  return config;
}

/**
 * Instance-coupled operations the message handler needs from the provider.
 */
export interface LocaleMessageDeps {
  /** Current configuration state per document (keyed by document URI). */
  readonly documentConfigs: Map<string, ILocalesConfiguration>;
  /** Persist an ILocalesConfiguration back to the document. */
  saveConfig(document: vscode.TextDocument, config: ILocalesConfiguration): void;
  /** Apply a webview-originated edit while suppressing external-change handling. */
  applyWebviewEdit(document: vscode.TextDocument, edit: vscode.WorkspaceEdit): void;
  /** Save the document, reporting failure as `false`. */
  trySaveDocument(document: vscode.TextDocument): Promise<boolean>;
  /** Show a modal delete-confirmation warning, swallowing rejections. */
  tryShowWarning(message: string): Promise<string | undefined>;
  /** Find `.eligian` files using a label/key id. */
  checkLabelUsage(id: string): Promise<string[]>;
}

/**
 * Handle messages from the webview.
 * Supports both new LocaleToExtensionMessage and legacy ToExtensionMessage formats.
 *
 * @param message - Message from webview
 * @param document - The document being edited
 * @param webviewPanel - The webview panel
 * @param deps - Instance-coupled provider operations
 */
export async function handleWebviewMessage(
  message: LocaleToExtensionMessage | ToExtensionMessage,
  document: vscode.TextDocument,
  webviewPanel: vscode.WebviewPanel,
  deps: LocaleMessageDeps
): Promise<void> {
  switch (message.type) {
    case 'ready':
      // Parse document and send initialize message
      // Try new ILocalesConfiguration format first
      {
        const parseResult = parseLocalesConfiguration(document.getText());
        if (parseResult.success && parseResult.config) {
          const config = parseResult.config;
          deps.documentConfigs.set(document.uri.toString(), config);
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
          // Never keep a config from an earlier, valid state of the document
          deps.documentConfigs.delete(document.uri.toString());
          // Fallback to legacy format
          const labels = parseLabels(document.getText());
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
        const config = requireConfig(document, deps);
        if (config) {
          if (warnOnKeyConflict(config, message.key, message.locale)) break;
          const updated = updateTranslationInConfig(
            config,
            message.key,
            message.locale,
            message.value
          );
          deps.documentConfigs.set(document.uri.toString(), updated);
          deps.saveConfig(document, updated);
        }
      }
      break;

    case 'add-key':
      // Add a new translation key
      {
        const config = requireConfig(document, deps);
        if (config) {
          const fullKey = message.parentKey
            ? `${message.parentKey}.${message.newSegment}`
            : message.newSegment;
          if (warnOnKeyConflict(config, fullKey)) break;
          const updated = addKeyToConfig(config, fullKey);
          deps.documentConfigs.set(document.uri.toString(), updated);
          deps.saveConfig(document, updated);
        }
      }
      break;

    case 'delete-key':
      // Delete a translation key
      {
        const config = requireConfig(document, deps);
        if (config) {
          const updated = deleteKeyFromConfig(config, message.key);
          deps.documentConfigs.set(document.uri.toString(), updated);
          deps.saveConfig(document, updated);
        }
      }
      break;

    case 'rename-key':
      // Rename a translation key
      {
        const config = requireConfig(document, deps);
        if (config) {
          if (warnOnKeyConflict(config, message.newKey)) break;
          const updated = renameKeyInConfig(config, message.oldKey, message.newKey);
          deps.documentConfigs.set(document.uri.toString(), updated);
          deps.saveConfig(document, updated);
        }
      }
      break;

    case 'add-locale':
      // Add a new locale to the configuration
      {
        const config = requireConfig(document, deps);
        if (config) {
          // Add empty locale entry
          const updated: ILocalesConfiguration = {
            ...config,
            [message.locale]: {},
          };
          deps.documentConfigs.set(document.uri.toString(), updated);
          deps.saveConfig(document, updated);
        }
      }
      break;

    // Legacy message handlers (for backward compatibility)
    case 'update':
      // Update document (DON'T trigger webview reload - Microsoft pattern)
      {
        const legacyMessage = message as ToExtensionMessage & { type: 'update' };
        const json = JSON.stringify(legacyMessage.labels, null, 2);
        const edit = new vscode.WorkspaceEdit();
        edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), json);
        deps.applyWebviewEdit(document, edit);
      }
      break;

    case 'request-save':
      // Validate and save
      {
        // For new format, document is already up-to-date
        const config = deps.documentConfigs.get(document.uri.toString());
        if (config) {
          // New format: validate config and save
          const errors = validateLocaleConfig(config);
          if (errors.length > 0) {
            const errorMessage: LocaleToWebviewMessage = {
              type: 'validation-error',
              errors,
            };
            webviewPanel.webview.postMessage(errorMessage);
          } else {
            const success = await deps.trySaveDocument(document);
            const saveMessage: LocaleToWebviewMessage = {
              type: 'save-complete',
              success,
            };
            webviewPanel.webview.postMessage(saveMessage);
          }
        } else {
          // Legacy format
          const legacyMessage = message as ToExtensionMessage & { type: 'request-save' };
          const errors = validateLabels(legacyMessage.labels);
          if (errors.length > 0) {
            const errorMessage: ToWebviewMessage = {
              type: 'validation-error',
              errors,
            };
            webviewPanel.webview.postMessage(errorMessage);
          } else {
            const success = await deps.trySaveDocument(document);
            const saveMessage: ToWebviewMessage = {
              type: 'save-complete',
              success,
            };
            webviewPanel.webview.postMessage(saveMessage);
          }
        }
      }
      break;

    case 'validate':
      // Run validation and send errors (legacy only)
      {
        const legacyMessage = message as ToExtensionMessage & { type: 'validate' };
        const errors = validateLabels(legacyMessage.labels);
        const errorMessage: ToWebviewMessage = {
          type: 'validation-error',
          errors,
        };
        webviewPanel.webview.postMessage(errorMessage);
      }
      break;

    case 'check-usage':
      // Query label/key usage in .eligian files.
      // The two protocols share this `type`; `'key' in message` is the
      // discriminator — the new protocol carries `key`, the legacy one `groupId`.
      if ('key' in message) {
        // New format
        const usageFiles = await deps.checkLabelUsage(message.key);
        const usageMessage: LocaleToWebviewMessage = {
          type: 'usage-check-response',
          key: message.key,
          usageFiles,
        };
        webviewPanel.webview.postMessage(usageMessage);
      } else {
        // Legacy format
        const usageFiles = await deps.checkLabelUsage(message.groupId);
        const usageMessage: ToWebviewMessage = {
          type: 'usage-check-response',
          groupId: message.groupId,
          usageFiles,
        };
        webviewPanel.webview.postMessage(usageMessage);
      }
      break;

    case 'request-delete':
      // Show VS Code native confirmation dialog.
      // `'key' in message` discriminates the new protocol (key) from the
      // legacy one (groupId/index).
      if ('key' in message) {
        // New format
        let confirmMsg = `Delete translation key '${message.key}'?`;
        if (message.usageFiles.length > 0) {
          confirmMsg = `Key '${message.key}' is used in ${message.usageFiles.length} file(s):\n${message.usageFiles.join('\n')}\n\nDelete anyway?`;
        }

        const choice = await deps.tryShowWarning(confirmMsg);
        if (choice === 'Delete') {
          const confirmMessage: LocaleToWebviewMessage = {
            type: 'delete-confirmed',
            key: message.key,
          };
          webviewPanel.webview.postMessage(confirmMessage);
        }
      } else {
        // Legacy format
        let confirmMsg = `Delete label group '${message.groupId}'?`;
        if (message.usageFiles.length > 0) {
          confirmMsg = `Label '${message.groupId}' is used in ${message.usageFiles.length} file(s):\n${message.usageFiles.join('\n')}\n\nDelete anyway?`;
        }

        const choice = await deps.tryShowWarning(confirmMsg);
        if (choice === 'Delete') {
          const confirmMessage: ToWebviewMessage = {
            type: 'delete-confirmed',
            index: message.index,
          };
          webviewPanel.webview.postMessage(confirmMessage);
        }
      }
      break;
  }
}
