/**
 * The browser environment `eligian smoke` runs presentations in: one jsdom
 * window for the whole process, installed as the global `window` / `document`
 * before Eligius is imported (jQuery binds to the window it finds when it is
 * first loaded, so the window is created once and each file gets a fresh
 * body).
 */
import type { JSDOM } from 'jsdom';

type Eligius = typeof import('eligius');

let dom: Promise<JSDOM> | undefined;
let eligius: Promise<Eligius> | undefined;

/** Messages jsdom reports (scripts it cannot run, APIs it does not implement). */
export const jsdomMessages: string[] = [];

/** The shared window, created (and made global) on first use; jsdom is imported then. */
export async function smokeWindow(): Promise<Window & typeof globalThis> {
  dom ??= import('jsdom').then(({ JSDOM, VirtualConsole }) => {
    const virtualConsole = new VirtualConsole();
    virtualConsole.on('jsdomError', error => jsdomMessages.push(error.message));
    const created = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
      pretendToBeVisual: true,
      url: 'http://localhost/',
      virtualConsole,
    });
    stubMissingBrowserApis(created.window as unknown as Window & typeof globalThis);
    installGlobals(created.window as unknown as Window & typeof globalThis);
    return created;
  });
  return (await dom).window as unknown as Window & typeof globalThis;
}

/** Eligius, imported once the window exists. */
export async function loadEligius(): Promise<Eligius> {
  await smokeWindow();
  eligius ??= import('eligius');
  return eligius;
}

/**
 * Add CSS texts to the document as `<style data-eligian-smoke>` elements in `head`, so that
 * `getComputedStyle` sees them (spec 058 FR-034 item 2); returns the function that removes them.
 */
export function injectStyles(window: Window, cssTexts: readonly string[]): () => void {
  const { document } = window;
  const styles = cssTexts.map(text => {
    const style = document.createElement('style');
    style.setAttribute('data-eligian-smoke', '');
    style.textContent = text;
    document.head.appendChild(style);
    return style;
  });
  return () => {
    for (const style of styles) style.remove();
  };
}

/**
 * jsdom has no layout and plays no media, so the browser APIs that depend on
 * them are missing or only log "Not implemented". Operations such as
 * scrollToElement would fail on that alone, so they get no-op stand-ins: a
 * smoke run checks that the presentation's operations run, not what they
 * look like.
 */
export function stubMissingBrowserApis(window: Window & typeof globalThis): void {
  const noop = () => {};
  const element = window.Element.prototype as unknown as Record<string, unknown>;
  for (const method of ['scrollIntoView', 'scrollTo', 'scrollBy', 'requestFullscreen']) {
    element[method] = noop;
  }
  window.scrollTo = noop;
  window.scrollBy = noop;
  const media = window.HTMLMediaElement.prototype as unknown as Record<string, unknown>;
  media.play = () => Promise.resolve();
  media.pause = noop;
  media.load = noop;
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: noop,
    removeEventListener: noop,
    addListener: noop,
    removeListener: noop,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  class NoopObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  const globals = window as unknown as Record<string, unknown>;
  globals.ResizeObserver ??= NoopObserver;
  globals.IntersectionObserver ??= NoopObserver;
}

/**
 * Make the window's globals (window, document, the DOM classes,
 * requestAnimationFrame, …) global, except those Node already has.
 */
function installGlobals(window: Window & typeof globalThis): void {
  const target = globalThis as Record<string, unknown>;
  const source = window as unknown as Record<string, unknown>;
  for (const key of ['window', 'document', 'self', 'navigator', 'location', 'history']) {
    if (key === 'navigator' && 'navigator' in target) {
      // Node 21+ has a read-only navigator; jQuery and Eligius only read the window's
      continue;
    }
    target[key] = key === 'window' || key === 'self' ? window : source[key];
  }
  for (const key of Object.getOwnPropertyNames(window)) {
    if (key in target || key.startsWith('_')) continue;
    const value = source[key];
    // Constructors (HTMLElement, MutationObserver, KeyboardEvent, …) and functions
    // (requestAnimationFrame, getComputedStyle, …), bound where they need the window
    if (typeof value === 'function') {
      target[key] = /^[A-Z]/.test(key)
        ? value
        : (value as (...args: never) => unknown).bind(window);
    }
  }
  // jsdom stamps animation frames with the window's clock, while Eligius' raf position source
  // (a started engine: scenarios, FR-034) compares them with the global `performance.now()`,
  // Node's, whose origin differs: frames get the global clock's time
  target.requestAnimationFrame = (callback: FrameRequestCallback) =>
    window.requestAnimationFrame(() => callback(performance.now()));
}
