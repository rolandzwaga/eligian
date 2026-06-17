/**
 * Controller / label-ID completion for {@link EligianCompletionProvider}'s
 * `getCompletion` override (Feature 035 US3).
 *
 * Langium's default `completionFor` does not provide completions inside string
 * literals, so controller-name and label-ID completions are resolved here,
 * before falling back to the default provider. Extracted verbatim from the
 * provider (W3 decomposition).
 */

import type { LangiumDocument } from 'langium';
import type { CompletionList, CompletionParams } from 'vscode-languageserver';
import type { EligianServices } from '../eligian-module.js';
import { detectContext } from './context.js';
import { getControllerNameCompletions, getLabelIDCompletions } from './controllers.js';

/**
 * Resolve controller-name / label-ID string-literal completions.
 *
 * @returns the completion list when the cursor is in a controller-name or
 * label-ID position, or `null` when the caller should fall back to the default
 * Langium completion.
 */
export function resolveStringLiteralCompletion(
  document: LangiumDocument,
  params: CompletionParams,
  services: EligianServices
): CompletionList | null {
  // Detect controller context at cursor position
  const offset = document.textDocument.offsetAt(params.position);
  const position = params.position;
  const cursorContext = detectContext(document, position);

  // If we're in controller name or label ID position, provide custom completions
  if (cursorContext.isInControllerName) {
    // Controller name completion: addController("|") or addController("Nav|")
    // Simply return all controller completions - VS Code will filter by what's typed

    // Determine if we need to include quotes in insertText
    // Check if cursor is right after opening paren (no quotes yet)
    const text = document.textDocument.getText();
    const textBeforeCursor = text.substring(0, offset);
    const includeQuotes = textBeforeCursor.trimEnd().endsWith('(');

    const controllerCompletions = getControllerNameCompletions(
      {
        document,
        textDocument: document.textDocument,
        offset,
        position,
        tokenOffset: offset,
        tokenEndOffset: offset,
        features: [],
      },
      includeQuotes
    );

    return { items: controllerCompletions, isIncomplete: false };
  } else if (
    cursorContext.controllerName === 'LabelController' &&
    cursorContext.controllerParameterIndex === 1
  ) {
    // Label ID completion: addController("LabelController", "|")
    const documentUri = document.uri.toString();
    const labelRegistry = services.labels.LabelRegistry;
    const labelCompletions = getLabelIDCompletions(documentUri, labelRegistry);

    return { items: labelCompletions, isIncomplete: false };
  }

  // Otherwise, fallback to default Langium completion
  return null;
}
