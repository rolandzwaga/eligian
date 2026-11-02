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
  type EventActionDefinition,
  isActionDefinition,
  isEventActionDefinition,
  isLibrary,
  isProgram,
} from '../generated/ast.js';

/**
 * Find the action (regular, endable or event action) documented by a comment
 * on the line of the given position.
 *
 * Only the FIRST top-level statement that starts on or after the next line is
 * considered. If that statement is not an action (e.g. a timeline or constant),
 * `undefined` is returned so that no JSDoc template is built for an unrelated,
 * later action.
 *
 * This is used for JSDoc template generation - when the user types `/**`
 * and triggers completion with `*`, we need to find the action definition
 * immediately below to generate the appropriate JSDoc template.
 *
 * @param document - The Langium document
 * @param position - The cursor position (typically on a `/**` comment line)
 * @returns The action below, or undefined if not found
 */
export function findActionBelow(
  document: LangiumDocument,
  position: Position
): ActionDefinition | EventActionDefinition | undefined {
  // Find the start of the NEXT line after the cursor
  const nextLineStart = document.textDocument.offsetAt({
    line: position.line + 1,
    character: 0,
  });

  return findActionAtOrAfterOffset(document.parseResult.value, nextLineStart);
}

/**
 * Find the first top-level statement starting at or after `offset` and return
 * it when it is an action (regular, endable or event action).
 *
 * @param root - The root AST node (Program or Library)
 * @param offset - Document offset from which to start looking
 */
export function findActionAtOrAfterOffset(
  root: AstNode | undefined,
  offset: number
): ActionDefinition | EventActionDefinition | undefined {
  // Handle the EligianFile union entry rule (Feature 023)
  // The root can be: Program, Library, or neither (parse failed). We need to
  // extract the appropriate list of items.
  let items: AstNode[];

  if (isProgram(root)) {
    items = root.statements ?? [];
  } else if (isLibrary(root)) {
    items = root.actions ?? [];
  } else {
    // Parse failed or unexpected root type
    return undefined;
  }

  // Items are in source order: the first one starting at or after `offset` is
  // the one the comment documents.
  for (const item of items) {
    const itemOffset = item.$cstNode?.offset;
    if (itemOffset === undefined || itemOffset < offset) {
      continue;
    }
    return isActionDefinition(item) || isEventActionDefinition(item) ? item : undefined;
  }

  return undefined;
}
