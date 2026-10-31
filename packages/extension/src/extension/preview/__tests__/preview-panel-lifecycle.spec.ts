/**
 * PreviewPanel regression tests (2026-10-22 audit, medium findings):
 *
 * - #44 localResourceRoots omitted the document directory (loose files, no
 *   workspace) and any directory outside the workspace that media or CSS url()
 *   assets live in, so the webview silently refused to load them.
 * - #47 CSS removed from the .eligian source stayed injected in the preview
 *   (removeCSS had no caller) and stayed watched for hot-reload.
 * - #49 Overlapping compiles applied results out of order: an older compile
 *   that finished last overwrote the newer config.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

interface MockUri {
  scheme: string;
  fsPath: string;
  path: string;
  toString(): string;
}

interface CompileResult {
  success: boolean;
  config: Record<string, unknown> | null;
  errors: Array<{ message: string; severity: 'error' | 'warning' }>;
  timestamp: number;
}

interface PendingCompile {
  resolve(result: CompileResult): void;
}

type PanelEvent =
  | { kind: 'message'; message: { type: string; payload?: any } }
  | { kind: 'options'; roots: string[] };

interface MockWebview {
  options: { localResourceRoots?: MockUri[] };
  events: PanelEvent[];
  messages(): Array<{ type: string; payload?: any }>;
}

const h = vi.hoisted(() => ({
  workspaceFolders: undefined as undefined | Array<{ uri: { fsPath: string } }>,
  webviews: [] as MockWebview[],
  pendingCompiles: [] as PendingCompile[],
  watcherChangeHandlers: [] as Array<(uri: { fsPath: string }) => void>,
}));

vi.mock('vscode', async () => {
  const nodePath = await import('node:path');

  const file = (p: string): MockUri => ({
    scheme: 'file',
    fsPath: p,
    path: p,
    toString: () => `file:///${p.replace(/\\/g, '/')}`,
  });

  const createWebviewPanel = (
    _viewType: string,
    _title: string,
    _column: number,
    initialOptions: { localResourceRoots?: MockUri[] }
  ) => {
    const events: PanelEvent[] = [];
    let options = initialOptions;
    const webview = {
      html: '',
      cspSource: 'vscode-resource:',
      events,
      get options() {
        return options;
      },
      set options(next: { localResourceRoots?: MockUri[] }) {
        options = next;
        events.push({
          kind: 'options',
          roots: (next.localResourceRoots ?? []).map(uri => uri.fsPath),
        });
      },
      messages: () =>
        events
          .filter((e): e is Extract<PanelEvent, { kind: 'message' }> => e.kind === 'message')
          .map(e => e.message),
      asWebviewUri: (uri: MockUri): MockUri => ({
        scheme: 'vscode-webview',
        fsPath: uri.fsPath,
        path: uri.fsPath,
        toString: () => `vscode-webview://test/${encodeURIComponent(uri.fsPath)}`,
      }),
      postMessage: async (message: { type: string }) => {
        events.push({ kind: 'message', message });
        return true;
      },
      onDidReceiveMessage: () => ({ dispose: () => {} }),
    };
    h.webviews.push(webview);
    const disposeCallbacks: Array<() => void> = [];
    return {
      webview,
      onDidDispose: (cb: () => void) => {
        disposeCallbacks.push(cb);
        return { dispose: () => {} };
      },
      reveal: () => {},
      dispose: () => {
        for (const cb of disposeCallbacks) cb();
      },
    };
  };

  return {
    Uri: {
      file,
      joinPath: (base: MockUri, ...parts: string[]) => file(nodePath.join(base.fsPath, ...parts)),
    },
    ViewColumn: { Beside: 2 },
    RelativePattern: class {
      constructor(
        public base: string,
        public pattern: string
      ) {}
    },
    window: {
      createWebviewPanel,
      showWarningMessage: () => Promise.resolve(undefined),
      showErrorMessage: () => Promise.resolve(undefined),
    },
    workspace: {
      get workspaceFolders() {
        return h.workspaceFolders;
      },
      getWorkspaceFolder: () => undefined,
      createFileSystemWatcher: () => ({
        onDidCreate: () => ({ dispose: () => {} }),
        onDidChange: (handler: (uri: { fsPath: string }) => void) => {
          h.watcherChangeHandlers.push(handler);
          return { dispose: () => {} };
        },
        onDidDelete: () => ({ dispose: () => {} }),
        dispose: () => {},
      }),
    },
    languages: {
      createDiagnosticCollection: () => ({ set: () => {}, dispose: () => {} }),
    },
    Range: class {},
    Diagnostic: class {},
    DiagnosticSeverity: { Error: 0, Warning: 1 },
  };
});

vi.mock('../CompilationService.js', () => ({
  CompilationService: class {
    compile(): Promise<CompileResult> {
      return new Promise(resolve => {
        h.pendingCompiles.push({ resolve });
      });
    }
  },
}));

vi.mock('../FileWatcher.js', () => ({
  FileWatcher: class {
    watch(): void {}
    dispose(): void {}
  },
}));

import * as vscode from 'vscode';
import { generateCSSId } from '../../css-loader.js';
import { PreviewPanel } from '../PreviewPanel.js';
import { isPathWithin } from '../resource-roots.js';

// Package root: the panel reads src/extension/preview/templates/preview.html from it
const extensionRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

let tmp: string;
let projectDir: string;
let documentPath: string;
let panel: PreviewPanel | undefined;

function okResult(config: Record<string, unknown>): CompileResult {
  return { success: true, config, errors: [], timestamp: Date.now() };
}

function openPanel(): MockWebview {
  panel = new PreviewPanel(
    vscode.Uri.file(documentPath) as unknown as vscode.Uri,
    vscode.Uri.file(extensionRoot) as unknown as vscode.Uri
  );
  return h.webviews[h.webviews.length - 1];
}

/** Resolve the n-th compile request (0-based) and wait until `isDone` holds. */
async function finishCompile(
  webview: MockWebview,
  index: number,
  result: CompileResult,
  isDone: (webview: MockWebview) => boolean
): Promise<void> {
  await vi.waitFor(() => expect(h.pendingCompiles.length).toBeGreaterThan(index));
  h.pendingCompiles[index].resolve(result);
  await vi.waitFor(() => expect(isDone(webview)).toBe(true));
}

