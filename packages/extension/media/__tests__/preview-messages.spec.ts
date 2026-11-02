/**
 * media/preview.ts message handling (2026-10-22 audit, low findings):
 *
 * - #64 After a compile error the previous engine kept running (audio/video kept
 *   playing behind the error view) and the playback controls stayed visible.
 * - #60 showError injected compiler text with innerHTML.
 * - #52 css-reload was a no-op for a stylesheet that was not injected yet.
 *
 * Runs the real webview script against the real preview.html template, with
 * Eligius and the media libraries mocked.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

const h = vi.hoisted(() => ({
  posted: [] as Array<{ type: string; payload?: any }>,
  destroyCalls: 0,
  initCalls: 0,
  broadcasts: [] as Array<[string, unknown[]]>,
  /** Calls on the current fake engine: ['seek', 3], ['switchTimeline', 'b', 0], ['start'] */
  engineCalls: [] as unknown[][],
  /** Listeners on the current fake engine, by event name */
  engineListeners: new Map<string, (...args: any[]) => void>(),
  /** State of the next fake engine */
  engineState: { duration: 60, currentTimelineUri: 'intro' },
}));

vi.mock('eligius', () => {
  class Eventbus {
    on(): () => void {
      return () => {};
    }
    broadcast(name: string, args: unknown[]): void {
      h.broadcasts.push([name, args]);
    }
    registerEventlistener(): () => void {
      return () => {};
    }
  }
  class EngineFactory {
    createEngine() {
      return {
        engine: {
          position: 0,
          playState: 'stopped',
          ...h.engineState,
          init: async () => {
            h.initCalls++;
          },
          on(event: string, handler: (...args: any[]) => void) {
            h.engineListeners.set(event, handler);
            return () => h.engineListeners.delete(event);
          },
          async seek(position: number) {
            h.engineCalls.push(['seek', position]);
            return position;
          },
          async switchTimeline(uri: string, position?: number) {
            h.engineCalls.push(['switchTimeline', uri, position]);
          },
          async start() {
            h.engineCalls.push(['start']);
          },
        },
        destroy: async () => {
          h.destroyCalls++;
        },
      };
    }
  }
  class EligiusResourceImporter {}
  return { Eventbus, EngineFactory, EligiusResourceImporter };
});
vi.mock('jquery', () => ({ default: () => {} }));
vi.mock('lottie-web', () => ({ default: {} }));

const templatePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../src/extension/preview/templates/preview.html'
);

function loadTemplateBody(): void {
  const html = fs.readFileSync(templatePath, 'utf-8');
  const body = /<body>([\s\S]*)<\/body>/.exec(html)?.[1] ?? '';
  // Template markup only (no script tag): the script under test is imported below
  document.body.innerHTML = body.replace(/<script[\s\S]*?<\/script>/g, '');
}

function send(message: { type: string; payload?: unknown }): void {
  window.dispatchEvent(new MessageEvent('message', { data: message }));
}

const byId = (id: string): HTMLElement => document.getElementById(id)!;

beforeAll(async () => {
  (globalThis as any).acquireVsCodeApi = () => ({
    postMessage: (message: { type: string }) => h.posted.push(message),
    getState: () => undefined,
    setState: () => {},
  });
  loadTemplateBody();
  await import('../preview.js');
});

beforeEach(() => {
  loadTemplateBody();
  document.head.querySelectorAll('style[data-css-id]').forEach(tag => {
    tag.remove();
  });
  h.posted.length = 0;
  h.broadcasts.length = 0;
  h.engineCalls.length = 0;
});

