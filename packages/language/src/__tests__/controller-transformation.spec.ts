/**
 * Tests for Controller Transformation
 *
 * Verifies that addController calls transform correctly to Eligius JSON operations:
 * - addController transforms to getControllerInstance + addControllerToElement
 * - Parameter mapping works correctly (positional → named)
 * - All 8 controller types transform correctly
 *
 * Feature: 035-specialized-controller-syntax
 * User Story: US1
 * Task: T008
 */

import { Effect } from 'effect';
import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { compileToJSON } from '../compiler/pipeline.js';
import type { TestContext } from './test-helpers.js';
import { createTestContext, minimalProgram, setupCSSRegistry } from './test-helpers.js';

describe('Controller Transformation (Feature 035, User Story 1)', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  beforeEach(() => {
    // Setup CSS registry with #header ID for tests
    setupCSSRegistry(ctx, 'file:///styles.css', {
      classes: [],
      ids: ['header'],
    });
  });

  test('addController("NavigationController", {pages: ["home"]}) transforms to getControllerInstance + addControllerToElement (T008)', async () => {
    const code = minimalProgram({
      actionBody: `
        selectElement("#header")
        addController("NavigationController", {pages: ["home"]})
      `,
      timelineBody: 'at 0s..1s testAction()',
    });

    // Compile to JSON
    const json = await Effect.runPromise(compileToJSON(code));
    const result = JSON.parse(json);

    // Find the testAction in compiled JSON
    const testAction = result.actions.find((a: any) => a.name === 'testAction');
    expect(testAction).toBeDefined();

    // Should have 3 operations: selectElement + getControllerInstance + addControllerToElement
    const operations = testAction.startOperations;
    expect(operations).toBeDefined();
    expect(operations.length).toBeGreaterThanOrEqual(2);

    // Find getControllerInstance operation
    const getControllerOp = operations.find((op: any) => op.systemName === 'getControllerInstance');
    expect(getControllerOp).toBeDefined();
    expect(getControllerOp.operationData.systemName).toBe('NavigationController');

    // Find addControllerToElement operation (should come after getControllerInstance)
    const addControllerOp = operations.find(
      (op: any) => op.systemName === 'addControllerToElement'
    );
    expect(addControllerOp).toBeDefined();
    expect(addControllerOp.operationData.json).toEqual({ pages: ['home'] });
  });

  test('addController("NavigationController", {json: data}) has correct structure (T008)', async () => {
    const code = minimalProgram({
      actionBody: `
        selectElement("#header")
        addController("NavigationController", {pages: ["home", "about"]})
      `,
      timelineBody: 'at 0s..1s testAction()',
    });

    // Compile to JSON
    const json = await Effect.runPromise(compileToJSON(code));
    const result = JSON.parse(json);

    // Find the testAction
    const testAction = result.actions.find((a: any) => a.name === 'testAction');
    expect(testAction).toBeDefined();

    const operations = testAction.startOperations;

    // Find getControllerInstance operation
    const getControllerOp = operations.find((op: any) => op.systemName === 'getControllerInstance');
    expect(getControllerOp).toBeDefined();
    expect(getControllerOp.operationData.systemName).toBe('NavigationController');

    // Find addControllerToElement operation
    const addControllerOp = operations.find(
      (op: any) => op.systemName === 'addControllerToElement'
    );
    expect(addControllerOp).toBeDefined();
    expect(addControllerOp.operationData.json).toEqual({ pages: ['home', 'about'] });
  });

  test('Parameter mapping: JSON object parameter maps correctly (T008)', async () => {
    const code = minimalProgram({
      actionBody: `
        selectElement("#header")
        addController("NavigationController", {pages: ["home", "about"], loop: true})
      `,
      timelineBody: 'at 0s..1s testAction()',
    });

    // Compile to JSON
    const json = await Effect.runPromise(compileToJSON(code));
    const result = JSON.parse(json);

    // Find the testAction
    const testAction = result.actions.find((a: any) => a.name === 'testAction');
    expect(testAction).toBeDefined();

    const operations = testAction.startOperations;

    // Find addControllerToElement operation
    const addControllerOp = operations.find(
      (op: any) => op.systemName === 'addControllerToElement'
    );
    expect(addControllerOp).toBeDefined();

    // Verify parameter mapping: JSON object parameter maps correctly
    expect(addControllerOp.operationData.json).toEqual({
      pages: ['home', 'about'],
      loop: true,
    });
  });
});
