/**
 * preview.ts - Command handler for "Eligian: Preview Timeline"
 *
 * Purpose: Registers and handles the preview command invocation.
 * Validates that an .eligian file is active before showing preview.
 *
 * Constitution Principle I: Simplicity & Documentation
 */

import * as vscode from 'vscode';
import { PreviewManager } from '../preview/PreviewManager.js';

/**
 * Register the preview command.
 *
 * @param context - VS Code extension context
 * @returns Disposable for the registered command
 *
 * @example
 * export function activate(context: vscode.ExtensionContext) {
 *   context.subscriptions.push(registerPreviewCommand(context));
 * }
 */
export function registerPreviewCommand(context: vscode.ExtensionContext): vscode.Disposable {
  return vscode.commands.registerCommand('eligian.preview', () => {
    const editor = vscode.window.activeTextEditor;

    // Validate that an editor is active
    if (!editor) {
      vscode.window.showErrorMessage('No active editor. Please open an .eligian file to preview.');
      return;
    }

    // Validate that the file is an .eligian file
    if (editor.document.languageId !== 'eligian') {
      vscode.window.showErrorMessage(
        'Please open an .eligian file to preview. Current file is not an Eligian document.'
      );
      return;
    }

    // Show preview
    const manager = PreviewManager.getInstance(context);
    manager.showPreview(editor.document.uri);
  });
}
