/**
 * OperationDataTracker unit tests (audit 2026-10-22, low finding #28).
 *
 * The tracker never recorded a 'removed' history entry, so findErasurePoint
 * always returned undefined and the validators' `erased-property-access`
 * diagnostic was unreachable; clone() and merge() had no tests.
 *
 * Eligius deletes an erased parameter from operationData after the operation
 * runs. That also deletes a value an EARLIER operation left under the same
 * name (createElement outputs `template`, setElementContent erases its
 * `template` parameter), which the tracker now models and records.
 *
 * Synthetic operations are added to the registry for the dependency cases:
 * no real operation currently erases a property another operation depends on.
 */

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { OPERATION_REGISTRY, type OperationSignature } from '../compiler/operations/index.js';
import { OperationDataTracker } from '../operation-data-tracker.js';

function signature(
  systemName: string,
  parts: Partial<Pick<OperationSignature, 'parameters' | 'dependencies' | 'outputs'>>
): OperationSignature {
  return {
    systemName,
    description: 'test operation',
    parameters: parts.parameters ?? [],
    dependencies: parts.dependencies ?? [],
    outputs: parts.outputs ?? [],
  };
}

const SYNTHETIC: Record<string, OperationSignature> = {
  // Produces 'thing' on operationData
  __produceThing: signature('__produceThing', {
    outputs: [{ name: 'thing', type: ['ParameterType:object'] }],
  }),
  // Takes 'thing' as an erased parameter: deletes it after running
  __eraseThing: signature('__eraseThing', {
    parameters: [{ name: 'thing', type: ['ParameterType:object'], required: true, erased: true }],
  }),
  // Needs 'thing' to be on operationData
  __needThing: signature('__needThing', {
    dependencies: [{ name: 'thing', type: 'ParameterType:object' }],
  }),
  // Produces an output that is erased after execution
  __erasedOutput: signature('__erasedOutput', {
    outputs: [{ name: 'thing', type: ['ParameterType:object'], erased: true }],
  }),
};

