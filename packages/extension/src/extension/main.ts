import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { compile, formatErrors } from '@eligian/language';
import { Effect } from 'effect';
import type * as vscode from 'vscode';
import type { LanguageClientOptions, ServerOptions } from 'vscode-languageclient/node.js';
import { LanguageClient, TransportKind } from 'vscode-languageclient/node.js';
import { registerPreviewCommand } from './commands/preview.js';
import { PreviewPanel } from './preview/PreviewPanel.js';

let client: LanguageClient;

// This function is called when the extension is activated.
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  client = await startLanguageClient(context);

  // Initialize diagnostics collection for preview errors
  const diagnostics = PreviewPanel.initializeDiagnostics();
  context.subscriptions.push(diagnostics);

  // Register compile command
  context.subscriptions.push(registerCompileCommand());

  // Register preview command
  context.subscriptions.push(registerPreviewCommand(context));
}

// This function is called when the extension is deactivated.
export function deactivate(): Thenable<void> | undefined {
  // Clean up diagnostics
  PreviewPanel.disposeDiagnostics();

  if (client) {
    return client.stop();
  }
  return undefined;
}

async function startLanguageClient(context: vscode.ExtensionContext): Promise<LanguageClient> {
  const serverModule = context.asAbsolutePath(path.join('out', 'language', 'main.cjs'));
  // The debug options for the server
  // --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging.
  // By setting `process.env.DEBUG_BREAK` to a truthy value, the language server will wait until a debugger is attached.
  const debugOptions = {
    execArgv: [
      '--nolazy',
      `--inspect${process.env.DEBUG_BREAK ? '-brk' : ''}=${process.env.DEBUG_SOCKET || '6009'}`,
    ],
  };

  // If the extension is launched in debug mode then the debug server options are used
  // Otherwise the run options are used
  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions },
  };

  // Options to control the language client
  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: '*', language: 'eligian' }],
  };

  // Create the language client and start the client.
  const client = new LanguageClient('eligian', 'Eligian', serverOptions, clientOptions);

  // Start the client. This will also launch the server
  await client.start();
  return client;
}

/**
 * Register the compile command
 */
function registerCompileCommand(): any {
  // Dynamic import vscode to avoid TypeScript issues
  const vscode = require('vscode');

  return vscode.commands.registerCommand('eligian.compile', async () => {
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

    // Show compilation in progress
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Compiling Eligian file...',
        cancellable: false,
      },
      async (_progress: vscode.Progress<{ message?: string; increment?: number }>) => {
        try {
          const sourceCode = document.getText();
          const sourceUri = document.uri;

          // Compile the document
          const compileEffect = compile(sourceCode, {
            optimize: true,
            minify: false,
          });

          const result = await Effect.runPromise(compileEffect).catch(error => {
            // Handle compilation errors
            const formatted = formatErrors([error], sourceCode);

            // Show errors in output channel
            const outputChannel = vscode.window.createOutputChannel('Eligian Compiler');
            outputChannel.clear();
            outputChannel.appendLine('Compilation failed:\n');

            for (const err of formatted) {
              outputChannel.appendLine(err.message);

              if (err.codeSnippet) {
                outputChannel.appendLine(`\n${err.codeSnippet}`);
              }

              if (err.hint) {
                outputChannel.appendLine(`\n💡 ${err.hint}`);
              }

              outputChannel.appendLine(''); // blank line
            }

            outputChannel.show();
            throw new Error('Compilation failed');
          });

          // Generate output JSON
          const outputJson = JSON.stringify(result, null, 2);

          // Determine output file path
          const inputPath = sourceUri.fsPath;
          const outputPath = inputPath.replace(/\.eligian$/, '.json');

          // Write output file
          await fs.writeFile(outputPath, outputJson, 'utf-8');

          vscode.window.showInformationMessage(`✓ Compiled to ${path.basename(outputPath)}`);

          // Open the output file
          const outputUri = vscode.Uri.file(outputPath);
          const outputDoc = await vscode.workspace.openTextDocument(outputUri);
          await vscode.window.showTextDocument(outputDoc, {
            preview: false,
            viewColumn: vscode.ViewColumn.Beside,
          });
        } catch (error) {
          if (error instanceof Error && error.message !== 'Compilation failed') {
            vscode.window.showErrorMessage(`Compilation error: ${error.message}`);
          }
        }
      }
    );
  });
}
