/**
 * Key Tree Builder
 *
 * Converts between ILocalesConfiguration (JSON format) and KeyTreeNode[] (UI model).
 *
 * - buildKeyTree(): ILocalesConfiguration → KeyTreeNode[]
 * - serializeToLocalesConfiguration(): KeyTreeNode[] → ILocalesConfiguration
 */

import type { ILocalesConfiguration, TLanguageCode, TLocaleData } from 'eligius';
import { isLocaleReference } from 'eligius';
import type { KeyTreeNode } from './types.js';

/**
 * Check if a value is nested locale data (object with string or nested values)
 */
function isNestedData(value: unknown): value is TLocaleData {
  return typeof value === 'object' && value !== null && !('$ref' in value);
}

/**
 * Collect all unique keys from all locales, building the union of all paths.
 * Returns a set of dot-notation keys (e.g., "nav.home", "nav.about").
 */
function collectAllKeys(locales: ILocalesConfiguration): Set<string> {
  const allKeys = new Set<string>();

  for (const [, entry] of Object.entries(locales)) {
    // Skip external references for now
    if (isLocaleReference(entry)) continue;

    collectKeysFromData(entry, '', allKeys);
  }

  return allKeys;
}

/**
 * Recursively collect keys from locale data.
 */
function collectKeysFromData(data: TLocaleData, prefix: string, keys: Set<string>): void {
  for (const [key, value] of Object.entries(data)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (typeof value === 'string') {
      // Leaf node - this is a translation
      keys.add(fullKey);
    } else if (isNestedData(value)) {
      // Branch node - recurse into nested object
      collectKeysFromData(value, fullKey, keys);
    }
  }
}

/**
 * Get translation value for a specific key and locale.
 */
function getTranslation(
  locales: ILocalesConfiguration,
  locale: string,
  keyParts: string[]
): string | undefined {
  const entry = locales[locale];
  if (!entry || isLocaleReference(entry)) return undefined;

  let current: TLocaleData | string = entry;
  for (const part of keyParts) {
    if (typeof current === 'string') return undefined;
    current = current[part];
    if (current === undefined) return undefined;
  }

  return typeof current === 'string' ? current : undefined;
}

/**
 * Build a tree structure from a flat list of keys.
 * Keys are expected to be dot-notation (e.g., "nav.home").
 */
function buildTreeFromKeys(keys: string[], locales: ILocalesConfiguration): KeyTreeNode[] {
  // Group keys by their first segment
  const groups = new Map<string, string[]>();

  for (const key of keys) {
    const parts = key.split('.');
    const firstPart = parts[0];
    const remainder = parts.slice(1).join('.');

    if (!groups.has(firstPart)) {
      groups.set(firstPart, []);
    }

    if (remainder) {
      groups.get(firstPart)!.push(remainder);
    }
  }

  // Convert groups to tree nodes
  const nodes: KeyTreeNode[] = [];
  const localeKeys = Object.keys(locales).filter(
    k => !isLocaleReference(locales[k])
  ) as TLanguageCode[];

  for (const [segment, childKeys] of groups) {
    if (childKeys.length === 0) {
      // Leaf node - collect translations
      const translations = new Map<TLanguageCode, string>();

      for (const locale of localeKeys) {
        const translation = getTranslation(locales, locale, [segment]);
        if (translation !== undefined) {
          translations.set(locale, translation);
        }
      }

      nodes.push({
        name: segment,
        fullKey: segment,
        isLeaf: true,
        children: [],
        translations,
      });
    } else {
      // Branch node - build subtree
      const childNodes = buildTreeFromKeysWithPrefix(childKeys, locales, segment);

      nodes.push({
        name: segment,
        fullKey: segment,
        isLeaf: false,
        children: childNodes,
      });
    }
  }

  // Sort alphabetically
  nodes.sort((a, b) => a.name.localeCompare(b.name));

  return nodes;
}

/**
 * Build tree from keys with a prefix (for recursive building).
 */
