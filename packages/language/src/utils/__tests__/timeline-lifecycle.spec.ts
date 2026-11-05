/**
 * lifecycleInsertionPoints: where a quick fix inserts into a timeline's
 * `on leave` block or body (spec 058 FR-030).
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from '../../__tests__/test-helpers.js';
import type { Program } from '../../generated/ast.js';
import { lifecycleInsertionPoints } from '../timeline-lifecycle.js';

const charAt = (source: string, position: { line: number; character: number }): string =>
  source.split('\n')[position.line][position.character];

describe('lifecycleInsertionPoints', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  const parse = async (source: string): Promise<Program> =>
    (await ctx.parse(source)).parseResult.value;

  it('with on leave', async () => {
    const source = [
      'action show(selector) [ selectElement(selector) ]',
      '  timeline "Main" in "#stage" using raf {',
      '    on enter [ show("#a") ]',
      '    on leave [ show("#b") ]',
      '    at 0s..1s show("#c")',
      '  }',
    ].join('\n');
    const [point] = lifecycleInsertionPoints(await parse(source));

    expect(point.timeline).toBe('Main');
    expect(point.indent).toBe('  ');
    expect(point.leaveClose).toEqual({ line: 3, character: 26 });
    expect(charAt(source, point.leaveClose!)).toBe(']');
    expect(point.bodyClose).toEqual({ line: 5, character: 2 });
    expect(charAt(source, point.bodyClose)).toBe('}');
  });

  it('without on leave', async () => {
    const source = [
      'action show(selector) [ selectElement(selector) ]',
      'timeline "Main" in "#stage" using raf {',
      '  on enter [ show("#a") ]',
      '  at 0s..1s show("#c") }',
    ].join('\n');
    const [point] = lifecycleInsertionPoints(await parse(source));

    expect(point.leaveClose).toBeUndefined();
    expect(point.indent).toBe('');
    expect(charAt(source, point.bodyClose)).toBe('}');
    expect(point.bodyClose).toEqual({ line: 3, character: 23 });
  });

  it('one entry per timeline, in order', async () => {
    const source = [
      'action show(selector) [ selectElement(selector) ]',
      'timeline "First" in "#a" using raf {',
      '  on leave [ show("#a") ]',
      '}',
      'timeline "Second" in "#b" using raf {',
      '  at 0s..1s show("#b")',
      '}',
    ].join('\n');
    const points = lifecycleInsertionPoints(await parse(source));

    expect(points.map(p => p.timeline)).toEqual(['First', 'Second']);
    expect(points[0].leaveClose).toEqual({ line: 2, character: 24 });
    expect(points[1].leaveClose).toBeUndefined();
    expect(points.map(p => p.bodyClose.line)).toEqual([3, 6]);
  });
});
