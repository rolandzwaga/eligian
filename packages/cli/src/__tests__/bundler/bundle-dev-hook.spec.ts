/**
 * Spec 058 Phase 4 (FR-013): `createBundle` hands back the Eligian map and the
 * compiled config of the compile it bundled, so `eligian dev` can locate
 * runtime errors in the bundle it serves.
 *
 * FR-015: the generated `init` calls every `window.__eligianDevHooks` function
 * with the engine before `engine.init()`, so `eligian dev` sees position 0's errors.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Effect } from 'effect';
import { JSDOM } from 'jsdom';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createBundle } from '../../bundler/index.js';
import { DEV_HOOK_SNIPPET, generateEntryPoint } from '../../bundler/runtime-bundler.js';
import type { BundleResult } from '../../bundler/types.js';
import { stubMissingBrowserApis } from '../../smoke/dom-environment.js';

interface HookedEngine {
  on: unknown;
  init: (...args: unknown[]) => Promise<unknown>;
  position: number;
  destroy(): Promise<void>;
}

interface DevWindow {
  __eligianDevHooks?: ((engine: HookedEngine) => void)[];
  EligiusBundled: { ready: Promise<HookedEngine> };
}

const countOf = (text: string, snippet: string) => text.split(snippet).length - 1;

const PROGRAM = `layout "./layout.html"
styles "./styles.css"

timeline "intro" in "#stage" using raf {
  at 0s..5s [
    selectElement("#a")
    addClass("on")
  ] [
    selectElement("#a")
    removeClass("on")
  ]
  at 5s..10s [
    selectElement("#b")
    addClass("on")
  ] [
    selectElement("#b")
    removeClass("on")
  ]
}
`;

describe('bundle dev hook', () => {
  let dir: string;
  let outputDir: string;
  let result: BundleResult;

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-bundle-dev-hook-'));
    outputDir = path.join(dir, 'out');
    fs.writeFileSync(
      path.join(dir, 'layout.html'),
      '<div id="stage"><div id="a"></div><div id="b"></div></div>'
    );
    fs.writeFileSync(path.join(dir, 'styles.css'), '#stage {}\n#a {}\n#b {}\n.on {}\n');
    fs.writeFileSync(path.join(dir, 'main.eligian'), PROGRAM);
    result = await Effect.runPromise(
      createBundle(path.join(dir, 'main.eligian'), { outputDir, force: true })
    );
  }, 60000);

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('BundleResult carries the map and config of its compile', () => {
    const ids = (result.config.timelines ?? []).flatMap(timeline =>
      (timeline.timelineActions ?? []).map(action => action.id)
    );
    expect(ids).toHaveLength(2);
    const mapIds = Object.keys(result.map.actions);
    for (const id of ids) {
      expect(mapIds).toContain(id);
    }
    expect(result.map.source).toMatch(/main\.eligian$/);

    const bundle = fs.readFileSync(path.join(outputDir, 'bundle.js'), 'utf-8');
    for (const id of ids) {
      expect(bundle).toContain(id);
    }
  });

  /**
   * The bundle evaluated in its own jsdom window, as `bundle-runs.spec.ts` does.
   * jsdom fires its own DOMContentLoaded after construction (readyState is
   * `loading` until then), which would run the bundle's `init` a second time
   * next to the manual dispatch, so the bundle is evaluated after it.
   */
  const openBundle = async (beforeEval: (window: DevWindow) => void) => {
    const html = fs.readFileSync(path.join(outputDir, 'index.html'), 'utf-8');
    const bundle = fs.readFileSync(path.join(outputDir, 'bundle.js'), 'utf-8');
    const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''), {
      runScripts: 'outside-only',
      pretendToBeVisual: true,
      url: 'http://localhost/',
    });
    const window = dom.window as unknown as Window & typeof globalThis;
    if (window.document.readyState === 'loading') {
      await new Promise(resolve =>
        window.document.addEventListener('DOMContentLoaded', resolve, { once: true })
      );
    }
    stubMissingBrowserApis(window);
    beforeEval(window as unknown as DevWindow);
    dom.window.eval(bundle);
    window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
    return { dom, devWindow: window as unknown as DevWindow };
  };

  it('the entry point and the bundle carry DEV_HOOK_SNIPPET exactly once', () => {
    const entry = generateEntryPoint(result.config, ['selectElement', 'addClass', 'removeClass']);
    expect(countOf(entry, DEV_HOOK_SNIPPET)).toBe(1);
    const created = entry.indexOf('factory.createEngine(CONFIG);');
    const hook = entry.indexOf(DEV_HOOK_SNIPPET);
    const initCall = entry.indexOf('return engine.init()');
    expect(created).toBeGreaterThan(-1);
    expect(hook).toBeGreaterThan(created);
    expect(initCall).toBeGreaterThan(hook);

    const bundle = fs.readFileSync(path.join(outputDir, 'bundle.js'), 'utf-8');
    expect(countOf(bundle, DEV_HOOK_SNIPPET)).toBe(1);
  });

  it('calls every __eligianDevHooks function once with the engine before init', async () => {
    const order: string[] = [];
    const hook = vi.fn((engine: HookedEngine) => {
      order.push('hook');
      const init = engine.init.bind(engine);
      engine.init = (...args: unknown[]) => {
        order.push('init');
        return init(...args);
      };
    });
    const { dom, devWindow } = await openBundle(window => {
      window.__eligianDevHooks = [hook];
    });
    try {
      const engine = await devWindow.EligiusBundled.ready;
      expect(hook).toHaveBeenCalledTimes(1);
      const argument = hook.mock.calls[0][0];
      expect(typeof argument.on).toBe('function');
      expect(typeof argument.init).toBe('function');
      expect(order.slice(0, 2)).toEqual(['hook', 'init']);
      await engine.destroy();
    } finally {
      dom.window.close();
    }
  }, 30000);

  it('without the global, nothing is called and the bundle still starts', async () => {
    const { dom, devWindow } = await openBundle(() => {});
    try {
      expect(devWindow.__eligianDevHooks).toBeUndefined();
      const engine = await devWindow.EligiusBundled.ready;
      expect(typeof engine.position).toBe('number');
      await engine.destroy();
    } finally {
      dom.window.close();
    }
  }, 30000);
});
