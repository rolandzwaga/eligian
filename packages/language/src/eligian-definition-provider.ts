// biome-ignore-all lint/correctness/noUnusedPrivateClassMembers: bullshit
/**
 * EligianDefinitionProvider.ts - Go-to-definition for label imports
 *
 * Purpose: Enable Ctrl+Click (F12) navigation from label import paths to label JSON files.
 * Opens label files in the custom Label Editor.
 *
 * Constitution Principle I: Simplicity & Documentation
 */

import type * as vscode from 'vscode';

/**
 * Provides "Go to Definition" functionality for label import statements.
 *
 * When the user Ctrl+Clicks on a label import path:
 * ```eligian
 * labels "./translations/labels.json"
 *         ^^^^^^^^^^^^^^^^^^^^^^^^^^ (cursor here)
 * ```
 *
 * This provider:
 * 1. Detects if cursor is on a label import path
 * 2. Extracts the file path from the import statement
 * 3. Resolves relative path to absolute URI
 * 4. Returns a Location pointing to the label file
 * 5. VSCode opens the file in the custom Label Editor
 *
 * @example
 * const provider = new EligianDefinitionProvider();
 * context.subscriptions.push(
 *   vscode.languages.registerDefinitionProvider(
 *     { language: 'eligian' },
 *     provider
 *   )
 * );
 */
export class EligianDefinitionProvider implements vscode.DefinitionProvider {
  /**
   * Provide definition locations for label imports.
   *
   * @param document - The document containing the import
   * @param position - Cursor position
   * @param token - Cancellation token
   * @returns Location of the label file, or null if not on an import
   */
  public provideDefinition(
    _document: vscode.TextDocument,
    _position: vscode.Position,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Definition> {
    // TODO (T015): Implement definition provider
    // 1. Get line text at cursor position
    // 2. Check if line matches label import pattern: labels\s+"([^"]+)"
    // 3. Check if cursor is inside the quoted string
    // 4. Extract file path from capture group
    // 5. Resolve relative path to absolute URI (relative to document.uri)
    // 6. Return new vscode.Location(fileUri, new vscode.Position(0, 0))
    // 7. Return null if not on a valid import

    return null;
  }

  // TODO (T015): Add helper methods for implementation:
  // - extractImportPath(line, position): Extract import path from line if cursor is on it
  // - resolveRelativePath(documentUri, relativePath): Resolve relative path to absolute URI
}
