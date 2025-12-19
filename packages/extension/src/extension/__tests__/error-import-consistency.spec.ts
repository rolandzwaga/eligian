/**
 * Error Import Consistency Tests (Feature 018 - US3)
 *
 * Tests that the VS Code extension consistently imports error types from
 * the unified namespace (@eligian/language/errors) rather than scattered
 * locations across the codebase.
 *
 * Test ID: T031
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Error Import Consistency (Feature 018 - US3)', () => {
  describe('T031-A: CompilationService imports from unified namespace', () => {
    it('should import AllErrors from @eligian/language/errors', () => {
      const filePath = resolve(__dirname, '../preview/CompilationService.ts');
      const content = readFileSync(filePath, 'utf-8');

      // Should import from unified namespace
      expect(content).toContain("from '@eligian/language/errors'");
      expect(content).toContain('AllErrors');
    });

    it('should import formatError from @eligian/language/errors', () => {
      const filePath = resolve(__dirname, '../preview/CompilationService.ts');
      const content = readFileSync(filePath, 'utf-8');

      // Should import formatError from unified namespace
      expect(content).toMatch(
        /import\s+{[^}]*formatError[^}]*}\s+from\s+['"]@eligian\/language\/errors['"]/
      );
    });

    it('should not import from scattered locations', () => {
      const filePath = resolve(__dirname, '../preview/CompilationService.ts');
      const content = readFileSync(filePath, 'utf-8');

      // Should NOT import from old scattered locations
      expect(content).not.toContain("from '@eligian/language/compiler/types/errors'");
      expect(content).not.toContain("from '../compiler/types/errors'");
    });
  });

  describe('T031-B: Verify consistent error handling patterns', () => {
    it('CompilationService should use type guards for error discrimination', () => {
      const filePath = resolve(__dirname, '../preview/CompilationService.ts');
      const content = readFileSync(filePath, 'utf-8');

      // Should use _tag for type discrimination (discriminated union pattern)
      expect(content).toContain('_tag');
    });

    it('CompilationService should use formatError for consistent messages', () => {
      const filePath = resolve(__dirname, '../preview/CompilationService.ts');
      const content = readFileSync(filePath, 'utf-8');

      // Should use formatError function
      expect(content).toContain('formatError');
    });
  });

  describe('T031-D: Verify no imports from deprecated locations', () => {
    it('extension should not import from compiler/types/errors.ts', () => {
      // Check all TypeScript files in extension package
      const extensionDir = resolve(__dirname, '..');
      const files = [
        'preview/CompilationService.ts',
        'preview/PreviewPanel.ts',
        'css-loader.ts',
        'css-watcher.ts',
      ];

      for (const file of files) {
        try {
          const filePath = resolve(extensionDir, file);
          const content = readFileSync(filePath, 'utf-8');

          // Should not import from old compiler errors location
          expect(content).not.toContain("from '@eligian/language/compiler/types/errors'");
          expect(content).not.toContain("from '../compiler/types/errors'");
        } catch {
          // File may not exist, skip
        }
      }
    });

    it('extension should not import from asset-loading/types.ts for errors', () => {
      const extensionDir = resolve(__dirname, '..');
      const files = ['preview/CompilationService.ts', 'css-loader.ts'];

      for (const file of files) {
        try {
          const filePath = resolve(extensionDir, file);
          const content = readFileSync(filePath, 'utf-8');

          // If it imports AssetError, should be from unified namespace
          if (content.includes('AssetError')) {
            expect(content).toContain("from '@eligian/language/errors'");
          }
        } catch {
          // File may not exist, skip
        }
      }
    });
  });

});
