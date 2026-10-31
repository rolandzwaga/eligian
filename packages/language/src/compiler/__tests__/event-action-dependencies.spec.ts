/**
 * Regression (2026-10-22 audit, low): event action bodies skipped the operation
 * dependency validation (T173) that regular actions and timeline events get, so
 * `on event … [ addClass("x") ]` compiled and only failed in the engine.
 */
import { Effect, Result } from 'effect';
import { beforeAll, describe, expect, test } from 'vitest';
import { createTestContext, type TestContext } from '../../__tests__/test-helpers.js';
import type { EventActionDefinition } from '../../generated/ast.js';
import { transformAST, transformEventAction } from '../ast-transformer.js';

describe('event action dependency validation', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  async function eventActionOf(code: string): Promise<EventActionDefinition> {
    const document = await ctx.parse(code);
    expect(document.parseResult.parserErrors).toHaveLength(0);
    return document.parseResult.value.statements.find(
      s => s.$type === 'EventActionDefinition'
    ) as EventActionDefinition;
  }

  test('an operation whose dependency is never provided fails the transform', async () => {
    const eventAction = await eventActionOf(
      'on event "language-change" action handler(a) [ addClass("x") ]'
    );

    const result = Effect.runSync(Effect.result(transformEventAction(eventAction)));

    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) {
      expect(result.failure._tag).toBe('TransformError');
      expect(result.failure.kind).toBe('ValidationError');
      expect(result.failure.message).toContain("event action 'handler'");
      expect(result.failure.message).toContain(
        "Operation 'addClass' requires 'selectedElement' but it is not available"
      );
      // Located at the offending operation, not a placeholder 1:1
      expect(result.failure.location.line).toBe(1);
      expect(result.failure.location.column).toBeGreaterThan(1);
    }
  });

  test('transformAST surfaces the same failure as a regular action does', async () => {
    const timeline = 'timeline "T" in "#stage" using raf { at 0s..1s [ selectElement("#a") ] [] }';
    const eventDoc = await ctx.parse(
      `on event "language-change" action handler(a) [ addClass("x") ]\n${timeline}`
    );
    const actionDoc = await ctx.parse(`action hh() [ addClass("x") ]\n${timeline}`);

    const eventFailure = await Effect.runPromise(
      Effect.flip(transformAST(eventDoc.parseResult.value))
    );
    const actionFailure = await Effect.runPromise(
      Effect.flip(transformAST(actionDoc.parseResult.value))
    );

    expect(eventFailure.kind).toBe('ValidationError');
    expect(actionFailure.kind).toBe('ValidationError');
    expect(eventFailure.message).toContain("requires 'selectedElement'");
  });

  test('a satisfied dependency chain still compiles', async () => {
    const eventAction = await eventActionOf(`on event "ready" action init(sel) [
  selectElement(sel)
  addClass("ready")
]`);

    const config = Effect.runSync(transformEventAction(eventAction));

    expect(config.startOperations.map(op => op.systemName)).toEqual(['selectElement', 'addClass']);
  });

  test('runtime concatenation helpers (no dependencies) do not trip validation', async () => {
    const eventAction = await eventActionOf(`on event "ready" action greet(name) [
  selectElement("#greeting")
  setElementContent("Hello " + name)
]`);

    const config = Effect.runSync(transformEventAction(eventAction));

    const names = config.startOperations.map(op => op.systemName);
    expect(names[0]).toBe('selectElement');
    expect(names).toContain('setElementContent');
    expect(names).toContain('concatenateStrings');
  });

  test('a dependency provided before a concatenation remains available after it', async () => {
    const eventAction = await eventActionOf(`on event "ready" action greet(name) [
  selectElement("#greeting")
  setElementContent("Hello " + name)
  addClass("greeted")
]`);

    const result = Effect.runSync(Effect.result(transformEventAction(eventAction)));

    expect(Result.isSuccess(result)).toBe(true);
  });
});
