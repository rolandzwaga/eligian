import { Effect } from 'effect';
import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { transformAST } from '../compiler/ast-transformer.js';
import { isEventActionDefinition } from '../generated/ast.js';
import {
  CSS_FIXTURES,
  createTestContext,
  setupCSSRegistry,
  type TestContext,
} from './test-helpers.js';

/**
 * Audit finding #76: the grammar doc comments and LANGUAGE_SPEC showed syntax the
 * grammar rejected.
 *
 * - Stagger: the docs now show `with fadeIn() for 2s` (StaggerBlock takes an
 *   OperationCall, which needs parentheses).
 * - Event actions: zero-parameter event actions may omit the parentheses, matching
 *   regular and endable actions, so the documented
 *   `on event "timeline-complete" action ShowCompletionMessage [` parses.
 */
describe('documented grammar examples parse (audit #76)', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  beforeEach(() => {
    setupCSSRegistry(ctx, 'file:///styles.css', {
      classes: [...(CSS_FIXTURES.common.classes ?? []), 'item-1', 'item-2', 'item-3'],
      ids: [...(CSS_FIXTURES.common.ids ?? []), 'completion-overlay'],
    });
  });

  describe('zero-parameter event actions', () => {
    const withoutParens = `styles "./styles.css"

on event "timeline-complete" action ShowCompletionMessage [
  selectElement("#completion-overlay")
  removeClass("hidden")
]

timeline "t" in "#app" using raf {}
`;

    test('parse and validate without parentheses', async () => {
      const { document, errors, program } = await ctx.parseAndValidate(withoutParens);

      expect(document.parseResult.parserErrors).toHaveLength(0);
      expect(errors).toHaveLength(0);
      const eventAction = program.statements.find(isEventActionDefinition);
      expect(eventAction?.name).toBe('ShowCompletionMessage');
      expect(eventAction?.parameters).toHaveLength(0);
    });

    test('compile identically with and without parentheses', async () => {
      const withParens = withoutParens.replace(
        'action ShowCompletionMessage [',
        'action ShowCompletionMessage() ['
      );
      const compileEventActions = async (source: string) => {
        const document = await ctx.parse(source);
        expect(document.parseResult.parserErrors).toHaveLength(0);
        const { config } = await Effect.runPromise(transformAST(document.parseResult.value));
        return (config.eventActions ?? []).map(({ id: _id, startOperations, ...rest }) => ({
          ...rest,
          startOperations: startOperations.map(({ systemName, operationData }) => ({
            systemName,
            operationData,
          })),
        }));
      };

      const bare = await compileEventActions(withoutParens);
      expect(bare).toHaveLength(1);
      expect(bare[0]).toMatchObject({
        name: 'ShowCompletionMessage',
        eventName: 'timeline-complete',
      });
      expect(bare).toEqual(await compileEventActions(withParens));
    });

    test('parameterised event actions still parse with parentheses', async () => {
      const { document, errors } = await ctx.parseAndValidate(`styles "./styles.css"

on event "language-change" action UpdateLanguageDisplay(languageCode) [
  selectElement("#app")
  setElementContent(languageCode)
]

timeline "t" in "#app" using raf {}
`);
      expect(document.parseResult.parserErrors).toHaveLength(0);
      expect(errors).toHaveLength(0);
    });
  });

  describe('stagger with an action call', () => {
    const program = (staggerLine: string) => `styles "./styles.css"

action fadeIn(selector: string) [
  selectElement(selector)
  addClass("visible")
]

timeline "t" in "#app" using raf {
  ${staggerLine}
}
`;

    test('the documented `with fadeIn() for 2s` form parses and validates', async () => {
      const { document, errors } = await ctx.parseAndValidate(
        program('stagger 200ms [".item-1", ".item-2", ".item-3"] with fadeIn() for 2s')
      );

      expect(document.parseResult.parserErrors).toHaveLength(0);
      expect(errors).toHaveLength(0);
    });

    test('a paren-less action call after `with` is (still) a parse error', async () => {
      const document = await ctx.parse(
        program('stagger 200ms [".item-1", ".item-2", ".item-3"] with fadeIn for 2s')
      );

      expect(document.parseResult.parserErrors.length).toBeGreaterThan(0);
    });
  });
});
