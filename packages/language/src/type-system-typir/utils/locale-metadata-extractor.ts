/**
 * Locale Metadata Extractor
 *
 * Extracts locale metadata from ILocalesConfiguration for registry population.
 * Feature 045: Replaces label-metadata-extractor.ts for Eligius 2.2.0+ format.
 *
 * @module type-system-typir/utils/locale-metadata-extractor
 */

import type { ILocalesConfiguration, TLanguageCode, TLocaleData, TLocaleEntry } from 'eligius';
import { isLocaleReference } from 'eligius';

/**
 * Metadata about a single locale in the configuration
 */
interface LocaleMetadata {
  /** Locale code (e.g., 'en-US', 'nl-NL') */
  code: string;
  /** Whether this is an external file reference */
  isExternalReference: boolean;
  /** External file path if reference, undefined otherwise */
  externalPath?: string;
  /** Number of top-level translation keys (for inline locales) */
  topLevelKeyCount: number;
}

/**
 * Metadata about the entire locales configuration
 */
interface LocalesMetadata {
  /** Array of locale metadata */
  locales: LocaleMetadata[];
  /** Total number of locales */
  localeCount: number;
  /** All locale codes */
  localeCodes: string[];
}

/**
 * Count top-level keys in locale data recursively
 *
 * For nested structures, only counts the top-level keys.
 */
function countTopLevelKeys(data: TLocaleData): number {
  return Object.keys(data).length;
}

/**
 * Extract metadata from a single locale entry
 *
 * @param code - Locale code (e.g., 'en-US')
 * @param entry - Locale entry (inline data or reference)
 * @returns Locale metadata
 */
function extractLocaleEntryMetadata(code: string, entry: TLocaleEntry): LocaleMetadata {
  if (isLocaleReference(entry)) {
    return {
      code,
      isExternalReference: true,
      externalPath: entry.$ref,
      topLevelKeyCount: 0,
    };
  }

  return {
    code,
    isExternalReference: false,
    topLevelKeyCount: countTopLevelKeys(entry as TLocaleData),
  };
}

/**
 * Extract locale metadata from ILocalesConfiguration
 *
 * Converts ILocalesConfiguration (from Eligius 2.2.0+) to LocalesMetadata
 * for the registry.
 *
 * @param locales - Locales configuration object
 * @returns Locales metadata
 *
 * @example
 * ```typescript
 * const locales: ILocalesConfiguration = {
 *   'en-US': { nav: { home: 'Home' }, button: { submit: 'Submit' } },
 *   'nl-NL': { '$ref': './locales/nl-NL.json' }
 * };
 * const metadata = extractLocaleMetadata(locales);
 * // Returns: {
 * //   locales: [
 * //     { code: 'en-US', isExternalReference: false, topLevelKeyCount: 2 },
 * //     { code: 'nl-NL', isExternalReference: true, externalPath: './locales/nl-NL.json', topLevelKeyCount: 0 }
 * //   ],
 * //   localeCount: 2,
 * //   localeCodes: ['en-US', 'nl-NL']
 * // }
 * ```
 */
export function extractLocaleMetadata(locales: ILocalesConfiguration): LocalesMetadata {
  const localeCodes = Object.keys(locales) as TLanguageCode[];
  const localeMetadata = localeCodes.map(code => extractLocaleEntryMetadata(code, locales[code]));

  return {
    locales: localeMetadata,
    localeCount: localeCodes.length,
    localeCodes,
  };
}
