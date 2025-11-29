/**
 * Unit tests for Label Entry Generator (Feature 041 - User Story 1)
 *
 * Tests the generateLabelEntry() function that creates new label entries
 * with empty translations for all specified languages.
 */
import { describe, expect, test } from 'vitest';
import { generateLabelEntry } from '../../labels/label-entry-generator.js';

describe('Label Entry Generator (Feature 041, User Story 1)', () => {
  describe('generateLabelEntry()', () => {
    // T009: Test creates entry with correct label ID (including special characters)
    test('should create entry with correct label ID (T009)', () => {
      // Arrange
      const labelId = 'welcome-message_v2';
      const languageCodes = ['en-US', 'nl-NL'];

      // Act
      const result = generateLabelEntry(labelId, languageCodes);

      // Assert
      expect(result.id).toBe('welcome-message_v2');
    });

    // T010: Test creates translation for each language code
    test('should create translation entry for each language code (T010)', () => {
      // Arrange
      const labelId = 'test-label';
      const languageCodes = ['en-US', 'nl-NL', 'fr-FR'];

      // Act
      const result = generateLabelEntry(labelId, languageCodes);

      // Assert
      expect(result.labels).toHaveLength(3);
      expect(result.labels[0].languageCode).toBe('en-US');
      expect(result.labels[1].languageCode).toBe('nl-NL');
      expect(result.labels[2].languageCode).toBe('fr-FR');
    });

    // T011: Test generates unique UUIDs for each translation
    test('should generate unique UUIDs for each translation (T011)', () => {
      // Arrange
      const labelId = 'test-label';
      const languageCodes = ['en-US', 'nl-NL'];

      // Act
      const result = generateLabelEntry(labelId, languageCodes);

      // Assert - Check UUID format (v4 UUID: 8-4-4-4-12 hex characters)
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(result.labels[0].id).toMatch(uuidRegex);
      expect(result.labels[1].id).toMatch(uuidRegex);

      // Check uniqueness
      expect(result.labels[0].id).not.toBe(result.labels[1].id);
    });

    // T012: Test sets empty string for label text
    test('should set empty string for all label text fields (T012)', () => {
      // Arrange
      const labelId = 'test-label';
      const languageCodes = ['en-US', 'nl-NL', 'fr-FR'];

      // Act
      const result = generateLabelEntry(labelId, languageCodes);

      // Assert
      for (const translation of result.labels) {
        expect(translation.label).toBe('');
      }
    });

    // T013: Test preserves language order from input
    test('should preserve language order from input array (T013)', () => {
      // Arrange
      const labelId = 'test-label';
      const languageCodes = ['nl-NL', 'en-US', 'fr-FR']; // Intentionally non-alphabetical

      // Act
      const result = generateLabelEntry(labelId, languageCodes);

      // Assert - Order should match input, not be sorted
      expect(result.labels[0].languageCode).toBe('nl-NL');
      expect(result.labels[1].languageCode).toBe('en-US');
      expect(result.labels[2].languageCode).toBe('fr-FR');
    });

    // Additional test: Single language code
    test('should handle single language code (edge case)', () => {
      // Arrange
      const labelId = 'single-lang-label';
      const languageCodes = ['en-US'];

      // Act
      const result = generateLabelEntry(labelId, languageCodes);

      // Assert
      expect(result.id).toBe('single-lang-label');
      expect(result.labels).toHaveLength(1);
      expect(result.labels[0].languageCode).toBe('en-US');
      expect(result.labels[0].label).toBe('');
    });

    // Additional test: Label ID with special characters
    test('should handle label ID with special characters', () => {
      // Arrange
      const labelId = 'welcome.message-v2_beta';
      const languageCodes = ['en-US'];

      // Act
      const result = generateLabelEntry(labelId, languageCodes);

      // Assert - Label ID should be used exactly as provided
      expect(result.id).toBe('welcome.message-v2_beta');
    });
  });
});
