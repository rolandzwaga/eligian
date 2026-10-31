/**
 * Absolute times of a timeline's events, resolved statically from the AST
 * (audit feature idea #4: inlay hints for sequence, stagger, relative and
 * arithmetic times).
 *
 * Follows the compiler's event loop (timeline-transformer.ts) and uses its
 * scheduling arithmetic (time-schedule.ts), so a resolved time is the time
 * that is compiled. Anything that depends on a runtime value (a property chain
 * as time), or follows such an event through a relative time, is unresolved.
 */
import {
  type Expression,
  isArrayLiteral,
  isSequenceBlock,
  isStaggerBlock,
  isVariableDeclaration,
  isVariableReference,
  type SequenceItem,
  type StaggerBlock,
  type TimeExpression,
  type Timeline,
  type TimelineEvent,
  type VariableDeclaration,
} from '../../generated/ast.js';
import { containsRelativeTime } from '../../type-system-typir/utils/time-expression.js';
import { convertTimeToSeconds } from '../../utils/time-units.js';
import {
  inferredDuration,
  nextBase,
  roundTime,
  sequenceSpans,
  staggerSpans,
  type TimeSpan,
  timedEventSpan,
  timedEventSpanFor,
} from './time-schedule.js';

export interface ResolvedTimes {
  /** Spans of each resolved event (one per sequence/stagger item). */
  readonly events: ReadonlyMap<TimelineEvent, readonly TimeSpan[]>;
  readonly sequenceItems: ReadonlyMap<SequenceItem, TimeSpan>;
  /** The explicit duration, else the inferred one when every event resolved. */
  readonly duration: number | undefined;
}

export interface ResolveOptions {
  /** Number of items of a stagger block; defaults to array literals and consts holding one. */
  readonly itemCount?: (stagger: StaggerBlock) => number | undefined;
}

/**
 * Value of a time expression in seconds, with relative literals (`+2s`) taken
 * from `base`. Undefined for runtime values, division by zero, or a relative
 * literal without a known base.
 */
export function evaluateTimeAt(
  expr: TimeExpression | undefined,
  base: number | undefined
): number | undefined {
  if (!expr) return undefined;
  switch (expr.$type) {
    case 'TimeLiteral':
      return convertTimeToSeconds(expr.value, expr.unit);
    case 'RelativeTimeLiteral':
      return base === undefined ? undefined : base + convertTimeToSeconds(expr.value, expr.unit);
    case 'BinaryTimeExpression': {
      const left = evaluateTimeAt(expr.left, base);
      const right = evaluateTimeAt(expr.right, base);
      if (left === undefined || right === undefined) return undefined;
      switch (expr.op) {
        case '+':
          return left + right;
        case '-':
          return left - right;
        case '*':
          return left * right;
        case '/':
          return right === 0 ? undefined : left / right;
        default:
          return undefined;
      }
    }
    default:
      return undefined; // property chain: a runtime value
  }
}

/** Length of an array literal, or of the array literal a const holds. */
export function literalItemCount(
  items: Expression | undefined,
  visiting: Set<VariableDeclaration> = new Set()
): number | undefined {
  if (isArrayLiteral(items)) return items.elements.length;
  if (isVariableReference(items)) {
    const declaration = items.variable?.ref;
    if (!isVariableDeclaration(declaration) || visiting.has(declaration)) return undefined;
    visiting.add(declaration);
    return literalItemCount(declaration.value, visiting);
  }
  return undefined;
}

export function resolveTimelineTimes(
  timeline: Timeline,
  options: ResolveOptions = {}
): ResolvedTimes {
  const itemCount = options.itemCount ?? (stagger => literalItemCount(stagger.items));
  const events = new Map<TimelineEvent, readonly TimeSpan[]>();
  const sequenceItems = new Map<SequenceItem, TimeSpan>();
  let base: number | undefined = 0;
  let allResolved = true;

  for (const event of timeline.events) {
    const spans = resolveEvent(event, base, itemCount, sequenceItems);
    if (spans) {
      events.set(event, spans);
      base = nextBase(base ?? 0, spans);
    } else {
      allResolved = false;
      base = undefined;
    }
  }

  let duration: number | undefined;
  if (timeline.duration) {
    duration = containsRelativeTime(timeline.duration)
      ? undefined
      : evaluateTimeAt(timeline.duration, 0);
    if (duration !== undefined) duration = roundTime(duration);
  } else if (allResolved) {
    duration = inferredDuration([...events.values()].flat());
  }
  return { events, sequenceItems, duration };
}

function resolveEvent(
  event: TimelineEvent,
  base: number | undefined,
  itemCount: (stagger: StaggerBlock) => number | undefined,
  sequenceItems: Map<SequenceItem, TimeSpan>
): TimeSpan[] | undefined {
  if (isSequenceBlock(event)) {
    if (base === undefined) return undefined;
    const spans: TimeSpan[] = [];
    let current = base;
    for (const item of event.items) {
      // A relative literal in an item's duration counts from that item's start
      const duration = evaluateTimeAt(item.duration, current);
      if (duration === undefined) return undefined;
      const [span] = sequenceSpans(current, [duration]);
      spans.push(span);
      sequenceItems.set(item, span);
      current = span.end;
    }
    return spans;
  }

  if (isStaggerBlock(event)) {
    if (base === undefined) return undefined;
    const delay = evaluateTimeAt(event.delay, base);
    const duration = evaluateTimeAt(event.duration, base);
    const count = itemCount(event);
    if (delay === undefined || duration === undefined || count === undefined) return undefined;
    return staggerSpans(base, delay, duration, count);
  }

  // TimedEvent
  const range = event.timeRange;
  const start = evaluateTimeAt(range?.start, base);
  if (start === undefined || !range) return undefined;
  if (range.duration) {
    if (containsRelativeTime(range.duration)) return undefined;
    const duration = evaluateTimeAt(range.duration, 0);
    return duration === undefined ? undefined : [timedEventSpanFor(start, duration)];
  }
  const end = evaluateTimeAt(range.end, base);
  return end === undefined ? undefined : [timedEventSpan(start, end)];
}
