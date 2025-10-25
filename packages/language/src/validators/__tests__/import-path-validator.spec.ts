/**
 * Unit Tests: Import Path Validator
 *
 * Tests the pure validateImportPath() function in isolation.
 * These tests verify path validation logic without Langium dependencies.
 *
 * @group unit
 * @group validators
 */

import { describe, expect, test } from 'vitest';
import { validateImportPath } from '../import-path-validator.js';

describe('validateImportPath() - T015', () => {
  describe('Valid relative paths', () => {
    test('should accept path starting with ./', () => {
      const result = validateImportPath('./file.html');
      expect(result).toBeUndefined();
    });

    test('should accept path starting with ../', () => {
      const result = validateImportPath('../file.html');
      expect(result).toBeUndefined();
    });

    test('should accept nested relative path', () => {
      const result = validateImportPath('./assets/templates/layout.html');
      expect(result).toBeUndefined();
    });

    test('should accept parent directory with nesting', () => {
      const result = validateImportPath('../shared/components/modal.html');
      expect(result).toBeUndefined();
    });

    test('should accept deeply nested path', () => {
      const result = validateImportPath(
        './level1/level2/level3/level4/file.html'
      );
      expect(result).toBeUndefined();
    });

    test('should accept path with multiple parent references', () => {
      const result = validateImportPath('../../../shared/layout.html');
      expect(result).toBeUndefined();
    });
  });

  describe('Invalid absolute paths', () => {
    test('should reject Unix absolute path (starts with /)', () => {
      const result = validateImportPath('/absolute/path/file.html');
      expect(result).toBeDefined();
      expect(result?.code).toBe('ABSOLUTE_PATH');
      expect(result?.message).toContain('relative');
      expect(result?.message).toContain('portable');
      expect(result?.hint).toContain('./filename.ext');
    });

    test('should reject Windows absolute path (C:\\)', () => {
      const result = validateImportPath('C:\\Windows\\path\\file.html');
      expect(result).toBeDefined();
      expect(result?.code).toBe('ABSOLUTE_PATH');
    });

    test('should reject Windows absolute path (D:\\)', () => {
      const result = validateImportPath('D:\\Data\\file.html');
      expect(result).toBeDefined();
      expect(result?.code).toBe('ABSOLUTE_PATH');
    });

    test('should reject Windows path with forward slashes', () => {
      const result = validateImportPath('C:/Windows/path/file.html');
      expect(result).toBeDefined();
      expect(result?.code).toBe('ABSOLUTE_PATH');
    });

    test('should reject http:// protocol', () => {
      const result = validateImportPath('http://example.com/file.html');
      expect(result).toBeDefined();
      expect(result?.code).toBe('ABSOLUTE_PATH');
    });

    test('should reject https:// protocol', () => {
      const result = validateImportPath('https://example.com/file.html');
      expect(result).toBeDefined();
      expect(result?.code).toBe('ABSOLUTE_PATH');
    });

    test('should reject file:// protocol', () => {
      const result = validateImportPath('file:///path/to/file.html');
      expect(result).toBeDefined();
      expect(result?.code).toBe('ABSOLUTE_PATH');
    });

    test('should reject ftp:// protocol', () => {
      const result = validateImportPath('ftp://server.com/file.html');
      expect(result).toBeDefined();
      expect(result?.code).toBe('ABSOLUTE_PATH');
    });
  });

  describe('Edge cases', () => {
    test('should reject path not starting with ./ or ../', () => {
      const result = validateImportPath('file.html');
      expect(result).toBeDefined();
      expect(result?.code).toBe('ABSOLUTE_PATH');
    });

    test('should reject path starting with single dot', () => {
      const result = validateImportPath('.');
      expect(result).toBeDefined();
      expect(result?.code).toBe('ABSOLUTE_PATH');
    });

    test('should accept path with dots in filename', () => {
      const result = validateImportPath('./layout.min.html');
      expect(result).toBeUndefined();
    });

    test('should accept path with no extension', () => {
      const result = validateImportPath('./README');
      expect(result).toBeUndefined();
    });

    test('should accept path with spaces (quoted in actual DSL)', () => {
      const result = validateImportPath('./assets/my file.html');
      expect(result).toBeUndefined();
    });
  });

  describe('Error message quality', () => {
    test('error should provide actionable hint', () => {
      const result = validateImportPath('/absolute/path.html');
      expect(result?.hint).toContain('./filename.ext');
      expect(result?.hint).toContain('../folder/filename.ext');
    });

    test('error message should explain portability', () => {
      const result = validateImportPath('/absolute/path.html');
      expect(result?.message).toContain('portable');
    });
  });
});
