/**
 * Package manager detection (spec 059 FR-041; first written for the extension's Install command,
 * spec 058 phase 4 FR-035): walk up from a folder, per directory a lockfile wins over the
 * `packageManager` field of package.json; nothing found is npm.
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export type PackageManager = 'pnpm' | 'yarn' | 'bun' | 'npm';

const LOCKFILES: readonly (readonly [string, PackageManager])[] = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lockb', 'bun'],
  ['bun.lock', 'bun'],
  ['package-lock.json', 'npm'],
];

const PACKAGE_MANAGER_FIELD = /^(pnpm|yarn|bun|npm)@/;

const readText = async (file: string): Promise<string | undefined> => {
  try {
    return await fs.readFile(file, 'utf8');
  } catch {
    return undefined;
  }
};

const isFile = async (file: string): Promise<boolean> => {
  try {
    return (await fs.stat(file)).isFile();
  } catch {
    return false;
  }
};

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** <dir>/package.json as an object; undefined when missing, not JSON, or not a JSON object. */
export async function readPackageManifest(
  dir: string
): Promise<Record<string, unknown> | undefined> {
  const text = await readText(path.join(dir, 'package.json'));
  const manifest = text === undefined ? undefined : parseJson(text);
  return isRecord(manifest) ? manifest : undefined;
}

/** FR-035 / FR-041: walk up from folderPath; per directory a lockfile wins over `packageManager`. */
export async function findPackageManager(folderPath: string): Promise<PackageManager> {
  let dir = path.resolve(folderPath);
  for (;;) {
    for (const [lockfile, manager] of LOCKFILES) {
      if (await isFile(path.join(dir, lockfile))) return manager;
    }
    const field = (await readPackageManifest(dir))?.packageManager;
    const match = typeof field === 'string' ? PACKAGE_MANAGER_FIELD.exec(field) : null;
    if (match) return match[1] as PackageManager;
    const parent = path.dirname(dir);
    if (parent === dir) return 'npm';
    dir = parent;
  }
}
