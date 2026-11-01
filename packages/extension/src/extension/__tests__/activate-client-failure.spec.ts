/**
 * Activation resilience (audit low #50, #58)
 *
 * A language client that fails to start (missing server bundle, crash on init, port conflict)
 * must not abort activation: the commands and providers that do not need the server (compile,
 * preview, locale editor, labels commands) still have to be registered, the half-started client
 * stopped, and the user told.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  commandIds: [] as string[],
  webviewViews: [] as string[],
  commandHandlers: new Map<string, (...args: unknown[]) => unknown>(),
  showErrorMessage: vi.fn(),
  clientStart: vi.fn(),
  clientStop: vi.fn(),
  clientCtor: vi.fn(),
  onNotification: vi.fn(),
  watchers: [] as string[],
}));

const disposable = () => ({ dispose: vi.fn() });

vi.mock('vscode', () => ({
  commands: {
    registerCommand: (id: string, handler: (...args: unknown[]) => unknown) => {
      h.commandIds.push(id);
      h.commandHandlers.set(id, handler);
      return disposable();
    },
    executeCommand: vi.fn(),
  },
  window: {
    showErrorMessage: (...args: unknown[]) => h.showErrorMessage(...args),
    registerCustomEditorProvider: () => disposable(),
    onDidChangeActiveTextEditor: () => disposable(),
    registerWebviewViewProvider: (id: string) => {
      h.webviewViews.push(id);
      return disposable();
    },
    activeTextEditor: undefined,
  },
  languages: {
    registerDocumentLinkProvider: () => disposable(),
    onDidChangeDiagnostics: () => disposable(),
  },
  workspace: { onDidChangeTextDocument: () => disposable() },
  Uri: { parse: (s: string) => ({ toString: () => s }) },
}));

vi.mock('vscode-languageclient/node.js', () => ({
  TransportKind: { ipc: 1 },
  LanguageClient: class {
    constructor(...args: unknown[]) {
      h.clientCtor(...args);
    }
    start = h.clientStart;
    stop = h.clientStop;
    onNotification = h.onNotification;
    sendRequest = vi.fn();
  },
}));

vi.mock('@eligian/language', () => ({
  CSS_IMPORTS_DISCOVERED_NOTIFICATION: 'css-imports',
  HTML_IMPORTS_DISCOVERED_NOTIFICATION: 'html-imports',
  LABELS_IMPORTS_DISCOVERED_NOTIFICATION: 'labels-imports',
}));

vi.mock('../commands/compile.js', () => ({
  registerCompileCommand: () => {
    h.commandIds.push('eligian.compile');
    return disposable();
  },
  disposeCompilerOutputChannel: vi.fn(),
}));
vi.mock('../commands/jsdoc.js', () => ({
  registerGenerateJSDocCommand: () => {
    h.commandIds.push('eligian.generateJSDoc');
    return disposable();
  },
  registerJSDocAutoCompletion: () => disposable(),
}));
vi.mock('../commands/locale.js', () => ({
  registerOpenLocaleEditorCommand: () => {
    h.commandIds.push('eligian.openLocaleEditor');
    return disposable();
  },
}));
vi.mock('../commands/preview.js', () => ({
  registerPreviewCommand: () => {
    h.commandIds.push('eligian.preview');
    return disposable();
  },
  registerPreviewAtCommand: () => {
    h.commandIds.push('eligian.previewAt');
    return disposable();
  },
}));
vi.mock('../css-watcher.js', () => ({
  CSSWatcherManager: class {
    constructor() {
      h.watchers.push('css');
    }
    dispose() {}
  },
}));
vi.mock('../html-watcher.js', () => ({
  HTMLWatcherManager: class {
    constructor() {
      h.watchers.push('html');
    }
    dispose() {}
  },
}));
vi.mock('../labels-watcher.js', () => ({
  LabelsWatcherManager: class {
    constructor() {
      h.watchers.push('labels');
    }
    dispose() {}
  },
}));
vi.mock('../decorations/block-label-decoration-provider.js', () => ({
  BlockLabelDecorationProvider: class {
    dispose() {}
    updateDecorations() {}
  },
}));
vi.mock('../label-entry-creator.js', () => ({ createLabelEntry: vi.fn() }));
vi.mock('../label-file-creator.js', () => ({ createLabelsFile: vi.fn() }));
vi.mock('../locale-editor/LocaleEditorProvider.js', () => ({ LocaleEditorProvider: class {} }));
vi.mock('../locale-link-provider.js', () => ({ LocaleLinkProvider: class {} }));
vi.mock('../preview/PreviewManager.js', () => ({ PreviewManager: { disposeInstance: vi.fn() } }));
vi.mock('../preview/PreviewPanel.js', () => ({
  PreviewPanel: { initializeDiagnostics: () => disposable(), disposeDiagnostics: vi.fn() },
}));

import type * as vscode from 'vscode';
import { activate } from '../main.js';

function makeContext() {
  return {
    subscriptions: [] as Array<{ dispose(): void }>,
    extensionUri: { path: '/ext' },
    asAbsolutePath: (p: string) => `/ext/${p}`,
  } as unknown as vscode.ExtensionContext;
}

const INDEPENDENT_COMMANDS = [
  'eligian.compile',
  'eligian.preview',
  'eligian.previewAt',
  'eligian.openLocaleEditor',
  'eligian.openLocaleFile',
  'eligian.createLabelsFile',
  'eligian.createLabelEntry',
];

describe('activate', () => {
  beforeEach(() => {
    h.commandIds.length = 0;
    h.commandHandlers.clear();
    h.webviewViews.length = 0;
    h.watchers.length = 0;
    h.showErrorMessage.mockReset();
    h.clientStart.mockReset();
    h.clientStop.mockReset();
    h.clientStop.mockResolvedValue(undefined);
    h.onNotification.mockReset();
  });

  it('registers every feature, including the client-dependent ones, when the client starts', async () => {
    h.clientStart.mockResolvedValue(undefined);

    await activate(makeContext());

    for (const id of INDEPENDENT_COMMANDS) {
      expect(h.commandIds).toContain(id);
    }
    expect(h.commandIds).toContain('eligian.generateJSDoc');
    // Idea #20: the timeline view needs the language server
    expect(h.webviewViews).toEqual(['eligian.timelineView']);
    expect(h.commandIds).toContain('eligian.showTimelineView');
    expect(h.watchers.sort()).toEqual(['css', 'html', 'labels']);
    expect(h.onNotification).toHaveBeenCalledTimes(3);
    expect(h.showErrorMessage).not.toHaveBeenCalled();
  });

  it('still registers the client-independent commands when the client fails to start', async () => {
    h.clientStart.mockRejectedValue(new Error('Cannot find module out/language/main.cjs'));

    await expect(activate(makeContext())).resolves.toBeUndefined();

    for (const id of INDEPENDENT_COMMANDS) {
      expect(h.commandIds).toContain(id);
    }
  });

  it('stops the half-started client and tells the user', async () => {
    h.clientStart.mockRejectedValue(new Error('server crashed'));

    await activate(makeContext());

    expect(h.clientStop).toHaveBeenCalledTimes(1);
    expect(h.showErrorMessage).toHaveBeenCalledTimes(1);
    expect(String(h.showErrorMessage.mock.calls[0][0])).toContain('server crashed');
  });

  it('skips the watchers and notification handlers that need the client', async () => {
    h.clientStart.mockRejectedValue(new Error('boom'));

    await activate(makeContext());

    expect(h.watchers).toEqual([]);
    expect(h.onNotification).not.toHaveBeenCalled();
  });

  it('keeps eligian.generateJSDoc registered as a command that explains the failure', async () => {
    h.clientStart.mockRejectedValue(new Error('boom'));

    await activate(makeContext());
    h.showErrorMessage.mockClear();

    expect(h.commandIds).toContain('eligian.generateJSDoc');
    h.commandHandlers.get('eligian.generateJSDoc')?.();
    expect(String(h.showErrorMessage.mock.calls[0][0])).toContain('language server');
  });

  it('survives a client.stop() that itself fails after a failed start', async () => {
    h.clientStart.mockRejectedValue(new Error('boom'));
    h.clientStop.mockRejectedValue(new Error('Client is not running'));

    await expect(activate(makeContext())).resolves.toBeUndefined();
    for (const id of INDEPENDENT_COMMANDS) {
      expect(h.commandIds).toContain(id);
    }
  });
});
