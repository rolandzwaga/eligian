import type { AstNode, CommentProvider } from 'langium';
import { describe, expect, it } from 'vitest';
import { extractJSDoc } from '../jsdoc-extractor.js';

// Mock CommentProvider for testing
function createMockCommentProvider(commentText: string | undefined): CommentProvider {
  return {
    getComment: (_node: AstNode) => commentText,
  } as CommentProvider;
}

describe('JSDoc Extractor', () => {
  describe('extract from ActionDefinition with comment', () => {
    it('should extract JSDoc from action with JSDoc comment', () => {
      const mockAction = {
        $type: 'RegularActionDefinition',
        name: 'test',
      } as AstNode;

      const commentText = `/**
         * Test action description
         * @param {string} foo First parameter
         */`;

      const commentProvider = createMockCommentProvider(commentText);
      const result = extractJSDoc(mockAction, commentProvider);

      expect(result).not.toBeNull();
      expect(result?.description).toContain('Test action description');
      expect(result?.params).toHaveLength(1);
      expect(result?.params[0].name).toBe('foo');
      expect(result?.params[0].type).toBe('string');
    });
  });

  describe('extract from ActionDefinition without comment', () => {
    it('should return null when action has no comment', () => {
      const mockAction = {
        $type: 'RegularActionDefinition',
        name: 'test',
      } as AstNode;

      const commentProvider = createMockCommentProvider(undefined);
      const result = extractJSDoc(mockAction, commentProvider);

      expect(result).toBeNull();
    });

    it('should return null when action has empty comment', () => {
      const mockAction = {
        $type: 'RegularActionDefinition',
        name: 'test',
      } as AstNode;

      const commentProvider = createMockCommentProvider('');
      const result = extractJSDoc(mockAction, commentProvider);

      expect(result).toBeNull();
    });
  });

  describe('extract with mismatched param names', () => {
    it('should return JSDoc as-is without validating param names', () => {
      // JSDoc mentions params that don't exist in action signature
      // Extractor should not validate this - that's the validator's job
      const mockAction = {
        $type: 'RegularActionDefinition',
        name: 'test',
        parameters: [{ name: 'actualParam', type: undefined }],
      } as unknown as AstNode;

      const commentText = `/**
         * @param {string} wrongParam This doesn't match actual params
         * @param {number} anotherWrong Neither does this
         */`;

      const commentProvider = createMockCommentProvider(commentText);
      const result = extractJSDoc(mockAction, commentProvider);

      // Should extract successfully without validation
      expect(result).not.toBeNull();
      expect(result?.params).toHaveLength(2);
      expect(result?.params[0].name).toBe('wrongParam');
      expect(result?.params[1].name).toBe('anotherWrong');
    });
  });
});
