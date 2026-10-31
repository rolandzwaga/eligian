/**
 * Regression tests for the low-severity Typir findings of the 2026-10-22 audit:
 *
 * - #18 Cyclic or self-referencing consts crashed inference with an uncaught Typir
 *   "recursion loop for inferring the type" exception, surfaced only as the generic
 *   "An error occurred during validation" diagnostic.
 * - #19 An arity mismatch on a timeline action call was reported twice: once by the
 *   Langium ParameterValidator and once as a long nested Typir message that exposed the
 *   internal signature `foo(a: any, b: any)`.
 * - #20 Unresolved variable/parameter references inferred as Typir's Top type ('any'),
 *   adding a second, misleading diagnostic next to the linking error.
 * - #21 Every built-in operation had an unused Typir function type, so Typir's call
 *   validation inferred the arguments of every built-in call for nothing.
 * - #22 Test gap: const cycles and InlineEndableAction call contexts.
 */

import type { AstNode } from 'langium';
import { beforeAll, describe, expect, test } from 'vitest';
import {
  createTestContext,
  DiagnosticSeverity,
  type TestContext,
} from '../../__tests__/test-helpers.js';
import { isOperationCall } from '../../generated/ast.js';

describe('Typir low-severity audit findings', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  let counter = 0;
  /** Unique action name per test (action types of earlier documents stay registered). */
  const uniqueName = (base: string) => `${base}_${++counter}`;

  const GENERIC_VALIDATION_ERROR = 'An error occurred during validation';

  describe('#18 const reference cycles', () => {
    test.each([
      ['self-reference', 'const a = @a'],
      ['two-const cycle', 'const a = @b\nconst b = @a'],
      ['three-const cycle', 'const a = @b\nconst b = @c\nconst c = @a'],
      ['cycle through a binary expression', 'const a = @b + 1\nconst b = @a'],
      ['cycle through a string concatenation', 'const a = "x" + @b\nconst b = @a'],
    ])('%s used as a timeline action argument does not crash validation', async (_l, consts) => {
      const name = uniqueName('foo');
      const { diagnostics } = await ctx.parseAndValidate(`
        ${consts}
        action ${name}(x) [
          selectElement("#box")
        ]
        timeline "t" in "#c" using raf {
          at 0s..3s ${name}(@a)
        }
      `);
      expect(diagnostics.filter(d => d.message.includes(GENERIC_VALIDATION_ERROR))).toEqual([]);
      const cycleErrors = diagnostics.filter(
        d => d.severity === DiagnosticSeverity.Error && d.message.includes('refers to itself')
      );
      expect(cycleErrors.length).toBeGreaterThan(0);
    });

    test('a const cycle is reported with its path on every member', async () => {
      const name = uniqueName('foo');
      const { errors } = await ctx.parseAndValidate(`
        const a = @b
        const b = @a
        action ${name}(x) [
          selectElement("#box")
        ]
        timeline "t" in "#c" using raf {
          at 0s..3s ${name}(@a)
        }
      `);
      // Typir prefixes its diagnostics with "While validating the AstNode ..., this error is found:"
      const messages = errors.map(e => e.message);
      const reported = (text: string) => messages.some(m => m.endsWith(text));
      expect(reported("Constant 'a' refers to itself (a -> b -> a)")).toBe(true);
      expect(reported("Constant 'b' refers to itself (b -> a -> b)")).toBe(true);
    });

    test('a const that only references a cycle is not reported itself', async () => {
      const name = uniqueName('foo');
      const { diagnostics, errors } = await ctx.parseAndValidate(`
        const a = @a
        const c = @a
        action ${name}(x: string) [
          selectElement("#box")
        ]
        timeline "t" in "#c" using raf {
          at 0s..3s ${name}(@c)
        }
      `);
      expect(diagnostics.filter(d => d.message.includes(GENERIC_VALIDATION_ERROR))).toEqual([]);
      const cycleErrors = errors.filter(e => e.message.includes('refers to itself'));
      expect(cycleErrors).toHaveLength(1);
      expect(cycleErrors[0].message).toContain("Constant 'a' refers to itself (a -> a)");
      // no type: the call is not reported as a mismatch on top of the cycle error
      expect(errors.filter(e => e.message.includes("don't match"))).toEqual([]);
    });

    test('a cyclic const used inside an action body does not crash validation', async () => {
      const name = uniqueName('foo');
      const { diagnostics } = await ctx.parseAndValidate(`
        const a = @a
        action ${name}() [
          selectElement(@a)
        ]
        timeline "t" in "#c" using raf {
          at 0s..3s ${name}()
        }
      `);
      expect(diagnostics.filter(d => d.message.includes(GENERIC_VALIDATION_ERROR))).toEqual([]);
    });

    test('a cyclic const used as a for-loop collection does not crash validation', async () => {
      const name = uniqueName('foo');
      const { diagnostics } = await ctx.parseAndValidate(`
        const a = @a
        action ${name}() [
          for (item in @a) {
            selectElement("#box")
          }
        ]
        timeline "t" in "#c" using raf {
          at 0s..3s ${name}()
        }
      `);
      expect(diagnostics.filter(d => d.message.includes(GENERIC_VALIDATION_ERROR))).toEqual([]);
      expect(diagnostics.filter(d => d.message.includes("got 'any'"))).toEqual([]);
    });

    test('an acyclic const chain is not reported and still type-checks', async () => {
      const name = uniqueName('foo');
      const { errors } = await ctx.parseAndValidate(`
        const a = @b
        const b = 123
        action ${name}(x: string) [
          selectElement("#box")
        ]
        timeline "t" in "#c" using raf {
          at 0s..3s ${name}(@a)
        }
      `);
      expect(errors.filter(e => e.message.includes('refers to itself'))).toEqual([]);
      // number const passed to a string parameter: still a type mismatch
      expect(errors.filter(e => e.message.includes("don't match")).length).toBeGreaterThan(0);
    });
  });

  describe('#19 arity mismatch is reported once', () => {
    test('too few arguments: only the ParameterValidator error', async () => {
      const name = uniqueName('foo');
      const { errors } = await ctx.parseAndValidate(`
        action ${name}(a, b) [
          selectElement("#box")
        ]
        timeline "t" in "#c" using raf {
          at 0s..3s ${name}(1)
        }
      `);
      const arity = errors.filter(e => e.message.includes('expects 2 argument(s) but got 1'));
      expect(arity).toHaveLength(1);
      expect(errors.filter(e => e.message.includes("don't match"))).toEqual([]);
      expect(errors.filter(e => e.message.includes('any'))).toEqual([]);
    });

    test('too many arguments: only the ParameterValidator error', async () => {
      const name = uniqueName('foo');
      const { errors } = await ctx.parseAndValidate(`
        action ${name}(a: string) [
          selectElement("#box")
        ]
        timeline "t" in "#c" using raf {
          at 0s..3s ${name}("x", 2)
        }
      `);
      expect(
        errors.filter(e => e.message.includes('expects 1 argument(s) but got 2'))
      ).toHaveLength(1);
      expect(errors.filter(e => e.message.includes("don't match"))).toEqual([]);
    });

    test('correct arity with a wrong type is still reported by Typir', async () => {
      const name = uniqueName('foo');
      const { errors } = await ctx.parseAndValidate(`
        action ${name}(a: string, b: number) [
          selectElement("#box")
        ]
        timeline "t" in "#c" using raf {
          at 0s..3s ${name}(1, 2)
        }
      `);
      expect(errors.filter(e => e.message.includes("don't match")).length).toBeGreaterThan(0);
    });
  });

  describe('#20 unresolved references add no follow-on diagnostics', () => {
    test('for loop over a const initialised from an unresolved reference', async () => {
      const name = uniqueName('foo');
      const { diagnostics } = await ctx.parseAndValidate(`
        const c = @zzz
        action ${name}() [
          for (i in @c) {
            selectElement("#box")
          }
        ]
        timeline "t" in "#c" using raf {
          at 0s..3s ${name}()
        }
      `);
      expect(diagnostics.filter(d => d.message.includes('For loop collection'))).toEqual([]);
      expect(diagnostics.filter(d => d.message.includes("'any'"))).toEqual([]);
    });

    test('unresolved reference as an argument to a typed action parameter', async () => {
      const name = uniqueName('foo');
      const { errors } = await ctx.parseAndValidate(`
        action ${name}(a: string) [
          selectElement("#box")
        ]
        timeline "t" in "#c" using raf {
          at 0s..3s ${name}(@nope)
        }
      `);
      // the linking error is still there ...
      expect(errors.length).toBeGreaterThan(0);
      // ... but no Typir call mismatch on top of it
      expect(errors.filter(e => e.message.includes("don't match"))).toEqual([]);
    });

    test('if condition on an unresolved reference adds no warning', async () => {
      const name = uniqueName('foo');
      const { warnings } = await ctx.parseAndValidate(`
        const c = @zzz
        action ${name}() [
          if (@c) {
            selectElement("#box")
          }
        ]
        timeline "t" in "#c" using raf {
          at 0s..3s ${name}()
        }
      `);
      expect(warnings.filter(w => w.message.includes('If condition'))).toEqual([]);
    });
  });

  describe('#22 action call contexts', () => {
    test('a call inside an inline endable action block is not type-checked by Typir', async () => {
      const name = uniqueName('foo');
      const { errors } = await ctx.parseAndValidate(`
        action ${name}(a: string) [
          selectElement("#box")
        ]
        timeline "t" in "#c" using raf {
          at 0s..3s [ ${name}(123) ] [ ]
        }
      `);
      expect(errors.filter(e => e.message.includes("don't match"))).toEqual([]);
    });

    test('a call inside an action body is not type-checked by Typir', async () => {
      const name = uniqueName('foo');
      const caller = uniqueName('caller');
      const { errors } = await ctx.parseAndValidate(`
        action ${name}(a: string) [
          selectElement("#box")
        ]
        action ${caller}() [
          ${name}(123)
        ]
        timeline "t" in "#c" using raf {
          at 0s..3s ${caller}()
        }
      `);
      expect(errors.filter(e => e.message.includes("don't match"))).toEqual([]);
    });

    test('a timeline call with a wrongly typed literal is reported', async () => {
      const name = uniqueName('foo');
      const { errors } = await ctx.parseAndValidate(`
        action ${name}(a: string) [
          selectElement("#box")
        ]
        timeline "t" in "#c" using raf {
          at 0s..3s ${name}(123)
        }
      `);
      const mismatch = errors.filter(e => e.message.includes("don't match"));
      expect(mismatch.length).toBeGreaterThan(0);
      expect(mismatch[0].severity).toBe(DiagnosticSeverity.Error);
    });
  });

  describe('#21 built-in operation calls are not type-checked by Typir', () => {
    test('validation infers none of the arguments of built-in operation calls', async () => {
      const inference = ctx.services.Eligian.typir.Inference;
      const original = inference.inferType;
      const inferred: AstNode[] = [];
      inference.inferType = (node: AstNode) => {
        inferred.push(node);
        return original.call(inference, node);
      };
      try {
        const name = uniqueName('foo');
        const { errors } = await ctx.parseAndValidate(`
          action ${name}() [
            selectElement("#box")
            wait(5)
            setStyle({ opacity: 1 })
          ]
          timeline "t" in "#c" using raf {
            at 0s..3s ${name}()
          }
        `);
        expect(errors.filter(e => e.message.includes("don't match"))).toEqual([]);
      } finally {
        inference.inferType = original;
      }
      const operationArguments = inferred.filter(
        node => isOperationCall(node.$container) && node.$containerProperty === 'args'
      );
      expect(operationArguments).toEqual([]);
    });
  });
});
