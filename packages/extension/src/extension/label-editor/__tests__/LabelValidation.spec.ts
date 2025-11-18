import { describe, expect, it } from 'vitest';
import {
  generateUUID,
  validateGroupId,
  validateLabelText,
  validateLanguageCode,
  validateUUID,
} from '../LabelValidation.js';

describe('LabelValidation', () => {
  describe('validateGroupId', () => {
    it('should return error for empty string', () => {
      const error = validateGroupId('', []);
      expect(error).not.toBeNull();
      expect(error?.code).toBe('empty_id');
      expect(error?.message).toContain('cannot be empty');
    });

    it('should return error for whitespace-only string', () => {
      const error = validateGroupId('   ', []);
      expect(error).not.toBeNull();
      expect(error?.code).toBe('empty_id');
    });

    it('should return error for invalid characters', () => {
      const error = validateGroupId('invalid id!', []);
      expect(error).not.toBeNull();
      expect(error?.code).toBe('invalid_characters');
      expect(error?.message).toContain('alphanumeric');
    });

    it('should return error for duplicate ID', () => {
      const existingIds = ['welcome-title', 'goodbye-message'];
      const error = validateGroupId('welcome-title', existingIds);
      expect(error).not.toBeNull();
      expect(error?.code).toBe('duplicate_id');
      expect(error?.message).toContain('already exists');
    });

    it('should allow editing current group ID without duplicate error', () => {
      const existingIds = ['welcome-title', 'goodbye-message'];
      const error = validateGroupId('welcome-title', existingIds, 'welcome-title');
      expect(error).toBeNull();
    });

    it('should return null for valid group ID', () => {
      const existingIds = ['welcome-title'];
      const error = validateGroupId('goodbye-message', existingIds);
      expect(error).toBeNull();
    });

    it('should allow hyphens, underscores, and dots', () => {
      const error1 = validateGroupId('my-group_123.v1', []);
      expect(error1).toBeNull();

      const error2 = validateGroupId('org.company.app.label', []);
      expect(error2).toBeNull();
    });
  });

  describe('validateLanguageCode', () => {
    it('should return error for empty string', () => {
      const error = validateLanguageCode('');
      expect(error).not.toBeNull();
      expect(error?.code).toBe('empty_language_code');
    });

    it('should return error for invalid pattern (lowercase country)', () => {
      const error = validateLanguageCode('en-us');
      expect(error).not.toBeNull();
      expect(error?.code).toBe('invalid_language_code');
      expect(error?.message).toContain('xx-XX');
    });

    it('should return error for invalid pattern (uppercase language)', () => {
      const error = validateLanguageCode('EN-US');
      expect(error).not.toBeNull();
      expect(error?.code).toBe('invalid_language_code');
    });

    it('should return error for missing hyphen', () => {
      const error = validateLanguageCode('enus');
      expect(error).not.toBeNull();
      expect(error?.code).toBe('invalid_language_code');
    });

    it('should return null for valid 2-letter language code', () => {
      const error = validateLanguageCode('en-US');
      expect(error).toBeNull();
    });

    it('should return null for valid 3-letter language code', () => {
      const error = validateLanguageCode('nld-NLD');
      expect(error).toBeNull();
    });

    it('should return null for common language codes', () => {
      const codes = ['en-US', 'nl-NL', 'fr-FR', 'de-DE', 'es-ES', 'ja-JP', 'zh-CN'];
      codes.forEach(code => {
        const error = validateLanguageCode(code);
        expect(error).toBeNull();
      });
    });
  });

  describe('validateLabelText', () => {
    it('should return error for empty string', () => {
      const error = validateLabelText('');
      expect(error).not.toBeNull();
      expect(error?.code).toBe('empty_label');
    });

    it('should return error for whitespace-only string', () => {
      const error = validateLabelText('   ');
      expect(error).not.toBeNull();
      expect(error?.code).toBe('empty_label');
    });

    it('should return null for valid label text', () => {
      const error = validateLabelText('Welcome to Eligian');
      expect(error).toBeNull();
    });

    it('should allow long text', () => {
      const longText = 'A'.repeat(5000);
      const error = validateLabelText(longText);
      expect(error).toBeNull();
    });

    it('should allow special characters and unicode', () => {
      const error = validateLabelText('Hëllö Wörld! 你好世界');
      expect(error).toBeNull();
    });
  });

  describe('validateUUID', () => {
    it('should return false for invalid UUID format', () => {
      expect(validateUUID('not-a-uuid')).toBe(false);
      expect(validateUUID('12345678')).toBe(false);
      expect(validateUUID('')).toBe(false);
    });

    it('should return false for non-v4 UUID', () => {
      // UUID v1 example
      expect(validateUUID('a1b2c3d4-e5f6-1789-a012-3456789abcde')).toBe(false);
    });

    it('should return true for valid UUID v4', () => {
      expect(validateUUID('a1b2c3d4-e5f6-4789-a012-3456789abcde')).toBe(true);
      expect(validateUUID('f6a7b8c9-d0e1-4234-8567-89abcdef0123')).toBe(true);
    });

    it('should be case-insensitive', () => {
      expect(validateUUID('A1B2C3D4-E5F6-4789-A012-3456789ABCDE')).toBe(true);
    });
  });

  describe('generateUUID', () => {
    it('should generate valid UUID v4', () => {
      const uuid = generateUUID();
      expect(validateUUID(uuid)).toBe(true);
    });

    it('should generate unique UUIDs', () => {
      const uuid1 = generateUUID();
      const uuid2 = generateUUID();
      expect(uuid1).not.toBe(uuid2);
    });

    it('should generate UUIDs with version 4 indicator', () => {
      const uuid = generateUUID();
      // Version 4 UUIDs have '4' at position 14 (after third hyphen)
      expect(uuid.charAt(14)).toBe('4');
    });
  });
});
