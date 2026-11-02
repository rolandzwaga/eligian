import { describe, expect, test } from 'vitest';
import type { Program, ProgramStatement } from '../../generated/ast.js';
import { FilePositionHelper } from '../../labels/file-position-helper.js';
import type { InsertionPosition } from '../../labels/types.js';

/** Build a minimal statement node that only carries a type and a CST range. */
function statement(
  $type: string,
  startLine: number,
  endLine: number,
  endCharacter: number
): ProgramStatement {
  return {
    $type,
    $cstNode: {
      range: {
        start: { line: startLine, character: 0 },
        end: { line: endLine, character: endCharacter },
      },
    },
  } as unknown as ProgramStatement;
}

/** Build a Program mock from top-level statements (the AST has `languages` + `statements`). */
function program(...statements: ProgramStatement[]): Program {
  return {
    $type: 'Program',
    $cstNode: undefined,
    languages: undefined,
    statements,
  };
}

describe('FilePositionHelper', () => {
  describe('findInsertionPosition', () => {
    test('should always return line 0 - language block is first in file', () => {
      const helper = new FilePositionHelper();
      const position: InsertionPosition = helper.findInsertionPosition(program());

      expect(position.line).toBe(0);
      expect(position.character).toBe(0);
    });

    test('should return line 0 even when imports exist', () => {
      const helper = new FilePositionHelper();
      const position = helper.findInsertionPosition(program(statement('DefaultImport', 0, 0, 30)));

      expect(position.line).toBe(0);
      expect(position.character).toBe(0);
    });

    test('should return line 0 even when constants exist', () => {
      const helper = new FilePositionHelper();
      const position = helper.findInsertionPosition(
        program(statement('VariableDeclaration', 3, 3, 25))
      );

      expect(position.line).toBe(0);
      expect(position.character).toBe(0);
    });

    test('should return line 0 even when actions exist', () => {
      const helper = new FilePositionHelper();
      const position = helper.findInsertionPosition(
        program(statement('RegularActionDefinition', 5, 8, 1))
      );

      expect(position.line).toBe(0);
      expect(position.character).toBe(0);
    });

    test('should return line 0 even when timelines exist', () => {
      const helper = new FilePositionHelper();
      const position = helper.findInsertionPosition(program(statement('Timeline', 0, 5, 1)));

      expect(position.line).toBe(0);
      expect(position.character).toBe(0);
    });

    test('should return line 0 with complex program structure', () => {
      const helper = new FilePositionHelper();
      const position = helper.findInsertionPosition(
        program(
          statement('DefaultImport', 0, 0, 30),
          statement('VariableDeclaration', 2, 2, 25),
          statement('RegularActionDefinition', 4, 7, 1),
          statement('Timeline', 9, 15, 1)
        )
      );

      expect(position.line).toBe(0);
      expect(position.character).toBe(0);
    });

    test('should return line 0 with multiple imports', () => {
      const helper = new FilePositionHelper();
      const position = helper.findInsertionPosition(
        program(
          statement('DefaultImport', 0, 0, 30),
          statement('DefaultImport', 1, 1, 35),
          statement('DefaultImport', 2, 2, 40)
        )
      );

      expect(position.line).toBe(0);
      expect(position.character).toBe(0);
    });
  });
});
