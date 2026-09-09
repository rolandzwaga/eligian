/**
 * Tests for parameter type handling
 *
 * Verifies that we use Eligius parameter types directly without duplication
 */

import type { metadata } from 'eligius';
import { describe, expect, it } from 'vitest';
import type { OperationParameter } from '../types.js';

describe('Parameter Types from Eligius', () => {
  it('should use metadata.TParameterTypes for type definitions', () => {
    // This test verifies that our ParameterType can handle all Eligius types
    // Without this, if Eligius adds new types, we'd be out of sync

    const eligiusType: metadata.TParameterTypes = 'ParameterType:string';

    // Our OperationParameter should accept Eligius types directly
    const param: OperationParameter = {
      name: 'test',
      type: [eligiusType], // Should accept metadata.TParameterTypes
      required: true,
    };

    expect(param.type[0]).toBe('ParameterType:string');
  });

  it.each([
    { type: 'ParameterType:string' as const, description: 'string type' },
    { type: 'ParameterType:number' as const, description: 'number type' },
    { type: 'ParameterType:boolean' as const, description: 'boolean type' },
    { type: 'ParameterType:object' as const, description: 'object type' },
    { type: 'ParameterType:array' as const, description: 'array type' },
    { type: 'ParameterType:className' as const, description: 'className type' },
    { type: 'ParameterType:selector' as const, description: 'selector type' },
  ])(
    'should handle standard Eligius parameter type $type ($description)',
    ({ type: eligiusType }) => {
      const param: OperationParameter = {
        name: 'test',
        type: [eligiusType],
        required: false,
      };

      expect(param.type[0]).toBe(eligiusType);
    }
  );

  it.each([
    { type: 'ParameterType:function' as const, description: 'function type (recently added)' },
    { type: 'ParameterType:Date' as const, description: 'Date type (recently added)' },
  ])(
    'should handle newly added Eligius type $type without code changes ($description)',
    ({ type: eligiusType }) => {
      const param: OperationParameter = {
        name: 'test',
        type: [eligiusType],
        required: false,
      };

      expect(param.type[0]).toBe(eligiusType);
    }
  );
});
