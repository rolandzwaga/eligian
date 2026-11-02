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

/** A timeline of the running configuration, with its compiled duration (seconds). */
export interface PlayheadTimeline {
  readonly uri: string;
  readonly duration?: number;
}

/**
 * Restore `snapshot` on a freshly initialized `engine` whose configuration has
 * `timelines`. Returns a status message for the user when the playhead could
 * not be fully restored, undefined when it was.
 *
 * - The same timeline still exists: switch to it (when the engine starts on
 *   another one) or seek, to the old position clamped to its new duration.
 * - It no longer exists: the engine stays on its first timeline, at 0s.
 * - It was playing: playback resumes.
 */
export async function restorePlayhead(
  engine: PlayheadEngine,
  snapshot: PlayheadSnapshot,
  timelines: readonly PlayheadTimeline[]
): Promise<string | undefined> {
  const target = timelines.find(timeline => timeline.uri === snapshot.timelineUri);
  if (!target) {
    return `Timeline '${snapshot.timelineUri}' no longer exists: showing '${engine.currentTimelineUri}' from the start`;
  }
  return moveTo(engine, target, snapshot.position, snapshot.playing, {
    move: error => `Could not restore the position (${error}): showing the timeline from the start`,
    play: (position, error) =>
      `Kept position ${position.toFixed(1)}s, but playback could not resume (${error})`,
  });
}

/** A request to show `timelineUri` at `position` (audit idea #5: scrubber, timeline picker, CodeLens). */
export interface PlayheadJump {
  readonly timelineUri: string;
  readonly position: number;
  /** Start playback there (otherwise the play state is left as it is) */
  readonly play: boolean;
}

/**
 * Move `engine` to `jump`: switch timeline when needed, seek to the position
 * clamped to that timeline's duration, and start playback when asked. Returns
 * a status message when that did not fully work, undefined when it did.
 */
export async function jumpTo(
  engine: PlayheadEngine,
  jump: PlayheadJump,
  timelines: readonly PlayheadTimeline[]
): Promise<string | undefined> {
  const target = timelines.find(timeline => timeline.uri === jump.timelineUri);
  if (!target) {
    return `Timeline '${jump.timelineUri}' is not in the preview: compile the file to update it`;
  }
  return moveTo(engine, target, jump.position, jump.play, {
    move: error => `Could not go to ${jump.position.toFixed(1)}s (${error})`,
    play: (position, error) =>
      `At ${position.toFixed(1)}s, but playback could not start (${error})`,
  });
}

interface MoveMessages {
  move(error: string): string;
  play(position: number, error: string): string;
}

async function moveTo(
  engine: PlayheadEngine,
  target: PlayheadTimeline,
  requested: number,
  play: boolean,
  messages: MoveMessages
): Promise<string | undefined> {
  const position = clampToDuration(engine, target, requested);
  try {
    if (target.uri !== engine.currentTimelineUri) {
      await engine.switchTimeline(target.uri, position);
    } else if (position > 0 || engine.position !== 0) {
      await engine.seek(position);
    }
  } catch (error) {
    return messages.move(errorText(error));
  }

  if (play && engine.playState !== 'playing') {
    try {
      await engine.start();
    } catch (error) {
      // e.g. a media provider whose autoplay the webview blocks
      return messages.play(position, errorText(error));
    }
  }
  return undefined;
}

/**
 * `position` within 0 and the target timeline's duration: the engine's, when it
 * is on that timeline, else the compiled one. Unknown durations do not clamp.
 */
function clampToDuration(
  engine: PlayheadEngine,
  target: PlayheadTimeline,
  position: number
): number {
  const duration = target.uri === engine.currentTimelineUri ? engine.duration : target.duration;
  const lower = Math.max(0, position);
  return duration !== undefined && Number.isFinite(duration) && duration > 0
    ? Math.min(lower, duration)
    : lower;
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
