/**
 * Expression validator: operators the compiler cannot emit (audit 2026-10-22, medium).
 *
 * - Arithmetic on runtime values (`x + 10`, `-x`) used to compile to an inert
 *   `("$operationdata.x" + 10)` string; comparisons/logic on runtime values only work inside
 *   if conditions. The compiler now rejects both, and so does the editor.
 * - All-constant operations without a valid value (`10 % 0`, `"abc" - 1`, `true + 1`) used to
 *   fold to NaN (emitted as `null`); both the compiler and the editor now report them.
 *
 * Each case is checked against the compiler so the editor and compile result agree.
 */

import { Effect } from 'effect';
import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import {
  CSS_FIXTURES,
  createTestContext,
  DiagnosticSeverity,
  minimalProgram,
  setupCSSRegistry,
  type TestContext,
} from '../../__tests__/test-helpers.js';
import { transformAST } from '../../compiler/ast-transformer.js';
import {
  INVALID_CONSTANT_CODE,
  RUNTIME_NEGATION_CODE,
  RUNTIME_OPERATOR_CODE,
} from '../expression-validator.js';

const CODES = new Set([INVALID_CONSTANT_CODE, RUNTIME_NEGATION_CODE, RUNTIME_OPERATOR_CODE]);

describe('ExpressionValidator: runtime operands and invalid constants', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  beforeEach(() => {
    setupCSSRegistry(ctx, 'file:///styles.css', CSS_FIXTURES.common);
  });

  const program = (actionBody: string, params: string[] = [], globals = '') =>
    `const N = 10\nconst ZERO = 0\n${globals}\n\n${minimalProgram({
      cssImport: true,
      containerSelector: '#container',
      actionParams: params.map(name => ({ name })),
      actionBody: `selectElement("#app")\n  ${actionBody}`,
      timelineBody: 'at 0s..1s testAction()',
    })}`;

  async function check(code: string) {
    const { diagnostics, document, program: ast } = await ctx.parseAndValidate(code);
    expect(document.parseResult.parserErrors).toHaveLength(0);
    const errors = diagnostics.filter(
      d => d.severity === DiagnosticSeverity.Error && CODES.has(d.data?.code)
    );
    const compiled = await Effect.runPromise(Effect.result(transformAST(ast)));
    return { errors, compiled };
  }

  describe('rejected by editor and compiler with the same message', () => {
    test.each([
      ['parameter arithmetic', 'animate({left: x + 10}, 500)', ['x'], '', RUNTIME_OPERATOR_CODE],
      ['unary minus on a parameter', 'setData({"a": -x})', ['x'], '', RUNTIME_OPERATOR_CODE],
      [
        'system property arithmetic',
        'setData({"a": @@loopIndex * 2})',
        [],
        '',
        RUNTIME_OPERATOR_CODE,
      ],
      [
        'property chain arithmetic',
        'setData({"a": $globaldata.n - 1})',
        [],
        '',
        RUNTIME_OPERATOR_CODE,
      ],
      ['runtime comparison outside if', 'setData({"a": x > 5})', ['x'], '', RUNTIME_OPERATOR_CODE],
      ['runtime logic outside if', 'setData({"a": x || "d"})', ['x'], '', RUNTIME_OPERATOR_CODE],
      ['negated runtime logic', 'setData({"a": !(x && true)})', ['x'], '', RUNTIME_OPERATOR_CODE],
      ['modulo by zero', 'setData({"a": 10 % 0})', [], '', INVALID_CONSTANT_CODE],
      ['division by a zero const', 'setData({"a": @N / @ZERO})', [], '', INVALID_CONSTANT_CODE],
      ['string minus number', 'setData({"a": "abc" - 1})', [], '', INVALID_CONSTANT_CODE],
      ['boolean plus number', 'setData({"a": true + 1})', [], '', INVALID_CONSTANT_CODE],
      [
        'invalid global const',
        'setData({"a": 1})',
        [],
        'const modv = 10 % 0',
        INVALID_CONSTANT_CODE,
      ],
      [
        'invalid constant next to a runtime operand',
        'setData({"a": x + 10 % 0})',
        ['x'],
        '',
        INVALID_CONSTANT_CODE,
      ],
    ])('%s', async (_label, body, params, globals, code) => {
      const { errors, compiled } = await check(program(body, params, globals));
      expect(errors.map(e => e.data?.code)).toEqual([code]);
      expect(compiled._tag).toBe('Failure');
      expect(compiled._tag === 'Failure' && compiled.failure.message).toBe(errors[0].message);
    });

    test('reports only the innermost operator of a chain', async () => {
      const { errors } = await check(program('setData({"a": x + 1 + 2 > 3})', ['x']));
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain("Arithmetic operator '+'");
    });

    test('arithmetic on a runtime value inside an if condition is still rejected', async () => {
      const { errors, compiled } = await check(
        program('if (x + 1 > 5) {\n    selectElement("#app")\n  }', ['x'])
      );
      expect(errors.map(e => e.data?.code)).toEqual([RUNTIME_OPERATOR_CODE]);
      expect(compiled._tag).toBe('Failure');
    });
  });

  describe('accepted by editor and compiler', () => {
    test.each([
      ['constant arithmetic', 'setData({"a": @N * 2 + 1, "b": 2 ** 3})', []],
      ['string concatenation', 'setData({"a": "n=" + @N})', []],
      ['constant comparison', 'setData({"a": @N > 5})', []],
      ['runtime comparison in an if', 'if (x > 5 && !x) {\n    selectElement("#app")\n  }', ['x']],
      ['plain runtime reference', 'setData({"a": x})', ['x']],
      ['negative literal', 'setData({"a": -5})', []],
      [
        'null on the left of a runtime comparison in an if',
        'if (null == $globaldata.x) {\n    selectElement("#app")\n  }',
        [],
      ],
      [
        'null on the left of a runtime logical operator in an if',
        'if (null || $globaldata.x) {\n    selectElement("#app")\n  }',
        [],
      ],
    ])('%s', async (_label, body, params) => {
      const { errors, compiled } = await check(program(body, params));
      expect(errors).toHaveLength(0);
      expect(compiled._tag).toBe('Success');
    });

    test('a null constant compared with null folds', async () => {
      const { errors, compiled } = await check(
        program('if (@NUL == null) {\n    selectElement("#app")\n  }', [], 'const NUL = null')
      );
      expect(errors).toHaveLength(0);
      expect(compiled._tag).toBe('Success');
    });
  });
});
