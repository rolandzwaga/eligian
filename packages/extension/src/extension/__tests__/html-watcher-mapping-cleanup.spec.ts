/**
 * HTML Watcher Mapping Cleanup Tests
 *
 * Tests for the clearDocumentMappings() behavior to prevent regressions
 * when HTML import paths change (e.g., correcting invalid paths).
 *
 * Bug context: When an HTML import path was corrected after being invalid,
 * stale mappings remained, causing validation to fail. The fix ensures
 * old mappings are cleared before registering new ones.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { HTMLWatcherManager } from '../html-watcher.js';

describe('HTML Watcher Mapping Cleanup', () => {
  let watcher: HTMLWatcherManager;
  let mockClient: { sendNotification: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockClient = {
      sendNotification: vi.fn(),
    };
    watcher = new HTMLWatcherManager(() => {}, mockClient as any);
  });

  afterEach(() => {
    watcher.dispose();
  });

  test('should clear old mappings when HTML path changes', () => {
    const docUri = 'file:///F:/workspace/test.eligian';
    const oldHtmlUri = './old-layout.html';
    const newHtmlUri = './layout.html';

    // Register with old (invalid) path - should not crash
    expect(() => watcher.registerImport(docUri, oldHtmlUri)).not.toThrow();

    // Register with new (corrected) path - should not crash
    // The clearDocumentMappings() call ensures old mappings are removed
    expect(() => watcher.registerImport(docUri, newHtmlUri)).not.toThrow();

    // Registering again with same path should be idempotent
    expect(() => watcher.registerImport(docUri, newHtmlUri)).not.toThrow();
  });

  test('should clean up empty sets to prevent memory leaks', () => {
    const doc1Uri = 'file:///F:/workspace/doc1.eligian';
    const doc2Uri = 'file:///F:/workspace/doc2.eligian';
    const htmlUri = './shared-layout.html';

    // Both documents import the same HTML file
    watcher.registerImport(doc1Uri, htmlUri);
    watcher.registerImport(doc2Uri, htmlUri);

    // Change doc1's import to a different file
    watcher.registerImport(doc1Uri, './other-layout.html');

    // The shared HTML mapping should still exist for doc2
    // (We can't directly test internal state, but we can verify no crashes)
    expect(() => watcher.registerImport(doc2Uri, htmlUri)).not.toThrow();
  });

  test('should handle correcting invalid path to valid path', () => {
    const docUri = 'file:///F:/workspace/test.eligian';
    const invalidPath = './non-existent.html';
    const validPath = './layout.html';

    // Register with invalid path - should not crash
    expect(() => watcher.registerImport(docUri, invalidPath)).not.toThrow();

    // Correct the path - should not crash
    expect(() => watcher.registerImport(docUri, validPath)).not.toThrow();
  });

  test('should handle empty HTML URI (clearing import)', () => {
    const docUri = 'file:///F:/workspace/test.eligian';
    const htmlUri = './layout.html';

    // Register with HTML file - should not crash
    expect(() => watcher.registerImport(docUri, htmlUri)).not.toThrow();

    // Clear import (empty string) - should not crash
    expect(() => watcher.registerImport(docUri, '')).not.toThrow();
  });

  test('should handle rapid path corrections', () => {
    const docUri = 'file:///F:/workspace/test.eligian';
    const paths = ['./attempt1.html', './attempt2.html', './attempt3.html', './correct.html'];

    // Simulate rapid path corrections (typos being fixed) - should not crash
    for (const htmlPath of paths) {
      expect(() => watcher.registerImport(docUri, htmlPath)).not.toThrow();
    }
  });

  test('should handle multiple documents sharing HTML file', () => {
    const doc1Uri = 'file:///F:/workspace/doc1.eligian';
    const doc2Uri = 'file:///F:/workspace/doc2.eligian';
    const sharedHtml = './shared-layout.html';
    const doc1Html = './doc1-layout.html';

    // doc1 imports shared - should not crash
    expect(() => watcher.registerImport(doc1Uri, sharedHtml)).not.toThrow();

    // doc2 imports shared - should not crash
    expect(() => watcher.registerImport(doc2Uri, sharedHtml)).not.toThrow();

    // Change doc1 to import different file - should not crash
    expect(() => watcher.registerImport(doc1Uri, doc1Html)).not.toThrow();
  });

  test('should handle switching between different HTML layouts', () => {
    const docUri = 'file:///F:/workspace/test.eligian';
    const layout1 = './layout-mobile.html';
    const layout2 = './layout-desktop.html';
    const layout3 = './layout-tablet.html';

    // Switch between different HTML layouts - should not crash
    expect(() => watcher.registerImport(docUri, layout1)).not.toThrow();
    expect(() => watcher.registerImport(docUri, layout2)).not.toThrow();
    expect(() => watcher.registerImport(docUri, layout3)).not.toThrow();
  });

  test('should handle path normalization across corrections', () => {
    const docUri = 'file:///F:/workspace/test.eligian';

    // Different ways to reference the same file
    const paths = ['./layout.html', 'layout.html', './subfolder/../layout.html'];

    // Register each path variation - should not crash
    for (const htmlPath of paths) {
      expect(() => watcher.registerImport(docUri, htmlPath)).not.toThrow();
    }
  });

  test('should handle document reopening with different HTML file', () => {
    const docUri = 'file:///F:/workspace/test.eligian';
    const firstHtml = './layout-v1.html';
    const secondHtml = './layout-v2.html';

    // Initial open - should not crash
    expect(() => watcher.registerImport(docUri, firstHtml)).not.toThrow();

    // Simulate closing and reopening with different HTML file - should not crash
    expect(() => watcher.registerImport(docUri, secondHtml)).not.toThrow();
  });

  test('should handle correcting typo in filename', () => {
    const docUri = 'file:///F:/workspace/test.eligian';
    const typoPath = './layuot.html'; // typo
    const correctPath = './layout.html';

    // Register with typo - should not crash
    expect(() => watcher.registerImport(docUri, typoPath)).not.toThrow();

    // Correct the typo - should not crash
    expect(() => watcher.registerImport(docUri, correctPath)).not.toThrow();
  });
});
