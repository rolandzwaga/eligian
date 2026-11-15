/** The soak test, mixed-tools half (see `mcp-soak-harness.ts`; FR-024, SC-015). */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { compilerLockLayer, RECYCLE_AFTER } from '../mcp/compiler-lock.js';
import { CALLS, CEILING, emptyDocsRoot, MB, requireGc, useTempDirs } from './mcp-soak-harness.js';
import { startInMemoryServer } from './mcp-test-client.js';
import { copyProject, heapAfterGc, mixCall, toolMix } from './mcp-tool-mix.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOUR = path.resolve(HERE, '..', '..', '..', '..', 'examples', 'eligian-tour');

const tempDirs = useTempDirs();

describe('MCP soak (FR-024, SC-015)', () => {
  it('2 × N mixed tool calls on the tour stay under 25 MB, sections = calls, recycles = ⌊sections / N⌋', {
    timeout: 900_000,
  }, async () => {
    const collect = requireGc();

    const project = copyProject(TOUR);
    tempDirs.push(project);
    const docsRoot = emptyDocsRoot(tempDirs);

    let sections = 0;
    const recycles: number[] = [];
    const server = await startInMemoryServer({
      cwd: project,
      docsRoot,
      lock: compilerLockLayer({
        onAcquire: () => {
          sections++;
        },
        onRecycle: async completed => {
          recycles.push(completed);
        },
      }),
    });
    try {
      const mix = toolMix('tour.eligian');
      const started = Date.now();
      // Ruling of 2026-11-06 (T020): growth is measured from after the warm-up round (one call
      // per tool, counted in CALLS); the cold start loads the compiler, docs and registry once
      let before = Number.NaN;
      for (let i = 0; i < CALLS; i++) {
        if (i === mix.length) before = heapAfterGc(collect);
        const call = mixCall(mix, i, recycles.length);
        const { isError, payload } = await server.callTool(call.name, call.args);
        if (isError) {
          throw new Error(`call ${i} (${call.name}) failed: ${JSON.stringify(payload)}`);
        }
      }
      const after = heapAfterGc(collect);
      const wall = (Date.now() - started) / 1000;
      console.error(
        `mcp-soak mixed: ${CALLS} calls; growth ${((after - before) / MB).toFixed(2)} MB; ` +
          `sections ${sections}; recycles at ${JSON.stringify(recycles)}; wall ${wall.toFixed(1)} s`
      );
      expect(sections).toBe(2 * RECYCLE_AFTER);
      expect(recycles.length).toBe(Math.floor(sections / RECYCLE_AFTER));
      expect(recycles).toEqual([RECYCLE_AFTER, 2 * RECYCLE_AFTER]);
      expect(after - before).toBeLessThanOrEqual(CEILING);
    } finally {
      await server.close();
    }
  });
});
