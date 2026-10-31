/**
 * Regression (#61): when the document stops being valid JSON (e.g. a half-typed edit in a
 * side-by-side text editor) the cached config must be dropped, no bogus legacy reload may
 * be posted, and webview edits must be refused instead of overwriting the document with
 * the stale cached config.
 */

import type { ILocalesConfiguration } from 'eligius';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const showWarningMessage = vi.fn();
const applyEdit = vi.fn().mockResolvedValue(true);
let changeListener: ((e: unknown) => void) | undefined;

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
    replace = vi.fn();
  },
  workspace: {
    applyEdit: (...a: unknown[]) => applyEdit(...a),
    onDidChangeTextDocument: (cb: (e: unknown) => void) => {
      changeListener = cb;
      return { dispose: () => {} };
    },
  },
  window: {
    showInformationMessage: vi.fn(),
    showWarningMessage: (...a: unknown[]) => showWarningMessage(...a),
    showErrorMessage: vi.fn(),
  },
  commands: { executeCommand: vi.fn() },
}));

vi.mock('../LocaleFileWatcher.js', () => ({
  LocaleFileWatcher: class {
    dispose() {}
  },
}));

import * as path from 'node:path';
import { LocaleEditorProvider } from '../LocaleEditorProvider.js';
import { handleWebviewMessage, type LocaleMessageDeps } from '../locale-message-handler.js';

const packageRoot = path.resolve(__dirname, '..', '..', '..', '..');
const VALID = JSON.stringify({ 'en-US': { a: 'A' } }, null, 2);
const INVALID = '{ "en-US": { "a": "A" } ';

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
  const documentConfigs = (
    provider as unknown as { documentConfigs: Map<string, ILocalesConfiguration> }
  ).documentConfigs;
  const deps = {
    documentConfigs,
    saveConfig: vi.fn(),
    applyWebviewEdit: vi.fn(),
    trySaveDocument: vi.fn(),
    tryShowWarning: vi.fn(),
    checkLabelUsage: vi.fn(),
  } satisfies LocaleMessageDeps;
  const send = (message: Parameters<typeof handleWebviewMessage>[0]) =>
    handleWebviewMessage(message, document as never, panel as never, deps);
  return { state, document, panel, postMessage, provider, deps, send };
}

/** Simulate a text change that the provider treats as external. */
function externalChange(document: unknown) {
  changeListener?.({ document, contentChanges: [{}] });
}

describe('invalid JSON in the document', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    changeListener = undefined;
  });

  it('drops the cached config and posts no bogus legacy reload', async () => {
    const { state, document, panel, postMessage, provider, deps, send } = setup(VALID);
    await provider.resolveCustomTextEditor(document as never, panel as never, {} as never);
    await send({ type: 'ready' });
    expect(deps.documentConfigs.size).toBe(1);
    postMessage.mockClear();

    state.text = INVALID;
    externalChange(document);

    expect(deps.documentConfigs.size).toBe(0);
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('still posts a legacy reload for a genuine legacy array file', async () => {
    const { state, document, panel, postMessage, provider } = setup(VALID);
    await provider.resolveCustomTextEditor(document as never, panel as never, {} as never);
    postMessage.mockClear();

    state.text = '[]';
    externalChange(document);

    expect(postMessage).toHaveBeenCalledWith({ type: 'reload', labels: [] });
  });

  it('refuses webview edits instead of overwriting the document with stale state', async () => {
    const { state, document, panel, provider, deps, send } = setup(VALID);
    await provider.resolveCustomTextEditor(document as never, panel as never, {} as never);
    await send({ type: 'ready' });
    expect(deps.documentConfigs.size).toBe(1);

    state.text = INVALID;
    externalChange(document);

    await send({ type: 'update-translation', key: 'a', locale: 'en-US', value: 'B' });
    await send({ type: 'add-key', parentKey: '', newSegment: 'b' });
    await send({ type: 'delete-key', key: 'a' });

    expect(deps.saveConfig).not.toHaveBeenCalled();
    expect(showWarningMessage).toHaveBeenCalledTimes(3);
    expect(showWarningMessage.mock.calls[0][0]).toMatch(/invalid JSON/);
  });

  it('does not keep a stale config when "ready" arrives for an invalid document', async () => {
    const { state, document, panel, provider, deps, send } = setup(VALID);
    await provider.resolveCustomTextEditor(document as never, panel as never, {} as never);
    await send({ type: 'ready' });
    expect(deps.documentConfigs.size).toBe(1);

    state.text = INVALID;
    await send({ type: 'ready' });

    expect(deps.documentConfigs.size).toBe(0);
  });

  it('edits resume once the document is valid again', async () => {
    const { state, document, panel, provider, deps, send } = setup(VALID);
    await provider.resolveCustomTextEditor(document as never, panel as never, {} as never);

    state.text = INVALID;
    externalChange(document);
    state.text = VALID;
    externalChange(document);

    await send({ type: 'update-translation', key: 'a', locale: 'en-US', value: 'B' });
    expect(deps.saveConfig).toHaveBeenCalledTimes(1);
  });
});

describe('reserved key segments in the message handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('refuses an add-key whose parent key is __proto__', async () => {
    const config = { 'en-US': { a: 'A' } } as unknown as ILocalesConfiguration;
    const deps = {
      documentConfigs: new Map([['file:///x.json', config]]),
      saveConfig: vi.fn(),
      applyWebviewEdit: vi.fn(),
      trySaveDocument: vi.fn(),
      tryShowWarning: vi.fn(),
      checkLabelUsage: vi.fn(),
    } satisfies LocaleMessageDeps;
    const document = { uri: { toString: () => 'file:///x.json' }, getText: () => '{}' };

    await handleWebviewMessage(
      { type: 'add-key', parentKey: '__proto__', newSegment: 'polluted' },
      document as never,
      {} as never,
      deps
    );

    expect(deps.saveConfig).not.toHaveBeenCalled();
    expect(showWarningMessage).toHaveBeenCalledWith(expect.stringMatching(/reserved name/));
    expect(Object.getOwnPropertyDescriptor(Object.prototype, 'polluted') !== undefined).toBe(false);
  });
});
