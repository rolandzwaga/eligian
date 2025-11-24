/**
 * Feature 039 - Label File Creation Quick Fix
 * User Story 2: Create Labels File with Language Template
 *
 * Tests for template generation with language codes.
 */

import { beforeAll, describe, expect, test } from 'vitest';
import type { EligianCodeActionProvider } from '../../eligian-code-action-provider.js';
import { createTestContext, type TestContext } from '../test-helpers.js';

describe('Label File Creation - Template Generation (Feature 039, User Story 2)', () => {
  let ctx: TestContext;
  let codeActionProvider: EligianCodeActionProvider;

  beforeAll(() => {
    ctx = createTestContext();
    codeActionProvider = ctx.services.Eligian.lsp.CodeActionProvider as EligianCodeActionProvider;
  });

  /**
   * T022: Verify empty array generation when no languages block
   *
   * Tests that generateLabelsFileContent returns '[]' when:
   * - hasLanguagesBlock = false
   * - languageCodes = []
   */
  test('should generate empty array when no languages block (T022)', () => {
    // Access private method via type assertion for testing
    const provider = codeActionProvider as any;
    const content = provider.generateLabelsFileContent(false, []);

    expect(content).toBe('[]');
  });

  /**
   * T023: Verify template generation with 2 language codes
   *
   * Tests that generated template:
   * - Has 'id' property at group level
   * - Has 'labels' array with translations
   * - Each label has id, languageCode, and label properties
   * - Is valid JSON
   */
  test('should generate template with 2 language codes (T023)', () => {
    const provider = codeActionProvider as any;
    const content = provider.generateLabelsFileContent(true, ['en-US', 'nl-NL']);

    // Parse JSON to verify structure
    const parsed = JSON.parse(content);

    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(1);

    const labelGroup = parsed[0];
    expect(labelGroup.id).toBe('example.label');
    expect(Array.isArray(labelGroup.labels)).toBe(true);
    expect(labelGroup.labels).toHaveLength(2);

    // Verify first translation (en-US)
    const enLabel = labelGroup.labels[0];
    expect(enLabel.id).toBe('1');
    expect(enLabel.languageCode).toBe('en-US');
    expect(enLabel.label).toBe('Example EN');

    // Verify second translation (nl-NL)
    const nlLabel = labelGroup.labels[1];
    expect(nlLabel.id).toBe('2');
    expect(nlLabel.languageCode).toBe('nl-NL');
    expect(nlLabel.label).toBe('Voorbeeld NL');
  });

  /**
   * T024: Verify template generation with 50 language codes
   *
   * Tests that the template handles many languages:
   * - All 50 language codes present as translations
   * - Valid JSON structure
   * - No duplicates
   */
  test('should generate template with 50 language codes (T024)', () => {
    const provider = codeActionProvider as any;

    // Generate 50 language codes
    const languageCodes = Array.from({ length: 50 }, (_, i) => `lang-${i}`);
    const content = provider.generateLabelsFileContent(true, languageCodes);

    // Parse JSON
    const parsed = JSON.parse(content);

    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(1);

    const labelGroup = parsed[0];
    expect(labelGroup.id).toBe('example.label');
    expect(Array.isArray(labelGroup.labels)).toBe(true);
    expect(labelGroup.labels).toHaveLength(50);

    // Verify each language code is present as a translation
    for (let i = 0; i < languageCodes.length; i++) {
      const translation = labelGroup.labels[i];
      expect(translation.id).toBe(String(i + 1));
      expect(translation.languageCode).toBe(languageCodes[i]);
      expect(typeof translation.label).toBe('string');
    }
  });

  /**
   * T025: Verify appropriate placeholder text for each language
   *
   * Tests that getLanguageName returns:
   * - Localized text for known languages (en-US, nl-NL, fr-FR, de-DE)
   * - Fallback text for unknown languages
   */
  test('should use appropriate placeholder text for each language (T025)', () => {
    const provider = codeActionProvider as any;

    // Test known languages
    expect(provider.getLanguageName('en-US')).toBe('Example EN');
    expect(provider.getLanguageName('nl-NL')).toBe('Voorbeeld NL');
    expect(provider.getLanguageName('fr-FR')).toBe('Exemple FR');
    expect(provider.getLanguageName('de-DE')).toBe('Beispiel DE');

    // Test unknown language (fallback)
    expect(provider.getLanguageName('ja-JP')).toBe('Example ja-JP');
    expect(provider.getLanguageName('unknown')).toBe('Example unknown');

    // Verify in generated template
    const content = provider.generateLabelsFileContent(true, ['en-US', 'nl-NL']);
    const parsed = JSON.parse(content);
    const labelGroup = parsed[0];

    const enLabel = labelGroup.labels.find((l: any) => l.languageCode === 'en-US');
    const nlLabel = labelGroup.labels.find((l: any) => l.languageCode === 'nl-NL');

    expect(enLabel.label).toBe('Example EN');
    expect(nlLabel.label).toBe('Voorbeeld NL');
  });
});
