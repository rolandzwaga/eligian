/**
 * Locale Editor Utilities
 *
 * Pure utility functions for LocaleEditorProvider operations.
 * All functions are immutable - they return new objects rather than mutating.
 */

import type { ILocalesConfiguration, TLocaleData, TLocaleEntry } from 'eligius';
import type { KeyTreeNode, SerializableKeyTreeNode, TLanguageCode } from './types.js';

/**
 * Type helper to safely index ILocalesConfiguration with string keys.
 * ILocalesConfiguration uses TLanguageCode (template literal) as keys,
 * but we often need to iterate with plain strings.
 */
type IndexableLocales = Record<string, TLocaleEntry>;

/**
 * Result of parsing ILocalesConfiguration from JSON.
 */
export interface ParseResult {
  success: boolean;
  config?: ILocalesConfiguration;
  error?: string;
}

/**
 * Parse JSON text into ILocalesConfiguration.
 * Validates that the JSON is a valid locale configuration object.
 *
 * @param text - Raw JSON text
 * @returns Parse result with config or error
 */
export function parseLocalesConfiguration(text: string): ParseResult {
  try {
    const parsed = JSON.parse(text);

    // Must be an object (not array, null, or primitive)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {
        success: false,
        error: 'Locale configuration must be an object',
      };
    }

    return {
      success: true,
      config: parsed as ILocalesConfiguration,
    };
  } catch (error) {
    return {
      success: false,
      error: `Invalid JSON: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Convert KeyTreeNode[] to SerializableKeyTreeNode[] for webview messaging.
 * Converts Map to Record for JSON serialization.
 *
 * @param tree - KeyTreeNode array with Map translations
 * @returns SerializableKeyTreeNode array with Record translations
 */
export function keyTreeToSerializable(tree: KeyTreeNode[]): SerializableKeyTreeNode[] {
  return tree.map(node => ({
    name: node.name,
    fullKey: node.fullKey,
    isLeaf: node.isLeaf,
    children: keyTreeToSerializable(node.children),
    translations: node.translations ? Object.fromEntries(node.translations) : undefined,
  }));
}

/**
 * Convert SerializableKeyTreeNode[] back to KeyTreeNode[].
 * Converts Record to Map for internal use.
 *
 * @param serializable - SerializableKeyTreeNode array with Record translations
 * @returns KeyTreeNode array with Map translations
 */
export function serializableToKeyTree(serializable: SerializableKeyTreeNode[]): KeyTreeNode[] {
  return serializable.map(node => ({
    name: node.name,
    fullKey: node.fullKey,
    isLeaf: node.isLeaf,
    children: serializableToKeyTree(node.children),
    translations: node.translations
      ? new Map(Object.entries(node.translations) as [TLanguageCode, string][])
      : undefined,
  }));
}

/**
 * Deep clone an ILocalesConfiguration.
 */
function cloneConfig(config: ILocalesConfiguration): ILocalesConfiguration {
  return JSON.parse(JSON.stringify(config));
}

/**
 * Get value at a dot-notation path in locale data.
 */
function getAtPath(data: TLocaleData, path: string[]): string | TLocaleData | undefined {
  let current: TLocaleData | string = data;

  for (const segment of path) {
    if (typeof current === 'string' || typeof current === 'function' || current === undefined) {
      return undefined;
    }
    const next = current[segment];
    // Skip function values (parameterized translations)
    if (typeof next === 'function') return undefined;
    current = next as TLocaleData | string;
  }

  return current;
}

/**
 * Set value at a dot-notation path in locale data.
 * Creates intermediate objects as needed.
 */
function setAtPath(data: TLocaleData, path: string[], value: string): void {
  let current: TLocaleData = data;

  for (let i = 0; i < path.length - 1; i++) {
    const segment = path[i];
    if (typeof current[segment] !== 'object' || current[segment] === null) {
      current[segment] = {};
    }
    current = current[segment] as TLocaleData;
  }

  current[path[path.length - 1]] = value;
}

/**
 * Delete value at a dot-notation path in locale data.
 * Cleans up empty parent objects.
 */
function deleteAtPath(data: TLocaleData, path: string[]): boolean {
  if (path.length === 0) return false;

  if (path.length === 1) {
    if (path[0] in data) {
      delete data[path[0]];
      return true;
    }
    return false;
  }

  // Navigate to parent
  const parentPath = path.slice(0, -1);
  const key = path[path.length - 1];
  let current: TLocaleData = data;

  for (const segment of parentPath) {
    if (typeof current[segment] !== 'object' || current[segment] === null) {
      return false;
    }
    current = current[segment] as TLocaleData;
  }

  if (!(key in current)) {
    return false;
  }

  delete current[key];

  // Clean up empty parent objects (recursive)
  cleanEmptyParents(data, parentPath);

  return true;
}

/**
 * Recursively clean up empty parent objects.
 */
function cleanEmptyParents(data: TLocaleData, path: string[]): void {
  if (path.length === 0) return;

  let current: TLocaleData = data;
  const parents: { obj: TLocaleData; key: string }[] = [];

  for (const segment of path) {
    if (typeof current[segment] !== 'object') return;
    parents.push({ obj: current, key: segment });
    current = current[segment] as TLocaleData;
  }

  // Check from deepest to shallowest
  for (let i = parents.length - 1; i >= 0; i--) {
    const { obj, key } = parents[i];
    const child = obj[key];
    if (typeof child === 'object' && Object.keys(child).length === 0) {
      delete obj[key];
    } else {
      break; // Stop if we hit a non-empty object
    }
  }
}

/**
 * Update a translation value in the configuration.
 * Creates the locale and path if they don't exist.
 *
 * @param config - Original configuration
 * @param key - Dot-notation translation key
 * @param locale - Locale code
 * @param value - New translation value
 * @returns New configuration with updated value
 */
export function updateTranslationInConfig(
  config: ILocalesConfiguration,
  key: string,
  locale: string,
  value: string
): ILocalesConfiguration {
  const result = cloneConfig(config) as IndexableLocales;
  const path = key.split('.');

  // Ensure locale exists
  if (!result[locale] || typeof result[locale] !== 'object' || '$ref' in result[locale]) {
    result[locale] = {};
  }

  setAtPath(result[locale] as TLocaleData, path, value);

  return result as ILocalesConfiguration;
}

/**
 * Add a new key to all locales with empty string value.
 * Does not overwrite existing keys.
 *
 * @param config - Original configuration
 * @param key - Dot-notation translation key to add
 * @returns New configuration with added key
 */
export function addKeyToConfig(config: ILocalesConfiguration, key: string): ILocalesConfiguration {
  const result = cloneConfig(config) as IndexableLocales;
  const path = key.split('.');

  for (const locale of Object.keys(result)) {
    const entry = result[locale];
    if (typeof entry !== 'object' || '$ref' in entry) continue;

    // Check if key already exists
    const existing = getAtPath(entry as TLocaleData, path);
    if (existing === undefined) {
      setAtPath(entry as TLocaleData, path, '');
    }
  }

  return result as ILocalesConfiguration;
}

/**
 * Delete a key from all locales.
 * Cleans up empty parent objects.
 *
 * @param config - Original configuration
 * @param key - Dot-notation translation key to delete
 * @returns New configuration with key deleted
 */
export function deleteKeyFromConfig(
  config: ILocalesConfiguration,
  key: string
): ILocalesConfiguration {
  const result = cloneConfig(config) as IndexableLocales;
  const path = key.split('.');

  for (const locale of Object.keys(result)) {
    const entry = result[locale];
    if (typeof entry !== 'object' || '$ref' in entry) continue;

    deleteAtPath(entry as TLocaleData, path);
  }

  return result as ILocalesConfiguration;
}

/**
 * Rename a key in all locales, preserving translation values.
 *
 * @param config - Original configuration
 * @param oldKey - Original dot-notation key
 * @param newKey - New dot-notation key
 * @returns New configuration with key renamed
 */
export function renameKeyInConfig(
  config: ILocalesConfiguration,
  oldKey: string,
  newKey: string
): ILocalesConfiguration {
  const result = cloneConfig(config) as IndexableLocales;
  const oldPath = oldKey.split('.');
  const newPath = newKey.split('.');

  for (const locale of Object.keys(result)) {
    const entry = result[locale];
    if (typeof entry !== 'object' || '$ref' in entry) continue;

    const data = entry as TLocaleData;
    const value = getAtPath(data, oldPath);

    if (value !== undefined && typeof value === 'string') {
      // Delete old key
      deleteAtPath(data, oldPath);
      // Set at new key
      setAtPath(data, newPath, value);
    }
  }

  return result as ILocalesConfiguration;
}

/**
 * Extract all locale codes from a configuration.
 */
export function extractLocalesFromConfig(config: ILocalesConfiguration): string[] {
  return Object.keys(config).filter(key => {
    const entry = (config as IndexableLocales)[key];
    return typeof entry === 'object' && !('$ref' in entry);
  });
}
