/**
 * The "Eligian Timeline" view (audit idea #20, phase 2): a swimlane per
 * timeline of the active .eligian document, a bar per event (from the
 * language server's `eligian/timelineGantt` request), the preview's playhead.
 * Clicking a bar goes to its source; double-clicking previews from its start.
 *
 * It follows the active .eligian editor (and keeps the last one while another
 * editor is active) and refreshes when the server has re-validated it.
 */

import * as path from 'node:path';
import {
  type GanttTimeline,
  TIMELINE_GANTT_REQUEST,
  type TimelineGanttParams,
} from '@eligian/language';
import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node.js';
import { onPreviewPlayhead, type PreviewPlayhead } from '../preview/playhead-events.js';

export const TIMELINE_VIEW_ID = 'eligian.timelineView';

/** An LSP range as it arrives in a message. */
interface MessageRange {
  start: { line: number; character: number };
  end: { line: number; character: number };
}

type ViewMessage =
  | { type: 'ready' }
  | { type: 'reveal'; range: MessageRange }
  | { type: 'preview'; timelineUri: string; seconds: number };

export class TimelineViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  private view: vscode.WebviewView | undefined;
  private documentUri: vscode.Uri | undefined;
  private readonly playheads = new Map<string, PreviewPlayhead['playhead']>();
  private readonly disposables: { dispose(): void }[] = [];
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly client: Pick<LanguageClient, 'sendRequest'>
  ) {
    this.followEditor(vscode.window.activeTextEditor);
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(editor => this.followEditor(editor)),
      // The server re-validated a document: its timelines may have changed
      vscode.languages.onDidChangeDiagnostics(event => {
        const current = this.documentUri?.toString();
        if (current && event.uris.some(uri => uri.toString() === current)) this.scheduleRefresh();
      }),
      onPreviewPlayhead(event => this.onPlayhead(event))
    );
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'out', 'media')],
    };
    view.webview.html = this.html(view.webview);
    this.disposables.push(
      view.webview.onDidReceiveMessage((message: ViewMessage) => this.onMessage(message)),
      view.onDidChangeVisibility(() => {
        if (view.visible) void this.refresh();
      }),
      view.onDidDispose(() => {
        this.view = undefined;
      })
    );
  }

  dispose(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    for (const disposable of this.disposables) disposable.dispose();
    this.disposables.length = 0;
  }

  private followEditor(editor: vscode.TextEditor | undefined): void {
    if (editor?.document.languageId !== 'eligian') return;
    if (this.documentUri?.toString() === editor.document.uri.toString()) return;
    this.documentUri = editor.document.uri;
    void this.refresh();
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => void this.refresh(), 150);
  }

  /** Ask the server for the timelines of the followed document and draw them. */
  async refresh(): Promise<void> {
    const view = this.view;
    if (!view?.visible) return;
    const uri = this.documentUri;
    if (!uri) {
      void view.webview.postMessage({
        type: 'empty',
        message: 'Open an .eligian file to see its timelines.',
      });
      return;
    }
    let timelines: GanttTimeline[];
    try {
      const params: TimelineGanttParams = { textDocument: { uri: uri.toString() } };
      timelines = await this.client.sendRequest<GanttTimeline[]>(TIMELINE_GANTT_REQUEST, params);
    } catch (error) {
      void view.webview.postMessage({
        type: 'empty',
        message: `The timelines could not be read: ${error instanceof Error ? error.message : error}`,
      });
      return;
    }
    // Another document became active while the server answered
    if (this.documentUri?.toString() !== uri.toString()) return;
    void view.webview.postMessage({
      type: 'update',
      fileName: path.basename(uri.fsPath),
      timelines,
      playhead: this.playheads.get(uri.toString()) ?? undefined,
    });
  }

  private onPlayhead(event: PreviewPlayhead): void {
    this.playheads.set(event.documentUri, event.playhead);
    if (event.documentUri !== this.documentUri?.toString()) return;
    void this.view?.webview.postMessage({
      type: 'playhead',
      playhead: event.playhead ?? undefined,
    });
  }

  private async onMessage(message: ViewMessage): Promise<void> {
    const uri = this.documentUri;
    if (message.type === 'ready') {
      await this.refresh();
      return;
    }
    if (!uri) return;
    if (message.type === 'reveal') {
      const { start, end } = message.range;
      const range = new vscode.Range(start.line, start.character, end.line, end.character);
      const editor = await vscode.window.showTextDocument(uri, {
        selection: new vscode.Range(range.start, range.start),
        preserveFocus: false,
      });
      editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    } else if (message.type === 'preview') {
      await vscode.commands.executeCommand(
        'eligian.previewAt',
        uri.toString(),
        message.timelineUri,
        message.seconds
      );
    }
  }

  private html(webview: vscode.Webview): string {
    const script = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'out', 'media', 'timeline-view.js')
    );
    const nonce = Array.from({ length: 32 }, () =>
      Math.floor(Math.random() * 36).toString(36)
    ).join('');
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>${STYLES}</style>
</head>
<body>
<div id="root"><p class="empty">Loading…</p></div>
<script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
  }
}

/** The view's styles, in the colours of the VS Code theme. */
const STYLES = `
body { padding: 0 12px 12px; color: var(--vscode-foreground); font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); }
.file, .empty { color: var(--vscode-descriptionForeground); margin: 8px 0; }
.timeline { margin: 10px 0 16px; }
.header { display: flex; gap: 10px; align-items: baseline; margin-bottom: 4px; }
.name { color: var(--vscode-textLink-foreground); text-decoration: none; font-weight: 600; white-space: nowrap; }
.name:hover { text-decoration: underline; }
.meta { color: var(--vscode-descriptionForeground); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.track { position: relative; }
.axis { position: relative; height: 16px; border-bottom: 1px solid var(--vscode-panel-border, var(--vscode-widget-border, #8884)); margin-bottom: 2px; }
.tick { position: absolute; bottom: 2px; transform: translateX(-50%); font-size: 0.85em; color: var(--vscode-descriptionForeground); white-space: nowrap; }
.tick:first-child { transform: none; }
.lanes { position: relative; }
.bar { position: absolute; height: 18px; min-width: 3px; box-sizing: border-box; border-radius: 3px; padding: 0 4px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; line-height: 18px; font-size: 0.9em; cursor: pointer; color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 1px solid var(--vscode-editor-background); }
.bar:hover { background: var(--vscode-button-hoverBackground); }
.bar span { pointer-events: none; }
.kind-sequence { background: var(--vscode-charts-blue, #3794ff); }
.kind-stagger { background: var(--vscode-charts-purple, #b180d7); }
.playhead { position: absolute; top: -18px; bottom: 0; width: 2px; margin-left: -1px; background: var(--vscode-charts-red, #f14c4c); pointer-events: none; }
`;
