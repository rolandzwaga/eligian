/**
 * JSDoc Markdown Formatter Unit Tests (T023 - US3)
 *
 * Tests formatting of parsed JSDoc comments as markdown for hover tooltips.
 * These tests verify:
 * - Proper markdown structure with headers and sections
 * - Parameter formatting with types and descriptions
 * - Graceful handling of missing information
 * - Preservation of markdown in descriptions
 */

import { describe, expect, it } from 'vitest';
import { formatJSDocAsMarkdown } from '../jsdoc-formatter.js';
import type { JSDocComment } from '../jsdoc-parser.js';

describe('JSDoc Markdown Formatter (T023 - US3)', () => {
  describe('formatting description only', () => {
    it('should format JSDoc with description and action name', () => {
      const jsdoc: JSDocComment = {
        description: 'Fades in an element over time',
        params: [],
      };

      const markdown = formatJSDocAsMarkdown(jsdoc, 'fadeIn');

      expect(markdown).toContain('### fadeIn');
      expect(markdown).toContain('Fades in an element over time');
      expect(markdown).not.toContain('**Parameters:**'); // No parameters section
    });

    it('should handle empty description', () => {
      const jsdoc: JSDocComment = {
        description: '',
        params: [],
      };

      const markdown = formatJSDocAsMarkdown(jsdoc, 'test');

      expect(markdown).toContain('### test');
      // Should not have empty lines or broken formatting
      expect(markdown.trim()).not.toContain('\n\n\n'); // No triple newlines
    });

    it('should handle multiline description', () => {
      const jsdoc: JSDocComment = {
        description: 'First line of description\n\nSecond paragraph with more details',
        params: [],
      };

      const markdown = formatJSDocAsMarkdown(jsdoc, 'multiline');

      expect(markdown).toContain('First line of description');
      expect(markdown).toContain('Second paragraph with more details');
    });
  });

  describe('formatting description with parameters', () => {
    it('should format JSDoc with typed parameters', () => {
      const jsdoc: JSDocComment = {
        description: 'Animates an element',
        params: [
          { name: 'selector', type: 'string', description: 'CSS selector' },
          { name: 'duration', type: 'number', description: 'Duration in milliseconds' },
        ],
      };

      const markdown = formatJSDocAsMarkdown(jsdoc, 'animate');

      expect(markdown).toContain('### animate');
      expect(markdown).toContain('Animates an element');
      expect(markdown).toContain('**Parameters:**');
      expect(markdown).toContain('`selector` (`string`) - CSS selector');
      expect(markdown).toContain('`duration` (`number`) - Duration in milliseconds');
    });

    it('should handle parameters without descriptions', () => {
      const jsdoc: JSDocComment = {
        description: 'Test action',
        params: [
          { name: 'foo', type: 'string' },
          { name: 'bar', type: 'number' },
        ],
      };

      const markdown = formatJSDocAsMarkdown(jsdoc, 'test');

      expect(markdown).toContain('**Parameters:**');
      expect(markdown).toContain('`foo` (`string`)');
      expect(markdown).toContain('`bar` (`number`)');
      // Should NOT have dangling dashes
      expect(markdown).not.toMatch(/`foo`.*-\s*$/m);
      expect(markdown).not.toMatch(/`bar`.*-\s*$/m);
    });

    it('should handle parameters without types (show "unknown")', () => {
      const jsdoc: JSDocComment = {
        description: 'Test action',
        params: [{ name: 'untyped', description: 'A parameter without type' }],
      };

      const markdown = formatJSDocAsMarkdown(jsdoc, 'test');

      expect(markdown).toContain('`untyped` (`unknown`) - A parameter without type');
    });

    it('should handle parameters with neither type nor description', () => {
      const jsdoc: JSDocComment = {
        description: 'Test action',
        params: [{ name: 'bare' }],
      };

      const markdown = formatJSDocAsMarkdown(jsdoc, 'test');

      expect(markdown).toContain('**Parameters:**');
      expect(markdown).toContain('`bare` (`unknown`)');
      expect(markdown).not.toMatch(/`bare`.*-/);
    });
  });

  describe('markdown preservation', () => {
    it('should preserve bold formatting in description', () => {
      const jsdoc: JSDocComment = {
        description: 'This is **bold** text',
        params: [],
      };

      const markdown = formatJSDocAsMarkdown(jsdoc, 'test');

      expect(markdown).toContain('**bold**');
    });

    it('should preserve italic formatting in description', () => {
      const jsdoc: JSDocComment = {
        description: 'This is *italic* text',
        params: [],
      };

      const markdown = formatJSDocAsMarkdown(jsdoc, 'test');

      expect(markdown).toContain('*italic*');
    });

    it('should preserve code spans in description', () => {
      const jsdoc: JSDocComment = {
        description: 'Use `selectElement` for selection',
        params: [],
      };

      const markdown = formatJSDocAsMarkdown(jsdoc, 'test');

      expect(markdown).toContain('`selectElement`');
    });

    it('should preserve links in description', () => {
      const jsdoc: JSDocComment = {
        description: 'See [documentation](https://example.com) for details',
        params: [],
      };

      const markdown = formatJSDocAsMarkdown(jsdoc, 'test');

      expect(markdown).toContain('[documentation](https://example.com)');
    });

    it('should preserve markdown in parameter descriptions', () => {
      const jsdoc: JSDocComment = {
        description: 'Test',
        params: [
          {
            name: 'value',
            type: 'string',
            description: 'A **required** value with `code`',
          },
        ],
      };

      const markdown = formatJSDocAsMarkdown(jsdoc, 'test');

      expect(markdown).toContain('A **required** value with `code`');
    });
  });

  describe('edge cases', () => {
    it('should handle action with many parameters', () => {
      const params = Array.from({ length: 10 }, (_, i) => ({
        name: `param${i}`,
        type: 'string',
        description: `Description for param ${i}`,
      }));

      const jsdoc: JSDocComment = {
        description: 'Action with many parameters',
        params,
      };

      const markdown = formatJSDocAsMarkdown(jsdoc, 'manyParams');

      expect(markdown).toContain('**Parameters:**');
      for (let i = 0; i < 10; i++) {
        expect(markdown).toContain(`param${i}`);
        expect(markdown).toContain(`Description for param ${i}`);
      }
    });

    it('should handle special characters in descriptions', () => {
      const jsdoc: JSDocComment = {
        description: 'Special chars: <>&"\'',
        params: [],
      };

      const markdown = formatJSDocAsMarkdown(jsdoc, 'test');

      // Markdown should preserve special characters as-is
      expect(markdown).toContain('Special chars: <>&"\'');
    });

    it('should produce consistent output format', () => {
      const jsdoc: JSDocComment = {
        description: 'Test description',
        params: [
          { name: 'a', type: 'string', description: 'First param' },
          { name: 'b', type: 'number', description: 'Second param' },
        ],
      };

      const markdown = formatJSDocAsMarkdown(jsdoc, 'consistent');

      // Verify consistent structure
      const lines = markdown.split('\n');
      expect(lines[0]).toBe('### consistent');
      expect(lines[1]).toBe('');
      expect(lines[2]).toBe('Test description');
      expect(lines[3]).toBe('');
      expect(lines[4]).toBe('**Parameters:**');
      expect(lines[5]).toMatch(/^- `a` \(`string`\) - First param$/);
      expect(lines[6]).toMatch(/^- `b` \(`number`\) - Second param$/);
    });
  });
});
