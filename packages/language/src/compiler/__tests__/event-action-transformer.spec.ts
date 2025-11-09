/**
 * Event Action Transformation Tests (Feature 028 - T009)
 *
 * Tests transforming EventActionDefinition AST → IEventActionConfiguration JSON.
 * These tests verify the transformation logic BEFORE it's implemented (test-first).
 *
 * Test Cases (from tasks.md T009):
 * - Event action with name generates correct `name` field
 * - Event action generates valid UUID v4 `id`
 * - Event name string literal → `eventName` field
 * - Operations array → `startOperations` array
 * - No `endOperations` in output (event actions don't have end operations)
 */

import { beforeAll, describe, expect, test } from 'vitest';
import { createTestContext, type TestContext } from '../../__tests__/test-helpers.js';
import type { EventActionDefinition } from '../../generated/ast.js';
import { transformEventAction } from '../ast-transformer.js';
import type { IEventActionConfiguration } from '../operations/types.js';

describe('Event Action Transformation (T009)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = createTestContext();
  });

  test('should transform event action name to name field', async () => {
    const code = 'on event "click" action handleClick() []';
    const document = await ctx.parse(code);
    const program = document.parseResult.value;
    const eventAction = program.statements[0] as EventActionDefinition;

    const result: IEventActionConfiguration = transformEventAction(eventAction);

    expect(result.name).toBe('handleClick');
  });

  test('should generate valid UUID v4 id', async () => {
    const code = 'on event "click" action handleClick() []';
    const document = await ctx.parse(code);
    const program = document.parseResult.value;
    const eventAction = program.statements[0] as EventActionDefinition;

    const result: IEventActionConfiguration = transformEventAction(eventAction);

    // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    // where y is one of [8, 9, a, b]
    const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(result.id).toMatch(uuidV4Regex);
  });

  test('should transform event name string literal to eventName field', async () => {
    const code = 'on event "data-loaded" action processData() []';
    const document = await ctx.parse(code);
    const program = document.parseResult.value;
    const eventAction = program.statements[0] as EventActionDefinition;

    const result: IEventActionConfiguration = transformEventAction(eventAction);

    expect(result.eventName).toBe('data-loaded');
  });

  test('should transform operations array to startOperations array', async () => {
    const code = `
      on event "ready" action init() [
        selectElement("#app")
        addClass("initialized")
      ]
    `;
    const document = await ctx.parse(code);
    const program = document.parseResult.value;
    const eventAction = program.statements[0] as EventActionDefinition;

    const result: IEventActionConfiguration = transformEventAction(eventAction);

    expect(result.startOperations).toBeDefined();
    expect(Array.isArray(result.startOperations)).toBe(true);
    expect(result.startOperations).toHaveLength(2);

    // Check first operation
    expect(result.startOperations[0]).toHaveProperty('id');
    expect(result.startOperations[0]).toHaveProperty('operationName', 'selectElement');
    expect(result.startOperations[0]).toHaveProperty('operationData');

    // Check second operation
    expect(result.startOperations[1]).toHaveProperty('id');
    expect(result.startOperations[1]).toHaveProperty('operationName', 'addClass');
    expect(result.startOperations[1]).toHaveProperty('operationData');
  });

  test('should not include endOperations in output', async () => {
    const code = `
      on event "click" action handleClick() [
        selectElement("#button")
        addClass("clicked")
      ]
    `;
    const document = await ctx.parse(code);
    const program = document.parseResult.value;
    const eventAction = program.statements[0] as EventActionDefinition;

    const result: IEventActionConfiguration = transformEventAction(eventAction);

    // Event actions should NOT have endOperations
    expect(result).not.toHaveProperty('endOperations');
  });
});
