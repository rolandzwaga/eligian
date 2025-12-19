import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // CLI tests spawn child processes which are slow
    // Increase timeout to prevent failures when running in parallel with other packages
    testTimeout: 30000, // 30 seconds per test
  },
});
