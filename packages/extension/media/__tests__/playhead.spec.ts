/**
 * Keeping the playhead across preview reloads (audit feature idea #8).
 */
import { describe, expect, test, vi } from 'vitest';
import {
  capturePlayhead,
  jumpTo,
  KEEP_POSITION_STATE_KEY,
  keepPositionEnabled,
  type PlayheadEngine,
  restorePlayhead,
  withKeepPosition,
} from '../playhead.js';

function fakeEngine(state: Partial<PlayheadEngine> = {}) {
  const engine = {
    position: 0,
    duration: 60 as number | undefined,
    playState: 'stopped' as PlayheadEngine['playState'],
    currentTimelineUri: 'intro',
    ...state,
    seek: vi.fn(async (position: number) => position),
    switchTimeline: vi.fn(async (_uri: string, _position?: number) => {}),
    start: vi.fn(async () => {}),
  };
  return engine;
}

/** Timelines of a configuration, with optional compiled durations. */
const timelines = (...uris: string[]) => uris.map(uri => ({ uri }));

describe('capturePlayhead', () => {
  test('records the timeline, position and whether it was playing', () => {
    expect(
      capturePlayhead(
        fakeEngine({ position: 31, playState: 'playing', currentTimelineUri: 'beats' })
      )
    ).toEqual({ timelineUri: 'beats', position: 31, playing: true });
    expect(capturePlayhead(fakeEngine({ position: 12, playState: 'paused' }))).toEqual({
      timelineUri: 'intro',
      position: 12,
      playing: false,
    });
  });

  test('has nothing to keep without an engine or for a stopped engine at 0s', () => {
    expect(capturePlayhead(null)).toBeUndefined();
    expect(capturePlayhead(fakeEngine({ position: 0, playState: 'stopped' }))).toBeUndefined();
  });
});

describe('restorePlayhead', () => {
  test('seeks on the same timeline and resumes playback', async () => {
    const engine = fakeEngine();

    const status = await restorePlayhead(
      engine,
      { timelineUri: 'intro', position: 31, playing: true },
      timelines('intro', 'outro')
    );

    expect(status).toBeUndefined();
    expect(engine.seek).toHaveBeenCalledWith(31);
    expect(engine.switchTimeline).not.toHaveBeenCalled();
    expect(engine.start).toHaveBeenCalled();
  });

  test('switches to another timeline at the old position and stays paused', async () => {
    const engine = fakeEngine();

    await restorePlayhead(
      engine,
      { timelineUri: 'outro', position: 5, playing: false },
      timelines('intro', 'outro')
    );

    expect(engine.switchTimeline).toHaveBeenCalledWith('outro', 5);
    expect(engine.start).not.toHaveBeenCalled();
  });

  test('clamps the position to the new duration', async () => {
    const engine = fakeEngine({ duration: 20 });

    await restorePlayhead(
      engine,
      { timelineUri: 'intro', position: 31, playing: false },
      timelines('intro')
    );

    expect(engine.seek).toHaveBeenCalledWith(20);
  });

  test('stays on the first timeline when the old one no longer exists', async () => {
    const engine = fakeEngine();

    const status = await restorePlayhead(
      engine,
      { timelineUri: 'removed', position: 10, playing: true },
      timelines('intro')
    );

    expect(status).toBe("Timeline 'removed' no longer exists: showing 'intro' from the start");
    expect(engine.seek).not.toHaveBeenCalled();
    expect(engine.start).not.toHaveBeenCalled();
  });

  test('reports when playback cannot resume (e.g. blocked autoplay)', async () => {
    const engine = fakeEngine();
    engine.start.mockRejectedValueOnce(new Error('autoplay blocked'));

    const status = await restorePlayhead(
      engine,
      { timelineUri: 'intro', position: 3, playing: true },
      timelines('intro')
    );

    expect(status).toBe('Kept position 3.0s, but playback could not resume (autoplay blocked)');
  });

  test('reports when the position cannot be restored', async () => {
    const engine = fakeEngine();
    engine.seek.mockRejectedValueOnce(new Error('not seekable'));

    const status = await restorePlayhead(
      engine,
      { timelineUri: 'intro', position: 3, playing: true },
      timelines('intro')
    );

    expect(status).toContain('Could not restore the position (not seekable)');
    expect(engine.start).not.toHaveBeenCalled();
  });
});

describe('jumpTo (scrubber, timeline picker, Preview from here)', () => {
  test('seeks on the current timeline, also back to 0s, and starts playback', async () => {
    const engine = fakeEngine({ position: 12 });

    expect(
      await jumpTo(engine, { timelineUri: 'intro', position: 0, play: true }, timelines('intro'))
    ).toBeUndefined();

    expect(engine.seek).toHaveBeenCalledWith(0);
    expect(engine.start).toHaveBeenCalled();
  });

  test('switches timeline, clamped to the compiled duration of that timeline', async () => {
    const engine = fakeEngine({ duration: 60 });

    await jumpTo(engine, { timelineUri: 'outro', position: 45, play: false }, [
      { uri: 'intro', duration: 60 },
      { uri: 'outro', duration: 30 },
    ]);

    expect(engine.switchTimeline).toHaveBeenCalledWith('outro', 30);
    expect(engine.start).not.toHaveBeenCalled();
  });

  test('does not restart a timeline that is already playing', async () => {
    const engine = fakeEngine({ playState: 'playing', position: 5 });

    await jumpTo(engine, { timelineUri: 'intro', position: 20, play: true }, timelines('intro'));

    expect(engine.seek).toHaveBeenCalledWith(20);
    expect(engine.start).not.toHaveBeenCalled();
  });

  test('reports an unknown timeline and a failed seek', async () => {
    const engine = fakeEngine();
    expect(
      await jumpTo(engine, { timelineUri: 'gone', position: 3, play: true }, timelines('intro'))
    ).toBe("Timeline 'gone' is not in the preview: compile the file to update it");

    engine.seek.mockRejectedValueOnce(new Error('not seekable'));
    expect(
      await jumpTo(engine, { timelineUri: 'intro', position: 3, play: true }, timelines('intro'))
    ).toBe('Could not go to 3.0s (not seekable)');
    expect(engine.start).not.toHaveBeenCalled();
  });
});

describe('the "Keep position on reload" toggle', () => {
  test('is on unless switched off, and keeps other webview state', () => {
    expect(keepPositionEnabled(undefined)).toBe(true);
    expect(keepPositionEnabled({ other: 1 })).toBe(true);
    expect(keepPositionEnabled({ [KEEP_POSITION_STATE_KEY]: false })).toBe(false);

    expect(withKeepPosition({ other: 1 }, false)).toEqual({
      other: 1,
      [KEEP_POSITION_STATE_KEY]: false,
    });
    expect(withKeepPosition(undefined, true)).toEqual({ [KEEP_POSITION_STATE_KEY]: true });
  });
});
