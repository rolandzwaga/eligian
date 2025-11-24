import type { Program } from '../generated/ast.js';
import type { InsertionPosition } from './types.js';

/**
 * Determines the insertion position for a language block in an Eligian program.
 *
 * The language block is ALWAYS the first construct in an Eligian file (line 0).
 * This is the canonical position per the Eligian language specification.
 */
export class FilePositionHelper {
  /**
   * Finds the optimal insertion position for a language block.
   *
   * @param program - Parsed Eligian program AST
   * @returns InsertionPosition with line and character offsets
   *
   * @remarks
   * - Language block is ALWAYS inserted at the top of the file (line 0)
   * - This is the first construct in any Eligian program
   * - Character offset is always 0 (start of line)
   */
  findInsertionPosition(_program: Program): InsertionPosition {
    // Language block is always at the top of the file
    return {
      line: 0,
      character: 0,
    };
  }
}