describe('preview.ts showError (#64, #60)', () => {
  test('destroys the running engine and hides the playback controls', async () => {
    send({ type: 'initialize', payload: { config: { id: 'cfg' } } });
    await vi.waitFor(() =>
      expect(h.posted.some(m => m.type === 'initialized' && m.payload.success)).toBe(true)
    );
    expect(byId('controls').style.display).toBe('block');
    const destroysBefore = h.destroyCalls;

    send({
      type: 'showError',
      payload: { errors: [{ message: 'Unexpected token', severity: 'error' }], sourceFile: 's' },
    });

    await vi.waitFor(() => expect(h.destroyCalls).toBe(destroysBefore + 1));
    expect(h.posted.some(m => m.type === 'destroyed')).toBe(true);
    expect(byId('controls').style.display).toBe('none');
    expect(byId('error-container').style.display).toBe('block');
    expect(byId('eligius-container').style.display).toBe('none');
  });

  test('shows compiler text as text, not markup', async () => {
    send({
      type: 'showError',
      payload: {
        errors: [{ message: 'bad "./<b>x.html"<img src=https://x/y.png>', severity: 'error' }],
        sourceFile: '<i>story</i>.eligian',
      },
    });

    const list = byId('error-list');
    await vi.waitFor(() => expect(list.querySelector('.error-message')).not.toBeNull());
    expect(list.querySelector('b, img')).toBeNull();
    expect(list.querySelector('.error-message')?.textContent).toBe(
      'bad "./<b>x.html"<img src=https://x/y.png>'
    );
    expect(document.querySelector('#error-container h2')?.textContent).toBe(
      'Compilation Errors in <i>story</i>.eligian'
    );
  });

  test('a later successful initialize shows the controls again', async () => {
    send({ type: 'showError', payload: { errors: [{ message: 'x' }] } });
    await vi.waitFor(() => expect(byId('controls').style.display).toBe('none'));
    const initsBefore = h.initCalls;

    send({ type: 'updateConfig', payload: { config: { id: 'fixed' } } });
    send({ type: 'initialize', payload: { config: { id: 'fixed' } } });

    await vi.waitFor(() => expect(h.initCalls).toBe(initsBefore + 1));
    await vi.waitFor(() => expect(byId('controls').style.display).toBe('block'));
    expect(byId('error-container').style.display).toBe('none');
  });
});

describe('preview.ts CSS messages (#52)', () => {
  const injectedIds = () =>
    Array.from(document.head.querySelectorAll('style[data-css-id]')).map(tag =>
      tag.getAttribute('data-css-id')
    );

  test('css-load follows load order and css-reload creates a missing stylesheet', () => {
    send({ type: 'css-load', payload: { cssId: 'a', content: '.a{}', loadOrder: 0 } });
    send({ type: 'css-load', payload: { cssId: 'b', content: '.b{}', loadOrder: 1 } });
    send({ type: 'css-load', payload: { cssId: 'b', content: '.b{}', loadOrder: 0 } });
    send({ type: 'css-load', payload: { cssId: 'a', content: '.a{}', loadOrder: 1 } });
    expect(injectedIds()).toEqual(['b', 'a']);

    send({ type: 'css-reload', payload: { cssId: 'c', content: '.c{}' } });
    expect(injectedIds()).toEqual(['b', 'a', 'c']);

    send({ type: 'css-remove', payload: { cssId: 'b' } });
    expect(injectedIds()).toEqual(['a', 'c']);
  });
});

