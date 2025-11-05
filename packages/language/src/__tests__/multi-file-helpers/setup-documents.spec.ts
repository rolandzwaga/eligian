/**
 * Integration tests for setupDocuments() helper
 *
 * This test suite validates the setupDocuments() helper method that creates
 * multiple documents in the test workspace with automatic building and
 * cross-reference resolution.
 *
 * Test Strategy:
 * - Test-First Development (TDD): Tests written before implementation
 * - These tests will FAIL until setupDocuments() is implemented
 * - Tests verify: single document creation, multi-document coordination, mock FS integration
 */

import { URI } from 'langium';
import { beforeEach, describe, expect, test } from 'vitest';
import {
  createTestContextWithMockFS,
  DiagnosticSeverity,
  setupCSSRegistry,
  setupDocuments,
  type TestContext,
} from '../test-helpers.js';

describe('setupDocuments() helper', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestContextWithMockFS();
    setupCSSRegistry(ctx, 'file:///test/test.css', {
      classes: ['active'],
      ids: ['app'],
    });
  });

  test('should create single document in workspace', async () => {
    const docs = await setupDocuments(ctx, [
      { uri: 'file:///test/lib.eligian', content: 'library lib action x() []' },
    ]);

    expect(docs.size).toBe(1);
    expect(docs.has('file:///test/lib.eligian')).toBe(true);

    const doc = docs.get('file:///test/lib.eligian')!;
    expect(doc.parseResult.value).toBeDefined();
    expect(doc.diagnostics?.filter(d => d.severity === 1)).toHaveLength(0);
  });

  test('should create multiple documents and build together', async () => {
    const docs = await setupDocuments(ctx, [
      { uri: 'file:///test/lib1.eligian', content: 'library lib1 action x() []' },
      { uri: 'file:///test/lib2.eligian', content: 'library lib2 action y() []' },
    ]);

    expect(docs.size).toBe(2);

    // Both documents should be created and validated
    const lib1Doc = docs.get('file:///test/lib1.eligian')!;
    expect(lib1Doc.parseResult.value).toBeDefined();
    const lib1Errors =
      lib1Doc.diagnostics?.filter(d => d.severity === DiagnosticSeverity.Error) ?? [];
    expect(lib1Errors).toHaveLength(0);

    const lib2Doc = docs.get('file:///test/lib2.eligian')!;
    expect(lib2Doc.parseResult.value).toBeDefined();
    const lib2Errors =
      lib2Doc.diagnostics?.filter(d => d.severity === DiagnosticSeverity.Error) ?? [];
    expect(lib2Errors).toHaveLength(0);
  });

  test('should write to mock FS if available', async () => {
    await setupDocuments(ctx, [{ uri: 'file:///test/lib.eligian', content: 'library lib' }]);

    const exists = await ctx.mockFs!.exists(URI.parse('file:///test/lib.eligian'));
    expect(exists).toBe(true);

    const content = await ctx.mockFs!.readFile(URI.parse('file:///test/lib.eligian'));
    expect(content).toContain('library lib');
  });

  test('should handle 10 libraries in under 500ms (performance)', async () => {
    const libraries = Array.from({ length: 10 }, (_, i) => ({
      uri: `file:///test/lib${i}.eligian`,
      content: `library lib${i} action action${i}() [ selectElement("#element${i}") ]`,
    }));

    const start = performance.now();
    const docs = await setupDocuments(ctx, libraries);
    const duration = performance.now() - start;

    // Verify all documents created successfully
    expect(docs.size).toBe(10);

    // Verify all documents are valid
    for (let i = 0; i < 10; i++) {
      const doc = docs.get(`file:///test/lib${i}.eligian`)!;
      expect(doc.parseResult.value).toBeDefined();
      const errors = doc.diagnostics?.filter(d => d.severity === DiagnosticSeverity.Error) ?? [];
      expect(errors).toHaveLength(0);
    }

    // Performance requirement: < 500ms
    expect(duration).toBeLessThan(500);
  });
});
