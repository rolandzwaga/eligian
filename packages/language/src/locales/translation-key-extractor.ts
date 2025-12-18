/**
 * Translation Key Extractor
 *
 * Extracts translation keys from ILocalesConfiguration in dot-notation format.
 * Walks the nested locale structure to find all keys and their translations.
 *
 * Feature 045: User Story 1 - Import and Use Locale Data
 *
 * @module locales/translation-key-extractor
 */

import type { ILocalesConfiguration, TLocaleData } from 'eligius';
import { isLocaleReference } from 'eligius';
import type { LabelGroupMetadata } from '../type-system-typir/utils/label-registry.js';

/**
 * Extract all translation keys from a locale configuration.
 *
 * Walks the nested locale structure and extracts keys in dot-notation format.
 * Returns metadata compatible with LabelRegistryService.
 *
 * @param locales - ILocalesConfiguration to extract keys from
 * @returns Array of LabelGroupMetadata for registry population
 *
 * @example
 * ```typescript
 * const locales = {
 *   "en-US": { nav: { home: "Home", about: "About" } },
 *   "nl-NL": { nav: { home: "Thuis", about: "Over" } }
 * };
 *
 * const keys = extractTranslationKeys(locales);
 * // Returns:
 * // [
 * //   { id: 'nav.home', translationCount: 2, languageCodes: ['en-US', 'nl-NL'] },
 * //   { id: 'nav.about', translationCount: 2, languageCodes: ['en-US', 'nl-NL'] }
 * // ]
 * ```
 */
export function extractTranslationKeys(locales: ILocalesConfiguration): LabelGroupMetadata[] {
  // Collect all keys from all locales
  const keyMap = new Map<string, Set<string>>();

  for (const [localeCode, localeEntry] of Object.entries(locales)) {
    // Skip $ref entries for now (Phase 9 - US7)
    if (isLocaleReference(localeEntry)) {
      continue;
    }

    // Walk the nested structure and collect keys
    const keys = extractKeysFromLocaleData(localeEntry as TLocaleData, '');

    for (const key of keys) {
      if (!keyMap.has(key)) {
        keyMap.set(key, new Set());
      }
      keyMap.get(key)!.add(localeCode);
    }
  }

  // Convert to LabelGroupMetadata array
  const result: LabelGroupMetadata[] = [];

  for (const [key, localeCodes] of keyMap) {
    result.push({
      id: key,
      translationCount: localeCodes.size,
      languageCodes: Array.from(localeCodes).sort(),
    });
  }

  // Sort by key for consistent ordering
  return result.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Recursively extract keys from nested locale data.
 *
 * @param data - Nested locale data
 * @param prefix - Current key prefix (dot-notation path)
 * @returns Array of full dot-notation keys
 */
function extractKeysFromLocaleData(data: TLocaleData, prefix: string): string[] {
  const keys: string[] = [];

  for (const [key, value] of Object.entries(data)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (typeof value === 'string') {
      // Leaf node - this is a translation
      keys.push(fullKey);
    } else if (typeof value === 'object' && value !== null) {
      // Nested object - recurse
      keys.push(...extractKeysFromLocaleData(value as TLocaleData, fullKey));
    }
  }

  return keys;
}
