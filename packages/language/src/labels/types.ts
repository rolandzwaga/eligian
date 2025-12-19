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
 * Pattern for validating locale codes (e.g., 'en-US', 'nl-NL', 'fr-FR')
 * Matches: 2-3 lowercase letters, hyphen, 2-3 uppercase letters
 */
const LOCALE_CODE_PATTERN = /^[a-z]{2,3}-[A-Z]{2,3}$/;

/**
 * Type guard for validating language code format
 * @param code - Potential language code string
 * @returns True if code matches locale pattern (e.g., 'en-US', 'nl-NL')
 */
export function isValidLanguageCode(code: unknown): code is string {
  return typeof code === 'string' && LOCALE_CODE_PATTERN.test(code);
}

// =============================================================================
// Feature 041: Missing Label Entry Quick Fix
// =============================================================================

/**
 * Interface for Program AST node with optional languages block
 * Used by extractLanguageCodes to avoid circular import from generated/ast.ts
 */
interface ProgramWithLanguages {
  languages?: {
    entries: Array<{
      code: string;
      isDefault: boolean;
      label: string;
    }>;
  };
}

/**
 * Extract language codes from a Program's languages block
 *
 * If no languages block is defined, returns ['en-US'] as the default fallback.
 * Preserves the order of languages as defined in the languages block.
 *
 * @param program - Program AST node with optional languages block
 * @returns Array of language codes (e.g., ['en-US', 'nl-NL'])
 *
 * @example
 * ```typescript
 * // With languages block: languages { *"en-US" "English" "nl-NL" "Dutch" }
 * const codes = extractLanguageCodes(program);
 * // Returns: ['en-US', 'nl-NL']
 *
 * // Without languages block
 * const codes = extractLanguageCodes(program);
 * // Returns: ['en-US']
 * ```
 */
export function extractLanguageCodes(program: ProgramWithLanguages): string[] {
  if (!program.languages?.entries || program.languages.entries.length === 0) {
    return [DEFAULT_LANGUAGE_CODE]; // Default fallback per spec
  }

  return program.languages.entries.map(entry => entry.code);
}
