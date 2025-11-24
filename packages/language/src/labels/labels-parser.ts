import type { ParsedLabelsFile } from './types.js';
import { isValidLanguageCode } from './types.js';

/**
 * Parses Eligian labels JSON files and extracts language codes.
 *
 * Labels files follow this structure:
 * ```json
 * [
 *   {
 *     "id": "welcome-title",
 *     "labels": [
 *       {"id": "welcome-title-en", "languageCode": "en-US", "label": "Welcome"},
 *       {"id": "welcome-title-nl", "languageCode": "nl-NL", "label": "Welkom"}
 *     ]
 *   }
 * ]
 * ```
 */
export class LabelsParser {
  /**
   * Extracts unique language codes from a labels JSON file.
   *
   * @param filePath - URI or path to the labels file (for error reporting)
   * @param content - JSON content of the labels file
   * @returns ParsedLabelsFile with extracted language codes (sorted alphabetically and deduplicated)
   *
   * @remarks
   * - Language codes are automatically deduplicated across all label groups
   * - Invalid or empty language codes are filtered out
   * - Returns empty array if JSON is malformed or empty
   * - Sorts language codes alphabetically for consistent output
   */
  extractLanguageCodes(filePath: string, content: string): ParsedLabelsFile {
    try {
      const parsed = JSON.parse(content);

      // Handle non-array JSON
      if (!Array.isArray(parsed)) {
        return {
          filePath,
          languageCodes: [],
          success: false,
          error: 'JSON root must be an array',
        };
      }

      // Extract language codes from all label groups
      const languageCodeSet = new Set<string>();

      for (const group of parsed) {
        // Skip groups without labels array
        if (!group.labels || !Array.isArray(group.labels)) {
          continue;
        }

        // Extract language codes from labels
        for (const label of group.labels) {
          const code = label.languageCode;
          if (isValidLanguageCode(code)) {
            languageCodeSet.add(code.trim());
          }
        }
      }

      // Sort alphabetically for consistent output
      const languageCodes = Array.from(languageCodeSet).sort();

      return {
        filePath,
        languageCodes,
        success: true,
      };
    } catch (error) {
      // Handle JSON parse errors
      const errorMessage = error instanceof Error ? error.message : 'Unknown JSON parsing error';

      return {
        filePath,
        languageCodes: [],
        success: false,
        error: `JSON parsing failed: ${errorMessage}`,
      };
    }
  }
}
