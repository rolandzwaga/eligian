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

import { Effect } from 'effect';
import { beforeAll, describe, expect, test } from 'vitest';
import { createTestContext, type TestContext } from '../../__tests__/test-helpers.js';
import type { EventActionDefinition } from '../../generated/ast.js';
import { createParameterContext, transformAST, transformEventAction } from '../ast-transformer.js';
import type { IEngineConfiguration, IEventActionConfiguration } from '../operations/types.js';

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
    expect(result.startOperations[0]).toHaveProperty('systemName', 'selectElement');
    expect(result.startOperations[0]).toHaveProperty('operationData');

    // Check second operation
    expect(result.startOperations[1]).toHaveProperty('id');
    expect(result.startOperations[1]).toHaveProperty('systemName', 'addClass');
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

  test('should transform event action with topic to eventTopic field (T038)', async () => {
    const code = 'on event "click" topic "navigation" action handleNavClick() []';
    const document = await ctx.parse(code);
    const program = document.parseResult.value;
    const eventAction = program.statements[0] as EventActionDefinition;

    const result: IEventActionConfiguration = transformEventAction(eventAction);

    expect(result.eventName).toBe('click');
    expect(result.eventTopic).toBe('navigation');
  });

  test('should transform event action without topic to undefined eventTopic (T038)', async () => {
    const code = 'on event "click" action handleClick() []';
    const document = await ctx.parse(code);
    const program = document.parseResult.value;
    const eventAction = program.statements[0] as EventActionDefinition;

    const result: IEventActionConfiguration = transformEventAction(eventAction);

    expect(result.eventName).toBe('click');
    expect(result.eventTopic).toBeUndefined();
  });
});

describe('Parameter Context Creation (T016)', () => {
  test('should create empty parameter map for zero parameters', () => {
    const context = createParameterContext([]);

    expect(context.parameters).toBeDefined();
    expect(context.parameters instanceof Map).toBe(true);
    expect(context.parameters.size).toBe(0);
  });

  test('should create parameter map with single parameter at index 0', () => {
    const context = createParameterContext(['param']);

    expect(context.parameters.size).toBe(1);
    expect(context.parameters.get('param')).toBe(0);
  });

  test('should create parameter map with three parameters at correct indices', () => {
    const context = createParameterContext(['a', 'b', 'c']);

    expect(context.parameters.size).toBe(3);
    expect(context.parameters.get('a')).toBe(0);
    expect(context.parameters.get('b')).toBe(1);
    expect(context.parameters.get('c')).toBe(2);
  });
});

describe('Parameter Reference Resolution (T018)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = createTestContext();
  });

  test('should resolve first parameter reference to eventArgs[0]', async () => {
    const code = `
      action init() [
        selectElement("#app")
      ]

      on event "update" action handleUpdate(className) [
        addClass(className)
      ]

      timeline "test" in "#app" using raf {
        at 0s..1s init()
      }
    `;
    const document = await ctx.parse(code);
    const program = document.parseResult.value;

    // Transform AST to Eligius configuration
    const result = await Effect.runPromise(transformAST(program));

    // Extract config from result
    const config: IEngineConfiguration = result.config;

    // Verify the parameter reference is resolved to eventArgs[0]
    expect(config.eventActions).toHaveLength(1);
    const eventAction = config.eventActions[0];
    expect(eventAction.startOperations).toHaveLength(1);
    const operation = eventAction.startOperations[0];
    expect(operation.systemName).toBe('addClass');
    expect(operation.operationData).toHaveProperty('className', '$operationData.eventArgs[0]');
  });

  test('should resolve second parameter reference to eventArgs[1]', async () => {
    const code = `
      action init() [
        selectElement("#app")
      ]

      on event "update" action handleUpdate(first, second) [
        addClass(second)
      ]

      timeline "test" in "#app" using raf {
        at 0s..1s init()
      }
    `;
    const document = await ctx.parse(code);
    const program = document.parseResult.value;

    // Transform AST to Eligius configuration
    const result = await Effect.runPromise(transformAST(program));

    // Extract config from result
    const config: IEngineConfiguration = result.config;

    // Verify the second parameter reference is resolved to eventArgs[1]
    expect(config.eventActions).toHaveLength(1);
    const eventAction = config.eventActions[0];
    expect(eventAction.startOperations).toHaveLength(1);
    const operation = eventAction.startOperations[0];
    expect(operation.operationData).toHaveProperty('className', '$operationData.eventArgs[1]');
  });

  test('should resolve third parameter reference to eventArgs[2]', async () => {
    const code = `
      action init() [
        selectElement("#app")
      ]

      on event "update" action handleUpdate(a, b, c) [
        addClass(c)
      ]

      timeline "test" in "#app" using raf {
        at 0s..1s init()
      }
    `;
    const document = await ctx.parse(code);
    const program = document.parseResult.value;

    // Transform AST to Eligius configuration
    const result = await Effect.runPromise(transformAST(program));

    // Extract config from result
    const config: IEngineConfiguration = result.config;

    // Verify the third parameter reference is resolved to eventArgs[2]
    expect(config.eventActions).toHaveLength(1);
    const eventAction = config.eventActions[0];
    expect(eventAction.startOperations).toHaveLength(1);
    const operation = eventAction.startOperations[0];
    expect(operation.operationData).toHaveProperty('className', '$operationData.eventArgs[2]');
  });

  test('should leave non-parameter references unchanged', async () => {
    const code = `
      const MY_CLASS = "active"

      action init() [
        selectElement("#app")
      ]

      on event "update" action handleUpdate(param) [
        addClass(@MY_CLASS)
      ]

      timeline "test" in "#app" using raf {
        at 0s..1s init()
      }
    `;
    const { program } = await ctx.parseAndValidate(code);

    // Transform AST to Eligius configuration
    const result = await Effect.runPromise(transformAST(program));

    // Extract config from result
    const config: IEngineConfiguration = result.config;

    // Verify constant reference is inlined (not treated as parameter)
    expect(config.eventActions).toHaveLength(1);
    const eventAction = config.eventActions[0];
    expect(eventAction.startOperations).toHaveLength(1);
    const operation = eventAction.startOperations[0];
    expect(operation.operationData).toHaveProperty('className', 'active');
  });
});
