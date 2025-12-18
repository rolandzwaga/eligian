import { describe, expect, it } from 'vitest';
import {
  generateUUID,
  validateGroupId,
  validateLabelText,
  validateLanguageCode,
  validateTranslationKey,
  validateUUID,
} from '../LocaleValidation.js';

describe('LocaleValidation', () => {
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

  describe('validateTranslationKey (FR-015)', () => {
    it('should return error for empty string', () => {
      const error = validateTranslationKey('');
      expect(error).not.toBeNull();
      expect(error?.code).toBe('empty_key');
      expect(error?.message).toContain('cannot be empty');
    });

    it('should return error for whitespace-only string', () => {
      const error = validateTranslationKey('   ');
      expect(error).not.toBeNull();
      expect(error?.code).toBe('empty_key');
    });

    it('should return error for leading dot', () => {
      const error = validateTranslationKey('.nav.home');
      expect(error).not.toBeNull();
      expect(error?.code).toBe('invalid_key_format');
      expect(error?.message).toContain('start or end with a dot');
    });

    it('should return error for trailing dot', () => {
      const error = validateTranslationKey('nav.home.');
      expect(error).not.toBeNull();
      expect(error?.code).toBe('invalid_key_format');
    });

    it('should return error for consecutive dots (empty segment)', () => {
      const error = validateTranslationKey('nav..home');
      expect(error).not.toBeNull();
      expect(error?.code).toBe('empty_key_segment');
      expect(error?.message).toContain('empty segments');
    });

    it('should return error for invalid characters in segment', () => {
      const error = validateTranslationKey('nav.home!page');
      expect(error).not.toBeNull();
      expect(error?.code).toBe('invalid_key_characters');
      expect(error?.message).toContain('invalid characters');
    });

    it('should return error for spaces in segment', () => {
      const error = validateTranslationKey('nav.home page');
      expect(error).not.toBeNull();
      expect(error?.code).toBe('invalid_key_characters');
    });

    it('should return error for duplicate key', () => {
      const existingKeys = ['nav.home', 'nav.about'];
      const error = validateTranslationKey('nav.home', existingKeys);
      expect(error).not.toBeNull();
      expect(error?.code).toBe('duplicate_key');
      expect(error?.message).toContain('already exists');
    });

    it('should allow editing current key without duplicate error', () => {
      const existingKeys = ['nav.home', 'nav.about'];
      const error = validateTranslationKey('nav.home', existingKeys, 'nav.home');
      expect(error).toBeNull();
    });

    it('should return null for valid simple key', () => {
      const error = validateTranslationKey('home');
      expect(error).toBeNull();
    });

    it('should return null for valid nested key', () => {
      const error = validateTranslationKey('nav.home.button');
      expect(error).toBeNull();
    });

    it('should allow hyphens in segments', () => {
      const error = validateTranslationKey('nav.home-page.submit-button');
      expect(error).toBeNull();
    });

    it('should allow underscores in segments', () => {
      const error = validateTranslationKey('nav.home_page.submit_button');
      expect(error).toBeNull();
    });

    it('should allow numbers in segments', () => {
      const error = validateTranslationKey('nav.section1.button2');
      expect(error).toBeNull();
    });

    it('should allow mixed alphanumeric with hyphens and underscores', () => {
      const error = validateTranslationKey('app_v2.nav-menu.item_1');
      expect(error).toBeNull();
    });

    it('should return null when no existingKeys provided', () => {
      const error = validateTranslationKey('nav.home');
      expect(error).toBeNull();
    });

    it('should return null for deeply nested keys', () => {
      const error = validateTranslationKey('app.ui.buttons.nav.home.submit');
      expect(error).toBeNull();
    });
  });
});
