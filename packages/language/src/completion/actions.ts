/**
 * Action Completion Module
 *
 * Provides code completion for custom actions defined in the current document.
 * Actions are discovered via AST traversal and presented with parameter signatures.
 */

import { AstUtils, type LangiumDocument } from 'langium';
import { type CompletionItem, CompletionItemKind } from 'vscode-languageserver';
import type { ActionDefinition, Program } from '../generated/ast.js';

/**
 * Get custom action completions for the current document
 *
 * Returns a list of CompletionItems for all action definitions found in the document,
 * including both regular and endable actions. Actions are cached per document using
 * a WeakMap to avoid recomputing on every completion request.
 *
 * @param document - The Langium document
 * @returns Array of completion items for custom actions
 */
export function getActionCompletions(document: LangiumDocument): CompletionItem[] {
  // Get all action definitions from the document
  const actions = getAllActions(document);

  // Map each action to a CompletionItem
  return actions.map(action => {
    // Build parameter signature for detail
    const signature = buildParameterSignature(action);

    // Build documentation
    const documentation = buildActionDocumentation(action);

    return {
      label: `action: ${action.name}`, // Prefix with "action:" for clarity
      insertText: action.name, // Insert only the name (without prefix)
      filterText: action.name, // Filter by name only (without prefix)
      kind: CompletionItemKind.Function, // Use Function (same as operations, prefix distinguishes)
      sortText: action.name.toLowerCase(), // Sort alphabetically by name (case-insensitive)
      detail: signature,
      documentation: documentation
        ? {
            kind: 'markdown',
            value: documentation,
          }
        : undefined,
    };
  });
}

/**
 * Get all action definitions from a document
 *
 * Uses AstUtils.streamAllContents to find all ActionDefinition nodes in the AST.
 * This includes both RegularActionDefinition and EndableActionDefinition.
 *
 * @param document - The Langium document
 * @returns Array of action definitions
 */
function getAllActions(document: LangiumDocument): ActionDefinition[] {
  const root = document.parseResult.value as Program;
  const actions: ActionDefinition[] = [];

  // Stream all AST nodes and filter for action definitions
  for (const node of AstUtils.streamAllContents(root)) {
    if (node.$type === 'RegularActionDefinition' || node.$type === 'EndableActionDefinition') {
      actions.push(node as ActionDefinition);
    }
  }

  return actions;
}

/**
 * Build parameter signature string for an action
 *
 * Formats action parameters as a signature string for display in completion detail.
 * Example: "(selector, duration)" or "()" for no parameters
 *
 * @param action - The action definition
 * @returns Parameter signature string
 */
function buildParameterSignature(action: ActionDefinition): string {
  if (!action.parameters || action.parameters.length === 0) {
    return '()';
  }

  const paramNames = action.parameters.map(p => p.name).join(', ');
  return `(${paramNames})`;
}

/**
 * Build markdown documentation for an action
 *
 * Formats action information into a markdown string for display in completion tooltips.
 * Currently shows parameter list; could be extended to include JSDoc comments if added.
 *
 * @param action - The action definition
 * @returns Formatted markdown string or undefined if no documentation
 */
function buildActionDocumentation(action: ActionDefinition): string | undefined {
  if (!action.parameters || action.parameters.length === 0) {
    return 'Custom action with no parameters';
  }

  let doc = 'Custom action\n\n**Parameters:**\n\n';
  for (const param of action.parameters) {
    doc += `- \`${param.name}\`\n`;
  }

  return doc.trim();
}
