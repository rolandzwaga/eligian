/**
 * Label Entry Creator
 *
 * Feature 041: Missing Label Entry Quick Fix
 *
 * Creates missing translation key entries in existing locale files.
 * Uses VS Code workspace.fs API for file operations.
 *
 * Updated for Eligius 2.2+ ILocalesConfiguration format (nested object keyed by locale).
 */

import { isSafeTranslationKey, mergeLocaleEntryWithSkipped } from '@eligian/language';
import type { ILocalesConfiguration } from 'eligius';
import * as vscode from 'vscode';
import {
  type CreateLabelEntryCommand,
  type LabelEntryCreationResult,
  LabelEntryErrorCode,
} from '../../../language/src/types/code-actions.js';
import type { LocaleToWebviewMessage } from './locale-editor/types.js';

/**
 * How long a pending selection stays valid. The selection is consumed when the
 * editor's webview reports 'ready'; if that never happens (the editor failed to
 * open, or the user closed it) the entry must not linger and fire on a later,
 * unrelated open of the same file.
 */
const PENDING_SELECTION_TTL_MS = 30_000;

/**
 * Store for pending label selections.
 * Key: file URI string, Value: label ID to select and the time it stops being valid
 */
const pendingSelections = new Map<string, { labelId: string; expiresAt: number }>();

/**
 * Locale editor webview panels that are currently open, keyed by file URI string.
 * Re-opening an already open custom editor only reveals it (no new 'ready'), so
 * selections for such files are posted straight to the live panel.
 */
const livePanels = new Map<string, vscode.WebviewPanel>();

/**
 * Register a live locale editor panel for a file URI.
 *
 * @returns Function that unregisters the panel (a no-op if it was replaced meanwhile)
 */
export function registerLocalePanel(fileUri: string, panel: vscode.WebviewPanel): () => void {
  livePanels.set(fileUri, panel);
  return () => {
    if (livePanels.get(fileUri) === panel) {
      livePanels.delete(fileUri);
    }
  };
}

/**
 * Record a pending selection for a file URI.
 * Set by the quick fix before opening the editor; read once via
 * {@link consumePendingSelection} when the editor resolves.
 *
 * @param fileUri - File URI string the selection applies to
 * @param labelId - Label ID to select once the editor opens
 */
export function setPendingSelection(fileUri: string, labelId: string): void {
  pendingSelections.set(fileUri, { labelId, expiresAt: Date.now() + PENDING_SELECTION_TTL_MS });
}

/**
 * Get and clear the pending selection for a file URI.
 * Called by LabelEditorProvider when resolving a custom editor.
 *
 * @param fileUri - File URI to check for pending selection
 * @returns Label ID to select, or undefined if none pending
 */
export function consumePendingSelection(fileUri: string): string | undefined {
  const pending = pendingSelections.get(fileUri);
  if (!pending) {
    return undefined;
  }
  pendingSelections.delete(fileUri);
  return pending.expiresAt >= Date.now() ? pending.labelId : undefined;
}

/**
 * Whether a pending selection is currently recorded for a file URI.
 */
export function hasPendingSelection(fileUri: string): boolean {
  const pending = pendingSelections.get(fileUri);
  if (pending && pending.expiresAt < Date.now()) {
    pendingSelections.delete(fileUri);
    return false;
  }
  return pending !== undefined;
}

/**
 * Clear all pending selections. Primarily for deterministic test isolation of
 * this module-level store.
 */
export function clearPendingSelections(): void {
  pendingSelections.clear();
}

/**
 * Open the label editor for a file and select a specific label.
 *
 * @param fileUri - URI of the labels file to open
 * @param labelId - Label ID to select after opening
 */
