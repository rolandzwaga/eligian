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
    // Event actions start with only { eventArgs }, so the missing property is an error
    const document = await ctx.parse(
      `on event "language-change" action handler(a) [ addClass("x") ]
       timeline "T" in "#stage" using raf { at 0s..1s [ selectElement("#a") ] [] }`
    );

    const failure = await Effect.runPromise(Effect.flip(transformAST(document.parseResult.value)));

    expect(failure._tag).toBe('TransformError');
    expect(failure.kind).toBe('ValidationError');
    expect(failure.message).toBe(
      "Property 'selectedElement' is not available - ensure it is created by a previous operation (for example with selectElement)"
    );
    // Located at the offending operation, not a placeholder 1:1
    expect(failure.location.line).toBe(1);
    expect(failure.location.column).toBeGreaterThan(1);
  });

  test('a regular action relies on its caller; the timeline call that cannot provide it fails', async () => {
    const callerOk = await ctx.parse(
      `action hh() [ addClass("x") ]
       timeline "T" in "#stage" using raf { at 0s..1s [ selectElement("#a") hh() ] [] }`
    );
    const callerMissing = await ctx.parse(
      `action hh() [ addClass("x") ]
       timeline "T" in "#stage" using raf { at 0s..1s hh() }`
    );

    const ok = await Effect.runPromise(Effect.result(transformAST(callerOk.parseResult.value)));
    const failure = await Effect.runPromise(
      Effect.flip(transformAST(callerMissing.parseResult.value))
    );

    expect(ok._tag).toBe('Success');
    expect(failure.kind).toBe('ValidationError');
    expect(failure.message).toContain("Action 'hh' requires 'selectedElement'");
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
