import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // CLI tests spawn child processes which are slow
    // Increase timeout to prevent failures when running in parallel with other packages
    testTimeout: 30000, // 30 seconds per test
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
