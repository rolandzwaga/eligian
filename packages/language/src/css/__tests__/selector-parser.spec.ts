import { describe, expect, test } from 'vitest';
import { parseSelector } from '../selector-parser.js';

describe('parseSelector - Unit Tests', () => {
  describe('Single Class Selectors', () => {
    test('should parse simple class selector', () => {
      const result = parseSelector('.button');
      expect(result).toEqual({
        classes: ['button'],
        ids: [],
        valid: true,
      });
    });

    test('should parse class selector without leading dot', () => {
      // postcss-selector-parser treats this as a tag selector, not a class
      const result = parseSelector('button');
      expect(result).toEqual({
        classes: [],
        ids: [],
        valid: true,
      });
    });
  });

  describe('Multiple Class Selectors', () => {
    test('should parse multiple classes chained', () => {
      const result = parseSelector('.button.primary.large');
      expect(result).toEqual({
        classes: ['button', 'primary', 'large'],
        ids: [],
        valid: true,
      });
    });

    test('should parse classes separated by spaces (descendant combinator)', () => {
      const result = parseSelector('.parent .child');
      expect(result).toEqual({
        classes: ['parent', 'child'],
        ids: [],
        valid: true,
      });
    });

    test('should preserve order of classes', () => {
      const result = parseSelector('.z.a.m');
      expect(result.classes).toEqual(['z', 'a', 'm']);
    });

    test('should handle duplicate class names', () => {
      const result = parseSelector('.button.primary > .button');
      expect(result.classes).toEqual(['button', 'primary', 'button']);
    });
  });

  describe('ID Selectors', () => {
    test('should parse single ID selector', () => {
      const result = parseSelector('#header');
      expect(result).toEqual({
        classes: [],
        ids: ['header'],
        valid: true,
      });
    });

    test('should parse ID with class', () => {
      const result = parseSelector('#header.active');
      expect(result).toEqual({
        classes: ['active'],
        ids: ['header'],
        valid: true,
      });
    });

    test('should parse multiple IDs', () => {
      const result = parseSelector('#header #footer');
      expect(result).toEqual({
        classes: [],
        ids: ['header', 'footer'],
        valid: true,
      });
    });

    test('should parse ID and class in complex selector', () => {
      const result = parseSelector('#nav.primary > .menu.active');
      expect(result).toEqual({
        classes: ['primary', 'menu', 'active'],
        ids: ['nav'],
        valid: true,
      });
    });
  });

  describe('Combinators', () => {
    test('should parse child combinator (>)', () => {
      const result = parseSelector('.parent > .child');
      expect(result).toEqual({
        classes: ['parent', 'child'],
        ids: [],
        valid: true,
      });
    });

    test('should parse adjacent sibling combinator (+)', () => {
      const result = parseSelector('.a + .b');
      expect(result).toEqual({
        classes: ['a', 'b'],
        ids: [],
        valid: true,
      });
    });

    test('should parse general sibling combinator (~)', () => {
      const result = parseSelector('.a ~ .b');
      expect(result).toEqual({
        classes: ['a', 'b'],
        ids: [],
        valid: true,
      });
    });

    test('should parse complex combinator chain', () => {
      const result = parseSelector('.a > .b + .c ~ .d');
      expect(result).toEqual({
        classes: ['a', 'b', 'c', 'd'],
        ids: [],
        valid: true,
      });
    });
  });

  describe('Pseudo-classes', () => {
    test('should ignore :hover pseudo-class', () => {
      const result = parseSelector('.button:hover');
      expect(result).toEqual({
        classes: ['button'],
        ids: [],
        valid: true,
      });
    });

    test('should ignore :active pseudo-class', () => {
      const result = parseSelector('.link:active');
      expect(result).toEqual({
        classes: ['link'],
        ids: [],
        valid: true,
      });
    });

    test('should ignore :nth-child pseudo-class', () => {
      const result = parseSelector('.item:nth-child(2n)');
      expect(result).toEqual({
        classes: ['item'],
        ids: [],
        valid: true,
      });
    });

    test('should ignore :not() pseudo-class', () => {
      const result = parseSelector('.item:not(.disabled)');
      expect(result).toEqual({
        classes: ['item', 'disabled'],
        ids: [],
        valid: true,
      });
    });

    test('should handle multiple pseudo-classes', () => {
      const result = parseSelector('.button:hover:active:focus');
      expect(result).toEqual({
        classes: ['button'],
        ids: [],
        valid: true,
      });
    });
  });

  describe('Pseudo-elements', () => {
    test('should ignore ::before pseudo-element', () => {
      const result = parseSelector('.button::before');
      expect(result).toEqual({
        classes: ['button'],
        ids: [],
        valid: true,
      });
    });

    test('should ignore ::after pseudo-element', () => {
      const result = parseSelector('.button::after');
      expect(result).toEqual({
        classes: ['button'],
        ids: [],
        valid: true,
      });
    });

    test('should ignore ::first-line pseudo-element', () => {
      const result = parseSelector('p.intro::first-line');
      expect(result).toEqual({
        classes: ['intro'],
        ids: [],
        valid: true,
      });
    });
  });

  describe('Attribute Selectors', () => {
    test('should ignore attribute selector', () => {
      const result = parseSelector('.button[disabled]');
      expect(result).toEqual({
        classes: ['button'],
        ids: [],
        valid: true,
      });
    });

    test('should ignore attribute with value', () => {
      const result = parseSelector('.input[type="text"]');
      expect(result).toEqual({
        classes: ['input'],
        ids: [],
        valid: true,
      });
    });

    test('should ignore multiple attributes', () => {
      const result = parseSelector('.input[type="text"][required]');
      expect(result).toEqual({
        classes: ['input'],
        ids: [],
        valid: true,
      });
    });
  });

  describe('Invalid Selector Syntax', () => {
    test('should return error for unclosed attribute selector', () => {
      const result = parseSelector('.button[');
      expect(result.valid).toBe(false);
      expect(result.classes).toEqual([]);
      expect(result.ids).toEqual([]);
      expect(result.error).toBeDefined();
      expect(typeof result.error).toBe('string');
    });

    test('should return error for unclosed pseudo-class', () => {
      const result = parseSelector('.button:not(');
      expect(result.valid).toBe(false);
      expect(result.classes).toEqual([]);
      expect(result.ids).toEqual([]);
      expect(result.error).toBeDefined();
    });

    test('should handle lenient parsing of unusual combinators', () => {
      // Note: postcss-selector-parser is very permissive and parses many
      // unusual selectors successfully. We test the error cases that DO fail.
      const result = parseSelector('.a >< .b');
      // This actually parses successfully - postcss treats it as descendant
      expect(result.valid).toBe(true);
    });

    test('should return error for unclosed string in attribute', () => {
      const result = parseSelector('.input[type="text]');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Empty and Whitespace Selectors', () => {
    test('should handle empty string selector', () => {
      const result = parseSelector('');
      expect(result).toEqual({
        classes: [],
        ids: [],
        valid: true,
      });
    });

    test('should handle whitespace-only selector', () => {
      const result = parseSelector('   ');
      expect(result).toEqual({
        classes: [],
        ids: [],
        valid: true,
      });
    });

    test('should handle tab and newline whitespace', () => {
      const result = parseSelector('\t\n ');
      expect(result).toEqual({
        classes: [],
        ids: [],
        valid: true,
      });
    });
  });

  describe('Complex Real-World Selectors', () => {
    test('should parse Bootstrap-style button selector', () => {
      const result = parseSelector('.btn.btn-primary.btn-lg:hover');
      expect(result).toEqual({
        classes: ['btn', 'btn-primary', 'btn-lg'],
        ids: [],
        valid: true,
      });
    });

    test('should parse navigation menu selector', () => {
      const result = parseSelector('#nav .menu > .item.active');
      expect(result).toEqual({
        classes: ['menu', 'item', 'active'],
        ids: ['nav'],
        valid: true,
      });
    });

    test('should parse form input with attributes and pseudo-classes', () => {
      const result = parseSelector('.form-control[type="email"]:focus:valid');
      expect(result).toEqual({
        classes: ['form-control'],
        ids: [],
        valid: true,
      });
    });

    test('should parse complex grid layout selector', () => {
      const result = parseSelector('.container > .row > .col.col-md-6.offset-md-3');
      expect(result).toEqual({
        classes: ['container', 'row', 'col', 'col-md-6', 'offset-md-3'],
        ids: [],
        valid: true,
      });
    });

    test('should parse sibling selector with pseudo-classes', () => {
      const result = parseSelector('.item:first-child + .item:last-child');
      expect(result).toEqual({
        classes: ['item', 'item'],
        ids: [],
        valid: true,
      });
    });
  });

  describe('Edge Cases', () => {
    test('should handle class names with hyphens', () => {
      const result = parseSelector('.btn-primary-lg');
      expect(result).toEqual({
        classes: ['btn-primary-lg'],
        ids: [],
        valid: true,
      });
    });

    test('should handle class names with underscores', () => {
      const result = parseSelector('.btn_primary_lg');
      expect(result).toEqual({
        classes: ['btn_primary_lg'],
        ids: [],
        valid: true,
      });
    });

    test('should handle class names with numbers', () => {
      const result = parseSelector('.col-12');
      expect(result).toEqual({
        classes: ['col-12'],
        ids: [],
        valid: true,
      });
    });

    test('should handle ID names with hyphens and numbers', () => {
      const result = parseSelector('#section-1');
      expect(result).toEqual({
        classes: [],
        ids: ['section-1'],
        valid: true,
      });
    });

    test('should handle universal selector (*)', () => {
      const result = parseSelector('*.class');
      expect(result).toEqual({
        classes: ['class'],
        ids: [],
        valid: true,
      });
    });
  });
});
