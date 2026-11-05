/**
 * Spec 058 Phase 2 (SC-006 precondition; plan "Test plan"): the specs that spawn
 * `bin/cli.js` run `dist/cli.mjs`, the bundle. A missing or stale bundle would test old code,
 * so they fail (never skip) with the command that rebuilds it.
 *
 * Stale = older than any file of the bundle's input graph: everything under
 * `packages/cli/src`, `packages/language/src` and `packages/shared-utils/src`, except
 * `__tests__` and `__fixtures__` directories (esbuild.mjs inlines the workspace sources).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The repo root, from `packages/cli/src/__tests__`. */
const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..'
);

const SOURCE_DIRS = ['packages/cli/src', 'packages/language/src', 'packages/shared-utils/src'];
const EXCLUDED_DIRS = new Set(['__tests__', '__fixtures__']);
const BUILD_HINT = 'run `pnpm -C packages/cli build`';

/** The newest file under `dir` (excluded directories skipped): its mtime and path. */
function newest(dir: string): { mtimeMs: number; file: string } | undefined {
  let found: { mtimeMs: number; file: string } | undefined;
  const entries = fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }) : [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const candidate = entry.isDirectory()
      ? EXCLUDED_DIRS.has(entry.name)
        ? undefined
        : newest(full)
      : { mtimeMs: fs.statSync(full).mtimeMs, file: full };
    if (candidate && (!found || candidate.mtimeMs > found.mtimeMs)) found = candidate;
  }
  return found;
}

/** Throws, naming the build command, when `packages/cli/dist/cli.mjs` is missing or stale. */
export function requireFreshBundle(root: string = REPO_ROOT): void {
  const bundle = path.join(root, 'packages', 'cli', 'dist', 'cli.mjs');
  const built = fs.statSync(bundle, { throwIfNoEntry: false });
  if (!built) {
    throw new Error(`${bundle} is missing: ${BUILD_HINT} before the spawned smoke specs`);
  }
  for (const dir of SOURCE_DIRS) {
    const source = newest(path.join(root, dir));
    if (source && source.mtimeMs > built.mtimeMs) {
      throw new Error(
        `${bundle} is older than ${source.file}: ${BUILD_HINT} before the spawned smoke specs`
      );
    }
  }
}
