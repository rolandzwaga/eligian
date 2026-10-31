/**
 * Block Label Detection (shared, parse-free core)
 *
 * Finds the positions of the start/end operation-block brackets (`[ … ] [ … ]`)
 * for the two endable constructs:
 *  1. EndableActionDefinition - `endable action name() [start] [end]`
 *  2. InlineEndableAction     - `at 0s..4s [start] [end]`
 *
 * This module is parse-free: `extractBlockLabels` operates on an already-parsed
 * AST (`Program`). The language server owns the canonical, incrementally-built
 * document, so the extension host asks for these positions via the
 * `eligian/blockLabels` LSP request (see {@link BLOCK_LABELS_REQUEST}) instead
 * of re-parsing the document itself.
 */

import { AstUtils, type CstNode, GrammarUtils } from 'langium';
import {
  type EndableActionDefinition,
  type InlineEndableAction,
  isEndableActionDefinition,
  isInlineEndableAction,
  type Program,
} from '../generated/ast.js';

/** A zero-based `{ line, character }` position (matches the LSP/CST shape). */
export interface BlockLabelPosition {
  line: number;
  character: number;
}

export interface BlockLabel {
  startBracketPosition: BlockLabelPosition;
  startBracketClosingPosition: BlockLabelPosition;
  endBracketPosition: BlockLabelPosition;
  endBracketClosingPosition: BlockLabelPosition;
  type: 'action' | 'timeline';
}

/** LSP request method used by the extension host to fetch block-label positions. */
export const BLOCK_LABELS_REQUEST = 'eligian/blockLabels';

/** Parameters for the {@link BLOCK_LABELS_REQUEST} request. */
export interface BlockLabelsParams {
  textDocument: { uri: string };
}

/**
 * Find all start/end block bracket positions in an already-parsed program.
 *
 * @param program - The root AST node of a parsed Eligian document
 * @returns Array of block label positions (empty if there are no endable constructs)
 */
export function extractBlockLabels(program: Program): BlockLabel[] {
  const labels: BlockLabel[] = [];

  for (const node of AstUtils.streamAllContents(program)) {
    if (isEndableActionDefinition(node)) {
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
 * Extract the positions of all '[' and ']' brackets for start and end blocks.
 *
 * Grammar structure:
 * - EndableActionDefinition: '[' startOperations ']' '[' endOperations ']'
 * - InlineEndableAction:     '[' startOperations ']' '[' endOperations ']'
 *
 * We need the positions of: [ (start), ] (start close), [ (end), ] (end close)
 */
function extractBracketPositions(node: EndableActionDefinition | InlineEndableAction): {
  start: BlockLabelPosition;
  startClose: BlockLabelPosition;
  end: BlockLabelPosition;
  endClose: BlockLabelPosition;
} | null {
  const cstNode = node.$cstNode;
  if (!cstNode) {
    return null;
  }

  // Only the node's OWN '[' / ']' keywords. Langium excludes CST subtrees that belong
  // to child AST nodes, so brackets inside array literals / nested expressions in the
  // operation lists are not returned.
  const opens = GrammarUtils.findNodesForKeyword(cstNode, '[');
  const closes = GrammarUtils.findNodesForKeyword(cstNode, ']');
  const toPos = (n: CstNode): BlockLabelPosition => ({
    line: n.range.start.line,
    character: n.range.start.character,
  });

  // Pattern: [ ... ] [ ... ] — expect exactly 2 own '[' and 2 own ']'
  if (opens.length >= 2 && closes.length >= 2) {
    return {
      start: toPos(opens[0]),
      startClose: toPos(closes[0]),
      end: toPos(opens[1]),
      endClose: toPos(closes[1]),
    };
  }

  return null;
}
