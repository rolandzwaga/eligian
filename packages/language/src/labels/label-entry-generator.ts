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
 * Key path segments that must never be used to walk or write into a plain object.
 * Writing through them would reach `Object.prototype` (prototype pollution).
 */
const UNSAFE_SEGMENTS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Whether a language code can be used as a key of the locale configuration object.
 * `__proto__`, `constructor` and `prototype` are rejected: indexing a parsed JSON object with
 * them reaches `Object.prototype` (prototype pollution) or replaces the object's prototype.
 */
function isSafeLanguageCode(code: string): boolean {
  return code !== '' && !UNSAFE_SEGMENTS.has(code);
}

/** Own-property check (`Object.hasOwn` needs a newer lib target than this package uses). */
function hasOwn(target: object, key: string): boolean {
  return Object.keys(target).includes(key);
}

/**
 * Whether a dot-notation translation key can safely be written into a locale object.
 *
 * Rejects empty keys, empty segments (`a..b`, `.a`, `a.`) and the segments `__proto__`,
 * `constructor` and `prototype`.
 *
 * @param translationKey - Dot-notation translation key (e.g., "nav.home")
 */
export function isSafeTranslationKey(translationKey: string): boolean {
  if (translationKey === '') return false;
  return translationKey
    .split('.')
    .every(segment => segment !== '' && !UNSAFE_SEGMENTS.has(segment));
}

/**
 * Set a nested value in a locale data object using dot-notation key path.
 *
 * Existing translations are never overwritten: if the key (or one of its parent segments)
 * already holds a string/array/other leaf, the data is left untouched. Only own properties are
 * considered, so inherited names such as `toString` behave like any other key.
 *
 * @param data - The locale data object to modify (mutated)
 * @param keyPath - Dot-notation key path (e.g., "nav.home")
 * @param value - Value to set at the path
 * @returns true if the value was written, false if the key is unsafe or collides with an existing entry
 *
 * @example
 * ```typescript
 * const data = {};
 * setNestedValue(data, 'nav.home', '');
 * // data = { nav: { home: '' } }
 * ```
 */
function setNestedValue(data: TLocaleData, keyPath: string, value: string): boolean {
  if (!isSafeTranslationKey(keyPath)) return false;

  const segments = keyPath.split('.');
  let current: TLocaleData = data;

  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    const next: unknown = hasOwn(current, segment) ? current[segment] : undefined;

    if (next === undefined || next === null) {
      current[segment] = {};
    } else if (typeof next !== 'object' || Array.isArray(next)) {
      // Parent segment is already a translation leaf: cannot nest below it
      return false;
    }
    current = current[segment] as TLocaleData;
  }

  // Set the final value, but never clobber an existing entry
  const lastSegment = segments[segments.length - 1];
  if (hasOwn(current, lastSegment) && current[lastSegment] !== null) return false;
  current[lastSegment] = value;
  return true;
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
    if (!isSafeLanguageCode(localeCode)) continue;
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
  /**
   * True when the translation key is not a safe key path (empty segment, `__proto__`,
   * `constructor` or `prototype`). Nothing is written in that case.
   */
  readonly invalidKey: boolean;
  /**
   * Language codes that were ignored because they cannot be used as an object key
   * (`__proto__`, `constructor`, `prototype` or empty).
   */
  readonly invalidLanguageCodes: string[];
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
 * Language codes that are not safe object keys (`__proto__`, `constructor`, `prototype`) are
 * ignored and reported in `invalidLanguageCodes`.
 *
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
  const invalidLanguageCodes: string[] = [];

  if (!isSafeTranslationKey(translationKey)) {
    return { config: result, skipped, invalidKey: true, invalidLanguageCodes };
  }

  for (const localeCode of languageCodes) {
    if (!isSafeLanguageCode(localeCode)) {
      invalidLanguageCodes.push(localeCode);
      continue;
    }
    const code = localeCode as TLanguageCode;
    // Own properties only: an inherited member is never a locale entry
    let localeData = hasOwn(result, code) ? result[code] : undefined;

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

  return { config: result, skipped, invalidKey: false, invalidLanguageCodes };
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
