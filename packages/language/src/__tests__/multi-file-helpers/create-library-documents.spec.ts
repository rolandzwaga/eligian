/**
 * Integration tests for createLibraryDocuments() helper
 *
 * This test suite validates the createLibraryDocuments() helper method that
 * creates multiple library documents with semantic naming (wrapper around setupDocuments).
 *
 * Test Strategy:
 * - Test-First Development (TDD): Tests written before implementation
 * - These tests will FAIL until createLibraryDocuments() is implemented
 * - Tests verify: bulk library creation, shared library setup pattern
 */

import { URI } from 'langium';
import { beforeAll, describe, expect, test } from 'vitest';
import {
  createLibraryDocuments,
  createTestContextWithMockFS,
  DiagnosticSeverity,
  type TestContext,
} from '../test-helpers.js';

describe('createLibraryDocuments() helper', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContextWithMockFS();
  });

  test('should create multiple library documents', async () => {
    const docs = await createLibraryDocuments(ctx, [
      { uri: 'file:///test/animations.eligian', content: 'library animations action fadeIn() []' },
      { uri: 'file:///test/utils.eligian', content: 'library utils action helper() []' },
    ]);

    expect(docs.size).toBe(2);
    expect(docs.has('file:///test/animations.eligian')).toBe(true);
    expect(docs.has('file:///test/utils.eligian')).toBe(true);

    // Verify both libraries are valid
    const animDoc = docs.get('file:///test/animations.eligian')!;
    const animErrors =
      animDoc.diagnostics?.filter(d => d.severity === DiagnosticSeverity.Error) ?? [];
    expect(animErrors).toHaveLength(0);

    const utilsDoc = docs.get('file:///test/utils.eligian')!;
    const utilsErrors =
      utilsDoc.diagnostics?.filter(d => d.severity === DiagnosticSeverity.Error) ?? [];
    expect(utilsErrors).toHaveLength(0);
  });

  test('should work with beforeAll pattern for shared libraries', async () => {
    // This test verifies the common pattern where libraries are created once per suite
    const sharedLibs = await createLibraryDocuments(ctx, [
      { uri: 'file:///test/shared.eligian', content: 'library shared action common() []' },
    ]);

    expect(sharedLibs.size).toBe(1);

    // Verify library is accessible via workspace
    const doc = ctx.services.shared.workspace.LangiumDocuments.getDocument(
      URI.parse('file:///test/shared.eligian')
    );
    expect(doc).toBeDefined();
  });
});
