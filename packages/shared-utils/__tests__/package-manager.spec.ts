/**
 * Package manager detection (spec 059 FR-041), moved from the extension's install-state helpers
 * (spec 058 phase 4 FR-035). Real temp dirs.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findPackageManager, readPackageManifest } from '../src/package-manager.js';

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-pm-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

const write = (relative: string, content: string): string => {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
};

const dir = (relative: string): string => {
  const d = path.join(root, relative);
  fs.mkdirSync(d, { recursive: true });
  return d;
};

const MARKERS = [
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
  'bun.lock',
  'package-lock.json',
  'package.json',
];

/** The walk of case (4) leaves the temp tree; fail loudly when the machine has a marker above it. */
const markerAboveTmpdir = (): string | undefined => {
  let d = path.dirname(fs.realpathSync(os.tmpdir()));
  for (;;) {
    for (const marker of MARKERS) {
      const file = path.join(d, marker);
      if (!fs.existsSync(file)) continue;
      if (marker !== 'package.json') return file;
      try {
        if (JSON.parse(fs.readFileSync(file, 'utf8')).packageManager !== undefined) return file;
      } catch {
        // not a packageManager declaration
      }
    }
    const parent = path.dirname(d);
    if (parent === d) return undefined;
    d = parent;
  }
};

describe('findPackageManager', () => {
  describe('(1) a lockfile in the folder', () => {
    it.each([
      ['pnpm-lock.yaml', 'pnpm'],
      ['yarn.lock', 'yarn'],
      ['bun.lockb', 'bun'],
      ['bun.lock', 'bun'],
      ['package-lock.json', 'npm'],
    ] as const)('%s → %s', async (lockfile, manager) => {
      const folder = dir('talk');
      write(path.join('talk', lockfile), '');
      expect(await findPackageManager(folder)).toBe(manager);
    });
  });

  describe('(2) a lockfile in an ancestor', () => {
    it('pnpm-lock.yaml two levels up → pnpm', async () => {
      write('pnpm-lock.yaml', '');
      const folder = dir(path.join('packages', 'talk'));
      expect(await findPackageManager(folder)).toBe('pnpm');
    });

    it('the nearest of two ancestors wins', async () => {
      write('pnpm-lock.yaml', '');
      write(path.join('packages', 'yarn.lock'), '');
      const folder = dir(path.join('packages', 'talk'));
      expect(await findPackageManager(folder)).toBe('yarn');
    });
  });

  describe('(3) the packageManager field', () => {
    it('an ancestor package.json with packageManager pnpm@9.0.0 and no lockfile → pnpm', async () => {
      write('package.json', JSON.stringify({ packageManager: 'pnpm@9.0.0' }));
      const folder = dir(path.join('packages', 'talk'));
      expect(await findPackageManager(folder)).toBe('pnpm');
    });

    it('in one directory a lockfile wins over the field', async () => {
      write('yarn.lock', '');
      write('package.json', JSON.stringify({ packageManager: 'pnpm@9.0.0' }));
      expect(await findPackageManager(root)).toBe('yarn');
    });
  });

  describe('(4) nothing found', () => {
    it('→ npm', async () => {
      const above = markerAboveTmpdir();
      if (above !== undefined) {
        throw new Error(
          `case (4) cannot run on this machine: ${above} sits above os.tmpdir() and decides the walk`
        );
      }
      const folder = dir('talk');
      expect(await findPackageManager(folder)).toBe('npm');
    });
  });
});

describe('readPackageManifest', () => {
  it('a missing package.json is undefined', async () => {
    expect(await readPackageManifest(root)).toBeUndefined();
  });

  it('invalid JSON is undefined', async () => {
    write('package.json', '{ not json');
    expect(await readPackageManifest(root)).toBeUndefined();
  });

  it('a JSON array is undefined', async () => {
    write('package.json', '[1, 2]');
    expect(await readPackageManifest(root)).toBeUndefined();
  });

  it('a valid object is returned', async () => {
    write('package.json', JSON.stringify({ name: 'x', version: '1.1.0' }));
    expect(await readPackageManifest(root)).toEqual({ name: 'x', version: '1.1.0' });
  });
});
