// @vitest-environment jsdom
/// <reference lib="dom" />
// jsdom: the compiled operations are executed with the real `eligius` runtime, which needs a
// window/document.
import { Effect } from 'effect';
import type { TOperation } from 'eligius';
import * as eligius from 'eligius';
import $ from 'jquery';
import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import {
  CSS_FIXTURES,
  createTestContext,
  setupCSSRegistry,
  type TestContext,
} from '../../__tests__/test-helpers.js';
import { isIfStatement, type Program } from '../../generated/ast.js';
import { transformAST } from '../ast-transformer.js';
import type { OperationConfigIR } from '../types/eligius-ir.js';

/**
 * Audit finding #71: `else if (...) { ... }` chains.
 *
 * `else if` is sugar for `else { if (...) { ... } }`: the nested IfStatement is the
 * else branch's only statement, so it compiles to a when/otherwise/endWhen nested
 * inside the outer otherwise. These tests check the parse, the compiled structure,
 * validation, and that the real Eligius runtime picks exactly one branch.
 */
describe('else-if chains (audit #71)', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  beforeEach(() => {
    setupCSSRegistry(ctx, 'file:///styles.css', {
      ids: CSS_FIXTURES.common.ids,
      classes: [
        ...(CSS_FIXTURES.common.classes ?? []),
        'mode-a',
        'mode-b',
        'mode-c',
        'mode-default',
      ],
    });
    document.body.innerHTML = '<div id="box"></div>';
  });

  const CHAIN = `
    if (mode == "a") {
      addClass("mode-a")
    } else if (mode == "b") {
      addClass("mode-b")
    } else if (mode == "c") {
      addClass("mode-c")
    } else {
      addClass("mode-default")
    }`;

  function program(body: string): string {
    return `styles "./styles.css"

action showMode(mode: string) [
  selectElement("#box")
  ${body}
]

timeline "t" in "#box" using raf {
  at 0s..1s showMode("a")
}
`;
  }

  async function parseProgram(source: string): Promise<Program> {
    const document = await ctx.parse(source);
    expect(document.parseResult.lexerErrors).toHaveLength(0);
    expect(document.parseResult.parserErrors).toHaveLength(0);
    return document.parseResult.value;
  }

  async function compileOps(body: string): Promise<OperationConfigIR[]> {
    const ast = await parseProgram(program(body));
    const { config } = await Effect.runPromise(transformAST(ast));
    const action = config.actions.find(a => a.name === 'showMode');
    expect(action).toBeDefined();
    return [...(action!.startOperations as OperationConfigIR[])];
  }

  const names = (ops: readonly OperationConfigIR[]) => ops.map(op => op.systemName);

  test('parses an else-if chain as an IfStatement nested in the else branch', async () => {
    const ast = await parseProgram(program(CHAIN));
    const action = ast.statements.find(s => s.$type === 'RegularActionDefinition') as any;
    const outer = action.operations[1];
    expect(isIfStatement(outer)).toBe(true);
    expect(outer.elseOps).toHaveLength(1);
    const second = outer.elseOps[0];
    expect(isIfStatement(second)).toBe(true);
    expect(second.elseOps).toHaveLength(1);
    const third = second.elseOps[0];
    expect(isIfStatement(third)).toBe(true);
    // The final plain `else { ... }` stays a list of statements
    expect(third.elseOps).toHaveLength(1);
    expect(isIfStatement(third.elseOps[0])).toBe(false);
  });

  test('an else-if chain validates without errors', async () => {
    const { errors } = await ctx.parseAndValidate(program(CHAIN));
    expect(errors).toHaveLength(0);
  });

  test('compiles to when/otherwise/endWhen nested inside the outer otherwise', async () => {
    const ops = await compileOps(CHAIN);

    expect(names(ops)).toEqual([
      'selectElement',
      'when',
      'addClass',
      'otherwise',
      'when',
      'addClass',
      'otherwise',
      'when',
      'addClass',
      'otherwise',
      'addClass',
      'endWhen',
      'endWhen',
      'endWhen',
    ]);
    expect(ops.filter(op => op.systemName === 'when').map(op => op.operationData)).toEqual([
      { expression: "$operationdata.mode == 'a'" },
      { expression: "$operationdata.mode == 'b'" },
      { expression: "$operationdata.mode == 'c'" },
    ]);
  });

  test('compiles identically to the explicit nested else { if ... } form', async () => {
    const sugar = await compileOps(`
      if (mode == "a") { addClass("mode-a") } else if (mode == "b") { addClass("mode-b") }`);
    const explicit = await compileOps(`
      if (mode == "a") { addClass("mode-a") } else { if (mode == "b") { addClass("mode-b") } }`);

    const strip = (ops: OperationConfigIR[]) =>
      ops.map(({ systemName, operationData }) => ({ systemName, operationData }));
    expect(strip(sugar)).toEqual(strip(explicit));
  });

  test('an else-if without a final else omits the inner otherwise', async () => {
    const ops = await compileOps(`
      if (mode == "a") { addClass("mode-a") } else if (mode == "b") { addClass("mode-b") }`);

    expect(names(ops)).toEqual([
      'selectElement',
      'when',
      'addClass',
      'otherwise',
      'when',
      'addClass',
      'endWhen',
      'endWhen',
    ]);
  });

  test('`else if` without braces around a non-if statement is still a parse error', async () => {
    const document = await ctx.parse(
      program('if (mode == "a") { addClass("mode-a") } else addClass("mode-b")')
    );
    expect(document.parseResult.parserErrors.length).toBeGreaterThan(0);
  });

  describe('runtime (real Eligius Action)', () => {
    /** Resolves the IR operations to Eligius operation instances and runs them. */
    async function runAction(ops: readonly OperationConfigIR[], mode: string) {
      const operations = ops.map(op => ({
        id: op.id,
        systemName: op.systemName,
        operationData: structuredClone(op.operationData ?? {}),
        instance: (eligius as unknown as Record<string, TOperation | undefined>)[op.systemName]!,
      }));
      for (const op of operations) {
        expect(op.instance, `eligius operation ${op.systemName}`).toBeTypeOf('function');
      }
      const eventbus = {
        request: (name: string) => (name === 'request-engine-root' ? $(document.body) : undefined),
      };
      const action = new eligius.Action('showMode', operations as any, eventbus as any);
      await action.start({ mode });
    }

    test.each([
      ['a', 'mode-a'],
      ['b', 'mode-b'],
      ['c', 'mode-c'],
      ['z', 'mode-default'],
    ])('mode %s runs exactly the %s branch', async (mode, expectedClass) => {
      const ops = await compileOps(CHAIN);

      await runAction(ops, mode);

      const box = document.querySelector('#box')!;
      expect([...box.classList]).toEqual([expectedClass]);
    });

    test('execution continues after the chain in every branch', async () => {
      // A trailing operation after the chain must still run in every branch.
      const ops = await compileOps(`${CHAIN}\n  addClass("after")`);
      expect(ops[ops.length - 1]?.systemName).toBe('addClass');

      for (const mode of ['a', 'b', 'c', 'z']) {
        document.body.innerHTML = '<div id="box"></div>';
        await runAction(ops, mode);
        expect(document.querySelector('#box')!.classList.contains('after')).toBe(true);
      }
    });
  });
});
