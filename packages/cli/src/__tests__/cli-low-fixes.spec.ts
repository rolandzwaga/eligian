/**
 * Regression tests for the CLI low audit findings (2026-10-22):
 *  - #44 media timeline source is collected/rewritten; title is not the media path
 *  - #45 temp dir / entry file do not leak when bundling fails; I/O errors keep their cause
 *  - #46 --verbose output goes to stderr (stdout stays clean JSON)
 *  - #47 --inline-threshold is validated; --bundle --check rejected; --no-optimize honoured
 *  - #48 --force removes stale bundle output but nothing else
 *  - #69 runtime dependencies are declared
 *  - #75 engines match dependency requirements
 */

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { Cause, Effect, Exit, Option } from 'effect';
import type { IEngineConfiguration } from 'eligius';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  collectAssets,
  mapConfigAssetRefs,
  rewriteConfigAssetRefs,
} from '../bundler/asset-collector.js';
import { createBundle, deriveTitle, unsafeForceCleanupReason } from '../bundler/index.js';
import { bundleRuntime } from '../bundler/runtime-bundler.js';
import { parseInlineThreshold, validateOptionCombination } from '../cli-options.js';

const CLI_PATH = path.join(__dirname, '../../bin/cli.js');
const CLI_DIR = path.join(__dirname, '../..');
const PACKAGES_DIR = path.join(CLI_DIR, '..');

const VALID_SOURCE = `styles "./t.css"

endable action show [
  selectElement("#slide1")
  addClass("visible")
] [
  selectElement("#slide1")
  removeClass("visible")
]

timeline "t" in "#app" using raf {
  at 0s..5s show()
}
`;
const VALID_CSS = `#app { color: red; }
#slide1 { color: blue; }
.visible { color: green; }
`;

/** Write a valid program plus the stylesheet it imports */
async function writeValid(file: string): Promise<void> {
  await fsp.writeFile(file, VALID_SOURCE);
  await fsp.writeFile(path.join(path.dirname(file), 't.css'), VALID_CSS);
}

let tmpdir: string;

beforeEach(async () => {
  tmpdir = await fsp.mkdtemp(path.join(os.tmpdir(), 'eligian-low-'));
});

afterEach(async () => {
  await fsp.rm(tmpdir, { recursive: true, force: true }).catch(() => {});
});

/** Directories in the OS temp dir created by the bundler for esbuild */
function bundleTempDirs(): string[] {
  return fs.readdirSync(os.tmpdir()).filter(name => name.startsWith('eligian-bundle-'));
}

interface MediaSources {
  mediaplayer: { positionSource: { sources: Array<{ src: string; type: string }> } };
}

function mediaConfig(): IEngineConfiguration {
  return {
    containerSelector: '#v',
    timelineProviderSettings: {
      mediaplayer: {
        positionSource: {
          systemName: 'VideoPositionSource',
          selector: '#v',
          sources: [
            { src: './intro.mp4', type: 'video/mp4' },
            { src: 'https://cdn.example.com/remote.webm', type: 'video/webm' },
          ],
        },
      },
    },
    initActions: [],
    actions: [],
    eventActions: [],
    timelines: [
      {
        id: 'tl',
        uri: './intro.mp4',
        type: 'mediaplayer',
        duration: 5,
        loop: false,
        selector: '#v',
        timelineActions: [],
      },
    ],
  } as unknown as IEngineConfiguration;
}

