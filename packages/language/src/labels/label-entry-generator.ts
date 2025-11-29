/**
 * Label Entry Generator (Feature 041 - User Story 1)
 *
 * Generates new label entries with empty translations for specified languages.
 * Used by the "Create label entry" quick fix.
 *
 * @module labels/label-entry-generator
 */

/**
 * A single translation entry within a label
 */
export interface TranslationEntry {
  /** Unique UUID for this translation */
  id: string;
  /** Language code (e.g., "en-US", "nl-NL") */
  languageCode: string;
  /** Translation text (empty by default, filled in by developer) */
  label: string;
}

/**
 * A label entry in the labels file
 */
export interface LabelEntry {
  /** Label identifier (e.g., "welcomeMessage") */
  id: string;
  /** Array of translations, one per language */
  labels: TranslationEntry[];
}

/**
 * Generate a new label entry with empty translations for all specified languages
 *
 * Creates a label entry structure matching the Eligius labels schema:
 * ```json
 * {
 *   "id": "<label-id>",
 *   "labels": [
 *     { "id": "<uuid>", "languageCode": "<code>", "label": "" }
 *   ]
 * }
 * ```
 *
 * @param labelId - The label identifier to create
 * @param languageCodes - Array of language codes to create translations for
 * @returns A new label entry with empty translations
 *
 * @example
 * ```typescript
 * const entry = generateLabelEntry('welcomeMessage', ['en-US', 'nl-NL']);
 * // Result:
 * // {
 * //   id: 'welcomeMessage',
 * //   labels: [
 * //     { id: '<uuid>', languageCode: 'en-US', label: '' },
 * //     { id: '<uuid>', languageCode: 'nl-NL', label: '' }
 * //   ]
 * // }
 * ```
 */
export function generateLabelEntry(labelId: string, languageCodes: string[]): LabelEntry {
  return {
    id: labelId,
    labels: languageCodes.map(languageCode => ({
      id: crypto.randomUUID(),
      languageCode,
      label: '',
    })),
  };
}
