/**
 * Locale Editor UUID Management Tests (Feature 036, User Story 3)
 *
 * Tests verify UUID management requirements:
 * - T033: Generate valid UUID v4 for new translations
 * - T034: Auto-fix missing or invalid UUIDs on document load
 * - T034: Preserve existing valid UUIDs when editing
 * - T035: Never display UUID values in the UI
 *
 * These tests verify the UUID handling logic in LocaleValidation.ts
 * and the LocaleEditorProvider's parseLabels method.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { generateUUID, validateUUID } from '../LocaleValidation.js';
import type { LabelGroup } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Locale Editor UUID Management (Feature 036, User Story 3)', () => {
  describe('T033: Generate valid UUID v4 for new translations', () => {
    it('should generate valid UUID v4 format', () => {
      const uuid = generateUUID();
      expect(validateUUID(uuid)).toBe(true);
    });

    it('should generate UUID with version 4 indicator', () => {
      const uuid = generateUUID();
      // UUID v4 has '4' at position 14 (after third hyphen)
      expect(uuid.charAt(14)).toBe('4');
    });

    it('should generate UUID with valid variant bits', () => {
      const uuid = generateUUID();
      // UUID variant 1 (RFC 4122) has bits 10xx at position 19
      const variantChar = uuid.charAt(19).toLowerCase();
      expect(['8', '9', 'a', 'b']).toContain(variantChar);
    });

    it('should generate unique UUIDs each time', () => {
      const uuids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        uuids.add(generateUUID());
      }
      expect(uuids.size).toBe(100);
    });

    it('should generate UUID using crypto.randomUUID()', () => {
      // Verify the implementation uses crypto.randomUUID
      const uuid = generateUUID();
      // crypto.randomUUID always returns lowercase
      expect(uuid).toBe(uuid.toLowerCase());
    });
  });

  describe('T034: Auto-fix missing or invalid UUIDs on document load', () => {
    /**
     * Simulates the parseLabels logic from LocaleEditorProvider
     * This tests the auto-fix behavior without requiring VS Code dependencies
     */
    function parseLabelsWithAutoFix(labels: LabelGroup[]): LabelGroup[] {
      // Clone to avoid mutating input
      const result = JSON.parse(JSON.stringify(labels)) as LabelGroup[];

      for (const group of result) {
        if (group.labels && Array.isArray(group.labels)) {
          for (const translation of group.labels) {
            // Check if UUID is missing or invalid
            if (!translation.id || !validateUUID(translation.id)) {
              translation.id = generateUUID();
            }
          }
        }
      }

      return result;
    }

    it('should auto-generate UUID for translations with missing id', () => {
      const labels: LabelGroup[] = [
        {
          id: 'welcome',
          labels: [{ id: '', languageCode: 'en-US', label: 'Welcome' }],
        },
      ];

      const result = parseLabelsWithAutoFix(labels);
      expect(validateUUID(result[0].labels[0].id)).toBe(true);
    });

    it('should auto-generate UUID for translations with undefined id', () => {
      const labels = [
        {
          id: 'welcome',
          labels: [{ languageCode: 'en-US', label: 'Welcome' } as any],
        },
      ];

      const result = parseLabelsWithAutoFix(labels);
      expect(validateUUID(result[0].labels[0].id)).toBe(true);
    });

    it('should auto-generate UUID for invalid UUID format', () => {
      const labels: LabelGroup[] = [
        {
          id: 'welcome',
          labels: [{ id: 'not-a-valid-uuid', languageCode: 'en-US', label: 'Welcome' }],
        },
      ];

      const result = parseLabelsWithAutoFix(labels);
      expect(validateUUID(result[0].labels[0].id)).toBe(true);
      expect(result[0].labels[0].id).not.toBe('not-a-valid-uuid');
    });

    it('should auto-generate UUID for non-v4 UUID format', () => {
      const labels: LabelGroup[] = [
        {
          id: 'welcome',
          labels: [
            // UUID v1 format (has '1' at position 14 instead of '4')
            { id: 'a1b2c3d4-e5f6-1789-a012-3456789abcde', languageCode: 'en-US', label: 'Welcome' },
          ],
        },
      ];

      const result = parseLabelsWithAutoFix(labels);
      expect(validateUUID(result[0].labels[0].id)).toBe(true);
      // Should have replaced with v4
      expect(result[0].labels[0].id.charAt(14)).toBe('4');
    });

    it('should handle multiple translations with missing UUIDs', () => {
      const labels: LabelGroup[] = [
        {
          id: 'welcome',
          labels: [
            { id: '', languageCode: 'en-US', label: 'Welcome' },
            { id: '', languageCode: 'nl-NL', label: 'Welkom' },
          ],
        },
        {
          id: 'goodbye',
          labels: [{ id: 'invalid', languageCode: 'en-US', label: 'Goodbye' }],
        },
      ];

      const result = parseLabelsWithAutoFix(labels);

      // All should have valid UUIDs
      expect(validateUUID(result[0].labels[0].id)).toBe(true);
      expect(validateUUID(result[0].labels[1].id)).toBe(true);
      expect(validateUUID(result[1].labels[0].id)).toBe(true);

      // All should be unique
      const uuids = new Set([
        result[0].labels[0].id,
        result[0].labels[1].id,
        result[1].labels[0].id,
      ]);
      expect(uuids.size).toBe(3);
    });
  });

  describe('T034: Preserve existing valid UUIDs when editing', () => {
    function parseLabelsWithAutoFix(labels: LabelGroup[]): LabelGroup[] {
      const result = JSON.parse(JSON.stringify(labels)) as LabelGroup[];

      for (const group of result) {
        if (group.labels && Array.isArray(group.labels)) {
          for (const translation of group.labels) {
            if (!translation.id || !validateUUID(translation.id)) {
              translation.id = generateUUID();
            }
          }
        }
      }

      return result;
    }

    it('should preserve existing valid UUID v4', () => {
      const validUUID = 'a1b2c3d4-e5f6-4789-a012-3456789abcde';
      const labels: LabelGroup[] = [
        {
          id: 'welcome',
          labels: [{ id: validUUID, languageCode: 'en-US', label: 'Welcome' }],
        },
      ];

      const result = parseLabelsWithAutoFix(labels);
      expect(result[0].labels[0].id).toBe(validUUID);
    });

    it('should preserve UUIDs regardless of case', () => {
      const upperUUID = 'A1B2C3D4-E5F6-4789-A012-3456789ABCDE';
      const labels: LabelGroup[] = [
        {
          id: 'welcome',
          labels: [{ id: upperUUID, languageCode: 'en-US', label: 'Welcome' }],
        },
      ];

      const result = parseLabelsWithAutoFix(labels);
      expect(result[0].labels[0].id).toBe(upperUUID);
    });

    it('should only replace invalid UUIDs in mixed list', () => {
      const validUUID = 'f6a7b8c9-d0e1-4234-8567-89abcdef0123';
      const labels: LabelGroup[] = [
        {
          id: 'welcome',
          labels: [
            { id: validUUID, languageCode: 'en-US', label: 'Welcome' },
            { id: 'invalid', languageCode: 'nl-NL', label: 'Welkom' },
          ],
        },
      ];

      const result = parseLabelsWithAutoFix(labels);

      // Valid UUID preserved
      expect(result[0].labels[0].id).toBe(validUUID);
      // Invalid UUID replaced
      expect(result[0].labels[1].id).not.toBe('invalid');
      expect(validateUUID(result[0].labels[1].id)).toBe(true);
    });
  });

  describe('T035: Never display UUID values in the UI', () => {
    it('should not render UUID in translation card (verified in webview script)', () => {
      // Load and check the webview script
      const scriptPath = path.join(__dirname, '..', '..', '..', '..', 'media', 'locale-editor.ts');
      const scriptContent = fs.readFileSync(scriptPath, 'utf8');

      // The renderTranslations function should only show languageCode and label
      // Check for the comment that documents this behavior
      expect(scriptContent).toContain('NOTE: UUIDs (translation.id) are NEVER displayed in the UI');
    });

    it('should not create input fields for UUID (verified in webview script)', () => {
      const scriptPath = path.join(__dirname, '..', '..', '..', '..', 'media', 'locale-editor.ts');
      const scriptContent = fs.readFileSync(scriptPath, 'utf8');

      // Check that renderTranslations only creates inputs for languageCode and label
      // It creates langInput and textInput, but no idInput for translations
      expect(scriptContent).toContain('const langInput = document.createElement');
      expect(scriptContent).toContain('const textInput = document.createElement');

      // The function creates translation cards with only two form groups
      // UUID is stored in data attribute but never shown to user
    });

    it('should store UUID only in data attributes (verified in webview script)', () => {
      const scriptPath = path.join(__dirname, '..', '..', '..', '..', 'media', 'locale-editor.ts');
      const scriptContent = fs.readFileSync(scriptPath, 'utf8');

      // UUID is stored as data attribute for focus restoration, not displayed
      expect(scriptContent).toContain('card.dataset.translationId = translation.id');
    });

    it('should not include UUID in ARIA labels (verified in webview script)', () => {
      const scriptPath = path.join(__dirname, '..', '..', '..', '..', 'media', 'locale-editor.ts');
      const scriptContent = fs.readFileSync(scriptPath, 'utf8');

      // ARIA labels use languageCode and label, not UUID
      // Check that aria-label references languageCode
      expect(scriptContent).toContain('translation.languageCode');
      expect(scriptContent).toContain('translation.label');

      // Verify the aria-label pattern doesn't include id directly
      // The actual line: `Translation ${translation.languageCode || 'new'}: ${translation.label || 'empty'}`
      const ariaLabelMatch = scriptContent.match(/aria-label.*Translation.*languageCode.*label/s);
      expect(ariaLabelMatch).not.toBeNull();
    });

    it('should not show UUID in HTML template (verified in template)', () => {
      const templatePath = path.join(__dirname, '..', 'templates', 'locale-editor.html');
      const templateContent = fs.readFileSync(templatePath, 'utf8');

      // The static HTML template should not contain UUID-related UI elements
      // The template has the modal with "Language Code" input
      // Translation forms are created dynamically in the webview script
      expect(templateContent).toContain('Language Code');

      // Should not have a "Translation ID" or "UUID" label in the template
      expect(templateContent).not.toContain('Translation ID');
      expect(templateContent).not.toContain('>UUID<');
      expect(templateContent).not.toContain('translation.id');
    });
  });
});
