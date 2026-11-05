/**
 * Timeline lifecycle blocks `on enter [..]` / `on leave [..]` (audit feature
 * idea #6), shared by the validator and the compiler so both report the same.
 */
import type { CstNode } from 'langium';
import type { Program, Timeline, TimelineLifecycle } from '../generated/ast.js';
import { getTimelines } from './program-helpers.js';

export type LifecycleKind = 'enter' | 'leave';

/** Message for a second `on enter` / `on leave` block in one timeline. */
export const duplicateLifecycleMessage = (kind: string): string =>
  `A timeline has at most one 'on ${kind}' block; merge the operations into the first one`;

/** The first `on enter` and `on leave` block of `timeline`, and any repeated ones. */
export function lifecycleBlocks(timeline: Timeline): {
  readonly enter?: TimelineLifecycle;
  readonly leave?: TimelineLifecycle;
  readonly duplicates: readonly TimelineLifecycle[];
} {
  let enter: TimelineLifecycle | undefined;
  let leave: TimelineLifecycle | undefined;
  const duplicates: TimelineLifecycle[] = [];
  for (const block of timeline.lifecycle) {
    if (block.kind === 'enter') {
      if (enter) duplicates.push(block);
      else enter = block;
    } else if (leave) {
      duplicates.push(block);
    } else {
      leave = block;
    }
  }
  return { enter, leave, duplicates };
}

/** A 0-based source position. */
type SourcePosition = { readonly line: number; readonly character: number };

/** Where a quick fix inserts operations into a timeline's `on leave` block or body. */
export interface LifecycleInsertionPoint {
  /** Timeline.name (the compiled uri) */
  readonly timeline: string;
  /** 0-based position of the `]` of the first `on leave` block, if any */
  readonly leaveClose?: SourcePosition;
  /** 0-based position of the timeline's closing `}` */
  readonly bodyClose: SourcePosition;
  /** Leading whitespace of the timeline's first line */
  readonly indent: string;
}

/** The last character of `node` (its closing `]` or `}`): the range end minus one character. */
const lastCharacter = (node: CstNode): SourcePosition => ({
  line: node.range.end.line,
  character: node.range.end.character - 1,
});

/** The whitespace that starts the source line `node` begins on. */
function lineIndent(node: CstNode): string {
  const text = node.root.fullText;
  const lineStart = text.lastIndexOf('\n', node.offset - 1) + 1;
  return /^[ \t]*/.exec(text.slice(lineStart, node.offset))![0];
}

/** Per timeline of `program`, in order: the insertion points of its `on leave` block and body. */
export function lifecycleInsertionPoints(program: Program): readonly LifecycleInsertionPoint[] {
  const points: LifecycleInsertionPoint[] = [];
  for (const timeline of getTimelines(program)) {
    const body = timeline.$cstNode;
    if (!body) continue;
    const leave = lifecycleBlocks(timeline).leave?.$cstNode;
    points.push({
      timeline: timeline.name,
      ...(leave ? { leaveClose: lastCharacter(leave) } : {}),
      bodyClose: lastCharacter(body),
      indent: lineIndent(body),
    });
  }
  return points;
}
