/**
 * Spec 058 Phase 3 (FR-063; SC-016; plan C3), made N-relative in Phase 5 (P12, plan D1b / D3):
 * the soak test. 2 × N sequential `eligian_check` calls through the in-process server on one
 * fixture, with the default recycle interval (N = `RECYCLE_AFTER`). The heap is read after forced
 * GCs (`heapAfterGc`) before the first call and after the last: the growth must stay at most
 * 25 MB, and the lock must report exactly two recycles, at N and 2 × N sections. A second case (FR-024,
 * SC-015) does the same with 2 × N mixed tool calls (FR-022's rotation) on a copy of the tour.
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
import { compilerLockLayer, RECYCLE_AFTER } from '../mcp/compiler-lock.js';
import { NAME as CHECK } from '../mcp/tools/check.js';
import { startInMemoryServer } from './mcp-test-client.js';
import { copyProject, heapAfterGc, mixCall, toolMix } from './mcp-tool-mix.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(HERE, '__fixtures__', 'mcp', 'check', 'class-never-removed');
const TOUR = path.resolve(HERE, '..', '..', '..', '..', 'examples', 'eligian-tour');

const CALLS = 2 * RECYCLE_AFTER;
const MB = 1024 * 1024;
const CEILING = 25 * MB;

const tempDirs: string[] = [];
afterAll(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

/** Empty docs: the soak measures the compiler services, not the overlays. */
function emptyDocsRoot(): string {
  const docsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-mcp-soak-docs-'));
  tempDirs.push(docsRoot);
  fs.writeFileSync(path.join(docsRoot, 'index.json'), '[]');
  fs.writeFileSync(path.join(docsRoot, 'overlays.json'), '{"byCode":{},"bySource":{}}');
  return docsRoot;
}

describe('MCP soak (FR-063, SC-016)', () => {
  it('2 × N checks stay under 25 MB and recycle twice', { timeout: 300_000 }, async () => {
    const gc = (globalThis as { gc?: unknown }).gc;
    if (typeof gc !== 'function') {
      throw new Error('run pnpm -C packages/cli run test:soak: it needs --expose-gc');
    }
    const collect = gc as () => void;

    const docsRoot = emptyDocsRoot();

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

  it('2 × N mixed tool calls on the tour stay under 25 MB, sections = calls, recycles = ⌊sections / N⌋', {
    timeout: 900_000,
  }, async () => {
    const gc = (globalThis as { gc?: unknown }).gc;
    if (typeof gc !== 'function') {
      throw new Error('run pnpm -C packages/cli run test:soak: it needs --expose-gc');
    }
    const collect = gc as () => void;

    const project = copyProject(TOUR);
    tempDirs.push(project);
    const docsRoot = emptyDocsRoot();

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
