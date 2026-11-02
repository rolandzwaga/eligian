/**
 * Data of the "Eligian Timeline" view (audit idea #20, phase 2): one swimlane
 * per timeline, a bar per event with its resolved times (the shared resolver,
 * as the inlay hints, the Outline and the compiler), packed into lanes so
 * events that run at the same time sit below each other.
 *
 * Parse-free: computed from the language server's already-built AST and sent
 * to the extension through the {@link TIMELINE_GANTT_REQUEST} request.
 */
import type { AstNode } from 'langium';
import type { Range } from 'vscode-languageserver-types';
import { timelineUri } from '../compiler/transformers/navigate-operations.js';
import { resolveTimelineTimes } from '../compiler/transformers/time-resolver.js';
import type { TimeSpan } from '../compiler/transformers/time-schedule.js';
import {
  isArrayLiteral,
  isInlineEndableAction,
  isSequenceBlock,
  isStaggerBlock,
  isTimedEvent,
  type Program,
  type Timeline,
  type TimelineEvent,
} from '../generated/ast.js';
import { getTimelines } from '../utils/program-helpers.js';
import { eventSummary } from './eligian-document-symbol-provider.js';

/** LSP request: the timelines of a document, for the timeline view. */
export const TIMELINE_GANTT_REQUEST = 'eligian/timelineGantt';

export interface TimelineGanttParams {
  textDocument: { uri: string };
}

export interface GanttBar {
  /** Short name: `at`, a label (`intro`), `sequence 2/6`, `stagger 1/3` */
  readonly label: string;
  /** What it does: the first text it shows and its calls */
  readonly detail: string;
  readonly kind: 'at' | 'sequence' | 'stagger';
  readonly start: number;
  readonly end: number;
  /** Row inside the timeline's swimlane (0 = top); bars of a row never overlap */
  readonly lane: number;
  /** The event's source (an `at` event, a sequence item, a stagger block) */
  readonly range: Range;
}

export interface GanttTimeline {
  readonly name: string;
  /** The engine uri, for `eligian.previewAt` */
  readonly uri: string;
  readonly provider: string;
  /** The explicit or inferred duration (0 without timed events) */
  readonly duration: number;
  readonly lanes: number;
  readonly bars: readonly GanttBar[];
  /** `on enter` / `on leave` blocks: run when the timeline is entered / left */
  readonly lifecycle: readonly ('enter' | 'leave')[];
  /** Events whose time is only known at runtime (not drawn) */
  readonly unresolved: number;
  /** The timeline's `timeline "name"` header */
  readonly range: Range;
}

/** The timelines of `program`, with their bars. */
export function timelineGantt(program: Program): GanttTimeline[] {
  return getTimelines(program).flatMap(timeline => {
    const range = rangeOf(timeline);
    return range ? [ganttTimeline(timeline, range)] : [];
  });
}

function ganttTimeline(timeline: Timeline, range: Range): GanttTimeline {
  const times = resolveTimelineTimes(timeline);
  const bars: Omit<GanttBar, 'lane'>[] = [];
  let unresolved = 0;
  for (const event of timeline.events) {
    const spans = times.events.get(event);
    if (!spans || spans.length === 0) {
      unresolved++;
      continue;
    }
    bars.push(...eventBars(event, spans, times.sequenceItems));
  }
  const packed = pack(bars);
  const end = Math.max(0, ...packed.bars.map(bar => bar.end));
  return {
    name: timeline.name,
    uri: timelineUri(timeline),
    provider: timeline.provider,
    duration: times.duration ?? end,
    lanes: packed.lanes,
    bars: packed.bars,
    lifecycle: timeline.lifecycle.map(block => block.kind as 'enter' | 'leave'),
    unresolved,
    range,
  };
}

function eventBars(
  event: TimelineEvent,
  spans: readonly TimeSpan[],
  itemSpans: ReturnType<typeof resolveTimelineTimes>['sequenceItems']
): Omit<GanttBar, 'lane'>[] {
  if (isTimedEvent(event)) {
    const range = rangeOf(event);
    const action = event.action;
    const body = isInlineEndableAction(action) ? action.startOperations : action ? [action] : [];
    return range
      ? [{ label: event.name ?? 'at', detail: eventSummary(body), kind: 'at', ...spans[0], range }]
      : [];
  }
  if (isSequenceBlock(event)) {
    return event.items.flatMap((item, index) => {
      const span = itemSpans.get(item);
      const range = rangeOf(item);
      if (!span || !range) return [];
      const label = item.name ?? `sequence ${index + 1}/${event.items.length}`;
      const body = item.actionCall ? [item.actionCall] : item.startOps;
      return [{ label, detail: eventSummary(body), kind: 'sequence' as const, ...span, range }];
    });
  }
  if (isStaggerBlock(event)) {
    const range = rangeOf(event);
    if (!range) return [];
    const detail = eventSummary(event.actionCall ? [event.actionCall] : event.startOps);
    const items = isArrayLiteral(event.items) ? event.items.elements : [];
    return spans.map((span, index) => {
      const item = items[index]?.$cstNode?.text;
      return {
        label: `stagger ${index + 1}/${spans.length}${item ? ` ${item}` : ''}`,
        detail,
        kind: 'stagger' as const,
        ...span,
        range,
      };
    });
  }
  return [];
}

/**
 * Greedy interval packing: in start order, each bar goes into the first lane
 * whose last bar has ended (touching bars share a lane).
 */
export function pack<T extends { start: number; end: number }>(
  bars: readonly T[]
): { bars: (T & { lane: number })[]; lanes: number } {
  const laneEnds: number[] = [];
  const order = bars.map((bar, index) => ({ bar, index }));
  order.sort((a, b) => a.bar.start - b.bar.start || a.index - b.index);
  const placed = order.map(({ bar }) => {
    let lane = laneEnds.findIndex(end => end <= bar.start);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(bar.end);
    } else {
      laneEnds[lane] = bar.end;
    }
    return { ...bar, lane };
  });
  return { bars: placed, lanes: laneEnds.length };
}

function rangeOf(node: AstNode): Range | undefined {
  return node.$cstNode?.range;
}
