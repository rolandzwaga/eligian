/**
 * Keep the playhead across preview reloads (audit feature idea #8).
 *
 * Every .eligian save recompiles and recreates the Eligius engine, which
 * restarts playback at 0s on the first timeline. The preview captures the
 * current timeline, position and play state before the old engine is
 * destroyed, and restores them on the new engine.
 */

/** The engine members the playhead needs (a subset of eligius' IEligiusEngine). */
export interface PlayheadEngine {
  readonly position: number;
  readonly duration: number | undefined;
  readonly playState: 'playing' | 'paused' | 'stopped';
  readonly currentTimelineUri: string;
  seek(position: number): Promise<number>;
  switchTimeline(uri: string, position?: number): Promise<void>;
  start(): Promise<void>;
}

export interface PlayheadSnapshot {
  readonly timelineUri: string;
  readonly position: number;
  readonly playing: boolean;
}

/**
 * The playhead of `engine`, or undefined when there is nothing to keep (no
 * engine, or a stopped engine at the start of its timeline).
 */
export function capturePlayhead(engine: PlayheadEngine | null): PlayheadSnapshot | undefined {
  if (!engine) return undefined;
  const { currentTimelineUri: timelineUri, position, playState } = engine;
  if (!timelineUri || (playState === 'stopped' && position <= 0)) return undefined;
  return { timelineUri, position, playing: playState === 'playing' };
}

/**
 * Restore `snapshot` on a freshly initialized `engine` whose configuration has
 * the timelines `timelineUris`. Returns a status message for the user when the
 * playhead could not be fully restored, undefined when it was.
 *
 * - The same timeline still exists: switch to it (when the engine starts on
 *   another one) or seek, to the old position clamped to its new duration.
 * - It no longer exists: the engine stays on its first timeline, at 0s.
 * - It was playing: playback resumes.
 */
export async function restorePlayhead(
  engine: PlayheadEngine,
  snapshot: PlayheadSnapshot,
  timelineUris: readonly string[]
): Promise<string | undefined> {
  if (!timelineUris.includes(snapshot.timelineUri)) {
    return `Timeline '${snapshot.timelineUri}' no longer exists: showing '${engine.currentTimelineUri}' from the start`;
  }

  const duration = engine.duration;
  const position =
    duration !== undefined && Number.isFinite(duration)
      ? Math.max(0, Math.min(snapshot.position, duration))
      : Math.max(0, snapshot.position);

  try {
    if (snapshot.timelineUri !== engine.currentTimelineUri) {
      await engine.switchTimeline(snapshot.timelineUri, position);
    } else if (position > 0) {
      await engine.seek(position);
    }
  } catch (error) {
    return `Could not restore the position (${errorText(error)}): showing the timeline from the start`;
  }

  if (snapshot.playing) {
    try {
      await engine.start();
    } catch (error) {
      // e.g. a media provider whose autoplay the webview blocks
      return `Kept position ${position.toFixed(1)}s, but playback could not resume (${errorText(error)})`;
    }
  }
  return undefined;
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Webview state key of the "Keep position on reload" toggle. */
export const KEEP_POSITION_STATE_KEY = 'keepPositionOnReload';

/** The toggle's value in the webview state (on unless switched off). */
export function keepPositionEnabled(state: unknown): boolean {
  const value = (state as Record<string, unknown> | undefined)?.[KEEP_POSITION_STATE_KEY];
  return value !== false;
}

/** `state` with the toggle set to `enabled`, keeping its other keys. */
export function withKeepPosition(state: unknown, enabled: boolean): Record<string, unknown> {
  const base = state && typeof state === 'object' ? (state as Record<string, unknown>) : {};
  return { ...base, [KEEP_POSITION_STATE_KEY]: enabled };
}
