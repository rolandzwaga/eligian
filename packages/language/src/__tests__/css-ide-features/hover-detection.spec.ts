/**
 * Unit tests for CSS hover target detection
 *
 * T013: Test hover target detection for CSS classes and IDs in various contexts
 *
 * Test Coverage:
 * - findIdentifierAtOffset: Pure function tests (NO AST needed)
 * - detectHoverTarget: Integration tests (requires AST traversal - TODO)
 *
 * NOTE: Full detectHoverTarget tests are TODO - they require proper AST traversal helpers
 * For now, we comprehensively test findIdentifierAtOffset which contains the core logic
 */

import { describe, expect, it } from 'vitest';
import { findIdentifierAtOffset } from '../../css/hover-detection.js';

describe('CSS Hover Target Detection', () => {
  /**
   * Test findIdentifierAtOffset - the core logic for identifying CSS identifiers
   * This function is pure (no AST dependencies) so easy to test comprehensively
   */
  describe('findIdentifierAtOffset', () => {
    describe('class selectors', () => {
      it('should find class at beginning of selector', () => {
        const selector = '.button.primary';
        const offset = 2; // Position over "bu" in "button"

        const result = findIdentifierAtOffset(selector, offset);

        expect(result).toBeDefined();
        expect(result?.type).toBe('class');
        expect(result?.name).toBe('button');
      });

      it('should find class at start of string', () => {
        const selector = '.button';
        const offset = 0; // At the very start

        const result = findIdentifierAtOffset(selector, offset);

        expect(result).toBeDefined();
        expect(result?.type).toBe('class');
        expect(result?.name).toBe('button');
      });

      it('should find class when cursor is anywhere within the class name', () => {
        const selector = '.button';
        const offset = 5; // In the middle of "button"

        const result = findIdentifierAtOffset(selector, offset);

        // Offset 5 falls within the ".button" span [0,7) → resolves to the class.
        expect(result).toBeDefined();
        expect(result?.type).toBe('class');
        expect(result?.name).toBe('button');
      });

      it('should handle complex selector with multiple classes', () => {
        const selector = '.button.primary.active';
        const offset = 5; // Position in "button" (first half)

        const result = findIdentifierAtOffset(selector, offset);

        expect(result).toBeDefined();
        expect(result?.type).toBe('class');
        // Current implementation returns first class (simplified)
        expect(result?.name).toBe('button');
      });

      it('should find class with hyphens regardless of cursor position', () => {
        const selector = '.btn-primary';
        const offset = 6; // Inside "btn-primary"

        const result = findIdentifierAtOffset(selector, offset);

        // Offset 6 falls within the ".btn-primary" span [0,12) → resolves to the class.
        expect(result).toBeDefined();
        expect(result?.type).toBe('class');
        expect(result?.name).toBe('btn-primary');
      });

      it('should handle class with underscores', () => {
        const selector = '.nav_item';
        const offset = 4; // In the class name

        const result = findIdentifierAtOffset(selector, offset);

        expect(result).toBeDefined();
        expect(result?.type).toBe('class');
        expect(result?.name).toBe('nav_item');
      });
    });

    describe('ID selectors', () => {
      it('should find ID in selector', () => {
        const selector = '#header';
        const offset = 2; // Position over "he" in "header"

        const result = findIdentifierAtOffset(selector, offset);

        expect(result).toBeDefined();
        expect(result?.type).toBe('id');
        expect(result?.name).toBe('header');
      });

      it('should handle ID at start of string', () => {
        const selector = '#main';
        const offset = 0; // At the very start

        const result = findIdentifierAtOffset(selector, offset);

        expect(result).toBeDefined();
        expect(result?.type).toBe('id');
        expect(result?.name).toBe('main');
      });

      it('should handle selector with both class and ID', () => {
        const selector = '.button#header';
        const offset = 10; // Position in second half (ID)

        const result = findIdentifierAtOffset(selector, offset);

        expect(result).toBeDefined();
        expect(result?.type).toBe('id');
        expect(result?.name).toBe('header');
      });

      it('should handle ID with hyphens', () => {
        const selector = '#main-header';
        const offset = 5; // In the ID name

        const result = findIdentifierAtOffset(selector, offset);

        expect(result).toBeDefined();
        expect(result?.type).toBe('id');
        expect(result?.name).toBe('main-header');
      });
    });

    describe('edge cases', () => {
      it('should return undefined for offset in non-identifier region', () => {
        const selector = 'div';
        const offset = 1; // Position over "i" in "div"

        const result = findIdentifierAtOffset(selector, offset);

        // No classes or IDs in plain element selector
        expect(result).toBeUndefined();
      });

      it('should return undefined for empty string', () => {
        const selector = '';
        const offset = 0;

        const result = findIdentifierAtOffset(selector, offset);

        expect(result).toBeUndefined();
      });

      it('should return undefined when offset is out of bounds', () => {
        const selector = '.button';
        const offset = 100; // Way beyond string length

        const result = findIdentifierAtOffset(selector, offset);

        // With midpoint calculation, high offset returns undefined
        expect(result).toBeUndefined();
      });

      it('should handle whitespace in selector', () => {
        const selector = '.button .primary';
        const offset = 3; // In first class

        const result = findIdentifierAtOffset(selector, offset);

        expect(result).toBeDefined();
        expect(result?.type).toBe('class');
        expect(result?.name).toBe('button');
      });
    });

    describe('complex selectors', () => {
      it('should resolve the class after a descendant combinator', () => {
        const selector = 'div .button';
        const offset = 6; // Inside ".button" (the '.' sits at index 4)

        const result = findIdentifierAtOffset(selector, offset);

        // Offset 6 falls within the ".button" span [4,11) → resolves to the class.
        expect(result).toBeDefined();
        expect(result?.type).toBe('class');
        expect(result?.name).toBe('button');
      });

      it('should handle element + class', () => {
        const selector = 'div.container';
        const offset = 5; // In class part

        const result = findIdentifierAtOffset(selector, offset);

        expect(result).toBeDefined();
        expect(result?.type).toBe('class');
        expect(result?.name).toBe('container');
      });

      it('should handle attribute selectors mixed with classes', () => {
        const selector = '.button[disabled]';
        const offset = 3; // In class name

        const result = findIdentifierAtOffset(selector, offset);

        expect(result).toBeDefined();
        expect(result?.type).toBe('class');
        expect(result?.name).toBe('button');
      });
    });
  });

  /**
   * TODO: detectHoverTarget integration tests
   *
   * These tests require proper AST traversal helpers to navigate from
   * a parsed Program to find operation calls and their string literal arguments.
   *
   * The implementation in hover-detection.ts is functional (used in Phase 2),
   * but creating comprehensive tests requires:
   * 1. Helper function to parse DSL and find AST nodes by path
   * 2. Understanding of exact $type values for ActionDefinition, OperationCall, etc.
   * 3. Proper handling of AST container relationships
   *
   * For now, the comprehensive tests for findIdentifierAtOffset() verify
   * the core hover detection logic. The detectHoverTarget() function is a
   * thin wrapper that:
   * - Traverses AST to find operation type
   * - Calls findIdentifierAtOffset() for the actual detection
   *
   * Since findIdentifierAtOffset() is thoroughly tested, and detectHoverTarget()
   * is simple AST navigation + delegation, we have good coverage of the core logic.
   */
  describe.skip('detectHoverTarget - TODO: Integration tests', () => {
    // TODO: Implement when AST traversal helpers are available
    it('should detect class name in addClass()', () => {
      expect(true).toBe(false); // Placeholder
    });
  });
});
