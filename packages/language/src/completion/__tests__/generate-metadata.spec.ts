/**
 * Tests for Metadata Generation Script
 *
 * Verifies that controller metadata can be imported from Eligius and
 * properly structured for code completion.
 *
 * Feature: 035-specialized-controller-syntax
 * Task: T006
 */

import { ctrlmetadata } from 'eligius';
import { describe, expect, test } from 'vitest';
import { CONTROLLERS, getController, isController } from '../metadata/controllers.generated.js';

describe('Controller Metadata Generation', () => {
  test('ctrlmetadata import succeeds', () => {
    expect(ctrlmetadata).toBeDefined();
    expect(typeof ctrlmetadata).toBe('object');
  });

  test('All 8 controllers generated', () => {
    expect(CONTROLLERS).toHaveLength(8);

    // Verify all expected controllers are present
    const expectedControllers = [
      'DOMEventListenerController',
      'LabelController',
      'LottieController',
      'MutationObserverController',
      'NavigationController',
      'ProgressbarController',
      'RoutingController',
      'SubtitlesController',
    ];

    const actualNames = CONTROLLERS.map(c => c.name).sort();
    expect(actualNames).toEqual(expectedControllers.sort());
  });

  test('LabelController has labelId parameter with type ParameterType:labelId', () => {
    const labelController = CONTROLLERS.find(c => c.name === 'LabelController');
    expect(labelController).toBeDefined();

    const labelIdParam = labelController!.parameters.find(p => p.name === 'labelId');
    expect(labelIdParam).toBeDefined();
    expect(labelIdParam!.type).toBe('ParameterType:labelId');
    expect(labelIdParam!.required).toBe(true);
  });

  test('NavigationController has json parameter with type ParameterType:object', () => {
    const navController = CONTROLLERS.find(c => c.name === 'NavigationController');
    expect(navController).toBeDefined();

    const jsonParam = navController!.parameters.find(p => p.name === 'json');
    expect(jsonParam).toBeDefined();
    expect(jsonParam!.type).toBe('ParameterType:object');
    expect(jsonParam!.required).toBe(true);
  });

  test('isController() works correctly', () => {
    expect(isController('LabelController')).toBe(true);
    expect(isController('NavigationController')).toBe(true);
    expect(isController('InvalidController')).toBe(false);
    expect(isController('')).toBe(false);
  });

  test('getController() returns correct metadata', () => {
    const labelController = getController('LabelController');
    expect(labelController).toBeDefined();
    expect(labelController!.name).toBe('LabelController');
    expect(labelController!.parameters).toHaveLength(2); // labelId, attributeName

    const invalid = getController('InvalidController');
    expect(invalid).toBeUndefined();
  });

  test('All controllers have required metadata fields', () => {
    for (const controller of CONTROLLERS) {
      // Verify required fields
      expect(controller.name).toBeDefined();
      expect(typeof controller.name).toBe('string');
      expect(controller.name.length).toBeGreaterThan(0);

      expect(controller.description).toBeDefined();
      expect(typeof controller.description).toBe('string');

      expect(controller.parameters).toBeDefined();
      expect(Array.isArray(controller.parameters)).toBe(true);

      expect(controller.dependencies).toBeDefined();
      expect(Array.isArray(controller.dependencies)).toBe(true);

      // Verify parameter structure
      for (const param of controller.parameters) {
        expect(param.name).toBeDefined();
        expect(typeof param.name).toBe('string');

        expect(param.type).toBeDefined();
        expect(typeof param.type === 'string' || Array.isArray(param.type)).toBe(true);

        expect(typeof param.required).toBe('boolean');
      }
    }
  });

  test('Controllers are alphabetically sorted', () => {
    const names = CONTROLLERS.map(c => c.name);
    const sortedNames = [...names].sort();
    expect(names).toEqual(sortedNames);
  });
});