function rootsOf(webview: MockWebview): string[] {
  return (webview.options.localResourceRoots ?? []).map(uri => uri.fsPath);
}

function covered(roots: readonly string[], filePath: string): boolean {
  return roots.some(root => isPathWithin(filePath, root));
}

function cssLoadIds(webview: MockWebview): string[] {
  return webview
    .messages()
    .filter(m => m.type === 'css-load')
    .map(m => m.payload.cssId);
}

function cssRemoveIds(webview: MockWebview): string[] {
  return webview
    .messages()
    .filter(m => m.type === 'css-remove')
    .map(m => m.payload.cssId);
}

function initializeCount(webview: MockWebview): number {
  return webview.messages().filter(m => m.type === 'initialize').length;
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-preview-'));
  projectDir = path.join(tmp, 'project');
  fs.mkdirSync(projectDir, { recursive: true });
  documentPath = path.join(projectDir, 'story.eligian');
  fs.writeFileSync(documentPath, '');
  h.workspaceFolders = undefined;
  h.webviews.length = 0;
  h.pendingCompiles.length = 0;
  h.watcherChangeHandlers.length = 0;
});

afterEach(() => {
  panel?.dispose();
  panel = undefined;
  vi.useRealTimers();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('PreviewPanel localResourceRoots (#44)', () => {
  test('includes the document directory when no workspace folder is open', () => {
    const webview = openPanel();
    const roots = rootsOf(webview);

    expect(roots).toContain(extensionRoot);
    expect(covered(roots, documentPath)).toBe(true);
  });

  test('keeps workspace folders and does not duplicate a contained document directory', () => {
    h.workspaceFolders = [{ uri: { fsPath: tmp } }];
    const webview = openPanel();

    expect(rootsOf(webview)).toEqual([extensionRoot, tmp]);
  });

  test('extends roots to cover CSS files, their url() assets and media outside the roots, before posting the config', async () => {
    h.workspaceFolders = [{ uri: { fsPath: projectDir } }];
    const sharedDir = path.join(tmp, 'shared');
    fs.mkdirSync(sharedDir);
    const cssPath = path.join(sharedDir, 'theme.css');
    fs.writeFileSync(cssPath, ".bg { background: url('../fonts/brand.woff2'); }");
    const fontPath = path.join(tmp, 'fonts', 'brand.woff2');

    const webview = openPanel();
    await finishCompile(
      webview,
      0,
      okResult({
        id: 'cfg',
        cssFiles: ['../shared/theme.css'],
        timelines: [{ source: '../../media/clip.mp4' }],
      }),
      w => cssLoadIds(w).length === 1
    );

    const optionsIndex = webview.events.findIndex(e => e.kind === 'options');
    const updateIndex = webview.events.findIndex(
      e => e.kind === 'message' && e.message.type === 'updateConfig'
    );
    expect(optionsIndex).toBeGreaterThanOrEqual(0);
    // Assigning options reloads the webview, so it must precede the config
    expect(optionsIndex).toBeLessThan(updateIndex);

    const roots = rootsOf(webview);
    expect(covered(roots, cssPath)).toBe(true);
    expect(covered(roots, fontPath)).toBe(true);

    // The url() asset is posted as a webview URI, not a file:// URL the webview refuses
    const cssLoad = webview.messages().find(m => m.type === 'css-load');
    expect(cssLoad?.payload.content).toContain('vscode-webview://test/');
    expect(cssLoad?.payload.content).not.toContain('file://');

    // Whatever local file the resolved config points at must be loadable too
    const update = webview.messages().find(m => m.type === 'updateConfig');
    const mediaUri: string = update?.payload.config.timelines[0].source;
    const mediaPath = decodeURIComponent(mediaUri.replace('vscode-webview://test/', ''));
    expect(covered(roots, mediaPath)).toBe(true);
  });

  test('does not touch webview options when everything is already covered', async () => {
    fs.writeFileSync(path.join(projectDir, 'local.css'), '.a { color: red; }');
    const webview = openPanel();
    await finishCompile(
      webview,
      0,
      okResult({ id: 'cfg', cssFiles: ['./local.css'] }),
      w => cssLoadIds(w).length === 1
    );

    expect(webview.events.some(e => e.kind === 'options')).toBe(false);
  });
});

describe('PreviewPanel CSS set follows the source (#47)', () => {
  test('removes stylesheets dropped from the source, including when none remain', async () => {
    const aPath = path.join(projectDir, 'a.css');
    const bPath = path.join(projectDir, 'b.css');
    fs.writeFileSync(aPath, '.a { color: red; }');
    fs.writeFileSync(bPath, '.b { color: blue; }');
    const aId = generateCSSId(aPath);
    const bId = generateCSSId(bPath);

    const webview = openPanel();
    await finishCompile(
      webview,
      0,
      okResult({ id: 'cfg1', cssFiles: ['./a.css', './b.css'] }),
      w => cssLoadIds(w).length === 2
    );
    expect(cssLoadIds(webview)).toEqual([aId, bId]);
    expect(cssRemoveIds(webview)).toEqual([]);

    // Recompile without b.css
    (panel as any).compileAndUpdate();
    await finishCompile(
      webview,
      1,
      okResult({ id: 'cfg2', cssFiles: ['./a.css'] }),
      w => cssLoadIds(w).length === 3
    );
    expect(cssRemoveIds(webview)).toEqual([bId]);

    // Recompile with no CSS at all
    (panel as any).compileAndUpdate();
    await finishCompile(webview, 2, okResult({ id: 'cfg3' }), w => cssRemoveIds(w).length === 2);
    expect(cssRemoveIds(webview)).toEqual([bId, aId]);
  });

  test('stops hot-reloading a stylesheet once it is no longer imported', async () => {
    const aPath = path.join(projectDir, 'a.css');
    const bPath = path.join(projectDir, 'b.css');
    fs.writeFileSync(aPath, '.a { color: red; }');
    fs.writeFileSync(bPath, '.b { color: blue; }');

    const webview = openPanel();
    await finishCompile(
      webview,
      0,
      okResult({ id: 'cfg1', cssFiles: ['./a.css', './b.css'] }),
      w => cssLoadIds(w).length === 2
    );
    (panel as any).compileAndUpdate();
    await finishCompile(
      webview,
      1,
      okResult({ id: 'cfg2', cssFiles: ['./a.css'] }),
      w => cssRemoveIds(w).length === 1
    );

    vi.useFakeTimers();
    const handlers = [...h.watcherChangeHandlers];
    for (const handler of handlers) {
      handler({ fsPath: bPath });
      handler({ fsPath: aPath });
    }
    vi.advanceTimersByTime(1000);
    vi.useRealTimers();

    // Positive control: the still-imported file hot-reloads
    await vi.waitFor(() =>
      expect(webview.messages().some(m => m.type === 'css-reload')).toBe(true)
    );
    const reloaded = webview
      .messages()
      .filter(m => m.type === 'css-reload')
      .map(m => m.payload.sourceFile);
    expect(reloaded).toContain(aPath);
    expect(reloaded).not.toContain(bPath);
  });
});

describe('PreviewPanel overlapping compiles (#49)', () => {
  test('an older compile that finishes last does not overwrite the newer config', async () => {
    const webview = openPanel();
    await vi.waitFor(() => expect(h.pendingCompiles.length).toBe(1));

    // Second compile (e.g. save or Retry) starts while the first is still running
    (panel as any).compileAndUpdate();
    await vi.waitFor(() => expect(h.pendingCompiles.length).toBe(2));

    // Newer compile finishes first
    h.pendingCompiles[1].resolve(okResult({ id: 'newer' }));
    await vi.waitFor(() => expect(initializeCount(webview)).toBe(1));

    // Older compile finishes afterwards: its results must be discarded
    h.pendingCompiles[0].resolve(okResult({ id: 'older' }));
    await new Promise(resolve => setTimeout(resolve, 20));

    const configIds = webview
      .messages()
      .filter(m => m.type === 'updateConfig' || m.type === 'initialize')
      .map(m => m.payload.config.id);
    expect(configIds).toEqual(['newer', 'newer']);
  });

  test('a stale failed compile does not replace a newer successful preview with errors', async () => {
    const webview = openPanel();
    await vi.waitFor(() => expect(h.pendingCompiles.length).toBe(1));
    (panel as any).compileAndUpdate();
    await vi.waitFor(() => expect(h.pendingCompiles.length).toBe(2));

    h.pendingCompiles[1].resolve(okResult({ id: 'newer' }));
    await vi.waitFor(() => expect(initializeCount(webview)).toBe(1));
    h.pendingCompiles[0].resolve({
      success: false,
      config: null,
      errors: [{ message: 'old error', severity: 'error' }],
      timestamp: Date.now(),
    });
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(webview.messages().some(m => m.type === 'showError')).toBe(false);
  });

  test('a compile finishing after the panel was disposed posts nothing', async () => {
    const webview = openPanel();
    await vi.waitFor(() => expect(h.pendingCompiles.length).toBe(1));
    panel?.dispose();
    const before = webview.messages().length;

    h.pendingCompiles[0].resolve(okResult({ id: 'late' }));
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(webview.messages().slice(before)).toEqual([]);
  });
});
