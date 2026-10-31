/**
 * Timeline scheduling arithmetic, shared by the compiler (timeline-transformer.ts)
 * and the IDE's time resolver (time-resolver.ts), so the times shown in the
 * editor are the times that are compiled (audit feature idea #4).
 *
 * All times are in seconds. Each event starts from the end of the previous
 * one ("base"): relative times (`+2s`) are offsets from it, sequences run from
 * it, staggers start their first item at it.
 */

export interface TimeSpan {
  readonly start: number;
  readonly end: number;
}

/** Round away floating-point drift (0.1 + 0.2 = 0.30000000000000004 → 0.3). */
export const roundTime = (seconds: number): number => Math.round(seconds * 1e6) / 1e6;

/** `at <start>..<end>` or `at <start> for <duration>`. */
export function timedEventSpan(start: number, end: number): TimeSpan {
  return { start: roundTime(start), end: roundTime(end) };
}

/** `at <start> for <duration>`: the end is start + duration. */
export function timedEventSpanFor(start: number, duration: number): TimeSpan {
  const roundedStart = roundTime(start);
  return { start: roundedStart, end: roundTime(roundedStart + duration) };
}

/** `sequence { a() for 2s  b() for 3s }`: items run back to back from `base`. */
export function sequenceSpans(base: number, durations: readonly number[]): TimeSpan[] {
  const spans: TimeSpan[] = [];
  let current = base;
  for (const duration of durations) {
    const end = roundTime(current + duration);
    spans.push({ start: current, end });
    current = end;
  }
  return spans;
}

/** `stagger <delay> <items> ... for <duration>`: item i starts at base + i × delay. */
export function staggerSpans(
  base: number,
  delay: number,
  duration: number,
  count: number
): TimeSpan[] {
  return Array.from({ length: count }, (_, i) => {
    const start = roundTime(base + i * delay);
    return { start, end: roundTime(start + duration) };
  });
}

/** The base of the next event: the end of the last span, or `base` when there are none. */
export function nextBase(base: number, spans: readonly TimeSpan[]): number {
  return spans.length > 0 ? spans[spans.length - 1].end : base;
}

/** The inferred timeline duration: the latest end of any event. */
export function inferredDuration(spans: readonly TimeSpan[]): number {
  return spans.reduce((max, span) => Math.max(max, span.end), 0);
}
