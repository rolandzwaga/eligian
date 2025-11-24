import { describe, expect, test } from 'vitest';
import type { Program } from '../../generated/ast.js';
import { FilePositionHelper } from '../../labels/file-position-helper.js';
import type { InsertionPosition } from '../../labels/types.js';

describe('FilePositionHelper', () => {
  describe('findInsertionPosition', () => {
    test('should always return line 0 - language block is first in file', () => {
      const mockProgram: Program = {
        $type: 'Program',
        $cstNode: undefined,
        imports: [],
        constants: [],
        actions: [],
        timelines: [],
        languagesBlock: undefined,
      };

      const helper = new FilePositionHelper();
      const position: InsertionPosition = helper.findInsertionPosition(mockProgram);

      expect(position.line).toBe(0);
      expect(position.character).toBe(0);
    });

    test('should return line 0 even when imports exist', () => {
      const mockProgram: Program = {
        $type: 'Program',
        $cstNode: undefined,
        imports: [
          {
            $type: 'Import',
            $cstNode: {
              range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 30 },
              },
            },
          } as any,
        ],
        constants: [],
        actions: [],
        timelines: [],
        languagesBlock: undefined,
      };

      const helper = new FilePositionHelper();
      const position = helper.findInsertionPosition(mockProgram);

      expect(position.line).toBe(0);
      expect(position.character).toBe(0);
    });

    test('should return line 0 even when constants exist', () => {
      const mockProgram: Program = {
        $type: 'Program',
        $cstNode: undefined,
        imports: [],
        constants: [
          {
            $type: 'ConstantDeclaration',
            $cstNode: {
              range: {
                start: { line: 3, character: 0 },
                end: { line: 3, character: 25 },
              },
            },
          } as any,
        ],
        actions: [],
        timelines: [],
        languagesBlock: undefined,
      };

      const helper = new FilePositionHelper();
      const position = helper.findInsertionPosition(mockProgram);

      expect(position.line).toBe(0);
      expect(position.character).toBe(0);
    });

    test('should return line 0 even when actions exist', () => {
      const mockProgram: Program = {
        $type: 'Program',
        $cstNode: undefined,
        imports: [],
        constants: [],
        actions: [
          {
            $type: 'ActionDefinition',
            $cstNode: {
              range: {
                start: { line: 5, character: 0 },
                end: { line: 8, character: 1 },
              },
            },
          } as any,
        ],
        timelines: [],
        languagesBlock: undefined,
      };

      const helper = new FilePositionHelper();
      const position = helper.findInsertionPosition(mockProgram);

      expect(position.line).toBe(0);
      expect(position.character).toBe(0);
    });

    test('should return line 0 even when timelines exist', () => {
      const mockProgram: Program = {
        $type: 'Program',
        $cstNode: undefined,
        imports: [],
        constants: [],
        actions: [],
        timelines: [
          {
            $type: 'Timeline',
            $cstNode: {
              range: {
                start: { line: 0, character: 0 },
                end: { line: 5, character: 1 },
              },
            },
          } as any,
        ],
        languagesBlock: undefined,
      };

      const helper = new FilePositionHelper();
      const position = helper.findInsertionPosition(mockProgram);

      expect(position.line).toBe(0);
      expect(position.character).toBe(0);
    });

    test('should return line 0 with complex program structure', () => {
      const mockProgram: Program = {
        $type: 'Program',
        $cstNode: undefined,
        imports: [
          {
            $type: 'Import',
            $cstNode: {
              range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 30 },
              },
            },
          } as any,
        ],
        constants: [
          {
            $type: 'ConstantDeclaration',
            $cstNode: {
              range: {
                start: { line: 2, character: 0 },
                end: { line: 2, character: 25 },
              },
            },
          } as any,
        ],
        actions: [
          {
            $type: 'ActionDefinition',
            $cstNode: {
              range: {
                start: { line: 4, character: 0 },
                end: { line: 7, character: 1 },
              },
            },
          } as any,
        ],
        timelines: [
          {
            $type: 'Timeline',
            $cstNode: {
              range: {
                start: { line: 9, character: 0 },
                end: { line: 15, character: 1 },
              },
            },
          } as any,
        ],
        languagesBlock: undefined,
      };

      const helper = new FilePositionHelper();
      const position = helper.findInsertionPosition(mockProgram);

      expect(position.line).toBe(0);
      expect(position.character).toBe(0);
    });

    test('should return line 0 with multiple imports', () => {
      const mockProgram: Program = {
        $type: 'Program',
        $cstNode: undefined,
        imports: [
          {
            $type: 'Import',
            $cstNode: {
              range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 30 },
              },
            },
          } as any,
          {
            $type: 'Import',
            $cstNode: {
              range: {
                start: { line: 1, character: 0 },
                end: { line: 1, character: 35 },
              },
            },
          } as any,
          {
            $type: 'Import',
            $cstNode: {
              range: {
                start: { line: 2, character: 0 },
                end: { line: 2, character: 40 },
              },
            },
          } as any,
        ],
        constants: [],
        actions: [],
        timelines: [],
        languagesBlock: undefined,
      };

      const helper = new FilePositionHelper();
      const position = helper.findInsertionPosition(mockProgram);

      expect(position.line).toBe(0);
      expect(position.character).toBe(0);
    });
  });
});
