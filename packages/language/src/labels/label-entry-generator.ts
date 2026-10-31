/**
 * Label Entry Generator (Feature 041 - User Story 1)
 *
 * Generates new translation key entries for ILocalesConfiguration structure.
 * Used by the "Create label entry" quick fix.
 *
 * Updated for Eligius 2.2+ ILocalesConfiguration format (nested object keyed by locale).
 *
 * @module labels/label-entry-generator
 */

import type { ILocalesConfiguration, TLanguageCode, TLocaleData } from 'eligius';

/**
 * Set a nested value in a locale data object using dot-notation key path.
 *
 * @param data - The locale data object to modify (mutated)
 * @param keyPath - Dot-notation key path (e.g., "nav.home")
 * @param value - Value to set at the path
 *
 * @example
 * ```typescript
 * const data = {};
 * setNestedValue(data, 'nav.home', '');
 * // data = { nav: { home: '' } }
 * ```
 */
function setNestedValue(data: TLocaleData, keyPath: string, value: string): void {
  const segments = keyPath.split('.');
  let current: TLocaleData = data;

  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    if (!(segment in current) || typeof current[segment] !== 'object') {
      current[segment] = {};
    }
    current = current[segment] as TLocaleData;
  }

  // Set the final value
  const lastSegment = segments[segments.length - 1];
  current[lastSegment] = value;
}

/**
 * Generate a partial ILocalesConfiguration with a new translation key.
 *
 * Creates a locale configuration structure matching the Eligius 2.2+ schema:
 * ```json
 * {
 *   "en-US": { "nav": { "home": "" } },
 *   "nl-NL": { "nav": { "home": "" } }
 * }
 * ```
 *
 * @param translationKey - Dot-notation translation key (e.g., "nav.home")
 * @param languageCodes - Array of language codes to create translations for
 * @returns Partial ILocalesConfiguration with the new key added to each locale
 *
 * @example
 * ```typescript
 * const entry = generateLocaleEntry('nav.home', ['en-US', 'nl-NL']);
 * // Result:
 * // {
 * //   "en-US": { "nav": { "home": "" } },
 * //   "nl-NL": { "nav": { "home": "" } }
 * // }
 * ```
 */
export function generateLocaleEntry(
  translationKey: string,
  languageCodes: string[]
): ILocalesConfiguration {
  const result: ILocalesConfiguration = {};

  for (const localeCode of languageCodes) {
    const localeData: TLocaleData = {};
    setNestedValue(localeData, translationKey, '');
    result[localeCode as TLanguageCode] = localeData;
  }

  return result;
}

/**
 * Result of {@link mergeLocaleEntryWithSkipped}.
 */
export interface MergeLocaleEntryResult {
  /** New configuration with the key merged in (the input is never mutated) */
  readonly config: ILocalesConfiguration;
  /**
   * Locale codes that were left untouched because their entry is a `{ "$ref": "..." }`
   * pointer. The key must be added to the referenced file instead.
   */
  readonly skipped: string[];
}

/**
 * Whether a locale entry is a `{ "$ref": "..." }` pointer to an external file.
 */
function isLocaleRef(localeData: unknown): boolean {
  return typeof localeData === 'object' && localeData !== null && '$ref' in localeData;
}

/**
 * Merge a new translation key into an existing ILocalesConfiguration.
 *
 * Deeply merges the new key into each locale, preserving existing translations.
 * If a locale doesn't exist, it creates it with the new key. Locales whose entry is a
 * `$ref` pointer are left exactly as they are (the reference is never overwritten) and
 * reported in `skipped`.
 *
 * @param existing - Existing locale configuration (not mutated)
 * @param translationKey - Dot-notation translation key to add
 * @param languageCodes - Language codes to add the key to
 * @returns The merged configuration plus the locale codes skipped because they are `$ref`s
 */
export function mergeLocaleEntryWithSkipped(
  existing: ILocalesConfiguration,
  translationKey: string,
  languageCodes: string[]
): MergeLocaleEntryResult {
  // Deep clone the existing configuration
  const result: ILocalesConfiguration = JSON.parse(JSON.stringify(existing));
  const skipped: string[] = [];

  for (const localeCode of languageCodes) {
    const code = localeCode as TLanguageCode;
    let localeData = result[code];

    if (isLocaleRef(localeData)) {
      // Can't merge into a reference; keep the pointer intact.
      skipped.push(localeCode);
      continue;
    }

    if (!localeData || typeof localeData !== 'object') {
      localeData = {};
      result[code] = localeData;
    }

    // Add the new key
    setNestedValue(localeData as TLocaleData, translationKey, '');
  }

  return { config: result, skipped };
}

/**
 * Merge a new translation key into an existing ILocalesConfiguration.
 *
 * Same as {@link mergeLocaleEntryWithSkipped} but returns only the configuration.
 * `$ref` locale entries are preserved unchanged; use {@link mergeLocaleEntryWithSkipped}
 * to learn which locales were skipped.
 *
 * @param existing - Existing locale configuration (not mutated)
 * @param translationKey - Dot-notation translation key to add
 * @param languageCodes - Language codes to add the key to
 * @returns New ILocalesConfiguration with the key merged in
 *
 * @example
 * ```typescript
 * const existing = {
 *   "en-US": { "nav": { "home": "Home" } }
 * };
 * const result = mergeLocaleEntry(existing, 'nav.about', ['en-US', 'nl-NL']);
 * // Result:
 * // {
 * //   "en-US": { "nav": { "home": "Home", "about": "" } },
 * //   "nl-NL": { "nav": { "about": "" } }
 * // }
 * ```
 */
export function mergeLocaleEntry(
  existing: ILocalesConfiguration,
  translationKey: string,
  languageCodes: string[]
): ILocalesConfiguration {
  return mergeLocaleEntryWithSkipped(existing, translationKey, languageCodes).config;
}
