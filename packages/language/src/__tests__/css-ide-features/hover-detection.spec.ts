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

import { CstUtils } from 'langium';
import { beforeAll, describe, expect, it } from 'vitest';
import { detectHoverTarget, findIdentifierAtOffset } from '../../css/hover-detection.js';
import { createTestContext, type TestContext } from '../test-helpers.js';

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
   * detectHoverTarget integration tests
   *
   * These exercise the full path: parse real DSL, locate the CST leaf node at a
   * cursor offset (exactly as the hover provider does), and resolve the CSS
   * identifier under the cursor. This covers className operations, selector
   * operations (including cursor-position-aware resolution in compound
   * selectors), and the not-a-CSS-target early returns.
   */
  describe('detectHoverTarget - integration', () => {
    let ctx: TestContext;

    beforeAll(() => {
      ctx = createTestContext();
    });

    // Operations are written with unique class/id names so each marker substring
    // appears exactly once in the source, making offset lookup unambiguous.
    const program = `styles "./styles.css"

action testAction() [
  selectElement(".alpha.beta")
  selectElement("#gamma")
  addClass("delta")
]

timeline "test" in ".container" using raf {
  at 0s testAction()
}`;

    /**
     * Resolve the hover target at the first occurrence of `marker` in the program.
     */
    async function detectAt(marker: string) {
      const offset = program.indexOf(marker);
      expect(offset).toBeGreaterThanOrEqual(0);

      const document = await ctx.parse(program);
      const root = document.parseResult.value.$cstNode;
      expect(root).toBeDefined();

      const leaf = CstUtils.findLeafNodeAtOffset(root!, offset);
      expect(leaf?.astNode).toBeDefined();

      return detectHoverTarget(leaf!.astNode!, {
        textDocument: { uri: document.uri.toString() },
        position: document.textDocument.positionAt(offset),
      });
    }

    it('should detect the class under the cursor in a compound selector', async () => {
      const result = await detectAt('beta');
      expect(result).toEqual({ type: 'class', name: 'beta' });
    });

    it('should detect the first class when the cursor is over it', async () => {
      const result = await detectAt('alpha');
      expect(result).toEqual({ type: 'class', name: 'alpha' });
    });

    it('should detect an id in a selector operation', async () => {
      const result = await detectAt('gamma');
      expect(result).toEqual({ type: 'id', name: 'gamma' });
    });

    it('should detect the class name in a className operation', async () => {
      const result = await detectAt('delta');
      expect(result).toEqual({ type: 'class', name: 'delta' });
    });

    it('should return undefined when not inside an operation call', async () => {
      // The first "testAction" occurrence is the action definition name.
      const result = await detectAt('testAction');
      expect(result).toBeUndefined();
    });

    it('should return undefined when the cursor is on the operation name, not a string', async () => {
      const result = await detectAt('selectElement');
      expect(result).toBeUndefined();
    });
  });
});
