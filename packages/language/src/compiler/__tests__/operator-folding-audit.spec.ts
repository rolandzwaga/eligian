/**
 * Operator parsing and constant folding (audit 2026-10-22, medium findings).
 *
 * - `**` binds tighter than `*` / `/` / `%`, is right-associative, and unary
 *   minus applies to the whole power (`-2 ** 2` = -4).
 * - The constant evaluator folds `**` (consts are inlined, constant if
 *   conditions are accepted).
 * - Constant folding never produces NaN/Infinity (JSON `null`): `10 % 0`,
 *   `10 / 0`, `"abc" - 1` and `true + 1` are compile errors.
 * - An operator applied to a runtime value (parameter, variable, system
 *   property, property chain) outside an if condition is a compile error
 *   instead of an inert `("$operationdata.x" + 10)` string.
 * - Every binary operator of the grammar is handled by the evaluator.
 */

import { Effect } from 'effect';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { beforeAll, describe, expect, test } from 'vitest';
import { createEligianServices } from '../../eligian-module.js';
import {
  type BinaryExpression,
  type Expression,
  isProgram,
  type Program,
} from '../../generated/ast.js';
import { getElements } from '../../utils/program-helpers.js';
import { transformAST } from '../ast-transformer.js';
import { evaluateExpression } from '../expression-evaluator.js';
import { transformExpression } from '../transformers/expression-transformer.js';

