/**
 * Operation Completion Module
 *
 * Provides code completion for Eligius operations inside action blocks.
 * Operations are loaded from the operation registry and presented with
 * descriptions, parameter information, and proper sorting.
 */

import type { CompletionContext } from 'langium/lsp';
import { type CompletionItem, CompletionItemKind } from 'vscode-languageserver';
import { getAllOperations } from './registry.js';

/**
 * Get operation completions for the current context
 *
 * Returns a list of CompletionItems for all available Eligius operations,
 * excluding filtered operations (those handled by DSL keywords).
 *
 * @param context - Langium completion context
 * @returns Array of completion items for operations
 */
export function getOperationCompletions(_context: CompletionContext): CompletionItem[] {
  // Load all operations from registry (already filtered and sorted)
  const operations = getAllOperations();

  // Map each operation to a CompletionItem
  return operations.map(operation => {
    // Build documentation markdown with description, parameters, and outputs
    const documentation = buildOperationDocumentation(
      operation.description,
      operation.parameters,
      operation.outputs
    );

    return {
      label: `operation: ${operation.name}`, // Prefix with "operation:" for clarity
      insertText: operation.name, // Insert only the name (without prefix)
      filterText: operation.name, // Filter by name only (without prefix)
      kind: CompletionItemKind.Function,
      sortText: operation.name.toLowerCase(), // Sort alphabetically by name (case-insensitive)
      detail: 'Eligius operation',
      documentation: {
        kind: 'markdown',
        value: documentation,
      },
    };
  });
}

/**
 * Build markdown documentation for an operation
 *
 * Formats operation description, parameters, and outputs into a rich
 * markdown string for display in completion tooltips.
 *
 * @param description - Operation description
 * @param parameters - Array of parameter metadata
 * @param outputs - Array of output variable names
 * @returns Formatted markdown string
 */
function buildOperationDocumentation(
  description: string,
  parameters: Array<{ name: string; type: string | Array<{ value: string }>; required: boolean }>,
  outputs: string[]
): string {
  let doc = `${description}\n\n`;

  // Add parameters section
  if (parameters.length > 0) {
    doc += '**Parameters:**\n\n';
    for (const param of parameters) {
      const typeStr =
        typeof param.type === 'string' ? param.type : param.type.map(t => t.value).join(' | ');
      const requiredStr = param.required ? '(required)' : '(optional)';
      doc += `- \`${param.name}\`: ${typeStr} ${requiredStr}\n`;
    }
    doc += '\n';
  }

  // Add outputs section
  if (outputs.length > 0) {
    doc += '**Outputs:**\n\n';
    for (const output of outputs) {
      doc += `- \`${output}\`\n`;
    }
    doc += '\n';
  }

  return doc.trim();
}
