/**
 * Types for language block quick fix functionality
 */

/**
 * Information about a language code extracted from labels file
 */
export interface LanguageCodeInfo {
  /**
   * The language code (e.g., "en-US", "nl-NL", "fr-FR")
   * Follows ISO 639-1 (language) + ISO 3166-1 (country) format
   */
  code: string;

  /**
   * Whether this language code should be marked as default (* prefix)
   * Typically the first language code alphabetically
   */
  isDefault: boolean;

  /**
   * Optional: Source label group ID where this code was first found
   * Useful for debugging and error messages
   */
  sourceGroupId?: string;
}

/**
 * Context for generating language block quick fix
 */
export interface LanguageBlockQuickFixContext {
  /**
   * URI of the document being edited
   */
  documentUri: string;

  /**
   * Paths to labels files imported in the document
   * Can be relative or absolute paths
   */
  labelsFilePaths: string[];

  /**
   * Position where language block should be inserted
   */
  insertionPosition: InsertionPosition;

  /**
   * Extracted language codes (empty if parsing failed)
   * If empty, template will be generated
   */
  languageCodes: LanguageCodeInfo[];

  /**
   * Whether any labels files failed to parse
   * Used to generate appropriate code action title
   */
  hasParseErrors: boolean;
}

/**
 * Position in document for inserting language block
 */
export interface InsertionPosition {
  /**
   * Zero-based line number
   */
  line: number;

  /**
   * Zero-based character offset within the line
   * Typically 0 (start of line) for language block insertion
   */
  character: number;
}

/**
 * Result of language block generation
 */
export interface LanguageBlockGenerationResult {
  /**
   * The generated language block text
   * Includes opening/closing braces, newlines, and whitespace
   */
  text: string;

  /**
   * Number of language entries in the block
   */
  languageCount: number;

  /**
   * Whether this is a template (generated without parsing labels file)
   */
  isTemplate: boolean;
}

/**
 * Parsed labels file with extracted language codes
 * Internal type used by LabelsParser
 */
export interface ParsedLabelsFile {
  /**
   * Path to the labels file
   */
  filePath: string;

  /**
   * Extracted language codes (deduplicated)
   */
  languageCodes: string[];

  /**
   * Whether parsing succeeded
   */
  success: boolean;

  /**
   * Error message if parsing failed
   */
  error?: string;
}

/**
 * Default language code used in templates
 */
export const DEFAULT_LANGUAGE_CODE = 'en-US';

/**
 * Default label text for template generation
 * Uses language code as placeholder
 */
export const DEFAULT_LABEL_TEXT = (code: string) => `${code} label`;

/**
 * Indentation for language block entries
 */
export const LANGUAGE_ENTRY_INDENT = '  '; // 2 spaces

/**
 * Default marker for default language
 */
export const DEFAULT_LANGUAGE_MARKER = '*';

/**
 * Newlines after language block for separation
 */
export const LANGUAGE_BLOCK_TRAILING_NEWLINES = '\n\n';

/**
 * Type guard for validating language code format
 * @param code - Potential language code string
 * @returns True if code matches expected format (non-empty string)
 */
export function isValidLanguageCode(code: unknown): code is string {
  return typeof code === 'string' && code.trim().length > 0;
}
