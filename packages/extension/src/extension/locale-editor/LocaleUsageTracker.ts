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
 * Compiled regex patterns that match a translation key reference in DSL source.
 *
 * 1. @{key}                                      - template reference
 * 2. addController("LabelController", "key", ...) - controller syntax
 *
 * Both use the 'g' flag, so callers must reset `lastIndex` before each use.
 */
interface KeyUsagePatterns {
  template: RegExp;
  controller: RegExp;
}

/**
 * Build the usage-match patterns for a translation key, escaping regex metachars.
 */
function buildKeyUsagePatterns(key: string): KeyUsagePatterns {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return {
    template: new RegExp(`@\\{${escaped}\\}`, 'g'),
    controller: new RegExp(`addController\\s*\\(\\s*"LabelController"\\s*,\\s*"${escaped}"`, 'g'),
  };
}

/**
 * Visit every .eligian file in the workspace (excluding node_modules), invoking
 * `handler` with the file URI and its text content. Files that cannot be read
 * are skipped (logged, not thrown). Errors from `findFiles` propagate.
 */
async function forEachEligianFile(
  handler: (fileUri: vscode.Uri, content: string) => void
): Promise<void> {
  const files = await vscode.workspace.findFiles('**/*.eligian', '**/node_modules/**');

  for (const fileUri of files) {
    try {
      const document = await vscode.workspace.openTextDocument(fileUri);
      handler(fileUri, document.getText());
    } catch (error) {
      // Skip files that can't be read (permissions, etc.)
      console.error(`Failed to read file ${fileUri.fsPath}:`, error);
    }
  }
}

/**
 * T064: Search workspace for translation key usage
 *
 * Design:
 * - Uses vscode.workspace.findFiles to get all .eligian files
 * - Parses each file to find translation key references using regex patterns
 *   (see {@link buildKeyUsagePatterns})
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

  const usageFiles: vscode.Uri[] = [];

  try {
    const { template, controller } = buildKeyUsagePatterns(groupId);

    await forEachEligianFile((fileUri, content) => {
      // Reset lastIndex before each test (regex with 'g' flag maintains state)
      template.lastIndex = 0;
      controller.lastIndex = 0;

      if (template.test(content) || controller.test(content)) {
        usageFiles.push(fileUri);
      }
    });
  } catch (error) {
    console.error('Failed to search workspace for translation key usage:', error);
  }

  return usageFiles;
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

  const usageLocations: UsageLocation[] = [];

  try {
    const { template, controller } = buildKeyUsagePatterns(translationKey);

    await forEachEligianFile((fileUri, content) => {
      const lines = content.split('\n');
      const fileName = fileUri.path.split('/').pop() || fileUri.fsPath;

      for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const line = lines[lineIdx];
        collectLineMatches(template, line, fileUri, fileName, lineIdx, usageLocations);
        collectLineMatches(controller, line, fileUri, fileName, lineIdx, usageLocations);
      }
    });
  } catch (error) {
    console.error('Failed to get usage details for translation key:', error);
  }

  return {
    count: usageLocations.length,
    files: usageLocations,
  };
}

/**
 * Push a UsageLocation for every match of `pattern` (a 'g'-flagged regex) on a
 * single line. Resets `lastIndex` first so the caller need not.
 */
function collectLineMatches(
  pattern: RegExp,
  line: string,
  fileUri: vscode.Uri,
  fileName: string,
  lineIdx: number,
  out: UsageLocation[]
): void {
  pattern.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(line)) !== null) {
    out.push({
      filePath: fileUri.fsPath,
      fileName,
      line: lineIdx + 1, // 1-indexed
      column: match.index + 1,
      preview: line.trim().substring(0, 100), // Trim and limit preview
    });
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
