/**
 * CSS completion branch for {@link EligianCompletionProvider}.
 *
 * Provides className completions and selector (class/id) completions when the
 * cursor is in a CSS context. Extracted verbatim from the provider's
 * `completionFor` (W3 decomposition).
 */

import type { CompletionAcceptor, CompletionContext } from 'langium/lsp';
import {
  CompletionContextType,
  detectCompletionContext as detectCSSCompletionContext,
} from '../css/context-detection.js';
import type { CSSCompletionProvider } from '../css/css-completion.js';
import type { EligianServices } from '../eligian-module.js';
import { isOffsetInStringLiteral } from '../utils/string-utils.js';
import type { CompletionBranchResult } from './handler-result.js';

/**
 * Handle CSS className / selector completion contexts.
 *
 * @returns `fallthrough` when not in a CSS context, `done` for className
 * completions (no super call), or `finalize-noop` for selector completions
 * (caller finalizes via `super.completionFor` with a no-op acceptor).
 */
export function handleCssCompletion(
  context: CompletionContext,
  acceptor: CompletionAcceptor,
  services: EligianServices,
  cssCompletionProvider: CSSCompletionProvider
): CompletionBranchResult {
  // Check if we're in a CSS completion context (className parameters or selectors)
  const cssContext = detectCSSCompletionContext(context);
  if (cssContext === CompletionContextType.None) {
    return { status: 'fallthrough' };
  }

  const cssRegistry = services.css.CSSRegistry;
  const documentUri = context.document.uri.toString();

  const classes = cssRegistry.getClassesForDocument(documentUri);
  const ids = cssRegistry.getIDsForDocument(documentUri);

  if (cssContext === CompletionContextType.ClassName) {
    // Check if cursor is inside quotes or between parens
    const text = context.document.textDocument.getText();
    const offset = context.offset;
    const needsQuotes = !isOffsetInStringLiteral(text, offset);

    // ALWAYS add CSS completions when in className context, regardless of next.type
    // This ensures they're added for ALL Langium completion queries
    cssCompletionProvider.provideCSSClassCompletions(context, classes, acceptor, needsQuotes);

    // ALWAYS return early for className context - don't let super process anything
    // Calling super seems to clear/filter our completions
    return { status: 'done' };
  } else if (cssContext === CompletionContextType.SelectorClass) {
    cssCompletionProvider.provideSelectorCompletions(context, classes, ids, 'class', acceptor);
    // Caller finalizes via super.completionFor with a no-op acceptor.
    return { status: 'finalize-noop' };
  } else if (cssContext === CompletionContextType.SelectorID) {
    cssCompletionProvider.provideSelectorCompletions(context, classes, ids, 'id', acceptor);
    // Caller finalizes via super.completionFor with a no-op acceptor.
    return { status: 'finalize-noop' };
  }

  return { status: 'fallthrough' };
}
