/**
 * Locale Serializer
 *
 * Single-locale conversion utilities for working with locale data.
 *
 * - localeDataToKeyTree(): TLocaleData + locale code → KeyTreeNode[]
 * - keyTreeToLocaleData(): KeyTreeNode[] + locale code → TLocaleData
 */

import type { TLanguageCode, TLocaleData } from 'eligius';
import type { KeyTreeNode } from './types.js';

/**
 * Check if a value is nested locale data (object with string or nested values)
 */
function isNestedData(value: unknown): value is TLocaleData {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Convert single locale data to KeyTreeNode[] with translations for that locale.
 *
 * @param data - Single locale's translation data
 * @param locale - The locale code for these translations
 * @returns Tree structure with translations for the given locale
 */
export function localeDataToKeyTree(data: TLocaleData, locale: TLanguageCode): KeyTreeNode[] {
  return buildTreeFromData(data, '', locale);
}

/**
 * Recursively build tree from locale data.
 */
function buildTreeFromData(
  data: TLocaleData,
  prefix: string,
  locale: TLanguageCode
): KeyTreeNode[] {
  const nodes: KeyTreeNode[] = [];

  for (const [key, value] of Object.entries(data)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (typeof value === 'string') {
      // Leaf node - translation string
      const translations = new Map<TLanguageCode, string>();
      translations.set(locale, value);

      nodes.push({
        name: key,
        fullKey,
        isLeaf: true,
        children: [],
        translations,
      });
    } else if (isNestedData(value)) {
      // Branch node - nested object
      const children = buildTreeFromData(value, fullKey, locale);

      nodes.push({
        name: key,
        fullKey,
        isLeaf: false,
        children,
      });
    }
  }

  // Sort alphabetically
  nodes.sort((a, b) => a.name.localeCompare(b.name));

  return nodes;
}

/**
 * Extract single locale's data from KeyTreeNode[].
 *
 * @param tree - Tree structure with translations
 * @param locale - The locale code to extract
 * @returns Single locale's translation data
 */
export function keyTreeToLocaleData(tree: KeyTreeNode[], locale: TLanguageCode): TLocaleData {
  const data: TLocaleData = {};

  for (const node of tree) {
    if (node.isLeaf) {
      // Leaf node - extract translation if exists
      const translation = node.translations?.get(locale);
      if (translation !== undefined) {
        data[node.name] = translation;
      }
    } else {
      // Branch node - recurse
      const childData = keyTreeToLocaleData(node.children, locale);
      if (Object.keys(childData).length > 0) {
        data[node.name] = childData;
      }
    }
  }

  return data;
}