describe('preview.ts scrubber, timeline and language pickers (audit idea #5)', () => {
  const config = {
    id: 'cfg',
    language: 'en-US',
    availableLanguages: [
      { id: '1', languageCode: 'en-US', label: 'English' },
      { id: '2', languageCode: 'nl-NL', label: 'Nederlands' },
    ],
    timelines: [
      { uri: 'intro', duration: 60 },
      { uri: 'outro', duration: 30 },
    ],
  };

  async function initialize(): Promise<void> {
    const inits = h.initCalls;
    send({ type: 'initialize', payload: { config } });
    await vi.waitFor(() => expect(h.initCalls).toBe(inits + 1));
    await vi.waitFor(() =>
      expect(h.posted.some(m => m.type === 'initialized' && m.payload.success)).toBe(true)
    );
  }

  test('fills the pickers and the scrubber from the configuration', async () => {
    await initialize();

    const timelines = byId('timeline-select') as HTMLSelectElement;
    expect(Array.from(timelines.options).map(o => o.value)).toEqual(['intro', 'outro']);
    expect(timelines.value).toBe('intro');
    const languages = byId('language-select') as HTMLSelectElement;
    expect(Array.from(languages.options).map(o => o.textContent)).toEqual([
      'English (en-US)',
      'Nederlands (nl-NL)',
    ]);
    expect((byId('scrubber') as HTMLInputElement).max).toBe('60');
    expect(byId('time-readout').textContent).toBe('0.0s / 1:00.0');

    h.engineListeners.get('time')?.(12.34);
    expect(byId('time-readout').textContent).toBe('12.3s / 1:00.0');
  });

  test('a previewAt sent before the engine exists is applied once it is initialized', async () => {
    send({ type: 'destroy' });
    await vi.waitFor(() => expect(h.posted.some(m => m.type === 'destroyed')).toBe(true));

    send({ type: 'previewAt', payload: { timelineUri: 'outro', position: 45 } });
    expect(h.engineCalls).toEqual([]);
    await initialize();

    // Clamped to the compiled duration of 'outro', then played
    await vi.waitFor(() =>
      expect(h.engineCalls).toEqual([['switchTimeline', 'outro', 30], ['start']])
    );
  });

  test('previewAt on a running engine seeks and plays', async () => {
    await initialize();
    h.engineCalls.length = 0;

    send({ type: 'previewAt', payload: { timelineUri: 'intro', position: 22 } });

    await vi.waitFor(() => expect(h.engineCalls).toEqual([['seek', 22], ['start']]));
  });

  test('picking a language broadcasts language-change', async () => {
    await initialize();

    const languages = byId('language-select') as HTMLSelectElement;
    languages.value = 'nl-NL';
    languages.dispatchEvent(new Event('change', { bubbles: true }));

    expect(h.broadcasts).toContainEqual(['language-change', ['nl-NL']]);
  });
});

describe('preview.ts controls: scrubbing and switching timelines (audit idea #5)', () => {
  test('releasing the scrubber seeks, picking a timeline switches to its start', async () => {
    const inits = h.initCalls;
    send({
      type: 'initialize',
      payload: { config: { id: 'c', timelines: [{ uri: 'intro' }, { uri: 'outro' }] } },
    });
    await vi.waitFor(() => expect(h.initCalls).toBe(inits + 1));
    await vi.waitFor(() => expect(byId('timeline-select').childElementCount).toBe(2));
    h.engineCalls.length = 0;

    const scrubber = byId('scrubber') as HTMLInputElement;
    scrubber.value = '7.5';
    scrubber.dispatchEvent(new Event('input', { bubbles: true }));
    expect(byId('time-readout').textContent).toBe('7.5s / 1:00.0');
    scrubber.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(h.engineCalls).toEqual([['seek', 7.5]]));

    const timelines = byId('timeline-select') as HTMLSelectElement;
    timelines.value = 'outro';
    timelines.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() =>
      expect(h.engineCalls).toEqual([
        ['seek', 7.5],
        ['switchTimeline', 'outro', 0],
      ])
    );
  });
});

describe('preview.ts runtime errors and the playhead (audit idea #14)', () => {
  test('forwards engine errors with the failing action and operation, and the playhead', async () => {
    const inits = h.initCalls;
    send({ type: 'initialize', payload: { config: { id: 'c', timelines: [{ uri: 'intro' }] } } });
    await vi.waitFor(() => expect(h.initCalls).toBe(inits + 1));
    await vi.waitFor(() => expect(h.engineListeners.has('error')).toBe(true));
    h.posted.length = 0;

    h.engineListeners.get('error')?.({
      message: "Error in action start 'beat': boom",
      actionId: 'a1',
      actionName: 'beat',
      phase: 'start',
      operationSystemName: 'addClass',
      operationIndex: 2,
    });
    h.engineListeners.get('seekComplete')?.(4, 60);

    expect(h.posted).toContainEqual({
      type: 'runtimeError',
      payload: {
        message: "Error in action start 'beat': boom",
        actionId: 'a1',
        actionName: 'beat',
        phase: 'start',
        operationSystemName: 'addClass',
        operationIndex: 2,
        timelineUri: 'intro',
        position: 0,
      },
    });
    expect(h.posted).toContainEqual({
      type: 'playhead',
      payload: { timelineUri: 'intro', position: 4 },
    });
    expect(byId('playhead-status').textContent).toContain(
      "Runtime error: Error in action start 'beat': boom"
    );
  });
});
