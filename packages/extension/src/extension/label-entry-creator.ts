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

import { mergeLocaleEntry } from '@eligian/language';
import type { ILocalesConfiguration } from 'eligius';
import * as vscode from 'vscode';
import {
  type CreateLabelEntryCommand,
  type LabelEntryCreationResult,
  LabelEntryErrorCode,
} from '../../../language/src/types/code-actions.js';

/**
 * Store for pending label selections.
 * Key: file URI string, Value: label ID to select
 */
const pendingSelections = new Map<string, string>();

/**
 * Get and clear the pending selection for a file URI.
 * Called by LabelEditorProvider when resolving a custom editor.
 *
 * @param fileUri - File URI to check for pending selection
 * @returns Label ID to select, or undefined if none pending
 */
export function consumePendingSelection(fileUri: string): string | undefined {
  const labelId = pendingSelections.get(fileUri);
  if (labelId) {
    pendingSelections.delete(fileUri);
  }
  return labelId;
}

/**
 * Open the label editor for a file and select a specific label.
 *
 * @param fileUri - URI of the labels file to open
 * @param labelId - Label ID to select after opening
 */
async function openLabelEditorWithSelection(fileUri: vscode.Uri, labelId: string): Promise<void> {
  // Store the pending selection
  pendingSelections.set(fileUri.toString(), labelId);

  // Open the locale editor
  await vscode.commands.executeCommand('vscode.openWith', fileUri, 'eligian.localeEditor');
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
      if (!(segment in current)) {
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
 * 1. Reads the existing locale file
 * 2. Parses it as ILocalesConfiguration
 * 3. Checks if translation key already exists
 * 4. Merges new entry with empty translations for all languages
 * 5. Writes file with 2-space indentation
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

    // Read existing locale file
    let existingContent: string;
    try {
      const contentBytes = await vscode.workspace.fs.readFile(fileUri);
      existingContent = Buffer.from(contentBytes).toString('utf-8');
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
    const updatedConfig = mergeLocaleEntry(localesConfig, labelId, languageCodes);

    // Write file with 2-space indentation (preserves formatting consistency)
    const newContent = JSON.stringify(updatedConfig, null, 2);
    try {
      const contentBytes = Buffer.from(newContent, 'utf-8');
      await vscode.workspace.fs.writeFile(fileUri, contentBytes);
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

    // Success - show info message
    vscode.window.showInformationMessage(
      `Created translation key '${labelId}' with ${languageCodes.length} language(s)`
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
