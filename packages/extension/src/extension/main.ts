import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  CSS_IMPORTS_DISCOVERED_NOTIFICATION,
  type CSSImportsDiscoveredParams,
  compile,
  EligianDefinitionProvider,
  formatErrors,
} from '@eligian/language';
import { Effect } from 'effect';
import type { IEngineConfiguration } from 'eligius';
import * as vscode from 'vscode';
import type { LanguageClientOptions, ServerOptions } from 'vscode-languageclient/node.js';
import { LanguageClient, TransportKind } from 'vscode-languageclient/node.js';
import { registerPreviewCommand } from './commands/preview.js';
import { CSSWatcherManager } from './css-watcher.js';
import { BlockLabelDecorationProvider } from './decorations/block-label-decoration-provider.js';
import { LabelEditorProvider } from './label-editor/LabelEditorProvider.js';
import { PreviewPanel } from './preview/PreviewPanel.js';

let client: LanguageClient;
// T023: Shared CSS watcher for validation hot-reload (Feature 013 - User Story 3)
// This watcher is independent of preview panels and exists for the lifetime of the extension
let validationCSSWatcher: CSSWatcherManager | null = null;
// Block label decoration provider for superscript start/end labels
let blockLabelProvider: BlockLabelDecorationProvider | null = null;

// This function is called when the extension is activated.
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // Start language client first
  client = await startLanguageClient(context);

  // T023: Initialize shared CSS watcher for validation hot-reload (Feature 013 - User Story 3)
  // This watcher sends LSP notifications when CSS files change, triggering re-validation
  // It's separate from preview-specific watchers and exists for the extension lifetime
  validationCSSWatcher = new CSSWatcherManager(() => {
    // No-op callback - validation is handled via LSP notifications, not callbacks
  }, client);
  context.subscriptions.push({
    dispose: () => validationCSSWatcher?.dispose(),
  });

  // T023: Register handler for CSS imports discovered notification (Feature 013 - User Story 3)
  // The language server sends this notification when a document's CSS imports are discovered.
  // We register these imports with the validationCSSWatcher so it knows which documents to
  // re-validate when a CSS file changes.
  client.onNotification(
    CSS_IMPORTS_DISCOVERED_NOTIFICATION,
    (params: CSSImportsDiscoveredParams) => {
      validationCSSWatcher?.registerImports(params.documentUri, params.cssFileUris);
    }
  );

  // Initialize diagnostics collection for preview errors
  const diagnostics = PreviewPanel.initializeDiagnostics();
  context.subscriptions.push(diagnostics);

  // T016: Register custom editor provider for label JSON files (Feature 036 - User Story 1)
  const labelEditorProvider = new LabelEditorProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider('eligian.labelEditor', labelEditorProvider, {
      webviewOptions: {
        retainContextWhenHidden: true,
      },
    })
  );

  // T017: Register definition provider for label imports (Feature 036 - User Story 1)
  const definitionProvider = new EligianDefinitionProvider();
  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider({ language: 'eligian' }, definitionProvider)
  );

  // Register compile command
  context.subscriptions.push(registerCompileCommand());

  // Register JSDoc generation command
  context.subscriptions.push(registerGenerateJSDocCommand(client));

  // Register JSDoc auto-completion on /** typing
  context.subscriptions.push(registerJSDocAutoCompletion(client));

  // Register preview command
  context.subscriptions.push(registerPreviewCommand(context));

  // T018: Register "Edit Labels" context menu command (Feature 036 - User Story 1)
  context.subscriptions.push(registerOpenLabelEditorCommand());

  // Initialize block label decoration provider
  blockLabelProvider = new BlockLabelDecorationProvider();
  context.subscriptions.push(blockLabelProvider);

  // Update decorations for active editor
  if (vscode.window.activeTextEditor) {
    blockLabelProvider.updateDecorations(vscode.window.activeTextEditor);
  }

  // Update decorations when editor changes
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor && blockLabelProvider) {
        blockLabelProvider.updateDecorations(editor);
      }
    })
  );

  // Update decorations when document changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(event => {
      const editor = vscode.window.activeTextEditor;
      if (editor && event.document === editor.document && blockLabelProvider) {
        blockLabelProvider.updateDecorations(editor);
      }
    })
  );
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
            sourceUri: sourceUri.fsPath,
          });

          let result: IEngineConfiguration | undefined;
          try {
            result = await Effect.runPromise(compileEffect);
          } catch (error) {
            // Handle compilation errors
            // Effect.runPromise wraps errors in a FiberFailure structure with nested cause
            let compilerError: any = error;

            // Unwrap Effect's FiberFailure -> Cause -> failure structure
            // Effect errors have a toJSON() method that returns the actual structure
            if (typeof compilerError.toJSON === 'function') {
              compilerError = compilerError.toJSON();
            }

            // Now unwrap the JSON structure
            if (compilerError?._id === 'FiberFailure' && compilerError.cause) {
              compilerError = compilerError.cause;
            }
            if (compilerError?._tag === 'Fail' && compilerError.failure) {
              compilerError = compilerError.failure;
            }

            const formatted = formatErrors([compilerError], sourceCode);

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
          }

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

/**
 * Register the JSDoc generation command
 * This command is called AFTER the JSDoc completion is inserted
 */
function registerGenerateJSDocCommand(client: LanguageClient): any {
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
        await editor.edit((editBuilder: any) => {
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
 * Register JSDoc auto-completion on slash-star-star typing
 * Automatically inserts closing and triggers JSDoc generation
 */
function registerJSDocAutoCompletion(_client: LanguageClient): any {
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
          (editBuilder: any) => {
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

/**
 * Register the "Edit Labels" command (T018 - Feature 036 - User Story 1)
 * Opens label JSON files in the custom Label Editor
 */
function registerOpenLabelEditorCommand(): vscode.Disposable {
  return vscode.commands.registerCommand('eligian.openLabelEditor', async () => {
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

    // TODO (T018): Implement label import detection
    // 1. Get cursor position
    // 2. Get line text at cursor
    // 3. Check if line matches: labels\s+"([^"]+)"
    // 4. Extract file path from capture group
    // 5. Resolve relative path to absolute URI
    // 6. Open with custom editor: vscode.commands.executeCommand('vscode.openWith', uri, 'eligian.labelEditor')

    vscode.window.showInformationMessage('Edit Labels command (stub - not yet implemented)');
  });
}
