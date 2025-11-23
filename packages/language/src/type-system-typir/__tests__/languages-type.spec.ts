/**
 * LanguagesType Typir Integration Tests
 *
 * Tests for the LanguagesType Typir integration to verify that type inference
 * works correctly for languages blocks.
 *
 * Feature 037: User Story 5 - Typir Type Integration
 * Tasks: T047-T050, T058
 */

import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import {
  CSS_FIXTURES,
  createTestContext,
  minimalProgram,
  setupCSSRegistry,
  type TestContext,
} from '../../__tests__/test-helpers.js';

describe('LanguagesType Typir Integration (Feature 037 US5)', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  beforeEach(() => {
    // Setup CSS registry per test for state isolation
    // CSS_FIXTURES.common includes: ids: ['app', 'container', 'box', 'element']
    setupCSSRegistry(ctx, 'file:///styles.css', CSS_FIXTURES.common);
  });

  describe('T047-T050: Languages block type inference', () => {
    test('should parse and validate single language block without errors', async () => {
      const code = `
        languages {
          "en-US" "English"
        }
        ${minimalProgram({
          cssImport: true,
          cssPath: './styles.css',
          containerSelector: '#container',
          actionBody: 'wait(100)',
          timelineBody: 'at 0s..1s testAction()',
        })}
      `;

      const { errors, document } = await ctx.parseAndValidate(code);

      // Verify no parse or validation errors
      expect(errors).toHaveLength(0);

      // Verify languages block was parsed
      const program = document.parseResult.value as any;
      expect(program.languages).toBeDefined();
      expect(program.languages.entries).toHaveLength(1);
      expect(program.languages.entries[0].code).toBe('en-US');
    });

    test('should parse and validate multiple languages block without errors', async () => {
      const code = `
        languages {
          * "nl-NL" "Nederlands"
            "en-US" "English"
            "fr-FR" "Français"
        }
        ${minimalProgram({
          cssImport: true,
          cssPath: './styles.css',
          containerSelector: '#container',
          actionBody: 'wait(100)',
          timelineBody: 'at 0s..1s testAction()',
        })}
      `;

      const { errors, document } = await ctx.parseAndValidate(code);

      // Verify no errors
      expect(errors).toHaveLength(0);

      // Verify languages block structure
      const program = document.parseResult.value as any;
      expect(program.languages).toBeDefined();
      expect(program.languages.entries).toHaveLength(3);

      // Verify default marker
      const defaultEntry = program.languages.entries.find((e: any) => e.isDefault === true);
      expect(defaultEntry).toBeDefined();
      expect(defaultEntry.code).toBe('nl-NL');
    });

    test('should validate language code format via Langium validator', async () => {
      const code = `
        languages {
          "EN-US" "English"
        }
        ${minimalProgram({
          cssImport: true,
          cssPath: './styles.css',
          containerSelector: '#container',
          actionBody: 'wait(100)',
          timelineBody: 'at 0s..1s testAction()',
        })}
      `;

      const { errors } = await ctx.parseAndValidate(code);

      // Should have format validation error (from Langium validator, not Typir)
      const formatErrors = errors.filter(e => e.message.includes('Invalid language code format'));
      expect(formatErrors.length).toBeGreaterThan(0);
    });

    test('should validate duplicate language codes via Langium validator', async () => {
      const code = `
        languages {
          * "en-US" "English"
            "en-US" "American English"
        }
        ${minimalProgram({
          cssImport: true,
          cssPath: './styles.css',
          containerSelector: '#container',
          actionBody: 'wait(100)',
          timelineBody: 'at 0s..1s testAction()',
        })}
      `;

      const { errors } = await ctx.parseAndValidate(code);

      // Should have duplicate code error (from Langium validator, not Typir)
      const dupErrors = errors.filter(e => e.message.includes('Duplicate language code'));
      expect(dupErrors.length).toBeGreaterThan(0);
    });

    test('should validate default marker rules via Langium validator', async () => {
      const code = `
        languages {
          "en-US" "English"
          "nl-NL" "Nederlands"
        }
        ${minimalProgram({
          cssImport: true,
          cssPath: './styles.css',
          containerSelector: '#container',
          actionBody: 'wait(100)',
          timelineBody: 'at 0s..1s testAction()',
        })}
      `;

      const { errors } = await ctx.parseAndValidate(code);

      // Should have missing default marker error (from Langium validator, not Typir)
      const markerErrors = errors.filter(
        e => e.message.includes('Multiple languages') && e.message.includes('default')
      );
      expect(markerErrors.length).toBeGreaterThan(0);
    });
  });
});
