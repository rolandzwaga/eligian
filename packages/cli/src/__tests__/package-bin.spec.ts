/**
 * Regression: the published `bin` entries must point at the launcher that actually
 * calls main() (bin/cli.js), not at dist/cli.mjs (which only exports main), and the
 * launcher must be part of the published files.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const pkg = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf-8')) as {
  bin: Record<string, string>;
  files: string[];
};

describe('@eligian/cli package.json bin', () => {
  test.each(['eligian', 'eligian-cli'])('%s points at the bin/cli.js launcher', name => {
    expect(pkg.bin[name]).toBe('./bin/cli.js');
    expect(existsSync(resolve(packageRoot, pkg.bin[name]))).toBe(true);
  });

  test('launcher is published and actually invokes main()', () => {
    expect(pkg.files).toContain('bin');
    const launcher = readFileSync(resolve(packageRoot, 'bin', 'cli.js'), 'utf-8');
    expect(launcher.startsWith('#!/usr/bin/env node')).toBe(true);
    expect(launcher).toMatch(/\bmain\(\)/);
  });
});