describe('#44 media timeline sources', () => {
  it('collects positionSource.sources[].src into the manifest and skips external URLs', async () => {
    await fsp.writeFile(path.join(tmpdir, 'intro.mp4'), 'fake video');

    const manifest = await Effect.runPromise(
      collectAssets(mediaConfig(), [], tmpdir, { inlineThreshold: 51200 })
    );

    const entries = [...manifest.assets.values()];
    expect(entries).toHaveLength(1);
    expect(entries[0].sourcePath).toBe(path.join(tmpdir, 'intro.mp4'));
    expect(entries[0].inline).toBe(false);
    expect(entries[0].outputPath).toBe('assets/intro.mp4');
  });

  it('fails with AssetNotFoundError when the media file is missing', async () => {
    const exit = await Effect.runPromiseExit(
      collectAssets(mediaConfig(), [], tmpdir, { inlineThreshold: 51200 })
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const failure = Cause.findErrorOption(exit.cause);
      expect(Option.isSome(failure) && failure.value._tag).toBe('AssetNotFoundError');
    }
  });

  it('rewrites sources to the bundle path without mutating the input or touching uri', async () => {
    await fsp.writeFile(path.join(tmpdir, 'intro.mp4'), 'fake video');
    const config = mediaConfig();
    const manifest = await Effect.runPromise(
      collectAssets(config, [], tmpdir, { inlineThreshold: 51200 })
    );

    const rewritten = rewriteConfigAssetRefs(config, manifest, tmpdir);
    const sources = (rewritten.timelineProviderSettings as unknown as MediaSources).mediaplayer
      .positionSource.sources;

    expect(sources[0]).toEqual({ src: 'assets/intro.mp4', type: 'video/mp4' });
    expect(sources[1].src).toBe('https://cdn.example.com/remote.webm');
    expect(rewritten.timelines?.[0].uri).toBe('./intro.mp4');

    // Input is not mutated
    const original = (config.timelineProviderSettings as unknown as MediaSources).mediaplayer
      .positionSource.sources;
    expect(original[0].src).toBe('./intro.mp4');
  });

  it('also covers per-timeline positionSource overrides and path settings', () => {
    const config = {
      containerSelector: '#v',
      timelineProviderSettings: { lottie: { path: './anim.json' } },
      initActions: [],
      actions: [],
      eventActions: [],
      timelines: [
        { uri: 'x', type: 'mediaplayer', positionSource: { sources: [{ src: './a.webm' }] } },
      ],
    } as unknown as IEngineConfiguration;

    const seen: string[] = [];
    mapConfigAssetRefs(config, ref => {
      seen.push(ref);
      return ref;
    });
    expect(seen.sort()).toEqual(['./a.webm', './anim.json']);
  });

  describe('end to end from a .eligian video timeline', () => {
    // Needs a source whose node_modules ancestors resolve 'eligius': keep it in the package dir
    let workDir: string;

    beforeEach(async () => {
      workDir = await fsp.mkdtemp(path.join(CLI_DIR, 'out', 'media-test-'));
    });

    afterEach(async () => {
      await fsp.rm(workDir, { recursive: true, force: true }).catch(() => {});
    });

    it('emits VideoPositionSource sources and copies the media into the bundle', async () => {
      const input = path.join(workDir, 'show.eligian');
      await fsp.writeFile(
        input,
        `styles "./t.css"

action show [
  selectElement("#slide1")
]

timeline "t" in "#app" using video from "./intro.mp4" {
  at 0s..5s show()
}
`
      );
      await fsp.writeFile(path.join(workDir, 't.css'), VALID_CSS);
      await fsp.writeFile(path.join(workDir, 'intro.mp4'), 'fake video');
      const outputDir = path.join(workDir, 'bundle');

      const result = await Effect.runPromise(createBundle(input, { outputDir }));

      expect(fs.readFileSync(path.join(outputDir, 'assets', 'intro.mp4'), 'utf-8')).toBe(
        'fake video'
      );
      expect(result.files.map(f => f.path)).toContain('assets/intro.mp4');
      const bundleJs = fs.readFileSync(path.join(outputDir, 'bundle.js'), 'utf-8');
      expect(bundleJs).toContain('assets/intro.mp4');
      expect(bundleJs).toContain('video/mp4');
    });
  });

  it('does not use a media path as the page title', () => {
    expect(deriveTitle(mediaConfig(), '/x/my-show.eligian')).toBe('my-show');
  });

  it('still uses the timeline name for animation timelines', () => {
    const config = {
      timelines: [{ uri: 'Test Presentation', type: 'animation' }],
    } as unknown as IEngineConfiguration;
    expect(deriveTitle(config, '/x/my-show.eligian')).toBe('Test Presentation');
  });
});

