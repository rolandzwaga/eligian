/**
 * Timeline validator follow-ups (audit 2026-10-22, medium #11 and #20).
 *
 * - #11 A property chain used as a time (`at $scope.x..2s`) compiled to a located
 *   TransformError, but the editor showed nothing. The validator now reports it with the
 *   compiler's message, in every time slot of the grammar.
 * - #20 Removing the Typir regex rule also removed the only rejection of an empty or
 *   whitespace-only timeline container selector (parseSelector accepts both).
 */

import { Effect } from 'effect';
import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import {
  CSS_FIXTURES,
  createTestContext,
  setupCSSRegistry,
  type TestContext,
} from '../../__tests__/test-helpers.js';
import { transformAST } from '../../compiler/ast-transformer.js';

const PROPERTY_CHAIN_CODE = 'property_chain_in_time_expression';

describe('TimelineValidator audit follow-ups', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  beforeEach(() => {
    setupCSSRegistry(ctx, 'file:///styles.css', CSS_FIXTURES.common);
  });

  const program = (
    timelineBody: string,
    actionBody = 'selectElement("#app")'
  ) => `styles "./styles.css"

action a() [
  ${actionBody}
]

timeline "test" in "#container" using raf {
  ${timelineBody}
}
`;

  describe('#11 property chains in time expressions', () => {
    test.each([
      ['time range start', 'at $scope.x..2s a()', '$scope.x'],
      ['time range end', 'at 0s..$globaldata.end a()', '$globaldata.end'],
      ['time arithmetic', 'at 0s..(1s + $scope.offset) a()', '$scope.offset'],
      ['stagger delay', 'stagger $scope.d ["#a", "#b"] with a() for 1s', '$scope.d'],
      ['stagger duration', 'stagger 100ms ["#a", "#b"] with a() for $scope.d', '$scope.d'],
      ['sequence duration', 'sequence { a() for $scope.len }', '$scope.len'],
    ])('reports a property chain in a %s, like the compiler', async (_label, body, name) => {
      const { errors, program: ast } = await ctx.parseAndValidate(program(body));
      const reported = errors.filter(e => e.data?.code === PROPERTY_CHAIN_CODE);
      expect(reported).toHaveLength(1);
      expect(reported[0].message).toContain(
        `Property references are not supported in time expressions: ${name}`
      );

      const compiled = await Effect.runPromise(Effect.result(transformAST(ast)));
      expect(compiled._tag).toBe('Failure');
      expect(compiled._tag === 'Failure' && compiled.failure.message).toBe(reported[0].message);
    });

    test('reports a property chain as a navigate position', async () => {
      const { errors } = await ctx.parseAndValidate(
        program('at 0s..1s a()', 'on click "#app" navigate "test" at $scope.pos')
      );
      expect(errors.filter(e => e.data?.code === PROPERTY_CHAIN_CODE)).toHaveLength(1);
    });

    test('does not report property chains outside time expressions', async () => {
      const { errors } = await ctx.parseAndValidate(
        program('at 0s..1s a()', 'selectElement("#app")\n  setData({"v": $operationdata.x})')
      );
      expect(errors.filter(e => e.data?.code === PROPERTY_CHAIN_CODE)).toHaveLength(0);
    });
  });

  describe('#20 empty timeline container selector', () => {
    test.each([
      ['empty', ''],
      ['whitespace-only', '   '],
    ])('reports an %s container selector', async (_label, selector) => {
      const { errors } = await ctx.parseAndValidate(
        program('at 0s..1s a()').replace('in "#container"', `in "${selector}"`)
      );
      const selectorErrors = errors.filter(e => e.data?.code === 'invalid_css_selector_syntax');
      expect(selectorErrors).toHaveLength(1);
      expect(selectorErrors[0].message).toContain('empty');
    });

    test('a non-empty selector gets no syntax error', async () => {
      const { errors } = await ctx.parseAndValidate(program('at 0s..1s a()'));
      expect(errors.filter(e => e.data?.code === 'invalid_css_selector_syntax')).toHaveLength(0);
    });
  });
});
