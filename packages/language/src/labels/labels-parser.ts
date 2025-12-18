import type { ParsedLabelsFile } from './types.js';
import { isValidLanguageCode } from './types.js';

/**
 * Parses Eligian locales JSON files and extracts language codes.
 *
 * Feature 045: Updated to support ILocalesConfiguration format.
 *
 * Locales files follow this structure (Eligius 2.2.0+):
 * ```json
 * {
 *   "en-US": { "nav": { "home": "Home" }, "button": { "submit": "Submit" } },
 *   "nl-NL": { "nav": { "home": "Thuis" }, "button": { "submit": "Verzenden" } }
 * }
 * ```
 *
 * Or with external references:
 * ```json
 * {
 *   "en-US": { "$ref": "./locales/en-US.json" },
 *   "nl-NL": { "$ref": "./locales/nl-NL.json" }
 * }
 * ```
 */
export class LabelsParser {
  /**
   * Extracts unique language codes from a locales JSON file.
   *
   * @param filePath - URI or path to the locales file (for error reporting)
   * @param content - JSON content of the locales file
   * @returns ParsedLabelsFile with extracted language codes (sorted alphabetically)
   *
   * @remarks
   * - Language codes are the top-level keys of the locales object
   * - Invalid language codes (not matching xx-XX pattern) are filtered out
   * - Returns empty array if JSON is malformed or empty
   * - Sorts language codes alphabetically for consistent output
   */
  extractLanguageCodes(filePath: string, content: string): ParsedLabelsFile {
    try {
      const parsed = JSON.parse(content);

      // Handle non-object JSON (ILocalesConfiguration is an object)
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return {
          filePath,
          languageCodes: [],
          success: false,
          error: 'JSON root must be an object with locale codes as keys',
        };
      }

      // Extract language codes from object keys (the new format)
      const languageCodes = Object.keys(parsed)
        .filter(key => isValidLanguageCode(key))
        .sort();

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
