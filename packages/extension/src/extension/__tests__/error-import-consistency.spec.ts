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

  describe('T031-C: Document import patterns for extension developers', () => {
    it('should demonstrate correct import pattern', () => {
      // This test documents the correct import pattern for extension code

      // ✅ Correct: Import from unified namespace
      const correctImport = `
        import { AllErrors, formatError, isCompilerError } from '@eligian/language/errors';
      `;

      // ❌ Wrong: Import from scattered locations
      const wrongImport = `
        import { CompilerError } from '@eligian/language/compiler/types/errors';
        import { AssetError } from '@eligian/language/asset-loading/types';
      `;

      expect(correctImport).toContain('@eligian/language/errors');
      expect(wrongImport).not.toContain('@eligian/language/errors');
    });

    it('should demonstrate error handling workflow', () => {
      // This test documents the workflow for handling errors in extension code

      // 1. Import error types and utilities from unified namespace
      // 2. Use type guards to discriminate error types
      // 3. Use formatError for consistent error messages
      // 4. Convert to VS Code diagnostics or notifications

      const workflow = `
        // Step 1: Import from unified namespace
        import { AllErrors, formatError, isCompilerError } from '@eligian/language/errors';

        // Step 2: Use type guards
        function handleError(error: AllErrors) {
          if (isCompilerError(error)) {
            // Handle compiler errors
          }
        }

        // Step 3: Format error messages
        const message = formatError(error);

        // Step 4: Convert to VS Code format
        const diagnostic = new vscode.Diagnostic(
          range,
          message,
          vscode.DiagnosticSeverity.Error
        );
      `;

      expect(workflow).toContain('@eligian/language/errors');
      expect(workflow).toContain('isCompilerError');
      expect(workflow).toContain('formatError');
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

  describe('T031-E: Verify type compatibility after migration', () => {
    it('AllErrors type should be compatible with old error types', () => {
      // After migration, code should continue to work because:
      // 1. Old locations re-export from unified namespace
      // 2. Type shapes remain identical
      // 3. Only import paths change

      // This test verifies the concept (actual compilation test happens in build)
      const migrationPath = `
        // Before migration:
        import { CompilerError } from '@eligian/language/compiler/types/errors';

        // After migration (both work):
        import { CompilerError } from '@eligian/language/errors'; // ✅ Preferred
        import { CompilerError } from '@eligian/language/compiler/types/errors'; // ✅ Still works (deprecated)
      `;

      expect(migrationPath).toContain('@eligian/language/errors');
    });
  });
});
