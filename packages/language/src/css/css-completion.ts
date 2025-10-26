/**
 * CSS Completion Provider
 *
 * Provides CSS class and ID autocompletion for Eligian DSL.
 * Generates completion items based on CSSRegistryService data.
 *
 * Features:
 * - Autocomplete CSS classes in className parameters (addClass, removeClass, etc.) - ✅ FULLY FUNCTIONAL IN-STRING
 * - Autocomplete CSS classes/IDs in selector strings (after . or #) - ✅ FULLY FUNCTIONAL IN-STRING
 * - Rank CSS completions first using sortText prefix "0_"
 * - Provide detail text showing "CSS class" or "CSS ID"
 * - Intelligent prefix filtering (only show classes starting with typed text)
 * - Proper TextEdit ranges for in-string replacement
 * - Works both inside string literals AND between parentheses
 *
 * Implementation: Uses Langium's string literal completion pattern (based on
 * grammar-completion-provider.ts from Langium's own codebase) to provide completions
 * inside quoted strings using tokenOffset/offset/tokenEndOffset boundaries.
 */

import type { CompletionAcceptor, CompletionContext } from 'langium/lsp';
import type { CompletionItem } from 'vscode-languageserver-protocol';
import { CompletionItemKind } from 'vscode-languageserver-protocol';

/**
 * CSS Completion Provider
 *
 * Pure, stateless provider that generates CSS completion items.
 * Takes CSS classes/IDs as input and generates LSP CompletionItems.
 */
export class CSSCompletionProvider {
  /**
   * Provide CSS class completions for className parameters
   *
   * Used in: addClass(""), removeClass(""), toggleClass(""), hasClass("")
   *
   * Strategy (Langium string literal completion pattern):
   * 1. Detect if cursor is inside string literal or between parens
   * 2. Inside string: Extract typed prefix, filter classes, create TextEdit range
   * 3. Between parens: Add quotes around class name
   * 4. Use sortText prefix "0_" to rank CSS items first
   *
   * This now FULLY supports in-string completion like selector completions.
   *
   * @param context - Langium completion context
   * @param classes - Set of CSS class names (from CSSRegistry)
   * @param acceptor - Callback to accept each completion item
   * @param addQuotes - Whether to wrap the class name in quotes (for between-parens case)
   */
  provideCSSClassCompletions(
    context: CompletionContext,
    classes: Set<string>,
    acceptor: CompletionAcceptor,
    addQuotes = false
  ): void {
    const text = context.textDocument?.getText();
    const tokenOffset = context.tokenOffset;
    const offset = context.offset;
    const tokenEndOffset = context.tokenEndOffset;

    // Determine if we're inside a string literal by checking if we have valid token boundaries
    const hasTokenBoundaries =
      text !== undefined && tokenOffset !== undefined && tokenEndOffset !== undefined;
    const insideString =
      (hasTokenBoundaries && text[tokenOffset] === '"') || text[tokenOffset] === "'";

    if (insideString && text) {
      // INSIDE STRING LITERAL - Use Langium pattern with filtering and TextEdit
      const partialToken = text.substring(tokenOffset, offset);

      // Skip opening quote to get typed prefix
      const typedPrefix = partialToken.length > 1 ? partialToken.substring(1) : '';

      // Filter classes by typed prefix
      let filteredClasses = Array.from(classes);
      if (typedPrefix.length > 0) {
        filteredClasses = filteredClasses.filter(cls => cls.startsWith(typedPrefix));
      }

      // Calculate TextEdit range (from after opening quote to before closing quote)
      const replaceStart = tokenOffset + 1; // After opening quote
      let replaceEnd = tokenEndOffset;
      if (text[tokenEndOffset - 1] === '"' || text[tokenEndOffset - 1] === "'") {
        replaceEnd = tokenEndOffset - 1; // Before closing quote
      }

      const range = {
        start: context.textDocument.positionAt(replaceStart),
        end: context.textDocument.positionAt(replaceEnd),
      };

      // Generate filtered completion items with TextEdit
      for (const className of filteredClasses) {
        const item: CompletionItem = {
          label: className,
          kind: CompletionItemKind.Property,
          detail: 'CSS class',
          sortText: `0_${className}`,
          textEdit: {
            range,
            newText: className,
          },
          filterText: className,
        };

        acceptor(context, item);
      }
    } else {
      // BETWEEN PARENS - Original logic (add quotes if needed)
      for (const className of classes) {
        const insertText = addQuotes ? `"${className}"` : className;

        const item: CompletionItem = {
          label: className,
          kind: CompletionItemKind.Property,
          detail: 'CSS class',
          sortText: `0_${className}`,
          insertText: insertText,
          filterText: className,
          textEdit: undefined, // Let Langium calculate
        };

        acceptor(context, item);
      }
    }
  }

