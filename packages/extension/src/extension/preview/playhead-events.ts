/**
 * The preview's playhead, for other views (the timeline view, idea #20): the
 * preview of `documentUri` is at `position` of the timeline `timelineUri` (its
 * compiled uri), or `null` when it stopped showing a playhead.
 */
export interface PreviewPlayhead {
  readonly documentUri: string;
  readonly playhead: { readonly timelineUri: string; readonly position: number } | null;
}

type Listener = (event: PreviewPlayhead) => void;

const listeners = new Set<Listener>();

/** Listen to the preview's playhead; dispose to stop. */
export function onPreviewPlayhead(listener: Listener): { dispose(): void } {
  listeners.add(listener);
  return { dispose: () => listeners.delete(listener) };
}

/** Called by the preview panel for each playhead message. */
export function firePreviewPlayhead(event: PreviewPlayhead): void {
  for (const listener of listeners) listener(event);
}
