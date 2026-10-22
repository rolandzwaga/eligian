/**
 * Unary `!` transformation tests
 *
 * Audit 2026-10-22 (high): `!` was applied with JS semantics to the
 * *transformed* operand. A runtime reference transforms to a property-chain
 * string such as `$operationdata.flag`, so `!flag` silently constant-folded to
 * `false` for every input. `!` must fold only compile-time constants; negating a
 * runtime value outside an if/when condition is a compile error.
 */

import { Effect } from 'effect';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { beforeAll, describe, expect, test } from 'vitest';
import { createEligianServices } from '../../eligian-module.js';
import type { Program } from '../../generated/ast.js';
import { transformAST } from '../ast-transformer.js';

describe('Unary negation (!) in expressions', () => {
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

  const actionWith = (params: string, body: string) => `
    const ON = true

    action ff(${params}) [
      selectElement("#a")
      ${body}
    ]

    timeline "t" in "#root" using raf {}
  `;

  async function setDataProperties(code: string) {
    const result = await Effect.runPromise(transformAST(await parseDSL(code)));
    const ops = result.config.actions[0].startOperations;
    return ops.find(op => op.systemName === 'setData')?.operationData?.properties;
  }

  async function transformError(code: string) {
    const program = await parseDSL(code);
    const result = await Effect.runPromise(Effect.result(transformAST(program)));
    if (result._tag !== 'Failure') {
      throw new Error(`Expected a transform failure, got ${JSON.stringify(result.success)}`);
    }
    return result.failure;
  }

  describe('runtime operands are rejected instead of folding to false', () => {
    test.each([
      ['parameter', 'flag: boolean', 'setData({"a": !flag})'],
      ['numeric parameter', 'n: number', 'setData({"a": !n})'],
      ['system property', '', 'setData({"a": !@@currentItem})'],
      ['property chain', '', 'setData({"a": !$operationdata.flag})'],
    ])('%s', async (_label, params, body) => {
      const error = await transformError(actionWith(params, body));
      expect(error).toMatchObject({ _tag: 'TransformError', kind: 'InvalidExpression' });
      expect((error as { message: string }).message).toContain('Negation');
    });

    test('runtime action variable', async () => {
      const error = await transformError(
        actionWith('', 'const v = $operationdata.foo\n      setData({"a": !@v})')
      );
      expect(error).toMatchObject({ _tag: 'TransformError', kind: 'InvalidExpression' });
    });

    test('carries a source location', async () => {
      const error = await transformError(actionWith('flag', 'setData({"a": !flag})'));
      expect((error as { location?: unknown }).location).toBeDefined();
    });
  });

  describe('compile-time constant operands still fold', () => {
    test.each([
      ['!true', false],
      ['!false', true],
      ['!0', true],
      ['!1', false],
      ['!""', true],
      ['!"x"', false],
      ['!null', true],
      ['!@ON', false],
      ['!!@ON', true],
      ['!(1 > 2)', true],
    ])('%s', async (expr, expected) => {
      const properties = await setDataProperties(actionWith('', `setData({"a": ${expr}})`));
      expect(properties).toEqual({ a: expected });
    });

    test('a string constant that looks like a property chain folds by value', async () => {
      const properties = await setDataProperties(
        actionWith('', 'const str = "$operationdata.flag"\n      setData({"a": !@str})')
      );
      expect(properties).toEqual({ a: false });
    });
  });
});
