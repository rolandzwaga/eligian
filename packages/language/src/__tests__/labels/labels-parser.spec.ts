import { describe, expect, test } from 'vitest';
import { LabelsParser } from '../../labels/labels-parser.js';
import type { ParsedLabelsFile } from '../../labels/types.js';

describe('LabelsParser', () => {
  describe('extractLanguageCodes', () => {
    test('should extract language codes from valid JSON with multiple languages', () => {
      const validJSON = [
        {
          id: 'welcome-title',
          labels: [
            { id: 'welcome-title-en', languageCode: 'en-US', label: 'Welcome' },
            { id: 'welcome-title-nl', languageCode: 'nl-NL', label: 'Welkom' },
            { id: 'welcome-title-fr', languageCode: 'fr-FR', label: 'Bienvenue' },
            { id: 'welcome-title-de', languageCode: 'de-DE', label: 'Willkommen' },
          ],
        },
        {
          id: 'goodbye-title',
          labels: [
            { id: 'goodbye-title-en', languageCode: 'en-US', label: 'Goodbye' },
            { id: 'goodbye-title-nl', languageCode: 'nl-NL', label: 'Tot ziens' },
          ],
        },
      ];

      const parser = new LabelsParser();
      const result: ParsedLabelsFile = parser.extractLanguageCodes(
        'file:///test/labels.json',
        JSON.stringify(validJSON)
      );

      expect(result.success).toBe(true);
      expect(result.filePath).toBe('file:///test/labels.json');
      expect(result.languageCodes).toEqual(['de-DE', 'en-US', 'fr-FR', 'nl-NL']); // Sorted alphabetically
      expect(result.error).toBeUndefined();
    });

    test('should deduplicate language codes across multiple label groups', () => {
      const jsonWithDuplicates = [
        {
          id: 'group1',
          labels: [
            { id: 'label1', languageCode: 'en-US', label: 'Hello' },
            { id: 'label2', languageCode: 'fr-FR', label: 'Bonjour' },
          ],
        },
        {
          id: 'group2',
          labels: [
            { id: 'label3', languageCode: 'en-US', label: 'World' },
            { id: 'label4', languageCode: 'de-DE', label: 'Welt' },
          ],
        },
      ];

      const parser = new LabelsParser();
      const result = parser.extractLanguageCodes(
        'file:///test/labels.json',
        JSON.stringify(jsonWithDuplicates)
      );

      expect(result.success).toBe(true);
      expect(result.languageCodes).toEqual(['de-DE', 'en-US', 'fr-FR']); // Deduplicated and sorted
    });

    test('should return empty array for empty labels array', () => {
      const emptyJSON = [];

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
      const malformedJSON = '{ "id": "test" "missing-comma": true }';

      const parser = new LabelsParser();
      const result = parser.extractLanguageCodes('file:///test/invalid.json', malformedJSON);

      expect(result.success).toBe(false);
      expect(result.filePath).toBe('file:///test/invalid.json');
      expect(result.languageCodes).toEqual([]);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('JSON');
    });

    test('should handle JSON with missing languageCode fields gracefully', () => {
      const jsonWithMissingCodes = [
        {
          id: 'group1',
          labels: [
            { id: 'label1', languageCode: 'en-US', label: 'Hello' },
            { id: 'label2', label: 'Missing code' }, // No languageCode
          ],
        },
      ];

      const parser = new LabelsParser();
      const result = parser.extractLanguageCodes(
        'file:///test/partial.json',
        JSON.stringify(jsonWithMissingCodes)
      );

      expect(result.success).toBe(true);
      expect(result.languageCodes).toEqual(['en-US']); // Only valid codes extracted
    });

    test('should handle JSON with empty labels arrays', () => {
      const jsonWithEmptyLabels = [
        {
          id: 'group1',
          labels: [],
        },
        {
          id: 'group2',
          labels: [{ id: 'label1', languageCode: 'fr-FR', label: 'Bonjour' }],
        },
      ];

      const parser = new LabelsParser();
      const result = parser.extractLanguageCodes(
        'file:///test/labels.json',
        JSON.stringify(jsonWithEmptyLabels)
      );

      expect(result.success).toBe(true);
      expect(result.languageCodes).toEqual(['fr-FR']);
    });

    test('should filter out invalid language codes (empty strings, whitespace)', () => {
      const jsonWithInvalidCodes = [
        {
          id: 'group1',
          labels: [
            { id: 'label1', languageCode: 'en-US', label: 'Valid' },
            { id: 'label2', languageCode: '', label: 'Empty code' },
            { id: 'label3', languageCode: '   ', label: 'Whitespace code' },
            { id: 'label4', languageCode: 'fr-FR', label: 'Valid' },
          ],
        },
      ];

      const parser = new LabelsParser();
      const result = parser.extractLanguageCodes(
        'file:///test/labels.json',
        JSON.stringify(jsonWithInvalidCodes)
      );

      expect(result.success).toBe(true);
      expect(result.languageCodes).toEqual(['en-US', 'fr-FR']); // Only valid codes
    });
  });
});
