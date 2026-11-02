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
  return vscode.commands.registerCommand('eligian.openLabelEditor', openLocaleEditor);
}

/**
 * Whether a URI passed to the command is a locale JSON file.
 *
 * The editor context menu invokes commands with the URI of the editor's own
 * document (the .eligian file), which must not be opened in the locale editor;
 * only genuine locale files qualify as an explicit target.
 */
export function isLocaleFileUri(uri: vscode.Uri): boolean {
  return uri.path.toLowerCase().endsWith('.json');
}

/**
 * Command handler for `eligian.openLabelEditor`.
 *
 * @param fileUri - Optional explicit locale file (e.g. from label-file creation).
 *   Ignored unless it is a .json file, so the context-menu call (which passes the
 *   .eligian document URI) falls through to resolving the `locales` import on the
 *   cursor line.
 */
export async function openLocaleEditor(fileUri?: vscode.Uri): Promise<void> {
  if (fileUri && isLocaleFileUri(fileUri)) {
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
    await vscode.commands.executeCommand('vscode.openWith', labelFileUri, 'eligian.localeEditor');
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to open locale file: ${error}`);
  }
}
