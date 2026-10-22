/**
 * Shared selector-against-CSS validation.
 *
 * Single source of truth for "parse a selector string, then report unknown
 * classes/IDs (with did-you-mean suggestions) against the imported CSS". Used by
 * both the operation-call selector check and the `navigate` selector check.
 */
import type { AstNode, ValidationAcceptor } from 'langium';
import { findSimilarClasses } from './levenshtein.js';
import { parseSelector } from './selector-parser.js';

/**
 * Validate a selector string against the available CSS classes and IDs,
 * emitting errors on `node` for invalid syntax or unknown classes/IDs.
 */
export function reportSelectorIssues(
  selectorString: string,
  node: AstNode,
  availableClasses: Set<string>,
  availableIDs: Set<string>,
  accept: ValidationAcceptor
): void {
  const { classes, ids, valid, error } = parseSelector(selectorString);

  if (!valid) {
    accept('error', `Invalid CSS selector syntax: ${error}`, {
      node,
      data: { code: 'invalid_css_selector' },
    });
    return;
  }

  for (const className of classes) {
    if (!availableClasses.has(className)) {
      const suggestions = findSimilarClasses(className, availableClasses, 2, 3);
      let message = `Unknown CSS class in selector: '${className}'.`;
      if (suggestions.length > 0) {
        message += ` Did you mean: ${suggestions.join(', ')}?`;
      }
      accept('error', message, {
        node,
        data: { code: 'unknown_css_class_in_selector' },
      });
    }
  }

  for (const idName of ids) {
    if (!availableIDs.has(idName)) {
      accept('error', `Unknown CSS ID in selector: '${idName}'.`, {
        node,
        data: { code: 'unknown_css_id_in_selector' },
      });
    }
  }
}
