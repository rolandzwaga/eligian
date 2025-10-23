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
});
