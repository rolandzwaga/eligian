/**
 * Integration tests for invalid labels import (User Story 2)
 *
 * Tests validation error messages for malformed labels JSON files
 */

import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadProgramAssets } from '../../asset-loading/compiler-integration.js';
import { createTestContext, type TestContext } from '../test-helpers.js';

describe('Invalid Labels Import Integration Tests (Feature 033, User Story 2)', () => {
  let ctx: TestContext;

  // Expensive setup - runs ONCE per suite
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

  describe('T020: JSON syntax errors', () => {
    it('should report error for invalid JSON syntax (T020)', async () => {
      const code = `
        labels './fixtures/invalid-syntax.json'

        action testAction() [
          selectElement("#element")
        ]

        timeline "test" in ".container" using raf {
          at 0s..1s testAction()
        }
      `;

      // Parse
      const program = await parseDSL(code);

      // Load assets (should have validation error)
      const sourceFilePath = resolve(__dirname, 'program.eligian');
      const assets = loadProgramAssets(program, sourceFilePath);

      // Verify error was captured
      expect(assets.errors).toHaveLength(1);
      const error = assets.errors[0];

      // Verify error details
      expect(error.type).toBe('validation-error');
      // TODO: Once error reporting is implemented, verify:
      // expect(error.message).toContain('Invalid JSON syntax');
      // expect(error.message).toContain('./fixtures/invalid-syntax.json');
    });
  });

  describe('T021: Schema validation errors', () => {
    it('should report error for missing id field (T021)', async () => {
      const code = `
        labels './fixtures/missing-id.json'

        action testAction() [
          selectElement("#element")
        ]

        timeline "test" in ".container" using raf {
          at 0s..1s testAction()
        }
      `;

      // Parse
      const program = await parseDSL(code);

      // Load assets
      const sourceFilePath = resolve(__dirname, 'program.eligian');
      const assets = loadProgramAssets(program, sourceFilePath);

      // Verify error
      expect(assets.errors).toHaveLength(1);
      // TODO: Verify error message contains "Missing required property 'id'"
    });

    it('should report error for empty labels array (T021)', async () => {
      const code = `
        labels './fixtures/empty-labels-array.json'

        action testAction() [
          selectElement("#element")
        ]

        timeline "test" in ".container" using raf {
          at 0s..1s testAction()
        }
      `;

      // Parse
      const program = await parseDSL(code);

      // Load assets
      const sourceFilePath = resolve(__dirname, 'program.eligian');
      const assets = loadProgramAssets(program, sourceFilePath);

      // Verify error
      expect(assets.errors).toHaveLength(1);
      // TODO: Verify error message contains "at least one translation"
    });

    it('should report error for missing languageCode (T021)', async () => {
      const code = `
        labels './fixtures/missing-languageCode.json'

        action testAction() [
          selectElement("#element")
        ]

        timeline "test" in ".container" using raf {
          at 0s..1s testAction()
        }
      `;

      // Parse
      const program = await parseDSL(code);

      // Load assets
      const sourceFilePath = resolve(__dirname, 'program.eligian');
      const assets = loadProgramAssets(program, sourceFilePath);

      // Verify error
      expect(assets.errors).toHaveLength(1);
      // TODO: Verify error message contains "Missing required property 'languageCode'"
    });

    it('should report error for missing label field (T021)', async () => {
      const code = `
        labels './fixtures/missing-label.json'

        action testAction() [
          selectElement("#element")
        ]

        timeline "test" in ".container" using raf {
          at 0s..1s testAction()
        }
      `;

      // Parse
      const program = await parseDSL(code);

      // Load assets
      const sourceFilePath = resolve(__dirname, 'program.eligian');
      const assets = loadProgramAssets(program, sourceFilePath);

      // Verify error
      expect(assets.errors).toHaveLength(1);
      // TODO: Verify error message contains "Missing required property 'label'"
    });
  });

  describe('T023: Invalid root type', () => {
    it('should report error when root is object instead of array (T023)', async () => {
      const code = `
        labels './fixtures/invalid-type-root.json'

        action testAction() [
          selectElement("#element")
        ]

        timeline "test" in ".container" using raf {
          at 0s..1s testAction()
        }
      `;

      // Parse
      const program = await parseDSL(code);

      // Load assets
      const sourceFilePath = resolve(__dirname, 'program.eligian');
      const assets = loadProgramAssets(program, sourceFilePath);

      // Verify error
      expect(assets.errors).toHaveLength(1);
      // TODO: Verify error message contains "must be an array"
    });
  });
});
