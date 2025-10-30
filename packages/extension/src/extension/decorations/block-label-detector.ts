/**
 * Block Label Detector
 *
 * Finds positions of '[' brackets for start/end operation blocks in:
 * 1. EndableActionDefinition - endable action name() [start] [end]
 * 2. InlineEndableAction - at 0s..4s [start] [end]
 */

import {
  createEligianServices,
  type EligianServices,
  type EndableActionDefinition,
  type InlineEndableAction,
  isEndableActionDefinition,
  isInlineEndableAction,
  type Program,
} from '@eligian/language';
import { AstUtils, CstUtils, EmptyFileSystem } from 'langium';
import { parseDocument } from 'langium/test';
import type { Position, TextDocument } from 'vscode-languageserver-protocol';

export interface BlockLabel {
  startBracketPosition: Position;
  startBracketClosingPosition: Position;
  endBracketPosition: Position;
  endBracketClosingPosition: Position;
  type: 'action' | 'timeline';
}

// Create Langium services for parsing (singleton)
let services: EligianServices | null = null;

function getServices(): EligianServices {
  if (!services) {
    services = createEligianServices(EmptyFileSystem).Eligian;
  }
  return services;
}

/**
 * Find all start/end block bracket positions in a document
 *
 * @param document - TextDocument to analyze
 * @returns Array of block label positions
 */
export async function findBlockLabels(document: TextDocument): Promise<BlockLabel[]> {
  const labels: BlockLabel[] = [];

  // Parse document to get AST
  const parsedDoc = await parseDocument(getServices(), document.getText());
  const program = parsedDoc.parseResult.value as Program;

  // Walk AST to find all EndableActionDefinition and InlineEndableAction nodes
  for (const node of AstUtils.streamAllContents(program)) {
    if (isEndableActionDefinition(node)) {
      // Extract bracket positions for endable actions
      const bracketPositions = extractBracketPositions(node);
      if (bracketPositions) {
        labels.push({
          startBracketPosition: bracketPositions.start,
          startBracketClosingPosition: bracketPositions.startClose,
          endBracketPosition: bracketPositions.end,
          endBracketClosingPosition: bracketPositions.endClose,
          type: 'action',
        });
      }
    } else if (isInlineEndableAction(node)) {
      // Extract bracket positions for timeline blocks
      const bracketPositions = extractBracketPositions(node);
      if (bracketPositions) {
        labels.push({
          startBracketPosition: bracketPositions.start,
          startBracketClosingPosition: bracketPositions.startClose,
          endBracketPosition: bracketPositions.end,
          endBracketClosingPosition: bracketPositions.endClose,
          type: 'timeline',
        });
      }
    }
  }

  return labels;
}

/**
 * Extract the positions of all '[' and ']' brackets for start and end blocks
 *
 * Grammar structure:
 * - EndableActionDefinition: '[' startOperations ']' '[' endOperations ']'
 * - InlineEndableAction: '[' startOperations ']' '[' endOperations ']'
 *
 * We need the positions of: [ (start), ] (start close), [ (end), ] (end close)
 */
function extractBracketPositions(node: EndableActionDefinition | InlineEndableAction): {
  start: Position;
  startClose: Position;
  end: Position;
  endClose: Position;
} | null {
  const cstNode = node.$cstNode;
  if (!cstNode) {
    return null;
  }

  // Find all bracket tokens in the CST by checking text content
  const allBrackets: { text: string; pos: Position }[] = [];

  for (const child of CstUtils.streamCst(cstNode)) {
    // Only look at leaf nodes (no children)
    if ('content' in child && Array.isArray(child.content)) {
      // This is a composite node, skip it
      continue;
    }

    // Check if this is a bracket token
    if (child.text === '[' || child.text === ']') {
      const pos: Position = {
        line: child.range.start.line,
        character: child.range.start.character,
      };
      allBrackets.push({ text: child.text, pos });
    }
  }

  // Pattern: [ ... ] [ ... ]
  // We expect exactly 4 brackets in order: [, ], [, ]
  if (allBrackets.length >= 4) {
    return {
      start: allBrackets[0].pos, // First '['
      startClose: allBrackets[1].pos, // First ']'
      end: allBrackets[2].pos, // Second '['
      endClose: allBrackets[3].pos, // Second ']'
    };
  }

  return null;
}
