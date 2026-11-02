/**
 * Regression tests for 2026-10-22 audit low findings #72, #73 and #77 (workspace configuration).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (...parts: string[]) => readFileSync(resolve(root, ...parts), 'utf-8');

describe('audit #73: language package export map', () => {
  it('only advertises dist bundles that esbuild.mjs actually produces', () => {
    const pkg = JSON.parse(read('packages', 'language', 'package.json'));
    const esbuildScript = read('packages', 'language', 'esbuild.mjs');
    const targets: string[] = [];
    for (const entry of Object.values(pkg.exports) as Array<{ default?: string }>) {
      if (entry.default?.startsWith('./dist/')) targets.push(entry.default);
    }
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      expect(esbuildScript, `no esbuild outfile for ${target}`).toContain(
        `outfile: '${target.replace('./', '')}'`
      );
    }
  });
});

describe('audit #77: shared-utils in the root build graph', () => {
  it('is referenced by tsconfig.build.json', () => {
    const build = JSON.parse(read('tsconfig.build.json'));
    const paths = build.references.map((r: { path: string }) => r.path);
    expect(paths).toContain('./packages/shared-utils');
  });

  it('keeps its tsbuildinfo inside dist and has a clean script', () => {
    const tsconfig = JSON.parse(read('packages', 'shared-utils', 'tsconfig.json'));
    expect(tsconfig.compilerOptions.tsBuildInfoFile).toBe('./dist/.tsbuildinfo');
    const pkg = JSON.parse(read('packages', 'shared-utils', 'package.json'));
    expect(pkg.scripts.clean).toContain('dist');
  });
});

describe('audit #72: CI enforces format, import order and warnings', () => {
  it('runs `biome ci` instead of `biome lint`', () => {
    const ci = read('.github', 'workflows', 'ci.yml');
    expect(ci).toContain('run: pnpm run ci');
    expect(ci).not.toContain('run: pnpm run lint');
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.scripts.ci).toMatch(/^biome ci\b/);
    expect(pkg.scripts.ci).toContain('--error-on-warnings');
  });
});
