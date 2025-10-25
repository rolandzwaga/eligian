/**
 * Unit Tests: Import Name Validator
 *
 * Tests the pure validateImportName() function in isolation.
 * These tests verify import name validation without Langium dependencies.
 *
 * @group unit
 * @group validators
 */

import { describe, expect, test } from 'vitest';
import { validateImportName } from '../import-name-validator.js';

describe('validateImportName() - T046', () => {
  describe('Valid import names', () => {
    test('should accept simple valid name', () => {
      const result = validateImportName(
        'tooltip',
        new Set(),
        new Set(['if', 'else']),
        new Set(['selectElement'])
      );
      expect(result).toBeUndefined();
    });

    test('should accept name with numbers', () => {
      const result = validateImportName(
        'modal2',
        new Set(),
        new Set(['if']),
        new Set(['selectElement'])
      );
      expect(result).toBeUndefined();
    });

    test('should accept name with underscores', () => {
      const result = validateImportName(
        'tooltip_component',
        new Set(),
        new Set(['if']),
        new Set(['selectElement'])
      );
      expect(result).toBeUndefined();
    });

    test('should accept camelCase name', () => {
      const result = validateImportName(
        'tooltipComponent',
        new Set(),
        new Set(['if']),
        new Set(['selectElement'])
      );
      expect(result).toBeUndefined();
    });
  });

  describe('Duplicate import names', () => {
    test('should reject duplicate import name', () => {
      const existingNames = new Set(['tooltip', 'modal']);
      const result = validateImportName(
        'tooltip',
        existingNames,
        new Set(['if']),
        new Set(['selectElement'])
      );

      expect(result).toBeDefined();
      expect(result?.code).toBe('DUPLICATE_IMPORT_NAME');
      expect(result?.message).toContain('Duplicate');
      expect(result?.message).toContain('tooltip');
      expect(result?.hint).toContain('different name');
    });

    test('should accept name not in existing set', () => {
      const existingNames = new Set(['tooltip', 'modal']);
      const result = validateImportName(
        'sidebar',
        existingNames,
        new Set(['if']),
        new Set(['selectElement'])
      );

      expect(result).toBeUndefined();
    });
  });

  describe('Reserved keyword conflicts', () => {
    test('should reject if keyword', () => {
      const result = validateImportName(
        'if',
        new Set(),
        new Set(['if', 'else', 'for']),
        new Set(['selectElement'])
      );

      expect(result).toBeDefined();
      expect(result?.code).toBe('RESERVED_KEYWORD');
      expect(result?.message).toContain('reserved keyword');
      expect(result?.message).toContain('if');
    });

    test('should reject else keyword', () => {
      const result = validateImportName(
        'else',
        new Set(),
        new Set(['if', 'else', 'for']),
        new Set()
      );

      expect(result).toBeDefined();
      expect(result?.code).toBe('RESERVED_KEYWORD');
    });

    test('should reject for keyword', () => {
      const result = validateImportName(
        'for',
        new Set(),
        new Set(['if', 'else', 'for']),
        new Set()
      );

      expect(result).toBeDefined();
      expect(result?.code).toBe('RESERVED_KEYWORD');
    });

    test('should reject import-specific keywords', () => {
      const keywords = new Set(['import', 'from', 'as', 'layout', 'styles', 'provider']);

      const importResult = validateImportName('import', new Set(), keywords, new Set());
      expect(importResult).toBeDefined();
      expect(importResult?.code).toBe('RESERVED_KEYWORD');

      const fromResult = validateImportName('from', new Set(), keywords, new Set());
      expect(fromResult).toBeDefined();

      const asResult = validateImportName('as', new Set(), keywords, new Set());
      expect(asResult).toBeDefined();
    });

    test('should accept name similar to keyword', () => {
      const result = validateImportName('ifStatement', new Set(), new Set(['if']), new Set());

      expect(result).toBeUndefined(); // Not exact match
    });
  });

  describe('Operation name conflicts', () => {
    test('should reject selectElement operation name', () => {
      const result = validateImportName(
        'selectElement',
        new Set(),
        new Set(['if']),
        new Set(['selectElement', 'addClass', 'animate'])
      );

      expect(result).toBeDefined();
      expect(result?.code).toBe('OPERATION_NAME_CONFLICT');
      expect(result?.message).toContain('operation');
      expect(result?.message).toContain('selectElement');
      expect(result?.hint).toContain('built-in operation');
    });

    test('should reject addClass operation name', () => {
      const result = validateImportName(
        'addClass',
        new Set(),
        new Set(),
        new Set(['selectElement', 'addClass'])
      );

      expect(result).toBeDefined();
      expect(result?.code).toBe('OPERATION_NAME_CONFLICT');
    });

    test('should accept name similar to operation', () => {
      const result = validateImportName(
        'selectElements',
        new Set(),
        new Set(),
        new Set(['selectElement'])
      );

      expect(result).toBeUndefined(); // Plural, not exact match
    });
  });

  describe('Priority of error checking', () => {
    test('duplicate check should come before keyword check', () => {
      const existingNames = new Set(['if']);
      const result = validateImportName('if', existingNames, new Set(['if']), new Set());

      // Duplicate error takes priority
      expect(result?.code).toBe('DUPLICATE_IMPORT_NAME');
    });

    test('keyword check should come before operation check', () => {
      const result = validateImportName(
        'if',
        new Set(),
        new Set(['if']),
        new Set(['if']) // Hypothetical: if 'if' was also an operation
      );

      // Reserved keyword error takes priority
      expect(result?.code).toBe('RESERVED_KEYWORD');
    });
  });

  describe('Error message quality', () => {
    test('duplicate error should provide helpful hint', () => {
      const result = validateImportName('tooltip', new Set(['tooltip']), new Set(), new Set());

      expect(result?.hint).toContain('different name');
    });

    test('keyword error should list some reserved keywords', () => {
      const result = validateImportName('if', new Set(), new Set(['if', 'else', 'for']), new Set());

      expect(result?.hint).toContain('if');
      expect(result?.hint).toContain('else');
      expect(result?.hint).toContain('for');
    });

    test('operation error should suggest choosing different name', () => {
      const result = validateImportName(
        'selectElement',
        new Set(),
        new Set(),
        new Set(['selectElement'])
      );

      expect(result?.hint).toContain('different');
    });
  });
});
