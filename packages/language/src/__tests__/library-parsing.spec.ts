/**
 * Library Parsing Tests (Feature 023 - User Story 1)
 *
 * Tests parsing of library files with the 'library' keyword and action definitions.
 * These tests verify the grammar correctly parses library syntax without validation.
 */

import { beforeAll, describe, expect, test } from 'vitest';
import type { Library } from '../generated/ast.js';
import { createTestContext, type TestContext } from './test-helpers.js';

describe('Library Parsing', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  // T013: Test library with single action
  test('parses library with single action', async () => {
    const code = `
      library animations

      action fadeIn(selector: string, duration: number) [
        selectElement(selector)
        animate({opacity: 1}, duration)
      ]
    `;

    const document = await ctx.parse(code);
    expect(document.parseResult.parserErrors).toHaveLength(0);

    const library = document.parseResult.value as Library;
    expect(library.$type).toBe('Library');
    expect(library.name).toBe('animations');
    expect(library.actions).toHaveLength(1);
    expect(library.actions[0].name).toBe('fadeIn');
  });

  // T014: Test library with multiple actions
  test('parses library with multiple actions', async () => {
    const code = `
      library animations

      action fadeIn(selector: string, duration: number) [
        selectElement(selector)
        animate({opacity: 1}, duration)
      ]

      action fadeOut(selector: string, duration: number) [
        selectElement(selector)
        animate({opacity: 0}, duration)
      ]

      action slideIn(selector: string, duration: number) [
        selectElement(selector)
        animate({transform: 'translateX(0)'}, duration)
      ]

      private action resetOpacity(selector: string) [
        selectElement(selector)
        setStyle('opacity', '0')
      ]
    `;

    const document = await ctx.parse(code);
    expect(document.parseResult.parserErrors).toHaveLength(0);

    const library = document.parseResult.value as Library;
    expect(library.$type).toBe('Library');
    expect(library.name).toBe('animations');
    expect(library.actions).toHaveLength(4);

    // Verify action names
    const actionNames = library.actions.map(a => a.name);
    expect(actionNames).toEqual(['fadeIn', 'fadeOut', 'slideIn', 'resetOpacity']);

    // Verify visibility modifiers
    expect(library.actions[0].visibility).toBeUndefined(); // public by default
    expect(library.actions[1].visibility).toBeUndefined();
    expect(library.actions[2].visibility).toBeUndefined();
    expect(library.actions[3].visibility).toBe('private');
  });

  // T015: Test library name extraction
  test('extracts library name correctly', async () => {
    const testCases = [
      { code: 'library animations', expectedName: 'animations' },
      { code: 'library utils', expectedName: 'utils' },
      { code: 'library myCustomLibrary', expectedName: 'myCustomLibrary' },
      { code: 'library lib_with_underscore', expectedName: 'lib_with_underscore' },
    ];

    for (const { code, expectedName } of testCases) {
      const document = await ctx.parse(code);
      expect(document.parseResult.parserErrors).toHaveLength(0);

      const library = document.parseResult.value as Library;
      expect(library.$type).toBe('Library');
      expect(library.name).toBe(expectedName);
    }
  });

  test('parses library with endable actions', async () => {
    const code = `
      library animations

      endable action showThenHide(selector: string) [
        selectElement(selector)
        addClass("visible")
      ] [
        removeClass("visible")
      ]
    `;

    const document = await ctx.parse(code);
    expect(document.parseResult.parserErrors).toHaveLength(0);

    const library = document.parseResult.value as Library;
    expect(library.$type).toBe('Library');
    expect(library.actions).toHaveLength(1);
    expect(library.actions[0].name).toBe('showThenHide');
  });

  test('parses library with private endable action', async () => {
    const code = `
      library animations

      private endable action internalToggle(selector: string) [
        addClass("active")
      ] [
        removeClass("active")
      ]
    `;

    const document = await ctx.parse(code);
    expect(document.parseResult.parserErrors).toHaveLength(0);

    const library = document.parseResult.value as Library;
    expect(library.$type).toBe('Library');
    expect(library.actions).toHaveLength(1);
    expect(library.actions[0].name).toBe('internalToggle');
    expect(library.actions[0].visibility).toBe('private');
  });

  test('parses empty library (no actions)', async () => {
    const code = 'library emptyLib';

    const document = await ctx.parse(code);
    expect(document.parseResult.parserErrors).toHaveLength(0);

    const library = document.parseResult.value as Library;
    expect(library.$type).toBe('Library');
    expect(library.name).toBe('emptyLib');
    expect(library.actions).toHaveLength(0);
  });
});
