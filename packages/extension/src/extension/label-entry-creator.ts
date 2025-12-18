/**
 * Label Entry Creator
 *
 * Feature 041: Missing Label Entry Quick Fix
 *
 * Creates missing label entries in existing labels files.
 * Uses VS Code workspace.fs API for file operations.
 */

import { generateLabelEntry, type LabelEntry } from '@eligian/language';
import * as vscode from 'vscode';
import {
  type CreateLabelEntryCommand,
  type LabelEntryCreationResult,
  LabelEntryErrorCode,
} from '../../../language/src/types/code-actions.js';

/**
 * Pending label selection for the next opened label editor.
 * Used to pass the newly created label ID to the editor.
 */
export interface PendingLabelSelection {
  fileUri: string;
  labelId: string;
}

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
 * Create a missing label entry in an existing labels file
 *
 * This function:
 * 1. Reads the existing labels file
 * 2. Parses it as JSON array
 * 3. Checks if label ID already exists
 * 4. Generates new entry with empty translations for all languages
 * 5. Appends entry to array
 * 6. Writes file with 2-space indentation
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

    // T017: Read existing labels file
    let existingContent: string;
    try {
      const contentBytes = await vscode.workspace.fs.readFile(fileUri);
      existingContent = Buffer.from(contentBytes).toString('utf-8');
    } catch (error) {
      const errorMessage = `Failed to read labels file: ${error instanceof Error ? error.message : 'Unknown error'}`;
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

    // Parse JSON
    let labelsArray: LabelEntry[];
    try {
      labelsArray = JSON.parse(existingContent);

      // Validate it's an array
      if (!Array.isArray(labelsArray)) {
        throw new Error('Labels file must contain a JSON array');
      }
    } catch (error) {
      const errorMessage = `Invalid JSON in labels file: ${error instanceof Error ? error.message : 'Unknown error'}`;
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

    // Check if label ID already exists (defensive check)
    const existingEntry = labelsArray.find(entry => entry.id === labelId);
    if (existingEntry) {
      const errorMessage = `Label ID '${labelId}' already exists in the labels file`;
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

    // Generate new label entry using the language package helper
    const newEntry = generateLabelEntry(labelId, languageCodes);

    // Append to array
    labelsArray.push(newEntry);

    // T018: Write file with 2-space indentation (preserves formatting consistency)
    const newContent = JSON.stringify(labelsArray, null, 2);
    try {
      const contentBytes = Buffer.from(newContent, 'utf-8');
      await vscode.workspace.fs.writeFile(fileUri, contentBytes);
    } catch (error) {
      const errorMessage = `Failed to write labels file: ${error instanceof Error ? error.message : 'Unknown error'}`;
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
      `Created label entry '${labelId}' with ${languageCodes.length} language(s)`
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
    const errorMessage = `Unexpected error creating label entry: ${error instanceof Error ? error.message : 'Unknown error'}`;
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
