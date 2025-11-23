/**
 * Metadata for a single label group from labels JSON
 *
 * Extracted from the labels JSON structure and stored in the registry
 * for efficient validation and hover information.
 */
export interface LabelGroupMetadata {
  /**
   * Label group ID (unique identifier for the label)
   * Example: "welcome-title"
   */
  id: string;

  /**
   * Number of translations for this label group
   * Derived from the length of the labels array
   */
  translationCount: number;

  /**
   * Language codes for all translations
   * Extracted from each translation's languageCode field
   * Example: ["en-US", "nl-NL"]
   */
  languageCodes: string[];
}
