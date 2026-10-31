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
}));

vi.mock('eligius', () => {
  class Eventbus {
    on(): () => void {
      return () => {};
    }
    broadcast(): void {}
    registerEventlistener(): () => void {
      return () => {};
    }
  }
  class EngineFactory {
    createEngine() {
      return {
        engine: {
          init: async () => {
            h.initCalls++;
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
vi.mock('video.js', () => ({}));

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
