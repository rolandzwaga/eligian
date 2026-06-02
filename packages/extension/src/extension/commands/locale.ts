/**
 * locale.ts - Command handler for "Eligian: Edit Labels"
 *
 * Purpose: Registers the `eligian.openLabelEditor` command, which opens locale
 * JSON files in the custom Locale Editor. Invoked either with an explicit file
 * URI (e.g. from label-file creation) or by resolving a `locales` import on the
 * active editor's cursor line.
 *
 * Constitution Principle I: Simplicity & Documentation
 */

import * as vscode from 'vscode';

/**
 * Register the "Edit Labels" command (Feature 036 - User Story 1).
 * Opens locale JSON files in the custom Locale Editor.
 *
 * @returns Disposable for the registered command
 */
export function registerOpenLocaleEditorCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(
    'eligian.openLabelEditor',
    async (fileUri?: vscode.Uri) => {
      // If invoked with an explicit file URI (e.g. from label-file creation),
      // open that file directly instead of inferring from the active editor.
      if (fileUri) {
        try {
          await vscode.commands.executeCommand('vscode.openWith', fileUri, 'eligian.localeEditor');
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to open locale file: ${error}`);
        }
        return;
      }

      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage('No active editor');
        return;
      }

      const document = editor.document;
      if (document.languageId !== 'eligian') {
        vscode.window.showErrorMessage('Not an Eligian file');
        return;
      }

      // Get cursor position
      const position = editor.selection.active;
      const line = document.lineAt(position).text;

      // Check if line matches locales import pattern
      const pattern = /locales\s+"([^"]+)"/;
      const match = pattern.exec(line);

      if (!match) {
        vscode.window.showErrorMessage('Cursor is not on a locales import statement');
        return;
      }

      // Extract file path
      const relativePath = match[1];

      // Resolve relative path to absolute URI
      try {
        const documentDir = vscode.Uri.joinPath(document.uri, '..');
        const labelFileUri = vscode.Uri.joinPath(documentDir, relativePath);

        // Open with custom editor
        await vscode.commands.executeCommand(
          'vscode.openWith',
          labelFileUri,
          'eligian.localeEditor'
        );
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to open locale file: ${error}`);
      }
    }
  );
}
