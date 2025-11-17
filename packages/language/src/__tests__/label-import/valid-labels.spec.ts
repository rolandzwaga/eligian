/**
 * Integration tests for valid labels import (User Story 1)
 *
 * Tests the complete flow: parse → load → transform
 */

import { resolve } from 'node:path';
import { Effect } from 'effect';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadProgramAssets } from '../../asset-loading/compiler-integration.js';
import { transformAST } from '../../compiler/ast-transformer.js';
import { createTestContext, type TestContext } from '../test-helpers.js';

describe('Valid Labels Import Integration Tests (Feature 033, User Story 1)', () => {
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

  describe('T010: Basic labels import compiles successfully', () => {
    it('should compile program with valid labels import (T010)', async () => {
      const code = `
        labels './fixtures/valid-labels.json'

        action testAction() [
          selectElement("#element")
        ]

        timeline "test" in ".container" using raf {
          at 0s..1s testAction()
        }
      `;

      // Parse
      const program = await parseDSL(code);

      // Load assets (including labels)
      const sourceFilePath = resolve(__dirname, 'program.eligian');
      const assets = loadProgramAssets(program, sourceFilePath);

      // Transform
      const ir = await Effect.runPromise(transformAST(program, assets));

      // Verify config.labels is array of ILanguageLabel
      expect(Array.isArray(ir.config.labels)).toBe(true);
      expect(ir.config.labels).toHaveLength(2);

      // Verify all label groups present
      const labelGroupIds = ir.config.labels.map(group => group.id);
      expect(labelGroupIds).toContain('welcomeMessage');
      expect(labelGroupIds).toContain('continueButton');

      // Verify all translations present
      const welcomeGroup = ir.config.labels.find(g => g.id === 'welcomeMessage');
      expect(welcomeGroup?.labels).toHaveLength(2);
    });
  });

  describe('T011: Labels data assignment', () => {
    it('should correctly assign label data from JSON to config (T011)', async () => {
      const code = `
        labels './fixtures/valid-labels.json'

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

      // Transform
      const ir = await Effect.runPromise(transformAST(program, assets));

      expect(ir.config.labels).toBeDefined();

      // Test config.labels[0].id matches JSON
      const welcomeGroup = ir.config.labels.find(g => g.id === 'welcomeMessage');
      expect(welcomeGroup).toBeDefined();
      expect(welcomeGroup?.id).toBe('welcomeMessage');

      // Test config.labels[0].labels[0] matches JSON
      const enTranslation = welcomeGroup?.labels.find(l => l.languageCode === 'en-US');
      expect(enTranslation).toBeDefined();
      expect(enTranslation?.id).toBe('1');
      expect(enTranslation?.languageCode).toBe('en-US');
      expect(enTranslation?.label).toBe('Welcome to our presentation!');

      const nlTranslation = welcomeGroup?.labels.find(l => l.languageCode === 'nl-NL');
      expect(nlTranslation).toBeDefined();
      expect(nlTranslation?.id).toBe('2');
      expect(nlTranslation?.languageCode).toBe('nl-NL');
      expect(nlTranslation?.label).toBe('Welkom bij onze presentatie!');

      // Verify deep equality with expected structure
      expect(welcomeGroup).toEqual({
        id: 'welcomeMessage',
        labels: [
          {
            id: '1',
            languageCode: 'en-US',
            label: 'Welcome to our presentation!',
          },
          {
            id: '2',
            languageCode: 'nl-NL',
            label: 'Welkom bij onze presentatie!',
          },
        ],
      });
    });
  });

  describe('T012: Empty program without labels import', () => {
    it('should compile with empty labels array when no labels import (T012)', async () => {
      const code = `
        action testAction() [
          selectElement("#element")
        ]

        timeline "test" in ".container" using raf {
          at 0s..1s testAction()
        }
      `;

      // Parse
      const program = await parseDSL(code);

      // Load assets (should have no labels)
      const sourceFilePath = resolve(__dirname, 'program.eligian');
      const assets = loadProgramAssets(program, sourceFilePath);

      // Transform
      const ir = await Effect.runPromise(transformAST(program, assets));

      // Verify config.labels is empty array
      expect(ir.config.labels).toBeDefined();
      expect(Array.isArray(ir.config.labels)).toBe(true);
      expect(ir.config.labels).toHaveLength(0);
    });
  });
});
