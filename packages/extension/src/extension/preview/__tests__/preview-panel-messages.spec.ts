/**
 * PreviewPanel webview message handling and diagnostics (2026-10-22 audit, low findings):
 *
 * - #65 The webview's 'ready' message was a no-op, so a reloaded webview stayed
 *   on 'Loading' with no config, engine or CSS.
 * - #59 'Eligian Preview' diagnostics were never cleared when the panel closed.
 * - #68 PreviewPanel message handling had no unit tests (retry, runtimeError,
 *   engine event routing).
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
  map?: unknown;
  errors: Array<{
    message: string;
    severity: 'error' | 'warning';
    line?: number;
    column?: number;
    length?: number;
    code?: string;
  }>;
  timestamp: number;
}

const h = vi.hoisted(() => ({
  messages: [] as Array<{ type: string; payload?: any }>,
  receive: undefined as undefined | ((message: unknown) => void),
  compileResults: [] as CompileResult[],
  compileCount: 0,
  diagnostics: new Map<string, unknown[]>(),
  diagnosticDeletes: [] as string[],
  errorMessages: [] as string[],
}));

vi.mock('vscode', async () => {
  const nodePath = await import('node:path');
  const nodeFs = await import('node:fs');
  const file = (p: string): MockUri => ({
    scheme: 'file',
    fsPath: p,
    path: p,
    toString: () => `file:///${p.replace(/\\/g, '/')}`,
  });

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
      createWebviewPanel: (_v: string, _t: string, _c: number, options: unknown) => {
        const disposeCallbacks: Array<() => void> = [];
        return {
          webview: {
            html: '',
            cspSource: 'vscode-resource:',
            options,
            asWebviewUri: (uri: MockUri) => ({
              ...uri,
              scheme: 'vscode-webview',
              toString: () => `vscode-webview://test/${encodeURIComponent(uri.fsPath)}`,
            }),
            postMessage: async (message: { type: string }) => {
              h.messages.push(message);
              return true;
            },
            onDidReceiveMessage: (handler: (message: unknown) => void) => {
              h.receive = handler;
              return { dispose: () => {} };
            },
          },
          onDidDispose: (cb: () => void) => {
            disposeCallbacks.push(cb);
            return { dispose: () => {} };
          },
          reveal: () => {},
          dispose: () => {
            for (const cb of disposeCallbacks) cb();
          },
        };
      },
      showWarningMessage: () => Promise.resolve(undefined),
      showErrorMessage: (message: string) => {
        h.errorMessages.push(message);
        return Promise.resolve(undefined);
      },
    },
    workspace: {
      openTextDocument: async (uri: MockUri) => ({
        getText: () => nodeFs.readFileSync(uri.fsPath, 'utf-8'),
      }),
      workspaceFolders: undefined,
      getWorkspaceFolder: () => undefined,
      createFileSystemWatcher: () => ({
        onDidCreate: () => ({ dispose: () => {} }),
        onDidChange: () => ({ dispose: () => {} }),
        onDidDelete: () => ({ dispose: () => {} }),
        dispose: () => {},
      }),
    },
    languages: {
      createDiagnosticCollection: () => ({
        set: (uri: MockUri, diagnostics: unknown[]) => h.diagnostics.set(uri.fsPath, diagnostics),
        get: (uri: MockUri) => h.diagnostics.get(uri.fsPath),
        delete: (uri: MockUri) => {
          h.diagnosticDeletes.push(uri.fsPath);
          h.diagnostics.delete(uri.fsPath);
        },
        dispose: () => {},
      }),
    },
    Range: class {
      constructor(
        public startLine: number,
        public startCharacter: number,
        public endLine: number,
        public endCharacter: number
      ) {}
    },
    Diagnostic: class {
      code?: string;
      source?: string;
      constructor(
        public range: unknown,
        public message: string,
        public severity: number
      ) {}
    },
    DiagnosticSeverity: { Error: 0, Warning: 1 },
    Location: class {
      constructor(
        public uri: MockUri,
        public range: unknown
      ) {}
    },
    DiagnosticRelatedInformation: class {
      constructor(
        public location: { uri: MockUri; range: unknown },
        public message: string
      ) {}
    },
  };
});

vi.mock('../CompilationService.js', () => ({
  CompilationService: class {
    async compile(): Promise<CompileResult> {
      h.compileCount++;
      return (
        h.compileResults.shift() ?? {
          success: true,
          config: { id: 'default' },
          errors: [],
          timestamp: 0,
        }
      );
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
import { PreviewPanel } from '../PreviewPanel.js';

const extensionRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

let tmp: string;
let documentPath: string;
let panel: PreviewPanel | undefined;

function openPanel(): PreviewPanel {
  panel = new PreviewPanel(
    vscode.Uri.file(documentPath) as unknown as vscode.Uri,
    vscode.Uri.file(extensionRoot) as unknown as vscode.Uri
  );
  return panel;
}

const count = (type: string) => h.messages.filter(m => m.type === type).length;

function failure(message: string): CompileResult {
  return {
    success: false,
    config: null,
    errors: [{ message, severity: 'error', line: 2, column: 3, length: 4, code: 'ParseError' }],
    timestamp: 0,
  };
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-preview-msg-'));
  documentPath = path.join(tmp, 'story.eligian');
  fs.writeFileSync(documentPath, '');
  h.messages.length = 0;
  h.receive = undefined;
  h.compileResults.length = 0;
  h.compileCount = 0;
  h.diagnostics.clear();
  h.diagnosticDeletes.length = 0;
  h.errorMessages.length = 0;
  PreviewPanel.initializeDiagnostics();
});

afterEach(() => {
  panel?.dispose();
  panel = undefined;
  PreviewPanel.disposeDiagnostics();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("PreviewPanel 'ready' (#65)", () => {
  test('the first ready does not compile again; a later ready (webview reload) replays the preview', async () => {
    fs.writeFileSync(path.join(tmp, 'a.css'), '.a { color: red; }');
    h.compileResults.push(
      { success: true, config: { id: 'cfg', cssFiles: ['./a.css'] }, errors: [], timestamp: 0 },
      { success: true, config: { id: 'cfg', cssFiles: ['./a.css'] }, errors: [], timestamp: 0 }
    );
    openPanel();
    await vi.waitFor(() => expect(count('css-load')).toBe(1));

    // Initial document load
    h.receive?.({ type: 'ready' });
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(h.compileCount).toBe(1);

    // Reloaded document: config, engine and CSS must be sent again
    h.messages.length = 0;
    h.receive?.({ type: 'ready' });
    await vi.waitFor(() => expect(count('css-load')).toBe(1));
    expect(h.compileCount).toBe(2);
    expect(count('updateConfig')).toBe(1);
    expect(count('initialize')).toBe(1);
    // css-load (creates the stylesheet), not css-reload (needs an existing one)
    expect(count('css-reload')).toBe(0);
  });
});

describe('PreviewPanel webview messages (#68)', () => {
  test('retry recompiles', async () => {
    openPanel();
    await vi.waitFor(() => expect(count('initialize')).toBe(1));

    h.receive?.({ type: 'retry' });

    await vi.waitFor(() => expect(count('initialize')).toBe(2));
    expect(h.compileCount).toBe(2);
  });

  test('runtimeError shows an error notification', () => {
    openPanel();
    h.receive?.({ type: 'runtimeError', payload: { message: 'boom' } });
    expect(h.errorMessages).toEqual(['Eligian Preview Runtime Error: boom']);
  });

  test('engine events are routed to the engine service', async () => {
    const opened = openPanel();
    await vi.waitFor(() => expect(count('initialize')).toBe(1));
    const engine = (opened as any).engineService;

    h.receive?.({ type: 'initialized', payload: { success: true } });
    expect(engine.initialized).toBe(true);

    h.receive?.({ type: 'error', payload: { message: 'engine broke' } });
    expect(h.errorMessages).toEqual(['Eligian Preview: engine broke']);

    h.receive?.({ type: 'destroyed' });
    expect(engine.initialized).toBe(false);
  });

  test('unknown message types are ignored', () => {
    openPanel();
    expect(() => h.receive?.({ type: 'nonsense' })).not.toThrow();
  });
});

describe('PreviewPanel diagnostics (#59)', () => {
  test('a failed compile reports diagnostics with 0-based ranges', async () => {
    h.compileResults.push(failure('Unexpected token'));
    openPanel();
    await vi.waitFor(() => expect(count('showError')).toBe(1));

    const diagnostics = h.diagnostics.get(documentPath) as any[];
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].message).toBe('Unexpected token');
    expect(diagnostics[0].code).toBe('ParseError');
    expect(diagnostics[0].source).toBe('Eligian Preview');
    expect(diagnostics[0].range).toMatchObject({
      startLine: 1,
      startCharacter: 2,
      endLine: 1,
      endCharacter: 6,
    });
  });

  test('closing the preview clears its diagnostics', async () => {
    h.compileResults.push(failure('Unexpected token'));
    openPanel();
    await vi.waitFor(() => expect(h.diagnostics.get(documentPath)).toHaveLength(1));

    panel?.dispose();

    expect(h.diagnosticDeletes).toEqual([documentPath]);
    expect(h.diagnostics.has(documentPath)).toBe(false);
  });

  test('a compile finishing after the preview closed does not re-add diagnostics', async () => {
    let finish: (result: CompileResult) => void = () => {};
    h.compileResults.length = 0;
    const opened = openPanel();
    // Replace the compile with one that is still running when the panel closes
    (opened as any).compilationService = {
      compile: () =>
        new Promise<CompileResult>(resolve => {
          finish = resolve;
        }),
    };
    (opened as any).compileAndUpdate();
    await new Promise(resolve => setTimeout(resolve, 20));

    panel?.dispose();
    finish(failure('late'));
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(h.diagnostics.has(documentPath)).toBe(false);
  });
});

describe("PreviewPanel 'scrollContainer' (Feature 049)", () => {
  type Warning = {
    message: string;
    severity: number;
    code?: string;
    range: { startLine: number; startCharacter: number };
  };
  const warnings = () => (h.diagnostics.get(documentPath) ?? []) as Warning[];

  test('a runtime scroll container problem becomes a warning on the timeline header, and clears', async () => {
    fs.writeFileSync(
      documentPath,
      [
        'styles "./s.css"',
        '  timeline "story" in "#stage" using scroll "#scroller" duration 60s {',
        '}',
        '',
      ].join('\n')
    );
    openPanel();
    await vi.waitFor(() => expect(count('updateConfig')).toBe(1));

    h.receive?.({
      type: 'scrollContainer',
      payload: { timelineUri: 'story', problem: "Scroll container '#scroller' cannot scroll" },
    });
    await vi.waitFor(() => expect(warnings()).toHaveLength(1));
    const [warning] = warnings();
    expect(warning).toMatchObject({
      message: "Scroll container '#scroller' cannot scroll",
      severity: 1,
      code: 'scroll_container_runtime',
      range: { startLine: 1, startCharacter: 2 },
    });

    h.receive?.({ type: 'scrollContainer', payload: { timelineUri: 'story', problem: undefined } });
    await vi.waitFor(() => expect(warnings()).toEqual([]));
  });
});

describe('PreviewPanel.previewAt (audit idea #5)', () => {
  test('waits for the first compile, then sends the jump with the resolved timeline uri', async () => {
    fs.writeFileSync(path.join(tmp, 'clip.mp4'), '');
    h.compileResults.push({
      success: true,
      config: {
        id: 'cfg',
        timelines: [
          { uri: 'main', type: 'animation' },
          { uri: './clip.mp4', type: 'mediaplayer' },
        ],
      },
      errors: [],
      timestamp: 0,
    });
    const opened = openPanel();
    opened.previewAt('./clip.mp4', 4);

    await vi.waitFor(() => expect(count('previewAt')).toBe(1));
    const types = h.messages.map(m => m.type);
    expect(types.indexOf('previewAt')).toBeGreaterThan(types.indexOf('initialize'));
    const jump = h.messages.find(m => m.type === 'previewAt')!;
    // MediaResolver turned the video source into a webview URI
    expect(jump.payload.timelineUri).toContain('vscode-webview://');
    expect(jump.payload.timelineUri).toContain('clip.mp4');
    expect(jump.payload.position).toBe(4);

    // Once compiled, a jump is sent right away; a raf timeline keeps its name
    opened.previewAt('main', 2);
    await vi.waitFor(() => expect(count('previewAt')).toBe(2));
    expect(h.messages.filter(m => m.type === 'previewAt')[1].payload).toEqual({
      timelineUri: 'main',
      position: 2,
    });
  });
});

describe('PreviewPanel runtime errors (audit idea #14)', () => {
  test('a located engine error becomes a notification with its place and a runtime diagnostic', async () => {
    h.compileResults.push({
      success: true,
      config: { id: 'cfg', timelines: [{ uri: 't' }] },
      map: {
        version: 1,
        actions: {
          a1: {
            name: 'timeline-action-0-5',
            kind: 'timeline',
            location: { line: 4, column: 3, length: 20 },
            start: [
              { systemName: 'selectElement', location: { line: 5, column: 5, length: 10 } },
              { systemName: 'getControllerInstance', location: { line: 6, column: 5, length: 30 } },
            ],
            end: [],
            timelineUri: 't',
            duration: { start: 0, end: 5 },
          },
        },
      },
      errors: [],
      timestamp: 0,
    } as CompileResult);
    openPanel();
    await vi.waitFor(() => expect(count('initialize')).toBe(1));
    h.errorMessages.length = 0;

    h.receive?.({
      type: 'runtimeError',
      payload: {
        message: "Error in action start 'timeline-action-0-5': no controller",
        actionId: 'a1',
        phase: 'start',
        operationSystemName: 'getControllerInstance',
        operationIndex: 1,
        timelineUri: 't',
        position: 1.25,
      },
    });

    expect(h.errorMessages).toEqual([
      "Eligian Preview Runtime Error: Error in action start 'timeline-action-0-5': no controller (story.eligian:6:5)",
    ]);
    await vi.waitFor(() => expect(h.diagnostics.get(documentPath)?.length).toBe(1));
    const [diagnostic] = h.diagnostics.get(documentPath) as Array<{
      message: string;
      source?: string;
      range: { startLine: number; startCharacter: number };
    }>;
    expect(diagnostic.source).toBe('eligius-runtime');
    expect(diagnostic.message).toContain("at 1.3s of 't'");
    expect([diagnostic.range.startLine, diagnostic.range.startCharacter]).toEqual([5, 4]);
  });
  test('an error that matches the same operation in a called action lists both places', async () => {
    const op = (line: number) => ({
      systemName: 'getControllerInstance',
      location: { line, column: 5, length: 30 },
    });
    h.compileResults.push({
      success: true,
      config: { id: 'cfg', timelines: [{ uri: 't' }] },
      map: {
        version: 1,
        actions: {
          a1: {
            name: 'timeline-action-0-5',
            kind: 'timeline',
            location: { line: 4, column: 3, length: 20 },
            start: [
              op(5),
              { systemName: 'requestAction', calls: 'inner' },
              { systemName: 'startAction' },
            ],
            end: [],
            timelineUri: 't',
            duration: { start: 0, end: 5 },
          },
          a2: { name: 'inner', kind: 'action', start: [op(2)], end: [] },
        },
      },
      errors: [],
      timestamp: 0,
    } as CompileResult);
    openPanel();
    await vi.waitFor(() => expect(count('initialize')).toBe(1));
    h.errorMessages.length = 0;

    h.receive?.({
      type: 'runtimeError',
      payload: {
        message: 'no controller',
        actionId: 'a1',
        phase: 'start',
        operationSystemName: 'getControllerInstance',
        operationIndex: 0,
      },
    });

    expect(h.errorMessages).toEqual([
      'Eligian Preview Runtime Error: no controller (story.eligian:5:5 or 1 other place)',
    ]);
    await vi.waitFor(() => expect(h.diagnostics.get(documentPath)?.length).toBe(1));
    const [diagnostic] = h.diagnostics.get(documentPath) as Array<{
      relatedInformation?: Array<{
        message: string;
        location: { uri: MockUri; range: { startLine: number } };
      }>;
    }>;
    expect(
      diagnostic.relatedInformation?.map(r => [r.location.uri.fsPath, r.location.range.startLine])
    ).toEqual([[documentPath, 1]]);
    expect(diagnostic.relatedInformation?.[0].message).toMatch(/^Or here \(in 'inner'\): /);
  });
});
