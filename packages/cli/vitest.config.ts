import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // CLI tests spawn child processes which are slow
    // Increase timeout to prevent failures when running in parallel with other packages
    testTimeout: 30000, // 30 seconds per test
    // `test` / `test:coverage:ci` exclude package-bin.spec.ts and run it afterwards on its own
    // (`test:bin`): its startup timings (spec 058 SC-001, SC-020) measure the bundle, not the
    // load of the parallel test workers.
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
