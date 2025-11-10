/**
 * Event Action Parsing Tests (Feature 028 - T006, T007)
 *
 * Tests parsing of EventActionDefinition grammar:
 * on event "event-name" topic "topic-name"? action ActionName(params) [operations]
 *
 * NOTE: These tests check PARSING only, not validation.
 * Validation tests are in Phase 6 (User Story 4, Tasks T026-T035).
 */

import { beforeAll, describe, expect, test } from 'vitest';
import type { EventActionDefinition } from '../generated/ast.js';
import { createTestContext, type TestContext } from './test-helpers.js';

describe('Event Action Parsing - Basic Syntax (T006)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = createTestContext();
  });

  test('should parse event action with single parameter', async () => {
    const code = `
      on event "click" action handleClick(selector) [
        selectElement(selector)
      ]
    `;

    const document = await ctx.parse(code);

    // Check for parser errors (not validation errors)
    expect(document.parseResult.lexerErrors).toHaveLength(0);
    expect(document.parseResult.parserErrors).toHaveLength(0);

    const program = document.parseResult.value;
    expect(program.statements).toHaveLength(1);

    const eventAction = program.statements[0] as EventActionDefinition;
    expect(eventAction.$type).toBe('EventActionDefinition');
    expect(eventAction.eventName).toBe('click');
    expect(eventAction.eventTopic).toBeUndefined();
    expect(eventAction.name).toBe('handleClick');
    expect(eventAction.parameters).toHaveLength(1);
    expect(eventAction.parameters[0].name).toBe('selector');
    expect(eventAction.operations).toHaveLength(1);
  });

  test('should parse event action with zero parameters', async () => {
    const code = `
      on event "ready" action init() [
        selectElement("#app")
        addClass("initialized")
      ]
    `;

    const document = await ctx.parse(code);
    expect(document.parseResult.lexerErrors).toHaveLength(0);
    expect(document.parseResult.parserErrors).toHaveLength(0);

    const program = document.parseResult.value;
    expect(program.statements).toHaveLength(1);

    const eventAction = program.statements[0] as EventActionDefinition;
    expect(eventAction.$type).toBe('EventActionDefinition');
    expect(eventAction.eventName).toBe('ready');
    expect(eventAction.name).toBe('init');
    expect(eventAction.parameters).toHaveLength(0);
    expect(eventAction.operations).toHaveLength(2);
  });

  test('should parse event action with multiple operations', async () => {
    const code = `
      on event "data-loaded" action processData(items, config) [
        selectElement("#container")
        addClass("loading")
        removeClass("loading")
        addClass("loaded")
        setText("Done")
      ]
    `;

    const document = await ctx.parse(code);
    expect(document.parseResult.lexerErrors).toHaveLength(0);
    expect(document.parseResult.parserErrors).toHaveLength(0);

    const program = document.parseResult.value;
    expect(program.statements).toHaveLength(1);

    const eventAction = program.statements[0] as EventActionDefinition;
    expect(eventAction.$type).toBe('EventActionDefinition');
    expect(eventAction.eventName).toBe('data-loaded');
    expect(eventAction.name).toBe('processData');
    expect(eventAction.parameters).toHaveLength(2);
    expect(eventAction.parameters[0].name).toBe('items');
    expect(eventAction.parameters[1].name).toBe('config');
    expect(eventAction.operations).toHaveLength(5);
  });

  test('should parse multiple event actions in one file', async () => {
    const code = `
      on event "click" action handleClick(target) [
        selectElement(target)
        addClass("clicked")
      ]

      on event "hover" action handleHover(element) [
        selectElement(element)
        addClass("hovered")
      ]

      on event "ready" action initialize() [
        selectElement("#app")
        addClass("ready")
      ]
    `;

    const document = await ctx.parse(code);
    expect(document.parseResult.lexerErrors).toHaveLength(0);
    expect(document.parseResult.parserErrors).toHaveLength(0);

    const program = document.parseResult.value;
    expect(program.statements).toHaveLength(3);

    // Verify all are EventActionDefinitions
    const eventActions = program.statements as EventActionDefinition[];
    expect(eventActions[0].$type).toBe('EventActionDefinition');
    expect(eventActions[0].eventName).toBe('click');
    expect(eventActions[0].name).toBe('handleClick');

    expect(eventActions[1].$type).toBe('EventActionDefinition');
    expect(eventActions[1].eventName).toBe('hover');
    expect(eventActions[1].name).toBe('handleHover');

    expect(eventActions[2].$type).toBe('EventActionDefinition');
    expect(eventActions[2].eventName).toBe('ready');
    expect(eventActions[2].name).toBe('initialize');
  });
});

