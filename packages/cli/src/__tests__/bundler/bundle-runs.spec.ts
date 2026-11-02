/**
 * A built bundle plays: `createBundle` on a real program, the bundle evaluated
 * in its own jsdom window, DOMContentLoaded, then `EligiusBundled.ready`.
 *
 * The entry point registers exactly the resources the configuration names
 * with `createImporter` from `eligius/runtime`, so a name it misses fails at
 * init. Before this test a scroll timeline's `ScrollPositionSource` (a
 * timeline-level override) was missed and the bundle did not start.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Effect } from 'effect';
import { JSDOM, VirtualConsole } from 'jsdom';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createBundle } from '../../bundler/index.js';
import { stubMissingBrowserApis } from '../../smoke/dom-environment.js';

const PROGRAM = `layout "./layout.html"
styles "./styles.css"

timeline "intro" in "#stage" using raf {
  at 0s..5s [
    selectElement("#a")
    addClass("on")
    on click "#a" pause
  ] [
    selectElement("#a")
    removeClass("on")
  ]
}

timeline "story" in "#stage" using scroll "#scroller" duration 10s {
  at 0s..10s [ selectElement("#b") addClass("on") ]
}
`;

interface Bundled {
  readonly ready: Promise<{ destroy(): Promise<void> }>;
  readonly CONFIG: { timelines: unknown[] };
}

describe('a built bundle runs (createImporter from eligius/runtime)', () => {
  let dir: string;
  let bundle: string;
  let html: string;

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-bundle-runs-'));
    fs.writeFileSync(
      path.join(dir, 'layout.html'),
      '<div id="stage"><div id="scroller"><div id="a"></div><div id="b"></div></div></div>'
    );
    fs.writeFileSync(
      path.join(dir, 'styles.css'),
      '#stage {}\n#scroller {}\n#a {}\n#b {}\n.on {}\n'
    );
    fs.writeFileSync(path.join(dir, 'main.eligian'), PROGRAM);
    const result = await Effect.runPromise(
      createBundle(path.join(dir, 'main.eligian'), {
        outputDir: path.join(dir, 'out'),
        force: true,
      })
    );
    bundle = fs.readFileSync(path.join(result.outputDir, 'bundle.js'), 'utf-8');
    html = fs.readFileSync(path.join(result.outputDir, 'index.html'), 'utf-8');
  }, 60000);

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('imports from eligius/runtime only: no EligiusResourceImporter in the bundle', () => {
    expect(bundle).toContain('createImporter');
    expect(bundle).not.toContain('EligiusResourceImporter');
  });

  it('initializes and starts, the scroll timeline included', async () => {
    const errors: string[] = [];
    const virtualConsole = new VirtualConsole();
    virtualConsole.on('error', (...args: unknown[]) => errors.push(args.map(String).join(' ')));
    virtualConsole.on('jsdomError', error => errors.push(error.message));
    // The page without its script tag: the bundle is evaluated below
    const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''), {
      runScripts: 'outside-only',
      pretendToBeVisual: true,
      url: 'http://localhost/',
      virtualConsole,
    });
    const window = dom.window as unknown as Window & typeof globalThis;
    stubMissingBrowserApis(window);
    try {
      dom.window.eval(bundle);
      window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
      const bundled = (window as unknown as { EligiusBundled: Bundled }).EligiusBundled;
      expect(bundled.CONFIG.timelines).toHaveLength(2);

      const engine = await bundled.ready;
      expect(errors).toEqual([]);
      // The raf timeline's first event ran
      expect(window.document.querySelector('#a')?.classList.contains('on')).toBe(true);
      await engine.destroy();
    } finally {
      dom.window.close();
    }
  }, 30000);
});
