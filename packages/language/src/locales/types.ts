/**
 * Type definitions for the locale-based label management system.
 * Uses Eligius 2.2.0's ILocalesConfiguration format.
 *
 * @module locales/types
 */

// Re-export types from Eligius 2.2.0 for convenience
export type {
  ILocaleReference,
  ILocalesConfiguration,
  TLanguageCode,
  TLocaleData,
  TLocaleEntry,
} from 'eligius';

// Re-export type guard from Eligius
export { isLocaleReference } from 'eligius';

/**
 * Metadata for a single translation key extracted from locale data.
 * Used for hover documentation and validation.
 */
export interface TranslationKeyMetadata {
  /** Full dot-notation key (e.g., "nav.home", "button.submit") */
  key: string;

  /** Map of locale code to translation value */
  translations: Map<string, string>;

  /** Whether all locales have this key defined */
  isComplete: boolean;

  /** List of locales missing this key (for warnings) */
  missingLocales: string[];
}

/**
 * Source location within a file.
 */
export interface LocaleSourceLocation {
  line: number;
  column: number;
}

/**
 * Error encountered during locale file parsing or validation.
 */
export interface LocaleParseError {
  /** Error code for programmatic handling */
  code:
    | 'invalid_json'
    | 'invalid_schema'
    | 'missing_locale'
    | 'circular_ref'
    | 'file_not_found'
    | 'invalid_locale_code';

  /** Human-readable error message */
  message: string;

  /** Actionable hint for fixing the error */
  hint: string;

  /** Source location if applicable */
  location?: LocaleSourceLocation;

  /** Additional details (e.g., circular ref path) */
  details?: string;
}

/**
 * Parsed metadata for a locale file.
 * Stored in LocaleRegistry for document queries.
 */
export interface LocaleFileMetadata {
  /** Absolute URI of the locale file */
  fileUri: string;

  /** All locale codes defined in this file */
  locales: string[];

  /** All translation keys with their metadata */
  keys: TranslationKeyMetadata[];

  /** External file references (for $ref detection) */
  externalRefs: Map<string, string>;

  /** Whether file has any parse/validation errors */
  hasErrors: boolean;

  /** Parse/validation errors if any */
  errors: LocaleParseError[];
}

/**
 * Result of parsing a locale file.
 */
export interface LocaleParseResult {
  /** Parsed metadata if successful */
  metadata?: LocaleFileMetadata;

  /** Errors if parsing failed */
  errors: LocaleParseError[];

  /** Whether parsing succeeded */
  success: boolean;
}

/**
 * Options for parsing locale files.
 */
export interface LocaleParseOptions {
  /** Base URI for resolving $ref paths */
  baseUri?: string;

  /** Set of visited URIs for circular reference detection */
  visitedUris?: Set<string>;

  /** Whether to resolve $ref references (default: true) */
  resolveRefs?: boolean;
}

/**
 * Check if a locale entry is inline data (not a $ref).
 */
export function isLocaleData(
  entry: import('eligius').TLocaleEntry
): entry is import('eligius').TLocaleData {
  return typeof entry === 'object' && entry !== null && !('$ref' in entry);
}

/**
 * Validate that a string is a valid locale code (xx-XX pattern).
 */
export function isValidLocaleCode(code: string): boolean {
  return /^[a-z]{2,3}-[A-Z]{2,3}$/.test(code);
}
