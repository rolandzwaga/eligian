/** The soak test, `eligian_check` half (see `mcp-soak-harness.ts`; FR-063, SC-016). */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { compilerLockLayer, RECYCLE_AFTER } from '../mcp/compiler-lock.js';
import { NAME as CHECK } from '../mcp/tools/check.js';
import { CALLS, CEILING, emptyDocsRoot, MB, requireGc, useTempDirs } from './mcp-soak-harness.js';
import { startInMemoryServer } from './mcp-test-client.js';
import { heapAfterGc } from './mcp-tool-mix.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(HERE, '__fixtures__', 'mcp', 'check', 'class-never-removed');

const tempDirs = useTempDirs();

describe('MCP soak (FR-063, SC-016)', () => {
  it('2 × N checks stay under 25 MB and recycle twice', { timeout: 300_000 }, async () => {
    const collect = requireGc();

    const docsRoot = emptyDocsRoot(tempDirs);

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
      expect(recycles).toEqual([RECYCLE_AFTER, 2 * RECYCLE_AFTER]);
    } finally {
      await server.close();
    }
  });
});
