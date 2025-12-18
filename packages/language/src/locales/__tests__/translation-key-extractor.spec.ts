/**
 * Tests for Translation Key Extractor
 *
 * Feature 045: User Story 1 - Import and Use Locale Data
 * Task T007: Create translation key extractor
 */

import { describe, expect, test } from 'vitest';
import { extractTranslationKeys } from '../translation-key-extractor.js';

describe('extractTranslationKeys', () => {
  test('should extract keys from flat locale structure', () => {
    const locales = {
      'en-US': {
        home: 'Home',
        about: 'About',
      },
      'nl-NL': {
        home: 'Thuis',
        about: 'Over',
      },
    };

    const result = extractTranslationKeys(locales);

    expect(result).toHaveLength(2);
    expect(result.map(r => r.id).sort()).toEqual(['about', 'home']);

    const homeKey = result.find(r => r.id === 'home');
    expect(homeKey).toBeDefined();
    expect(homeKey!.translationCount).toBe(2);
    expect(homeKey!.languageCodes).toEqual(['en-US', 'nl-NL']);
  });

  test('should extract keys from nested locale structure', () => {
    const locales = {
      'en-US': {
        nav: {
          home: 'Home',
          about: 'About',
        },
        button: {
          submit: 'Submit',
        },
      },
      'nl-NL': {
        nav: {
          home: 'Thuis',
          about: 'Over',
        },
        button: {
          submit: 'Verzenden',
        },
      },
    };

    const result = extractTranslationKeys(locales);

    expect(result).toHaveLength(3);
    expect(result.map(r => r.id).sort()).toEqual(['button.submit', 'nav.about', 'nav.home']);
  });

  test('should handle deeply nested keys', () => {
    const locales = {
      'en-US': {
        ui: {
          forms: {
            validation: {
              required: 'Required field',
            },
          },
        },
      },
    };

    const result = extractTranslationKeys(locales);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('ui.forms.validation.required');
    expect(result[0].translationCount).toBe(1);
    expect(result[0].languageCodes).toEqual(['en-US']);
  });

  test('should handle partial translations', () => {
    const locales = {
      'en-US': {
        nav: {
          home: 'Home',
          about: 'About',
          contact: 'Contact',
        },
      },
      'nl-NL': {
        nav: {
          home: 'Thuis',
          // 'about' missing
          // 'contact' missing
        },
      },
    };

    const result = extractTranslationKeys(locales);

    expect(result).toHaveLength(3);

    const homeKey = result.find(r => r.id === 'nav.home');
    expect(homeKey!.translationCount).toBe(2);

    const aboutKey = result.find(r => r.id === 'nav.about');
    expect(aboutKey!.translationCount).toBe(1);
    expect(aboutKey!.languageCodes).toEqual(['en-US']);
  });

  test('should skip $ref locale entries', () => {
    const locales = {
      'en-US': { $ref: './en-US.json' },
      'nl-NL': {
        nav: {
          home: 'Thuis',
        },
      },
    };

    const result = extractTranslationKeys(locales);

    // Only nl-NL keys should be extracted
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('nav.home');
    expect(result[0].languageCodes).toEqual(['nl-NL']);
  });

  test('should handle empty locale configuration', () => {
    const locales = {};

    const result = extractTranslationKeys(locales);

    expect(result).toHaveLength(0);
  });

  test('should sort keys alphabetically', () => {
    const locales = {
      'en-US': {
        zebra: 'Zebra',
        apple: 'Apple',
        mango: 'Mango',
      },
    };

    const result = extractTranslationKeys(locales);

    expect(result.map(r => r.id)).toEqual(['apple', 'mango', 'zebra']);
  });
});
