/**
 * Label File Creator
 *
 * Feature 039: Label File Creation Quick Fix
 *
 * Creates missing labels files via VS Code file system API.
 * Handles directory creation, file writing, and editor opening.
 */

import * as vscode from 'vscode';
import {
  type CreateLabelsFileCommand,
  type FileCreationResult,
  FileErrorCode,
} from '../../../language/src/types/code-actions.js';

/**
 * Feature 039 - T029: Map error objects to FileErrorCode
 *
 * @param error - Error object from file system operations
 * @returns Appropriate FileErrorCode for the error type
 */
function mapErrorCode(error: unknown): FileErrorCode {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code: string }).code;

    // Permission errors
    if (code === 'EACCES' || code === 'EPERM') {
      return FileErrorCode.PermissionDenied;
    }

    // Invalid path errors
    if (code === 'EINVAL') {
      return FileErrorCode.InvalidPath;
    }
  }

  // Default to file system error
  return FileErrorCode.FileSystemError;
}

/**
 * Feature 039 - T032: Validate file path for common issues
 *
 * @param filePath - File path to validate
 * @returns Validation result with reason if invalid
 */
export function validatePath(filePath: string): { valid: boolean; reason?: string } {
  // Check file extension
  if (!filePath.endsWith('.json')) {
    return { valid: false, reason: 'File must have .json extension' };
  }

  // Check path length (Windows MAX_PATH limit)
  if (filePath.length > 260) {
    return { valid: false, reason: 'Path exceeds 260 character limit' };
  }

  // Check for invalid characters (Windows path restrictions)
  // Allow colon only as part of drive letter (e.g., C:)
  // Remove drive letter prefix before checking for invalid chars
  let pathToCheck = filePath;
  if (/^[A-Za-z]:/.test(filePath)) {
    // Remove drive letter (e.g., "C:") from the beginning
    pathToCheck = filePath.substring(2);
  }

  // Now check remaining path for invalid characters
  const invalidChars = /[<>:"|?*]/;
  if (invalidChars.test(pathToCheck)) {
    return { valid: false, reason: 'Path contains invalid characters: < > : " | ? *' };
  }

  // Check for trailing spaces or dots (Windows restriction)
  // Allow '.' and '..' as they are valid path references
  const pathParts = filePath.split(/[\\/]/);
  for (const part of pathParts) {
    // Skip empty parts and valid relative references
    if (part === '' || part === '.' || part === '..') {
      continue;
    }

    // Check for trailing spaces or dots
    if (part.endsWith(' ') || part.endsWith('.')) {
      return { valid: false, reason: 'Path components cannot end with spaces or dots' };
    }
  }

  return { valid: true };
}

/**
 * Create a labels file from a code action command
 *
 * This function:
 * 1. Creates necessary parent directories
 * 2. Writes the labels file content
 * 3. Opens the file in the label editor (or fallback to default editor)
 *
 * @param args - Command arguments from code action
 * @returns Result indicating success/failure and whether editor opened
 */
export async function createLabelsFile(args: CreateLabelsFileCommand): Promise<FileCreationResult> {
  const { filePath, content } = args;

  // Feature 039 - T033: Validate path before attempting creation
  const validation = validatePath(filePath);
  if (!validation.valid) {
    // Feature 039 - T031: Show specific error message
    const errorMessage = `Invalid file path: ${validation.reason}`;
    vscode.window.showErrorMessage(errorMessage);

    return {
      success: false,
      filePath,
      error: {
        code: FileErrorCode.InvalidPath,
        message: errorMessage,
      },
      editorOpened: false,
    };
  }

  // Feature 039 - T030: Wrap file creation in try/catch with enhanced error handling
  try {
    // Convert file path to VS Code URI
    const fileUri = vscode.Uri.file(filePath);

    // Feature 039 - T009: Create parent directories if they don't exist
    const parentDir = vscode.Uri.joinPath(fileUri, '..');
    await vscode.workspace.fs.createDirectory(parentDir);

    // Feature 039 - T008: Write file content
    const contentBytes = Buffer.from(content, 'utf-8');
    await vscode.workspace.fs.writeFile(fileUri, contentBytes);

    // Feature 039 - T010: Open file in editor
    let editorOpened = false;
    try {
      // Try opening in custom label editor first
      await vscode.commands.executeCommand('eligian.openLabelEditor', fileUri);
      editorOpened = true;
    } catch {
      // Fallback to default text editor
      try {
        await vscode.window.showTextDocument(fileUri);
        editorOpened = true;
      } catch {
        // Editor opening failed, but file was created successfully
        editorOpened = false;
      }
    }

    // Return success result
    return {
      success: true,
      filePath,
      editorOpened,
    };
  } catch (error) {
    // Feature 039 - T029: Map error to appropriate error code
    const errorCode = mapErrorCode(error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Feature 039 - T031: Display specific error messages based on error code
    let userMessage: string;
    switch (errorCode) {
      case FileErrorCode.PermissionDenied:
        userMessage = `Permission denied: Unable to create file at ${filePath}. Check file permissions.`;
        break;
      case FileErrorCode.InvalidPath:
        userMessage = `Invalid path: ${filePath}. ${errorMessage}`;
        break;
      default:
        userMessage = `Failed to create labels file: ${errorMessage}`;
        break;
    }

    vscode.window.showErrorMessage(userMessage);

    return {
      success: false,
      filePath,
      error: {
        code: errorCode,
        message: userMessage,
        cause: error instanceof Error ? error : undefined,
      },
      editorOpened: false,
    };
  }
}
