/**
 * Variable Completion Module
 *
 * Provides code completion for system scope variables (@@) in Eligian DSL.
 * Variables are filtered based on cursor context (inside loop, action, etc.)
 */

import type { CompletionContext } from 'langium/lsp';
import { type CompletionItem, CompletionItemKind } from 'vscode-languageserver';
import type { CursorContext } from './context.js';
import { getAvailableVariables } from './variable-metadata.js';

/**
 * Get variable completions for the current context
 *
 * Returns a list of CompletionItems for system scope variables (@@),
 * filtered based on cursor context (loop variables only in loops, etc.)
 *
 * @param _context - Langium completion context (unused for now)
 * @param cursorContext - Cursor context from detectContext()
 * @returns Array of completion items for variables
 */
export function getVariableCompletions(
  _context: CompletionContext,
  cursorContext: CursorContext
): CompletionItem[] {
  const completions: CompletionItem[] = [];

  // Add loop variable name (e.g., 'item' from 'for (item in items)')
  // This is an alias for @@currentItem in the current loop
  if (cursorContext.loop?.itemName) {
    const loopVarName = cursorContext.loop.itemName;
    completions.push({
      label: loopVarName,
      kind: CompletionItemKind.Variable,
      sortText: `3_${loopVarName}`, // Sort with other variables
      detail: 'any (loop variable)',
      documentation: {
        kind: 'markdown',
        value: `**${loopVarName}** (any)

Loop variable - alias for \`@@currentItem\` in this loop.

Current item being iterated in the \`for (${loopVarName} in ...)\` loop.`,
      },
    });
  }

  // Get standard system variables available in current context
  const availableVariables = getAvailableVariables(cursorContext.isInsideLoop);

  // Map each variable to a CompletionItem
  for (const variable of availableVariables) {
    // Build documentation markdown
    const documentation = `**${variable.name}** (${variable.type})

${variable.description}

**Available in:** ${variable.availableIn === 'always' ? 'all contexts' : variable.availableIn}`;

    completions.push({
      label: variable.name,
      kind: CompletionItemKind.Variable,
      sortText: `3_${variable.name}`, // Prefix '3_' ensures variables sort after actions ('2_')
      detail: variable.type,
      documentation: {
        kind: 'markdown',
        value: documentation,
      },
    });
  }

  return completions;
}
