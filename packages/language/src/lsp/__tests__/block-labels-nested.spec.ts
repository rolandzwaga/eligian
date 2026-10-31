/**
 * Regression tests for audit low finding #24: array-literal brackets inside the
 * operation blocks must not be mistaken for the block delimiters.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from '../../__tests__/test-helpers.js';
import type { Program } from '../../generated/ast.js';
import { extractBlockLabels } from '../block-labels.js';

describe('extractBlockLabels with nested brackets', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  async function labelsFor(source: string) {
    const document = await ctx.parse(source);
    return extractBlockLabels(document.parseResult.value as Program);
  }

  it('ignores array-literal brackets inside the start block of an endable action', async () => {
    const source = [
      'endable action x() [',
      '  selectElement("#a")',
      '  addClass(["one","two"])',
      '] [',
      '  removeClass("x")',
      ']',
    ].join('\n');

    const labels = await labelsFor(source);

    expect(labels).toHaveLength(1);
    expect(labels[0].startBracketPosition).toEqual({ line: 0, character: 19 });
    expect(labels[0].startBracketClosingPosition).toEqual({ line: 3, character: 0 });
    expect(labels[0].endBracketPosition).toEqual({ line: 3, character: 2 });
    expect(labels[0].endBracketClosingPosition).toEqual({ line: 5, character: 0 });
  });

  it('ignores array-literal brackets in the end block too', async () => {
    const source = [
      'endable action y() [',
      '  selectElement("#a")',
      '] [',
      '  removeClass(["a"])',
      ']',
    ].join('\n');

    const labels = await labelsFor(source);

    expect(labels).toHaveLength(1);
    expect(labels[0].startBracketClosingPosition).toEqual({ line: 2, character: 0 });
    expect(labels[0].endBracketPosition).toEqual({ line: 2, character: 2 });
    expect(labels[0].endBracketClosingPosition).toEqual({ line: 4, character: 0 });
  });

  it('ignores array-literal brackets for inline endable actions', async () => {
    const source = [
      'timeline "t" in "#c" using raf {',
      '  at 0s..4s [',
      '    addClass(["a","b"])',
      '  ] [',
      '    removeClass("x")',
      '  ]',
      '}',
    ].join('\n');

    const labels = await labelsFor(source);

    expect(labels).toHaveLength(1);
    expect(labels[0].type).toBe('timeline');
    expect(labels[0].startBracketPosition).toEqual({ line: 1, character: 12 });
    expect(labels[0].startBracketClosingPosition).toEqual({ line: 3, character: 2 });
    expect(labels[0].endBracketPosition).toEqual({ line: 3, character: 4 });
    expect(labels[0].endBracketClosingPosition).toEqual({ line: 5, character: 2 });
  });
});
