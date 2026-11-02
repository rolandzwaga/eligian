/**
 * Timeline lifecycle blocks `on enter [..]` / `on leave [..]` (audit feature
 * idea #6), shared by the validator and the compiler so both report the same.
 */
import type { Timeline, TimelineLifecycle } from '../generated/ast.js';

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