describe('Operator parsing and folding (audit 2026-10-22)', () => {
  let parse: ReturnType<typeof parseHelper<Program>>;

  beforeAll(async () => {
    const services = createEligianServices(EmptyFileSystem);
    parse = parseHelper<Program>(services.Eligian);
  });

  async function parseDSL(code: string): Promise<Program> {
    const document = await parse(code);
    if (document.parseResult.parserErrors.length > 0) {
      throw new Error(
        `Parse errors: ${document.parseResult.parserErrors.map(e => e.message).join(', ')}`
      );
    }
    return document.parseResult.value;
  }

  async function constExpression(source: string): Promise<Expression> {
    const program = await parseDSL(`const x = ${source}`);
    const decl = getElements(program)[0];
    if (decl?.$type !== 'VariableDeclaration') throw new Error('expected a const');
    return decl.value;
  }

  /** Fully parenthesized rendering of an expression tree. */
  function shape(expr: Expression): string {
    switch (expr.$type) {
      case 'NumberLiteral':
        return String(expr.value);
      case 'BinaryExpression':
        return `(${shape(expr.left)} ${expr.op} ${shape(expr.right)})`;
      case 'UnaryExpression':
        return `(${expr.op}${shape(expr.operand)})`;
      default:
        return expr.$type;
    }
  }

  const actionWith = (params: string, body: string) => `
    action ff(${params}) [
      selectElement("#a")
      ${body}
    ]

    timeline "t" in "#root" using raf {}
  `;

  async function transformFailure(code: string) {
    const result = await Effect.runPromise(Effect.result(transformAST(await parseDSL(code))));
    if (result._tag !== 'Failure') {
      throw new Error(`Expected a transform failure, got ${JSON.stringify(result.success)}`);
    }
    return result.failure as { _tag: string; kind: string; message: string; location?: unknown };
  }

  async function transformed(code: string) {
    return Effect.runPromise(transformAST(await parseDSL(code)));
  }

  async function setDataProperties(code: string) {
    const result = await transformed(code);
    const ops = result.config.actions[0].startOperations;
    return ops.find(op => op.systemName === 'setData')?.operationData?.properties;
  }

  describe('`**` precedence and associativity (grammar)', () => {
    test.each([
      ['2 * 3 ** 2', '(2 * (3 ** 2))'],
      ['2 ** 3 ** 2', '(2 ** (3 ** 2))'],
      ['-2 ** 2', '(-(2 ** 2))'],
      ['2 ** -1', '(2 ** (-1))'],
      ['2 ** 3 * 4', '((2 ** 3) * 4)'],
      ['10 % 3 ** 2', '(10 % (3 ** 2))'],
      ['1 + 2 * 3', '(1 + (2 * 3))'],
      ['8 / 4 / 2', '((8 / 4) / 2)'],
    ])('%s parses as %s', async (source, expected) => {
      expect(shape(await constExpression(source))).toBe(expected);
    });

    test.each([
      ['2 * 3 ** 2', 18],
      ['2 ** 3 ** 2', 512],
      ['-2 ** 2', -4],
      ['(-2) ** 2', 4],
      ['2 ** -1', 0.5],
    ])('%s folds to %s (evaluator and transformer agree)', async (source, expected) => {
      const expr = await constExpression(source);
      expect(evaluateExpression(expr, new Map())).toMatchObject({
        canEvaluate: true,
        value: expected,
      });
      expect(await Effect.runPromise(transformExpression(expr))).toBe(expected);
    });
  });

  describe('`**` in the constant evaluator', () => {
    test('a `**` const is inlined, not stored in globaldata', async () => {
      const result = await transformed(
        `const powv = 2 ** 3\n${actionWith('', 'setData({"a": @powv})')}`
      );
      expect(result.config.actions[0].startOperations[1].operationData?.properties).toEqual({
        a: 8,
      });
      expect(JSON.stringify(result.config.initActions ?? [])).not.toContain('powv');
    });

    test('a constant `**` if condition folds', async () => {
      const result = await transformed(
        actionWith('', 'if (2 ** 3 > 5) { setElementContent("big") }')
      );
      const when = result.config.actions[0].startOperations.find(op => op.systemName === 'when');
      expect(when?.operationData).toEqual({ expression: 'true' });
    });
  });

  describe('invalid constants are errors, never NaN/null', () => {
    test.each([
      ['10 % 0', 'Modulo by zero'],
      ['10 / 0', 'Division by zero'],
      ['"abc" - 1', "Operator '-' requires numeric operands"],
      ['"5" - 2', "Operator '-' requires numeric operands"],
      ['true + 1', "Operator '+' requires numbers or a string"],
      ['"a" < 1', "Operator '<' requires two numbers or two strings"],
      ['10 ** 400', 'does not produce a finite number'],
      ['null * 2', "Operator '*' cannot be applied to a constant of type null"],
      ['-"abc"', "Operator '-' requires a numeric operand"],
    ])('evaluator: %s is invalid', async (source, message) => {
      const result = evaluateExpression(await constExpression(source), new Map());
      expect(result.canEvaluate).toBe(false);
      expect(result.error?.invalid).toBe(true);
      expect(result.error?.reason).toContain(message);
    });

    test.each([
      ['const modv = 10 % 0', 'Modulo by zero'],
      ['const strv = "abc" - 1', "Operator '-' requires numeric operands"],
      ['const divv = 10 / 0', 'Division by zero'],
    ])('global `%s` fails compilation', async (decl, message) => {
      const error = await transformFailure(`${decl}\n${actionWith('', 'setElementContent("x")')}`);
      expect(error).toMatchObject({ _tag: 'TransformError', kind: 'InvalidExpression' });
      expect(error.message).toContain(message);
      expect(error.location).toBeDefined();
    });

    test.each([
      ['setData({c: 10 / 0})', 'Division by zero'],
      ['setData({c: 10 % 0})', 'Modulo by zero'],
      ['setData({c: true + 1})', "Operator '+'"],
    ])('operation argument `%s` fails compilation', async (body, message) => {
      const error = await transformFailure(actionWith('', body));
      expect(error).toMatchObject({ _tag: 'TransformError', kind: 'InvalidExpression' });
      expect(error.message).toContain(message);
    });

    test('an invalid constant inside an if condition reports the real cause', async () => {
      const error = await transformFailure(
        actionWith('x', 'if (x > 10 % 0) { setElementContent("y") }')
      );
      expect(error.message).toContain('Modulo by zero');
    });

    test('valid constants still fold (strings, comparisons, logic)', async () => {
      const properties = await setDataProperties(
        actionWith(
          '',
          'setData({"a": "ab" + "c", "b": "n" + 1, "c": "a" < "b", "d": 7 % 4, "e": true && false, "f": 1 == 1})'
        )
      );
      expect(properties).toEqual({ a: 'abc', b: 'n1', c: true, d: 3, e: false, f: true });
    });
  });

  describe('operators on runtime values are errors, not inert strings', () => {
    test.each([
      [
        'parameter arithmetic',
        'x: number',
        'animate({left: x + 10}, 500)',
        "Arithmetic operator '+'",
      ],
      ['system property', '', 'setData({"a": @@loopIndex * 100})', "Arithmetic operator '*'"],
      ['property chain', '', 'setData({"a": $operationdata.n - 1})', "Arithmetic operator '-'"],
      ['unary minus', 'x', 'setData({"a": -x})', "Arithmetic operator '-'"],
      ['comparison', 'x', 'setData({"a": x > 5})', "Operator '>' on runtime values"],
      ['logical', 'x', 'setData({"a": x || "d"})', "Operator '||' on runtime values"],
      [
        'runtime action variable',
        '',
        'const v = $operationdata.foo\n      setData({"a": @v + 1})',
        "Arithmetic operator '+'",
      ],
    ])('%s', async (_label, params, body, message) => {
      const error = await transformFailure(actionWith(params, body));
      expect(error).toMatchObject({ _tag: 'TransformError', kind: 'InvalidExpression' });
      expect(error.message).toContain(message);
      expect(error.location).toBeDefined();
    });

    test.each([
      ['null == $globaldata.x', '$globaldata.x == null', 'null == $globaldata.x'],
      ['null || $globaldata.x', '$globaldata.x || null', 'null || $globaldata.x'],
      ['null != $globaldata.x', '$globaldata.x != null', 'null != $globaldata.x'],
    ])(
      'null on either side of a runtime operand in a condition: %s',
      async (left, mirrored, expected) => {
        for (const [condition, expression] of [
          [left, expected],
          [mirrored, mirrored],
        ]) {
          const result = await transformed(
            actionWith('', `if (${condition}) { setElementContent("y") }`)
          );
          const when = result.config.actions[0].startOperations.find(
            op => op.systemName === 'when'
          );
          expect(when?.operationData).toEqual({ expression });
        }
      }
    );

    test('constant null operands fold for ==, !=, && and ||', async () => {
      const result = await transformed(
        `const NUL = null\n${actionWith('', 'if (@NUL == null) { setElementContent("y") }')}`
      );
      const when = result.config.actions[0].startOperations.find(op => op.systemName === 'when');
      expect(when?.operationData).toEqual({ expression: 'true' });
      for (const [source, value] of [
        ['null == null', true],
        ['null != 1', true],
        ['null && 1', null],
        ['null || "d"', 'd'],
      ] as const) {
        expect(evaluateExpression(await constExpression(source), new Map())).toMatchObject({
          canEvaluate: true,
          value,
        });
      }
    });

    test('runtime comparisons inside if conditions still compile', async () => {
      const result = await transformed(actionWith('x', 'if (x > 5) { setElementContent("y") }'));
      const when = result.config.actions[0].startOperations.find(op => op.systemName === 'when');
      expect(when?.operationData).toEqual({ expression: '$operationdata.x > 5' });
    });
  });

  test('every binary operator in the grammar is handled by the evaluator', async () => {
    const operators = ['||', '&&', '==', '!=', '>=', '<=', '>', '<', '+', '-', '*', '/', '%', '**'];
    for (const op of operators) {
      const program = await parseDSL(`const x = 6 ${op} 3`);
      const decl = getElements(program)[0];
      expect(isProgram(program) && decl?.$type).toBe('VariableDeclaration');
      const expr = (decl as { value: BinaryExpression }).value;
      expect(expr.op).toBe(op);
      const result = evaluateExpression(expr, new Map());
      expect(result, `operator ${op}`).toMatchObject({ canEvaluate: true });
    }
  });
});
