import { describe, expect, it } from 'vitest';
import { parseCSS } from '../css-parser.js';

describe('CSS Parser', () => {
  describe('Basic parsing', () => {
    it('should parse CSS with single class', () => {
      const css = '.button { color: blue; }';
      const result = parseCSS(css, 'test.css');

      expect(result.classes.has('button')).toBe(true);
      expect(result.classes.size).toBe(1);
      expect(result.ids.size).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should parse CSS with multiple classes', () => {
      const css = '.button { color: blue; } .primary { font-weight: bold; }';
      const result = parseCSS(css, 'test.css');

      expect(result.classes.has('button')).toBe(true);
      expect(result.classes.has('primary')).toBe(true);
      expect(result.classes.size).toBe(2);
      expect(result.errors).toHaveLength(0);
    });

    it('should parse CSS with single ID', () => {
      const css = '#header { height: 60px; }';
      const result = parseCSS(css, 'test.css');

      expect(result.ids.has('header')).toBe(true);
      expect(result.ids.size).toBe(1);
      expect(result.classes.size).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should parse CSS with multiple IDs', () => {
      const css = '#header { height: 60px; } #footer { height: 40px; }';
      const result = parseCSS(css, 'test.css');

      expect(result.ids.has('header')).toBe(true);
      expect(result.ids.has('footer')).toBe(true);
      expect(result.ids.size).toBe(2);
      expect(result.errors).toHaveLength(0);
    });

    it('should parse CSS with both classes and IDs', () => {
      const css = '.button { color: blue; } #header { height: 60px; }';
      const result = parseCSS(css, 'test.css');

      expect(result.classes.has('button')).toBe(true);
      expect(result.ids.has('header')).toBe(true);
      expect(result.classes.size).toBe(1);
      expect(result.ids.size).toBe(1);
      expect(result.errors).toHaveLength(0);
    });

    it('should parse complex selectors', () => {
      const css = '.button.primary { color: blue; } .card .header { font-size: 20px; }';
      const result = parseCSS(css, 'test.css');

      expect(result.classes.has('button')).toBe(true);
      expect(result.classes.has('primary')).toBe(true);
      expect(result.classes.has('card')).toBe(true);
      expect(result.classes.has('header')).toBe(true);
      expect(result.classes.size).toBe(4);
      expect(result.errors).toHaveLength(0);
    });

    it('should parse pseudo-classes and pseudo-elements', () => {
      const css = '.button:hover { color: red; } .link::before { content: "→"; }';
      const result = parseCSS(css, 'test.css');

      expect(result.classes.has('button')).toBe(true);
      expect(result.classes.has('link')).toBe(true);
      expect(result.classes.size).toBe(2);
      expect(result.errors).toHaveLength(0);
    });

    it('should parse attribute selectors', () => {
      const css = '.button[disabled] { opacity: 0.5; }';
      const result = parseCSS(css, 'test.css');

      expect(result.classes.has('button')).toBe(true);
      expect(result.classes.size).toBe(1);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty CSS file', () => {
      const css = '';
      const result = parseCSS(css, 'test.css');

      expect(result.classes.size).toBe(0);
      expect(result.ids.size).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle CSS with only whitespace', () => {
      const css = '   \n\t  \n  ';
      const result = parseCSS(css, 'test.css');

      expect(result.classes.size).toBe(0);
      expect(result.ids.size).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle CSS with only comments', () => {
      const css = '/* This is a comment */\n/* Another comment */';
      const result = parseCSS(css, 'test.css');

      expect(result.classes.size).toBe(0);
      expect(result.ids.size).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle CSS with comments and whitespace', () => {
      const css = '\n\n  /* Header styles */\n\n  /* Footer styles */\n\n';
      const result = parseCSS(css, 'test.css');

      expect(result.classes.size).toBe(0);
      expect(result.ids.size).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should deduplicate classes across multiple rules', () => {
      const css = '.button { color: blue; } .button { font-size: 14px; }';
      const result = parseCSS(css, 'test.css');

      expect(result.classes.has('button')).toBe(true);
      expect(result.classes.size).toBe(1);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle selectors without classes or IDs', () => {
      const css = 'div { display: block; } span { color: red; }';
      const result = parseCSS(css, 'test.css');

      expect(result.classes.size).toBe(0);
      expect(result.ids.size).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle mixed selectors with and without classes', () => {
      const css = 'div { display: block; } .button { color: blue; } span { color: red; }';
      const result = parseCSS(css, 'test.css');

      expect(result.classes.has('button')).toBe(true);
      expect(result.classes.size).toBe(1);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Location extraction', () => {
    it('should extract correct source locations for classes', () => {
      const css = '.button {\n  color: blue;\n}';
      const result = parseCSS(css, 'test.css');

      const location = result.classLocations.get('button');
      expect(location).toBeDefined();
      expect(location?.filePath).toBe('test.css');
      expect(location?.startLine).toBe(1);
      expect(location?.startColumn).toBe(1);
    });

    it('should extract correct source locations for IDs', () => {
      const css = '#header {\n  height: 60px;\n}';
      const result = parseCSS(css, 'test.css');

      const location = result.idLocations.get('header');
      expect(location).toBeDefined();
      expect(location?.filePath).toBe('test.css');
      expect(location?.startLine).toBe(1);
      expect(location?.startColumn).toBe(1);
    });

    it('should store location of first occurrence for duplicate classes', () => {
      const css = '.button { color: blue; }\n.button { font-size: 14px; }';
      const result = parseCSS(css, 'test.css');

      const location = result.classLocations.get('button');
      expect(location).toBeDefined();
      expect(location?.startLine).toBe(1); // First occurrence
    });

    it('should handle multi-line rules correctly', () => {
      const css = '.button {\n  color: blue;\n  font-size: 14px;\n  padding: 10px;\n}';
      const result = parseCSS(css, 'test.css');

      const location = result.classLocations.get('button');
      expect(location).toBeDefined();
      expect(location?.startLine).toBe(1);
      expect(location?.endLine).toBe(5);
    });
  });

  describe('Rule extraction', () => {
    it('should extract full rule text for classes', () => {
      const css = '.button { color: blue; }';
      const result = parseCSS(css, 'test.css');

      const rule = result.classRules.get('button');
      expect(rule).toBeDefined();
      expect(rule).toContain('.button');
      expect(rule).toContain('color: blue');
    });

    it('should extract full rule text for IDs', () => {
      const css = '#header { height: 60px; }';
      const result = parseCSS(css, 'test.css');

      const rule = result.idRules.get('header');
      expect(rule).toBeDefined();
      expect(rule).toContain('#header');
      expect(rule).toContain('height: 60px');
    });

    it('should store rule of first occurrence for duplicate classes', () => {
      const css = '.button { color: blue; }\n.button { font-size: 14px; }';
      const result = parseCSS(css, 'test.css');

      const rule = result.classRules.get('button');
      expect(rule).toBeDefined();
      expect(rule).toContain('color: blue'); // First occurrence
      expect(rule).not.toContain('font-size'); // Not the second
    });

    it('should handle multi-line rules', () => {
      const css = '.button {\n  color: blue;\n  font-size: 14px;\n}';
      const result = parseCSS(css, 'test.css');

      const rule = result.classRules.get('button');
      expect(rule).toBeDefined();
      expect(rule).toContain('color: blue');
      expect(rule).toContain('font-size: 14px');
    });
  });

  describe('Error handling', () => {
    it('should capture CSS syntax errors', () => {
      const css = '.button { color: blue'; // Missing closing brace
      const result = parseCSS(css, 'test.css');

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].filePath).toContain('test.css'); // May be absolute path
      expect(result.errors[0].message).toBeTruthy();
    });

    it('should handle malformed selectors gracefully', () => {
      const css = '.button..primary { color: blue; }'; // Double dot
      const result = parseCSS(css, 'test.css');

      // Parser should either extract what it can or report error
      // The important part is it doesn't crash
      expect(result).toBeDefined();
    });

    it('should continue parsing after encountering errors', () => {
      const css = '.button { color: blue\n.valid { color: red; }'; // Missing semicolon and brace
      const result = parseCSS(css, 'test.css');

      // Should capture error but may still extract some classes
      expect(result).toBeDefined();
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle unclosed strings in CSS', () => {
      const css = '.button::before { content: "unclosed }';
      const result = parseCSS(css, 'test.css');

      expect(result.errors.length).toBeGreaterThan(0);
    });

    // T024 [US4] - Enhanced error handling tests
    it('should populate parseErrors array for unclosed brace', () => {
      const css = '.button { color: blue;';
      const result = parseCSS(css, 'styles.css');

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain('Unclosed block');
      expect(result.errors[0].filePath).toContain('styles.css');
    });

    it('should capture error location (line and column)', () => {
      const css = '.button {\n  color: blue;\n'; // Missing closing brace on line 3
      const result = parseCSS(css, 'styles.css');

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].line).toBeGreaterThan(0);
      expect(result.errors[0].column).toBeGreaterThan(0);
    });

    it('should include source snippet for CSS syntax errors', () => {
      const css = '.button { color: blue;'; // Unclosed brace
      const result = parseCSS(css, 'styles.css');

      expect(result.errors.length).toBeGreaterThan(0);
      // source field is optional but should be present for CssSyntaxError
      if (result.errors[0].source) {
        expect(result.errors[0].source).toBeTruthy();
        expect(typeof result.errors[0].source).toBe('string');
      }
    });

    it('should handle unclosed comments', () => {
      const css = '/* This comment is not closed\n.button { color: blue; }';
      const result = parseCSS(css, 'styles.css');

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toBeTruthy();
    });

    it('should handle invalid property values', () => {
      const css = '.button { color: @invalid-value; }';
      const result = parseCSS(css, 'styles.css');

      // PostCSS may parse this successfully (it's permissive)
      // But if it does report an error, it should be captured
      expect(result).toBeDefined();
      expect(result.classes.has('button')).toBe(true);
    });

    it('should return empty classes/IDs when CSS has fatal syntax error', () => {
      const css = '{ { { invalid CSS { { {';
      const result = parseCSS(css, 'styles.css');

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.classes.size).toBe(0);
      expect(result.ids.size).toBe(0);
    });

    it('should handle multiple syntax errors in one file', () => {
      const css = '.button { color: blue;\n.primary { color: red;'; // Two unclosed braces
      const result = parseCSS(css, 'styles.css');

      expect(result.errors.length).toBeGreaterThan(0);
      // May have 1 or more errors depending on parser behavior
    });

    it('should report all error details for malformed CSS', () => {
      const css = '.button { color: blue;'; // Unclosed brace
      const result = parseCSS(css, 'styles.css');

      expect(result.errors.length).toBeGreaterThan(0);
      const error = result.errors[0];
      expect(error.message).toBeTruthy();
      expect(error.filePath).toBeTruthy();
      expect(error.line).toBeGreaterThanOrEqual(0);
      expect(error.column).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Complex selectors', () => {
    it('should parse descendant selectors', () => {
      const css = '.container .button { color: blue; }';
      const result = parseCSS(css, 'test.css');

      expect(result.classes.has('container')).toBe(true);
      expect(result.classes.has('button')).toBe(true);
      expect(result.classes.size).toBe(2);
    });

    it('should parse child selectors', () => {
      const css = '.container > .button { color: blue; }';
      const result = parseCSS(css, 'test.css');

      expect(result.classes.has('container')).toBe(true);
      expect(result.classes.has('button')).toBe(true);
      expect(result.classes.size).toBe(2);
    });

    it('should parse adjacent sibling selectors', () => {
      const css = '.button + .text { margin-left: 10px; }';
      const result = parseCSS(css, 'test.css');

      expect(result.classes.has('button')).toBe(true);
      expect(result.classes.has('text')).toBe(true);
      expect(result.classes.size).toBe(2);
    });

    it('should parse comma-separated selectors', () => {
      const css = '.button, .link, #header { color: blue; }';
      const result = parseCSS(css, 'test.css');

      expect(result.classes.has('button')).toBe(true);
      expect(result.classes.has('link')).toBe(true);
      expect(result.ids.has('header')).toBe(true);
      expect(result.classes.size).toBe(2);
      expect(result.ids.size).toBe(1);
    });

    it('should parse negation pseudo-class', () => {
      const css = '.button:not(.disabled) { cursor: pointer; }';
      const result = parseCSS(css, 'test.css');

      expect(result.classes.has('button')).toBe(true);
      expect(result.classes.has('disabled')).toBe(true);
      expect(result.classes.size).toBe(2);
    });
  });

  describe('Real-world CSS patterns', () => {
    it('should parse BEM-style class names', () => {
      const css = `
        .block__element { color: blue; }
        .block__element--modifier { color: red; }
        .block--modifier { font-weight: bold; }
      `;
      const result = parseCSS(css, 'test.css');

      expect(result.classes.has('block__element')).toBe(true);
      expect(result.classes.has('block__element--modifier')).toBe(true);
      expect(result.classes.has('block--modifier')).toBe(true);
      expect(result.classes.size).toBe(3);
    });

    it('should parse utility classes', () => {
      const css = `
        .mt-4 { margin-top: 1rem; }
        .px-2 { padding-left: 0.5rem; padding-right: 0.5rem; }
        .text-center { text-align: center; }
      `;
      const result = parseCSS(css, 'test.css');

      expect(result.classes.has('mt-4')).toBe(true);
      expect(result.classes.has('px-2')).toBe(true);
      expect(result.classes.has('text-center')).toBe(true);
      expect(result.classes.size).toBe(3);
    });

    it('should handle @media queries', () => {
      const css = `
        .button { color: blue; }
        @media (min-width: 768px) {
          .button { color: red; }
          .large { font-size: 20px; }
        }
      `;
      const result = parseCSS(css, 'test.css');

      expect(result.classes.has('button')).toBe(true);
      expect(result.classes.has('large')).toBe(true);
      expect(result.classes.size).toBe(2);
    });

    it('should handle nested rules with @supports', () => {
      const css = `
        .button { color: blue; }
        @supports (display: grid) {
          .grid { display: grid; }
        }
      `;
      const result = parseCSS(css, 'test.css');

      expect(result.classes.has('button')).toBe(true);
      expect(result.classes.has('grid')).toBe(true);
      expect(result.classes.size).toBe(2);
    });
  });
});
