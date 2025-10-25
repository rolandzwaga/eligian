/**
 * Unit Tests: Default Import Validator
 *
 * Tests the pure validateDefaultImports() function in isolation.
 * These tests verify duplicate default import detection without Langium dependencies.
 *
 * @group unit
 * @group validators
 */

import { describe, expect, test } from 'vitest';
import type { DefaultImport } from '../../generated/ast.js';
import { validateDefaultImports } from '../default-import-validator.js';

/**
 * Helper: Create mock DefaultImport node
 */
function createDefaultImport(type: 'layout' | 'styles' | 'provider', path: string): DefaultImport {
  return {
    $type: 'DefaultImport',
    type,
    path,
    $container: undefined as any,
    $containerProperty: undefined,
    $containerIndex: undefined,
    $cstNode: undefined,
    $document: undefined,
  };
}

describe('validateDefaultImports() - T023', () => {
  describe('No duplicates (valid)', () => {
    test('should return empty map for single layout import', () => {
      const imports = [createDefaultImport('layout', './layout.html')];
      const errors = validateDefaultImports(imports);

      expect(errors.size).toBe(0);
    });

    test('should return empty map for single styles import', () => {
      const imports = [createDefaultImport('styles', './main.css')];
      const errors = validateDefaultImports(imports);

      expect(errors.size).toBe(0);
    });

    test('should return empty map for single provider import', () => {
      const imports = [createDefaultImport('provider', './video.mp4')];
      const errors = validateDefaultImports(imports);

      expect(errors.size).toBe(0);
    });

    test('should return empty map for all three types (no duplicates)', () => {
      const imports = [
        createDefaultImport('layout', './layout.html'),
        createDefaultImport('styles', './main.css'),
        createDefaultImport('provider', './video.mp4'),
      ];
      const errors = validateDefaultImports(imports);

      expect(errors.size).toBe(0);
    });

    test('should accept empty array', () => {
      const imports: DefaultImport[] = [];
      const errors = validateDefaultImports(imports);

      expect(errors.size).toBe(0);
    });
  });

  describe('Duplicate layout imports', () => {
    test('should return error for duplicate layout imports', () => {
      const layout1 = createDefaultImport('layout', './layout1.html');
      const layout2 = createDefaultImport('layout', './layout2.html');
      const imports = [layout1, layout2];

      const errors = validateDefaultImports(imports);

      expect(errors.size).toBe(1);
      expect(errors.has(layout2)).toBe(true);

      const error = errors.get(layout2);
      expect(error?.code).toBe('DUPLICATE_DEFAULT_IMPORT');
      expect(error?.importType).toBe('layout');
      expect(error?.message).toContain('layout');
      expect(error?.message).toContain('Duplicate');
    });

    test('should return error for multiple duplicate layouts', () => {
      const layout1 = createDefaultImport('layout', './layout1.html');
      const layout2 = createDefaultImport('layout', './layout2.html');
      const layout3 = createDefaultImport('layout', './layout3.html');
      const imports = [layout1, layout2, layout3];

      const errors = validateDefaultImports(imports);

      expect(errors.size).toBe(2);
      expect(errors.has(layout2)).toBe(true);
      expect(errors.has(layout3)).toBe(true);
      expect(errors.has(layout1)).toBe(false); // First one is not an error
    });
  });

  describe('Duplicate styles imports', () => {
    test('should return error for duplicate styles imports', () => {
      const styles1 = createDefaultImport('styles', './main.css');
      const styles2 = createDefaultImport('styles', './theme.css');
      const imports = [styles1, styles2];

      const errors = validateDefaultImports(imports);

      expect(errors.size).toBe(1);
      expect(errors.has(styles2)).toBe(true);

      const error = errors.get(styles2);
      expect(error?.code).toBe('DUPLICATE_DEFAULT_IMPORT');
      expect(error?.importType).toBe('styles');
      expect(error?.message).toContain('styles');
    });
  });

  describe('Duplicate provider imports', () => {
    test('should return error for duplicate provider imports', () => {
      const provider1 = createDefaultImport('provider', './video1.mp4');
      const provider2 = createDefaultImport('provider', './video2.mp4');
      const imports = [provider1, provider2];

      const errors = validateDefaultImports(imports);

      expect(errors.size).toBe(1);
      expect(errors.has(provider2)).toBe(true);

      const error = errors.get(provider2);
      expect(error?.code).toBe('DUPLICATE_DEFAULT_IMPORT');
      expect(error?.importType).toBe('provider');
      expect(error?.message).toContain('provider');
    });
  });

  describe('Mixed types with duplicates', () => {
    test('should only error on duplicate types, not mixed', () => {
      const layout1 = createDefaultImport('layout', './layout1.html');
      const layout2 = createDefaultImport('layout', './layout2.html');
      const styles1 = createDefaultImport('styles', './main.css');
      const provider1 = createDefaultImport('provider', './video.mp4');
      const imports = [layout1, styles1, layout2, provider1];

      const errors = validateDefaultImports(imports);

      expect(errors.size).toBe(1);
      expect(errors.has(layout2)).toBe(true);
      expect(errors.has(styles1)).toBe(false);
      expect(errors.has(provider1)).toBe(false);
    });

    test('should detect duplicates across all types', () => {
      const layout1 = createDefaultImport('layout', './layout1.html');
      const layout2 = createDefaultImport('layout', './layout2.html');
      const styles1 = createDefaultImport('styles', './main.css');
      const styles2 = createDefaultImport('styles', './theme.css');
      const provider1 = createDefaultImport('provider', './video1.mp4');
      const provider2 = createDefaultImport('provider', './video2.mp4');
      const imports = [layout1, styles1, provider1, layout2, styles2, provider2];

      const errors = validateDefaultImports(imports);

      expect(errors.size).toBe(3);
      expect(errors.has(layout2)).toBe(true);
      expect(errors.has(styles2)).toBe(true);
      expect(errors.has(provider2)).toBe(true);
    });
  });

  describe('Error message quality', () => {
    test('error should provide helpful hint', () => {
      const layout1 = createDefaultImport('layout', './layout1.html');
      const layout2 = createDefaultImport('layout', './layout2.html');
      const imports = [layout1, layout2];

      const errors = validateDefaultImports(imports);
      const error = errors.get(layout2);

      expect(error?.hint).toContain('Remove duplicate');
      expect(error?.hint).toContain('layout');
    });

    test('error should identify import type', () => {
      const styles1 = createDefaultImport('styles', './main.css');
      const styles2 = createDefaultImport('styles', './theme.css');
      const imports = [styles1, styles2];

      const errors = validateDefaultImports(imports);
      const error = errors.get(styles2);

      expect(error?.importType).toBe('styles');
    });
  });
});
