/**
 * The npm package `eligian`: the `bin` entries point at the launcher that
 * calls main() (bin/cli.js; dist/cli.mjs only exports main), and the package
 * is self-contained: the workspace packages are bundled into dist/cli.mjs, so
 * it imports only Node built-ins and the declared dependencies, and npm packs
 * exactly the launcher, the bundle, the README and the LICENSE.
 *
 * The bundle and pack checks run once the CLI was built (CI builds first).
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const pkg = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf-8')) as {
  name: string;
  bin: Record<string, string>;
  files: string[];
  dependencies: Record<string, string>;
};
const bundlePath = resolve(packageRoot, 'dist', 'cli.mjs');
const built = existsSync(bundlePath) && existsSync(resolve(packageRoot, 'LICENSE'));

describe('the eligian npm package', () => {
  test.each(['eligian', 'eligian-cli'])('%s points at the bin/cli.js launcher', name => {
    expect(pkg.bin[name]).toBe('./bin/cli.js');
    expect(existsSync(resolve(packageRoot, pkg.bin[name]))).toBe(true);
  });

  test('launcher is published and actually invokes main()', () => {
    expect(pkg.files).toContain('bin/cli.js');
    const launcher = readFileSync(resolve(packageRoot, 'bin', 'cli.js'), 'utf-8');
    expect(launcher.startsWith('#!/usr/bin/env node')).toBe(true);
    expect(launcher).toMatch(/\bmain\(\)/);
  });

  test('depends on no workspace package (they are bundled in)', () => {
    expect(pkg.name).toBe('eligian');
    const workspace = Object.entries(pkg.dependencies).filter(
      ([name, range]) => name.startsWith('@eligian/') || range.startsWith('workspace:')
    );
    expect(workspace).toEqual([]);
  });

  test.skipIf(!built)('the bundle imports only Node built-ins and the dependencies', () => {
    const code = readFileSync(bundlePath, 'utf-8');
    const specifiers = new Set(
      [
        ...code.matchAll(/(?:^|[;\n])\s*import\s[^;'"]*?from\s*["']([^"']+)["']/g),
        ...code.matchAll(/(?:^|[;\n])\s*import\s*["']([^"']+)["']/g),
        ...code.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g),
      ].map(match => match[1])
    );
    const declared = (specifier: string) =>
      Object.keys(pkg.dependencies).some(
        name => specifier === name || specifier.startsWith(`${name}/`)
      );
    const builtin = (specifier: string) =>
      specifier.startsWith('node:') || builtinModules.includes(specifier);
    // A bundle has no relative imports: those are Eligian source in the starter templates
    const relative = (specifier: string) => specifier.startsWith('.');
    expect([...specifiers].filter(s => !builtin(s) && !declared(s) && !relative(s))).toEqual([]);
  });

  // npm starts a process of its own: slow while the other suites run in parallel
  test.skipIf(!built)(
    'npm packs the launcher, the bundle, the README and the LICENSE',
    {
      timeout: 30_000,
    },
    () => {
      // --ignore-scripts: no prepack (production build) for a listing
      const output = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
        cwd: packageRoot,
        encoding: 'utf-8',
        shell: process.platform === 'win32',
      });
      const [packed] = JSON.parse(output) as Array<{ files: Array<{ path: string }> }>;
      expect(packed.files.map(file => file.path).sort()).toEqual([
        'LICENSE',
        'README.md',
        'bin/cli.js',
        'dist/cli.mjs',
        'package.json',
      ]);
    }
  );
});
