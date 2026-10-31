/**
 * Control-flow pairing and erased-property checks for event actions and
 * inline stagger blocks.
 *
 * Regression tests for the audit finding "Control-flow pairing and
 * erased-property checks are not applied to event actions or stagger inline
 * blocks": a raw `when(...)` without `endWhen`, or an operation whose
 * operationData dependency was never created, was reported inside regular,
 * endable and inline endable actions but passed silently in
 * `on event ... action` bodies and in `stagger ... [ ] [ ]` blocks.
 */
import { beforeAll, describe, expect, test } from 'vitest';
import { createTestContext, DiagnosticSeverity, type TestContext } from './test-helpers.js';

const CONTROL_FLOW_CODE = 'control_flow';
const MISSING_DEPENDENCY_CODE = 'missing-dependency';

describe('Operation-sequence checks for event actions and stagger blocks', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  async function errorCodes(code: string): Promise<string[]> {
    const { document, errors } = await ctx.parseAndValidate(code);
    expect(document.parseResult.parserErrors).toEqual([]);
    return errors
      .filter(e => e.severity === DiagnosticSeverity.Error)
      .map(e => String(e.code ?? e.data?.code));
  }

  const timeline = (body: string) => `
    const items = ["a", "b"]
    action noop() [ log("x") ]
    timeline "t" in "#app" using raf {
      at 0s..1s noop()
      ${body}
    }
  `;

  describe('event actions', () => {
    test('reports an unclosed raw when()', async () => {
      const codes = await errorCodes(`
        on event "language-change" action hh(l) [
          when(@@currentItem)
        ]
        ${timeline('')}
      `);
      expect(codes).toContain(CONTROL_FLOW_CODE);
    });

    test('reports an unmatched endForEach', async () => {
      const codes = await errorCodes(`
        on event "language-change" action hh(l) [
          endForEach()
        ]
        ${timeline('')}
      `);
      expect(codes).toContain(CONTROL_FLOW_CODE);
    });

    test('accepts a correctly paired when/endWhen', async () => {
      const codes = await errorCodes(`
        on event "language-change" action hh(l) [
          when(@@currentItem)
          log("x")
          endWhen()
        ]
        ${timeline('')}
      `);
      expect(codes).not.toContain(CONTROL_FLOW_CODE);
    });

    test('reports an operation whose operationData dependency was never created', async () => {
      const codes = await errorCodes(`
        on event "language-change" action hh(l) [
          addClass("active")
        ]
        ${timeline('')}
      `);
      expect(codes).toContain(MISSING_DEPENDENCY_CODE);
    });

    test('accepts a dependency created earlier in the event action', async () => {
      const codes = await errorCodes(`
        on event "language-change" action hh(l) [
          selectElement("#app")
          addClass("active")
        ]
        ${timeline('')}
      `);
      expect(codes).not.toContain(MISSING_DEPENDENCY_CODE);
    });
  });

  describe('inline stagger blocks', () => {
    test('reports an unclosed raw when() in the start block', async () => {
      const codes = await errorCodes(
        timeline('stagger 1s items for 1s [ when(@@currentItem) ] [ ]')
      );
      expect(codes).toContain(CONTROL_FLOW_CODE);
    });

    test('reports an unclosed raw forEach() in the end block', async () => {
      const codes = await errorCodes(
        timeline('stagger 1s items for 1s [ log("x") ] [ forEach(@@currentItem) ]')
      );
      expect(codes).toContain(CONTROL_FLOW_CODE);
    });

    test('accepts correctly paired blocks', async () => {
      const codes = await errorCodes(
        timeline('stagger 1s items for 1s [ when(@@currentItem) log("x") endWhen() ] [ log("y") ]')
      );
      expect(codes).not.toContain(CONTROL_FLOW_CODE);
    });

    test('reports missing operationData dependencies in start and end blocks', async () => {
      const codes = await errorCodes(
        timeline('stagger 1s items for 1s [ addClass("a") ] [ removeClass("a") ]')
      );
      expect(codes.filter(c => c === MISSING_DEPENDENCY_CODE)).toHaveLength(2);
    });

    test('accepts dependencies created earlier in the block', async () => {
      const codes = await errorCodes(
        timeline(
          'stagger 1s items for 1s [ selectElement("#app") addClass("a") ] [ selectElement("#app") removeClass("a") ]'
        )
      );
      expect(codes).not.toContain(MISSING_DEPENDENCY_CODE);
    });

    test('the action-call form is not affected', async () => {
      const codes = await errorCodes(`
        action reveal(item) [ log(item) ]
        ${timeline('stagger 1s items with reveal() for 1s')}
      `);
      expect(codes).not.toContain(CONTROL_FLOW_CODE);
      expect(codes).not.toContain(MISSING_DEPENDENCY_CODE);
    });
  });
});
