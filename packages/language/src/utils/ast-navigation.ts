/**
 * AST Navigation Utilities
 *
 * Helper functions for navigating the Eligian AST to find nodes
 * based on cursor position and document structure.
 */

import type { AstNode, LangiumDocument } from 'langium';
import type { Position } from 'vscode-languageserver-protocol';
import {
  type ActionDefinition,
  isActionDefinition,
  isLibrary,
  isProgram,
} from '../generated/ast.js';

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
  // Find the start of the NEXT line after the cursor
  const nextLineStart = document.textDocument.offsetAt({
    line: position.line + 1,
    character: 0,
  });

  const root = document.parseResult.value;

  // Handle the EligianFile union entry rule (Feature 023)
  // The root can be: Program, Library, or neither (parse failed). We need to
  // extract the appropriate list of items.
  let items: AstNode[];

  if (isProgram(root)) {
    // Program has statements (which can include ActionDefinitions)
    items = root.statements;
  } else if (isLibrary(root)) {
    // Library has actions (which are ActionDefinitions)
    items = root.actions;
  } else {
    // Parse failed or unexpected root type
    return undefined;
  }

  // Search through items to find first action definition on or after the next line
  for (const item of items) {
    // For Program, statements can be ActionDefinition or other types
    // For Library, actions are always ActionDefinitions
    if (isActionDefinition(item)) {
      // Check if this action starts on or after the next line
      const actionOffset = item.$cstNode?.offset;
      if (actionOffset !== undefined && actionOffset >= nextLineStart) {
        return item;
      }
    }
  }

  return undefined;
}
