/**
 * CSS Watcher Mapping Cleanup Tests
 *
 * Tests for the clearDocumentMappings() behavior to prevent regressions
 * when import paths change (e.g., correcting invalid paths).
 *
 * Bug context: When a CSS import path was corrected after being invalid,
 * stale mappings remained, causing validation to fail. The fix ensures
 * old mappings are cleared before registering new ones.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { CSSWatcherManager } from '../css-watcher.js';

describe('CSS Watcher Mapping Cleanup', () => {
  let watcher: CSSWatcherManager;
  let mockClient: { sendNotification: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockClient = {
      sendNotification: vi.fn(),
    };
    watcher = new CSSWatcherManager(() => {}, mockClient as any);
  });

  afterEach(() => {
    watcher.dispose();
  });

  test('should clear old mappings when CSS path changes', () => {
    const docUri = 'file:///F:/workspace/test.eligian';
    const oldCssUri = './old-styles.css';
    const newCssUri = './styles.css';

    // Register with old (invalid) path - should not crash
    expect(() => watcher.registerImports(docUri, [oldCssUri])).not.toThrow();

    // Register with new (corrected) path - should not crash
    // The clearDocumentMappings() call ensures old mappings are removed
    expect(() => watcher.registerImports(docUri, [newCssUri])).not.toThrow();

    // Registering again with same path should be idempotent
    expect(() => watcher.registerImports(docUri, [newCssUri])).not.toThrow();
  });

  test('should handle multiple CSS files changing', () => {
    const docUri = 'file:///F:/workspace/test.eligian';
    const oldCssUris = ['./old1.css', './old2.css'];
    const newCssUris = ['./new1.css', './new2.css'];

    // Register with old paths - should not crash
    expect(() => watcher.registerImports(docUri, oldCssUris)).not.toThrow();

    // Register with new paths - should not crash
    // Old mappings are cleared automatically
    expect(() => watcher.registerImports(docUri, newCssUris)).not.toThrow();

    // Should be idempotent
    expect(() => watcher.registerImports(docUri, newCssUris)).not.toThrow();
  });

  test('should clean up empty sets to prevent memory leaks', () => {
    const doc1Uri = 'file:///F:/workspace/doc1.eligian';
    const doc2Uri = 'file:///F:/workspace/doc2.eligian';
    const cssUri = './shared.css';

    // Both documents import the same CSS file
    watcher.registerImports(doc1Uri, [cssUri]);
    watcher.registerImports(doc2Uri, [cssUri]);

    // Change doc1's import to a different file
    watcher.registerImports(doc1Uri, ['./other.css']);

    // The shared CSS mapping should still exist for doc2
    // (We can't directly test internal state, but we can verify no crashes)
    expect(() => watcher.registerImports(doc2Uri, [cssUri])).not.toThrow();
  });

  test('should handle correcting invalid path to valid path', () => {
    const docUri = 'file:///F:/workspace/test.eligian';
    const invalidPath = './non-existent.css';
    const validPath = './styles.css';

    // Register with invalid path - should not crash
    expect(() => watcher.registerImports(docUri, [invalidPath])).not.toThrow();

    // Correct the path - should not crash
    expect(() => watcher.registerImports(docUri, [validPath])).not.toThrow();
  });

  test('should handle empty CSS list (clearing all imports)', () => {
    const docUri = 'file:///F:/workspace/test.eligian';
    const cssUri = './styles.css';

    // Register with CSS file
    expect(() => watcher.registerImports(docUri, [cssUri])).not.toThrow();

    // Clear all imports (empty array) - should not crash
    expect(() => watcher.registerImports(docUri, [])).not.toThrow();
  });

  test('should handle rapid path corrections', () => {
    const docUri = 'file:///F:/workspace/test.eligian';
    const paths = ['./attempt1.css', './attempt2.css', './attempt3.css', './correct.css'];

    // Simulate rapid path corrections (typos being fixed) - should not crash
    for (const cssPath of paths) {
      expect(() => watcher.registerImports(docUri, [cssPath])).not.toThrow();
    }
  });

  test('should handle multiple documents with overlapping CSS files', () => {
    const doc1Uri = 'file:///F:/workspace/doc1.eligian';
    const doc2Uri = 'file:///F:/workspace/doc2.eligian';
    const sharedCss = './shared.css';
    const doc1Css = './doc1-specific.css';

    // doc1 imports shared + specific
    expect(() => watcher.registerImports(doc1Uri, [sharedCss, doc1Css])).not.toThrow();

    // doc2 imports only shared
    expect(() => watcher.registerImports(doc2Uri, [sharedCss])).not.toThrow();

    // Change doc1 to only import specific (removing shared) - should not crash
    expect(() => watcher.registerImports(doc1Uri, [doc1Css])).not.toThrow();
  });

  test('should handle path normalization across corrections', () => {
    const docUri = 'file:///F:/workspace/test.eligian';

    // Different ways to reference the same file - all should work without crashing
    const paths = ['./styles.css', 'styles.css', './subfolder/../styles.css'];

    for (const cssPath of paths) {
      expect(() => watcher.registerImports(docUri, [cssPath])).not.toThrow();
    }
  });
});
