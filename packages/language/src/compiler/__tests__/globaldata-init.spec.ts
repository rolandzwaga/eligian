// @vitest-environment jsdom
// jsdom: the init action is executed with the real `eligius` setData operation.
import { Effect } from 'effect';
import { type IOperationScope, setData } from 'eligius';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { beforeAll, describe, expect, test } from 'vitest';
import { createEligianServices } from '../../eligian-module.js';
import type { Program } from '../../generated/ast.js';
import { transformAST } from '../ast-transformer.js';

/**
 * Regression: a program-level const whose value is only known at runtime is
 * stored by an init action's setData. Its target key was `globaldata.x`, which
 * Eligius rejects ("Unrecognized target: lobaldata"): setData reads the target
 * as the first key segment minus its first character, so it must be `$globaldata.x`.
 */
describe('program-level runtime consts (init setData)', () => {
  let parse: ReturnType<typeof parseHelper<Program>>;

  beforeAll(() => {
    parse = parseHelper<Program>(createEligianServices(EmptyFileSystem).Eligian);
  });

  test('the init action writes global data that Eligius accepts', async () => {
    const doc = await parse(`
      const items = [$globaldata.first, "b"]
      timeline "t" in ".c" using raf {}
    `);
    const { config } = await Effect.runPromise(transformAST(doc.parseResult.value));
    const [init] = config.initActions ?? [];
    const [operation] = init.startOperations;

    expect(operation.systemName).toBe('setData');
    expect(Object.keys(operation.operationData?.properties as object)).toEqual([
      '$globaldata.items',
    ]);

    const scope = { variables: {}, operations: [], currentIndex: 0 } as unknown as IOperationScope;
    expect(() =>
      setData.call(scope, structuredClone(operation.operationData) as never)
    ).not.toThrow();
  });
});
