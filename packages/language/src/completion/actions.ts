/**
 * Action Completion Module
 *
 * Provides code completion for custom actions defined in the current document.
 * Actions are discovered via AST traversal and presented with parameter signatures.
 */

import { type AstNode, AstUtils, type LangiumDocument } from 'langium';
import { type CompletionItem, CompletionItemKind } from 'vscode-languageserver';
import type { ActionDefinition, Program } from '../generated/ast.js';
import type { CallableAction } from '../utils/action-scope.js';

/**
 * Source of the actions callable from a document (its own plus imported ones).
 *
 * Implemented by {@link EligianScopeProvider}; kept structural so this module
 * does not depend on the scope provider class.
 */
export interface CallableActionSource {
  getCallableActions(node: AstNode): readonly CallableAction[];
}

/**
 * Get custom action completions for the current document
 *
 * Returns a list of CompletionItems for all action definitions found in the document,
 * including both regular and endable actions. When a `callableActions` source is given,
 * the actions imported from libraries (`import { fadeIn } from "./lib.eligian"`) are
 * included too, under the name they are called by (their alias, when aliased).
 *
 * @param document - The Langium document
 * @param callableActions - Resolves the actions callable from the document, including imports
 * @returns Array of completion items for custom actions
 */
export function getActionCompletions(
  document: LangiumDocument,
  callableActions?: CallableActionSource
): CompletionItem[] {
  // Local actions (declared in this document)
  const items = getAllActions(document).map(action => toCompletionItem(action.name, action, false));

  // Imported actions: an own action shadows an import of the same name
  if (callableActions) {
    const seen = new Set(items.map(item => item.insertText));
    const root = document.parseResult.value;
    for (const callable of callableActions.getCallableActions(root)) {
      if (callable.imported && !seen.has(callable.name)) {
        seen.add(callable.name);
        items.push(toCompletionItem(callable.name, callable.action, true));
      }
    }
  }

  return items;
}

function toCompletionItem(
  name: string,
  action: ActionDefinition,
  imported: boolean
): CompletionItem {
  // Build parameter signature for detail
  const signature = buildParameterSignature(action);

  // Build documentation
  const documentation = buildActionDocumentation(action, imported);

  return {
    label: `${name} (action)`, // Suffix with "(action)" for clarity
    insertText: name, // Insert only the name (without suffix)
    filterText: name, // Filter by name only (without suffix)
    kind: CompletionItemKind.Function, // Use Function (same as operations, suffix distinguishes)
    sortText: name.toLowerCase(), // Sort alphabetically by name (case-insensitive)
    detail: imported ? `${signature} - imported action` : signature,
    documentation: documentation
      ? {
          kind: 'markdown',
          value: documentation,
        }
      : undefined,
  };
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
function buildActionDocumentation(action: ActionDefinition, imported = false): string | undefined {
  const kind = imported ? 'Imported action' : 'Custom action';
  if (!action.parameters || action.parameters.length === 0) {
    return `${kind} with no parameters`;
  }

  let doc = `${kind}\n\n**Parameters:**\n\n`;
  for (const param of action.parameters) {
    doc += `- \`${param.name}\`\n`;
  }

  return doc.trim();
}
