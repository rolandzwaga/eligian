/**
 * Regression tests: timeline container selector syntax.
 *
 * The Typir timeline rule used to validate the container selector with an ASCII-only
 * character whitelist, so valid selectors with non-ASCII identifiers (`#café`), backslash
 * escapes (Tailwind `.sm\:flex`) or `/` / `%` in attribute values were rejected with
 * "Invalid CSS selector", blocking compilation. Selector syntax is decided by the real
 * PostCSS-based parser in the Langium timeline validator ("Invalid CSS selector syntax").
 */

import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import {
  createTestContext,
  setupCSSRegistry,
  type TestContext,
} from '../../../__tests__/test-helpers.js';

describe('Timeline container selector syntax', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  beforeEach(() => {
    setupCSSRegistry(ctx, 'file:///styles.css', {
      classes: ['sm:flex', 'w-1/2', 'box'],
      ids: ['café', 'app'],
    });
  });

  /** Selector-related errors for a timeline whose container is `selector` (DSL string body). */
  async function selectorErrors(selector: string) {
    const { errors } = await ctx.parseAndValidate(`
      styles "./styles.css"

      action testAction() [
        wait(1)
      ]

      timeline "T" in "${selector}" using raf {
        at 0s..1s testAction()
      }
    `);
    return errors.filter(e => e.message.includes('selector'));
  }

  test.each([
    ['attribute value containing a slash', "a[href='/x']"],
    ['attribute value containing a percent sign', "div[data-w='50%']"],
    ['non-ASCII identifier', '#café'],
    ['escaped colon (Tailwind)', '.sm\\\\:flex'],
    ['escaped slash (Tailwind)', '.w-1\\\\/2'],
    ['plain id (control)', '#app'],
    ['descendant combinator (control)', '#app .box'],
  ])('%s: "%s" is accepted', async (_label, selector) => {
    expect(await selectorErrors(selector)).toEqual([]);
  });

  test.each([
    ['unbalanced attribute bracket', '#app['],
    ['missing pseudo name', '#app::'],
    ['invalid character', 'not a valid selector!!!'],
  ])('%s: "%s" is rejected once, by the real selector parser', async (_label, selector) => {
    const errors = await selectorErrors(selector);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('Invalid CSS selector syntax');
  });
});
