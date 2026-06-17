/**
 * HTML element completion branch for {@link EligianCompletionProvider}
 * (Feature 043: createElement completions).
 *
 * Provides element-name, attribute-name, and attribute-value completions inside
 * createElement contexts. Extracted verbatim from the provider's `completionFor`
 * (W3 decomposition).
 */

import type { CompletionAcceptor, CompletionContext } from 'langium/lsp';
import type { CompletionItem } from 'vscode-languageserver';
import { detectHTMLCompletionContext } from '../html/context-detection.js';
import { HTMLCompletionContextType } from '../html/context-types.js';
import type { CompletionBranchResult } from './handler-result.js';
import type { HTMLElementCompletionProvider } from './html-elements.js';

/**
 * Handle HTML element / attribute completion contexts.
 *
 * @returns `done` when the context was fully handled, otherwise `fallthrough`
 * (including the attribute-value case where no enum values applied and default
 * completions should continue).
 */
export function handleHtmlCompletion(
  context: CompletionContext,
  acceptor: CompletionAcceptor,
  htmlCompletionProvider: HTMLElementCompletionProvider
): CompletionBranchResult {
  // FEATURE 043: HTML Element Completion for createElement
  // Check if we're in a createElement context and provide appropriate completions
  const htmlContext = detectHTMLCompletionContext(context);
  if (htmlContext.type === HTMLCompletionContextType.None) {
    return { status: 'fallthrough' };
  }

  if (htmlContext.type === HTMLCompletionContextType.ElementName) {
    // Provide HTML element name completions with proper TextEdit for in-string replacement
    const elementCompletions = htmlCompletionProvider.getElementNameCompletions(
      htmlContext.partialText ?? ''
    );

    // If we have string boundaries, use TextEdit to replace string content
    if (
      htmlContext.stringContentStart !== undefined &&
      htmlContext.stringContentEnd !== undefined
    ) {
      const range = {
        start: context.textDocument.positionAt(htmlContext.stringContentStart),
        end: context.textDocument.positionAt(htmlContext.stringContentEnd),
      };

      for (const item of elementCompletions) {
        const itemWithEdit: CompletionItem = {
          ...item,
          textEdit: {
            range,
            newText: item.insertText ?? item.label,
          },
          filterText: item.label,
        };
        acceptor(context, itemWithEdit);
      }
    } else {
      // No string boundaries (cursor between parens with no quotes) - add quotes
      for (const item of elementCompletions) {
        const itemWithQuotes: CompletionItem = {
          ...item,
          insertText: `"${item.insertText ?? item.label}"`,
        };
        acceptor(context, itemWithQuotes);
      }
    }
    return { status: 'done' }; // Return early - we've provided all completions
  } else if (htmlContext.type === HTMLCompletionContextType.AttributeName) {
    // Provide attribute name completions for the element
    const attrCompletions = htmlCompletionProvider.getAttributeNameCompletions(
      htmlContext.elementName ?? '',
      ''
    );
    for (const item of attrCompletions) {
      acceptor(context, item);
    }
    return { status: 'done' }; // Return early
  } else if (htmlContext.type === HTMLCompletionContextType.AttributeValue) {
    // Provide attribute value completions for enumerated attributes with proper TextEdit
    const valueCompletions = htmlCompletionProvider.getAttributeValueCompletions(
      htmlContext.elementName ?? '',
      htmlContext.attributeName ?? '',
      htmlContext.partialText ?? ''
    );

    // If we have string boundaries, use TextEdit to replace string content
    if (
      htmlContext.stringContentStart !== undefined &&
      htmlContext.stringContentEnd !== undefined &&
      valueCompletions.length > 0
    ) {
      const range = {
        start: context.textDocument.positionAt(htmlContext.stringContentStart),
        end: context.textDocument.positionAt(htmlContext.stringContentEnd),
      };

      for (const item of valueCompletions) {
        const itemWithEdit: CompletionItem = {
          ...item,
          textEdit: {
            range,
            newText: item.insertText ?? item.label,
          },
          filterText: item.label,
        };
        acceptor(context, itemWithEdit);
      }
      return { status: 'done' };
    }

    // No string boundaries or no enum values - let default completions handle it
    for (const item of valueCompletions) {
      acceptor(context, item);
    }
    if (valueCompletions.length > 0) {
      return { status: 'done' };
    }
  }

  return { status: 'fallthrough' };
}
