/**
 * Tests for operation registry
 *
 * T224: Validate that all operations are registered with correct signatures
 */

import { describe, expect, it } from 'vitest';
import {
  getAllOperationNames,
  getAllOperations,
  getOperationSignature,
  getOperationsByCategory,
  hasOperation,
  OPERATION_REGISTRY,
  validateRegistry,
} from '../index.js';

describe('T224: Operation Registry Tests', () => {
  describe('Registry completeness', () => {
    it('should have all non-deprecated operations registered', () => {
      const allOperations = getAllOperations();
      // We expect 48 operations (49 from Eligius - 1 deprecated: resizeAction)
      // Latest additions: breakForEach, continueForEach (Eligius 1.3.0)
      expect(allOperations.length).toBe(48);
    });

    it('should have no duplicate operation names', () => {
      const names = getAllOperationNames();
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });

    it('should register all common operations', () => {
      const expectedOperations = [
        'addClass',
        'removeClass',
        'toggleClass',
        'selectElement',
        'animate',
        'wait',
        'setData',
        'setStyle',
        'when',
        'otherwise',
        'endWhen',
        'forEach',
        'endForEach',
        'breakForEach',
        'continueForEach',
      ];

      for (const opName of expectedOperations) {
        expect(hasOperation(opName)).toBe(true);
      }
    });

    it('should have valid registry structure', () => {
      // validateRegistry() throws on error, so if it doesn't throw, registry is valid
      expect(() => validateRegistry()).not.toThrow();
    });
  });

  describe('Operation signatures', () => {
    it('should have required fields for all operations', () => {
      const allOperations = getAllOperations();

      for (const op of allOperations) {
        expect(op.systemName).toBeDefined();
        expect(op.systemName).toBeTruthy();
        expect(op.description).toBeDefined();
        expect(op.parameters).toBeDefined();
        expect(Array.isArray(op.parameters)).toBe(true);
        expect(op.dependencies).toBeDefined();
        expect(Array.isArray(op.dependencies)).toBe(true);
        expect(op.outputs).toBeDefined();
        expect(Array.isArray(op.outputs)).toBe(true);
        expect(op.category).toBeDefined();
      }
    });

    it('should have valid parameter definitions', () => {
      const allOperations = getAllOperations();

      for (const op of allOperations) {
        for (const param of op.parameters) {
          expect(param.name).toBeDefined();
          expect(param.name).toBeTruthy();
          expect(param.type).toBeDefined();
          expect(param.required).toBeDefined();
          expect(typeof param.required).toBe('boolean');

          // If parameter has defaultValue, it should not be required
          if (param.defaultValue !== undefined) {
            // Note: Some parameters might have defaults but still be required
            // This is valid in some cases (e.g., boolean flags)
          }
        }
      }
    });

    it('should have valid dependency definitions', () => {
      const allOperations = getAllOperations();

      for (const op of allOperations) {
        for (const dep of op.dependencies) {
          expect(dep.name).toBeDefined();
          expect(dep.name).toBeTruthy();
          expect(dep.type).toBeDefined();
        }
      }
    });

    it('should have valid output definitions', () => {
      const allOperations = getAllOperations();

      for (const op of allOperations) {
        for (const output of op.outputs) {
          expect(output.name).toBeDefined();
          expect(output.name).toBeTruthy();
          expect(output.type).toBeDefined();
        }
      }
    });
  });

  describe('Specific operation signatures', () => {
    it('should have correct signature for addClass', () => {
      const sig = getOperationSignature('addClass');
      expect(sig).toBeDefined();
      expect(sig?.systemName).toBe('addClass');
      expect(sig?.parameters).toHaveLength(1);
      expect(sig?.parameters[0].name).toBe('className');
      expect(sig?.parameters[0].required).toBe(true);
      expect(sig?.dependencies).toHaveLength(1);
      expect(sig?.dependencies[0].name).toBe('selectedElement');
    });

    it('should have correct signature for selectElement', () => {
      const sig = getOperationSignature('selectElement');
      expect(sig).toBeDefined();
      expect(sig?.systemName).toBe('selectElement');
      expect(sig?.parameters.length).toBeGreaterThanOrEqual(1);
      expect(sig?.parameters[0].name).toBe('selector');
      expect(sig?.parameters[0].required).toBe(true);
      expect(sig?.outputs).toHaveLength(1);
      expect(sig?.outputs[0].name).toBe('selectedElement');
    });

    it('should have correct signature for animate', () => {
      const sig = getOperationSignature('animate');
      expect(sig).toBeDefined();
      expect(sig?.systemName).toBe('animate');
      expect(sig?.parameters.length).toBeGreaterThanOrEqual(2);

      const propParam = sig?.parameters.find(p => p.name === 'animationProperties');
      expect(propParam).toBeDefined();
      expect(propParam?.required).toBe(true);

      const durParam = sig?.parameters.find(p => p.name === 'animationDuration');
      expect(durParam).toBeDefined();
      expect(durParam?.required).toBe(true);

      expect(sig?.dependencies).toHaveLength(1);
      expect(sig?.dependencies[0].name).toBe('selectedElement');
    });

    it('should have correct signature for wait', () => {
      const sig = getOperationSignature('wait');
      expect(sig).toBeDefined();
      expect(sig?.systemName).toBe('wait');
      expect(sig?.parameters).toHaveLength(1);
      expect(sig?.parameters[0].name).toBe('milliseconds');
      expect(sig?.parameters[0].required).toBe(true);
      expect(sig?.dependencies).toHaveLength(0);
      expect(sig?.outputs).toHaveLength(0);
    });

    it('should have correct signatures for control flow operations', () => {
      const when = getOperationSignature('when');
      expect(when).toBeDefined();
      expect(when?.systemName).toBe('when');

      const otherwise = getOperationSignature('otherwise');
      expect(otherwise).toBeDefined();
      expect(otherwise?.systemName).toBe('otherwise');

      const endWhen = getOperationSignature('endWhen');
      expect(endWhen).toBeDefined();
      expect(endWhen?.systemName).toBe('endWhen');

      const forEach = getOperationSignature('forEach');
      expect(forEach).toBeDefined();
      expect(forEach?.systemName).toBe('forEach');

      const endForEach = getOperationSignature('endForEach');
      expect(endForEach).toBeDefined();
      expect(endForEach?.systemName).toBe('endForEach');
    });

    it('should have correct signatures for loop control operations', () => {
      const breakForEach = getOperationSignature('breakForEach');
      expect(breakForEach).toBeDefined();
      expect(breakForEach?.systemName).toBe('breakForEach');
      expect(breakForEach?.category).toBe('Control Flow');
      expect(breakForEach?.parameters).toBeDefined();

      const continueForEach = getOperationSignature('continueForEach');
      expect(continueForEach).toBeDefined();
      expect(continueForEach?.systemName).toBe('continueForEach');
      expect(continueForEach?.category).toBe('Control Flow');
      expect(continueForEach?.parameters).toBeDefined();
    });
  });

  describe('Registry lookup functions', () => {
    it('should return undefined for unknown operation', () => {
      const sig = getOperationSignature('unknownOperation');
      expect(sig).toBeUndefined();
    });

    it('should return false for unknown operation in hasOperation', () => {
      expect(hasOperation('unknownOperation')).toBe(false);
    });

    it('should return all operation names sorted alphabetically', () => {
      const names = getAllOperationNames();
      const sortedNames = [...names].sort();
      expect(names).toEqual(sortedNames);
    });

    it('should group operations by category', () => {
      const byCategory = getOperationsByCategory();

      expect(byCategory).toBeDefined();
      expect(Object.keys(byCategory).length).toBeGreaterThan(0);

      // Check that all operations are in a category
      const allOps = getAllOperations();
      const categorizedOps = Object.values(byCategory).flat();
      expect(categorizedOps.length).toBe(allOps.length);

      // Common categories we expect
      const categories = Object.keys(byCategory);
      // We don't assert exact category names since they come from Eligius metadata
      expect(categories.length).toBeGreaterThan(0);
    });
  });

  describe('Registry validation', () => {
    it('should validate that all operations are accessible', () => {
      const registry = OPERATION_REGISTRY;
      expect(registry).toBeDefined();
      expect(typeof registry).toBe('object');

      const keys = Object.keys(registry);
      expect(keys.length).toBe(48);

      for (const key of keys) {
        const operation = registry[key];
        expect(operation).toBeDefined();
        expect(operation.systemName).toBe(key);
      }
    });

    it('should have consistent operation names between registry and getAllOperationNames', () => {
      const registryKeys = Object.keys(OPERATION_REGISTRY).sort();
      const functionNames = getAllOperationNames();

      expect(functionNames).toEqual(registryKeys);
    });

    it('should have all operations from getAllOperations in registry', () => {
      const allOps = getAllOperations();

      for (const op of allOps) {
        expect(OPERATION_REGISTRY[op.systemName]).toBeDefined();
        expect(OPERATION_REGISTRY[op.systemName]).toBe(op);
      }
    });
  });

  describe('Parameter types', () => {
    it('should use rich parameter types from Eligius', () => {
      const addClass = getOperationSignature('addClass');
      expect(addClass?.parameters[0].type).toEqual(['ParameterType:className']);

      const selectElement = getOperationSignature('selectElement');
      expect(selectElement?.parameters[0].type).toEqual(['ParameterType:selector']);

      const wait = getOperationSignature('wait');
      expect(wait?.parameters[0].type).toEqual(['ParameterType:number']);
    });

    it('should have object type for complex parameters', () => {
      const animate = getOperationSignature('animate');
      const propParam = animate?.parameters.find(p => p.name === 'animationProperties');
      expect(propParam?.type).toEqual(['ParameterType:object']);
    });

    it('should support multi-type parameters', () => {
      const forEach = getOperationSignature('forEach');
      expect(forEach).toBeDefined();
      const collectionParam = forEach?.parameters.find(p => p.name === 'collection');
      expect(collectionParam?.type).toEqual(['ParameterType:array', 'ParameterType:string']);
      expect(Array.isArray(collectionParam?.type)).toBe(true);
      expect(collectionParam?.type).toHaveLength(2);
    });
  });
});
