import { describe, expect, test } from 'vitest';
import { MarkdownBuilder } from '../markdown-builder.js';

describe('Markdown Builder', () => {
  describe('heading', () => {
    test('should create heading with correct level', () => {
      const result = new MarkdownBuilder().heading(1, 'Title').build();
      expect(result).toBe('# Title');
    });

    test('should support all heading levels 1-6', () => {
      expect(new MarkdownBuilder().heading(1, 'H1').build()).toBe('# H1');
      expect(new MarkdownBuilder().heading(2, 'H2').build()).toBe('## H2');
      expect(new MarkdownBuilder().heading(3, 'H3').build()).toBe('### H3');
      expect(new MarkdownBuilder().heading(4, 'H4').build()).toBe('#### H4');
      expect(new MarkdownBuilder().heading(5, 'H5').build()).toBe('##### H5');
      expect(new MarkdownBuilder().heading(6, 'H6').build()).toBe('###### H6');
    });

    test('should clamp heading level to 1-6 range', () => {
      expect(new MarkdownBuilder().heading(0, 'Min').build()).toBe('# Min');
      expect(new MarkdownBuilder().heading(7, 'Max').build()).toBe('###### Max');
      expect(new MarkdownBuilder().heading(10, 'Way over').build()).toBe('###### Way over');
    });
  });

  describe('text', () => {
    test('should add plain text line', () => {
      const result = new MarkdownBuilder().text('Hello world').build();
      expect(result).toBe('Hello world');
    });

    test('should preserve markdown formatting', () => {
      const result = new MarkdownBuilder().text('**bold** and *italic*').build();
      expect(result).toBe('**bold** and *italic*');
    });

    test('should preserve inline code', () => {
      const result = new MarkdownBuilder().text('Use `const` keyword').build();
      expect(result).toBe('Use `const` keyword');
    });
  });

  describe('blank', () => {
    test('should add blank line', () => {
      const result = new MarkdownBuilder().text('Line 1').blank().text('Line 2').build();
      expect(result).toBe('Line 1\n\nLine 2');
    });

    test('should add multiple blank lines', () => {
      const result = new MarkdownBuilder().text('A').blank().blank().text('B').build();
      expect(result).toBe('A\n\n\nB');
    });
  });

  describe('list', () => {
    test('should create unordered list', () => {
      const result = new MarkdownBuilder().list(['Item 1', 'Item 2', 'Item 3']).build();
      expect(result).toBe('- Item 1\n- Item 2\n- Item 3');
    });

    test('should create ordered list', () => {
      const result = new MarkdownBuilder().list(['First', 'Second', 'Third'], true).build();
      expect(result).toBe('1. First\n2. Second\n3. Third');
    });

    test('should handle empty list', () => {
      const result = new MarkdownBuilder().list([]).build();
      expect(result).toBe('');
    });

    test('should handle single item list', () => {
      const result = new MarkdownBuilder().list(['Only item']).build();
      expect(result).toBe('- Only item');
    });

    test('should preserve formatting in list items', () => {
      const result = new MarkdownBuilder().list(['**bold**', '`code`']).build();
      expect(result).toBe('- **bold**\n- `code`');
    });
  });

  describe('codeBlock', () => {
    test('should create code block without language', () => {
      const result = new MarkdownBuilder().codeBlock('const x = 42;').build();
      expect(result).toBe('```\nconst x = 42;\n```');
    });

    test('should create code block with language', () => {
      const result = new MarkdownBuilder().codeBlock('const x = 42;', 'typescript').build();
      expect(result).toBe('```typescript\nconst x = 42;\n```');
    });

    test('should handle multiline code', () => {
      const code = 'function example() {\n  return 42;\n}';
      const result = new MarkdownBuilder().codeBlock(code, 'javascript').build();
      expect(result).toBe('```javascript\nfunction example() {\n  return 42;\n}\n```');
    });

    test('should handle CSS code blocks', () => {
      const css = '.button {\n  color: red;\n}';
      const result = new MarkdownBuilder().codeBlock(css, 'css').build();
      expect(result).toBe('```css\n.button {\n  color: red;\n}\n```');
    });
  });

  describe('method chaining', () => {
    test('should support fluent interface', () => {
      const result = new MarkdownBuilder()
        .heading(2, 'Section')
        .blank()
        .text('Description')
        .blank()
        .list(['Item 1', 'Item 2'])
        .build();

      expect(result).toBe('## Section\n\nDescription\n\n- Item 1\n- Item 2');
    });

    test('should build complex markdown document', () => {
      const result = new MarkdownBuilder()
        .heading(1, 'Documentation')
        .blank()
        .text('Introduction paragraph')
        .blank()
        .heading(2, 'Installation')
        .blank()
        .codeBlock('npm install package', 'bash')
        .blank()
        .heading(2, 'Features')
        .blank()
        .list(['Feature 1', 'Feature 2', 'Feature 3'])
        .build();

      const expected =
        '# Documentation\n\nIntroduction paragraph\n\n## Installation\n\n```bash\nnpm install package\n```\n\n## Features\n\n- Feature 1\n- Feature 2\n- Feature 3';
      expect(result).toBe(expected);
    });
  });

  describe('edge cases', () => {
    test('should handle empty builder', () => {
      const result = new MarkdownBuilder().build();
      expect(result).toBe('');
    });

    test('should handle special characters', () => {
      const result = new MarkdownBuilder().text('< > & " \'').build();
      expect(result).toBe('< > & " \'');
    });

    test('should handle Unicode characters', () => {
      const result = new MarkdownBuilder().text('日本語 العربية 🚀').build();
      expect(result).toBe('日本語 العربية 🚀');
    });

    test('should be reusable', () => {
      const builder = new MarkdownBuilder();
      const result1 = builder.text('First').build();
      expect(result1).toBe('First');

      // After calling build(), the builder should still contain previous content
      const result2 = builder.text('Second').build();
      expect(result2).toBe('First\nSecond');
    });

    test('should handle very long content', () => {
      const longText = 'A'.repeat(10000);
      const result = new MarkdownBuilder().text(longText).build();
      expect(result).toBe(longText);
      expect(result.length).toBe(10000);
    });
  });

  describe('real-world usage patterns', () => {
    test('should replicate CSS hover markdown pattern', () => {
      const name = 'button';
      const label = 'CSS Class';
      const files = [
        { uri: 'styles.css', line: 10, rule: '.button {\n  color: blue;\n}' },
        { uri: 'theme.css', line: 25, rule: '.button {\n  padding: 10px;\n}' },
      ];

      const builder = new MarkdownBuilder();
      builder.text(`**${label}**: \`${name}\``).blank();

      for (const def of files) {
        builder.text(`Defined in: \`${def.uri}:${def.line}\``).blank();
        builder.codeBlock(def.rule, 'css').blank();
      }

      const result = builder.build();

      const expected =
        '**CSS Class**: `button`\n\nDefined in: `styles.css:10`\n\n```css\n.button {\n  color: blue;\n}\n```\n\nDefined in: `theme.css:25`\n\n```css\n.button {\n  padding: 10px;\n}\n```\n';

      expect(result).toBe(expected);
    });

    test('should replicate operation hover markdown pattern', () => {
      const result = new MarkdownBuilder()
        .heading(3, 'selectElement')
        .blank()
        .text('Selects a DOM element')
        .blank()
        .text('**Parameters:**')
        .list(['`selector`: string - CSS selector', '`options`: object - Optional settings'])
        .blank()
        .text('**Returns:**')
        .list(['`element` (HTMLElement)'])
        .build();

      const expected =
        '### selectElement\n\nSelects a DOM element\n\n**Parameters:**\n- `selector`: string - CSS selector\n- `options`: object - Optional settings\n\n**Returns:**\n- `element` (HTMLElement)';

      expect(result).toBe(expected);
    });
  });
});
