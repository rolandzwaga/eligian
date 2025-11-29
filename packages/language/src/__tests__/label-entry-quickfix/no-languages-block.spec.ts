/**
 * Integration tests for Label Entry Quick Fix - No Languages Block (Feature 041 - User Story 3)
 *
 * Tests the behavior when an Eligian file uses labels but has no languages block.
 * The validator enforces that a languages block is required when importing labels,
 * so the quick fix is not offered in this scenario.
 *
 * Note: The extractLanguageCodes() fallback to ['en-US'] exists for backward compatibility
 * but is not triggered in label validation because the validator bails out early.
 */
import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import {
  createTestContext,
  DiagnosticSeverity,
  minimalProgram,
  type TestContext,
} from '../test-helpers.js';

describe('No Languages Block Behavior (Feature 041, User Story 3)', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  beforeEach(() => {
    // Clear registries before each test
    ctx.services.Eligian.labels.LabelRegistry.clearAll();
    ctx.services.Eligian.css.CSSRegistry.clearAll();
  });

  // T036: Validator requires languages block when labels are imported
  test('should show error when labels imported without languages block (T036)', async () => {
    // Program with labels import but NO languages block
    const code = `labels "./labels.json"
${minimalProgram({
  cssImport: false,
  actionBody: `
        selectElement("#header")
        addController("LabelController", "some-label")
      `,
  timelineBody: 'at 0s..1s testAction()',
})}`;

    const document = await ctx.parse(code);
    await ctx.services.shared.workspace.DocumentBuilder.build([document], { validation: true });

    const diagnostics = document.diagnostics ?? [];

    // Should have error about missing languages block
    const languagesBlockErrors = diagnostics.filter(
      d => d.severity === DiagnosticSeverity.Error && d.message.includes('languages block')
    );

    expect(languagesBlockErrors.length).toBeGreaterThan(0);
    expect(languagesBlockErrors[0].message).toContain('requires a languages block');
  });

  // T037: Quick fix NOT offered when languages block is missing
  test('should NOT offer label entry quick fix when no languages block (T037)', async () => {
    // Program with labels import but NO languages block
    const code = `labels "./labels.json"
${minimalProgram({
  cssImport: false,
  actionBody: `
        selectElement("#header")
        addController("LabelController", "missing-label")
      `,
  timelineBody: 'at 0s..1s testAction()',
})}`;

    const document = await ctx.parse(code);
    await ctx.services.shared.workspace.DocumentBuilder.build([document], { validation: true });

    const diagnostics = document.diagnostics ?? [];

    // Should NOT have unknown_label_id diagnostic (validator bails out before label validation)
    const unknownLabelDiagnostics = diagnostics.filter(
      d => (d.data as any)?.code === 'unknown_label_id'
    );

    expect(unknownLabelDiagnostics.length).toBe(0);
  });

  // T038: With languages block, quick fix IS offered
  // NOTE: This is covered by T030 in code-action-availability.spec.ts
  // Here we test the extractLanguageCodes function directly
  test('should extract single language from languages block (T038)', async () => {
    const { extractLanguageCodes } = await import('../../labels/types.js');

    // Program with single language
    const programWithLanguages = {
      languages: {
        entries: [{ code: 'en-US', name: 'English' }],
      },
    };

    const codes = extractLanguageCodes(programWithLanguages as any);
    expect(codes).toEqual(['en-US']);
  });

  // T039: extractLanguageCodes returns default when called directly (unit behavior)
  test('extractLanguageCodes should return default for empty program (T039)', async () => {
    // Import the function directly to test its fallback behavior
    const { extractLanguageCodes } = await import('../../labels/types.js');

    // Program without languages block
    const programWithoutLanguages = {
      languages: undefined,
    };

    const codes = extractLanguageCodes(programWithoutLanguages as any);
    expect(codes).toEqual(['en-US']);
  });

  // T040: extractLanguageCodes returns languages from block
  test('extractLanguageCodes should return languages from block (T040)', async () => {
    const { extractLanguageCodes } = await import('../../labels/types.js');

    // Program with languages block
    const programWithLanguages = {
      languages: {
        entries: [
          { code: 'en-US', name: 'English' },
          { code: 'nl-NL', name: 'Dutch' },
          { code: 'de-DE', name: 'German' },
        ],
      },
    };

    const codes = extractLanguageCodes(programWithLanguages as any);
    expect(codes).toEqual(['en-US', 'nl-NL', 'de-DE']);
  });

  // T041: Language order is preserved (unit test on extractLanguageCodes)
  test('should preserve language order from languages block (T041)', async () => {
    const { extractLanguageCodes } = await import('../../labels/types.js');

    // Program with languages in non-alphabetical order
    const programWithLanguages = {
      languages: {
        entries: [
          { code: 'nl-NL', name: 'Nederlands' },
          { code: 'en-US', name: 'English' },
          { code: 'fr-FR', name: 'Français' },
        ],
      },
    };

    const codes = extractLanguageCodes(programWithLanguages as any);
    // Order should match the languages block (nl-NL first, not alphabetical)
    expect(codes).toEqual(['nl-NL', 'en-US', 'fr-FR']);
  });

  // T042: Multiple languages all extracted correctly
  test('should include all languages from block (T042)', async () => {
    const { extractLanguageCodes } = await import('../../labels/types.js');

    // Program with many languages
    const programWithLanguages = {
      languages: {
        entries: [
          { code: 'en-US', name: 'English' },
          { code: 'nl-NL', name: 'Nederlands' },
          { code: 'de-DE', name: 'Deutsch' },
          { code: 'fr-FR', name: 'Français' },
          { code: 'es-ES', name: 'Español' },
        ],
      },
    };

    const codes = extractLanguageCodes(programWithLanguages as any);
    expect(codes).toEqual(['en-US', 'nl-NL', 'de-DE', 'fr-FR', 'es-ES']);
    expect(codes.length).toBe(5);
  });
});
