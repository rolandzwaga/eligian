/**
 * debounce-util coverage (audit low #58)
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { debounce } from '../debounce-util.js';

describe('debounce', () => {
  let timers: Map<string, NodeJS.Timeout>;

  beforeEach(() => {
    vi.useFakeTimers();
    timers = new Map();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('runs the callback once, after the delay', () => {
    const fn = vi.fn();
    debounce(timers, 'a', 300, fn);

    vi.advanceTimersByTime(299);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('a repeated call for the same key resets the timer and coalesces into one call', () => {
    const first = vi.fn();
    const second = vi.fn();
    debounce(timers, 'a', 300, first);
    vi.advanceTimersByTime(200);
    debounce(timers, 'a', 300, second);
    vi.advanceTimersByTime(200);
    expect(second).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  test('different keys run independently', () => {
    const a = vi.fn();
    const b = vi.fn();
    debounce(timers, 'a', 300, a);
    debounce(timers, 'b', 300, b);

    vi.advanceTimersByTime(300);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  test('the timer map only holds in-flight timers', () => {
    debounce(timers, 'a', 300, () => {});
    expect(timers.has('a')).toBe(true);

    vi.advanceTimersByTime(300);
    expect(timers.size).toBe(0);
  });

  test('a timer cleared by the owner never fires', () => {
    const fn = vi.fn();
    debounce(timers, 'a', 300, fn);
    for (const t of timers.values()) {
      clearTimeout(t);
    }
    vi.advanceTimersByTime(1000);

    expect(fn).not.toHaveBeenCalled();
  });
});
