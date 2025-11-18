/**
 * Controller Completion Module
 *
 * Provides autocomplete suggestions for addController() calls:
 * - Controller names for first parameter
 * - Label IDs for LabelController's second parameter
 *
 * Feature: 035-specialized-controller-syntax
 * User Story: US3
 */

import type { CompletionContext } from 'langium/lsp';
import type { CompletionItem } from 'vscode-languageserver';
import { CompletionItemKind } from 'vscode-languageserver';
import { CONTROLLERS } from './metadata/controllers.generated.js';

/**
 * Get controller name completions for addController() first parameter
 *
 * Returns all available Eligius controllers with descriptions.
 *
 * @param context - Langium completion context
 * @param includeQuotes - If true, wrap controller name in quotes for insertText
 * @returns Array of completion items for controller names
 */
export function getControllerNameCompletions(
  _context: CompletionContext,
  includeQuotes = false
): CompletionItem[] {
  const items: CompletionItem[] = [];

  for (const controller of CONTROLLERS) {
    // Format parameters for detail text
    const paramSummary =
      controller.parameters.length > 0
        ? controller.parameters.map(p => `${p.name}${p.required ? '' : '?'}`).join(', ')
        : 'no parameters';

    // Determine insertText based on whether we need quotes
    const insertText = includeQuotes ? `"${controller.name}"` : controller.name;

    items.push({
      label: controller.name,
      kind: CompletionItemKind.Class, // Controllers are like classes
      detail: `Controller: ${controller.name}(${paramSummary})`,
      documentation: controller.description || `Controller: ${controller.name}`,
      sortText: `0_${controller.name}`, // Sort controllers at top
      insertText: insertText,
    });
  }

  return items;
}

/**
 * Get label ID completions for LabelController second parameter
 *
 * Returns all available label IDs from the label registry for the current document.
 *
 * @param documentUri - Absolute URI of the current document
 * @param labelRegistry - Label registry service
 * @returns Array of completion items for label IDs
 */
export function getLabelIDCompletions(
  documentUri: string,
  labelRegistry: any // LabelRegistryService
): CompletionItem[] {
  const items: CompletionItem[] = [];

  // Get all label IDs available for this document
  const labelIDs = Array.from(labelRegistry.getLabelIDsForDocument(documentUri));

  if (labelIDs.length === 0) {
    // No labels imported - return empty
    return items;
  }

  for (const labelId of labelIDs) {
    // Get label metadata for documentation
    const metadata = labelRegistry.findLabelMetadata(documentUri, labelId as string);

    let documentation = `Label ID: ${labelId}`;
    if (metadata) {
      const langs = metadata.languageCodes?.join(', ') || 'unknown';
      documentation += `\n\n**Translations:** ${metadata.translationCount} (${langs})`;
    }

    items.push({
      label: labelId as string,
      kind: CompletionItemKind.Value, // Label IDs are like string values
      detail: `Label: ${labelId}`,
      documentation,
      sortText: `0_${labelId}`, // Sort labels at top
      insertText: labelId as string,
    });
  }

  return items;
}
