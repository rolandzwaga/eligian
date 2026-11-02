/**
 * The webview scripts are esbuild bundles that the preview loads with a
 * classic <script>. When tsc emitted into the same folder, `tsc -b` after
 * `pnpm build` replaced out/media/preview.js with an unbundled ES module and
 * the preview stayed on "Compiling timeline...".
 *
 * The .vsix (vsce, through the allow-list in .vscodeignore) must carry every
 * file the extension reads at runtime and nothing else: no sources, tests or
 * source maps. The Marketplace also needs an unscoped name and a PNG icon.
 *
 * The configuration checks always run; the bundle and package checks run once
 * the extension was built (CI builds and typechecks before it tests).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listFiles, PackageManager } from '@vscode/vsce';
import { describe, expect, it } from 'vitest';

const extensionPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const manifest = JSON.parse(fs.readFileSync(path.join(extensionPath, 'package.json'), 'utf-8'));
const esbuildConfig = fs.readFileSync(path.join(extensionPath, 'esbuild.mjs'), 'utf-8');
const tsconfig = JSON.parse(fs.readFileSync(path.join(extensionPath, 'tsconfig.json'), 'utf-8'));

const esbuildOutdirs = [...esbuildConfig.matchAll(/outdir:\s*'([^']+)'/g)].map(m =>
  path.resolve(extensionPath, m[1])
);
const webviewScripts = [...esbuildConfig.matchAll(/entryPoints:\s*\['media\/([\w-]+)\.ts'\]/g)].map(
  m => path.join(extensionPath, 'out', 'media', `${m[1]}.js`)
);
const built = webviewScripts.length > 0 && webviewScripts.every(file => fs.existsSync(file));

const isInside = (dir: string, parent: string): boolean => {
  const relative = path.relative(parent, dir);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};

describe('build output', () => {
  it('tsc emits outside every folder esbuild writes to', () => {
    const tscOutDir = path.resolve(extensionPath, tsconfig.compilerOptions.outDir);
    expect(esbuildOutdirs).not.toHaveLength(0);
    for (const outdir of esbuildOutdirs) {
      expect(isInside(outdir, tscOutDir), `${outdir} is inside tsc's ${tscOutDir}`).toBe(false);
    }
  });

  it.skipIf(!built)('the webview scripts are bundles, not ES modules', () => {
    for (const file of webviewScripts) {
      const code = fs.readFileSync(file, 'utf-8');
      expect(code, `${path.basename(file)} has top-level import / export`).not.toMatch(
        /^(import|export)[\s{*]/m
      );
    }
  });

  it('the manifest meets the Marketplace rules: an unscoped name, a PNG icon of 128 px or more', () => {
    expect(manifest.name).toMatch(/^[a-z0-9][a-z0-9-]*$/);
    const icon = fs.readFileSync(path.join(extensionPath, manifest.icon));
    // PNG signature, then the IHDR width and height
    expect(icon.subarray(1, 4).toString('ascii')).toBe('PNG');
    expect(icon.readUInt32BE(16)).toBeGreaterThanOrEqual(128);
    expect(icon.readUInt32BE(20)).toBeGreaterThanOrEqual(128);
    // Production builds are minified (vsce runs vscode:prepublish)
    expect(manifest.scripts['vscode:prepublish']).toBe('pnpm run build:prod');
    expect(manifest.scripts['build:prod']).toContain('esbuild.mjs --production');
  });

  it.skipIf(!built)('the .vsix carries the runtime files and nothing else', async () => {
    const files = (
      await listFiles({ cwd: extensionPath, packageManager: PackageManager.None })
    ).map(file => file.replace(/\\/g, '/'));
    // Read at runtime: the bundles, the worker and its wasm, the webview HTML
    for (const file of [
      'out/extension/main.cjs',
      'out/language/main.cjs',
      'out/extension/preview/host-bundler-worker.cjs',
      'out/esbuild.wasm',
      ...webviewScripts.map(script => `out/media/${path.basename(script)}`),
      'src/extension/preview/templates/preview.html',
      'src/extension/preview/templates/error.html',
      'src/extension/locale-editor/templates/locale-editor.html',
      'syntaxes/eligian.tmLanguage.json',
      'snippets/eligian.json',
      'language-configuration.json',
      manifest.icon,
      'README.md',
      'CHANGELOG.md',
      'LICENSE',
    ]) {
      expect(files, file).toContain(file);
    }
    const unexpected = files.filter(
      file =>
        /\.(ts|map)$/.test(file) ||
        file.startsWith('node_modules/') ||
        (file.startsWith('src/') && !/\/templates\/[\w-]+\.html$/.test(file))
    );
    expect(unexpected).toEqual([]);
  });
});
