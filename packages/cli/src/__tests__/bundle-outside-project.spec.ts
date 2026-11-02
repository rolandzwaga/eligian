/**
 * Bundling a presentation that lives outside any project with node_modules.
 *
 * esbuild resolved 'eligius' and 'jquery' only from node_modules above the
 * input file, so such a bundle failed ("Could not resolve eligius") although
 * the CLI declares both as its own dependencies. The CLI's node_modules are now
 * searched after the project's. Also checks that a media timeline's source
 * file is copied into the bundle and referenced from it (audit #44).
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Effect, Exit } from 'effect';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBundle } from '../bundler/index.js';

describe('bundling outside a project', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-outside-'));
    fs.writeFileSync(path.join(dir, 's.css'), '#app {} #vid {} .on {}');
    fs.writeFileSync(path.join(dir, 'l.html'), '<div id="app"><video id="vid"></video></div>');
    fs.writeFileSync(path.join(dir, 'intro.mp4'), 'not really a video');
    fs.writeFileSync(
      path.join(dir, 'v.eligian'),
      `styles "./s.css"
layout "./l.html"
timeline "intro" in "#vid" using video from "./intro.mp4" {
  at 0s..1s [ selectElement("#app") addClass("on") ] []
}
`
    );
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('resolves the runtime from the CLI and ships the media source', async () => {
    const outputDir = path.join(dir, 'out');

    const exit = await Effect.runPromiseExit(
      createBundle(path.join(dir, 'v.eligian'), { outputDir, force: true })
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'assets', 'intro.mp4'))).toBe(true);
    const bundle = fs.readFileSync(path.join(outputDir, 'bundle.js'), 'utf-8');
    expect(bundle).toContain('"src": "assets/intro.mp4"');
  }, 30000);
});
