/**
 * Library Validation Tests (Feature 023 - User Story 1)
 *
 * Tests validation rules for library files:
 * - Libraries cannot contain timelines (grammar prevents this - parser error)
 * - Libraries cannot contain imports (grammar prevents this - parser error)
 * - Libraries cannot contain constants (grammar prevents this - parser error)
 * - Action names must be unique within a library (validator checks this)
 */

import { beforeAll, describe, expect, test } from 'vitest';
import { createTestContext, type TestContext } from './test-helpers.js';

describe('Library Validation', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  // T016: Test error when library contains timeline
  // Note: Grammar doesn't allow timelines in libraries, so this is a parser error
  test('rejects library with timeline (parser error)', async () => {
    const code = `
      library animations

      action fadeIn() [
        selectElement("#box")
      ]

      timeline "Demo" in ".container" using raf {
        at 0s..5s fadeIn()
      }
    `;

    const document = await ctx.parse(code);
    expect(document.parseResult.parserErrors.length).toBeGreaterThan(0);
    // Parser should reject timeline after library actions
  });

  // T017: Test error when library contains styles import
  // Note: Grammar doesn't allow imports in libraries, so this is a parser error
  test('rejects library with styles import (parser error)', async () => {
    const code = `
      library animations

      styles "./styles.css"

      action fadeIn() [
        selectElement("#box")
      ]
    `;

    const document = await ctx.parse(code);
    expect(document.parseResult.parserErrors.length).toBeGreaterThan(0);
    // Parser should reject import statements in library
  });

  test('rejects library with layout import (parser error)', async () => {
    const code = `
      library utils

      layout "./layout.html"

      action safeSelect() [
        selectElement("#box")
      ]
    `;

    const document = await ctx.parse(code);
    expect(document.parseResult.parserErrors.length).toBeGreaterThan(0);
  });

  test('rejects library with provider import (parser error)', async () => {
    const code = `
      library animations

      provider "./video.mp4"

      action fadeIn() [
        selectElement("#box")
      ]
    `;

    const document = await ctx.parse(code);
    expect(document.parseResult.parserErrors.length).toBeGreaterThan(0);
  });

  test('rejects library with library action import (parser error)', async () => {
    const code = `
      library animations

      import { fadeIn } from "./other.eligian"

      action fadeOut() [
        selectElement("#box")
      ]
    `;

    const document = await ctx.parse(code);
    expect(document.parseResult.parserErrors.length).toBeGreaterThan(0);
  });

  // T018: Test error when library contains constants
  // Note: Grammar doesn't allow constants in libraries, so this is a parser error
  test('rejects library with constant declaration (parser error)', async () => {
    const code = `
      library animations

      const duration = 1000

      action fadeIn() [
        selectElement("#box")
      ]
    `;

    const document = await ctx.parse(code);
    expect(document.parseResult.parserErrors.length).toBeGreaterThan(0);
  });

  test('rejects library with multiple constants (parser error)', async () => {
    const code = `
      library utils

      const DEFAULT_DURATION = 1000
      const DEFAULT_SELECTOR = "#box"

      action fadeIn() [
        selectElement("#box")
      ]
    `;

    const document = await ctx.parse(code);
    expect(document.parseResult.parserErrors.length).toBeGreaterThan(0);
  });

  // T019: Test error when library has duplicate action names
  // This is a validation error (not grammar)
  test('rejects library with duplicate action names', async () => {
    const code = `
      library animations

      action fadeIn(selector: string) [
        selectElement(selector)
      ]

      action fadeIn(selector: string, duration: number) [
        selectElement(selector)
        animate({opacity: 1}, duration)
      ]
    `;

    const { errors } = await ctx.parseAndValidate(code);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('Duplicate');
    expect(errors[0].message).toContain('fadeIn');
    expect(errors[0].code).toBe('library_duplicate_action');
  });

  test('rejects library with duplicate action names (multiple duplicates)', async () => {
    const code = `
      library animations

      action fadeIn() [
        selectElement("#box")
      ]

      action fadeOut() [
        selectElement("#box")
      ]

      action fadeIn() [
        addClass("visible")
      ]

      action fadeOut() [
        removeClass("visible")
      ]
    `;

    const { errors } = await ctx.parseAndValidate(code);
    expect(errors.length).toBeGreaterThanOrEqual(2);
    expect(errors[0].code).toBe('library_duplicate_action');
  });

  // T020: Test valid library with 5 actions passes
  test('accepts valid library with multiple actions', async () => {
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

      action slideOut(selector: string, duration: number) [
        selectElement(selector)
        animate({transform: 'translateX(100%)'}, duration)
      ]

      private action resetOpacity(selector: string) [
        selectElement(selector)
        setStyle({opacity: '0'})
      ]
    `;

    const { errors } = await ctx.parseAndValidate(code);
    expect(errors).toHaveLength(0);
  });

  test('accepts library with mix of regular and endable actions', async () => {
    const code = `
      library animations

      action fadeIn(selector: string) [
        selectElement(selector)
        animate({opacity: 1}, 1000)
      ]

      endable action showThenHide(selector: string) [
        selectElement(selector)
        addClass("visible")
      ] [
        selectElement(selector)
        removeClass("visible")
      ]

      private action resetOpacity(selector: string) [
        selectElement(selector)
        setStyle({opacity: '0'})
      ]
    `;

    const { errors } = await ctx.parseAndValidate(code);
    expect(errors).toHaveLength(0);
  });

  test('accepts empty library', async () => {
    const code = 'library emptyLib';

    const { errors } = await ctx.parseAndValidate(code);
    expect(errors).toHaveLength(0);
  });

  // T070: Test error when library action name conflicts with built-in operation (Phase 7 - US5)
  test('rejects library action with built-in operation name', async () => {
    const code = `
      library conflictingLib

      action selectElement(selector: string) [
        addClass("selected")
      ]
    `;

    const { errors } = await ctx.parseAndValidate(code);
    const collisionErrors = errors.filter(e => e.code === 'action_name_builtin_conflict');

    expect(collisionErrors.length).toBeGreaterThan(0);
    expect(collisionErrors[0].message).toContain('selectElement');
    expect(collisionErrors[0].message).toContain('built-in');
  });

  test('rejects library action with different built-in operation name', async () => {
    const code = `
      library conflictingLib

      action animate(properties: object, duration: number) [
        selectElement("body")
      ]
    `;

    const { errors } = await ctx.parseAndValidate(code);
    const collisionErrors = errors.filter(e => e.code === 'action_name_builtin_conflict');

    expect(collisionErrors.length).toBeGreaterThan(0);
    expect(collisionErrors[0].message).toContain('animate');
  });

  // T071: Test no error when library action has unique name (Phase 7 - US5)
  test('accepts library action with unique name', async () => {
    const code = `
      library uniqueLib

      action customFadeIn(selector: string) [
        selectElement(selector)
        animate({opacity: 1}, 1000)
      ]

      action customSlideIn(selector: string) [
        selectElement(selector)
        animate({transform: "translateX(0)"}, 500)
      ]
    `;

    const { errors } = await ctx.parseAndValidate(code);
    const collisionErrors = errors.filter(e => e.code === 'action_name_builtin_conflict');

    expect(collisionErrors).toHaveLength(0);
  });
});
