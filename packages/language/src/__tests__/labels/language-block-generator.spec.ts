import { describe, expect, test } from 'vitest';
import { LanguageBlockGenerator } from '../../labels/language-block-generator.js';
import type { LanguageBlockGenerationResult, LanguageCodeInfo } from '../../labels/types.js';

describe('LanguageBlockGenerator', () => {
  describe('generate', () => {
    test('should generate language block with multiple languages (first is default)', () => {
      const languageCodes: LanguageCodeInfo[] = [
        { code: 'de-DE', isDefault: false },
        { code: 'en-US', isDefault: false },
        { code: 'fr-FR', isDefault: false },
        { code: 'nl-NL', isDefault: false },
      ];

      const generator = new LanguageBlockGenerator();
      const result: LanguageBlockGenerationResult = generator.generate(languageCodes);

      expect(result.languageCount).toBe(4);
      expect(result.isTemplate).toBe(false);
      expect(result.text).toBe(
        'languages {\n' +
          '  * "de-DE" "de-DE label"\n' +
          '  "en-US" "en-US label"\n' +
          '  "fr-FR" "fr-FR label"\n' +
          '  "nl-NL" "nl-NL label"\n' +
          '}\n\n'
      );
    });

    test('should respect explicit default language marker', () => {
      const languageCodes: LanguageCodeInfo[] = [
        { code: 'de-DE', isDefault: false },
        { code: 'en-US', isDefault: true }, // Explicitly marked as default
        { code: 'fr-FR', isDefault: false },
      ];

      const generator = new LanguageBlockGenerator();
      const result = generator.generate(languageCodes);

      expect(result.languageCount).toBe(3);
      expect(result.isTemplate).toBe(false);
      expect(result.text).toContain('  "de-DE" "de-DE label"\n');
      expect(result.text).toContain('  * "en-US" "en-US label"\n'); // en-US is default
      expect(result.text).toContain('  "fr-FR" "fr-FR label"\n');
    });

    test('should generate template language block when no language codes provided', () => {
      const languageCodes: LanguageCodeInfo[] = [];

      const generator = new LanguageBlockGenerator();
      const result = generator.generate(languageCodes);

      expect(result.languageCount).toBe(1);
      expect(result.isTemplate).toBe(true);
      expect(result.text).toBe('languages {\n' + '  * "en-US" "en-US label"\n' + '}\n\n');
    });

    test('should generate single-language block correctly', () => {
      const languageCodes: LanguageCodeInfo[] = [{ code: 'ja-JP', isDefault: false }];

      const generator = new LanguageBlockGenerator();
      const result = generator.generate(languageCodes);

      expect(result.languageCount).toBe(1);
      expect(result.isTemplate).toBe(false);
      expect(result.text).toBe('languages {\n' + '  * "ja-JP" "ja-JP label"\n' + '}\n\n');
    });

    test('should maintain alphabetical order in generated block', () => {
      const languageCodes: LanguageCodeInfo[] = [
        { code: 'zh-CN', isDefault: false },
        { code: 'ar-SA', isDefault: false },
        { code: 'en-US', isDefault: false },
        { code: 'es-ES', isDefault: false },
      ];

      const generator = new LanguageBlockGenerator();
      const result = generator.generate(languageCodes);

      const lines = result.text.split('\n').filter(line => line.trim().length > 0);
      expect(lines[0]).toBe('languages {');
      expect(lines[1]).toContain('* "ar-SA"'); // First alphabetically gets *
      expect(lines[2]).toContain('"en-US"');
      expect(lines[3]).toContain('"es-ES"');
      expect(lines[4]).toContain('"zh-CN"');
      expect(lines[5]).toBe('}');
    });

    test('should use correct indentation (2 spaces)', () => {
      const languageCodes: LanguageCodeInfo[] = [
        { code: 'en-US', isDefault: false },
        { code: 'fr-FR', isDefault: false },
      ];

      const generator = new LanguageBlockGenerator();
      const result = generator.generate(languageCodes);

      const lines = result.text.split('\n');
      // Check that language lines start with exactly 2 spaces
      expect(lines[1]).toMatch(/^ {2}\*/); // Default line: "  * "en-US""
      expect(lines[2]).toMatch(/^ {2}"/); // Non-default line: "  "fr-FR""
    });

    test('should add two trailing newlines after closing brace', () => {
      const languageCodes: LanguageCodeInfo[] = [{ code: 'en-US', isDefault: false }];

      const generator = new LanguageBlockGenerator();
      const result = generator.generate(languageCodes);

      expect(result.text.endsWith('}\n\n')).toBe(true);
    });
  });
});
