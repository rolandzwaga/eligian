import os from 'node:os';
import path from 'node:path';
import { configDefaults, defineConfig } from 'vitest/config';

/**
 * The brief's state directory for every test run (spec 059 phase 2, P15): a spec that forgets to
 * pass `brief: { stateDir }` writes under the temp dir, never the user's real state dir.
 */
const ELIGIAN_STATE_DIR = path.join(os.tmpdir(), 'eligian-vitest-state');

/**
 * Specs whose assertions hold a wall-clock budget for a spawned `eligian smoke` child (spec 058
 * SC-008(2): the first `timeline` line must arrive within `timeoutMs`). Under the load of the
 * parallel workers the child's start-up took over 10 s (2.9 s alone), so they run after the
 * other files, on their own, in the same run (the coverage stays one report).
 */
const TIMED = ['src/__tests__/mcp-smoke.spec.ts'];

/**
 * `package-bin.spec.ts`: its startup timings (spec 058 SC-001, SC-020) measure the bundle, not
 * the load of the other test workers. `test` / `test:coverage:ci` run the `cli` and `cli-timed`
 * projects, then `test:bin` runs this one on its own; a bare `vitest run` runs it last.
 */
const BIN = ['src/__tests__/package-bin.spec.ts'];

/**
 * `mcp-soak-{check,mixed}.spec.ts` (spec 058 FR-063, SC-016): read the heap after a forced GC, so
 * their workers get `--expose-gc`. Two files, so the two halves run in parallel workers. Only
 * `test:soak` runs them (they fail without `globalThis.gc`, never skip).
 */
const SOAK = ['src/__tests__/mcp-soak-check.spec.ts', 'src/__tests__/mcp-soak-mixed.spec.ts'];

export default defineConfig({
  test: {
    // CLI tests spawn child processes which are slow
    // Increase timeout to prevent failures when running in parallel with other packages
    testTimeout: 30000, // 30 seconds per test
    // Many specs spawn the CLI (a Node start-up each). One worker per core (32 on a workstation)
    // starts so many children at once that tests taking 3–6 s alone ran past 30 s (spec 059
    // phase 1, T029). Capped; the 4-vCPU CI runners stay under it
    maxWorkers: 8,
    env: { ELIGIAN_STATE_DIR },
    projects: [
      {
        extends: true,
        test: { name: 'cli', exclude: [...configDefaults.exclude, ...TIMED, ...BIN, ...SOAK] },
      },
      {
        extends: true,
        test: { name: 'cli-timed', include: TIMED, sequence: { groupOrder: 1 } },
      },
      {
        extends: true,
        test: { name: 'cli-bin', include: BIN, sequence: { groupOrder: 2 } },
      },
      {
        extends: true,
        test: {
          name: 'cli-soak',
          include: SOAK,
          execArgv: ['--expose-gc'],
          env: { ELIGIAN_SOAK: '1', ELIGIAN_STATE_DIR },
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/__tests__/**', 'src/**/*.d.ts', 'src/dev/client-runtime.ts'],
      reportsDirectory: './coverage',
      // Baseline (spec 058 T007 "All files" row), floored to one decimal; never lower.
      thresholds: {
        lines: 77.1,
        functions: 77.6,
        branches: 64.5,
        statements: 76.6,
      },
    },
  },
});
