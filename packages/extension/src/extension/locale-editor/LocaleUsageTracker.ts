/**
 * Locale Usage Tracker
 *
 * Searches workspace for usage of translation keys in .eligian files.
 * Used to show confirmation dialog when deleting translation keys that are in use.
 * Also provides detailed usage information for display in the locale editor.
 *
 * Feature 036 T064-T065: User Story 7 - Translation Key Usage Tracking
 * Feature 045 Phase 4F: Enhanced usage tracking (T056-T059)
 * Constitution Principle I: Simplicity & Documentation
 */

import * as vscode from 'vscode';

/**
 * Detailed usage location information
 */
interface UsageLocation {
  filePath: string;
  fileName: string;
  line: number;
  column: number;
  preview: string; // Line preview for context
}

/**
 * Usage information for a single translation key
 */
interface KeyUsage {
  count: number;
  files: UsageLocation[];
}

/**
 * T064: Search workspace for translation key usage
 *
 * Design:
 * - Uses vscode.workspace.findFiles to get all .eligian files
 * - Parses each file to find translation key references using regex patterns
 * - Supports multiple patterns:
 *   1. @{translationKey} - template syntax
 *   2. addController("LabelController", "translationKey", ...) - controller syntax
 * - Returns array of file URIs where the translation key is used
 *
 * @param groupId - The translation key to search for
 * @returns Promise resolving to array of file URIs where translation key is used
 *
 * @example
 * const usageFiles = await searchWorkspace('welcome-title');
 * if (usageFiles.length > 0) {
 *   console.log(`Translation key used in ${usageFiles.length} files`);
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

    // Escape special regex characters in groupId
    const escapedGroupId = groupId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Search patterns:
    // 1. @{groupId} - template reference
    // 2. addController("LabelController", "groupId", ...) - controller syntax
    const templatePattern = new RegExp(`@\\{${escapedGroupId}\\}`, 'g');
    const controllerPattern = new RegExp(
      `addController\\s*\\(\\s*"LabelController"\\s*,\\s*"${escapedGroupId}"`,
      'g'
    );

    const usageFiles: vscode.Uri[] = [];

    // Search each file for translation key reference
    for (const fileUri of files) {
      try {
        const document = await vscode.workspace.openTextDocument(fileUri);
        const content = document.getText();

        // Reset lastIndex before each test (regex with 'g' flag maintains state)
        templatePattern.lastIndex = 0;
        controllerPattern.lastIndex = 0;

        // Check if translation key is used in this file (either pattern)
        if (templatePattern.test(content) || controllerPattern.test(content)) {
          usageFiles.push(fileUri);
        }
      } catch (error) {
        // Skip files that can't be read (permissions, etc.)
        console.error(`Failed to read file ${fileUri.fsPath}:`, error);
      }
    }

    return usageFiles;
  } catch (error) {
    console.error('Failed to search workspace for translation key usage:', error);
    return [];
  }
}

/**
 * T057: Get detailed usage information for a translation key
 *
 * Returns detailed information about where a translation key is used,
 * including line numbers and preview text for the locale editor UI.
 *
 * @param translationKey - The translation key to search for
 * @returns Promise resolving to KeyUsage with detailed location information
 */
export async function getKeyUsageDetails(translationKey: string): Promise<KeyUsage> {
  // Handle empty key
  if (!translationKey || translationKey.trim().length === 0) {
    return { count: 0, files: [] };
  }

  try {
    // Find all .eligian files in workspace
    const files = await vscode.workspace.findFiles('**/*.eligian', '**/node_modules/**');

    // Escape special regex characters
    const escapedKey = translationKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Search patterns
    const templatePattern = new RegExp(`@\\{${escapedKey}\\}`, 'g');
    const controllerPattern = new RegExp(
      `addController\\s*\\(\\s*"LabelController"\\s*,\\s*"${escapedKey}"`,
      'g'
    );

    const usageLocations: UsageLocation[] = [];

    // Search each file
    for (const fileUri of files) {
      try {
        const document = await vscode.workspace.openTextDocument(fileUri);
        const content = document.getText();
        const lines = content.split('\n');
        const fileName = fileUri.path.split('/').pop() || fileUri.fsPath;

        // Search each line for matches
        for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
          const line = lines[lineIdx];

          // Reset lastIndex before each test
          templatePattern.lastIndex = 0;
          controllerPattern.lastIndex = 0;

          // Check template pattern
          let match: RegExpExecArray | null;
          while ((match = templatePattern.exec(line)) !== null) {
            usageLocations.push({
              filePath: fileUri.fsPath,
              fileName,
              line: lineIdx + 1, // 1-indexed
              column: match.index + 1,
              preview: line.trim().substring(0, 100), // Trim and limit preview
            });
          }

          // Check controller pattern
          templatePattern.lastIndex = 0; // Reset after while loop
          while ((match = controllerPattern.exec(line)) !== null) {
            usageLocations.push({
              filePath: fileUri.fsPath,
              fileName,
              line: lineIdx + 1,
              column: match.index + 1,
              preview: line.trim().substring(0, 100),
            });
          }
        }
      } catch (error) {
        // Skip files that can't be read
        console.error(`Failed to read file ${fileUri.fsPath}:`, error);
      }
    }

    return {
      count: usageLocations.length,
      files: usageLocations,
    };
  } catch (error) {
    console.error('Failed to get usage details for translation key:', error);
    return { count: 0, files: [] };
  }
}

/**
 * T058: Format usage count for badge display
 */
export function formatUsageCount(count: number): string {
  if (count === 0) return '';
  if (count > 99) return '99+';
  return count.toString();
}

/**
 * T059: Format usage tooltip text
 */
export function formatUsageTooltip(usage: KeyUsage | undefined): string {
  if (!usage || usage.count === 0) {
    return 'Not used in any .eligian files';
  }
  const fileCount = new Set(usage.files.map(f => f.filePath)).size;
  if (usage.count === 1) {
    return `Used 1 time in ${usage.files[0].fileName}`;
  }
  return `Used ${usage.count} times across ${fileCount} file${fileCount > 1 ? 's' : ''}`;
}
