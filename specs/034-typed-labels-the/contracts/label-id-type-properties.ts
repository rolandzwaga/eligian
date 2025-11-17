/**
 * Properties for LabelID Typir CustomKind
 * 
 * Represents a validated reference to a label group from imported labels JSON.
 * Used by Typir type system for type inference and validation.
 */
export interface LabelIDTypeProperties {
  /**
   * Label group ID from labels JSON
   * Example: "welcome-title", "button-text"
   */
  labelGroupId: string;

  /**
   * Number of translations for this label group
   * Example: 2 (for en-US and nl-NL)
   */
  translationCount: number;

  /**
   * Language codes for all translations
   * Example: ["en-US", "nl-NL"]
   */
  languageCodes: string[];

  /**
   * Index signature required by Typir CustomTypeProperties constraint
   * Must be: string | number | boolean | bigint | symbol | Type | arrays/maps/sets
   */
  [key: string]: string | number | string[];
}