describe('#45 temp directory cleanup and error causes', () => {
  it('bundleRuntime removes its entry file when esbuild fails', async () => {
    // tmpdir has no node_modules ancestor, so resolving 'eligius' fails
    const exit = await Effect.runPromiseExit(
      bundleRuntime({
        eligiusConfig: { containerSelector: '#app' } as unknown as IEngineConfiguration,
        usedOperations: [],
        usedProviders: [],
        minify: false,
        sourcemap: false,
        tempDir: tmpdir,
        nodePaths: [],
      })
    );

    expect(Exit.isFailure(exit)).toBe(true);
    expect(fs.readdirSync(tmpdir).filter(f => f.startsWith('entry-'))).toEqual([]);
  });

  it('createBundle removes the eligian-bundle-* temp dir when runtime bundling fails', async () => {
    const input = path.join(tmpdir, 'a.eligian');
    await writeValid(input);
    const before = new Set(bundleTempDirs());

    const exit = await Effect.runPromiseExit(
      createBundle(input, { outputDir: path.join(tmpdir, 'out'), force: true })
    );

    // The input lives outside the workspace, so 'eligius' cannot be resolved
    expect(Exit.isFailure(exit)).toBe(true);
    const leaked = bundleTempDirs().filter(name => !before.has(name));
    expect(leaked).toEqual([]);
  });

  it('includes the underlying cause when the output directory cannot be created', async () => {
    const fixture = path.join(CLI_DIR, 'src', '__tests__', '__fixtures__', 'valid-simple.eligian');
    // A regular file where the output directory should go makes mkdir fail
    const blocker = path.join(tmpdir, 'blocker');
    await fsp.writeFile(blocker, 'file');

    const exit = await Effect.runPromiseExit(
      createBundle(fixture, { outputDir: path.join(blocker, 'out'), force: true })
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const failure = Cause.findErrorOption(exit.cause);
      expect(Option.isSome(failure)).toBe(true);
      if (Option.isSome(failure)) {
        // The message names the failed step AND carries the system error text
        expect(failure.value.message).toMatch(
          /Failed to (create output directory|clean previous bundle)/
        );
        expect(failure.value.message).toMatch(/ENOTDIR|EEXIST|not a directory|ENOENT/i);
      }
    }
  });
});

describe('#46 --verbose output goes to stderr', () => {
  it('keeps stdout valid JSON for -o - -v', () => {
    const source = path.join(tmpdir, 'v.eligian');
    fs.writeFileSync(source, VALID_SOURCE);
    fs.writeFileSync(path.join(tmpdir, 't.css'), VALID_CSS);

    const run = spawnSync('node', [CLI_PATH, source, '-o', '-', '-v'], { encoding: 'utf-8' });

    expect(run.status).toBe(0);
    expect(() => JSON.parse(run.stdout)).not.toThrow();
    expect(run.stderr).toContain('Compiling');
  });
});

