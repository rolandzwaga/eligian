/**
 * Unit tests for operation registry module
 *
 * These tests verify that the operation registry correctly loads, caches,
 * and provides access to operation metadata.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  getAllOperations,
  getOperation,
  getOperationCount,
  isFilteredOperation,
  loadOperationRegistry,
  resetRegistry,
} from '../completion/registry.js';

describe('Operation Registry', () => {
  // Reset registry before each test to ensure clean state
  beforeEach(() => {
    resetRegistry();
  });

  describe('loadOperationRegistry', () => {
    it('should load operation registry successfully', () => {
      const registry = loadOperationRegistry();

      expect(registry).toBeDefined();
      expect(Array.isArray(registry)).toBe(true);
      expect(registry.length).toBeGreaterThan(0);
    });

    it('should use singleton pattern (load once, cache result)', () => {
      const registry1 = loadOperationRegistry();
      const registry2 = loadOperationRegistry();

      // Should return the same instance (cached)
      expect(registry1).toBe(registry2);
    });

    it('should reload after reset', () => {
      const registry1 = loadOperationRegistry();
      resetRegistry();
      const registry2 = loadOperationRegistry();

      // Should create a new array after reset (due to sorting and merging synthetic operations)
      // But should have the same length and content
      expect(registry1).not.toBe(registry2); // Different array references
      expect(registry1.length).toBe(registry2.length);
      expect(registry1[0].name).toBe(registry2[0].name); // Same content
    });
  });

  describe('getAllOperations', () => {
    it('should return all operations', () => {
      const operations = getAllOperations();

      expect(operations).toBeDefined();
      expect(Array.isArray(operations)).toBe(true);
      expect(operations.length).toBeGreaterThan(0);
    });

    it('should return sorted operations (alphabetically by name)', () => {
      const operations = getAllOperations();

      // Check that operations are sorted alphabetically
      for (let i = 1; i < operations.length; i++) {
        const prev = operations[i - 1].name;
        const curr = operations[i].name;
        expect(prev.localeCompare(curr)).toBeLessThanOrEqual(0);
      }
    });

    it.each([
      { operation: 'breakForEach', description: 'break keyword (DSL sugar)' },
      { operation: 'continueForEach', description: 'continue keyword (DSL sugar)' },
      { operation: 'ifCondition', description: 'if statement (DSL syntax)' },
      { operation: 'elseCondition', description: 'else statement (DSL syntax)' },
      { operation: 'forEach', description: 'for loop (DSL syntax)' },
    ])('should not include $operation ($description)', ({ operation }) => {
      const operations = getAllOperations();
      const found = operations.find(op => op.name === operation);
      expect(found).toBeUndefined();
    });

    it('should include common operations like selectElement', () => {
      const operations = getAllOperations();

      const selectElement = operations.find(op => op.name === 'selectElement');
      expect(selectElement).toBeDefined();
      expect(selectElement?.name).toBe('selectElement');
      expect(selectElement?.description).toBeDefined();
      expect(selectElement?.parameters).toBeDefined();
    });
  });

  describe('getOperation', () => {
    it('should return operation metadata for valid operation name', () => {
      const operation = getOperation('selectElement');

      expect(operation).toBeDefined();
      expect(operation?.name).toBe('selectElement');
      expect(operation?.description).toContain('select');
      expect(operation?.parameters).toBeDefined();
      expect(Array.isArray(operation?.parameters)).toBe(true);
    });

    it('should return undefined for non-existent operation', () => {
      const operation = getOperation('nonExistentOperation');

      expect(operation).toBeUndefined();
    });

    it('should return undefined for filtered operation', () => {
      const operation = getOperation('breakForEach');

      expect(operation).toBeUndefined();
    });

    it('should return operation with correct parameter metadata', () => {
      const operation = getOperation('selectElement');

      expect(operation).toBeDefined();
      expect(operation?.parameters.length).toBeGreaterThan(0);

      // selectElement should have a 'selector' parameter
      const selectorParam = operation?.parameters.find(p => p.name === 'selector');
      expect(selectorParam).toBeDefined();
      expect(selectorParam?.required).toBe(true);
      expect(selectorParam?.type).toBeDefined();
    });

    it('should return operation with dependencies metadata', () => {
      const operation = getOperation('addClass');

      expect(operation).toBeDefined();
      // addClass depends on selectedElement from previous operation
      expect(operation?.dependencies).toBeDefined();
      expect(Array.isArray(operation?.dependencies)).toBe(true);
    });

    it('should return operation with outputs metadata', () => {
      const operation = getOperation('selectElement');

      expect(operation).toBeDefined();
      // selectElement outputs selectedElement
      expect(operation?.outputs).toBeDefined();
      expect(Array.isArray(operation?.outputs)).toBe(true);
      expect(operation?.outputs).toContain('selectedElement');
    });
  });

  describe('isFilteredOperation', () => {
    it('should return true for breakForEach', () => {
      expect(isFilteredOperation('breakForEach')).toBe(true);
    });

    it('should return true for continueForEach', () => {
      expect(isFilteredOperation('continueForEach')).toBe(true);
    });

    it('should return true for ifCondition', () => {
      expect(isFilteredOperation('ifCondition')).toBe(true);
    });

    it('should return true for elseCondition', () => {
      expect(isFilteredOperation('elseCondition')).toBe(true);
    });

    it('should return true for forEach', () => {
      expect(isFilteredOperation('forEach')).toBe(true);
    });

    it('should return false for regular operations', () => {
      expect(isFilteredOperation('selectElement')).toBe(false);
      expect(isFilteredOperation('addClass')).toBe(false);
      expect(isFilteredOperation('animate')).toBe(false);
    });

    it('should return false for non-existent operations', () => {
      expect(isFilteredOperation('nonExistentOperation')).toBe(false);
    });
  });

  describe('getOperationCount', () => {
    it('should return correct number of operations', () => {
      const count = getOperationCount();

      expect(count).toBeGreaterThan(0);
      expect(count).toBe(getAllOperations().length);
    });

    it('should return 77 operations (76 Eligius + 1 synthetic)', () => {
      const count = getOperationCount();

      // Eligius 1.4.1 has 76 operations
      // We add 1 synthetic operation (addController)
      // Total: 77 operations
      expect(count).toBe(77);
    });
  });
});
