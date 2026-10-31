/**
 * Regression tests for the webview engine lifecycle queue (audit #49).
 *
 * The preview webview's async message listener is not awaited between events,
 * so two 'initialize' messages used to run initializeEngine concurrently: the
 * second destroyed the engine the first was still initializing.
 */

import { describe, expect, test } from 'vitest';
import { createEngineLifecycleQueue } from '../engine-lifecycle-queue.js';

interface Deferred {
  promise: Promise<void>;
  resolve(): void;
  reject(error: Error): void;
}

function deferred(): Deferred {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createRecorder() {
  const log: string[] = [];
  const pending = new Map<string, Deferred>();
  let active = 0;
  let maxActive = 0;

  const run = async (name: string) => {
    active++;
    maxActive = Math.max(maxActive, active);
    log.push(`start:${name}`);
    const d = deferred();
    pending.set(name, d);
    try {
      await d.promise;
      log.push(`end:${name}`);
    } finally {
      active--;
    }
  };

  return {
    log,
    pending,
    maxActive: () => maxActive,
    handlers: {
      initialize: (config: string) => run(`init:${config}`),
      destroy: () => run('destroy'),
    },
  };
}

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

describe('createEngineLifecycleQueue', () => {
  test('does not start a second initialize while the first is still running', async () => {
    const rec = createRecorder();
    const queue = createEngineLifecycleQueue(rec.handlers);

    const first = queue.initialize('a');
    await tick();
    const second = queue.initialize('b');
    await tick();

    // 'b' must wait for 'a' to finish instead of tearing it down mid-init
    expect(rec.log).toEqual(['start:init:a']);

    rec.pending.get('init:a')?.resolve();
    await first;
    await tick();
    expect(rec.log).toEqual(['start:init:a', 'end:init:a', 'start:init:b']);

    rec.pending.get('init:b')?.resolve();
    await second;
    expect(rec.maxActive()).toBe(1);
  });

  test('skips initializations superseded before they started, so the latest config wins', async () => {
    const rec = createRecorder();
    const queue = createEngineLifecycleQueue(rec.handlers);

    const a = queue.initialize('a');
    await tick();
    const b = queue.initialize('b');
    const c = queue.initialize('c');

    rec.pending.get('init:a')?.resolve();
    await a;
    await b; // skipped
    await tick();
    rec.pending.get('init:c')?.resolve();
    await c;

    expect(rec.log).toEqual(['start:init:a', 'end:init:a', 'start:init:c', 'end:init:c']);
  });

  test('a destroy queued behind a pending initialize cancels it and runs after the current one', async () => {
    const rec = createRecorder();
    const queue = createEngineLifecycleQueue(rec.handlers);

    const a = queue.initialize('a');
    await tick();
    const b = queue.initialize('b');
    const d = queue.destroy();

    rec.pending.get('init:a')?.resolve();
    await a;
    await b;
    await tick();
    rec.pending.get('destroy')?.resolve();
    await d;

    expect(rec.log).toEqual(['start:init:a', 'end:init:a', 'start:destroy', 'end:destroy']);
  });

  test('a failing operation does not block later ones', async () => {
    const rec = createRecorder();
    const queue = createEngineLifecycleQueue(rec.handlers);

    const a = queue.initialize('a');
    await tick();
    rec.pending.get('init:a')?.reject(new Error('boom'));
    await expect(a).rejects.toThrow('boom');

    const b = queue.initialize('b');
    await tick();
    rec.pending.get('init:b')?.resolve();
    await b;

    expect(rec.log).toEqual(['start:init:a', 'start:init:b', 'end:init:b']);
  });
});