async function openLabelEditorWithSelection(fileUri: vscode.Uri, labelId: string): Promise<void> {
  const key = fileUri.toString();

  // The editor is already open: openWith would only reveal it and no 'ready' would
  // ever consume a pending selection, so select the key in the live webview directly.
  const panel = livePanels.get(key);
  if (panel) {
    panel.reveal();
    const message: LocaleToWebviewMessage = { type: 'select-key', key: labelId };
    await panel.webview.postMessage(message);
    return;
  }

  // Otherwise the new webview consumes the selection when it reports 'ready'
  setPendingSelection(key, labelId);
  try {
    await vscode.commands.executeCommand('vscode.openWith', fileUri, 'eligian.localeEditor');
  } catch (error) {
    // No editor will ever consume the selection
    consumePendingSelection(key);
    throw error;
  }
}

/** Own-property check, so inherited names such as `toString` never count as existing keys. */
function hasOwn(target: object, key: string): boolean {
  return Object.keys(target).includes(key);
}

/**
 * Check if a translation key already exists in the locale configuration.
 *
 * @param config - ILocalesConfiguration to check
 * @param translationKey - Dot-notation key to look for
 * @returns true if the key exists in any locale
 */
function hasTranslationKey(config: ILocalesConfiguration, translationKey: string): boolean {
  const segments = translationKey.split('.');

  for (const localeEntry of Object.values(config)) {
    // Skip $ref entries
    if (!localeEntry || typeof localeEntry !== 'object' || '$ref' in localeEntry) {
      continue;
    }

    // Walk the path to see if key exists
    let current: Record<string, unknown> = localeEntry as Record<string, unknown>;
    let found = true;

    for (const segment of segments) {
      if (!hasOwn(current, segment)) {
        found = false;
        break;
      }
      const next = current[segment];
      if (typeof next === 'string') {
        // Reached a leaf - this is the translation
        found = true;
        break;
      }
      if (typeof next === 'object' && next !== null) {
        current = next as Record<string, unknown>;
      } else {
        found = false;
        break;
      }
    }

    if (found) {
      return true;
    }
  }

  return false;
}

/**
 * Create a missing translation key entry in an existing locale file
 *
 * This function:
 * 1. Reads the existing locale file (including unsaved editor changes)
 * 2. Parses it as ILocalesConfiguration
 * 3. Checks if translation key already exists
 * 4. Merges new entry with empty translations for all languages
 * 5. Applies the result as a document edit (2-space indentation) and saves it
 *
 * @param args - Command arguments from code action
 * @returns Result indicating success/failure with details
 */
