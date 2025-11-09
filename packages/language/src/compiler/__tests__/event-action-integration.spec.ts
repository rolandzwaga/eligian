/**
 * Event Action Integration Tests (Feature 028 - T012)
 *
 * Tests full DSL → JSON compilation pipeline for event actions.
 * Verifies end-to-end transformation from Eligian source to Eligius configuration.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Effect } from 'effect';
import { beforeAll, describe, expect, test } from 'vitest';
import { createTestContext, type TestContext } from '../../__tests__/test-helpers.js';
import { transformAST } from '../ast-transformer.js';
import type { IEngineConfiguration } from '../operations/types.js';

describe('Event Action Integration Tests (T012)', () => {
  let ctx: TestContext;
  const fixturesDir = join(__dirname, '__fixtures__', 'event-actions', 'valid');

  beforeAll(async () => {
    ctx = createTestContext();
  });

  test('should compile DSL file with single event action', async () => {
    const filePath = join(fixturesDir, 'simple-event-action.eligian');
    const source = readFileSync(filePath, 'utf-8');

    const document = await ctx.parse(source);
    const program = document.parseResult.value;

    // Transform AST to Eligius configuration
    const result = await Effect.runPromise(transformAST(program));

    // Extract config from result
    const config: IEngineConfiguration = result.config;

    // Verify eventActions array exists and has correct length
    expect(config.eventActions).toBeDefined();
    expect(Array.isArray(config.eventActions)).toBe(true);
    expect(config.eventActions).toHaveLength(1);

    // Verify event action structure
    const eventAction = config.eventActions[0];
    expect(eventAction).toHaveProperty('id');
    expect(eventAction).toHaveProperty('name', 'HandleLanguageChange');
    expect(eventAction).toHaveProperty('eventName', 'language-change');
    expect(eventAction).toHaveProperty('eventTopic'); // undefined for this fixture
    expect(eventAction.eventTopic).toBeUndefined();
    expect(eventAction).toHaveProperty('startOperations');
    expect(Array.isArray(eventAction.startOperations)).toBe(true);
    expect(eventAction.startOperations).toHaveLength(2);

    // Verify UUID v4 format
    const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(eventAction.id).toMatch(uuidV4Regex);

    // Verify operations have correct names
    expect(eventAction.startOperations[0].operationName).toBe('selectElement');
    expect(eventAction.startOperations[1].operationName).toBe('setText');

    // Verify no endOperations property
    expect(eventAction).not.toHaveProperty('endOperations');
  });

  test('should compile DSL file with multiple event actions and preserve order (FR-014)', async () => {
    const filePath = join(fixturesDir, 'multiple-event-actions.eligian');
    const source = readFileSync(filePath, 'utf-8');

    const document = await ctx.parse(source);
    const program = document.parseResult.value;

    // Transform AST to Eligius configuration
    const result = await Effect.runPromise(transformAST(program));

    // Extract config from result
    const config: IEngineConfiguration = result.config;

    // Verify 3 event actions in correct order (FR-014)
    expect(config.eventActions).toHaveLength(3);

    // First event action: HandleLogin
    expect(config.eventActions[0].name).toBe('HandleLogin');
    expect(config.eventActions[0].eventName).toBe('user-login');
    expect(config.eventActions[0].eventTopic).toBeUndefined();
    expect(config.eventActions[0].startOperations).toHaveLength(3);

    // Second event action: HandleLogout
    expect(config.eventActions[1].name).toBe('HandleLogout');
    expect(config.eventActions[1].eventName).toBe('user-logout');
    expect(config.eventActions[1].eventTopic).toBeUndefined();
    expect(config.eventActions[1].startOperations).toHaveLength(3);

    // Third event action: SyncData
    expect(config.eventActions[2].name).toBe('SyncData');
    expect(config.eventActions[2].eventName).toBe('data-sync');
    expect(config.eventActions[2].eventTopic).toBeUndefined();
    expect(config.eventActions[2].startOperations).toHaveLength(2);
  });

  test('should compile DSL file with zero-parameter event action', async () => {
    const filePath = join(fixturesDir, 'zero-parameters.eligian');
    const source = readFileSync(filePath, 'utf-8');

    const document = await ctx.parse(source);
    const program = document.parseResult.value;

    // Transform AST to Eligius configuration
    const result = await Effect.runPromise(transformAST(program));

    // Extract config from result
    const config: IEngineConfiguration = result.config;

    // Verify event action with zero parameters
    expect(config.eventActions).toHaveLength(1);
    expect(config.eventActions[0].name).toBe('Initialize');
    expect(config.eventActions[0].eventName).toBe('app-ready');
    expect(config.eventActions[0].eventTopic).toBeUndefined();
    expect(config.eventActions[0].startOperations).toHaveLength(2);
  });

  test('should compile DSL file with multiple-parameter event action', async () => {
    const filePath = join(fixturesDir, 'multiple-parameters.eligian');
    const source = readFileSync(filePath, 'utf-8');

    const document = await ctx.parse(source);
    const program = document.parseResult.value;

    // Transform AST to Eligius configuration
    const result = await Effect.runPromise(transformAST(program));

    // Extract config from result
    const config: IEngineConfiguration = result.config;

    // Verify event action with multiple parameters
    expect(config.eventActions).toHaveLength(1);
    expect(config.eventActions[0].name).toBe('UpdateUserDisplay');
    expect(config.eventActions[0].eventName).toBe('user-updated');
    expect(config.eventActions[0].eventTopic).toBeUndefined();
    expect(config.eventActions[0].startOperations).toHaveLength(6);
  });
});
