/**
 * Tests for registry generation logic
 *
 * These tests verify that the generate-registry script correctly extracts
 * operation names and categories directly from Eligius metadata.
 */

import { metadata } from 'eligius';
import { describe, expect, it } from 'vitest';
import { OPERATION_REGISTRY } from '../index.js';

describe('Registry Generation from Eligius Metadata', () => {
  describe('System names from Eligius', () => {
    it('should use Eligius metadata function names as system names', () => {
      // Verify that system names match Eligius metadata function names exactly
      // No custom name mappings should be used

      const eligiusFunctionNames = Object.keys(metadata)
        .filter(key => typeof metadata[key as keyof typeof metadata] === 'function')
        .sort();

      const registryNames = Object.keys(OPERATION_REGISTRY).sort();

      // Registry should contain all Eligius operations (except deprecated ones)
      // Note: Some operations might be filtered out (e.g., resizeAction)
      expect(registryNames.length).toBeGreaterThan(0);

      // Every registry entry should have a corresponding Eligius metadata function
      // (except synthetic operations like addController)
      const syntheticOperations = ['addController'];
      for (const systemName of registryNames) {
        if (!syntheticOperations.includes(systemName)) {
          expect(eligiusFunctionNames).toContain(systemName);
        }
      }
    });

    it('should have systemName matching the Eligius function name for addClass', () => {
      const sig = OPERATION_REGISTRY.addClass;
      expect(sig).toBeDefined();
      expect(sig.systemName).toBe('addClass'); // Direct from Eligius, not custom mapped
    });

    it('should have systemName matching the Eligius function name for selectElement', () => {
      const sig = OPERATION_REGISTRY.selectElement;
      expect(sig).toBeDefined();
      expect(sig.systemName).toBe('selectElement'); // Direct from Eligius, not custom mapped
    });
  });

  describe('Categories from Eligius metadata', () => {
    it('should extract category from Eligius metadata, not hardcoded lookup', () => {
      // Get category from Eligius metadata directly
      const addClassMetadata = metadata.addClass();
      const eligiusCategory = addClassMetadata.category;

      // Registry should use the same category
      const sig = OPERATION_REGISTRY.addClass;
      expect(sig.category).toBe(eligiusCategory);
      expect(sig.category).toBe('DOM'); // Verify it's using Eligius value
    });

    it('should have category from metadata for all operations', () => {
      // Every operation should have a category from Eligius metadata
      // (except synthetic operations like addController)
      const syntheticOperations = ['addController'];
      for (const [systemName, signature] of Object.entries(OPERATION_REGISTRY)) {
        if (syntheticOperations.includes(systemName)) {
          continue; // Skip synthetic operations
        }
        const metadataFunc = metadata[systemName as keyof typeof metadata];
        expect(metadataFunc).toBeDefined();
        expect(typeof metadataFunc).toBe('function');

        const operationMetadata = (metadataFunc as () => any)();
        expect(operationMetadata.category).toBeDefined();
        expect(signature.category).toBe(operationMetadata.category);
      }
    });

    it('should use Eligius category for Control Flow operations', () => {
      const whenMetadata = metadata.when();
      const otherwiseMetadata = metadata.otherwise();

      expect(OPERATION_REGISTRY.when.category).toBe(whenMetadata.category);
      expect(OPERATION_REGISTRY.otherwise.category).toBe(otherwiseMetadata.category);
    });

    it('should use Eligius category for CSS operations', () => {
      const addClassMetadata = metadata.addClass();
      const removeClassMetadata = metadata.removeClass();
      const toggleClassMetadata = metadata.toggleClass();

      expect(OPERATION_REGISTRY.addClass.category).toBe(addClassMetadata.category);
      expect(OPERATION_REGISTRY.removeClass.category).toBe(removeClassMetadata.category);
      expect(OPERATION_REGISTRY.toggleClass.category).toBe(toggleClassMetadata.category);
    });
  });

  describe('No custom mappings', () => {
    it('should not use any custom system name mappings', () => {
      // Verify that for every operation in the registry, the systemName
      // matches the Eligius metadata function name exactly
      // (except synthetic operations like addController)
      const syntheticOperations = ['addController'];
      for (const [registryKey, signature] of Object.entries(OPERATION_REGISTRY)) {
        // Registry key should match systemName
        expect(signature.systemName).toBe(registryKey);

        if (syntheticOperations.includes(registryKey)) {
          continue; // Skip synthetic operations - they don't have Eligius metadata
        }

        // SystemName should exist as a function in Eligius metadata
        const metadataFunc = metadata[registryKey as keyof typeof metadata];
        expect(typeof metadataFunc).toBe('function');
      }
    });
  });
});
