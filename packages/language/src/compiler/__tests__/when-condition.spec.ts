// @vitest-environment jsdom
// jsdom: importing the `eligius` runtime (for its `when` operation) requires a window/document.
import { Effect } from 'effect';
import { type IOperationScope, setGlobalData, when } from 'eligius';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { beforeAll, describe, expect, test } from 'vitest';
import { createEligianServices } from '../../eligian-module.js';
import type { Program } from '../../generated/ast.js';
import { transformAST } from '../ast-transformer.js';
import { compile } from '../pipeline.js';
import type { OperationConfigIR } from '../types/eligius-ir.js';

/**
 * `if` conditions compile to the Eligius 3 `when` operation, which takes
 * `operationData: { expression: string }` and parses it with its own expression grammar
 * (operands: numbers, single-quoted strings, true/false/null, $operationdata./$globaldata./
 * $scope. chains; operators: ! == != > < >= <= && ||; parentheses).
 */
describe('if → when condition expression (Eligius 3)', () => {
  let parse: ReturnType<typeof parseHelper<Program>>;

  beforeAll(() => {
    parse = parseHelper<Program>(createEligianServices(EmptyFileSystem).Eligian);
  });

  async function whenOps(actionBody: string, params = ''): Promise<OperationConfigIR[]> {
    const document = await parse(`
      action test(${params}) [
        ${actionBody}
      ]
      timeline "test" in ".test-container" using raf {}
    `);
    expect(document.parseResult.parserErrors).toHaveLength(0);
    const result = await Effect.runPromise(transformAST(document.parseResult.value));
    return result.config.actions[0].startOperations.filter(op => op.systemName === 'when');
  }

  async function whenExpression(condition: string, params = '', setup = ''): Promise<unknown> {
    const ops = await whenOps(`${setup}\nif (${condition}) { log() }`, params);
    expect(ops).toHaveLength(1);
    return ops[0].operationData.expression;
  }

  /** Runs the expression through Eligius's own `when` operation and returns the evaluation. */
  function evaluateWithEligius(
    expression: unknown,
    operationData: Record<string, unknown> = {},
    variables: Record<string, unknown> = {}
  ): boolean | undefined {
    const scope = { variables, operations: [], currentIndex: 0 } as unknown as IOperationScope;
    when.call(scope, { ...operationData, expression } as any);
    return scope.whenEvaluation;
  }

  test('bug 1: emits operationData.expression (not condition)', async () => {
    const [op] = await whenOps('if ($operationdata.flag) { log() }');

    expect(op.operationData).toEqual({ expression: '$operationdata.flag' });
  });

  test('bug 2: property chains are unquoted and strings single-quoted', async () => {
    expect(await whenExpression('count > 5', 'count')).toBe('$operationdata.count > 5');
    expect(await whenExpression('$scope.variables.name == "John"')).toBe(
      "$scope.variables.name == 'John'"
    );
    expect(
      await whenExpression('$operationdata.a >= 1 && ($operationdata.b != "x" || @@loopIndex < 3)')
    ).toBe("$operationdata.a >= 1 && ($operationdata.b != 'x' || $scope.loopIndex < 3)");
  });

  test('bug 3: ! on a runtime operand is emitted as text, not folded', async () => {
    expect(await whenExpression('!$operationdata.done')).toBe('!$operationdata.done');
    expect(await whenExpression('!@flag', '', 'const flag = $operationdata.flag')).toBe(
      '!$scope.variables.flag'
    );
    expect(await whenExpression('!($operationdata.a == 1)')).toBe('!($operationdata.a == 1)');
    // A literal operand still folds
    expect(await whenExpression('!$operationdata.a && !true')).toBe('!$operationdata.a && false');
  });

  test('bug 4: a condition folded to a constant is emitted as an expression string', async () => {
    expect(await whenExpression('10 > 5')).toBe('true');
    expect(await whenExpression('1 > 5')).toBe('false');
    expect(await whenExpression('!true')).toBe('false');
    expect(evaluateWithEligius('true')).toBe(true);
    expect(evaluateWithEligius('false')).toBe(false);
  });

  test('constants inline as literals, program-level variables read globaldata', async () => {
    const document = await parse(`
      const limit = 5
      const mode = "demo"
      const items = [$globaldata.first, "b"]
      action test [
        if ($operationdata.count > @limit && @mode == $globaldata.mode && @items) { log() }
      ]
      timeline "test" in ".test-container" using raf {}
    `);
    const result = await Effect.runPromise(transformAST(document.parseResult.value));
    const op = result.config.actions[0].startOperations.find(o => o.systemName === 'when');

    expect(op?.operationData.expression).toBe(
      "$operationdata.count > 5 && 'demo' == $globaldata.mode && $globaldata.items"
    );
  });

  test('arithmetic on a runtime operand is rejected (Eligius has no arithmetic)', async () => {
    const document = await parse(`
      action test(count) [
        if (count + 1 > 5) { log() }
      ]
      timeline "test" in ".test-container" using raf {}
    `);
    const error = await Effect.runPromise(Effect.flip(transformAST(document.parseResult.value)));

    expect(error).toMatchObject({ _tag: 'TransformError', kind: 'InvalidExpression' });
  });

  test.each([
    ['unary minus on a runtime operand', '-count > 1'],
    ['an object literal', '{ a: 1 }'],
    ['a string a quote would end early', `count == "it' s"`],
  ])('rejects %s', async (_label, condition) => {
    const document = await parse(`
      action test(count) [
        if (${condition}) { log() }
      ]
      timeline "test" in ".test-container" using raf {}
    `);
    const error = await Effect.runPromise(Effect.flip(transformAST(document.parseResult.value)));

    expect(error).toMatchObject({ _tag: 'TransformError', kind: 'InvalidExpression' });
  });

  test('non-condition expressions are unchanged (operation arguments keep transformExpression)', async () => {
    const document = await parse(`
      action test(count) [
        setVariable("x", !true)
        setVariable("y", 10 > 5)
      ]
      timeline "test" in ".test-container" using raf {}
    `);
    const result = await Effect.runPromise(transformAST(document.parseResult.value));
    const ops = result.config.actions[0].startOperations;

    expect(ops.map(op => op.operationData.value)).toEqual([false, true]);
  });

  describe('end-to-end compile, evaluated by Eligius', () => {
    const source = `styles "./styles.css"
      action test(done) [
        const count = $operationdata.count
        if ((@count > 5 && !done) || $globaldata.mode == "demo") {
          log()
        }
      ]
      timeline "test" in ".test-container" using raf {
        at 0s..1s test(false)
      }
    `;

    test('nested condition compiles to a single valid Eligius expression', async () => {
      const config = await Effect.runPromise(compile(source));
      const ops = config.actions[0].startOperations;
      const whenOp = ops.find(op => op.systemName === 'when');
      const expression = whenOp?.operationData.expression;

      expect(whenOp?.operationData).toEqual({ expression });
      expect(expression).toBe(
        "($scope.variables.count > 5 && !$operationdata.done) || $globaldata.mode == 'demo'"
      );

      expect(evaluateWithEligius(expression, { done: false }, { count: 6 })).toBe(true);
      // Falls through to $globaldata.mode, which is not 'demo' yet
      expect(evaluateWithEligius(expression, { done: true }, { count: 6 })).toBe(false);
      setGlobalData({ mode: 'demo', propertyNames: ['mode'] } as any);
      expect(evaluateWithEligius(expression, { done: true }, { count: 1 })).toBe(true);
    });
  });
});
