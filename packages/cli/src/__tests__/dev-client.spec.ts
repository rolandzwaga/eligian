// @vitest-environment jsdom
/**
 * The browser side of `eligian dev` (audit idea #23): resumes the playhead
 * after a reload, keeps it before one, swaps the styles, shows build errors.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEV_CLIENT_SCRIPT } from '../dev/client-runtime.js';

type Listener = (event: { data: string }) => void;
let listeners: Record<string, Listener>;

class FakeEventSource {
  constructor(public url: string) {}
  addEventListener(name: string, listener: Listener) {
    listeners[name] = listener;
  }
}

function fakeEngine(state: Partial<Record<string, unknown>> = {}) {
  return {
    currentTimelineUri: 'Hub',
    position: 0,
    playState: 'playing',
    switchTimeline: vi.fn().mockResolvedValue(undefined),
    seek: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    ...state,
  };
}

const run = () => new Function(DEV_CLIENT_SCRIPT)();
const flush = () => new Promise(resolve => setTimeout(resolve, 10));

describe('eligian dev client', () => {
  beforeEach(() => {
    listeners = {};
    sessionStorage.clear();
    document.head.innerHTML = '<style>.a { color: red; }</style>';
    document.body.innerHTML = '';
    vi.stubGlobal('EventSource', FakeEventSource);
  });

  it('resumes at the timeline and position kept before the reload', async () => {
    const engine = fakeEngine();
    (window as unknown as Record<string, unknown>).EligiusBundled = {
      ready: Promise.resolve(engine),
    };
    sessionStorage.setItem(
      'eligian-dev-playhead',
      JSON.stringify({ uri: 'Chapter', position: 14.2, playing: false })
    );
    run();
    await flush();
    expect(engine.switchTimeline).toHaveBeenCalledWith('Chapter', 14.2);
    expect(engine.pause).toHaveBeenCalled();
    expect(sessionStorage.getItem('eligian-dev-playhead')).toBeNull();
  });

  it('seeks within the same timeline and keeps playing', async () => {
    const engine = fakeEngine({ currentTimelineUri: 'Hub' });
    (window as unknown as Record<string, unknown>).EligiusBundled = {
      ready: Promise.resolve(engine),
    };
    sessionStorage.setItem(
      'eligian-dev-playhead',
      JSON.stringify({ uri: 'Hub', position: 3, playing: true })
    );
    run();
    await flush();
    expect(engine.seek).toHaveBeenCalledWith(3);
    expect(engine.pause).not.toHaveBeenCalled();
  });

  it('keeps the playhead before reloading', async () => {
    const engine = fakeEngine({ currentTimelineUri: 'Logic', position: 9.5, playState: 'paused' });
    (window as unknown as Record<string, unknown>).EligiusBundled = {
      ready: Promise.resolve(engine),
    };
    run();
    // jsdom does not implement reload; the state is kept before it is called
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    await listeners.reload({ data: '{}' });
    consoleError.mockRestore();
    expect(JSON.parse(sessionStorage.getItem('eligian-dev-playhead') ?? '{}')).toEqual({
      uri: 'Logic',
      position: 9.5,
      playing: false,
    });
  });

  it('swaps the styles, and shows and hides build errors', () => {
    run();
    listeners['build-error']({ data: JSON.stringify({ message: "'loop' is a keyword" }) });
    const overlay = document.getElementById('eligian-dev-overlay');
    expect(overlay?.textContent).toContain("'loop' is a keyword");
    listeners.css({ data: JSON.stringify({ css: '.a { color: blue; }' }) });
    expect(document.querySelector('style')?.textContent).toBe('.a { color: blue; }');
    expect(document.getElementById('eligian-dev-overlay')).toBeNull();
    listeners['build-error']({ data: JSON.stringify({ message: 'again' }) });
    listeners.ok({ data: '{}' });
    expect(document.getElementById('eligian-dev-overlay')).toBeNull();
  });
});
