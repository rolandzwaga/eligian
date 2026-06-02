import * as path from 'node:path';
import {
  CSS_IMPORTS_DISCOVERED_NOTIFICATION,
  type CSSImportsDiscoveredParams,
  HTML_IMPORTS_DISCOVERED_NOTIFICATION,
  type HTMLImportsDiscoveredParams,
  LABELS_IMPORTS_DISCOVERED_NOTIFICATION,
  type LabelsImportsDiscoveredParams,
} from '@eligian/language';
import * as vscode from 'vscode';
import type { LanguageClientOptions, ServerOptions } from 'vscode-languageclient/node.js';
import { LanguageClient, TransportKind } from 'vscode-languageclient/node.js';
import { disposeCompilerOutputChannel, registerCompileCommand } from './commands/compile.js';
import { registerGenerateJSDocCommand, registerJSDocAutoCompletion } from './commands/jsdoc.js';
import { registerOpenLocaleEditorCommand } from './commands/locale.js';
import { registerPreviewCommand } from './commands/preview.js';
import { CSSWatcherManager } from './css-watcher.js';
import { BlockLabelDecorationProvider } from './decorations/block-label-decoration-provider.js';
import { disposeServices as disposeBlockLabelServices } from './decorations/block-label-detector.js';
import { HTMLWatcherManager } from './html-watcher.js';
import { createLabelEntry } from './label-entry-creator.js';
import { createLabelsFile } from './label-file-creator.js';
import { LabelsWatcherManager } from './labels-watcher.js';
import { LocaleEditorProvider } from './locale-editor/LocaleEditorProvider.js';
import { LocaleLinkProvider } from './locale-link-provider.js';
import { PreviewManager } from './preview/PreviewManager.js';
import { PreviewPanel } from './preview/PreviewPanel.js';

let client: LanguageClient;
// T023: Shared CSS watcher for validation hot-reload (Feature 013 - User Story 3)
// This watcher is independent of preview panels and exists for the lifetime of the extension
let validationCSSWatcher: CSSWatcherManager | null = null;
// Shared labels watcher for validation hot-reload (labels file hot-reload feature)
// This watcher sends LSP notifications when labels JSON files change, triggering re-validation
let validationLabelsWatcher: LabelsWatcherManager | null = null;
// Shared HTML watcher for validation hot-reload (layout file hot-reload feature)
// This watcher sends LSP notifications when HTML files change, triggering re-validation
let validationHTMLWatcher: HTMLWatcherManager | null = null;
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

  // Initialize shared labels watcher for validation hot-reload (labels file hot-reload feature)
  // This watcher sends LSP notifications when labels JSON files change, triggering re-validation
  // It's separate from the label editor watcher and exists for the extension lifetime
  validationLabelsWatcher = new LabelsWatcherManager(() => {
    // No-op callback - validation is handled via LSP notifications, not callbacks
  }, client);
  context.subscriptions.push({
    dispose: () => validationLabelsWatcher?.dispose(),
  });

  // Register handler for labels imports discovered notification
  // The language server sends this notification when a document's labels import is discovered.
  // We register this import with the validationLabelsWatcher so it knows which documents to
  // re-validate when a labels file changes.
  client.onNotification(
    LABELS_IMPORTS_DISCOVERED_NOTIFICATION,
    (params: LabelsImportsDiscoveredParams) => {
      validationLabelsWatcher?.registerImport(params.documentUri, params.labelsFileUri);
    }
  );

  // Initialize shared HTML watcher for validation hot-reload (layout file hot-reload feature)
  // This watcher sends LSP notifications when HTML files change, triggering re-validation
  // It's separate from preview-specific concerns and exists for the extension lifetime
  validationHTMLWatcher = new HTMLWatcherManager(() => {
    // No-op callback - validation is handled via LSP notifications, not callbacks
  }, client);
  context.subscriptions.push({
    dispose: () => validationHTMLWatcher?.dispose(),
  });

  // Register handler for HTML imports discovered notification
  // The language server sends this notification when a document's HTML import is discovered.
  // We register this import with the validationHTMLWatcher so it knows which documents to
  // re-validate when an HTML file changes.
  client.onNotification(
    HTML_IMPORTS_DISCOVERED_NOTIFICATION,
    (params: HTMLImportsDiscoveredParams) => {
      validationHTMLWatcher?.registerImport(params.documentUri, params.htmlFileUri);
    }
  );

  // Initialize diagnostics collection for preview errors
  const diagnostics = PreviewPanel.initializeDiagnostics();
  context.subscriptions.push(diagnostics);

  // T016: Register custom editor provider for locale JSON files (Feature 036 - User Story 1)
  const localeEditorProvider = new LocaleEditorProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider('eligian.localeEditor', localeEditorProvider, {
      webviewOptions: {
        retainContextWhenHidden: true,
      },
    })
  );

  // T017: Register document link provider for locale imports (Feature 036 - User Story 1)
  // Uses DocumentLinkProvider instead of DefinitionProvider to avoid opening on hover
  const linkProvider = new LocaleLinkProvider();
  context.subscriptions.push(
    vscode.languages.registerDocumentLinkProvider({ language: 'eligian' }, linkProvider)
  );

  // Register command to open locale files in Locale Editor (used by DocumentLinkProvider)
  context.subscriptions.push(
    vscode.commands.registerCommand('eligian.openLocaleFile', (fileUriString: string) => {
      const fileUri = vscode.Uri.parse(fileUriString);
      vscode.commands.executeCommand('vscode.openWith', fileUri, 'eligian.localeEditor');
    })
  );

  // Register compile command
  context.subscriptions.push(registerCompileCommand());

  // Register JSDoc generation command
  context.subscriptions.push(registerGenerateJSDocCommand(client));

  // Register JSDoc auto-completion on /** typing
  context.subscriptions.push(registerJSDocAutoCompletion());

  // Register preview command
  context.subscriptions.push(registerPreviewCommand(context));

  // B48: tear down the lazily-created PreviewManager singleton on deactivation
  // (it owns all open preview panels and an active-editor listener).
  context.subscriptions.push({ dispose: () => PreviewManager.disposeInstance() });

  // B49: dispose the shared compiler output channel if it was ever created.
  context.subscriptions.push({ dispose: () => disposeCompilerOutputChannel() });

  // Release the block-label-detector's lazily-created Langium services (pairs
  // with B47) so they do not outlive the extension host.
  context.subscriptions.push({ dispose: () => disposeBlockLabelServices() });

  // T018: Register "Edit Labels" context menu command (Feature 036 - User Story 1)
  context.subscriptions.push(registerOpenLocaleEditorCommand());

  // Feature 039 - T011: Register "Create Labels File" command
  context.subscriptions.push(
    vscode.commands.registerCommand('eligian.createLabelsFile', async args => {
      const result = await createLabelsFile(args);
      if (!result.success && result.error) {
        vscode.window.showErrorMessage(result.error.message);
      }
    })
  );

  // Feature 041 - T023: Register "Create Label Entry" command
  context.subscriptions.push(
    vscode.commands.registerCommand('eligian.createLabelEntry', async args => {
      await createLabelEntry(args);
      // Note: createLabelEntry handles its own success/error messages
    })
  );

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