describe('#47 CLI option validation', () => {
  it.each(['0', '1', '51200', ' 42 '])('accepts %j as an inline threshold', value => {
    expect(parseInlineThreshold(value)).toBe(Number(value.trim()));
  });

  it.each(['8k', '10kb', '-5', '1.5', '', 'abc', '0x10', '1e3', '99999999999999999999'])(
    'rejects %j as an inline threshold',
    value => {
      expect(parseInlineThreshold(value)).toBeUndefined();
    }
  );

  it('rejects --bundle together with --check', () => {
    expect(validateOptionCombination({ bundle: true, check: true })).toMatch(/--bundle.*--check/);
    expect(validateOptionCombination({ bundle: true, check: false })).toBeUndefined();
    expect(validateOptionCombination({ bundle: false, check: true })).toBeUndefined();
  });

  it('CLI rejects a garbage --inline-threshold with a non-zero exit', () => {
    const source = path.join(tmpdir, 'v.eligian');
    fs.writeFileSync(source, VALID_SOURCE);

    const run = spawnSync('node', [CLI_PATH, source, '--inline-threshold', '8k'], {
      encoding: 'utf-8',
    });

    expect(run.status).toBe(1);
    expect(run.stderr).toContain('--inline-threshold');
  });

  it('CLI --bundle --check writes nothing and fails', () => {
    const source = path.join(tmpdir, 'v.eligian');
    const out = path.join(tmpdir, 'v.bundle');
    fs.writeFileSync(source, VALID_SOURCE);

    const run = spawnSync('node', [CLI_PATH, source, '--bundle', '--check', '-o', out], {
      encoding: 'utf-8',
    });

    expect(run.status).toBe(1);
    expect(run.stderr).toContain('cannot be combined');
    expect(fs.existsSync(out)).toBe(false);
  });
});

describe('#48 --force cleans previous bundle output', () => {
  // Needs a source whose node_modules ancestors resolve 'eligius': keep it in the package dir
  let workDir: string;

  beforeEach(async () => {
    workDir = await fsp.mkdtemp(path.join(CLI_DIR, 'out', 'force-test-'));
  });

  afterEach(async () => {
    await fsp.rm(workDir, { recursive: true, force: true }).catch(() => {});
  });

  it('removes stale assets and keeps unrelated files', async () => {
    const input = path.join(workDir, 'show.eligian');
    await writeValid(input);
    const outputDir = path.join(workDir, 'out');
    await fsp.mkdir(path.join(outputDir, 'assets'), { recursive: true });
    await fsp.writeFile(path.join(outputDir, 'assets', 'big.mp4'), 'stale');
    await fsp.writeFile(path.join(outputDir, 'bundle.js.map'), 'stale map');
    await fsp.writeFile(path.join(outputDir, 'notes.txt'), 'mine');

    await Effect.runPromise(createBundle(input, { outputDir, force: true }));

    expect(fs.existsSync(path.join(outputDir, 'assets', 'big.mp4'))).toBe(false);
    expect(fs.existsSync(path.join(outputDir, 'assets'))).toBe(false);
    expect(fs.existsSync(path.join(outputDir, 'bundle.js.map'))).toBe(false);
    expect(fs.existsSync(path.join(outputDir, 'index.html'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'bundle.js'))).toBe(true);
    expect(fs.readFileSync(path.join(outputDir, 'notes.txt'), 'utf-8')).toBe('mine');
  });

  it('never deletes source files when the output directory is the source directory', async () => {
    const input = path.join(workDir, 'show.eligian');
    await fsp.writeFile(input, VALID_SOURCE);
    await fsp.writeFile(
      path.join(workDir, 't.css'),
      `${VALID_CSS}#app { background: url(./assets/bg.png); }\n`
    );
    await fsp.mkdir(path.join(workDir, 'assets'));
    await fsp.writeFile(path.join(workDir, 'assets', 'bg.png'), 'png');
    await fsp.writeFile(path.join(workDir, 'assets', 'unreferenced.txt'), 'mine');

    const result = await Effect.runPromise(
      createBundle(input, { outputDir: workDir, force: true })
    );

    expect(result.outputDir).toBe(workDir);
    expect(fs.readFileSync(path.join(workDir, 'assets', 'bg.png'), 'utf-8')).toBe('png');
    expect(fs.readFileSync(path.join(workDir, 'assets', 'unreferenced.txt'), 'utf-8')).toBe('mine');
    expect(fs.existsSync(path.join(workDir, 'bundle.js'))).toBe(true);
  });

  it('never deletes a referenced source that lives inside <outputDir>/assets', async () => {
    const srcDir = path.join(workDir, 'src');
    const outputDir = path.join(workDir, 'site');
    await fsp.mkdir(srcDir);
    await fsp.mkdir(path.join(outputDir, 'assets'), { recursive: true });
    await fsp.writeFile(path.join(outputDir, 'assets', 'bg.png'), 'png');
    const input = path.join(srcDir, 'show.eligian');
    await fsp.writeFile(input, VALID_SOURCE);
    await fsp.writeFile(
      path.join(srcDir, 't.css'),
      `${VALID_CSS}#app { background: url(../site/assets/bg.png); }\n`
    );

    await Effect.runPromise(createBundle(input, { outputDir, force: true }));

    expect(fs.readFileSync(path.join(outputDir, 'assets', 'bg.png'), 'utf-8')).toBe('png');
  });

  it('unsafeForceCleanupReason flags the source dir, its parents and contained sources', () => {
    const base = path.join(workDir, 'project');
    const input = path.join(base, 'a.eligian');
    expect(unsafeForceCleanupReason(base, base, [input])).toContain('contains the source');
    expect(unsafeForceCleanupReason(workDir, base, [input])).toContain('contains the source');
    expect(
      unsafeForceCleanupReason(path.join(workDir, 'out'), base, [
        input,
        path.join(workDir, 'out', 'assets', 'x.png'),
      ])
    ).toContain('lies inside');
    expect(
      unsafeForceCleanupReason(path.join(workDir, 'out'), base, [
        input,
        path.join(workDir, 'out', 'assets-src', 'x.png'),
      ])
    ).toBeUndefined();
    expect(unsafeForceCleanupReason(path.join(base, 'dist'), base, [input])).toBeUndefined();
  });

  it('leaves the previous bundle intact when the rebuild fails', async () => {
    const input = path.join(workDir, 'broken.eligian');
    await fsp.writeFile(input, 'this is not valid eligian');
    const outputDir = path.join(workDir, 'out');
    await fsp.mkdir(path.join(outputDir, 'assets'), { recursive: true });
    await fsp.writeFile(path.join(outputDir, 'assets', 'keep.png'), 'old');

    const exit = await Effect.runPromiseExit(createBundle(input, { outputDir, force: true }));

    expect(Exit.isFailure(exit)).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'assets', 'keep.png'))).toBe(true);
  });
});