  /**
   * Provide CSS class or ID completions for selector strings
   *
   * Used in: selectElement("."), selectElement("#"), querySelector, etc.
   *
   * Strategy (Langium string literal completion pattern):
   * 1. Extract partial text user has typed using tokenOffset and offset
   * 2. Remove the selector prefix (. or #) to get typed prefix
   * 3. Filter completions by typed prefix
   * 4. Create TextEdit range that replaces from after prefix to before closing quote
   * 5. Do NOT include . or # prefix in label/insertText (already typed by user)
   * 6. Use sortText prefix "0_" to rank CSS items first
   *
   * This pattern is based on Langium's own import path completion implementation
   * (grammar-completion-provider.ts completeImportPath method).
   *
   * @param context - Langium completion context
   * @param classes - Set of CSS class names (from CSSRegistry)
   * @param ids - Set of CSS ID names (from CSSRegistry)
   * @param selectorType - Whether completing class or ID
   * @param acceptor - Callback to accept each completion item
   */
  provideSelectorCompletions(
    context: CompletionContext,
    classes: Set<string>,
    ids: Set<string>,
    selectorType: 'class' | 'id',
    acceptor: CompletionAcceptor
  ): void {
    // Extract the text user has typed so far using Langium's token boundaries
    const text = context.textDocument.getText();
    const tokenOffset = context.tokenOffset; // Start of entire token (including opening quote)
    const offset = context.offset; // Current cursor position
    const tokenEndOffset = context.tokenEndOffset; // End of entire token (including closing quote if present)

    // Get the partial content from start of token to cursor
    // Example: selectElement(".butt|on") → tokenOffset points to ", offset points to |
    const partialToken = text.substring(tokenOffset, offset);

    // Extract text after opening quote and selector prefix
    // Example: ".butt" → skip " and . to get "butt"
    const selectorPrefix = selectorType === 'class' ? '.' : '#';
    let typedPrefix = '';

    // Find where the selector prefix starts (could be at beginning or after element/combinator)
    const lastPrefixIndex = partialToken.lastIndexOf(selectorPrefix);
    if (lastPrefixIndex !== -1) {
      // Get everything after the last selector prefix
      typedPrefix = partialToken.substring(lastPrefixIndex + 1);
    }

    // Determine the items to complete
    const items = selectorType === 'class' ? classes : ids;

    // Filter items by typed prefix
    let filteredItems = Array.from(items);
    if (typedPrefix.length > 0) {
      filteredItems = filteredItems.filter(item => item.startsWith(typedPrefix));
    }

    // Calculate the TextEdit range
    // Replace from after the selector prefix to before the closing quote (or end of token)
    const replaceStart =
      lastPrefixIndex !== -1
        ? tokenOffset + lastPrefixIndex + 1 // After the . or #
        : offset; // Fallback to cursor position

    // Find closing quote or use tokenEndOffset
    let replaceEnd = tokenEndOffset;
    if (text[tokenEndOffset - 1] === '"' || text[tokenEndOffset - 1] === "'") {
      replaceEnd = tokenEndOffset - 1; // Before closing quote
    }

    const range = {
      start: context.textDocument.positionAt(replaceStart),
      end: context.textDocument.positionAt(replaceEnd),
    };

    // Generate completion items with proper TextEdit
    for (const itemName of filteredItems) {
      const item: CompletionItem = {
        label: itemName, // NO dot/hash prefix
        kind: CompletionItemKind.Property,
        detail: selectorType === 'class' ? 'CSS class' : 'CSS ID',
        sortText: `0_${itemName}`, // Prefix "0_" to rank first
        textEdit: {
          range,
          newText: itemName, // Insert just the class/ID name
        },
        filterText: itemName, // Filter by just the name
      };

      acceptor(context, item);
    }
  }
}
