/**
 * Spec 058 Phase 3 (FR-063; SC-016; plan C3), made N-relative in Phase 5 (P12, plan D1b / D3):
 * the soak test, in two files that run in parallel workers (each reads its own process heap):
 * `mcp-soak-check.spec.ts` (2 × N `eligian_check` calls on one fixture) and
 * `mcp-soak-mixed.spec.ts` (FR-024, SC-015: 2 × N mixed tool calls on a copy of the tour), both
 * with the default recycle interval (N = `RECYCLE_AFTER`). The heap is read after forced GCs
 * (`heapAfterGc`): the growth must stay at most 25 MB, and the lock must report exactly two
 * recycles, at N and 2 × N sections.
 *
 * Runs only in the `cli-soak` vitest project (`pnpm -C packages/cli run test:soak`), whose
 * workers get `--expose-gc` and `ELIGIAN_SOAK=1`; the `cli` project excludes it. Without
 * `globalThis.gc` the tests fail (they never skip), so they cannot pass unmeasured.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import { RECYCLE_AFTER } from '../mcp/compiler-lock.js';

export const CALLS = 2 * RECYCLE_AFTER;
export const MB = 1024 * 1024;
export const CEILING = 25 * MB;

/** The forced GC of `--expose-gc`; throws without it */
export function requireGc(): () => void {
  const gc = (globalThis as { gc?: unknown }).gc;
  if (typeof gc !== 'function') {
    throw new Error('run pnpm -C packages/cli run test:soak: it needs --expose-gc');
  }
  return gc as () => void;
}

/** Temp dirs of this spec file, removed in `afterAll`. */
export function useTempDirs(): string[] {
  const tempDirs: string[] = [];
  afterAll(() => {
    for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
  });
  return tempDirs;
}

/** Empty docs: the soak measures the compiler services, not the overlays. */
export function emptyDocsRoot(tempDirs: string[]): string {
  const docsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-mcp-soak-docs-'));
  tempDirs.push(docsRoot);
  fs.writeFileSync(path.join(docsRoot, 'index.json'), '[]');
  fs.writeFileSync(path.join(docsRoot, 'overlays.json'), '{"byCode":{},"bySource":{}}');
  return docsRoot;
}