describe('#69 runtime dependencies are declared', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(CLI_DIR, 'package.json'), 'utf-8'));

  it.each(['effect', 'esbuild', 'eligius', 'chalk', 'commander'])('declares %s', dep => {
    expect(pkg.dependencies[dep]).toBeTruthy();
  });
});

describe('#75 engines match dependency requirements', () => {
  const read = (pkgDir: string) =>
    JSON.parse(fs.readFileSync(path.join(PACKAGES_DIR, pkgDir, 'package.json'), 'utf-8'));

  it('cli requires Node >= 22.12 (commander 15 / chalk 6) and has no npm engine', () => {
    const { engines } = read('cli');
    expect(engines.node).toBe('>=22.12.0');
    expect(engines.npm).toBeUndefined();
  });

  it('language has no npm engine (pnpm-only repo)', () => {
    expect(read('language').engines.npm).toBeUndefined();
  });

  it('extension engines.vscode is not older than @types/vscode', () => {
    const ext = read('extension');
    const engineMin = ext.engines.vscode.replace(/^[\^~>=]+/, '');
    const typesVersion = ext.devDependencies['@types/vscode'].replace(/^[\^~>=]+/, '');
    const pa = engineMin.split('.').map(Number);
    const pb = typesVersion.split('.').map(Number);
    let diff = 0;
    for (let i = 0; i < 3 && diff === 0; i++) {
      diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    }
    expect(diff).toBeGreaterThanOrEqual(0);
  });
});
