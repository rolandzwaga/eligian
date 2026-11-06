// @vitest-environment jsdom
/**
 * The browser side of `eligian dev` (audit idea #23): resumes the playhead
 * after a reload, keeps it before one, swaps the styles, shows build errors,
 * and reports runtime errors and warnings to the server (spec 058 phase 4).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEV_CLIENT_SCRIPT } from '../dev/client-runtime.js';
import { SELECTOR_MISS } from '../smoke/engine-error-format.js';
import { createFakeEventSource } from './fake-event-source.js';

let listeners: ReturnType<typeof createFakeEventSource>['listeners'];

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

// Every run() wraps the console and adds window listeners; undo both after each test
const realConsole = { error: console.error, warn: console.warn };
let windowListeners: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  windowListeners = vi.spyOn(window, 'addEventListener');
});

afterEach(() => {
  for (const [name, listener] of windowListeners.mock.calls as [string, EventListener][]) {
    window.removeEventListener(name, listener);
  }
  windowListeners.mockRestore();
  console.error = realConsole.error;
  console.warn = realConsole.warn;
  delete (window as unknown as Record<string, unknown>).__eligianDevHooks;
});

describe('eligian dev client', () => {
  beforeEach(() => {
    const fake = createFakeEventSource();
    listeners = fake.listeners;
    sessionStorage.clear();
    document.head.innerHTML = '<style>.a { color: red; }</style>';
    document.body.innerHTML = '';
    vi.stubGlobal('EventSource', fake.FakeEventSource);
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

type Report = Record<string, unknown>;
type Hook = (engine: unknown) => void;

describe('runtime reports', () => {
  let sendBeacon: ReturnType<typeof vi.fn>;
  let originalError: ReturnType<typeof vi.spyOn>;
  let originalWarn: ReturnType<typeof vi.spyOn>;
  const nav = navigator as unknown as Record<string, unknown>;
  const win = window as unknown as Record<string, unknown>;

  const posts = (): Report[] =>
    sendBeacon.mock.calls.map(call => JSON.parse(String(call[1])) as Report);
  const kinds = () => posts().map(post => post.kind);

  beforeEach(() => {
    const fake = createFakeEventSource();
    listeners = fake.listeners;
    sessionStorage.clear();
    document.head.innerHTML = '<style>.a { color: red; }</style>';
    document.body.innerHTML = '<script data-build-id="b1"></script>';
    vi.stubGlobal('EventSource', fake.FakeEventSource);
    delete win.EligiusBundled;
    sendBeacon = vi.fn(() => true);
    nav.sendBeacon = sendBeacon;
    // Installed before run(): the wrappers capture the originals at run time
    originalError = vi.spyOn(console, 'error').mockImplementation(() => {});
    originalWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    delete nav.sendBeacon;
    vi.unstubAllGlobals();
    originalError.mockRestore();
    originalWarn.mockRestore();
  });

  function hookEngine() {
    const handlers: Record<string, (payload: unknown) => void> = {};
    const engine = {
      on: (event: string, handler: (payload: unknown) => void) => {
        handlers[event] = handler;
        return () => {};
      },
      currentTimelineUri: 'Intro',
      position: 0,
    };
    const hooks = win.__eligianDevHooks as Hook[];
    expect(hooks).toHaveLength(1);
    hooks[0](engine);
    return handlers;
  }

  const engineError = {
    actionName: 'a',
    actionId: 'id1',
    phase: 'start',
    operationSystemName: 'boom',
    operationIndex: 0,
    operationPath: [{ systemName: 'boom', index: 0 }],
    message: 'Action a (start) failed in operation boom: boom',
    cause: new Error('boom'),
  };

  it('a hook subscribes before start and posts engine errors', () => {
    run();
    const handlers = hookEngine();
    handlers.error(engineError);
    expect(posts()).toEqual([
      {
        kind: 'engine-error',
        message: 'boom',
        actionId: 'id1',
        actionName: 'a',
        phase: 'start',
        operationSystemName: 'boom',
        operationIndex: 0,
        operationPath: [{ systemName: 'boom', index: 0 }],
        timelineUri: 'Intro',
        position: 0,
        buildId: 'b1',
      },
    ]);
  });

  it('prints the engine error itself, once, without posting a console-error', () => {
    run();
    hookEngine().error(engineError);
    expect(originalError).toHaveBeenCalledTimes(1);
    expect(String(originalError.mock.calls[0][0]).startsWith('[eligian dev] ')).toBe(true);
    expect(kinds()).not.toContain('console-error');
  });

  it('console.error posts and calls through', () => {
    run();
    console.error('x');
    expect(posts()).toEqual([{ kind: 'console-error', message: 'x', buildId: 'b1' }]);
    expect(originalError).toHaveBeenCalledWith('x');
  });

  it('window errors and unhandled rejections post once each', () => {
    run();
    window.dispatchEvent(
      new window.ErrorEvent('error', { message: 'e1', filename: 'f.js', lineno: 3, colno: 4 })
    );
    expect(posts()).toEqual([
      { kind: 'window-error', message: 'e1', source: 'f.js', line: 3, column: 4, buildId: 'b1' },
    ]);
    const rejection = Object.assign(new window.Event('unhandledrejection'), {
      reason: new Error('r1'),
    });
    window.dispatchEvent(rejection);
    expect(posts()).toHaveLength(2);
    expect(posts()[1]).toEqual({ kind: 'unhandled-rejection', message: 'r1', buildId: 'b1' });
  });

  it('caps at 50 posts plus one notice', () => {
    run();
    for (let i = 0; i < 60; i++) console.error(`e${i}`);
    expect(posts()).toHaveLength(51);
    expect(posts()[49]).toEqual({ kind: 'console-error', message: 'e49', buildId: 'b1' });
    expect(posts()[50]).toEqual({
      kind: 'console-error',
      message: 'eligian dev: more errors not forwarded',
      buildId: 'b1',
    });
    expect(originalError).toHaveBeenCalledTimes(60);
  });

  it('forwards warnings, and selector misses as selector-miss', () => {
    run();
    console.warn('w');
    expect(posts()).toEqual([{ kind: 'console-warn', message: 'w', buildId: 'b1' }]);
    expect(originalWarn).toHaveBeenLastCalledWith('w');
    const miss = "selector '#x' wasn't found!";
    console.warn(miss);
    expect(posts()).toHaveLength(2);
    expect(posts()[1]).toEqual({
      kind: 'selector-miss',
      selector: '#x',
      message: miss,
      buildId: 'b1',
    });
    expect(originalWarn).toHaveBeenLastCalledWith(miss);
    expect(originalWarn).toHaveBeenCalledTimes(2);
    // Both count toward the cap: 2 warnings + 49 errors, the 51st post is the notice
    for (let i = 0; i < 49; i++) console.error(`e${i}`);
    expect(posts()).toHaveLength(51);
    expect(posts()[49]).toEqual({ kind: 'console-error', message: 'e47', buildId: 'b1' });
    expect(posts()[50].message).toBe('eligian dev: more errors not forwarded');
  });

  it('a throwing sendBeacon neither throws nor recurses', async () => {
    sendBeacon.mockImplementation(() => {
      throw new Error('beacon down');
    });
    run();
    expect(() => console.error('x')).not.toThrow();
    expect(originalError).toHaveBeenCalledTimes(1);
    expect(sendBeacon).toHaveBeenCalledTimes(1);

    delete nav.sendBeacon;
    const fetch = vi.fn(() => Promise.reject(new Error('down')));
    vi.stubGlobal('fetch', fetch);
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      expect(() => console.error('y')).not.toThrow();
      await flush();
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledWith('/__eligian/runtime', {
        method: 'POST',
        body: expect.any(String),
        keepalive: true,
      });
      const [, init] = fetch.mock.calls[0] as unknown as [string, { body: string }];
      expect(JSON.parse(init.body)).toEqual({ kind: 'console-error', message: 'y', buildId: 'b1' });
      expect(unhandled).not.toHaveBeenCalled();
      expect(originalError).toHaveBeenCalledTimes(2);
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  it('a failing resume posts one console-warn and calls through', async () => {
    const engine = fakeEngine({
      switchTimeline: vi.fn().mockRejectedValue(new Error('no such timeline')),
    });
    win.EligiusBundled = { ready: Promise.resolve(engine) };
    sessionStorage.setItem(
      'eligian-dev-playhead',
      JSON.stringify({ uri: 'Chapter', position: 14.2, playing: false })
    );
    run();
    await flush();
    const warnings = posts().filter(post => post.kind === 'console-warn');
    expect(warnings).toHaveLength(1);
    expect(String(warnings[0].message).startsWith('[eligian dev] could not resume:')).toBe(true);
    expect(originalWarn).toHaveBeenCalledTimes(1);
    expect(originalWarn.mock.calls[0][0]).toBe('[eligian dev] could not resume:');
  });

  it('the client regex and SELECTOR_MISS agree', () => {
    run();
    const samples = ["selector '#x' wasn't found!", "selector '.a b' wasn't found!", 'selector #x'];
    for (const sample of samples) {
      const before = posts().filter(post => post.kind === 'selector-miss').length;
      console.warn(sample);
      const after = posts().filter(post => post.kind === 'selector-miss').length;
      expect(after - before === 1).toBe(SELECTOR_MISS.test(sample));
    }
    expect(kinds()).toEqual(['selector-miss', 'selector-miss', 'console-warn']);
  });
});
