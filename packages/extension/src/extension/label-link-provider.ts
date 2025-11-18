/**
 * LabelLinkProvider.ts - Clickable links for label imports
 *
 * Purpose: Make label import paths clickable to open in Label Editor.
 * This is better than DefinitionProvider because it doesn't trigger on hover.
 *
 * Constitution Principle I: Simplicity & Documentation
 */

import * as vscode from 'vscode';

/**
 * Provides clickable links for label import statements.
 *
 * When the user Ctrl+Clicks on a label import path, this provider:
 * 1. Detects the label import line
 * 2. Creates a clickable range for the path
 * 3. Generates a command URI to open the file in Label Editor
 *
 * @example
 * const provider = new LabelLinkProvider();
 * context.subscriptions.push(
 *   vscode.languages.registerDocumentLinkProvider(
 *     { language: 'eligian' },
 *     provider
 *   )
 * );
 */
export class LabelLinkProvider implements vscode.DocumentLinkProvider {
  /**
   * Provide document links for label imports.
   *
   * @param document - The document to scan for links
   * @param token - Cancellation token
   * @returns Array of document links
   */
  public provideDocumentLinks(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): vscode.DocumentLink[] {
    const links: vscode.DocumentLink[] = [];
    const pattern = /labels\s+"([^"]+)"/g;

    // Scan each line for label imports
    for (let lineNum = 0; lineNum < document.lineCount; lineNum++) {
      const line = document.lineAt(lineNum);
      const text = line.text;

      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const relativePath = match[1];

        // Calculate the range of the quoted path (without quotes)
        const startChar = match.index + match[0].indexOf('"') + 1; // +1 to skip opening quote
        const endChar = startChar + relativePath.length;

        const range = new vscode.Range(
          lineNum,
          startChar,
          lineNum,
          endChar
        );

        // Resolve the path to absolute URI
        const fileUri = this.resolveRelativePath(document.uri, relativePath);
        if (fileUri) {
          // Create a command URI to open with Label Editor
          // Uses our custom command registered in main.ts
          const commandUri = vscode.Uri.parse(
            `command:eligian.openLabelFile?${encodeURIComponent(JSON.stringify([fileUri.toString()]))}`
          );

          const link = new vscode.DocumentLink(range, commandUri);
          link.tooltip = 'Open in Label Editor';
          links.push(link);
        }
      }
    }

    return links;
  }

  /**
   * Resolve relative path to absolute URI.
   *
   * @param documentUri - The URI of the document containing the import
   * @param relativePath - The relative path from the import statement
   * @returns The resolved absolute URI, or null if resolution fails
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
