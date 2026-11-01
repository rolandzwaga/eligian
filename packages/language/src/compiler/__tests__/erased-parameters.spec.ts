/**
 * Action parameters survive operations that erase them (found by `eligian
 * smoke`): `selectElement(selector)` removes `selector` from the operation
 * data, so a later use of the parameter `selector` in the same block saw
 * nothing. The parameter is now saved and restored around such operations,
 * only where the block still uses it.
 */
import { Effect } from 'effect';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { beforeAll, describe, expect, test } from 'vitest';
import { createEligianServices } from '../../eligian-module.js';
import type { Program } from '../../generated/ast.js';
import { transformAST } from '../ast-transformer.js';

const SAVE = [
  'setOperationData',
  { properties: { __eligian_param_selector: '$operationdata.selector' } },
];
const RESTORE = [
  'setOperationData',
  { properties: { selector: '$operationdata.__eligian_param_selector' } },
];

describe('erased action parameters', () => {
  let parse: ReturnType<typeof parseHelper<Program>>;

  beforeAll(() => {
    parse = parseHelper<Program>(createEligianServices(EmptyFileSystem).Eligian);
  });

  async function actions(source: string) {
    const document = await parse(source);
    expect(document.parseResult.parserErrors).toEqual([]);
    const ir = await Effect.runPromise(transformAST(document.parseResult.value));
    return Object.fromEntries(
      ir.config.actions.map(a => [
        a.name,
        {
          start: a.startOperations.map(o => [o.systemName, o.operationData ?? null]),
          end: a.endOperations.map(o => [o.systemName, o.operationData ?? null]),
        },
      ])
    );
  }

  test('kept around the operation that erases it when the block uses it again', async () => {
    const result = await actions(`
action inner(selector) [ selectElement(selector) addClass("on") ]
action twice(selector) [ selectElement(selector) addClass("on") selectElement(selector) ]
action forward(selector) [ selectElement(selector) inner(selector) ]
action withBlock(selector) [ with selector { addClass("on") } inner(selector) ]
timeline "t" in "#s" using raf { at 0s..1s twice("#a") }`);
    expect(result.twice.start).toEqual([
      SAVE,
      ['selectElement', null],
      RESTORE,
      ['addClass', { className: 'on' }],
      // The last use: nothing needs it afterwards
      ['selectElement', null],
    ]);
    expect(result.forward.start.slice(0, 3)).toEqual([SAVE, ['selectElement', null], RESTORE]);
    expect(result.withBlock.start.slice(0, 3)).toEqual([
      SAVE,
      ['selectElement', { selector: '$operationdata.selector' }],
      RESTORE,
    ]);
    // inner uses `selector` once: unchanged
    expect(result.inner.start).toEqual([
      ['selectElement', null],
      ['addClass', { className: 'on' }],
    ]);
  });

  test('in a loop every iteration needs it; an end block starts with fresh data', async () => {
    const result = await actions(`
action repeat(selector) [ for (x in [1, 2]) { selectElement(selector) addClass("on") } ]
endable action glow(selector) [ selectElement(selector) addClass("on") ] [ selectElement(selector) removeClass("on") ]
action other(sel) [ selectElement(sel) addClass("on") selectElement(sel) ]
timeline "t" in "#s" using raf { at 0s..1s repeat("#a") }`);
    expect(result.repeat.start.slice(1, 4)).toEqual([SAVE, ['selectElement', null], RESTORE]);
    expect(result.glow.start).toEqual([
      ['selectElement', null],
      ['addClass', { className: 'on' }],
    ]);
    // A parameter no operation erases (`sel`) needs nothing
    expect(result.other.start.map(o => o[0])).toEqual([
      'selectElement',
      'addClass',
      'selectElement',
    ]);
  });
});
