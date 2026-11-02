/**
 * Webview script of the "Eligian Timeline" view (audit idea #20, phase 2).
 *
 * Messages from the extension:
 * - `{ type: 'update', fileName, timelines, playhead? }`: draw the timelines
 * - `{ type: 'empty', message }`: nothing to show (no .eligian editor)
 * - `{ type: 'playhead', playhead }`: move the preview's playhead (or hide it)
 *
 * Messages to the extension:
 * - `{ type: 'reveal', range }`: a bar or timeline name was clicked
 * - `{ type: 'preview', timelineUri, seconds }`: a bar was double-clicked
 * - `{ type: 'ready' }`: the script runs (the extension then sends an update)
 */
import type { GanttTimeline } from '@eligian/language';
import {
  escapeHtml,
  type Playhead,
  playheadPercent,
  renderTimelines,
} from './timeline-view-render.js';

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };

const vscode = acquireVsCodeApi();
const root = document.getElementById('root') as HTMLElement;
let timelines: readonly GanttTimeline[] = [];

type Message =
  | { type: 'update'; fileName: string; timelines: GanttTimeline[]; playhead?: Playhead }
  | { type: 'empty'; message: string }
  | { type: 'playhead'; playhead?: Playhead };

window.addEventListener('message', (event: MessageEvent<Message>) => {
  const message = event.data;
  if (message.type === 'update') {
    timelines = message.timelines;
    root.innerHTML = renderTimelines(message.fileName, message.timelines, message.playhead);
  } else if (message.type === 'empty') {
    timelines = [];
    root.innerHTML = `<p class="empty">${escapeHtml(message.message)}</p>`;
  } else if (message.type === 'playhead') {
    movePlayhead(message.playhead);
  }
});

/** Move (or add, or remove) the playhead line in each timeline's lanes. */
function movePlayhead(playhead: Playhead | undefined): void {
  for (const lanes of Array.from(root.querySelectorAll<HTMLElement>('.lanes'))) {
    const at = playheadPercent(
      { uri: lanes.dataset.uri ?? '', duration: Number(lanes.dataset.duration) },
      playhead
    );
    let line = lanes.querySelector<HTMLElement>('.playhead');
    if (at === undefined) {
      line?.remove();
      continue;
    }
    if (!line) {
      line = document.createElement('div');
      line.className = 'playhead';
      lanes.appendChild(line);
    }
    line.style.left = `${at}%`;
  }
}

/** The bar or timeline name an event happened on. */
function target(event: MouseEvent) {
  const element = (event.target as HTMLElement).closest<HTMLElement>('[data-timeline]');
  const timeline = timelines[Number(element?.dataset.timeline)];
  if (!element || !timeline) return undefined;
  const bar =
    element.dataset.bar === undefined ? undefined : timeline.bars[Number(element.dataset.bar)];
  return { timeline, bar };
}

root.addEventListener('click', event => {
  const hit = target(event);
  if (!hit) return;
  event.preventDefault();
  vscode.postMessage({ type: 'reveal', range: (hit.bar ?? hit.timeline).range });
});

root.addEventListener('dblclick', event => {
  const hit = target(event);
  if (!hit?.bar) return;
  vscode.postMessage({ type: 'preview', timelineUri: hit.timeline.uri, seconds: hit.bar.start });
});

vscode.postMessage({ type: 'ready' });
