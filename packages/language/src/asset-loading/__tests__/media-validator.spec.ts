/**
 * Media File Validator Tests
 *
 * Tests for IMediaValidator interface and MediaValidator implementation.
 *
 * Media files (images, audio, video) only require existence validation.
 * No content validation is performed (format validation is out of scope).
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MediaValidator } from '../media-validator.js';

// Get current file's directory (ESM equivalent of __dirname)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Media File Validator', () => {
  const validator = new MediaValidator();
  const fixturesDir = resolve(__dirname, '../__fixtures__/assets');

  describe('Valid Media Files', () => {
    it('should validate existing image file', () => {
      const imagePath = resolve(fixturesDir, 'test-image.png');
      const result = validator.validate(imagePath);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate existing video file', () => {
      const videoPath = resolve(fixturesDir, 'test-video.mp4');
      const result = validator.validate(videoPath);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate existing audio file', () => {
      const audioPath = resolve(fixturesDir, 'test-audio.mp3');
      const result = validator.validate(audioPath);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept any file format (no content validation)', () => {
      // Media validator only checks existence, not format
      const htmlPath = resolve(fixturesDir, 'valid.html');
      const result = validator.validate(htmlPath);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Missing Media Files', () => {
    it('should detect missing image file', () => {
      const imagePath = resolve(fixturesDir, 'non-existent.png');
      const result = validator.validate(imagePath);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message.toLowerCase()).toContain('not found');
    });

    it('should detect missing video file', () => {
      const videoPath = resolve(fixturesDir, 'non-existent.mp4');
      const result = validator.validate(videoPath);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should detect missing audio file', () => {
      const audioPath = resolve(fixturesDir, 'non-existent.mp3');
      const result = validator.validate(audioPath);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject directory paths', () => {
      const result = validator.validate(fixturesDir);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Error Details', () => {
    it('should provide absolute path in error', () => {
      const imagePath = resolve(fixturesDir, 'non-existent.png');
      const result = validator.validate(imagePath);

      expect(result.valid).toBe(false);
      expect(result.errors[0].absolutePath).toBe(imagePath);
    });

    it('should provide helpful hint', () => {
      const imagePath = resolve(fixturesDir, 'non-existent.png');
      const result = validator.validate(imagePath);

      expect(result.valid).toBe(false);
      expect(result.errors[0].hint).toBeTruthy();
      expect(result.errors[0].hint.length).toBeGreaterThan(0);
    });

    it('should include clear error message', () => {
      const imagePath = resolve(fixturesDir, 'non-existent.png');
      const result = validator.validate(imagePath);

      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('non-existent.png');
    });
  });

  describe('Cross-Platform Paths', () => {
    it('should handle Windows-style paths', () => {
      const windowsPath = 'C:\\Users\\test\\image.png';
      const result = validator.validate(windowsPath);

      // Should not throw, just return error for non-existent file
      expect(result.valid).toBe(false);
    });

    it('should handle Unix-style paths', () => {
      const unixPath = '/home/test/image.png';
      const result = validator.validate(unixPath);

      // Should not throw, just return error for non-existent file
      expect(result.valid).toBe(false);
    });

    it('should handle relative paths (should be absolute)', () => {
      const relativePath = './test-image.png';
      const result = validator.validate(relativePath);

      // Validator expects absolute paths, relative will likely fail
      expect(result.valid).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty string path', () => {
      const result = validator.validate('');

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle special characters in path', () => {
      const specialPath = resolve(fixturesDir, 'file with spaces.png');
      const result = validator.validate(specialPath);

      // File doesn't exist, should return error
      expect(result.valid).toBe(false);
    });
  });
});
