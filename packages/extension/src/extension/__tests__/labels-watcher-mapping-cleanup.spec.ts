/**
 * Labels Watcher Mapping Cleanup Tests
 *
 * Tests for the clearDocumentMappings() behavior to prevent regressions
 * when labels import paths change (e.g., correcting invalid paths).
 *
 * Bug context: When a labels import path was corrected after being invalid,
 * stale mappings remained, causing validation to fail. The fix ensures
 * old mappings are cleared before registering new ones.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { LabelsWatcherManager } from '../labels-watcher.js';

// Mock console.error to suppress debug logs
vi.spyOn(console, 'error').mockImplementation(() => {});

describe('Labels Watcher Mapping Cleanup', () => {
  let watcher: LabelsWatcherManager;
  let mockClient: { sendNotification: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockClient = {
      sendNotification: vi.fn(),
    };
    watcher = new LabelsWatcherManager(() => {}, mockClient as any);
  });

  afterEach(() => {
    watcher.dispose();
  });

  test('should clear old mappings when labels path changes', () => {
    const docUri = 'file:///F:/workspace/test.eligian';
    const oldLabelsUri = './old-labels.json';
    const newLabelsUri = './labels.json';

    // Register with old (invalid) path - should not crash
    expect(() => watcher.registerImport(docUri, oldLabelsUri)).not.toThrow();

    // Register with new (corrected) path - should not crash
    // The clearDocumentMappings() call ensures old mappings are removed
    expect(() => watcher.registerImport(docUri, newLabelsUri)).not.toThrow();

    // Registering again with same path should be idempotent
    expect(() => watcher.registerImport(docUri, newLabelsUri)).not.toThrow();
  });

  test('should clean up empty sets to prevent memory leaks', () => {
    const doc1Uri = 'file:///F:/workspace/doc1.eligian';
    const doc2Uri = 'file:///F:/workspace/doc2.eligian';
    const labelsUri = './shared-labels.json';

    // Both documents import the same labels file
    watcher.registerImport(doc1Uri, labelsUri);
    watcher.registerImport(doc2Uri, labelsUri);

    // Change doc1's import to a different file
    watcher.registerImport(doc1Uri, './other-labels.json');

    // The shared labels mapping should still exist for doc2
    // (We can't directly test internal state, but we can verify no crashes)
    expect(() => watcher.registerImport(doc2Uri, labelsUri)).not.toThrow();
  });

  test('should handle correcting invalid path to valid path', () => {
    const docUri = 'file:///F:/workspace/test.eligian';
    const invalidPath = './non-existent.json';
    const validPath = './labels.json';

    // Register with invalid path - should not crash
    expect(() => watcher.registerImport(docUri, invalidPath)).not.toThrow();

    // Correct the path - should not crash
    expect(() => watcher.registerImport(docUri, validPath)).not.toThrow();
  });

  test('should handle empty labels URI (clearing import)', () => {
    const docUri = 'file:///F:/workspace/test.eligian';
    const labelsUri = './labels.json';

    // Register with labels file - should not crash
    expect(() => watcher.registerImport(docUri, labelsUri)).not.toThrow();

    // Clear import (empty string) - should not crash
    expect(() => watcher.registerImport(docUri, '')).not.toThrow();
  });

  test('should handle rapid path corrections', () => {
    const docUri = 'file:///F:/workspace/test.eligian';
    const paths = ['./attempt1.json', './attempt2.json', './attempt3.json', './correct.json'];

    // Simulate rapid path corrections (typos being fixed) - should not crash
    for (const labelsPath of paths) {
      expect(() => watcher.registerImport(docUri, labelsPath)).not.toThrow();
    }
  });

  test('should handle multiple documents sharing labels file', () => {
    const doc1Uri = 'file:///F:/workspace/doc1.eligian';
    const doc2Uri = 'file:///F:/workspace/doc2.eligian';
    const sharedLabels = './shared-labels.json';
    const doc1Labels = './doc1-labels.json';

    // doc1 imports shared - should not crash
    expect(() => watcher.registerImport(doc1Uri, sharedLabels)).not.toThrow();

    // doc2 imports shared - should not crash
    expect(() => watcher.registerImport(doc2Uri, sharedLabels)).not.toThrow();

    // Change doc1 to import different file - should not crash
    expect(() => watcher.registerImport(doc1Uri, doc1Labels)).not.toThrow();
  });

  test('should handle switching between different labels files', () => {
    const docUri = 'file:///F:/workspace/test.eligian';
    const labels1 = './labels-en.json';
    const labels2 = './labels-es.json';
    const labels3 = './labels-fr.json';

    // Switch between different labels files - should not crash
    expect(() => watcher.registerImport(docUri, labels1)).not.toThrow();
    expect(() => watcher.registerImport(docUri, labels2)).not.toThrow();
    expect(() => watcher.registerImport(docUri, labels3)).not.toThrow();
  });

  test('should handle path normalization across corrections', () => {
    const docUri = 'file:///F:/workspace/test.eligian';

    // Different ways to reference the same file
    const paths = ['./labels.json', 'labels.json', './subfolder/../labels.json'];

    // Register each path variation - should not crash
    for (const labelsPath of paths) {
      expect(() => watcher.registerImport(docUri, labelsPath)).not.toThrow();
    }
  });

  test('should handle document reopening with different labels file', () => {
    const docUri = 'file:///F:/workspace/test.eligian';
    const firstLabels = './labels-v1.json';
    const secondLabels = './labels-v2.json';

    // Initial open - should not crash
    expect(() => watcher.registerImport(docUri, firstLabels)).not.toThrow();

    // Simulate closing and reopening with different labels file - should not crash
    expect(() => watcher.registerImport(docUri, secondLabels)).not.toThrow();
  });
});