describe('OperationDataTracker (audit #28)', () => {
  beforeAll(() => {
    Object.assign(OPERATION_REGISTRY, SYNTHETIC);
  });

  afterAll(() => {
    for (const name of Object.keys(SYNTHETIC)) {
      delete OPERATION_REGISTRY[name];
    }
  });

  describe('processOperation with real operations', () => {
    test('outputs are tracked and satisfy later dependencies', () => {
      const tracker = new OperationDataTracker();
      expect(tracker.processOperation('selectElement')).toEqual([]);
      expect(tracker.hasProperty('selectedElement')).toBe(true);
      expect(tracker.processOperation('addClass')).toEqual([]);
      // selectedElement persists: addClass does not erase it
      expect(tracker.processOperation('removeClass')).toEqual([]);
      expect(tracker.hasProperty('selectedElement')).toBe(true);
    });

    test('erased parameters are not tracked', () => {
      const tracker = new OperationDataTracker();
      tracker.processOperation('selectElement');
      tracker.processOperation('addClass');
      expect(tracker.hasProperty('className')).toBe(false);
      expect(tracker.hasProperty('selector')).toBe(false);
      // Erasing a property that was never there records nothing
      expect(tracker.getHistory().some(e => e.action === 'removed')).toBe(false);
    });

    test('a missing dependency is reported and is not an erasure', () => {
      const tracker = new OperationDataTracker();
      expect(tracker.processOperation('addClass')).toEqual(['selectedElement']);
      expect(tracker.findErasurePoint('selectedElement')).toBeUndefined();
    });

    test('an erased parameter removes the value an earlier output left (createElement -> setElementContent)', () => {
      const tracker = new OperationDataTracker();
      tracker.processOperation('selectElement');
      tracker.processOperation('createElement');
      expect(tracker.hasProperty('template')).toBe(true);

      tracker.processOperation('setElementContent');
      expect(tracker.hasProperty('template')).toBe(false);
      expect(tracker.hasProperty('selectedElement')).toBe(true);
      expect(tracker.findErasurePoint('template')).toEqual({ operation: 'setElementContent' });
      expect(tracker.getHistory()).toContainEqual({
        operation: 'setElementContent',
        action: 'removed',
        property: 'template',
      });
    });

    test('unknown operations are ignored', () => {
      const tracker = new OperationDataTracker();
      expect(tracker.processOperation('noSuchOperation')).toEqual([]);
      expect(tracker.getAvailableProperties()).toEqual([]);
      expect(tracker.getHistory()).toEqual([]);
    });
  });

  describe('erasure tracking', () => {
    test('a dependency erased by a previous operation is attributed to that operation', () => {
      const tracker = new OperationDataTracker();
      tracker.processOperation('__produceThing');
      tracker.processOperation('__eraseThing');
      expect(tracker.processOperation('__needThing')).toEqual(['thing']);
      expect(tracker.findErasurePoint('thing')).toEqual({ operation: '__eraseThing' });
    });

    test('a re-created property satisfies the dependency again', () => {
      const tracker = new OperationDataTracker();
      tracker.processOperation('__produceThing');
      tracker.processOperation('__eraseThing');
      tracker.processOperation('__produceThing');
      expect(tracker.processOperation('__needThing')).toEqual([]);
    });

    test('the most recent erasure is reported', () => {
      const tracker = new OperationDataTracker();
      tracker.processOperation('__produceThing');
      tracker.processOperation('__eraseThing');
      tracker.processOperation('__produceThing');
      tracker.processOperation('__erasedOutput');
      expect(tracker.hasProperty('thing')).toBe(false);
      expect(tracker.findErasurePoint('thing')).toEqual({ operation: '__erasedOutput' });
    });

    test('an output marked erased never becomes available', () => {
      const tracker = new OperationDataTracker();
      tracker.processOperation('__erasedOutput');
      expect(tracker.hasProperty('thing')).toBe(false);
      expect(tracker.processOperation('__needThing')).toEqual(['thing']);
    });
  });

  describe('clone', () => {
    test('a clone starts from the same state', () => {
      const tracker = new OperationDataTracker();
      tracker.processOperation('selectElement');
      const cloned = tracker.clone();
      expect(cloned.getAvailableProperties()).toEqual(['selectedElement']);
      expect(cloned.getHistory()).toEqual(tracker.getHistory());
    });

    test('changes to a clone do not affect the original, and vice versa', () => {
      const tracker = new OperationDataTracker();
      tracker.processOperation('__produceThing');
      const cloned = tracker.clone();

      cloned.processOperation('__eraseThing');
      cloned.processOperation('selectElement');
      expect(tracker.hasProperty('thing')).toBe(true);
      expect(tracker.hasProperty('selectedElement')).toBe(false);
      expect(tracker.findErasurePoint('thing')).toBeUndefined();

      tracker.processOperation('createElement');
      expect(cloned.hasProperty('template')).toBe(false);
    });

    test('getHistory returns a copy', () => {
      const tracker = new OperationDataTracker();
      tracker.processOperation('selectElement');
      tracker.getHistory().length = 0;
      expect(tracker.getHistory()).toHaveLength(1);
    });
  });

  describe('merge (if/else join)', () => {
    test('keeps only properties available in both branches', () => {
      const base = new OperationDataTracker();
      base.processOperation('__produceThing');
      const thenBranch = base.clone();
      const elseBranch = base.clone();
      thenBranch.processOperation('selectElement');
      elseBranch.processOperation('selectElement');
      elseBranch.processOperation('createElement');

      thenBranch.merge(elseBranch);
      expect(thenBranch.getAvailableProperties().sort()).toEqual(['selectedElement', 'thing']);
    });

    test('a property erased in one branch is unavailable after the join, with its erasure known', () => {
      const base = new OperationDataTracker();
      base.processOperation('__produceThing');
      const thenBranch = base.clone();
      const elseBranch = base.clone();
      elseBranch.processOperation('__eraseThing');

      thenBranch.merge(elseBranch);
      expect(thenBranch.hasProperty('thing')).toBe(false);
      expect(thenBranch.processOperation('__needThing')).toEqual(['thing']);
      expect(thenBranch.findErasurePoint('thing')).toEqual({ operation: '__eraseThing' });
    });

    test('the shared pre-branch history is not duplicated', () => {
      const base = new OperationDataTracker();
      base.processOperation('selectElement');
      const thenBranch = base.clone();
      const elseBranch = base.clone();
      thenBranch.processOperation('createElement');
      elseBranch.processOperation('__produceThing');

      thenBranch.merge(elseBranch);
      expect(thenBranch.getHistory().map(e => `${e.operation}:${e.property}`)).toEqual([
        'selectElement:selectedElement',
        'createElement:template',
        '__produceThing:thing',
      ]);
    });

    test('merging with an untouched clone (if without else) yields the then ∩ pre state', () => {
      const base = new OperationDataTracker();
      const thenBranch = base.clone();
      thenBranch.processOperation('selectElement');

      thenBranch.merge(base.clone());
      expect(thenBranch.hasProperty('selectedElement')).toBe(false);
    });
  });
});
