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

/**
 * Merge translations from one tree into another.
 * Useful when combining translations from multiple locales.
 *
 * @param target - Tree to merge into
 * @param source - Tree to merge from
 */
export function mergeTreeTranslations(target: KeyTreeNode[], source: KeyTreeNode[]): void {
  const sourceMap = new Map<string, KeyTreeNode>();
  for (const node of source) {
    sourceMap.set(node.fullKey, node);
  }

  for (const targetNode of target) {
    const sourceNode = sourceMap.get(targetNode.fullKey);

    if (sourceNode) {
      if (targetNode.isLeaf && sourceNode.isLeaf) {
        // Merge translations for leaf nodes
        if (sourceNode.translations) {
          if (!targetNode.translations) {
            targetNode.translations = new Map();
          }
          for (const [locale, translation] of sourceNode.translations) {
            targetNode.translations.set(locale, translation);
          }
        }
      } else if (!targetNode.isLeaf && !sourceNode.isLeaf) {
        // Recurse for branch nodes
        mergeTreeTranslations(targetNode.children, sourceNode.children);
      }
    }
  }
}

/**
 * Get all leaf keys from a tree (for iteration).
 *
 * @param tree - Tree structure
 * @returns Array of all full keys for leaf nodes
 */
export function getAllLeafKeys(tree: KeyTreeNode[]): string[] {
  const keys: string[] = [];

  function collect(nodes: KeyTreeNode[]): void {
    for (const node of nodes) {
      if (node.isLeaf) {
        keys.push(node.fullKey);
      } else {
        collect(node.children);
      }
    }
  }

  collect(tree);
  return keys;
}

/**
 * Find a node in the tree by its full key.
 *
 * @param tree - Tree structure
 * @param fullKey - Full dot-notation key to find
 * @returns The node if found, undefined otherwise
 */
export function findNodeByKey(tree: KeyTreeNode[], fullKey: string): KeyTreeNode | undefined {
  const parts = fullKey.split('.');

  let current: KeyTreeNode[] = tree;
  let node: KeyTreeNode | undefined;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    node = current.find(n => n.name === part);

    if (!node) return undefined;

    if (i < parts.length - 1) {
      current = node.children;
    }
  }

  return node;
}

/**
 * Add a new key to the tree with empty translations for all locales.
 *
 * @param tree - Tree structure (mutated)
 * @param fullKey - Full dot-notation key to add
 * @param locales - Locale codes to initialize empty translations for
 */
export function addKeyToTree(tree: KeyTreeNode[], fullKey: string, locales: TLanguageCode[]): void {
  const parts = fullKey.split('.');
  let current: KeyTreeNode[] = tree;
  let prefix = '';

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    prefix = prefix ? `${prefix}.${part}` : part;
    const isLast = i === parts.length - 1;

    let node = current.find(n => n.name === part);

    if (!node) {
      // Create new node
      node = {
        name: part,
        fullKey: prefix,
        isLeaf: isLast,
        children: [],
      };

      if (isLast) {
        // Initialize empty translations for all locales
        node.translations = new Map();
        for (const locale of locales) {
          node.translations.set(locale, '');
        }
      }

      current.push(node);
      current.sort((a, b) => a.name.localeCompare(b.name));
    } else if (isLast && !node.isLeaf) {
      // Converting branch to leaf - add translations
      node.isLeaf = true;
      node.translations = new Map();
      for (const locale of locales) {
        node.translations.set(locale, '');
      }
    }

    current = node.children;
  }
}

/**
 * Remove a key from the tree.
 *
 * @param tree - Tree structure (mutated)
 * @param fullKey - Full dot-notation key to remove
 * @returns true if removed, false if not found
 */
export function removeKeyFromTree(tree: KeyTreeNode[], fullKey: string): boolean {
  const parts = fullKey.split('.');
  const stack: { nodes: KeyTreeNode[]; index: number }[] = [];
  let current: KeyTreeNode[] = tree;

  // Find the node and track parent chain
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const index = current.findIndex(n => n.name === part);

    if (index === -1) return false;

    stack.push({ nodes: current, index });
    current = current[index].children;
  }

  // Remove the node
  const last = stack.pop()!;
  last.nodes.splice(last.index, 1);

  // Clean up empty parent branches
  while (stack.length > 0) {
    const parent = stack.pop()!;
    const parentNode = parent.nodes[parent.index];

    if (parentNode.children.length === 0 && !parentNode.isLeaf) {
      parent.nodes.splice(parent.index, 1);
    } else {
      break;
    }
  }

  return true;
}
