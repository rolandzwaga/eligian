/*
 * For a detailed explanation regarding each configuration property and type check, visit:
 * https://vitest.dev/config/
 */

import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    deps: {
      interopDefault: true,
    },
    include: ['**/*.{test,spec}.ts'],
    coverage: {
      provider: 'v8',
      // Multiple reporter formats for different purposes:
      // - text: console output during CI
      // - json-summary: required for vitest-coverage-report-action
      // - json: detailed file-level coverage data
      // - html: local debugging and viewing
      reporter: ['text', 'json-summary', 'json', 'html'],

      // Only include source code in coverage
      include: ['src/**/*.{ts,tsx}'],

      // Exclude files that don't need coverage
      exclude: [
        'node_modules/',
        'dist/',
        'coverage/',
        'tools/',
        '**/__tests__/**',
        '**/*.spec.{ts,tsx}',
        '**/*.d.ts',
        '**/types.ts',
        '**/out/**',

        // Exclude generated files
        '**/*.generated.ts',
        '**/generated/**',

        // Exclude build-time generator scripts (not runtime code)
        '**/generate-*.ts',
        'src/compiler/operations/metadata-converter.ts',

        // Exclude type definition files (no executable code)
        'src/compiler/types/eligius-ir.ts',
        'src/type-system-typir/eligian-specifics.ts',

        // Exclude barrel exports (re-export files with no logic)
        '**/index.ts',

        // Exclude Effect-ts layer configuration (pure DI wiring, no business logic)
        'src/compiler/effects/layers.ts',

        // Exclude config and entry point files
        '*.config.{ts,js}',
        'vite.config.ts',
        'vitest.config.ts',
        'vitest.setup.ts',
      ],

      // Fix for duplicate entries with v8 provider
      clean: true,
      reportsDirectory: './coverage',

      // Coverage thresholds (Constitutional requirement: 80% for all metrics)
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