describe('Event Action Parsing - Parameter List Variations (T007)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = createTestContext();
  });

  test('should parse action with zero parameters', async () => {
    const code = `on event "test" action Name() []`;

    const document = await ctx.parse(code);
    expect(document.parseResult.lexerErrors).toHaveLength(0);
    expect(document.parseResult.parserErrors).toHaveLength(0);

    const program = document.parseResult.value;
    const eventAction = program.statements[0] as EventActionDefinition;
    expect(eventAction.parameters).toHaveLength(0);
  });

  test('should parse action with one parameter', async () => {
    const code = `on event "test" action Name(a) []`;

    const document = await ctx.parse(code);
    expect(document.parseResult.lexerErrors).toHaveLength(0);
    expect(document.parseResult.parserErrors).toHaveLength(0);

    const program = document.parseResult.value;
    const eventAction = program.statements[0] as EventActionDefinition;
    expect(eventAction.parameters).toHaveLength(1);
    expect(eventAction.parameters[0].name).toBe('a');
  });

  test('should parse action with multiple parameters', async () => {
    const code = `on event "test" action Name(a, b, c) []`;

    const document = await ctx.parse(code);
    expect(document.parseResult.lexerErrors).toHaveLength(0);
    expect(document.parseResult.parserErrors).toHaveLength(0);

    const program = document.parseResult.value;
    const eventAction = program.statements[0] as EventActionDefinition;
    expect(eventAction.parameters).toHaveLength(3);
    expect(eventAction.parameters[0].name).toBe('a');
    expect(eventAction.parameters[1].name).toBe('b');
    expect(eventAction.parameters[2].name).toBe('c');
  });

  test('should fail to parse action with trailing comma', async () => {
    const code = `on event "test" action Name(a, b,) []`;

    const document = await ctx.parse(code);

    // Expect parser error due to trailing comma
    expect(document.parseResult.parserErrors.length).toBeGreaterThan(0);
  });
});

describe('Event Action Parsing - Topic Clause (T036)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = createTestContext();
  });

  test('should parse event action with topic', async () => {
    const code = `
      on event "click" topic "nav" action handleNavClick(target) [
        selectElement(target)
        addClass("active")
      ]
    `;

    const document = await ctx.parse(code);
    expect(document.parseResult.lexerErrors).toHaveLength(0);
    expect(document.parseResult.parserErrors).toHaveLength(0);

    const program = document.parseResult.value;
    expect(program.statements).toHaveLength(1);

    const eventAction = program.statements[0] as EventActionDefinition;
    expect(eventAction.$type).toBe('EventActionDefinition');
    expect(eventAction.eventName).toBe('click');
    expect(eventAction.eventTopic).toBe('nav');
    expect(eventAction.name).toBe('handleNavClick');
    expect(eventAction.parameters).toHaveLength(1);
    expect(eventAction.operations).toHaveLength(2);
  });

  test('should parse event action without topic', async () => {
    const code = `
      on event "click" action handleClick(target) [
        selectElement(target)
      ]
    `;

    const document = await ctx.parse(code);
    expect(document.parseResult.lexerErrors).toHaveLength(0);
    expect(document.parseResult.parserErrors).toHaveLength(0);

    const program = document.parseResult.value;
    expect(program.statements).toHaveLength(1);

    const eventAction = program.statements[0] as EventActionDefinition;
    expect(eventAction.$type).toBe('EventActionDefinition');
    expect(eventAction.eventName).toBe('click');
    expect(eventAction.eventTopic).toBeUndefined();
    expect(eventAction.name).toBe('handleClick');
  });

  test('should parse event action with empty topic string', async () => {
    const code = `
      on event "click" topic "" action handleClick(target) [
        selectElement(target)
      ]
    `;

    const document = await ctx.parse(code);
    expect(document.parseResult.lexerErrors).toHaveLength(0);
    expect(document.parseResult.parserErrors).toHaveLength(0);

    const program = document.parseResult.value;
    expect(program.statements).toHaveLength(1);

    const eventAction = program.statements[0] as EventActionDefinition;
    expect(eventAction.$type).toBe('EventActionDefinition');
    expect(eventAction.eventName).toBe('click');
    expect(eventAction.eventTopic).toBe(''); // Empty string parses successfully
    expect(eventAction.name).toBe('handleClick');
    // Note: Validation will reject this in T042
  });
});