function buildTreeFromKeysWithPrefix(
  keys: string[],
  locales: ILocalesConfiguration,
  prefix: string
): KeyTreeNode[] {
  // Group keys by their first segment
  const groups = new Map<string, string[]>();

  for (const key of keys) {
    const parts = key.split('.');
    const firstPart = parts[0];
    const remainder = parts.slice(1).join('.');

    if (!groups.has(firstPart)) {
      groups.set(firstPart, []);
    }

    if (remainder) {
      groups.get(firstPart)!.push(remainder);
    }
  }

  // Convert groups to tree nodes
  const nodes: KeyTreeNode[] = [];
  const localeKeys = Object.keys(locales).filter(
    k => !isLocaleReference(locales[k])
  ) as TLanguageCode[];

  for (const [segment, childKeys] of groups) {
    const fullKey = `${prefix}.${segment}`;

    if (childKeys.length === 0) {
      // Leaf node - collect translations
      const translations = new Map<TLanguageCode, string>();
      const keyParts = fullKey.split('.');

      for (const locale of localeKeys) {
        const translation = getTranslation(locales, locale, keyParts);
        if (translation !== undefined) {
          translations.set(locale, translation);
        }
      }

      nodes.push({
        name: segment,
        fullKey,
        isLeaf: true,
        children: [],
        translations,
      });
    } else {
      // Branch node - build subtree
      const childNodes = buildTreeFromKeysWithPrefix(childKeys, locales, fullKey);

      nodes.push({
        name: segment,
        fullKey,
        isLeaf: false,
        children: childNodes,
      });
    }
  }

  // Sort alphabetically
  nodes.sort((a, b) => a.name.localeCompare(b.name));

  return nodes;
}

/**
 * Convert ILocalesConfiguration to KeyTreeNode[] for UI display.
 *
 * @param locales - The locale configuration (nested JSON format)
 * @returns Tree structure for UI navigation
 */
export function buildKeyTree(locales: ILocalesConfiguration): KeyTreeNode[] {
  // Handle empty configuration
  if (Object.keys(locales).length === 0) {
    return [];
  }

  // Collect all unique keys from all locales
  const allKeys = collectAllKeys(locales);

  // Handle empty locale data
  if (allKeys.size === 0) {
    return [];
  }

  // Build tree from keys
  return buildTreeFromKeys(Array.from(allKeys), locales);
}

/**
 * Convert KeyTreeNode[] back to ILocalesConfiguration for saving.
 *
 * @param tree - Tree structure from UI
 * @returns Locale configuration (nested JSON format)
 */
export function serializeToLocalesConfiguration(tree: KeyTreeNode[]): ILocalesConfiguration {
  // Collect all locale codes from the tree
  const locales = new Set<TLanguageCode>();
  collectLocalesFromTree(tree, locales);

  // Build configuration for each locale
  const config: ILocalesConfiguration = {};

  for (const locale of locales) {
    config[locale] = buildLocaleDataFromTree(tree, locale);
  }

  return config;
}

/**
 * Recursively collect all locale codes from the tree.
 */
function collectLocalesFromTree(nodes: KeyTreeNode[], locales: Set<TLanguageCode>): void {
  for (const node of nodes) {
    if (node.isLeaf && node.translations) {
      for (const locale of node.translations.keys()) {
        locales.add(locale);
      }
    }

    if (node.children.length > 0) {
      collectLocalesFromTree(node.children, locales);
    }
  }
}

/**
 * Build locale data object from tree for a specific locale.
 */
function buildLocaleDataFromTree(nodes: KeyTreeNode[], locale: TLanguageCode): TLocaleData {
  const data: TLocaleData = {};

  for (const node of nodes) {
    if (node.isLeaf) {
      // Leaf node - add translation if exists
      const translation = node.translations?.get(locale);
      if (translation !== undefined) {
        data[node.name] = translation;
      }
    } else {
      // Branch node - recurse
      const childData = buildLocaleDataFromTree(node.children, locale);
      if (Object.keys(childData).length > 0) {
        data[node.name] = childData;
      }
    }
  }

  return data;
}

/**
 * Extract all locale codes from an ILocalesConfiguration.
 */
export function extractLocales(locales: ILocalesConfiguration): string[] {
  return Object.keys(locales).filter(k => !isLocaleReference(locales[k]));
}
