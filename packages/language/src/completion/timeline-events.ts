/**
 * Timeline event snippets (audit feature idea #13): inside a timeline body,
 * offer `at … for … [ ]`, `sequence { }` and `stagger … with …` skeletons.
 *
 * The `at` snippet starts where the previous event ends: at that time when it
 * is statically known (`at 31s for 5s`), else at `+0s`, which means exactly
 * "right after the previous event".
 */
import { type CompletionItem, CompletionItemKind, InsertTextFormat } from 'vscode-languageserver';
import { isTimedEvent, type Timeline } from '../generated/ast.js';
import { parseTimeRange } from '../type-system-typir/utils/time-expression.js';
import { convertTimeToSeconds } from '../utils/time-units.js';

/** Round away floating-point noise (0.30000000000000004 → 0.3). */
const tidy = (n: number) => Math.round(n * 1e6) / 1e6;

/**
 * End (in seconds) of the last event before `offset`, when statically known:
 * 0 without events; undefined when an earlier event's end depends on runtime
 * values or on blocks this does not resolve (sequence, stagger).
 */
export function previousEventEnd(timeline: Timeline, offset: number): number | undefined {
  let end: number | undefined = 0;
  for (const event of timeline.events) {
    const cst = event.$cstNode;
    if (!cst || cst.end > offset) break;
    if (!isTimedEvent(event)) {
      end = undefined;
      continue;
    }
    const values = parseTimeRange(event.timeRange);
    const start = event.timeRange?.start;
    if (values.start !== undefined && values.end !== undefined) {
      end = values.end;
    } else if (
      end !== undefined &&
      start?.$type === 'RelativeTimeLiteral' &&
      values.duration !== undefined
    ) {
      // `at +2s for 3s` / `at +0s..+3s`: relative to the previous end
      end = end + convertTimeToSeconds(start.value, start.unit) + values.duration;
    } else {
      end = undefined;
    }
  }
  return end;
}

function snippet(label: string, detail: string, insertText: string, order: number): CompletionItem {
  return {
    label,
    kind: CompletionItemKind.Snippet,
    detail,
    insertText,
    insertTextFormat: InsertTextFormat.Snippet,
    sortText: `0_${order}`,
  };
}

/** The timeline event snippets for a cursor at `offset` in `timeline`'s body. */
export function getTimelineEventCompletions(timeline: Timeline, offset: number): CompletionItem[] {
  const end = previousEventEnd(timeline, offset);
  const start = end === undefined ? '+0s' : `${tidy(end)}s`;
  const startNote =
    end === undefined ? 'starts right after the previous event' : `starts at ${start}`;
  return [
    snippet(
      'at … for … [ ]',
      `Timed event (${startNote})`,
      `at ${tabStop(1, start)} for ${tabStop(2, '5s')} [\n\t$0\n]`,
      1
    ),
    snippet(
      'sequence { }',
      'Actions one after another',
      `sequence {\n\t${tabStop(1, 'action')}() for ${tabStop(2, '2s')}\n\t$0\n}`,
      2
    ),
    snippet(
      'stagger … with …',
      'One action per item, each starting a delay later',
      `stagger ${tabStop(1, '200ms')} ${tabStop(2, '["#a", "#b"]')} with ${tabStop(3, 'action')}() for ${tabStop(4, '1s')}`,
      3
    ),
  ];
}

/** A snippet tab stop with a default value: `${n:value}` in snippet syntax. */
export function tabStop(index: number, value: string): string {
  return `$\{${index}:${value}}`;
}
