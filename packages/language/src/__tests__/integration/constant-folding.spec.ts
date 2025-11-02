/**
 * Constant Folding Integration Tests
 *
 * End-to-end tests validating that constant folding works correctly
 * across the full compilation pipeline (parse → validate → transform → emit).
 */

import { Effect } from 'effect';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { beforeAll, describe, expect, test } from 'vitest';
import { transformAST } from '../../compiler/ast-transformer.js';
import { createEligianServices } from '../../eligian-module.js';
import type { Program } from '../../generated/ast.js';

describe('Constant Folding - Integration Tests', () => {
  let services: ReturnType<typeof createEligianServices>;
  let parse: ReturnType<typeof parseHelper<Program>>;

  // Expensive setup - runs once per suite
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

  test('US1 Scenario 1: String constant inlined', async () => {
    const code = `
      const MESSAGE = "hello";

      action greet() [
        log(@MESSAGE)
      ]

      timeline "test" in ".container" using raf {}
    `;

    const program = await parseDSL(code);
    const result = await Effect.runPromise(transformAST(program));

    // Verify constant is inlined
    const jsonStr = JSON.stringify(result.config);
    expect(jsonStr).toContain('"hello"');
    expect(jsonStr).not.toContain('$globalData.MESSAGE');
    expect(jsonStr).not.toContain('globaldata.MESSAGE');
  });

  test('US1 Scenario 2: Number constant used in multiple actions', async () => {
    const code = `
      const DELAY = 1000;

      action step1() [
        wait(@DELAY)
      ]

      action step2() [
        wait(@DELAY)
      ]

      timeline "test" in ".container" using raf {}
    `;

    const program = await parseDSL(code);
    const result = await Effect.runPromise(transformAST(program));

    // Find both actions
    const step1 = result.config.actions.find(a => a.name === 'step1');
    const step2 = result.config.actions.find(a => a.name === 'step2');

    expect(step1).toBeDefined();
    expect(step2).toBeDefined();

    // Both should have inlined value
    const wait1 = step1?.startOperations.find(op => op.systemName === 'wait');
    const wait2 = step2?.startOperations.find(op => op.systemName === 'wait');

    expect(wait1?.operationData?.milliseconds).toBe(1000);
    expect(wait2?.operationData?.milliseconds).toBe(1000);

    // No globalData references
    const jsonStr = JSON.stringify(result.config);
    expect(jsonStr).not.toContain('$globalData');
  });

  test('US1 Scenario 3: Boolean constant in conditional', async () => {
    const code = `
      const FLAG = true;

      action test() [
        setVariable("enabled", @FLAG)
      ]

      timeline "test" in ".container" using raf {}
    `;

    const program = await parseDSL(code);
    const result = await Effect.runPromise(transformAST(program));

    const action = result.config.actions[0];
    const setVarOp = action.startOperations.find(op => op.systemName === 'setVariable');

    expect(setVarOp?.operationData?.value).toBe(true);

    const jsonStr = JSON.stringify(result.config);
    expect(jsonStr).not.toContain('$globalData.FLAG');
  });

  test('US2: No init action for constants-only file', async () => {
    const code = `
      const A = "foo";
      const B = 42;
      const C = true;

      timeline "test" in ".container" using raf {}
    `;

    const program = await parseDSL(code);
    const result = await Effect.runPromise(transformAST(program));

    // Verify no init actions generated
    expect(result.config.initActions).toEqual([]);
  });

  test('Type preservation: string "5" vs number 5', async () => {
    const code = `
      const STRING_FIVE = "5";
      const NUMBER_FIVE = 5;

      action test() [
        log(@STRING_FIVE)
        log(@NUMBER_FIVE)
      ]

      timeline "test" in ".container" using raf {}
    `;

    const program = await parseDSL(code);
    const result = await Effect.runPromise(transformAST(program));

    const action = result.config.actions[0];
    const logOps = action.startOperations.filter(op => op.systemName === 'log');

    expect(logOps).toHaveLength(2);
    expect(logOps[0].operationData?.logValue).toBe('5'); // String
    expect(logOps[1].operationData?.logValue).toBe(5); // Number

    expect(typeof logOps[0].operationData?.logValue).toBe('string');
    expect(typeof logOps[1].operationData?.logValue).toBe('number');
  });
  test('US3: Expression evaluation with transitive constants', async () => {
    const code = `      const BASE = 100;      const MULTIPLIER = 2;      const DELAY = @BASE * @MULTIPLIER;      action test() [        wait(@DELAY)      ]      timeline "test" in ".container" using raf {}    `;
    const program = await parseDSL(code);
    const result = await Effect.runPromise(transformAST(program));
    const action = result.config.actions[0];
    const waitOp = action.startOperations.find(op => op.systemName === 'wait');
    expect(waitOp?.operationData?.milliseconds).toBe(200);
    expect(result.config.initActions).toEqual([]);
    const jsonStr = JSON.stringify(result.config);
    expect(jsonStr).not.toContain('$globalData');
  });
});
