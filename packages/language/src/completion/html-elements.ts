/**
 * HTML Element Completion Provider (Feature 043)
 *
 * Provides completions for HTML elements, attributes, and attribute values
 * in createElement operations.
 */

import { type CompletionItem, CompletionItemKind } from 'vscode-languageserver';
import {
  getAttributeEnumValues,
  getElementAttributes,
  HTML_ELEMENT_NAMES,
} from './html-elements.generated.js';

/** Prefix of custom data attributes; their names are open-ended, so only the prefix is offered. */
const DATA_ATTRIBUTE_PREFIX = 'data-';

/** An object key that lexes as an ID (the grammar's ID terminal) needs no quotes. */
const IDENTIFIER_KEY = /^[_a-zA-Z][\w_]*$/;

/**
 * Provider for HTML element completions in createElement calls
 */
export class HTMLElementCompletionProvider {
  /**
   * Get completions for HTML element names
   *
   * @param partialText - Text typed so far (for filtering)
   * @returns Array of completion items for matching elements
   */
  getElementNameCompletions(partialText: string): CompletionItem[] {
    const filter = partialText.toLowerCase();

    // Filter and map elements to completion items
    const completions: CompletionItem[] = HTML_ELEMENT_NAMES.filter(name =>
      name.toLowerCase().includes(filter)
    )
      .sort() // Alphabetical order
      .map(name => ({
        label: name,
        kind: CompletionItemKind.Value,
        detail: `HTML <${name}> element`,
        insertText: name,
      }));

    return completions;
  }

  /**
   * Get completions for attribute names based on element type
   *
   * @param elementName - HTML element name (e.g., "input", "a")
   * @param partialText - Text typed so far (for filtering)
   * @returns Array of completion items for matching attributes
   */
  getAttributeNameCompletions(elementName: string, partialText = ''): CompletionItem[] {
    const attributes = getElementAttributes(elementName);
    const filter = partialText.toLowerCase();

    const items: CompletionItem[] = attributes
      .filter(attr => attr.name.toLowerCase().includes(filter))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(attr => ({
        label: attr.name,
        kind: CompletionItemKind.Property,
        detail: attr.description ?? `${elementName} attribute`,
        filterText: attr.name,
        // Object keys must be identifiers or strings: quote `http-equiv`, `accept-charset`, ...
        insertText: IDENTIFIER_KEY.test(attr.name) ? attr.name : JSON.stringify(attr.name),
      }));

    // Custom data attributes (`data-*`) are valid on every element but cannot be enumerated.
    if (DATA_ATTRIBUTE_PREFIX.includes(filter)) {
      items.push({
        label: DATA_ATTRIBUTE_PREFIX,
        kind: CompletionItemKind.Property,
        detail: 'Custom data attribute (data-*)',
        filterText: DATA_ATTRIBUTE_PREFIX,
        insertText: JSON.stringify(DATA_ATTRIBUTE_PREFIX),
      });
    }
    return items.sort((a, b) => a.label.localeCompare(b.label));
  }

  /**
   * Get completions for attribute values (for enumerated attributes)
   *
   * @param elementName - HTML element name
   * @param attributeName - Attribute name
   * @param partialText - Text typed so far (for filtering)
   * @returns Array of completion items for valid values, or empty if not enumerated
   */
  getAttributeValueCompletions(
    elementName: string,
    attributeName: string,
    partialText = ''
  ): CompletionItem[] {
    const enumValues = getAttributeEnumValues(elementName, attributeName);

    if (!enumValues) {
      return [];
    }

    const filter = partialText.toLowerCase();

    return enumValues
      .filter(value => value.toLowerCase().includes(filter))
      .sort()
      .map(value => ({
        label: value,
        kind: CompletionItemKind.EnumMember,
        detail: `${attributeName} value`,
        insertText: value,
      }));
  }
}
