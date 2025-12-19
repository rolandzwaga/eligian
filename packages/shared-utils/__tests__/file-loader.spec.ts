import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileNotFoundError, PermissionError, ReadError } from '../src/errors.js';
import { loadFileAsync, loadFileSync } from '../src/file-loader.js';

// Mock the fs module
vi.mock('node:fs');
vi.mock('node:fs/promises');

describe('File Loader', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.resetAllMocks();
  });

  describe('loadFileSync', () => {
    it('should successfully load an existing file', () => {
      // Arrange
      const mockContent = 'Hello, World!';
      vi.mocked(fs.readFileSync).mockReturnValue(mockContent);

      // Act
      const result = loadFileSync('/project/test.txt');

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.content).toBe(mockContent);
      }
      expect(fs.readFileSync).toHaveBeenCalledWith('/project/test.txt', 'utf-8');
    });

    it('should return FileNotFoundError for non-existent file', () => {
      // Arrange
      const error = new Error('ENOENT: no such file or directory');
      (error as NodeJS.ErrnoException).code = 'ENOENT';
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw error;
      });

      // Act
      const result = loadFileSync('/project/missing.txt');

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        const err = result.error as FileNotFoundError;
        expect(err._tag).toBe('FileNotFoundError');
        expect(err.path).toBe('/project/missing.txt');
        expect(err.message).toContain('missing.txt');
      }
    });

    it('should return PermissionError for EACCES error', () => {
      // Arrange
      const error = new Error('EACCES: permission denied');
      (error as NodeJS.ErrnoException).code = 'EACCES';
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw error;
      });

      // Act
      const result = loadFileSync('/project/protected.txt');

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        const err = result.error as PermissionError;
        expect(err._tag).toBe('PermissionError');
        expect(err.path).toBe('/project/protected.txt');
        expect(err.message.toLowerCase()).toContain('permission denied');
      }
    });

    it('should return PermissionError for EPERM error', () => {
      // Arrange
      const error = new Error('EPERM: operation not permitted');
      (error as NodeJS.ErrnoException).code = 'EPERM';
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw error;
      });

      // Act
      const result = loadFileSync('/project/protected.txt');

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        const err = result.error as PermissionError;
        expect(err._tag).toBe('PermissionError');
        expect(err.path).toBe('/project/protected.txt');
      }
    });

    it('should return ReadError for generic I/O errors', () => {
      // Arrange
      const error = new Error('EIO: input/output error');
      (error as NodeJS.ErrnoException).code = 'EIO';
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw error;
      });

      // Act
      const result = loadFileSync('/project/corrupted.txt');

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        const err = result.error as ReadError;
        expect(err._tag).toBe('ReadError');
        expect(err.path).toBe('/project/corrupted.txt');
        expect(err.message).toContain('Failed to read file');
      }
    });

    it('should handle errors without error codes', () => {
      // Arrange
      const error = new Error('Unknown error');
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw error;
      });

      // Act
      const result = loadFileSync('/project/unknown.txt');

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        const err = result.error as ReadError;
        expect(err._tag).toBe('ReadError');
        expect(err.path).toBe('/project/unknown.txt');
      }
    });

    it('should read file content as UTF-8 by default', () => {
      // Arrange
      const mockContent = '文字化け test\nMultiline content';
      vi.mocked(fs.readFileSync).mockReturnValue(mockContent);

      // Act
      const result = loadFileSync('/project/utf8.txt');

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.content).toBe(mockContent);
      }
      expect(fs.readFileSync).toHaveBeenCalledWith('/project/utf8.txt', 'utf-8');
    });

    it('should preserve whitespace and newlines', () => {
      // Arrange
      const mockContent = '  Indented text  \n\n\tTab character\r\nWindows newline';
      vi.mocked(fs.readFileSync).mockReturnValue(mockContent);

      // Act
      const result = loadFileSync('/project/whitespace.txt');

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.content).toBe(mockContent);
      }
    });
  });

  describe('loadFileAsync', () => {
    it('should successfully load an existing file (async)', async () => {
      // Arrange
      const mockContent = 'Async Hello, World!';
      vi.mocked(fsPromises.readFile).mockResolvedValue(mockContent);

      // Act
      const result = await loadFileAsync('/project/async-test.txt');

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.content).toBe(mockContent);
      }
      expect(fsPromises.readFile).toHaveBeenCalledWith('/project/async-test.txt', 'utf-8');
    });

    it('should return FileNotFoundError for non-existent file (async)', async () => {
      // Arrange
      const error = new Error('ENOENT: no such file or directory');
      (error as NodeJS.ErrnoException).code = 'ENOENT';
      vi.mocked(fsPromises.readFile).mockRejectedValue(error);

      // Act
      const result = await loadFileAsync('/project/missing-async.txt');

      // Assert - Promise should RESOLVE (not reject)
      expect(result.success).toBe(false);
      if (!result.success) {
        const err = result.error as FileNotFoundError;
        expect(err._tag).toBe('FileNotFoundError');
        expect(err.path).toBe('/project/missing-async.txt');
      }
    });

    it('should return PermissionError for EACCES error (async)', async () => {
      // Arrange
      const error = new Error('EACCES: permission denied');
      (error as NodeJS.ErrnoException).code = 'EACCES';
      vi.mocked(fsPromises.readFile).mockRejectedValue(error);

      // Act
      const result = await loadFileAsync('/project/protected-async.txt');

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        const err = result.error as PermissionError;
        expect(err._tag).toBe('PermissionError');
        expect(err.path).toBe('/project/protected-async.txt');
      }
    });

    it('should return PermissionError for EPERM error (async)', async () => {
      // Arrange
      const error = new Error('EPERM: operation not permitted');
      (error as NodeJS.ErrnoException).code = 'EPERM';
      vi.mocked(fsPromises.readFile).mockRejectedValue(error);

      // Act
      const result = await loadFileAsync('/project/protected-async.txt');

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        const err = result.error as PermissionError;
        expect(err._tag).toBe('PermissionError');
      }
    });

    it('should return ReadError for generic I/O errors (async)', async () => {
      // Arrange
      const error = new Error('EIO: input/output error');
      (error as NodeJS.ErrnoException).code = 'EIO';
      vi.mocked(fsPromises.readFile).mockRejectedValue(error);

      // Act
      const result = await loadFileAsync('/project/corrupted-async.txt');

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        const err = result.error as ReadError;
        expect(err._tag).toBe('ReadError');
        expect(err.path).toBe('/project/corrupted-async.txt');
      }
    });

    it('should handle errors without error codes (async)', async () => {
      // Arrange
      const error = new Error('Unknown async error');
      vi.mocked(fsPromises.readFile).mockRejectedValue(error);

      // Act
      const result = await loadFileAsync('/project/unknown-async.txt');

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        const err = result.error as ReadError;
        expect(err._tag).toBe('ReadError');
      }
    });

    it('should read file content as UTF-8 by default (async)', async () => {
      // Arrange
      const mockContent = 'UTF-8 文字化け async';
      vi.mocked(fsPromises.readFile).mockResolvedValue(mockContent);

      // Act
      const result = await loadFileAsync('/project/utf8-async.txt');

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.content).toBe(mockContent);
      }
      expect(fsPromises.readFile).toHaveBeenCalledWith('/project/utf8-async.txt', 'utf-8');
    });

    it('should preserve whitespace and newlines (async)', async () => {
      // Arrange
      const mockContent = '  Async whitespace  \n\n\tAsync tab\r\nAsync Windows newline';
      vi.mocked(fsPromises.readFile).mockResolvedValue(mockContent);

      // Act
      const result = await loadFileAsync('/project/whitespace-async.txt');

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.content).toBe(mockContent);
      }
    });

    it('should resolve promise (not reject) even on error', async () => {
      // Arrange
      const error = new Error('ENOENT: file not found');
      (error as NodeJS.ErrnoException).code = 'ENOENT';
      vi.mocked(fsPromises.readFile).mockRejectedValue(error);

      // Act & Assert - Should NOT throw
      await expect(loadFileAsync('/project/missing.txt')).resolves.toEqual({
        success: false,
        error: expect.objectContaining({
          _tag: 'FileNotFoundError',
        }),
      });
    });
  });
});
