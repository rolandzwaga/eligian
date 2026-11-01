/**
 * The webview scripts are esbuild bundles that the preview loads with a
 * classic <script>. When tsc emitted into the same folder, `tsc -b` after
 * `pnpm build` replaced out/media/preview.js with an unbundled ES module and
 * the preview stayed on "Compiling timeline...".
 *
 * The configuration check always runs; the bundle check runs once the
 * extension was built (CI builds and typechecks before it tests).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const extensionPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
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
});
