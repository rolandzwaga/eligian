/**
 * Unit tests for CSS hover provider
 *
 * T014: Test CSS hover tooltip generation with markdown formatting
 *
 * Test Coverage:
 * - Generate markdown for CSS class definitions
 * - Generate markdown for CSS ID definitions
 * - Include file location (path:line)
 * - Include CSS rule preview in code fence
 * - Handle multiple definitions (class in multiple files)
 * - Return undefined when class/ID doesn't exist
 */

import { describe, expect, it } from 'vitest';
import { MarkupKind } from 'vscode-languageserver-protocol';
import { CSSHoverProvider } from '../../css/css-hover.js';
import type { CSSClassInfo, CSSIDInfo } from '../../css/css-registry.js';

describe('CSS Hover Provider', () => {
  const provider = new CSSHoverProvider();

  describe('provideCSSClassHover', () => {
    it('should generate markdown for single CSS class definition', () => {
      const classInfo: CSSClassInfo = {
        name: 'button',
        files: [
          {
            uri: 'file:///styles.css',
            line: 10,
            rule: '.button {\n  padding: 10px;\n  background: blue;\n}',
          },
        ],
      };

      const hover = provider.provideCSSClassHover(classInfo);

      expect(hover).toBeDefined();
      expect(hover?.contents).toBeDefined();

      // Check that it's MarkupContent with Markdown
      const contents = hover!.contents;
      if (typeof contents === 'string') {
        throw new Error('Expected MarkupContent, got string');
      }
      if (!('kind' in contents)) {
        throw new Error('Expected MarkupContent');
      }

      expect(contents.kind).toBe(MarkupKind.Markdown);
      expect(contents.value).toContain('**CSS Class**: `button`');
      expect(contents.value).toContain('Defined in: `file:///styles.css:10`');
      expect(contents.value).toContain('```css');
      expect(contents.value).toContain('.button {');
      expect(contents.value).toContain('padding: 10px;');
      expect(contents.value).toContain('background: blue;');
      expect(contents.value).toContain('```');
    });

    it('should handle CSS class with multiple definitions', () => {
      const classInfo: CSSClassInfo = {
        name: 'button',
        files: [
          {
            uri: 'file:///base.css',
            line: 5,
            rule: '.button { display: block; }',
          },
          {
            uri: 'file:///theme.css',
            line: 20,
            rule: '.button { color: red; }',
          },
        ],
      };

      const hover = provider.provideCSSClassHover(classInfo);

      expect(hover).toBeDefined();
      const contents = hover!.contents as any;
      expect(contents.value).toContain('**CSS Class**: `button`');

      // Should show both definitions
      expect(contents.value).toContain('file:///base.css:5');
      expect(contents.value).toContain('file:///theme.css:20');

      // Should show both rules
      expect(contents.value).toContain('display: block;');
      expect(contents.value).toContain('color: red;');
    });

    it('should return undefined for class with no definitions', () => {
      const classInfo: CSSClassInfo = {
        name: 'nonexistent',
        files: [],
      };

      const hover = provider.provideCSSClassHover(classInfo);

      expect(hover).toBeUndefined();
    });

    it('should handle class with special characters in name', () => {
      const classInfo: CSSClassInfo = {
        name: 'btn-primary_large',
        files: [
          {
            uri: 'file:///styles.css',
            line: 15,
            rule: '.btn-primary_large { font-size: 20px; }',
          },
        ],
      };

      const hover = provider.provideCSSClassHover(classInfo);

      expect(hover).toBeDefined();
      const contents = hover!.contents as any;
      expect(contents.value).toContain('**CSS Class**: `btn-primary_large`');
      expect(contents.value).toContain('font-size: 20px;');
    });

    it('should format multi-line CSS rules properly', () => {
      const classInfo: CSSClassInfo = {
        name: 'card',
        files: [
          {
            uri: 'file:///styles.css',
            line: 25,
            rule: `.card {
  padding: 20px;
  margin: 10px;
  border: 1px solid #ccc;
  border-radius: 4px;
}`,
          },
        ],
      };

      const hover = provider.provideCSSClassHover(classInfo);

      expect(hover).toBeDefined();
      const contents = hover!.contents as any;

      // Should preserve formatting in code fence
      expect(contents.value).toContain('```css');
      expect(contents.value).toContain('padding: 20px;');
      expect(contents.value).toContain('margin: 10px;');
      expect(contents.value).toContain('border: 1px solid #ccc;');
      expect(contents.value).toContain('border-radius: 4px;');
      expect(contents.value).toContain('```');
    });
  });

  describe('provideCSSIDHover', () => {
    it('should generate markdown for CSS ID definition', () => {
      const idInfo: CSSIDInfo = {
        name: 'header',
        files: [
          {
            uri: 'file:///layout.css',
            line: 5,
            rule: '#header {\n  height: 80px;\n  background: #333;\n}',
          },
        ],
      };

      const hover = provider.provideCSSIDHover(idInfo);

      expect(hover).toBeDefined();
      const contents = hover!.contents as any;

      expect(contents.kind).toBe(MarkupKind.Markdown);
      expect(contents.value).toContain('**CSS ID**: `header`');
      expect(contents.value).toContain('Defined in: `file:///layout.css:5`');
      expect(contents.value).toContain('```css');
      expect(contents.value).toContain('#header {');
      expect(contents.value).toContain('height: 80px;');
      expect(contents.value).toContain('background: #333;');
      expect(contents.value).toContain('```');
    });

    it('should handle ID with multiple definitions', () => {
      const idInfo: CSSIDInfo = {
        name: 'main',
        files: [
          {
            uri: 'file:///base.css',
            line: 10,
            rule: '#main { width: 100%; }',
          },
          {
            uri: 'file:///responsive.css',
            line: 50,
            rule: '#main { max-width: 1200px; }',
          },
        ],
      };

      const hover = provider.provideCSSIDHover(idInfo);

      expect(hover).toBeDefined();
      const contents = hover!.contents as any;

      expect(contents.value).toContain('**CSS ID**: `main`');
      expect(contents.value).toContain('file:///base.css:10');
      expect(contents.value).toContain('file:///responsive.css:50');
      expect(contents.value).toContain('width: 100%;');
      expect(contents.value).toContain('max-width: 1200px;');
    });

    it('should return undefined for ID with no definitions', () => {
      const idInfo: CSSIDInfo = {
        name: 'nonexistent',
        files: [],
      };

      const hover = provider.provideCSSIDHover(idInfo);

      expect(hover).toBeUndefined();
    });

    it('should handle ID with hyphens in name', () => {
      const idInfo: CSSIDInfo = {
        name: 'main-header',
        files: [
          {
            uri: 'file:///styles.css',
            line: 30,
            rule: '#main-header { position: fixed; }',
          },
        ],
      };

      const hover = provider.provideCSSIDHover(idInfo);

      expect(hover).toBeDefined();
      const contents = hover!.contents as any;
      expect(contents.value).toContain('**CSS ID**: `main-header`');
      expect(contents.value).toContain('position: fixed;');
    });
  });

  describe('markdown formatting', () => {
    it('should escape markdown special characters in CSS rules', () => {
      const classInfo: CSSClassInfo = {
        name: 'test',
        files: [
          {
            uri: 'file:///styles.css',
            line: 1,
            rule: '.test { content: "*bold*"; }',
          },
        ],
      };

      const hover = provider.provideCSSClassHover(classInfo);

      expect(hover).toBeDefined();
      const contents = hover!.contents as any;

      // Content inside code fence should not be escaped (code fence handles it)
      expect(contents.value).toContain('content: "*bold*";');
    });

    it('should handle very long file paths', () => {
      const classInfo: CSSClassInfo = {
        name: 'button',
        files: [
          {
            uri: 'file:///very/long/path/to/some/nested/directory/structure/styles.css',
            line: 100,
            rule: '.button { color: blue; }',
          },
        ],
      };

      const hover = provider.provideCSSClassHover(classInfo);

      expect(hover).toBeDefined();
      const contents = hover!.contents as any;

      // Should include full path
      expect(contents.value).toContain(
        'file:///very/long/path/to/some/nested/directory/structure/styles.css:100'
      );
    });

    it('should handle line numbers > 999', () => {
      const classInfo: CSSClassInfo = {
        name: 'button',
        files: [
          {
            uri: 'file:///styles.css',
            line: 1234,
            rule: '.button { color: red; }',
          },
        ],
      };

      const hover = provider.provideCSSClassHover(classInfo);

      expect(hover).toBeDefined();
      const contents = hover!.contents as any;
      expect(contents.value).toContain('file:///styles.css:1234');
    });
  });
});
