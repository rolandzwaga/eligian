/**
 * Heap growth per `eligian_check` (spec 058 phase 1, FR-053, SC-026). Runs N (`--calls <n>`,
 * default 100) sequential `eligian_check` calls through the in-process server
 * (`startInMemoryServer`) on one fixture, reads `process.memoryUsage().heapUsed` after a
 * forced GC before the first call and after the last, and prints N, both readings, the growth
 * per call in MB and the number of compiler-service recycles (every 100 sections, phase 3
 * FR-061; the 200-call mode is the soak's, FR-063). The docs the tool reads are generated into
 * a temp dir first (deleted at the end).
 *
 * Run: `node --expose-gc --import tsx packages/cli/scripts/measure-heap.ts [--calls <n>]`
 * (stdout is the report; the server's telemetry lines go to stderr).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startInMemoryServer } from '../src/__tests__/mcp-test-client.js';
import { compilerLockLayer } from '../src/mcp/compiler-lock.js';
import { generateKnowledge } from './generate-knowledge.js';

/** `--calls <n>`: the number of calls (default 100). */
function callsArg(argv: readonly string[]): number {
  const at = argv.indexOf('--calls');
  if (at === -1) return 100;
  const n = Number(argv[at + 1]);
  if (!Number.isInteger(n) || n < 2) {
    process.stderr.write('measure-heap: --calls takes an integer of at least 2\n');
    process.exit(1);
  }
  return n;
}

const N = callsArg(process.argv.slice(2));
const MB = 1024 * 1024;

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(
  here,
  '..',
  'src',
  '__tests__',
  '__fixtures__',
  'mcp',
  'check',
  'class-never-removed'
);

/** The fixture, repo-relative with forward slashes (for the report) */
const FIXTURE_LABEL = path
  .relative(path.join(here, '..', '..', '..'), FIXTURE)
  .split(path.sep)
  .join('/');

const gc = (globalThis as { gc?: () => void }).gc;
if (gc === undefined) {
  process.stderr.write('measure-heap: run with node --expose-gc\n');
  process.exit(1);
}

/** `heapUsed` in MB after a forced GC. */
const heapAfterGc = (): number => {
  gc();
  gc();
  return process.memoryUsage().heapUsed / MB;
};

const docsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-heap-docs-'));
try {
  await generateKnowledge({ outDir: docsRoot });
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
    const before = heapAfterGc();
    let afterFirst = before;
    for (let call = 1; call <= N; call++) {
      const { isError, payload } = await server.callTool('eligian_check', {
        paths: ['main.eligian'],
      });
      if (isError) throw new Error(`call ${call} failed: ${JSON.stringify(payload)}`);
      if (call === 1) afterFirst = heapAfterGc();
    }
    const after = heapAfterGc();
    const perCall = (after - before) / N;
    const perCallAfterFirst = (after - afterFirst) / (N - 1);
    process.stdout.write(
      [
        `method: ${N} sequential eligian_check calls through startInMemoryServer on ${FIXTURE_LABEL}/main.eligian; heapUsed after a forced GC before the first call and after the last`,
        `node: ${process.version}`,
        `N: ${N}`,
        `heapUsed before (MB): ${before.toFixed(2)}`,
        `heapUsed after (MB): ${after.toFixed(2)}`,
        `growth per call (MB): ${perCall.toFixed(3)}`,
        `recycles: ${recycles.length} (after sections ${recycles.join(', ') || '-'})`,
        `(informative) heapUsed after the first call (MB): ${afterFirst.toFixed(2)}; growth per call over calls 2..${N} (MB): ${perCallAfterFirst.toFixed(3)}`,
        '',
      ].join('\n')
    );
  } finally {
    await server.close();
  }
} finally {
  fs.rmSync(docsRoot, { recursive: true, force: true });
}
