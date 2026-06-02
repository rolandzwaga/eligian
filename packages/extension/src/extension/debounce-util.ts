/**
 * Debounce Utility
 *
 * Shared helper for the per-key "clear pending timer, schedule a new one, run
 * after the delay" pattern that was independently re-implemented by the asset
 * file watchers (`FileImportWatcherManager`) and the preview `FileWatcher`.
 */

/**
 * Debounce a callback per key, using a caller-owned timer map.
 *
 * Clears any timer already pending for `key`, then schedules `fn` to run after
 * `delay` ms. When the timer fires it first removes itself from `timers` (so the
 * map only ever holds in-flight timers) and then invokes `fn`. Calling again
 * with the same key before the delay elapses resets the timer — coalescing
 * bursts (e.g. editor auto-save) into a single trailing call. Independent keys
 * use independent timers, so unrelated files debounce in parallel.
 *
 * The caller owns the `timers` map and is responsible for clearing it on
 * disposal (e.g. `for (const t of timers.values()) clearTimeout(t)`).
 *
 * @param timers - Map of active timers, keyed by the debounce key
 * @param key - Key identifying this debounced stream (e.g. a file path)
 * @param delay - Debounce delay in milliseconds
 * @param fn - Callback to invoke once the key is idle for `delay` ms
 */
export function debounce<K>(
  timers: Map<K, NodeJS.Timeout>,
  key: K,
  delay: number,
  fn: () => void
): void {
  const existing = timers.get(key);
  if (existing) {
    clearTimeout(existing);
  }

  const timer = setTimeout(() => {
    timers.delete(key);
    fn();
  }, delay);

  timers.set(key, timer);
}
