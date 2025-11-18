/**
 * Integration Tests for Controller Compilation (Feature 035)
 *
 * Tests the full compilation pipeline from DSL source → JSON output
 * for the addController syntax sugar.
 *
 * Feature: 035-specialized-controller-syntax
 * User Story: US1
 * Task: T014
 */

import { Effect } from 'effect';
import { describe, expect, test } from 'vitest';
import { compileToJSON } from '../compiler/pipeline.js';
import { minimalProgram } from './test-helpers.js';

describe('Controller Compiler Integration (Feature 035, User Story 1)', () => {
  test('Full pipeline: addController compiles to valid Eligius JSON (T014)', async () => {
    const code = minimalProgram({
      cssImport: false, // Disable CSS to avoid validation errors
      containerSelector: 'body', // Use tag selector instead of class
      actionBody: `
        selectElement("div")
        addController("NavigationController", {pages: ["home", "about"]})
      `,
      timelineBody: 'at 0s..1s testAction()',
    });

    // Compile to JSON
    const json = await Effect.runPromise(compileToJSON(code));
    const result = JSON.parse(json);

    // Verify top-level structure
    expect(result).toHaveProperty('actions');
    expect(result).toHaveProperty('timelines');
    expect(result).toHaveProperty('containerSelector');

    // Verify action exists
    const testAction = result.actions.find((a: any) => a.name === 'testAction');
    expect(testAction).toBeDefined();
    expect(testAction.startOperations).toHaveLength(3);

    // Verify transformation produced correct operations
    const opNames = testAction.startOperations.map((op: any) => op.systemName);
    expect(opNames).toEqual(['selectElement', 'getControllerInstance', 'addControllerToElement']);

    // Verify getControllerInstance has correct controller name
    const getController = testAction.startOperations.find(
      (op: any) => op.systemName === 'getControllerInstance'
    );
    expect(getController.operationData.systemName).toBe('NavigationController');

    // Verify addControllerToElement has correct parameters
    const addController = testAction.startOperations.find(
      (op: any) => op.systemName === 'addControllerToElement'
    );
    expect(addController.operationData).toEqual({
      json: {
        pages: ['home', 'about'],
      },
    });
  });

  test('Multiple controllers in single action compile correctly (T014)', async () => {
    const code = minimalProgram({
      cssImport: false, // Disable CSS to avoid validation errors
      containerSelector: 'body', // Use tag selector instead of class
      actionBody: `
        selectElement("div")
        addController("NavigationController", {pages: ["home", "about"]})
        selectElement("span")
        addController("NavigationController", {pages: ["contact", "faq"]})
      `,
      timelineBody: 'at 0s..1s testAction()',
    });

    // Compile to JSON
    const json = await Effect.runPromise(compileToJSON(code));
    const result = JSON.parse(json);

    const testAction = result.actions.find((a: any) => a.name === 'testAction');
    expect(testAction).toBeDefined();

    // Should have 6 operations: selectElement → getController → addController (×2)
    expect(testAction.startOperations).toHaveLength(6);

    // Verify both controllers were transformed
    const controllerInstances = testAction.startOperations.filter(
      (op: any) => op.systemName === 'getControllerInstance'
    );
    expect(controllerInstances).toHaveLength(2);
    expect(controllerInstances[0].operationData.systemName).toBe('NavigationController');
    expect(controllerInstances[1].operationData.systemName).toBe('NavigationController');
  });

  test('Controller in timeline event compiles correctly (T014)', async () => {
    const code = `
      timeline "test" in "body" using raf {
        at 0s..1s [
          selectElement("div")
          addController("NavigationController", {pages: ["home", "about"]})
        ] []
      }
    `;

    // Compile to JSON
    const json = await Effect.runPromise(compileToJSON(code));
    const result = JSON.parse(json);

    // Verify timeline structure
    expect(result.timelines).toHaveLength(1);
    expect(result.timelines[0].timelineActions).toHaveLength(1);

    const timelineAction = result.timelines[0].timelineActions[0];
    expect(timelineAction.startOperations).toHaveLength(3);

    // Verify controller transformation in timeline event
    const opNames = timelineAction.startOperations.map((op: any) => op.systemName);
    expect(opNames).toEqual(['selectElement', 'getControllerInstance', 'addControllerToElement']);
  });
});
