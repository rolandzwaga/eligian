/**
 * Rendering of the "Eligian Timeline" view (audit idea #20, phase 2): one
 * swimlane per timeline, a bar per event, a time axis and the preview's
 * playhead. Pure (data in, HTML out), so it is tested without a webview.
 */
import type { GanttBar, GanttTimeline } from '@eligian/language';

/** Height of one lane in pixels. */
export const LANE_HEIGHT = 22;

/** The preview's position, when it plays this document. */
export interface Playhead {
  readonly timelineUri: string;
  readonly position: number;
}

const seconds = (n: number) => `${Math.round(n * 1000) / 1000}s`;

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** A step for the axis ticks that gives at most ~10 ticks over `duration`. */
export function tickStep(duration: number): number {
  const steps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800, 3600];
  return steps.find(step => duration / step <= 10) ?? 3600;
}

/** Percentage of `duration` (clamped to 0..100). */
const percent = (value: number, duration: number) =>
  duration > 0 ? Math.min(100, Math.max(0, (value / duration) * 100)) : 0;

function barHtml(bar: GanttBar, timeline: number, index: number, duration: number): string {
  const left = percent(bar.start, duration);
  const width = Math.max(percent(bar.end, duration) - left, 0);
  const tooltip = `${bar.label} · ${seconds(bar.start)}..${seconds(bar.end)}${bar.detail ? `\n${bar.detail}` : ''}\nClick: go to source · Double-click: preview from ${seconds(bar.start)}`;
  return `<div class="bar kind-${bar.kind}" style="left:${left}%;width:${width}%;top:${bar.lane * LANE_HEIGHT}px" data-timeline="${timeline}" data-bar="${index}" title="${escapeHtml(tooltip)}"><span>${escapeHtml(bar.label)}</span></div>`;
}

function axisHtml(duration: number): string {
  if (duration <= 0) return '';
  const step = tickStep(duration);
  const ticks: string[] = [];
  for (let time = 0; time <= duration + 1e-9; time += step) {
    ticks.push(
      `<span class="tick" style="left:${percent(time, duration)}%">${seconds(Math.round(time * 1000) / 1000)}</span>`
    );
  }
  return `<div class="axis">${ticks.join('')}</div>`;
}

function timelineHtml(
  timeline: GanttTimeline,
  index: number,
  playhead: Playhead | undefined
): string {
  const meta = [
    timeline.provider,
    timeline.duration > 0 ? `0s..${seconds(timeline.duration)}` : 'no timed events',
    ...timeline.lifecycle.map(kind => `on ${kind}`),
    ...(timeline.unresolved > 0
      ? [
          `${timeline.unresolved} event${timeline.unresolved === 1 ? '' : 's'} timed at runtime (not shown)`,
        ]
      : []),
  ].join(' · ');
  const header = `<div class="header"><a class="name" href="#" data-timeline="${index}" title="Go to the timeline">timeline "${escapeHtml(timeline.name)}"</a><span class="meta">${escapeHtml(meta)}</span></div>`;
  if (timeline.duration <= 0 || timeline.bars.length === 0) {
    return `<section class="timeline">${header}</section>`;
  }
  const bars = timeline.bars.map((bar, i) => barHtml(bar, index, i, timeline.duration)).join('');
  const head =
    playhead && playhead.timelineUri === timeline.uri
      ? `<div class="playhead" style="left:${percent(playhead.position, timeline.duration)}%" title="Preview at ${seconds(playhead.position)}"></div>`
      : '';
  return `<section class="timeline">${header}<div class="track">${axisHtml(timeline.duration)}<div class="lanes" data-uri="${escapeHtml(timeline.uri)}" data-duration="${timeline.duration}" style="height:${Math.max(1, timeline.lanes) * LANE_HEIGHT}px">${bars}${head}</div></div></section>`;
}

/**
 * The playhead's position in a timeline's lanes: a percentage, or undefined
 * when the preview plays another timeline (or nothing).
 */
export function playheadPercent(
  lanes: { uri: string; duration: number },
  playhead: Playhead | undefined
): number | undefined {
  if (!playhead || playhead.timelineUri !== lanes.uri || lanes.duration <= 0) return undefined;
  return percent(playhead.position, lanes.duration);
}

/** The view's body for the timelines of one document. */
export function renderTimelines(
  fileName: string,
  timelines: readonly GanttTimeline[],
  playhead?: Playhead
): string {
  if (timelines.length === 0) {
    return `<p class="empty">${escapeHtml(fileName)} has no timelines.</p>`;
  }
  return `<p class="file">${escapeHtml(fileName)}</p>${timelines.map((t, i) => timelineHtml(t, i, playhead)).join('')}`;
}
