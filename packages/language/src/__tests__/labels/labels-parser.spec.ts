import { describe, expect, test } from 'vitest';
import { LabelsParser } from '../../labels/labels-parser.js';
import type { ParsedLabelsFile } from '../../labels/types.js';

/**
 * Feature 045: Updated to test ILocalesConfiguration format
 *
 * The new locales format is an object keyed by locale codes:
 * {
 *   "en-US": { "nav": { "home": "Home" } },
 *   "nl-NL": { "nav": { "home": "Thuis" } }
 * }
 */
describe('LabelsParser', () => {
  describe('extractLanguageCodes', () => {
    test('should extract language codes from ILocalesConfiguration format', () => {
      const validJSON = {
        'en-US': { nav: { home: 'Home' }, button: { submit: 'Submit' } },
        'nl-NL': { nav: { home: 'Thuis' }, button: { submit: 'Verzenden' } },
        'fr-FR': { nav: { home: 'Accueil' }, button: { submit: 'Soumettre' } },
        'de-DE': { nav: { home: 'Startseite' }, button: { submit: 'Absenden' } },
      };

      const parser = new LabelsParser();
      const result: ParsedLabelsFile = parser.extractLanguageCodes(
        'file:///test/locales.json',
        JSON.stringify(validJSON)
      );

      expect(result.success).toBe(true);
      expect(result.filePath).toBe('file:///test/locales.json');
      expect(result.languageCodes).toEqual(['de-DE', 'en-US', 'fr-FR', 'nl-NL']); // Sorted alphabetically
      expect(result.error).toBeUndefined();
    });

    test('should extract language codes from external reference format', () => {
      const jsonWithRefs = {
        'en-US': { $ref: './locales/en-US.json' },
        'nl-NL': { $ref: './locales/nl-NL.json' },
        'de-DE': { $ref: './locales/de-DE.json' },
      };

      const parser = new LabelsParser();
      const result = parser.extractLanguageCodes(
        'file:///test/locales.json',
        JSON.stringify(jsonWithRefs)
      );

      expect(result.success).toBe(true);
      expect(result.languageCodes).toEqual(['de-DE', 'en-US', 'nl-NL']); // Sorted
    });

    test('should return empty array for empty object', () => {
      const emptyJSON = {};

      const parser = new LabelsParser();
      const result = parser.extractLanguageCodes(
        'file:///test/empty.json',
        JSON.stringify(emptyJSON)
      );

      expect(result.success).toBe(true);
      expect(result.languageCodes).toEqual([]);
      expect(result.error).toBeUndefined();
    });

    test('should return error for malformed JSON', () => {
      const malformedJSON = '{ "en-US" "missing-colon": true }';

      const parser = new LabelsParser();
      const result = parser.extractLanguageCodes('file:///test/invalid.json', malformedJSON);

      expect(result.success).toBe(false);
      expect(result.filePath).toBe('file:///test/invalid.json');
      expect(result.languageCodes).toEqual([]);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('JSON');
    });

    test('should reject old array format (ILanguageLabel[])', () => {
      const oldFormatJSON = [
        {
          id: 'welcome',
          labels: [{ languageCode: 'en-US', label: 'Hello' }],
        },
      ];

      const parser = new LabelsParser();
      const result = parser.extractLanguageCodes(
        'file:///test/old-format.json',
        JSON.stringify(oldFormatJSON)
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('must be an object');
    });

    test('should filter out invalid language codes', () => {
      const jsonWithInvalidCodes = {
        'en-US': { greeting: 'Hello' },
        invalid: { greeting: 'Invalid' }, // Not a valid locale code pattern
        '123': { greeting: 'Number' }, // Number key
        'fr-FR': { greeting: 'Bonjour' },
      };

      const parser = new LabelsParser();
      const result = parser.extractLanguageCodes(
        'file:///test/locales.json',
        JSON.stringify(jsonWithInvalidCodes)
      );

      expect(result.success).toBe(true);
      expect(result.languageCodes).toEqual(['en-US', 'fr-FR']); // Only valid codes
    });

    test('should handle mixed inline and reference entries', () => {
      const mixedJSON = {
        'en-US': { greeting: 'Hello', farewell: 'Goodbye' }, // inline
        'nl-NL': { $ref: './nl-NL.json' }, // reference
        'fr-FR': { greeting: 'Bonjour' }, // inline
      };

      const parser = new LabelsParser();
      const result = parser.extractLanguageCodes(
        'file:///test/locales.json',
        JSON.stringify(mixedJSON)
      );

      expect(result.success).toBe(true);
      expect(result.languageCodes).toEqual(['en-US', 'fr-FR', 'nl-NL']);
    });

    test('should sort language codes alphabetically', () => {
      const unsortedJSON = {
        'nl-NL': { greeting: 'Hallo' },
        'en-US': { greeting: 'Hello' },
        'de-DE': { greeting: 'Hallo' },
        'fr-FR': { greeting: 'Bonjour' },
      };

      const parser = new LabelsParser();
      const result = parser.extractLanguageCodes(
        'file:///test/locales.json',
        JSON.stringify(unsortedJSON)
      );

      expect(result.success).toBe(true);
      expect(result.languageCodes).toEqual(['de-DE', 'en-US', 'fr-FR', 'nl-NL']);
    });
  });
});
