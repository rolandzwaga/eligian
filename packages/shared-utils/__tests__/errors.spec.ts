import { describe, expect, it } from 'vitest';
import {
  createFileNotFoundError,
  createPermissionError,
  createReadError,
  createSecurityError,
  type FileNotFoundError,
  isFileNotFoundError,
  isPermissionError,
  isReadError,
  isSecurityError,
  type PermissionError,
  type ReadError,
  type SecurityError,
} from '../src/errors.js';

describe('Error Types', () => {
  describe('FileNotFoundError', () => {
    it('should create FileNotFoundError with correct structure', () => {
      const error = createFileNotFoundError('/project/missing.css');

      expect(error._tag).toBe('FileNotFoundError');
      expect(error.path).toBe('/project/missing.css');
      expect(error.message).toContain('File not found');
      expect(error.message).toContain('/project/missing.css');
      expect(error.hint).toBeDefined();
      expect(error.hint).toContain('exists');
    });

    it('should have hint suggesting to check file exists', () => {
      const error = createFileNotFoundError('/test.css');
      expect(error.hint).toMatch(/check|exists|correct/i);
    });
  });

  describe('PermissionError', () => {
    it('should create PermissionError with correct structure', () => {
      const error = createPermissionError('/etc/shadow');

      expect(error._tag).toBe('PermissionError');
      expect(error.path).toBe('/etc/shadow');
      expect(error.message).toContain('Permission denied');
      expect(error.message).toContain('/etc/shadow');
      expect(error.hint).toBeDefined();
      expect(error.hint).toContain('permissions');
    });

    it('should have hint about read permissions', () => {
      const error = createPermissionError('/test');
      expect(error.hint).toMatch(/permission|read/i);
    });
  });

  describe('ReadError', () => {
    it('should create ReadError with correct structure', () => {
      const cause = new Error('ENOENT');
      const error = createReadError('/project/corrupted.css', cause);

      expect(error._tag).toBe('ReadError');
      expect(error.path).toBe('/project/corrupted.css');
      expect(error.message).toContain('Failed to read');
      expect(error.message).toContain('/project/corrupted.css');
      expect(error.cause).toBe(cause);
      expect(error.hint).toBeDefined();
    });

    it('should work without cause parameter', () => {
      const error = createReadError('/test.css');

      expect(error._tag).toBe('ReadError');
      expect(error.path).toBe('/test.css');
      expect(error.cause).toBeUndefined();
    });

    it('should have hint about file readability', () => {
      const error = createReadError('/test');
      expect(error.hint).toMatch(/corrupted|readable/i);
    });
  });

  describe('SecurityError', () => {
    it('should create SecurityError with correct structure', () => {
      const error = createSecurityError('/etc/passwd', '/project');

      expect(error._tag).toBe('SecurityError');
      expect(error.path).toBe('/etc/passwd');
      expect(error.projectRoot).toBe('/project');
      expect(error.message).toContain('Path traversal');
      expect(error.message).toContain('/etc/passwd');
      expect(error.message).toContain('/project');
      expect(error.hint).toBeDefined();
    });

    it('should have hint about path traversal', () => {
      const error = createSecurityError('/outside', '/project');
      expect(error.hint).toMatch(/escape|directory|\.{2}/);
    });
  });

  describe('Type Guards', () => {
    it('isFileNotFoundError should identify FileNotFoundError', () => {
      const error: FileNotFoundError = {
        _tag: 'FileNotFoundError',
        path: '/test',
        message: 'test',
      };

      expect(isFileNotFoundError(error)).toBe(true);
      expect(isPermissionError(error)).toBe(false);
      expect(isReadError(error)).toBe(false);
      expect(isSecurityError(error)).toBe(false);
    });

    it('isPermissionError should identify PermissionError', () => {
      const error: PermissionError = {
        _tag: 'PermissionError',
        path: '/test',
        message: 'test',
      };

      expect(isFileNotFoundError(error)).toBe(false);
      expect(isPermissionError(error)).toBe(true);
      expect(isReadError(error)).toBe(false);
      expect(isSecurityError(error)).toBe(false);
    });

    it('isReadError should identify ReadError', () => {
      const error: ReadError = {
        _tag: 'ReadError',
        path: '/test',
        message: 'test',
      };

      expect(isFileNotFoundError(error)).toBe(false);
      expect(isPermissionError(error)).toBe(false);
      expect(isReadError(error)).toBe(true);
      expect(isSecurityError(error)).toBe(false);
    });

    it('isSecurityError should identify SecurityError', () => {
      const error: SecurityError = {
        _tag: 'SecurityError',
        path: '/test',
        projectRoot: '/project',
        message: 'test',
      };

      expect(isFileNotFoundError(error)).toBe(false);
      expect(isPermissionError(error)).toBe(false);
      expect(isReadError(error)).toBe(false);
      expect(isSecurityError(error)).toBe(true);
    });

    it('type guards should return false for non-error objects', () => {
      const notError = { random: 'object' };

      expect(isFileNotFoundError(notError)).toBe(false);
      expect(isPermissionError(notError)).toBe(false);
      expect(isReadError(notError)).toBe(false);
      expect(isSecurityError(notError)).toBe(false);
    });

    it('type guards should return false for null/undefined', () => {
      expect(isFileNotFoundError(null)).toBe(false);
      expect(isPermissionError(undefined)).toBe(false);
      expect(isReadError(null)).toBe(false);
      expect(isSecurityError(undefined)).toBe(false);
    });
  });

  describe('Error Serialization', () => {
    it('should serialize and deserialize FileNotFoundError', () => {
      const error = createFileNotFoundError('/test.css');
      const serialized = JSON.stringify(error);
      const deserialized = JSON.parse(serialized);

      expect(deserialized._tag).toBe('FileNotFoundError');
      expect(deserialized.path).toBe('/test.css');
      expect(deserialized.message).toBe(error.message);
      expect(isFileNotFoundError(deserialized)).toBe(true);
    });

    it('should serialize and deserialize SecurityError', () => {
      const error = createSecurityError('/outside', '/project');
      const serialized = JSON.stringify(error);
      const deserialized = JSON.parse(serialized);

      expect(deserialized._tag).toBe('SecurityError');
      expect(deserialized.path).toBe('/outside');
      expect(deserialized.projectRoot).toBe('/project');
      expect(isSecurityError(deserialized)).toBe(true);
    });

    it('should serialize ReadError with cause', () => {
      const cause = new Error('Original error');
      const error = createReadError('/test.css', cause);
      const serialized = JSON.stringify(error);
      const deserialized = JSON.parse(serialized);

      // Note: Error objects don't serialize well, but structure is preserved
      expect(deserialized._tag).toBe('ReadError');
      expect(deserialized.path).toBe('/test.css');
      expect(isReadError(deserialized)).toBe(true);
    });
  });
});
