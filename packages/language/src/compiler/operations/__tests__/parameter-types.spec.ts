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

  it('should handle all standard Eligius parameter types', () => {
    const standardTypes: metadata.TParameterTypes[] = [
      'ParameterType:string',
      'ParameterType:number',
      'ParameterType:boolean',
      'ParameterType:object',
      'ParameterType:array',
      'ParameterType:className',
      'ParameterType:selector',
    ];

    for (const eligiusType of standardTypes) {
      const param: OperationParameter = {
        name: 'test',
        type: [eligiusType],
        required: false,
      };

      expect(param.type[0]).toBe(eligiusType);
    }
  });

  it('should handle newly added Eligius types without code changes', () => {
    // Eligius recently added these types
    const newTypes: metadata.TParameterTypes[] = ['ParameterType:function', 'ParameterType:Date'];

    for (const eligiusType of newTypes) {
      const param: OperationParameter = {
        name: 'test',
        type: [eligiusType],
        required: false,
      };

      expect(param.type[0]).toBe(eligiusType);
    }
  });
});
