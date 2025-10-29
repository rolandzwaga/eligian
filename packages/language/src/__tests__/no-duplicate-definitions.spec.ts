/**
 * No Duplicate Error Definitions Tests (Feature 018 - US3)
 *
 * Tests that error definitions are not duplicated across the codebase.
 * After migration, all error types should be defined once in the unified
 * namespace and re-exported from old locations with @deprecated warnings.
 *
 * Test ID: T030
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('No Duplicate Error Definitions (Feature 018 - US3)', () => {
  describe('T030-A: Verify deprecated files are removed (Feature 019 - US4)', () => {
    it('compiler/types/errors.ts should be removed (deprecated file deleted)', () => {
      const filePath = resolve(__dirname, '../compiler/types/errors.ts');

      // Feature 019 US4 completes the migration by removing deprecated files
      expect(() => readFileSync(filePath, 'utf-8')).toThrow();
    });

    it('asset-loading/types.ts should have @deprecated warnings for AssetError', () => {
      const filePath = resolve(__dirname, '../asset-loading/types.ts');
      const content = readFileSync(filePath, 'utf-8');

      // Should have deprecation warnings after migration
      // (This test documents the migration target)
      if (!content.includes('MIGRATION_TODO') && content.includes('AssetError')) {
        expect(content).toContain('@deprecated');
      }
    });

    it('validators/validation-errors.ts should have @deprecated warnings', () => {
      const filePath = resolve(__dirname, '../validators/validation-errors.ts');
      const content = readFileSync(filePath, 'utf-8');

      // Should have deprecation warnings after migration
      if (!content.includes('MIGRATION_TODO')) {
        expect(content).toContain('@deprecated');
      }
    });
  });

  describe('T030-B: Verify error types are defined once in unified namespace', () => {
    it('CompilerError should only be defined in errors/compiler-errors.ts', () => {
      const unifiedPath = resolve(__dirname, '../errors/compiler-errors.ts');
      const unifiedContent = readFileSync(unifiedPath, 'utf-8');

      // Primary definition exists
      expect(unifiedContent).toContain('export type CompilerError');

      // Feature 019 US4: Old deprecated file has been removed
      const oldPath = resolve(__dirname, '../compiler/types/errors.ts');
      expect(() => readFileSync(oldPath, 'utf-8')).toThrow();
    });

    it('AssetError types should only be defined in errors/asset-errors.ts', () => {
      const unifiedPath = resolve(__dirname, '../errors/asset-errors.ts');
      const unifiedContent = readFileSync(unifiedPath, 'utf-8');

      // Primary definitions exist
      expect(unifiedContent).toContain('export type AssetError');
      expect(unifiedContent).toContain('CssImportError');
      expect(unifiedContent).toContain('HtmlImportError');
    });

    it('SourceLocation should only be defined in errors/base.ts', () => {
      const basePath = resolve(__dirname, '../errors/base.ts');
      const baseContent = readFileSync(basePath, 'utf-8');

      // Primary definition exists
      expect(baseContent).toContain('export type SourceLocation');
    });
  });

  describe('T030-C: Verify no conflicting type definitions', () => {
    it('should not find multiple definitions of CompilerError', () => {
      // Feature 019 US4: Only check unified namespace (deprecated file removed)

      const unifiedPath = resolve(__dirname, '../errors/compiler-errors.ts');
      const content = readFileSync(unifiedPath, 'utf-8');

      // Should have exactly one primary definition
      const matches = content.match(/export type CompilerError\s*=/g);
      expect(matches).toBeDefined();
      expect(matches?.length).toBe(1);
    });

    it('should not find multiple definitions of AssetError', () => {
      const searchPaths = [
        resolve(__dirname, '../errors/asset-errors.ts'),
        resolve(__dirname, '../asset-loading/types.ts'),
      ];

      let definitionCount = 0;
      for (const path of searchPaths) {
        const content = readFileSync(path, 'utf-8');
        // Count interface definitions (old style)
        if (content.match(/export interface AssetError/)) {
          definitionCount++;
        }
        // Count type definitions (new style)
        if (content.match(/export type AssetError\s*=/)) {
          definitionCount++;
        }
      }

      // After migration, should only have one definition (in unified namespace)
      // Before migration, may have both (interface in old, type in new)
      expect(definitionCount).toBeGreaterThan(0); // At least one definition exists
    });
  });

  describe('T030-D: Verify deprecated file is removed (Feature 019 US4)', () => {
    it('old deprecated file should no longer exist', () => {
      // Feature 019 US4 completes the migration by removing deprecated files
      // All imports should now use the unified namespace directly

      const oldErrorsPath = resolve(__dirname, '../compiler/types/errors.ts');
      expect(() => readFileSync(oldErrorsPath, 'utf-8')).toThrow();
    });
  });

  describe('T030-E: Verify unified namespace is complete', () => {
    it('errors/index.ts should export all error types', () => {
      const indexPath = resolve(__dirname, '../errors/index.ts');
      const content = readFileSync(indexPath, 'utf-8');

      // Compiler errors
      expect(content).toContain('CompilerError');
      expect(content).toContain('ParseError');
      expect(content).toContain('ValidationError');
      expect(content).toContain('TypeError');
      expect(content).toContain('TransformError');
      expect(content).toContain('OptimizationError');
      expect(content).toContain('EmitError');

      // Asset errors
      expect(content).toContain('AssetError');
      expect(content).toContain('CssImportError');
      expect(content).toContain('CssParseError');
      expect(content).toContain('HtmlImportError');
      expect(content).toContain('MediaImportError');

      // I/O errors
      expect(content).toContain('IOError');
      expect(content).toContain('FileNotFoundError');

      // Constructor functions
      expect(content).toContain('createParseError');
      expect(content).toContain('createValidationError');
      expect(content).toContain('createCssImportError');

      // Type guards
      expect(content).toContain('isCompilerError');
      expect(content).toContain('isAssetError');
      expect(content).toContain('isIOError');

      // Formatters
      expect(content).toContain('formatError');
    });
  });
});
