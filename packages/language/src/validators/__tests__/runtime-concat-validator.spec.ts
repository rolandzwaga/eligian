/**
 * Expression validator: runtime string concatenation (`"#" + id`).
 *
 * The compiler lowers a runtime concatenation to Eligius's concatenateStrings operation
 * (compiler/transformers/runtime-values.ts) where it can place the extra operations, and
 * rejects it elsewhere. The editor must accept and reject the same programs, with the same
 * messages, so every case is also compiled.
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
  RUNTIME_CONCAT_CONTEXT_MESSAGE,
  RUNTIME_CONCAT_OPERAND_MESSAGE,
} from '../../compiler/runtime-concat.js';
import {
  RUNTIME_CONCAT_CONTEXT_CODE,
  RUNTIME_CONCAT_OPERAND_CODE,
  RUNTIME_OPERATOR_CODE,
} from '../expression-validator.js';

const CODES = new Set([
  RUNTIME_CONCAT_CONTEXT_CODE,
  RUNTIME_CONCAT_OPERAND_CODE,
  RUNTIME_OPERATOR_CODE,
]);

type Param = { name: string; type?: string };

describe('ExpressionValidator: runtime string concatenation', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  beforeEach(() => {
    setupCSSRegistry(ctx, 'file:///styles.css', CSS_FIXTURES.common);
  });

  const program = (actionBody: string, params: Param[] = [{ name: 'id' }], globals = '') =>
    `${globals}\n\n${minimalProgram({
      cssImport: true,
      containerSelector: '#container',
      actionParams: params,
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
    return { errors, compiled, document };
  }

  describe('accepted by editor and compiler', () => {
    test.each([
      ['selector from a parameter', 'selectElement("#" + id)'],
      ['several parts', 'setElementContent("Slide " + id + " of " + 10)'],
      ['inside an object argument', 'setStyle({ width: id + "px" })'],
      ['inside an array argument', 'log(["#" + id])'],
      ['action-level const', 'const sel = "#" + id\n  selectElement(@sel)'],
      ['nested concatenation in parentheses', 'log("a" + ("b" + id))'],
      ['system property', 'log("item " + @@loopIndex)'],
      ['property chain', 'log("x" + $globaldata.x)'],
    ])('%s', async (_name, body) => {
      const { errors, compiled } = await check(program(body));
      expect(errors.map(e => e.message)).toEqual([]);
      expect(compiled._tag).toBe('Success');
    });

    test('two parameters when one is annotated as string', async () => {
      const { errors, compiled } = await check(
        program('selectElement(prefix + id)', [{ name: 'prefix', type: 'string' }, { name: 'id' }])
      );
      expect(errors).toEqual([]);
      expect(compiled._tag).toBe('Success');
    });

    test('a string const operand makes it a concatenation', async () => {
      const { errors, compiled } = await check(
        program('selectElement(@HASH + id)', [{ name: 'id' }], 'const HASH = "#"')
      );
      expect(errors).toEqual([]);
      expect(compiled._tag).toBe('Success');
    });
  });

  describe('rejected by editor and compiler with the same message', () => {
    test('outside the places the compiler can lower it', async () => {
      const { errors, compiled } = await check(program('for (x in "a" + id) { log() }'));

      expect(errors).toHaveLength(1);
      expect(errors[0].data?.code).toBe(RUNTIME_CONCAT_CONTEXT_CODE);
      expect(errors[0].message).toBe(RUNTIME_CONCAT_CONTEXT_MESSAGE);
      expect(compiled._tag).toBe('Failure');
      if (compiled._tag === 'Failure') {
        expect(compiled.failure.message).toBe(RUNTIME_CONCAT_CONTEXT_MESSAGE);
      }
    });

    test('a program-level const from a runtime value', async () => {
      const code = `const SEL = "#" + $globaldata.id\n${program('log()')}`;
      const { errors, compiled } = await check(code);

      expect(errors.map(e => e.data?.code)).toEqual([RUNTIME_CONCAT_CONTEXT_CODE]);
      expect(compiled._tag).toBe('Failure');
    });

    test('an object operand, reported on the operand', async () => {
      const { errors, compiled, document } = await check(program('log("a" + id + { k: 1 })'));

      expect(errors).toHaveLength(1);
      expect(errors[0].data?.code).toBe(RUNTIME_CONCAT_OPERAND_CODE);
      expect(errors[0].message).toBe(RUNTIME_CONCAT_OPERAND_MESSAGE);
      const text = document.textDocument.getText(errors[0].range);
      expect(text).toBe('{ k: 1 }');
      expect(compiled._tag).toBe('Failure');
      if (compiled._tag === 'Failure') {
        expect(compiled.failure.message).toBe(RUNTIME_CONCAT_OPERAND_MESSAGE);
      }
    });

    test('a chain is reported once, on its outermost +', async () => {
      const { errors, document } = await check(program('for (x in "a" + id + "b" + id) { log() }'));

      expect(errors).toHaveLength(1);
      expect(document.textDocument.getText(errors[0].range)).toBe('"a" + id + "b" + id');
    });

    test('untyped parameters are added, not concatenated, with a hint', async () => {
      const { errors, compiled } = await check(
        program('log(a + b)', [{ name: 'a' }, { name: 'b' }])
      );

      expect(errors).toHaveLength(1);
      expect(errors[0].data?.code).toBe(RUNTIME_OPERATOR_CODE);
      expect(errors[0].message).toContain('For string concatenation');
      expect(compiled._tag).toBe('Failure');
    });

    test('addition before the first string is reported on the addition', async () => {
      const { errors, document } = await check(
        program('log(a + b + "px")', [{ name: 'a' }, { name: 'b' }])
      );

      expect(errors).toHaveLength(1);
      expect(document.textDocument.getText(errors[0].range)).toBe('a + b');
    });
  });
});
