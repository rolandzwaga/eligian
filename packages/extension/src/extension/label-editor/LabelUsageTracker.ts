/**
 * Label Usage Tracker
 *
 * Searches workspace for usage of label groups in .eligian files.
 * Used to show confirmation dialog when deleting labels that are in use.
 *
 * Feature 036 T064-T065: User Story 7 - Label Usage Tracking
 * Constitution Principle I: Simplicity & Documentation
 */

import * as vscode from 'vscode';

/**
 * T064: Search workspace for label usage
 *
 * Design:
 * - Uses vscode.workspace.findFiles to get all .eligian files
 * - Parses each file to find label references using regex pattern
 * - Label references follow the pattern: @{groupId}
 * - Returns array of file URIs where the label is used
 *
 * @param groupId - The label group ID to search for
 * @returns Promise resolving to array of file URIs where label is used
 *
 * @example
 * const usageFiles = await searchWorkspace('welcome-title');
 * if (usageFiles.length > 0) {
 *   console.log(`Label used in ${usageFiles.length} files`);
 * }
 */
export async function searchWorkspace(groupId: string): Promise<vscode.Uri[]> {
  // Handle empty group ID
  if (!groupId || groupId.trim().length === 0) {
    return [];
  }

  try {
    // Find all .eligian files in workspace
    const files = await vscode.workspace.findFiles('**/*.eligian', '**/node_modules/**');

    // Search pattern: @{groupId}
    // Escape special regex characters in groupId
    const escapedGroupId = groupId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`@\\{${escapedGroupId}\\}`, 'g');

    const usageFiles: vscode.Uri[] = [];

    // Search each file for label reference
    for (const fileUri of files) {
      try {
        const document = await vscode.workspace.openTextDocument(fileUri);
        const content = document.getText();

        // Reset lastIndex before each test (regex with 'g' flag maintains state)
        pattern.lastIndex = 0;

        // Check if label is used in this file
        if (pattern.test(content)) {
          usageFiles.push(fileUri);
        }
      } catch (error) {
        // Skip files that can't be read (permissions, etc.)
        console.error(`Failed to read file ${fileUri.fsPath}:`, error);
      }
    }

    return usageFiles;
  } catch (error) {
    console.error('Failed to search workspace for label usage:', error);
    return [];
  }
}