export async function createLabelEntry(
  args: CreateLabelEntryCommand
): Promise<LabelEntryCreationResult> {
  const { labelId, labelsFilePath, languageCodes } = args;

  try {
    // Convert file path to VS Code URI
    const fileUri = vscode.Uri.file(labelsFilePath);

    // Read the current text through the TextDocument model: if the locale editor (or a
    // text editor) has the file open with unsaved changes, those changes are included.
    let document: vscode.TextDocument;
    let existingContent: string;
    try {
      document = await vscode.workspace.openTextDocument(fileUri);
      existingContent = document.getText();
    } catch (error) {
      const errorMessage = `Failed to read locale file: ${error instanceof Error ? error.message : 'Unknown error'}`;
      vscode.window.showErrorMessage(errorMessage);

      return {
        success: false,
        labelId,
        labelsFilePath,
        error: {
          code: LabelEntryErrorCode.FileReadError,
          message: errorMessage,
          cause: error instanceof Error ? error : undefined,
        },
      };
    }

    // Parse JSON as ILocalesConfiguration
    let localesConfig: ILocalesConfiguration;
    try {
      localesConfig = JSON.parse(existingContent);

      // Validate it's an object (not array - that's the old format)
      if (
        typeof localesConfig !== 'object' ||
        localesConfig === null ||
        Array.isArray(localesConfig)
      ) {
        throw new Error(
          'Locale file must contain a JSON object keyed by locale codes (e.g., {"en-US": {...}})'
        );
      }
    } catch (error) {
      const errorMessage = `Invalid JSON in locale file: ${error instanceof Error ? error.message : 'Unknown error'}`;
      vscode.window.showErrorMessage(errorMessage);

      return {
        success: false,
        labelId,
        labelsFilePath,
        error: {
          code: LabelEntryErrorCode.InvalidJson,
          message: errorMessage,
          cause: error instanceof Error ? error : undefined,
        },
      };
    }

    // Refuse key paths that cannot be written safely (`__proto__`, empty segments, ...)
    if (!isSafeTranslationKey(labelId)) {
      const errorMessage = `'${labelId}' is not a valid translation key`;
      vscode.window.showErrorMessage(errorMessage);

      return {
        success: false,
        labelId,
        labelsFilePath,
        error: {
          code: LabelEntryErrorCode.InvalidKey,
          message: errorMessage,
        },
      };
    }

    // Check if translation key already exists (defensive check)
    if (hasTranslationKey(localesConfig, labelId)) {
      const errorMessage = `Translation key '${labelId}' already exists in the locale file`;
      vscode.window.showWarningMessage(errorMessage);

      return {
        success: false,
        labelId,
        labelsFilePath,
        error: {
          code: LabelEntryErrorCode.LabelExists,
          message: errorMessage,
        },
      };
    }

    // Merge new translation key into existing configuration
    const {
      config: updatedConfig,
      skipped,
      invalidKey,
      invalidLanguageCodes,
    } = mergeLocaleEntryWithSkipped(localesConfig, labelId, languageCodes);

    // Defensive: the merge refuses unsafe key paths too; never rewrite the file for one
    if (invalidKey) {
      const errorMessage = `'${labelId}' is not a valid translation key`;
      vscode.window.showErrorMessage(errorMessage);

      return {
        success: false,
        labelId,
        labelsFilePath,
        error: {
          code: LabelEntryErrorCode.InvalidKey,
          message: errorMessage,
        },
      };
    }

    // Apply the merged result to the document (2-space indentation) and save it. Going
    // through the document keeps an open locale editor in sync via its change listener
    // instead of leaving a dirty buffer that conflicts with the file on disk.
    const newContent = JSON.stringify(updatedConfig, null, 2);
    try {
      const edit = new vscode.WorkspaceEdit();
      edit.replace(fileUri, new vscode.Range(0, 0, document.lineCount, 0), newContent);
      if (!(await vscode.workspace.applyEdit(edit))) {
        throw new Error('The edit was rejected by VS Code');
      }
      if (!(await document.save())) {
        throw new Error('The document could not be saved');
      }
    } catch (error) {
      const errorMessage = `Failed to write locale file: ${error instanceof Error ? error.message : 'Unknown error'}`;
      vscode.window.showErrorMessage(errorMessage);

      return {
        success: false,
        labelId,
        labelsFilePath,
        error: {
          code: LabelEntryErrorCode.FileWriteError,
          message: errorMessage,
          cause: error instanceof Error ? error : undefined,
        },
      };
    }

    // $ref locales are left untouched; tell the user where the key still has to be added
    if (skipped.length > 0) {
      vscode.window.showWarningMessage(
        `Locale(s) ${skipped.join(', ')} reference external files via "$ref"; add '${labelId}' to the referenced file(s) manually.`
      );
    }

    if (invalidLanguageCodes.length > 0) {
      vscode.window.showWarningMessage(
        `Ignored invalid language code(s) ${invalidLanguageCodes.join(', ')}`
      );
    }

    // Success - show info message
    vscode.window.showInformationMessage(
      `Created translation key '${labelId}' with ${languageCodes.length - invalidLanguageCodes.length} language(s)`
    );

    // Open label editor with the new label selected
    await openLabelEditorWithSelection(fileUri, labelId);

    return {
      success: true,
      labelId,
      labelsFilePath,
    };
  } catch (error) {
    // Unexpected error
    const errorMessage = `Unexpected error creating translation key: ${error instanceof Error ? error.message : 'Unknown error'}`;
    vscode.window.showErrorMessage(errorMessage);

    return {
      success: false,
      labelId,
      labelsFilePath,
      error: {
        code: LabelEntryErrorCode.FileWriteError,
        message: errorMessage,
        cause: error instanceof Error ? error : undefined,
      },
    };
  }
}
