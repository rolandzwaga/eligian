/**
 * Unit tests for Label ID Validation
 *
 * Tests the pure validation functions for label ID parameters.
 */

import { beforeEach, describe, expect, test } from 'vitest';
import { type LabelGroupMetadata, LabelRegistryService } from '../../utils/label-registry.js';
import { validateLabelID } from '../label-id-validation.js';

describe('Label ID Validation', () => {
  let registry: LabelRegistryService;
  const documentUri = 'file:///workspace/program.eligian';
  const labelsFileUri = 'file:///workspace/labels.json';

  const mockMetadata: LabelGroupMetadata[] = [
    { id: 'welcome-title', translationCount: 2, languageCodes: ['en-US', 'nl-NL'] },
    { id: 'button-text', translationCount: 1, languageCodes: ['en-US'] },
    { id: 'error-message', translationCount: 3, languageCodes: ['en-US', 'nl-NL', 'fr-FR'] },
  ];

  beforeEach(() => {
    registry = new LabelRegistryService();
  });

  describe('validateLabelID', () => {
    test('returns undefined for valid label ID', () => {
      registry.updateLabelsFile(labelsFileUri, mockMetadata);
      registry.registerImports(documentUri, labelsFileUri);

      const error = validateLabelID(documentUri, 'welcome-title', registry);

      expect(error).toBeUndefined();
    });

    test('returns error for unknown label ID', () => {
      registry.updateLabelsFile(labelsFileUri, mockMetadata);
      registry.registerImports(documentUri, labelsFileUri);

      const error = validateLabelID(documentUri, 'unknown-label', registry);

      expect(error).toBeDefined();
      expect(error?.code).toBe('unknown_label_id');
      expect(error?.message).toBe("Unknown label ID: 'unknown-label'");
    });

    test('returns error with no_labels_import code when no labels imported', () => {
      const error = validateLabelID(documentUri, 'some-label', registry);

      expect(error).toBeDefined();
      expect(error?.code).toBe('no_labels_import');
      expect(error?.message).toBe('Label ID parameter used but no labels imported');
      expect(error?.hint).toContain("labels './labels.json'");
    });

    test('provides suggestion for typo with Levenshtein distance ≤ 2', () => {
      registry.updateLabelsFile(labelsFileUri, mockMetadata);
      registry.registerImports(documentUri, labelsFileUri);

      // Typo: 'buttom-text' instead of 'button-text' (distance = 1)
      const error = validateLabelID(documentUri, 'buttom-text', registry);

      expect(error).toBeDefined();
      expect(error?.hint).toContain("Did you mean: 'button-text'?");
      expect(error?.suggestions).toContain('button-text');
    });

    test('provides suggestion for multiple character typo', () => {
      registry.updateLabelsFile(labelsFileUri, mockMetadata);
      registry.registerImports(documentUri, labelsFileUri);

      // Typo: 'welcom-title' instead of 'welcome-title' (distance = 1)
      const error = validateLabelID(documentUri, 'welcom-title', registry);

      expect(error).toBeDefined();
      expect(error?.hint).toContain("Did you mean: 'welcome-title'?");
      expect(error?.suggestions).toContain('welcome-title');
    });

    test('shows available label IDs when no close match found', () => {
      registry.updateLabelsFile(labelsFileUri, mockMetadata);
      registry.registerImports(documentUri, labelsFileUri);

      const error = validateLabelID(documentUri, 'completely-different', registry);

      expect(error).toBeDefined();
      expect(error?.hint).toContain('Available label IDs:');
      expect(error?.hint).toMatch(/welcome-title|button-text|error-message/);
    });

    test('limits available label IDs to first 5 when showing list', () => {
      const manyLabels: LabelGroupMetadata[] = Array.from({ length: 10 }, (_, i) => ({
        id: `label-${i}`,
        translationCount: 1,
        languageCodes: ['en-US'],
      }));

      registry.updateLabelsFile(labelsFileUri, manyLabels);
      registry.registerImports(documentUri, labelsFileUri);

      const error = validateLabelID(documentUri, 'unknown', registry);

      expect(error).toBeDefined();
      expect(error?.hint).toContain('...');
      // Should show first 5 + ellipsis
    });

    test('validates multiple label IDs independently', () => {
      registry.updateLabelsFile(labelsFileUri, mockMetadata);
      registry.registerImports(documentUri, labelsFileUri);

      const error1 = validateLabelID(documentUri, 'welcome-title', registry);
      const error2 = validateLabelID(documentUri, 'button-text', registry);
      const error3 = validateLabelID(documentUri, 'invalid-id', registry);

      expect(error1).toBeUndefined();
      expect(error2).toBeUndefined();
      expect(error3).toBeDefined();
      expect(error3?.code).toBe('unknown_label_id');
    });

    test('provides labelId in error object', () => {
      registry.updateLabelsFile(labelsFileUri, mockMetadata);
      registry.registerImports(documentUri, labelsFileUri);

      const error = validateLabelID(documentUri, 'invalid-label', registry);

      expect(error?.labelId).toBe('invalid-label');
    });

    test('does not suggest labels with distance > 2', () => {
      registry.updateLabelsFile(labelsFileUri, mockMetadata);
      registry.registerImports(documentUri, labelsFileUri);

      // Too different from any existing label
      const error = validateLabelID(documentUri, 'xyz', registry);

      expect(error).toBeDefined();
      expect(error?.suggestions).toHaveLength(0);
      expect(error?.hint).toContain('Available label IDs:');
    });
  });
});
