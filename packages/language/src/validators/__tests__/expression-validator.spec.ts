/**
 * Expression validator: unary `!` on runtime values
 *
 * The compiler folds `!` only for compile-time constants and rejects it on a runtime operand
 * outside an `if` condition (expression-transformer.ts, `'!'` case). This validator reports the
 * same rule in the editor so the document is not shown clean while compilation fails.
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
import { RUNTIME_NEGATION_CODE, RUNTIME_NEGATION_MESSAGE } from '../expression-validator.js';

describe('ExpressionValidator: runtime negation', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  beforeEach(() => {
    setupCSSRegistry(ctx, 'file:///styles.css', CSS_FIXTURES.common);
  });

  const program = (actionBody: string, params: Array<{ name: string; type?: string }> = []) =>
    `const ON = true\nconst OFF = !@ON\n\n${minimalProgram({
      cssImport: true,
      containerSelector: '#container',
      actionParams: params,
      actionBody: `selectElement("#app")\n  ${actionBody}`,
      timelineBody: 'at 0s..1s testAction()',
    })}`;

  async function validate(code: string) {
    const { diagnostics, document, program: ast } = await ctx.parseAndValidate(code);
    expect(document.parseResult.parserErrors).toHaveLength(0);
    const errors = diagnostics.filter(
      d => d.severity === DiagnosticSeverity.Error && d.data?.code === RUNTIME_NEGATION_CODE
    );
    return { errors, ast };
  }

  const negationErrors = async (code: string) => (await validate(code)).errors;

  describe('rejects negation of runtime values', () => {
    test.each([
      ['parameter', 'setData({"a": !flag})', [{ name: 'flag', type: 'boolean' }]],
      ['system property', 'setData({"a": !@@currentItem})', []],
      ['property chain', 'setData({"a": !$operationdata.flag})', []],
      ['runtime action variable', 'const v = $operationdata.foo\n  setData({"a": !@v})', []],
      [
        'negation nested in a binary expression',
        'setData({"a": !(flag && true)})',
        [{ name: 'flag' }],
      ],
    ])('%s', async (_label, body, params) => {
      const errors = await negationErrors(program(body, params));
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toBe(RUNTIME_NEGATION_MESSAGE);
    });

    test('reports only the innermost negation of !!runtime', async () => {
      const errors = await negationErrors(
        program('setData({"a": !!flag})', [{ name: 'flag', type: 'boolean' }])
      );
      expect(errors).toHaveLength(1);
    });

    test('diagnostic range covers the unary expression', async () => {
      const body = 'setData({"a": !flag})';
      const code = program(body, [{ name: 'flag', type: 'boolean' }]);
      const errors = await negationErrors(code);
      expect(errors).toHaveLength(1);

      const lines = code.split('\n');
      const line = lines.findIndex(l => l.includes(body));
      const start = lines[line].indexOf('!flag');
      expect(errors[0].range).toEqual({
        start: { line, character: start },
        end: { line, character: start + '!flag'.length },
      });
    });
  });

  describe('accepts compile-time constants', () => {
    test.each([
      ['boolean literal', 'setData({"a": !true})'],
      ['number literal', 'setData({"a": !0})'],
      ['global const literal', 'setData({"a": !@ON})'],
      ['global const derived from a const', 'setData({"a": !@OFF})'],
      ['double negation of a const', 'setData({"a": !!@ON})'],
      ['action const literal', 'const local = "x"\n  setData({"a": !@local})'],
      ['constant comparison', 'setData({"a": !(1 > 2)})'],
    ])('%s', async (_label, body) => {
      expect(await negationErrors(program(body))).toHaveLength(0);
    });
  });

  describe('accepts runtime negation inside if conditions', () => {
    test('parameter in an action-level if condition', async () => {
      const errors = await negationErrors(
        program('if (!flag) {\n    selectElement("#app")\n  }', [{ name: 'flag', type: 'boolean' }])
      );
      expect(errors).toHaveLength(0);
    });

    test('negation nested inside a compound condition', async () => {
      const errors = await negationErrors(
        program('if (!flag && !$operationdata.other) {\n    selectElement("#app")\n  }', [
          { name: 'flag', type: 'boolean' },
        ])
      );
      expect(errors).toHaveLength(0);
    });

    test('a when() expression string is not an AST negation', async () => {
      const errors = await negationErrors(
        program('when("!$operationdata.flag")\n  selectElement("#app")\n  endWhen()')
      );
      expect(errors).toHaveLength(0);
    });

    test('rejects negation passed as a when() argument (not an if condition)', async () => {
      const errors = await negationErrors(
        program('when(!flag)\n  selectElement("#app")\n  endWhen()', [{ name: 'flag' }])
      );
      expect(errors).toHaveLength(1);
    });

    test('still rejects negation in the body of an if', async () => {
      const errors = await negationErrors(
        program('if (true) {\n    setData({"a": !flag})\n  }', [{ name: 'flag' }])
      );
      expect(errors).toHaveLength(1);
    });
  });

  /**
   * The validator must flag exactly what the compiler rejects for negation, so the editor and
   * the compile result never disagree on these cases.
   */
  describe('agrees with the compiler', () => {
    const flag = [{ name: 'flag', type: 'boolean' }];
    test.each([
      ['setData({"a": !flag})', flag, true],
      ['setData({"a": !@@currentItem})', [], true],
      ['setData({"a": !$operationdata.flag})', [], true],
      ['const v = $operationdata.foo\n  setData({"a": !@v})', [], true],
      ['setData({"a": !!flag})', flag, true],
      ['when(!flag)\n  selectElement("#app")\n  endWhen()', flag, true],
      ['setData({"a": !@ON})', [], false],
      ['setData({"a": !!@ON})', [], false],
      ['const local = 1\n  setData({"a": !@local})', [], false],
      ['if (!flag) {\n    selectElement("#app")\n  }', flag, false],
      ['when("!$operationdata.flag")\n  selectElement("#app")\n  endWhen()', [], false],
    ])('%s', async (body, params, rejected) => {
      const { errors, ast } = await validate(program(body, params));
      const result = await Effect.runPromise(Effect.result(transformAST(ast)));

      expect(errors.length > 0).toBe(rejected);
      if (rejected) {
        expect(result._tag).toBe('Failure');
        expect(result._tag === 'Failure' && result.failure.message).toBe(RUNTIME_NEGATION_MESSAGE);
      } else {
        expect(result._tag).toBe('Success');
      }
    });
  });
});
