/**
 * Hover on a timeline header (Feature 049): provider, effective duration and
 * whether the timeline loops.
 */
import type { Hover } from 'vscode-languageserver';
import { isTimedEvent, type Timeline } from '../generated/ast.js';
import { extractTimeValue, parseTimeRange } from '../type-system-typir/utils/time-expression.js';
import { createMarkdownHover } from '../utils/hover-utils.js';

/**
 * The timeline's duration as the compiler will emit it, when statically known:
 * the explicit `duration` option, or else the end of the last event when every
 * event is an `at` event with an absolute end.
 */
export function effectiveDuration(
  timeline: Timeline
): { seconds: number; explicit: boolean } | undefined {
  if (timeline.duration) {
    const seconds = extractTimeValue(timeline.duration);
    return seconds === undefined ? undefined : { seconds, explicit: true };
  }
  let max = 0;
  for (const event of timeline.events) {
    if (!isTimedEvent(event)) return undefined;
    const { end } = parseTimeRange(event.timeRange);
    if (end === undefined) return undefined;
    max = Math.max(max, end);
  }
  return { seconds: max, explicit: false };
}

export function buildTimelineHover(timeline: Timeline): Hover {
  const provider =
    timeline.provider === 'scroll'
      ? `scroll (\`${timeline.scrollSelector ?? timeline.containerSelector}\`)`
      : timeline.source
        ? `${timeline.provider} from \`${timeline.source}\``
        : timeline.provider;
  const duration = effectiveDuration(timeline);
  const durationText = duration
    ? `${duration.seconds}s${duration.explicit ? ' (explicit)' : ' (end of the last event)'}`
    : 'computed from the events when compiling';
  const lines = [
    `### Timeline "${timeline.name}"`,
    '',
    `- **Provider:** ${provider}`,
    `- **Container:** \`${timeline.containerSelector}\``,
    `- **Duration:** ${durationText}`,
    `- **Loops:** ${timeline.loop ? 'yes' : 'no'}`,
  ];
  return createMarkdownHover(lines.join('\n'));
}
