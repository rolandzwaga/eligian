/**
 * jsdoc.ts - JSDoc generation command + auto-completion handler
 *
 * Purpose: Registers the `eligian.generateJSDoc` command (which requests a
 * JSDoc template from the language server) and the editor-change handler that
 * auto-triggers it when the user types the second `*` of a `/**` block.
 *
 * Constitution Principle I: Simplicity & Documentation
 */

import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node.js';

/**
 * Register the JSDoc generation command.
 * This command is called AFTER the JSDoc completion is inserted.
 *
 * @param client - The language client used to request generation from the server
 * @returns Disposable for the registered command
 */
export function registerGenerateJSDocCommand(client: LanguageClient): vscode.Disposable {
  return vscode.commands.registerCommand('eligian.generateJSDoc', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    const document = editor.document;
    if (document.languageId !== 'eligian') {
      return;
    }

    // Get current cursor position (should be inside /** */ after Step 1)
    const position = editor.selection.active;

    // Request JSDoc generation from language server
    const params = {
      textDocument: { uri: document.uri.toString() },
      position: { line: position.line, character: position.character },
    };

    try {
      const jsdocContent = await client.sendRequest('eligian/generateJSDoc', params);

      if (jsdocContent && typeof jsdocContent === 'string') {
        // Replace the placeholder ${1} with the JSDoc content
        await editor.edit((editBuilder: vscode.TextEditorEdit) => {
          // Find the /** */ block and replace the content between
          const line = document.lineAt(position.line);
          const lineText = line.text;

          // Find /** and */ positions
          const jsdocStart = lineText.indexOf('/**');
          const jsdocEnd = lineText.indexOf('*/');

          if (jsdocStart !== -1 && jsdocEnd !== -1) {
            // Replace the content between /** and */
            const startPos = new vscode.Position(position.line, jsdocStart + 3);
            const endPos = new vscode.Position(position.line, jsdocEnd);
            editBuilder.replace(new vscode.Range(startPos, endPos), `\n${jsdocContent}\n `);
          }
        });
      }
    } catch (_error) {
      // Silently fail - no JSDoc generation available
    }
  });
}

/**
 * Register JSDoc auto-completion on slash-star-star typing.
 * Automatically inserts the closing delimiter and triggers JSDoc generation.
 *
 * @returns Disposable for the registered text-document change handler
 */
export function registerJSDocAutoCompletion(): vscode.Disposable {
  return vscode.workspace.onDidChangeTextDocument(async (event: vscode.TextDocumentChangeEvent) => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || event.document !== editor.document) {
      return;
    }

    // Only process eligian files
    if (event.document.languageId !== 'eligian') {
      return;
    }

    // Only process single character changes (user typing)
    if (event.contentChanges.length !== 1) {
      return;
    }

    const change = event.contentChanges[0];
    const text = change.text;

    // Check if user just typed the second *
    if (text === '*') {
      const position = new vscode.Position(change.range.end.line, change.range.end.character + 1);

      const document = event.document;

      // Get text before cursor (including the just-typed *)
      const textBeforeCursor = document.getText(
        new vscode.Range(new vscode.Position(0, 0), position)
      );

      // Check if it ends with /**
      if (textBeforeCursor.trimEnd().endsWith('/**')) {
        // Insert the closing */ and position cursor
        await editor.edit(
          (editBuilder: vscode.TextEditorEdit) => {
            editBuilder.insert(position, ' */');
          },
          { undoStopBefore: false, undoStopAfter: false }
        );

        // Move cursor to between /** and */
        const newPosition = position.translate(0, 1);
        editor.selection = new vscode.Selection(newPosition, newPosition);

        // Trigger JSDoc generation command
        await vscode.commands.executeCommand('eligian.generateJSDoc');
      }
    }
  });
}
