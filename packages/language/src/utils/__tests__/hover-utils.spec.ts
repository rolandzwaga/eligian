import { describe, expect, test } from 'vitest';
import { MarkupKind } from 'vscode-languageserver-protocol';
import { createMarkdownHover } from '../hover-utils.js';

describe('Hover Utilities', () => {
  describe('createMarkdownHover', () => {
    test('should create Hover object with correct structure', () => {
      const markdown = 'Test content';
      const result = createMarkdownHover(markdown);

      expect(result).toHaveProperty('contents');
      expect(result.contents).toHaveProperty('kind');
      expect(result.contents).toHaveProperty('value');
    });

    test('should set MarkupKind to Markdown', () => {
      const markdown = 'Test content';
      const result = createMarkdownHover(markdown);

      expect(result.contents.kind).toBe(MarkupKind.Markdown);
      expect(result.contents.kind).toBe('markdown');
    });

    test('should preserve markdown content exactly', () => {
      const markdown = '### Heading\n\nSome **bold** text';
      const result = createMarkdownHover(markdown);

      expect(result.contents.value).toBe(markdown);
    });

    test('should handle empty string', () => {
      const result = createMarkdownHover('');

      expect(result.contents.value).toBe('');
      expect(result.contents.kind).toBe(MarkupKind.Markdown);
    });

    test('should handle multiline markdown', () => {
      const markdown = `### Action Name

Description line 1
Description line 2

**Parameters:**
- \`param1\` - Description
- \`param2\` - Description`;

      const result = createMarkdownHover(markdown);

      expect(result.contents.value).toBe(markdown);
    });

    test('should handle markdown with code blocks', () => {
      const markdown = '```typescript\nfunction example() {}\n```';
      const result = createMarkdownHover(markdown);

      expect(result.contents.value).toBe(markdown);
    });

    test('should handle markdown with special characters', () => {
      const markdown = 'Test `code` **bold** *italic* [link](url)';
      const result = createMarkdownHover(markdown);

      expect(result.contents.value).toBe(markdown);
    });

    test('should handle very long markdown content', () => {
      const markdown = 'A'.repeat(10000);
      const result = createMarkdownHover(markdown);

      expect(result.contents.value).toBe(markdown);
      expect(result.contents.value.length).toBe(10000);
    });

    test('should handle markdown with Unicode characters', () => {
      const markdown = '日本語 العربية 🚀 ✅';
      const result = createMarkdownHover(markdown);

      expect(result.contents.value).toBe(markdown);
    });

    test('should create independent Hover objects', () => {
      const markdown1 = 'First hover';
      const markdown2 = 'Second hover';

      const result1 = createMarkdownHover(markdown1);
      const result2 = createMarkdownHover(markdown2);

      expect(result1.contents.value).toBe(markdown1);
      expect(result2.contents.value).toBe(markdown2);
      expect(result1).not.toBe(result2);
    });
  });
});
