/**
 * Integration tests for missing labels file (User Story 3)
 *
 * Tests error handling when labels file doesn't exist
 */

import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadProgramAssets } from '../../asset-loading/compiler-integration.js';
import { createTestContext, type TestContext } from '../test-helpers.js';

describe('Missing Labels File Integration Tests (Feature 033, User Story 3)', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  async function parseDSL(code: string) {
    const document = await ctx.parse(code);
    if (document.parseResult.parserErrors.length > 0) {
      throw new Error(
        `Parse errors: ${document.parseResult.parserErrors.map(e => e.message).join(', ')}`
      );
    }
    return document.parseResult.value;
  }

  describe('T028: File not found', () => {
    it('should report error when labels file does not exist (T028)', async () => {
      const code = `
        labels './nonexistent.json'

        action testAction() [
          selectElement("#element")
        ]

        timeline "test" in ".container" using raf {
          at 0s..1s testAction()
        }
      `;

      const program = await parseDSL(code);
      const sourceFilePath = resolve(__dirname, 'program.eligian');
      const assets = loadProgramAssets(program, sourceFilePath);

      // Verify error
      expect(assets.errors).toHaveLength(1);
      const error = assets.errors[0];
      expect(error.type).toBe('missing-file');
      expect(error.filePath).toBe('./nonexistent.json');
      expect(error.message).toContain('nonexistent.json');
    });
  });
});
