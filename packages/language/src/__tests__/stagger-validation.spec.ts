/**
 * Stagger action-call arity validation.
 *
 * A `stagger … with action()` call auto-fills the action's FIRST parameter with
 * the current item, so a 1-parameter action is called with no explicit args.
 * Both the Langium parameter validator and the Typir type system must account
 * for that implicit first argument (regression: they previously demanded an
 * explicit arg for every parameter, rejecting the idiomatic `with revealCard()`).
 */
import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createTestContext, setupCSSRegistry, type TestContext } from './test-helpers.js';

describe('Stagger action-call arity', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  beforeEach(() => {
    setupCSSRegistry(ctx, 'file:///styles.css', {
      classes: ['container', 'item', 'in', 'active'],
      ids: [],
    });
  });

  const arityErrors = (errors: { message: string }[], name: string) =>
    errors.filter(e => e.message.includes(name) && /argument|parameter|operand/i.test(e.message));

  test('accepts `with action()` for a 1-parameter action (item fills the first param)', async () => {
    const code = `
      action revealCard(selector: string) [
        selectElement(selector)
        addClass("in")
      ]
      timeline "t" in ".container" using raf {
        stagger 200ms [".item"] with revealCard() for 1s
      }
    `;
    const { errors } = await ctx.parseAndValidate(code);
    expect(arityErrors(errors, 'revealCard')).toHaveLength(0);
  });

  test('still flags a genuine arity mismatch (2-param action, no explicit arg)', async () => {
    const code = `
      action revealPair(selector: string, cls: string) [
        selectElement(selector)
        addClass(cls)
      ]
      timeline "t" in ".container" using raf {
        stagger 200ms [".item"] with revealPair() for 1s
      }
    `;
    const { errors } = await ctx.parseAndValidate(code);
    // item fills `selector`; `cls` still needs an explicit arg → expected 1, got 0.
    expect(arityErrors(errors, 'revealPair').length).toBeGreaterThan(0);
  });

  test('accepts the extra explicit arg for a 2-parameter action', async () => {
    const code = `
      action revealPair(selector: string, cls: string) [
        selectElement(selector)
        addClass(cls)
      ]
      timeline "t" in ".container" using raf {
        stagger 200ms [".item"] with revealPair("active") for 1s
      }
    `;
    const { errors } = await ctx.parseAndValidate(code);
    expect(arityErrors(errors, 'revealPair')).toHaveLength(0);
  });
});
