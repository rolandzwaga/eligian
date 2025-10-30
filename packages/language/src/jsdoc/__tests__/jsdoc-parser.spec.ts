import { describe, expect, it } from 'vitest';
import { type JSDocComment, type JSDocParam, parseJSDoc } from '../jsdoc-parser.js';

describe('JSDoc Parser', () => {
  describe('description only (no params)', () => {
    it('should parse JSDoc with description only', () => {
      const input = `/**
       * This is a description
       */`;

      const result = parseJSDoc(input);

      expect(result).not.toBeNull();
      expect(result?.description).toBe('This is a description');
      expect(result?.params).toEqual([]);
    });
  });

  describe('@param tags with all fields', () => {
    it('should parse @param with type, name, and description', () => {
      const input = `/**
       * Action description
       * @param {string} selector CSS selector for element
       * @param {number} duration Animation duration in milliseconds
       */`;

      const result = parseJSDoc(input);

      expect(result).not.toBeNull();
      expect(result?.description).toBe('Action description');
      expect(result?.params).toHaveLength(2);
      expect(result?.params[0]).toEqual({
        type: 'string',
        name: 'selector',
        description: 'CSS selector for element',
      });
      expect(result?.params[1]).toEqual({
        type: 'number',
        name: 'duration',
        description: 'Animation duration in milliseconds',
      });
    });
  });

  describe('@param with name only (no type or description)', () => {
    it('should parse @param with just name', () => {
      const input = `/**
       * @param foo
       */`;

      const result = parseJSDoc(input);

      expect(result).not.toBeNull();
      expect(result?.params).toHaveLength(1);
      expect(result?.params[0]).toEqual({
        type: undefined,
        name: 'foo',
        description: undefined,
      });
    });
  });

  describe('multiple @param tags in order', () => {
    it('should preserve param order', () => {
      const input = `/**
       * @param first First parameter
       * @param second Second parameter
       * @param third Third parameter
       */`;

      const result = parseJSDoc(input);

      expect(result).not.toBeNull();
      expect(result?.params).toHaveLength(3);
      expect(result?.params[0].name).toBe('first');
      expect(result?.params[1].name).toBe('second');
      expect(result?.params[2].name).toBe('third');
    });
  });

  describe('malformed JSDoc (graceful degradation)', () => {
    it('should handle @param without name gracefully', () => {
      const input = `/**
       * Description
       * @param {string}
       * @param bar Valid param
       */`;

      const result = parseJSDoc(input);

      // Should either return partial result (with 'bar' param) or null
      // Graceful degradation means don't crash
      expect(() => parseJSDoc(input)).not.toThrow();

      if (result !== null) {
        // If partial parsing, should have the valid param
        const validParams = result.params.filter(p => p.name === 'bar');
        expect(validParams).toHaveLength(1);
      }
    });
  });

  describe('markdown in description', () => {
    it('should preserve markdown formatting', () => {
      const input = `/**
       * This is **bold** and *italic* and \`code\`
       *
       * Multiple lines preserved
       */`;

      const result = parseJSDoc(input);

      expect(result).not.toBeNull();
      expect(result?.description).toContain('**bold**');
      expect(result?.description).toContain('*italic*');
      expect(result?.description).toContain('`code`');
      expect(result?.description).toContain('Multiple lines');
    });
  });

  describe('whitespace and line breaks (FR-007)', () => {
    it('should preserve whitespace and line breaks in description', () => {
      const input = `/**
       * Line one
       *
       * Line three with blank line above
       *   Indented line
       */`;

      const result = parseJSDoc(input);

      expect(result).not.toBeNull();
      expect(result?.description).toContain('Line one');
      expect(result?.description).toContain('Line three');
      expect(result?.description).toContain('Indented');
    });
  });

  describe('non-documentation comment (FR-018)', () => {
    it('should return null for /* */ comment (single asterisk)', () => {
      const input = `/* This is not JSDoc */`;

      const result = parseJSDoc(input);

      // Should recognize this is not a JSDoc comment
      expect(result).toBeNull();
    });

    it('should return null for regular comment without content', () => {
      const input = `/* */`;

      const result = parseJSDoc(input);

      expect(result).toBeNull();
    });
  });
});
