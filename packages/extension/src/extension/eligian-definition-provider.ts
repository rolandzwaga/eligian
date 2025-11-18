// biome-ignore-all lint/correctness/noUnusedPrivateClassMembers: bullshit
/**
 * EligianDefinitionProvider.ts - Go-to-definition for label imports
 *
 * Purpose: Enable Ctrl+Click (F12) navigation from label import paths to label JSON files.
 * Opens label files in the custom Label Editor.
 *
 * Constitution Principle I: Simplicity & Documentation
 */

import * as vscode from 'vscode';

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
  public async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): Promise<vscode.Definition | null> {
    // Get the line text at cursor position
    const line = document.lineAt(position).text;

    // Extract import path if cursor is on one
    const importPath = this.extractImportPath(line, position.character);
    if (!importPath) {
      return null;
    }

    // Resolve relative path to absolute URI
    const fileUri = this.resolveRelativePath(document.uri, importPath);
    if (!fileUri) {
      return null;
    }

    // Open the file in the custom Label Editor
    // We execute the command asynchronously, but still return the location
    // so VS Code knows we handled the request
    vscode.commands.executeCommand('vscode.openWith', fileUri, 'eligian.labelEditor');

    // Return the location so VS Code doesn't show "No definition found"
    return new vscode.Location(fileUri, new vscode.Position(0, 0));
  }

  /**
   * Extract import path from line if cursor is positioned on it.
   *
   * @param line - The line text
   * @param character - Cursor character position in line
   * @returns The import path if cursor is on it, null otherwise
   *
   * @example
   * extractImportPath('labels "./labels.json"', 10) // Returns "./labels.json"
   * extractImportPath('labels "./labels.json"', 0)  // Returns null (not on path)
   */
  private extractImportPath(line: string, character: number): string | null {
    // Pattern: labels\s+"([^"]+)"
    const pattern = /labels\s+"([^"]+)"/;
    const match = pattern.exec(line);

    if (!match) {
      return null;
    }

    // Find the position of the quoted string
    const quotedStringStart = match.index + match[0].indexOf('"');
    const quotedStringEnd = quotedStringStart + match[1].length + 2; // +2 for quotes

    // Check if cursor is inside the quoted string
    if (character >= quotedStringStart && character <= quotedStringEnd) {
      return match[1]; // Return the captured path without quotes
    }

    return null;
  }

  /**
   * Resolve relative path to absolute URI.
   *
   * @param documentUri - The URI of the document containing the import
   * @param relativePath - The relative path from the import statement
   * @returns The resolved absolute URI, or null if resolution fails
   *
   * @example
   * // If document is at file:///project/src/file.eligian
   * resolveRelativePath(docUri, "./labels.json")
   * // Returns file:///project/src/labels.json
   */
  private resolveRelativePath(documentUri: vscode.Uri, relativePath: string): vscode.Uri | null {
    try {
      // Get the directory of the document
      const documentDir = vscode.Uri.joinPath(documentUri, '..');

      // Join with the relative path
      const resolvedUri = vscode.Uri.joinPath(documentDir, relativePath);

      return resolvedUri;
    } catch (error) {
      console.error(`Failed to resolve path ${relativePath}:`, error);
      return null;
    }
  }
}
