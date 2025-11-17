/**
 * Unit tests for Label Registry Service
 *
 * Tests the centralized registry for tracking label IDs per document.
 */

import { beforeEach, describe, expect, test } from 'vitest';
import { type LabelGroupMetadata, LabelRegistryService } from '../label-registry.js';

describe('LabelRegistryService', () => {
  let registry: LabelRegistryService;

  const mockLabelsFileUri = 'file:///workspace/labels.json';
  const mockDocumentUri = 'file:///workspace/program.eligian';

  const mockMetadata: LabelGroupMetadata[] = [
    { id: 'welcome-title', translationCount: 2, languageCodes: ['en-US', 'nl-NL'] },
    { id: 'button-text', translationCount: 1, languageCodes: ['en-US'] },
    { id: 'error-message', translationCount: 3, languageCodes: ['en-US', 'nl-NL', 'fr-FR'] },
  ];

  beforeEach(() => {
    registry = new LabelRegistryService();
  });

  describe('updateLabelsFile', () => {
    test('stores label metadata for a labels file', () => {
      registry.updateLabelsFile(mockLabelsFileUri, mockMetadata);

      // Verify by checking if labels are retrievable after registration
      registry.registerImports(mockDocumentUri, mockLabelsFileUri);
      const labelIDs = registry.getLabelIDsForDocument(mockDocumentUri);

      expect(labelIDs.has('welcome-title')).toBe(true);
      expect(labelIDs.has('button-text')).toBe(true);
      expect(labelIDs.has('error-message')).toBe(true);
    });

    test('replaces existing metadata when called twice (hot-reload)', () => {
      // Initial metadata
      registry.updateLabelsFile(mockLabelsFileUri, mockMetadata);
      registry.registerImports(mockDocumentUri, mockLabelsFileUri);

      // Updated metadata (removed 'button-text')
      const updatedMetadata: LabelGroupMetadata[] = [
        { id: 'welcome-title', translationCount: 2, languageCodes: ['en-US', 'nl-NL'] },
        { id: 'new-label', translationCount: 1, languageCodes: ['en-US'] },
      ];

      registry.updateLabelsFile(mockLabelsFileUri, updatedMetadata);

      const labelIDs = registry.getLabelIDsForDocument(mockDocumentUri);

      expect(labelIDs.has('welcome-title')).toBe(true);
      expect(labelIDs.has('new-label')).toBe(true);
      expect(labelIDs.has('button-text')).toBe(false); // Removed
      expect(labelIDs.has('error-message')).toBe(false); // Removed
    });
  });

  describe('registerImports', () => {
    test('registers labels file URI for a document', () => {
      registry.updateLabelsFile(mockLabelsFileUri, mockMetadata);
      registry.registerImports(mockDocumentUri, mockLabelsFileUri);

      const labelIDs = registry.getLabelIDsForDocument(mockDocumentUri);
      expect(labelIDs.size).toBe(3);
    });

    test('replaces previous labels file registration', () => {
      const labelsFile1 = 'file:///workspace/labels1.json';
      const labelsFile2 = 'file:///workspace/labels2.json';

      registry.updateLabelsFile(labelsFile1, [
        { id: 'label1', translationCount: 1, languageCodes: ['en-US'] },
      ]);
      registry.updateLabelsFile(labelsFile2, [
        { id: 'label2', translationCount: 1, languageCodes: ['en-US'] },
      ]);

      // Register first file
      registry.registerImports(mockDocumentUri, labelsFile1);
      expect(registry.hasLabelID(mockDocumentUri, 'label1')).toBe(true);

      // Register second file (replaces first)
      registry.registerImports(mockDocumentUri, labelsFile2);
      expect(registry.hasLabelID(mockDocumentUri, 'label1')).toBe(false);
      expect(registry.hasLabelID(mockDocumentUri, 'label2')).toBe(true);
    });
  });

  describe('getLabelIDsForDocument', () => {
    test('returns empty set when no labels imported', () => {
      const labelIDs = registry.getLabelIDsForDocument(mockDocumentUri);
      expect(labelIDs.size).toBe(0);
    });

    test('returns empty set when labels file not found', () => {
      registry.registerImports(mockDocumentUri, 'file:///nonexistent.json');
      const labelIDs = registry.getLabelIDsForDocument(mockDocumentUri);
      expect(labelIDs.size).toBe(0);
    });

    test('returns all label IDs from imported labels file', () => {
      registry.updateLabelsFile(mockLabelsFileUri, mockMetadata);
      registry.registerImports(mockDocumentUri, mockLabelsFileUri);

      const labelIDs = registry.getLabelIDsForDocument(mockDocumentUri);

      expect(labelIDs.size).toBe(3);
      expect(labelIDs.has('welcome-title')).toBe(true);
      expect(labelIDs.has('button-text')).toBe(true);
      expect(labelIDs.has('error-message')).toBe(true);
    });
  });

  describe('hasLabelID', () => {
    beforeEach(() => {
      registry.updateLabelsFile(mockLabelsFileUri, mockMetadata);
      registry.registerImports(mockDocumentUri, mockLabelsFileUri);
    });

    test('returns true for existing label ID', () => {
      expect(registry.hasLabelID(mockDocumentUri, 'welcome-title')).toBe(true);
      expect(registry.hasLabelID(mockDocumentUri, 'button-text')).toBe(true);
    });

    test('returns false for non-existent label ID', () => {
      expect(registry.hasLabelID(mockDocumentUri, 'unknown-label')).toBe(false);
      expect(registry.hasLabelID(mockDocumentUri, 'missing')).toBe(false);
    });

    test('returns false when document has no imports', () => {
      expect(registry.hasLabelID('file:///other.eligian', 'welcome-title')).toBe(false);
    });
  });

  describe('findLabelMetadata', () => {
    beforeEach(() => {
      registry.updateLabelsFile(mockLabelsFileUri, mockMetadata);
      registry.registerImports(mockDocumentUri, mockLabelsFileUri);
    });

    test('returns metadata for existing label ID', () => {
      const metadata = registry.findLabelMetadata(mockDocumentUri, 'welcome-title');

      expect(metadata).toBeDefined();
      expect(metadata?.id).toBe('welcome-title');
      expect(metadata?.translationCount).toBe(2);
      expect(metadata?.languageCodes).toEqual(['en-US', 'nl-NL']);
    });

    test('returns metadata with correct translation count', () => {
      const metadata = registry.findLabelMetadata(mockDocumentUri, 'error-message');

      expect(metadata?.translationCount).toBe(3);
      expect(metadata?.languageCodes).toEqual(['en-US', 'nl-NL', 'fr-FR']);
    });

    test('returns undefined for non-existent label ID', () => {
      const metadata = registry.findLabelMetadata(mockDocumentUri, 'unknown-label');
      expect(metadata).toBeUndefined();
    });

    test('returns undefined when document has no imports', () => {
      const metadata = registry.findLabelMetadata('file:///other.eligian', 'welcome-title');
      expect(metadata).toBeUndefined();
    });
  });

  describe('clearDocument', () => {
    test('removes document import registration', () => {
      registry.updateLabelsFile(mockLabelsFileUri, mockMetadata);
      registry.registerImports(mockDocumentUri, mockLabelsFileUri);

      expect(registry.hasLabelID(mockDocumentUri, 'welcome-title')).toBe(true);

      registry.clearDocument(mockDocumentUri);

      expect(registry.hasLabelID(mockDocumentUri, 'welcome-title')).toBe(false);
      const labelIDs = registry.getLabelIDsForDocument(mockDocumentUri);
      expect(labelIDs.size).toBe(0);
    });

    test('does not affect other documents', () => {
      const doc1 = 'file:///doc1.eligian';
      const doc2 = 'file:///doc2.eligian';

      registry.updateLabelsFile(mockLabelsFileUri, mockMetadata);
      registry.registerImports(doc1, mockLabelsFileUri);
      registry.registerImports(doc2, mockLabelsFileUri);

      registry.clearDocument(doc1);

      expect(registry.hasLabelID(doc1, 'welcome-title')).toBe(false);
      expect(registry.hasLabelID(doc2, 'welcome-title')).toBe(true);
    });
  });

  describe('clearAll', () => {
    test('removes all registry data', () => {
      registry.updateLabelsFile(mockLabelsFileUri, mockMetadata);
      registry.registerImports(mockDocumentUri, mockLabelsFileUri);

      expect(registry.hasLabelID(mockDocumentUri, 'welcome-title')).toBe(true);

      registry.clearAll();

      expect(registry.hasLabelID(mockDocumentUri, 'welcome-title')).toBe(false);
      const labelIDs = registry.getLabelIDsForDocument(mockDocumentUri);
      expect(labelIDs.size).toBe(0);
    });
  });
});
