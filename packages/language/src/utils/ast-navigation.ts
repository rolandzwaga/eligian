/**
 * AST Navigation Utilities
 *
 * Helper functions for navigating the Eligian AST to find nodes
 * based on cursor position and document structure.
 */

import type { LangiumDocument } from 'langium';
import type { Position } from 'vscode-languageserver-protocol';
import { type ActionDefinition, isActionDefinition } from '../generated/ast.js';

/**
 * Find an action definition on the line below the given position
 *
 * This is used for JSDoc template generation - when the user types `/**`
 * and triggers completion with `*`, we need to find the action definition
 * immediately below to generate the appropriate JSDoc template.
 *
 * @param document - The Langium document
 * @param position - The cursor position (typically on a `/**` comment line)
 * @returns The action definition below, or undefined if not found
 */
export function findActionBelow(
  document: LangiumDocument,
  position: Position
): ActionDefinition | undefined {
  const cursorOffset = document.textDocument.offsetAt(position);
  const root = document.parseResult.value;

  // Search through AST to find first action definition AFTER cursor position
  if ('statements' in root) {
    for (const statement of root.statements as any[]) {
      if (isActionDefinition(statement)) {
        // Check if this action starts after the cursor position
        const actionOffset = statement.$cstNode?.offset;
        if (actionOffset !== undefined && actionOffset > cursorOffset) {
          return statement;
        }
      }
    }
  }

  return undefined;
}
