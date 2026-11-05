/**
 * Spec 058 Phase 3 (FR-063; SC-016; plan C3): the soak test. 200 sequential `eligian_check`
 * calls through the in-process server on one fixture, with the default recycle interval
 * (N = 100). The heap is read after a forced GC before the first call and after the last:
 * the growth must stay at most 25 MB, and the lock must report exactly two recycles.
 *
 * Runs only in the `cli-soak` vitest project (`pnpm -C packages/cli run test:soak`), whose
 * workers get `--expose-gc` and `ELIGIAN_SOAK=1`; the `cli` project excludes it. Without
 * `globalThis.gc` the test fails (it never skips), so it cannot pass unmeasured.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { compilerLockLayer } from '../mcp/compiler-lock.js';
import { NAME as CHECK } from '../mcp/tools/check.js';
import { startInMemoryServer } from './mcp-test-client.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(HERE, '__fixtures__', 'mcp', 'check', 'class-never-removed');

const CALLS = 200;
const MB = 1024 * 1024;
const CEILING = 25 * MB;

const tempDirs: string[] = [];
afterAll(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

/** `heapUsed` in bytes after a forced GC. */
function heapAfterGc(gc: () => void): number {
  gc();
  gc();
  return process.memoryUsage().heapUsed;
}

describe('MCP soak (FR-063, SC-016)', () => {
  it('200 checks stay under 25 MB and recycle twice', { timeout: 300_000 }, async () => {
    const gc = (globalThis as { gc?: unknown }).gc;
    if (typeof gc !== 'function') {
      throw new Error('run pnpm -C packages/cli run test:soak: it needs --expose-gc');
    }
    const collect = gc as () => void;

    // Empty docs: the soak measures the compiler services, not the overlays
    const docsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-mcp-soak-docs-'));
    tempDirs.push(docsRoot);
    fs.writeFileSync(path.join(docsRoot, 'index.json'), '[]');
    fs.writeFileSync(path.join(docsRoot, 'overlays.json'), '{"byCode":{},"bySource":{}}');

    const recycles: number[] = [];
    const server = await startInMemoryServer({
      cwd: FIXTURE,
      docsRoot,
      lock: compilerLockLayer({
        onRecycle: async completed => {
          recycles.push(completed);
        },
      }),
    });
    try {
      const before = heapAfterGc(collect);
      for (let call = 1; call <= CALLS; call++) {
        const { isError, payload } = await server.callTool(CHECK, { paths: ['main.eligian'] });
        if (isError) throw new Error(`call ${call} failed: ${JSON.stringify(payload)}`);
      }
      const after = heapAfterGc(collect);
      console.error(
        `mcp-soak: ${CALLS} eligian_check calls; heapUsed before ${(before / MB).toFixed(2)} MB, ` +
          `after ${(after / MB).toFixed(2)} MB, growth ${((after - before) / MB).toFixed(2)} MB; ` +
          `recycles at ${JSON.stringify(recycles)}`
      );
      expect(after - before).toBeLessThanOrEqual(CEILING);
      expect(recycles).toEqual([100, 200]);
    } finally {
      await server.close();
    }
  });
});
