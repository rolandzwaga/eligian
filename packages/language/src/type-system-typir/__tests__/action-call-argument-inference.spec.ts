/**
 * Regression tests: timeline action calls with arguments that previously had no
 * Typir inference rule.
 *
 * Action function types are created with `validateArgumentsOfFunctionCalls`, so Typir
 * infers every argument and checks it against the parameter type. Before the fix only
 * String/Number/Boolean/Object/ArrayLiteral (and variable/parameter references to those)
 * had inference rules. Every other argument (`null`, `-5`, `1 + 2`, `$globaldata.x`,
 * `@@currentItem`, a const initialised from those) produced an inference problem, which
 * Typir reported as an error-severity "The given operands for the call of 'a1' don't
 * match" diagnostic, even for untyped (unknown) parameters. That broke the documented
 * "unknown = opt-out" contract.
 */

import { beforeAll, describe, expect, test } from 'vitest';
import {
  createTestContext,
  DiagnosticSeverity,
  type TestContext,
} from '../../__tests__/test-helpers.js';

describe('Typir inference for timeline action call arguments', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  /** Typir call-mismatch diagnostics ("The given operands for the call of 'x' don't match"). */
  async function callMismatchErrors(code: string) {
    const { errors } = await ctx.parseAndValidate(code);
    return errors.filter(e => e.message.includes("don't match"));
  }

  // Action function types of documents parsed earlier in the shared test workspace stay
  // registered with Typir. Calls match by resolved reference (see
  // action-call-cross-document.spec.ts), so this is not needed for correctness, but a unique
  // action name per program keeps each test's diagnostics easy to attribute.
  let programCounter = 0;

  /** Build a program defining action `a1(params)` and calling it as `call` in a timeline. */
  function program(params: string, call: string, preamble = ''): string {
    const name = `a1_${++programCounter}`;
    return `
      ${preamble}
      action ${name}(${params}) [
        wait(1)
      ]

      timeline "t" in "#c" using raf {
        at 0s..3s ${call.replace(/^a1\(/, `${name}(`)}
      }
    `;
  }

  describe('untyped (unknown) parameter accepts any argument', () => {
    test.each([
      ['null literal', 'a1(null)'],
      ['unary minus', 'a1(-5)'],
      ['unary not', 'a1(!true)'],
      ['arithmetic binary expression', 'a1(1 + 2)'],
      ['comparison binary expression', 'a1(1 < 2)'],
      ['logical binary expression', 'a1(true && false)'],
      ['property chain reference', 'a1($globaldata.x)'],
      ['scope property chain reference', 'a1($scope.currentItem)'],
      ['system property reference', 'a1(@@currentItem)'],
      ['nested system property reference', 'a1(@@currentItem.label)'],
      ['parenthesised mixed expression', 'a1(($globaldata.x + 1) * 2)'],
      ['string literal (control)', 'a1("x")'],
      ['array literal (control)', 'a1([1, 2])'],
    ])('%s: %s produces no call-mismatch error', async (_label, call) => {
      const errors = await callMismatchErrors(program('a', call));
      expect(errors).toEqual([]);
    });

    test('a const initialised from a property chain reference', async () => {
      const errors = await callMismatchErrors(program('a', 'a1(@q)', 'const q = $globaldata.x'));
      expect(errors).toEqual([]);
    });

    test('a const initialised from a binary expression', async () => {
      const errors = await callMismatchErrors(program('a', 'a1(@q)', 'const q = 1 + 2'));
      expect(errors).toEqual([]);
    });
  });

  describe('typed parameters accept dynamic values but still reject wrong static types', () => {
    test.each([
      ['string', 'a1($globaldata.name)'],
      ['string', 'a1(@@currentItem)'],
      ['string', 'a1(null)'],
      ['string', 'a1("a" + "b")'],
      ['string', 'a1("count: " + 1)'],
      ['string', 'a1("a" + $globaldata.x)'],
      ['number', 'a1(-5)'],
      ['number', 'a1(1 + 2)'],
      ['number', 'a1(10 % 3)'],
      ['number', 'a1(2 ** 3)'],
      ['number', 'a1($globaldata.count * 2)'],
      ['boolean', 'a1(!true)'],
      ['boolean', 'a1(1 < 2)'],
      ['boolean', 'a1($globaldata.x == 1)'],
      ['boolean', 'a1(true || false)'],
      ['array', 'a1($globaldata.items)'],
      ['object', 'a1($scope.currentItem)'],
    ])('param typed %s accepts %s', async (type, call) => {
      const errors = await callMismatchErrors(program(`a: ${type}`, call));
      expect(errors).toEqual([]);
    });

    test.each([
      ['string', 'a1(-5)'],
      ['string', 'a1(1 + 2)'],
      ['string', 'a1(1 < 2)'],
      ['number', 'a1(!true)'],
      ['number', 'a1("a" + "b")'],
      ['boolean', 'a1(1 * 2)'],
    ])('param typed %s rejects %s', async (type, call) => {
      const errors = await callMismatchErrors(program(`a: ${type}`, call));
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].severity).toBe(DiagnosticSeverity.Error);
    });

    test('a wrongly typed literal is still reported next to a dynamic argument', async () => {
      const errors = await callMismatchErrors(program('a: string, b', 'a1(123, $globaldata.x)'));
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('control-flow validation is not tightened by the new rules', () => {
    test('for loop over a property chain reference is not an error', async () => {
      const { errors } = await ctx.parseAndValidate(`
        action a1() [
          for (item in $globaldata.items) {
            wait(1)
          }
        ]

        timeline "t" in "#c" using raf {
          at 0s..3s a1()
        }
      `);
      expect(errors.filter(e => e.message.includes('For loop collection'))).toEqual([]);
    });

    test('if condition on a property chain reference is not warned', async () => {
      const { warnings } = await ctx.parseAndValidate(`
        action a1() [
          if ($globaldata.enabled) {
            wait(1)
          }
        ]

        timeline "t" in "#c" using raf {
          at 0s..3s a1()
        }
      `);
      expect(warnings.filter(w => w.message.includes('If condition'))).toEqual([]);
    });

    test('if condition on a comparison is not warned', async () => {
      const { warnings } = await ctx.parseAndValidate(`
        action a1() [
          if ($globaldata.count > 5) {
            wait(1)
          }
        ]

        timeline "t" in "#c" using raf {
          at 0s..3s a1()
        }
      `);
      expect(warnings.filter(w => w.message.includes('If condition'))).toEqual([]);
    });
  });
});
