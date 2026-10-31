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

          // Find the /** at or before the cursor and the first */ that closes it
          // (not one belonging to an earlier comment on the same line)
          const jsdocStart = lineText.lastIndexOf('/**', position.character);
          const jsdocEnd = jsdocStart === -1 ? -1 : lineText.indexOf('*/', jsdocStart + 3);

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
 * Whether the text before a just-typed doc-comment opener leaves the cursor inside a
 * string literal or a line comment.
 */
function isInsideStringOrLineComment(prefix: string): boolean {
  let quote: string | null = null;
  for (let i = 0; i < prefix.length; i++) {
    const ch = prefix[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '/' && prefix[i + 1] === '/') {
      return true;
    }
  }
  return quote !== null;
}

/**
 * Decide whether typing the second asterisk should auto-insert the closing delimiter.
 *
 * Only a fresh, unterminated doc-comment opener qualifies: the line must end (at the
 * cursor) with the opener, the opener must not sit in a string or after a line
 * comment marker, and the comment must not already be closed (a closing delimiter on
 * the rest of the line, or one in the rest of the document that comes before the
 * next block-comment opener).
 *
 * @param lineText - Full text of the line containing the cursor
 * @param character - Cursor column (just after the typed asterisk)
 * @param restOfDocument - Document text after the cursor
 */
export function shouldAutoCloseJSDoc(
  lineText: string,
  character: number,
  restOfDocument: string
): boolean {
  const before = lineText.slice(0, character);
  if (!before.endsWith('/**')) return false;
  if (isInsideStringOrLineComment(before.slice(0, -3))) return false;

  // Already closed on this line (e.g. turning a one-line block comment into a doc comment)
  if (lineText.slice(character).includes('*/')) return false;

  // Already closed further down: a closer that precedes the next opener belongs to this comment
  const close = restOfDocument.indexOf('*/');
  if (close !== -1) {
    const nextOpen = restOfDocument.indexOf('/*');
    if (nextOpen === -1 || close < nextOpen) return false;
  }

  return true;
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
      // The typed character sits at the start of the change range (the range may be a replaced selection)
      const position = new vscode.Position(
        change.range.start.line,
        change.range.start.character + 1
      );

      const document = event.document;

      const lineText = document.lineAt(position.line).text;
      const restOfDocument = document.getText().slice(document.offsetAt(position));

      // Only a fresh, unterminated /** opener gets a closing delimiter
      if (shouldAutoCloseJSDoc(lineText, position.character, restOfDocument)) {
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
