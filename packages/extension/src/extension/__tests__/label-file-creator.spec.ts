/**
 * Feature 039 - Label File Creation Quick Fix
 * Extension-level tests for path validation and file creation logic
 */

import { describe, expect, test } from 'vitest';
import { validatePath } from '../label-file-creator.js';

describe('validatePath - Path Validation (Feature 039)', () => {
  describe('Valid Paths', () => {
    test('should accept Windows absolute path with backslashes', () => {
      const result = validatePath('C:\\Users\\test\\labels.json');
      expect(result.valid).toBe(true);
    });

    test('should accept Windows absolute path with forward slashes', () => {
      const result = validatePath('C:/Users/test/labels.json');
      expect(result.valid).toBe(true);
    });

    test('should accept relative path with nested directories', () => {
      const result = validatePath('./labels/subfolder/app.json');
      expect(result.valid).toBe(true);
    });

    test('should accept deeply nested path (10 levels)', () => {
      const result = validatePath('./a/b/c/d/e/f/g/h/i/j/file.json');
      expect(result.valid).toBe(true);
    });

    test('should accept path with spaces in directory names', () => {
      const result = validatePath('C:/Users/My Documents/labels.json');
      expect(result.valid).toBe(true);
    });

    test('should accept drive letters (A-Z)', () => {
      expect(validatePath('A:/test.json').valid).toBe(true);
      expect(validatePath('D:/test.json').valid).toBe(true);
      expect(validatePath('Z:/test.json').valid).toBe(true);
    });
  });

  describe('Invalid Extension', () => {
    test('should reject path without .json extension', () => {
      const result = validatePath('C:/Users/test/labels.txt');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('.json extension');
    });

    test('should reject path with no extension', () => {
      const result = validatePath('C:/Users/test/labels');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('.json extension');
    });
  });

  describe('Invalid Characters', () => {
    test('should reject path with < character', () => {
      const result = validatePath('./labels<test>.json');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('invalid characters');
    });

    test('should reject path with > character', () => {
      const result = validatePath('./labels>test.json');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('invalid characters');
    });

    test('should reject path with | character', () => {
      const result = validatePath('./labels|test.json');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('invalid characters');
    });

    test('should reject path with ? character', () => {
      const result = validatePath('./labels?.json');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('invalid characters');
    });

    test('should reject path with * character', () => {
      const result = validatePath('./labels*.json');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('invalid characters');
    });

    test('should reject path with " character', () => {
      const result = validatePath('./labels"test.json');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('invalid characters');
    });

    test('should reject path with colon in non-drive position', () => {
      const result = validatePath('./labels:test.json');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('invalid characters');
    });

    test('should reject path with colon in middle of path', () => {
      const result = validatePath('C:/Users/test:name/labels.json');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('invalid characters');
    });
  });

  describe('Path Length Validation', () => {
    test('should reject path longer than 260 characters', () => {
      const longPath = `C:/${'a'.repeat(250)}/labels.json`;
      const result = validatePath(longPath);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('260 character limit');
    });

    test('should accept path exactly 260 characters', () => {
      const path260 = `C:/${'a'.repeat(245)}/labels.json`; // Total = 260 (3 + 245 + 1 + 11)
      const result = validatePath(path260);
      expect(result.valid).toBe(true);
    });
  });

  describe('Trailing Spaces and Dots', () => {
    test('should reject path with trailing space in directory', () => {
      const result = validatePath('C:/Users/test /labels.json');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('spaces or dots');
    });

    test('should reject path with trailing dot in directory', () => {
      const result = validatePath('C:/Users/test./labels.json');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('spaces or dots');
    });

    test('should accept path with dots in middle of filename', () => {
      const result = validatePath('C:/Users/test/my.labels.json');
      expect(result.valid).toBe(true);
    });
  });

  describe('Regression Tests', () => {
    test('REGRESSION: should allow colon after drive letter (bug from initial implementation)', () => {
      // This test documents the bug that was caught in production:
      // The original validatePath rejected ALL colons, including drive letters
      const result = validatePath('C:\\absolute\\path\\labels.json');
      expect(result.valid).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    test('REGRESSION: should work with both forward and back slashes on Windows', () => {
      expect(validatePath('C:\\Users\\test\\labels.json').valid).toBe(true);
      expect(validatePath('C:/Users/test/labels.json').valid).toBe(true);
      expect(validatePath('C:\\Users/test\\labels.json').valid).toBe(true); // Mixed
    });
  });
});
