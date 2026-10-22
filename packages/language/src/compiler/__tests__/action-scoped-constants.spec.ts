/**
 * Action-Scoped Constant Folding Tests
 *
 * Tests constant folding for constants declared within action bodies.
 * These are currently compiled to setVariable operations but should be
 * inlined when their values are evaluable at compile time.
 */

import { Effect } from 'effect';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { beforeAll, describe, expect, test } from 'vitest';
import { createEligianServices } from '../../eligian-module.js';
import type { Program } from '../../generated/ast.js';
import { transformAST } from '../ast-transformer.js';

describe('Action-Scoped Constant Folding', () => {
  let services: ReturnType<typeof createEligianServices>;
  let parse: ReturnType<typeof parseHelper<Program>>;

  beforeAll(async () => {
    services = createEligianServices(EmptyFileSystem);
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

  test('should inline action-scoped literal constant', async () => {
    const code = `
      action test() [
        const MESSAGE = "hello"
        log(@MESSAGE)
      ]

      timeline "test" in ".container" using raf {}
    `;

    const program = await parseDSL(code);
    const result = await Effect.runPromise(transformAST(program));

    const action = result.config.actions[0];
    const logOp = action.startOperations.find(op => op.systemName === 'log');
    const setVarOp = action.startOperations.find(op => op.systemName === 'setVariable');

    // Constant should be inlined
    expect(logOp?.operationData?.logValue).toBe('hello');

    // No setVariable operation should exist
    expect(setVarOp).toBeUndefined();
  });

  test('should inline action-scoped expression constant', async () => {
    const code = `
      action test() [
        const DELAY = 10 + 20
        wait(@DELAY)
      ]

      timeline "test" in ".container" using raf {}
    `;

    const program = await parseDSL(code);
    const result = await Effect.runPromise(transformAST(program));

    const action = result.config.actions[0];
    const waitOp = action.startOperations.find(op => op.systemName === 'wait');
    const setVarOp = action.startOperations.find(op => op.systemName === 'setVariable');

    // Expression should be evaluated and inlined
    expect(waitOp?.operationData?.milliseconds).toBe(30);

    // No setVariable operation
    expect(setVarOp).toBeUndefined();
  });

  test('should handle transitive action-scoped constants', async () => {
    const code = `
      action test() [
        const A = 5
        const B = @A + 3
        log(@B)
      ]

      timeline "test" in ".container" using raf {}
    `;

    const program = await parseDSL(code);
    const result = await Effect.runPromise(transformAST(program));

    const action = result.config.actions[0];
    const logOp = action.startOperations.find(op => op.systemName === 'log');
    const setVarOps = action.startOperations.filter(op => op.systemName === 'setVariable');

    // B should be inlined as 8 (5 + 3)
    expect(logOp?.operationData?.logValue).toBe(8);

    // No setVariable operations
    expect(setVarOps).toHaveLength(0);
  });

  test('should preserve setVariable for non-evaluable expressions', async () => {
    const code = `
      action test(duration) [
        const ADJUSTED = duration + 100
        wait(@ADJUSTED)
      ]

      timeline "test" in ".container" using raf {}
    `;

    const program = await parseDSL(code);
    const result = await Effect.runPromise(transformAST(program));

    const action = result.config.actions[0];
    const setVarOp = action.startOperations.find(op => op.systemName === 'setVariable');
    const waitOp = action.startOperations.find(op => op.systemName === 'wait');

    // Cannot evaluate because 'duration' is a parameter (runtime value)
    // So setVariable should still exist
    expect(setVarOp).toBeDefined();
    expect(setVarOp?.operationData?.name).toBe('ADJUSTED');

    // Reference should still use $scope.variables
    expect(waitOp?.operationData?.milliseconds).toContain('$scope.variables.ADJUSTED');
  });

  test('should handle block-scoped constants in if statement', async () => {
    const code = `
      action test() [
        if (true) {
          const MSG = "true branch"
          log(@MSG)
        } else {
          const MSG = "false branch"
          log(@MSG)
        }
      ]

      timeline "test" in ".container" using raf {}
    `;

    const program = await parseDSL(code);
    const result = await Effect.runPromise(transformAST(program));

    const action = result.config.actions[0];

    // Both MSG constants should be inlined with their respective values
    // Note: The exact structure depends on how if/else is compiled
    // This test verifies that scoping is respected
    const setVarOps = action.startOperations.filter(op => op.systemName === 'setVariable');
    expect(setVarOps).toHaveLength(0);
  });

  test('should handle constants in for loop', async () => {
    const code = `
      action test() [
        for (item in ["a", "b", "c"]) {
          const UPPER = "Item: "
          log(@UPPER)
        }
      ]

      timeline "test" in ".container" using raf {}
    `;

    const program = await parseDSL(code);
    const result = await Effect.runPromise(transformAST(program));

    const action = result.config.actions[0];
    const setVarOps = action.startOperations.filter(op => op.systemName === 'setVariable');

    // UPPER should be inlined, no setVariable
    expect(setVarOps).toHaveLength(0);
  });

  test('should mix global and action-scoped constants', async () => {
    const code = `
      const GLOBAL = 100

      action test() [
        const LOCAL = @GLOBAL + 50
        wait(@LOCAL)
      ]

      timeline "test" in ".container" using raf {}
    `;

    const program = await parseDSL(code);
    const result = await Effect.runPromise(transformAST(program));

    const action = result.config.actions[0];
    const waitOp = action.startOperations.find(op => op.systemName === 'wait');
    const setVarOps = action.startOperations.filter(op => op.systemName === 'setVariable');

    // LOCAL should be evaluated as 100 + 50 = 150
    expect(waitOp?.operationData?.milliseconds).toBe(150);

    // No setVariable operations
    expect(setVarOps).toHaveLength(0);

    // No init actions (GLOBAL is a constant)
    expect(result.config.initActions).toHaveLength(0);
  });

  // C4: an array/object literal const must fold (inline) rather than becoming a
  // runtime setVariable. A `for (x in @arr)` over a runtime scope variable can't
  // be read back through forEach's pushed scope ($scope.variables.* unresolved),
  // so folding the literal is what makes the loop work.
  test('should inline a literal-array constant into the forEach collection', async () => {
    const code = `
      action test() [
        const points = ["#a", "#b", "#c"]
        for (p in @points) {
          selectElement(@@currentItem)
        }
      ]
      timeline "t" in "#root" using raf {}
    `;
    const result = await Effect.runPromise(transformAST(await parseDSL(code)));
    const ops = result.config.actions[0].startOperations;

    // The const must NOT survive as a runtime setVariable.
    expect(ops.filter(op => op.systemName === 'setVariable')).toHaveLength(0);

    // forEach must receive the literal array directly (not a $scope.variables chain).
    const forEachOp = ops.find(op => op.systemName === 'forEach');
    expect(forEachOp?.operationData?.collection).toEqual(['#a', '#b', '#c']);
  });

  test('should inline a literal-object constant (no setVariable)', async () => {
    const code = `
      action test() [
        const cfg = { a: 1, b: "x" }
        setData(@cfg)
      ]
      timeline "t" in "#root" using raf {}
    `;
    const result = await Effect.runPromise(transformAST(await parseDSL(code)));
    const ops = result.config.actions[0].startOperations;
    expect(ops.filter(op => op.systemName === 'setVariable')).toHaveLength(0);
  });

  // Audit 2026-10-22 (high): constants were looked up by name only, so a
  // non-foldable action-local const that shadows a global const of the same
  // name was replaced by the GLOBAL's value. A reference must fold only against
  // the declaration it actually links to.
  describe('local const shadowing a global const', () => {
    const shadowingCode = `
      const x = 1

      action a() [
        const x = $operationdata.foo
        selectElement("#a")
        setElementContent(@x)
        const y = @x + 10
        setElementContent(@y)
      ]

      timeline "t" in "#root" using raf {}
    `;

    test('plain reference resolves to the local runtime variable, not the global value', async () => {
      const result = await Effect.runPromise(transformAST(await parseDSL(shadowingCode)));
      const ops = result.config.actions[0].startOperations;

      const setVarX = ops.find(
        op => op.systemName === 'setVariable' && op.operationData?.name === 'x'
      );
      expect(setVarX?.operationData?.value).toBe('$operationdata.foo');

      const contentOps = ops.filter(op => op.systemName === 'setElementContent');
      expect(contentOps).toHaveLength(2);
      expect(contentOps[0].operationData?.template).toBe('$scope.variables.x');
    });

    test('derived const is not folded against the shadowed global', async () => {
      const result = await Effect.runPromise(transformAST(await parseDSL(shadowingCode)));
      const ops = result.config.actions[0].startOperations;

      // y depends on the runtime local x, so it must stay a runtime variable
      const setVarY = ops.find(
        op => op.systemName === 'setVariable' && op.operationData?.name === 'y'
      );
      expect(setVarY).toBeDefined();
      expect(setVarY?.operationData?.value).not.toBe(11);

      const contentOps = ops.filter(op => op.systemName === 'setElementContent');
      expect(contentOps[1].operationData?.template).toBe('$scope.variables.y');
    });

    test('a global const is still inlined in an action that does not shadow it', async () => {
      const program = await parseDSL(`
        const x = 1

        action a() [
          selectElement("#a")
          setElementContent(@x)
          const y = @x + 10
          setElementContent(@y)
        ]

        timeline "t" in "#root" using raf {}
      `);
      const result = await Effect.runPromise(transformAST(program));
      const ops = result.config.actions[0].startOperations;
      expect(ops.filter(op => op.systemName === 'setVariable')).toHaveLength(0);
      const contentOps = ops.filter(op => op.systemName === 'setElementContent');
      expect(contentOps[0].operationData?.template).toBe(1);
      expect(contentOps[1].operationData?.template).toBe(11);
    });
  });
});
