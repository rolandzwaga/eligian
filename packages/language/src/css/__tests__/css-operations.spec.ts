/**
 * CLASS_NAME_OPERATIONS / SELECTOR_OPERATIONS must track the operation registry
 * (audit finding #40).
 */

import { describe, expect, it } from 'vitest';
import { OPERATION_REGISTRY } from '../../compiler/operations/registry.generated.js';
import { CLASS_NAME_OPERATIONS, SELECTOR_OPERATIONS } from '../css-operations.js';

describe('css-operations', () => {
  it('contains every operation with a className parameter', () => {
    expect([...CLASS_NAME_OPERATIONS].sort()).toEqual(
      ['addClass', 'animateWithClass', 'removeClass', 'toggleClass'].sort()
    );
  });

  it('contains every operation with a selector parameter', () => {
    expect([...SELECTOR_OPERATIONS].sort()).toEqual(['reparentElement', 'selectElement']);
  });

  it('only lists operations that exist in the registry', () => {
    for (const name of [...CLASS_NAME_OPERATIONS, ...SELECTOR_OPERATIONS]) {
      expect(OPERATION_REGISTRY[name], name).toBeDefined();
    }
  });

  it('does not list the non-existent legacy operations', () => {
    for (const name of ['hasClass', 'selectElements', 'querySelector', 'querySelectorAll']) {
      expect(CLASS_NAME_OPERATIONS.has(name)).toBe(false);
      expect(SELECTOR_OPERATIONS.has(name)).toBe(false);
    }
  });

  it('agrees with the registry parameter types', () => {
    for (const [name, operation] of Object.entries(OPERATION_REGISTRY)) {
      const types: unknown[] = operation.parameters.flatMap(p =>
        Array.isArray(p.type) ? (p.type as unknown[]) : []
      );
      expect(CLASS_NAME_OPERATIONS.has(name), name).toBe(
        types.some(t => t === 'ParameterType:className')
      );
      expect(SELECTOR_OPERATIONS.has(name), name).toBe(
        types.some(t => t === 'ParameterType:selector')
      );
    }
  });
});
