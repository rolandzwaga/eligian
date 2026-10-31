/**
 * Regression: the locale file watcher fires for the editor's own saves; it must not
 * show "modified externally" or reload the webview for them.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const showInformationMessage = vi.fn();
const applyEdit = vi.fn().mockResolvedValue(true);
let watcherCallback: (() => void) | undefined;

vi.mock('vscode', () => ({
  Uri: {
    file: (path: string) => ({ scheme: 'file', path, fsPath: path }),
    joinPath: (base: { path: string }, ...parts: string[]) => ({
      scheme: 'file',
      path: [base.path, ...parts].join('/'),
      fsPath: [base.path, ...parts].join('/'),
    }),
  },
  Range: class {},
  WorkspaceEdit: class {
    replace() {}
  },
  workspace: {
    applyEdit: (...a: unknown[]) => applyEdit(...a),
    onDidChangeTextDocument: () => ({ dispose: () => {} }),
  },
  window: {
    showInformationMessage: (...a: unknown[]) => showInformationMessage(...a),
    showWarningMessage: vi.fn(),
    showErrorMessage: vi.fn(),
  },
  commands: { executeCommand: vi.fn() },
}));

vi.mock('../LocaleFileWatcher.js', () => ({
  LocaleFileWatcher: class {
    constructor(_uri: unknown, cb: () => void) {
      watcherCallback = cb;
    }
    dispose() {}
  },
}));

vi.mock('../locale-message-handler.js', () => ({ handleWebviewMessage: vi.fn() }));

import * as path from 'node:path';
import { LocaleEditorProvider } from '../LocaleEditorProvider.js';

const packageRoot = path.resolve(__dirname, '..', '..', '..', '..');

function setup(initialText: string) {
  const state = { text: initialText };
  const document = {
    uri: { toString: () => 'file:///proj/locales.json', path: '/proj/locales.json' },
    getText: () => state.text,
    lineCount: 1,
    save: vi.fn().mockResolvedValue(true),
  };
  const postMessage = vi.fn();
  const panel = {
    webview: {
      options: {},
      html: '',
      postMessage,
      onDidReceiveMessage: vi.fn(),
      asWebviewUri: (u: { path: string }) => ({ toString: () => u.path }),
      cspSource: 'csp',
    },
    onDidDispose: vi.fn(),
    dispose: vi.fn(),
  };
  const provider = new LocaleEditorProvider({
    path: packageRoot,
    fsPath: packageRoot,
    scheme: 'file',
  } as never);
  return { state, document, panel, postMessage, provider };
}

describe('LocaleEditorProvider file watcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    watcherCallback = undefined;
  });

  it('ignores watcher events caused by its own save', async () => {
    const initial = JSON.stringify({ 'en-US': { a: 'A' } }, null, 2);
    const { state, document, panel, postMessage, provider } = setup(initial);
    await provider.resolveCustomTextEditor(document as never, panel as never, {} as never);

    // Simulate the webview saving an edit: the provider writes this exact text
    const edited = JSON.stringify({ 'en-US': { a: 'B' } }, null, 2);
    (provider as unknown as { saveConfig: (d: unknown, c: unknown) => void }).saveConfig(document, {
      'en-US': { a: 'B' },
    });
    state.text = edited;

    watcherCallback?.();

    expect(postMessage).not.toHaveBeenCalled();
    expect(showInformationMessage).not.toHaveBeenCalled();
  });

  it('ignores its own save of a CRLF file (VS Code converts the inserted EOL)', async () => {
    const toCrlf = (text: string) => text.replace(/\n/g, '\r\n');
    const initial = toCrlf(JSON.stringify({ 'en-US': { a: 'A' } }, null, 2));
    const { state, document, panel, postMessage, provider } = setup(initial);
    await provider.resolveCustomTextEditor(document as never, panel as never, {} as never);

    (provider as unknown as { saveConfig: (d: unknown, c: unknown) => void }).saveConfig(document, {
      'en-US': { a: 'B' },
    });
    // The text buffer stores the LF JSON with the document's CRLF line endings
    state.text = toCrlf(JSON.stringify({ 'en-US': { a: 'B' } }, null, 2));

    watcherCallback?.();

    expect(postMessage).not.toHaveBeenCalled();
    expect(showInformationMessage).not.toHaveBeenCalled();
  });

  it('reloads and notifies when the content really changed externally', async () => {
    const initial = JSON.stringify({ 'en-US': { a: 'A' } }, null, 2);
    const { state, document, panel, postMessage, provider } = setup(initial);
    await provider.resolveCustomTextEditor(document as never, panel as never, {} as never);

    state.text = JSON.stringify({ 'en-US': { a: 'External' } }, null, 2);
    watcherCallback?.();

    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'reload' }));
    expect(showInformationMessage).toHaveBeenCalledWith(
      'Label file was modified externally. Reloaded.'
    );
  });
});
