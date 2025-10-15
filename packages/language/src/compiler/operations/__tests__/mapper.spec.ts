/**
 * Tests for operation parameter mapping
 */

import { describe, expect, it } from 'vitest';
import type { Expression, PropertyChainReference } from '../../../generated/ast.js';
import { mapParameters, mapPositionalToNamed, resolvePropertyChain } from '../mapper.js';
import type { OperationSignature } from '../types.js';

describe('T226: Operation Parameter Mapping', () => {
  describe('mapPositionalToNamed', () => {
    it('should map single required parameter', () => {
      const signature: OperationSignature = {
        systemName: 'addClass',
        description: 'Add CSS class',
        parameters: [{ name: 'className', type: 'ParameterType:className', required: true }],
        dependencies: [],
        outputs: [],
        category: 'CSS',
      };

      const args: Expression[] = [{ $type: 'StringLiteral', value: 'active' } as any];

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
          { name: 'properties', type: 'ParameterType:object', required: true },
          { name: 'duration', type: 'ParameterType:number', required: true },
        ],
        dependencies: [],
        outputs: [],
        category: 'Animation',
      };

      const args: Expression[] = [
        { $type: 'ObjectLiteral', properties: [] } as any,
        { $type: 'NumberLiteral', value: 500 } as any,
      ];

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
          { name: 'selector', type: 'ParameterType:selector', required: true },
          {
            name: 'useSelectedElementAsRoot',
            type: 'ParameterType:boolean',
            required: false,
            defaultValue: false,
          },
        ],
        dependencies: [],
        outputs: [],
        category: 'DOM',
      };

      const args: Expression[] = [{ $type: 'StringLiteral', value: '#myElement' } as any];

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
          { name: 'required', type: 'ParameterType:string', required: true },
          { name: 'optional', type: 'ParameterType:string', required: false },
        ],
        dependencies: [],
        outputs: [],
        category: 'Test',
      };

      const args: Expression[] = [{ $type: 'StringLiteral', value: 'test' } as any];

      const result = mapPositionalToNamed(signature, args);

      expect(result.success).toBe(true);
      expect(result.operationData).toEqual({ required: 'test' });
      expect(result.operationData).not.toHaveProperty('optional');
    });

    it('should fail when required parameter is missing', () => {
      const signature: OperationSignature = {
        systemName: 'addClass',
        description: 'Add CSS class',
        parameters: [{ name: 'className', type: 'ParameterType:className', required: true }],
        dependencies: [],
        outputs: [],
        category: 'CSS',
      };

      const args: Expression[] = [];

      const result = mapPositionalToNamed(signature, args);

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('MAPPING_ERROR');
      expect(result.errors[0].message).toContain('className');
      expect(result.errors[0].hint).toBeDefined();
    });
  });

  describe('resolvePropertyChain', () => {
    it('should resolve $context property chain', () => {
      const chain: PropertyChainReference = {
        $type: 'PropertyChainReference',
        scope: 'context',
        properties: ['currentItem', 'id'],
      } as any;

      const result = resolvePropertyChain(chain);

      expect(result).toBe('context.currentItem.id');
    });

    it('should resolve $operationdata property chain', () => {
      const chain: PropertyChainReference = {
        $type: 'PropertyChainReference',
        scope: 'operationdata',
        properties: ['selectedElement'],
      } as any;

      const result = resolvePropertyChain(chain);

      expect(result).toBe('operationdata.selectedElement');
    });

    it('should resolve $globaldata property chain', () => {
      const chain: PropertyChainReference = {
        $type: 'PropertyChainReference',
        scope: 'globaldata',
        properties: ['user', 'name'],
      } as any;

      const result = resolvePropertyChain(chain);

      expect(result).toBe('globaldata.user.name');
    });

    it('should handle single property', () => {
      const chain: PropertyChainReference = {
        $type: 'PropertyChainReference',
        scope: 'context',
        properties: ['value'],
      } as any;

      const result = resolvePropertyChain(chain);

      expect(result).toBe('context.value');
    });
  });

  describe('mapParameters (complete pipeline)', () => {
    it('should handle string literal argument', () => {
      const signature: OperationSignature = {
        systemName: 'addClass',
        description: 'Add CSS class',
        parameters: [{ name: 'className', type: 'ParameterType:className', required: true }],
        dependencies: [],
        outputs: [],
        category: 'CSS',
      };

      const args: Expression[] = [{ $type: 'StringLiteral', value: 'active' } as any];

      const result = mapParameters(signature, args);

      expect(result.success).toBe(true);
      expect(result.operationData).toEqual({ className: 'active' });
    });

    it('should handle number literal argument', () => {
      const signature: OperationSignature = {
        systemName: 'delay',
        description: 'Delay execution',
        parameters: [{ name: 'duration', type: 'ParameterType:number', required: true }],
        dependencies: [],
        outputs: [],
        category: 'Timing',
      };

      const args: Expression[] = [{ $type: 'NumberLiteral', value: 1000 } as any];

      const result = mapParameters(signature, args);

      expect(result.success).toBe(true);
      expect(result.operationData).toEqual({ duration: 1000 });
    });

    it('should handle boolean literal argument', () => {
      const signature: OperationSignature = {
        systemName: 'test',
        description: 'Test operation',
        parameters: [{ name: 'enabled', type: 'ParameterType:boolean', required: true }],
        dependencies: [],
        outputs: [],
        category: 'Test',
      };

      const args: Expression[] = [{ $type: 'BooleanLiteral', value: true } as any];

      const result = mapParameters(signature, args);

      expect(result.success).toBe(true);
      expect(result.operationData).toEqual({ enabled: true });
    });

    it('should handle property chain argument', () => {
      const signature: OperationSignature = {
        systemName: 'test',
        description: 'Test operation',
        parameters: [{ name: 'value', type: 'ParameterType:expression', required: true }],
        dependencies: [],
        outputs: [],
        category: 'Test',
      };

      const args: Expression[] = [
        {
          $type: 'PropertyChainReference',
          scope: 'context',
          properties: ['currentItem'],
        } as any,
      ];

      const result = mapParameters(signature, args);

      expect(result.success).toBe(true);
      expect(result.operationData).toEqual({ value: 'context.currentItem' });
    });

    it('should handle object literal argument', () => {
      const signature: OperationSignature = {
        systemName: 'animate',
        description: 'Animate element',
        parameters: [{ name: 'properties', type: 'ParameterType:object', required: true }],
        dependencies: [],
        outputs: [],
        category: 'Animation',
      };

      const args: Expression[] = [
        {
          $type: 'ObjectLiteral',
          properties: [{ key: 'opacity', value: { $type: 'NumberLiteral', value: 0 } }],
        } as any,
      ];

      const result = mapParameters(signature, args);

      expect(result.success).toBe(true);
      expect(result.operationData).toHaveProperty('properties');
      expect((result.operationData as any).properties).toHaveProperty('opacity', 0);
    });

    it('should handle array literal argument', () => {
      const signature: OperationSignature = {
        systemName: 'test',
        description: 'Test operation',
        parameters: [{ name: 'items', type: 'ParameterType:array', required: true }],
        dependencies: [],
        outputs: [],
        category: 'Test',
      };

      const args: Expression[] = [
        {
          $type: 'ArrayLiteral',
          elements: [
            { $type: 'StringLiteral', value: 'a' },
            { $type: 'StringLiteral', value: 'b' },
          ],
        } as any,
      ];

      const result = mapParameters(signature, args);

      expect(result.success).toBe(true);
      expect(result.operationData).toEqual({ items: ['a', 'b'] });
    });

    it('should propagate errors from positional mapping', () => {
      const signature: OperationSignature = {
        systemName: 'test',
        description: 'Test operation',
        parameters: [{ name: 'required', type: 'ParameterType:string', required: true }],
        dependencies: [],
        outputs: [],
        category: 'Test',
      };

      const args: Expression[] = [];

      const result = mapParameters(signature, args);

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
    });
  });
});
