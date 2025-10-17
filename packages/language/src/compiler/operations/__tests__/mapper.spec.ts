/**
 * Tests for operation parameter mapping
 *
 * BUG-001 FIX (T324): Updated tests to use JsonValue instead of Expression AST nodes.
 * Arguments are now pre-transformed by the transformer before reaching the mapper.
 */

import { describe, expect, it } from 'vitest';
import type { JsonValue } from '../../types/eligius-ir.js';
import { mapParameters, mapPositionalToNamed } from '../mapper.js';
import type { OperationSignature } from '../types.js';

describe('T226: Operation Parameter Mapping', () => {
  describe('mapPositionalToNamed', () => {
    it('should map single required parameter', () => {
      const signature: OperationSignature = {
        systemName: 'addClass',
        description: 'Add CSS class',
        parameters: [{ name: 'className', type: ['ParameterType:className'], required: true }],
        dependencies: [],
        outputs: [],
        category: 'CSS',
      };

      // BUG-001 FIX (T324): Arguments are now pre-transformed JsonValue
      const args: JsonValue[] = ['active'];

      const result = mapPositionalToNamed(signature, args);

      expect(result.success).toBe(true);
      expect(result.operationData).toEqual({ className: 'active' });
      expect(result.errors).toHaveLength(0);
    });

    it('should map multiple required parameters', () => {
      const signature: OperationSignature = {
        systemName: 'animate',
        description: 'Animate element',
        parameters: [
          { name: 'properties', type: ['ParameterType:object'], required: true },
          { name: 'duration', type: ['ParameterType:number'], required: true },
        ],
        dependencies: [],
        outputs: [],
        category: 'Animation',
      };

      // BUG-001 FIX (T324): Arguments are now pre-transformed JsonValue
      const args: JsonValue[] = [{ opacity: 1 }, 500];

      const result = mapPositionalToNamed(signature, args);

      expect(result.success).toBe(true);
      expect(result.operationData).toHaveProperty('properties');
      expect(result.operationData).toHaveProperty('duration', 500);
    });

    it('should use default value for optional parameter', () => {
      const signature: OperationSignature = {
        systemName: 'selectElement',
        description: 'Select element',
        parameters: [
          { name: 'selector', type: ['ParameterType:selector'], required: true },
          {
            name: 'useSelectedElementAsRoot',
            type: ['ParameterType:boolean'],
            required: false,
            defaultValue: false,
          },
        ],
        dependencies: [],
        outputs: [],
        category: 'DOM',
      };

      // BUG-001 FIX (T324): Arguments are now pre-transformed JsonValue
      const args: JsonValue[] = ['#myElement'];

      const result = mapPositionalToNamed(signature, args);

      expect(result.success).toBe(true);
      expect(result.operationData).toEqual({
        selector: '#myElement',
        useSelectedElementAsRoot: false,
      });
    });

    it('should omit optional parameter without default value', () => {
      const signature: OperationSignature = {
        systemName: 'test',
        description: 'Test operation',
        parameters: [
          { name: 'required', type: ['ParameterType:string'], required: true },
          { name: 'optional', type: ['ParameterType:string'], required: false },
        ],
        dependencies: [],
        outputs: [],
        category: 'Test',
      };

      // BUG-001 FIX (T324): Arguments are now pre-transformed JsonValue
      const args: JsonValue[] = ['test'];

      const result = mapPositionalToNamed(signature, args);

      expect(result.success).toBe(true);
      expect(result.operationData).toEqual({ required: 'test' });
      expect(result.operationData).not.toHaveProperty('optional');
    });

    it('should fail when required parameter is missing', () => {
      const signature: OperationSignature = {
        systemName: 'addClass',
        description: 'Add CSS class',
        parameters: [{ name: 'className', type: ['ParameterType:className'], required: true }],
        dependencies: [],
        outputs: [],
        category: 'CSS',
      };

      // BUG-001 FIX (T324): Arguments are now pre-transformed JsonValue
      const args: JsonValue[] = [];

      const result = mapPositionalToNamed(signature, args);

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('MAPPING_ERROR');
      expect(result.errors[0].message).toContain('className');
      expect(result.errors[0].hint).toBeDefined();
    });
  });

  // BUG-001 FIX (T324): resolvePropertyChain tests removed
  // Function no longer exists - reference resolution now happens in transformer

  describe('mapParameters (complete pipeline)', () => {
    it('should handle string literal argument', () => {
      const signature: OperationSignature = {
        systemName: 'addClass',
        description: 'Add CSS class',
        parameters: [{ name: 'className', type: ['ParameterType:className'], required: true }],
        dependencies: [],
        outputs: [],
        category: 'CSS',
      };

      // BUG-001 FIX (T324): Arguments are now pre-transformed JsonValue
      const args: JsonValue[] = ['active'];

      const result = mapParameters(signature, args);

      expect(result.success).toBe(true);
      expect(result.operationData).toEqual({ className: 'active' });
    });

    it('should handle number literal argument', () => {
      const signature: OperationSignature = {
        systemName: 'delay',
        description: 'Delay execution',
        parameters: [{ name: 'duration', type: ['ParameterType:number'], required: true }],
        dependencies: [],
        outputs: [],
        category: 'Timing',
      };

      // BUG-001 FIX (T324): Arguments are now pre-transformed JsonValue
      const args: JsonValue[] = [1000];

      const result = mapParameters(signature, args);

      expect(result.success).toBe(true);
      expect(result.operationData).toEqual({ duration: 1000 });
    });

    it('should handle boolean literal argument', () => {
      const signature: OperationSignature = {
        systemName: 'test',
        description: 'Test operation',
        parameters: [{ name: 'enabled', type: ['ParameterType:boolean'], required: true }],
        dependencies: [],
        outputs: [],
        category: 'Test',
      };

      // BUG-001 FIX (T324): Arguments are now pre-transformed JsonValue
      const args: JsonValue[] = [true];

      const result = mapParameters(signature, args);

      expect(result.success).toBe(true);
      expect(result.operationData).toEqual({ enabled: true });
    });

    it('should handle reference string argument (from @@loopVar)', () => {
      const signature: OperationSignature = {
        systemName: 'selectElement',
        description: 'Select element',
        parameters: [{ name: 'selector', type: ['ParameterType:selector'], required: true }],
        dependencies: [],
        outputs: [],
        category: 'DOM',
      };

      // BUG-001 FIX (T324): Reference expressions are transformed to strings by transformer
      const args: JsonValue[] = ['$scope.currentItem'];

      const result = mapParameters(signature, args);

      expect(result.success).toBe(true);
      expect(result.operationData).toEqual({ selector: '$scope.currentItem' });
    });

    it('should handle reference string argument (from @varName)', () => {
      const signature: OperationSignature = {
        systemName: 'selectElement',
        description: 'Select element',
        parameters: [{ name: 'selector', type: ['ParameterType:selector'], required: true }],
        dependencies: [],
        outputs: [],
        category: 'DOM',
      };

      // BUG-001 FIX (T324): Reference expressions are transformed to strings by transformer
      const args: JsonValue[] = ['$scope.variables.mySelector'];

      const result = mapParameters(signature, args);

      expect(result.success).toBe(true);
      expect(result.operationData).toEqual({ selector: '$scope.variables.mySelector' });
    });

    it('should handle reference string argument (from paramName)', () => {
      const signature: OperationSignature = {
        systemName: 'selectElement',
        description: 'Select element',
        parameters: [{ name: 'selector', type: ['ParameterType:selector'], required: true }],
        dependencies: [],
        outputs: [],
        category: 'DOM',
      };

      // BUG-001 FIX (T324): Reference expressions are transformed to strings by transformer
      const args: JsonValue[] = ['$operationdata.targetSelector'];

      const result = mapParameters(signature, args);

      expect(result.success).toBe(true);
      expect(result.operationData).toEqual({ selector: '$operationdata.targetSelector' });
    });

    it('should handle object literal argument', () => {
      const signature: OperationSignature = {
        systemName: 'animate',
        description: 'Animate element',
        parameters: [{ name: 'properties', type: ['ParameterType:object'], required: true }],
        dependencies: [],
        outputs: [],
        category: 'Animation',
      };

      // BUG-001 FIX (T324): Arguments are now pre-transformed JsonValue
      const args: JsonValue[] = [{ opacity: 0 }];

      const result = mapParameters(signature, args);

      expect(result.success).toBe(true);
      expect(result.operationData).toHaveProperty('properties');
      expect((result.operationData as any).properties).toHaveProperty('opacity', 0);
    });

    it('should handle array literal argument', () => {
      const signature: OperationSignature = {
        systemName: 'test',
        description: 'Test operation',
        parameters: [{ name: 'items', type: ['ParameterType:array'], required: true }],
        dependencies: [],
        outputs: [],
        category: 'Test',
      };

      // BUG-001 FIX (T324): Arguments are now pre-transformed JsonValue
      const args: JsonValue[] = [['a', 'b']];

      const result = mapParameters(signature, args);

      expect(result.success).toBe(true);
      expect(result.operationData).toEqual({ items: ['a', 'b'] });
    });

    it('should propagate errors from positional mapping', () => {
      const signature: OperationSignature = {
        systemName: 'test',
        description: 'Test operation',
        parameters: [{ name: 'required', type: ['ParameterType:string'], required: true }],
        dependencies: [],
        outputs: [],
        category: 'Test',
      };

      // BUG-001 FIX (T324): Arguments are now pre-transformed JsonValue
      const args: JsonValue[] = [];

      const result = mapParameters(signature, args);

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
    });
  });
});
