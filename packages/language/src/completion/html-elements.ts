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

    return attributes
      .filter(attr => attr.name.toLowerCase().includes(filter))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(attr => ({
        label: attr.name,
        kind: CompletionItemKind.Property,
        detail: attr.description ?? `${elementName} attribute`,
        insertText: attr.name,
      }));
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
