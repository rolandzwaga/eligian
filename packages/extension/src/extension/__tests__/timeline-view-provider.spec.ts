/**
 * The "Eligian Timeline" view provider (audit idea #20, phase 2): follows the
 * active .eligian editor, asks the language server for its timelines, goes to
 * the source of a clicked bar, previews from a double-clicked one, and passes
 * the preview's playhead on.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listeners: Record<string, (arg: unknown) => void> = {};
const executeCommand = vi.fn();
const showTextDocument = vi.fn();
const revealRange = vi.fn();
let activeEditor: unknown;

vi.mock('vscode', () => {
  class Range {
    constructor(
      public sl: number | { line: number },
      public sc: number | { line: number },
      public el?: number,
      public ec?: number
    ) {}
    get start() {
      return typeof this.sl === 'number' ? { line: this.sl, character: this.sc } : this.sl;
    }
  }
  const on = (name: string) => (listener: (arg: unknown) => void) => {
    listeners[name] = listener;
    return { dispose: vi.fn() };
  };
  return {
    Range,
    TextEditorRevealType: { InCenterIfOutsideViewport: 2 },
    Uri: {
      joinPath: (base: { path: string }, ...parts: string[]) => ({
        path: [base.path, ...parts].join('/'),
      }),
    },
    window: {
      get activeTextEditor() {
        return activeEditor;
      },
      onDidChangeActiveTextEditor: on('editor'),
      showTextDocument: (...a: unknown[]) => showTextDocument(...a),
    },
    languages: { onDidChangeDiagnostics: on('diagnostics') },
    commands: { executeCommand: (...a: unknown[]) => executeCommand(...a) },
  };
});

import { firePreviewPlayhead } from '../preview/playhead-events.js';
import { TimelineViewProvider } from '../timeline-view/TimelineViewProvider.js';

const docUri = { toString: () => 'file:///talk/main.eligian', fsPath: '/talk/main.eligian' };
const editor = { document: { languageId: 'eligian', uri: docUri } };
const timelines = [{ name: 'Main', uri: 'Main', bars: [] }];

function fakeView() {
  const posted: unknown[] = [];
  let onMessage: (m: unknown) => Promise<void> = async () => {};
  const view = {
    visible: true,
    webview: {
      options: {},
      html: '',
      cspSource: 'vscode-resource:',
      asWebviewUri: (uri: { path: string }) => ({ toString: () => uri.path }),
      postMessage: (m: unknown) => {
        posted.push(m);
        return Promise.resolve(true);
      },
      onDidReceiveMessage: (listener: (m: unknown) => Promise<void>) => {
        onMessage = listener;
        return { dispose: vi.fn() };
      },
    },
    onDidChangeVisibility: () => ({ dispose: vi.fn() }),
    onDidDispose: () => ({ dispose: vi.fn() }),
  };
  return { view, posted, send: (m: unknown) => onMessage(m) };
}

describe('TimelineViewProvider', () => {
  let sendRequest: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    activeEditor = editor;
    sendRequest = vi.fn().mockResolvedValue(timelines);
    showTextDocument.mockResolvedValue({ revealRange });
  });

  const create = () => {
    const provider = new TimelineViewProvider({ path: '/ext' } as never, { sendRequest } as never);
    const fake = fakeView();
    provider.resolveWebviewView(fake.view as never);
    return { provider, ...fake };
  };

  it('draws the timelines of the active .eligian editor', async () => {
    const { view, posted, send } = create();
    expect(view.webview.html).toContain('timeline-view.js');
    expect(view.webview.html).toContain("script-src 'nonce-");
    await send({ type: 'ready' });
    expect(sendRequest).toHaveBeenCalledWith('eligian/timelineGantt', {
      textDocument: { uri: 'file:///talk/main.eligian' },
    });
    expect(posted).toContainEqual({
      type: 'update',
      fileName: 'main.eligian',
      timelines,
      playhead: undefined,
    });
  });

  it('goes to the source of a clicked bar and previews from a double-clicked one', async () => {
    const { send } = create();
    const range = { start: { line: 3, character: 2 }, end: { line: 3, character: 9 } };
    await send({ type: 'reveal', range });
    expect(showTextDocument).toHaveBeenCalledWith(
      docUri,
      expect.objectContaining({ preserveFocus: false })
    );
    expect(revealRange).toHaveBeenCalled();
    await send({ type: 'preview', timelineUri: 'Main', seconds: 2.5 });
    expect(executeCommand).toHaveBeenCalledWith(
      'eligian.previewAt',
      'file:///talk/main.eligian',
      'Main',
      2.5
    );
  });

  it("passes the preview's playhead on for its document only", () => {
    const { posted } = create();
    firePreviewPlayhead({
      documentUri: 'file:///talk/main.eligian',
      playhead: { timelineUri: 'Main', position: 4 },
    });
    firePreviewPlayhead({
      documentUri: 'file:///other.eligian',
      playhead: { timelineUri: 'X', position: 1 },
    });
    expect(posted.filter(m => (m as { type: string }).type === 'playhead')).toEqual([
      { type: 'playhead', playhead: { timelineUri: 'Main', position: 4 } },
    ]);
  });

  it('shows a hint when no .eligian file was opened', async () => {
    activeEditor = undefined;
    const { posted, send } = create();
    await send({ type: 'ready' });
    expect(posted).toContainEqual({
      type: 'empty',
      message: 'Open an .eligian file to see its timelines.',
    });
    expect(sendRequest).not.toHaveBeenCalled();
  });
});
