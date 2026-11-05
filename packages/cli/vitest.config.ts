import { configDefaults, defineConfig } from 'vitest/config';

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
 * `mcp-soak.spec.ts` (spec 058 FR-063, SC-016): reads the heap after a forced GC, so its workers
 * get `--expose-gc`. Only `test:soak` runs it (it fails without `globalThis.gc`, never skips).
 */
const SOAK = ['src/__tests__/mcp-soak.spec.ts'];

export default defineConfig({
  test: {
    // CLI tests spawn child processes which are slow
    // Increase timeout to prevent failures when running in parallel with other packages
    testTimeout: 30000, // 30 seconds per test
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
          env: { ELIGIAN_SOAK: '1' },
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
