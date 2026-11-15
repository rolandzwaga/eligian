/**
 * The media clock of `eligian smoke` (spec 058 Phase 3 FR-035–FR-038): jsdom plays no media, so
 * its HTMLMediaElement gets a fake clock that is sufficient for eligius 4.2.0's
 * VideoPositionSource. The duration is the compiled timeline's (FR-036); positions change only
 * through seeks and through real time between `play()` and `pause()`; no media file is read
 * (FR-038).
 *
 * Import constraint (plan B1, P19): this module is in every command's static import graph, so it
 * has no module-scope side effects and only type imports; the window comes in as a parameter.
 */
import type { IEngineConfiguration } from 'eligius';

/** How often a playing element advances its position and fires `timeupdate`. */
const TICK_MS = 100;

/** `HTMLMediaElement.HAVE_ENOUGH_DATA`, the ready state once loaded. */
const HAVE_ENOUGH_DATA = 4;

/** The prototype members the clock replaces (and its restore puts back). */
const MEMBERS = [
  'duration',
  'currentTime',
  'readyState',
  'seekable',
  'paused',
  'error',
  'canPlayType',
  'load',
  'play',
  'pause',
] as const;

/** The clock's state of one element. */
interface ClockState {
  loaded: boolean;
  duration: number;
  currentTime: number;
  paused: boolean;
  interval: number | undefined;
  /** `performance.now()` of the last advance while playing. */
  lastTick: number;
}

/** Durations by media source as compiled: timelines[].positionSource.sources[].src → the timeline's duration. */
export function mediaDurations(config: IEngineConfiguration): ReadonlyMap<string, number> {
  const durations = new Map<string, number>();
  for (const timeline of config.timelines) {
    if (timeline.type !== 'mediaplayer') continue;
    for (const source of timeline.positionSource?.sources ?? []) {
      durations.set(source.src, timeline.duration);
    }
  }
  return durations;
}

/**
 * The fake clock on jsdom's HTMLMediaElement (spec 058 Phase 3 FR-035): per-element state in a WeakMap.
 * Returns the function that restores the original prototype descriptors.
 */
export function installMediaClock(
  window: Window & typeof globalThis,
  durationOf: (src: string) => number | undefined
): () => void {
  const prototype = window.HTMLMediaElement.prototype;
  const originals = MEMBERS.map(
    name => [name, Object.getOwnPropertyDescriptor(prototype, name)] as const
  );
  const states = new WeakMap<HTMLMediaElement, ClockState>();
  const running = new Set<number>();

  const stateOf = (element: HTMLMediaElement): ClockState => {
    let state = states.get(element);
    if (!state) {
      state = {
        loaded: false,
        duration: Number.NaN,
        currentTime: 0,
        paused: true,
        interval: undefined,
        lastTick: 0,
      };
      states.set(element, state);
    }
    return state;
  };
  const fire = (element: HTMLMediaElement, ...names: string[]) => {
    for (const name of names) element.dispatchEvent(new window.Event(name));
  };
  const later = (element: HTMLMediaElement, ...names: string[]) => {
    window.setTimeout(() => fire(element, ...names), 0);
  };
  const stop = (state: ClockState) => {
    if (state.interval === undefined) return;
    window.clearInterval(state.interval);
    running.delete(state.interval);
    state.interval = undefined;
  };
  /** Advance a playing element by the real time since its last advance; true at its end. */
  const advance = (state: ClockState): boolean => {
    const now = window.performance.now();
    state.currentTime += (now - state.lastTick) / 1000;
    state.lastTick = now;
    if (!Number.isNaN(state.duration) && state.currentTime >= state.duration) {
      state.currentTime = state.duration;
      return true;
    }
    return false;
  };
  const clamp = (state: ClockState, position: number): number => {
    const lower = Math.max(0, Number.isFinite(position) ? position : 0);
    return Number.isNaN(state.duration) ? lower : Math.min(lower, state.duration);
  };

  const accessor = (
    name: string,
    get: (this: HTMLMediaElement) => unknown,
    set?: (this: HTMLMediaElement, value: unknown) => void
  ) => Object.defineProperty(prototype, name, { configurable: true, get, set });
  const value = (name: string, fn: (this: HTMLMediaElement, ...args: never[]) => unknown) =>
    Object.defineProperty(prototype, name, { configurable: true, writable: true, value: fn });

  accessor('duration', function () {
    return stateOf(this).duration;
  });
  accessor(
    'currentTime',
    function () {
      return stateOf(this).currentTime;
    },
    function (position) {
      const state = stateOf(this);
      state.currentTime = clamp(state, Number(position));
      state.lastTick = window.performance.now();
      fire(this, 'seeking');
      later(this, 'seeked', 'timeupdate');
    }
  );
  accessor('readyState', function () {
    return stateOf(this).loaded ? HAVE_ENOUGH_DATA : 0;
  });
  accessor('seekable', function () {
    const { loaded, duration } = stateOf(this);
    const length = loaded && !Number.isNaN(duration) ? 1 : 0;
    const bound = (end: boolean) => (index: number) => {
      if (index < 0 || index >= length) {
        throw new window.DOMException(`index ${index} is not in the ranges`, 'IndexSizeError');
      }
      return end ? duration : 0;
    };
    return { length, start: bound(false), end: bound(true) };
  });
  accessor('paused', function () {
    return stateOf(this).paused;
  });
  accessor('error', () => null);
  value('canPlayType', () => 'maybe');
  value('load', function (this: HTMLMediaElement) {
    const state = stateOf(this);
    stop(state);
    const src = this.querySelector('source')?.getAttribute('src');
    state.duration = (src ? durationOf(src) : undefined) ?? Number.NaN;
    state.currentTime = 0;
    state.paused = true;
    state.loaded = true;
    later(this, 'loadedmetadata', 'canplay');
  });
  value('play', function (this: HTMLMediaElement) {
    const state = stateOf(this);
    if (!state.paused) return Promise.resolve();
    if (state.currentTime >= state.duration) state.currentTime = 0;
    state.paused = false;
    state.lastTick = window.performance.now();
    const interval = window.setInterval(() => {
      const ended = advance(state);
      if (ended) {
        stop(state);
        state.paused = true;
      }
      fire(this, 'timeupdate', ...(ended ? ['ended'] : []));
    }, TICK_MS);
    state.interval = interval;
    running.add(interval);
    later(this, 'playing');
    return Promise.resolve();
  });
  value('pause', function (this: HTMLMediaElement) {
    const state = stateOf(this);
    if (state.paused) return;
    advance(state);
    stop(state);
    state.paused = true;
  });

  return () => {
    for (const interval of running) window.clearInterval(interval);
    running.clear();
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(prototype, name, descriptor);
      else delete (prototype as unknown as Record<string, unknown>)[name];
    }
  };
}
