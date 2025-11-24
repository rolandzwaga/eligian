import type { LanguageBlockGenerationResult, LanguageCodeInfo } from './types.js';
import {
  DEFAULT_LABEL_TEXT,
  DEFAULT_LANGUAGE_CODE,
  DEFAULT_LANGUAGE_MARKER,
  LANGUAGE_BLOCK_TRAILING_NEWLINES,
  LANGUAGE_ENTRY_INDENT,
} from './types.js';

/**
 * Generates formatted language block text for insertion into Eligian programs.
 *
 * Output format:
 * ```eligian
 * languages {
 *   * "en-US" "en-US label"
 *   "nl-NL" "nl-NL label"
 *   "fr-FR" "fr-FR label"
 * }
 *
 * ```
 */
export class LanguageBlockGenerator {
  /**
   * Generates a language block from language code information.
   *
   * @param languageCodes - Array of language codes with default marker info
   * @returns LanguageBlockGenerationResult with formatted text and metadata
   *
   * @remarks
   * - If languageCodes is empty, generates a template with DEFAULT_LANGUAGE_CODE
   * - First language code (alphabetically) is marked as default with * prefix
   * - Each language entry is indented with 2 spaces
   * - Closing brace is followed by 2 newlines for proper spacing
   */
  generate(languageCodes: LanguageCodeInfo[]): LanguageBlockGenerationResult {
    // Generate template if no language codes provided
    if (languageCodes.length === 0) {
      return {
        text: this.generateTemplate(),
        languageCount: 1,
        isTemplate: true,
      };
    }

    // Sort language codes alphabetically
    const sortedCodes = [...languageCodes].sort((a, b) => a.code.localeCompare(b.code));

    // Determine which language is default
    const defaultLanguageCode =
      sortedCodes.find(info => info.isDefault)?.code || sortedCodes[0].code;

    // Generate language block lines
    const lines: string[] = ['languages {'];

    for (const info of sortedCodes) {
      const isDefault = info.code === defaultLanguageCode;
      const marker = isDefault ? `${DEFAULT_LANGUAGE_MARKER} ` : '';
      const labelText = DEFAULT_LABEL_TEXT(info.code);

      lines.push(`${LANGUAGE_ENTRY_INDENT}${marker}"${info.code}" "${labelText}"`);
    }

    lines.push('}');

    return {
      text: lines.join('\n') + LANGUAGE_BLOCK_TRAILING_NEWLINES,
      languageCount: sortedCodes.length,
      isTemplate: false,
    };
  }

  /**
   * Generates a template language block with a single default language.
   *
   * @returns Formatted template language block
   */
  private generateTemplate(): string {
    const labelText = DEFAULT_LABEL_TEXT(DEFAULT_LANGUAGE_CODE);
    return (
      'languages {\n' +
      `${LANGUAGE_ENTRY_INDENT}${DEFAULT_LANGUAGE_MARKER} "${DEFAULT_LANGUAGE_CODE}" "${labelText}"\n` +
      '}' +
      LANGUAGE_BLOCK_TRAILING_NEWLINES
    );
  }
}
