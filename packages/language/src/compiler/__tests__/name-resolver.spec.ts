/**
 * Tests for name-resolver.ts - Name resolution for unified action/operation calls
 */

import { describe, expect, it } from 'vitest';
import type { Program } from '../../generated/ast.js';
import {
  buildNameRegistry,
  findActionByName,
  resolveCallName,
  suggestSimilarActions,
} from '../name-resolver.js';

describe('name-resolver', () => {
  describe('buildNameRegistry', () => {
    it('should build registry with operations from OPERATION_REGISTRY', () => {
      const program: Program = {
        $type: 'Program',
        statements: [],
      };

      const registry = buildNameRegistry(program);

      // Should have operations
      expect(registry.operations.size).toBeGreaterThan(0);
      expect(registry.operations.has('selectElement')).toBe(true);
      expect(registry.operations.has('addClass')).toBe(true);
    });

    it('should build registry with actions from program', () => {
      const program: Program = {
        $type: 'Program',
        statements: [
          {
            $type: 'RegularActionDefinition',
            name: 'fadeIn',
            params: [],
            statements: [],
          },
          {
            $type: 'EndableActionDefinition',
            name: 'slideIn',
            params: [],
            startStatements: [],
            endStatements: [],
          },
        ],
      };

      const registry = buildNameRegistry(program);

      expect(registry.actions.size).toBe(2);
      expect(registry.actions.has('fadeIn')).toBe(true);
      expect(registry.actions.has('slideIn')).toBe(true);
    });
  });

  describe('findActionByName', () => {
    it('should find regular action by name', () => {
      const program: Program = {
        $type: 'Program',
        statements: [
          {
            $type: 'RegularActionDefinition',
            name: 'fadeIn',
            params: [],
            statements: [],
          },
        ],
      };

      const action = findActionByName('fadeIn', program);
      expect(action).toBeDefined();
      expect(action?.name).toBe('fadeIn');
    });

    it('should find endable action by name', () => {
      const program: Program = {
        $type: 'Program',
        statements: [
          {
            $type: 'EndableActionDefinition',
            name: 'slideIn',
            params: [],
            startStatements: [],
            endStatements: [],
          },
        ],
      };

      const action = findActionByName('slideIn', program);
      expect(action).toBeDefined();
      expect(action?.name).toBe('slideIn');
    });

    it('should return undefined for non-existent action', () => {
      const program: Program = {
        $type: 'Program',
        statements: [],
      };

      const action = findActionByName('nonExistent', program);
      expect(action).toBeUndefined();
    });
  });

  describe('resolveCallName', () => {
    it('should resolve to action when action exists', () => {
      const program: Program = {
        $type: 'Program',
        statements: [
          {
            $type: 'RegularActionDefinition',
            name: 'fadeIn',
            params: [],
            statements: [],
          },
        ],
      };

      const registry = buildNameRegistry(program);
      const result = resolveCallName('fadeIn', registry);

      expect(result.resolved).toBe(true);
      if (result.resolved) {
        expect(result.type).toBe('action');
      }
    });

    it('should resolve to operation when operation exists', () => {
      const program: Program = {
        $type: 'Program',
        statements: [],
      };

      const registry = buildNameRegistry(program);
      const result = resolveCallName('selectElement', registry);

      expect(result.resolved).toBe(true);
      if (result.resolved) {
        expect(result.type).toBe('operation');
      }
    });

    it('should prioritize actions over operations', () => {
      // Create an action with the same name as an operation
      const program: Program = {
        $type: 'Program',
        statements: [
          {
            $type: 'RegularActionDefinition',
            name: 'selectElement', // Same name as built-in operation
            params: [],
            statements: [],
          },
        ],
      };

      const registry = buildNameRegistry(program);
      const result = resolveCallName('selectElement', registry);

      expect(result.resolved).toBe(true);
      if (result.resolved) {
        expect(result.type).toBe('action'); // Should resolve to action, not operation
      }
    });
  });

  describe('suggestSimilarActions', () => {
    it('should suggest actions with similar names', () => {
      const available = ['fadeIn', 'fadeOut', 'slideIn', 'slideOut'];
      const suggestions = suggestSimilarActions('fadIn', available); // typo: missing 'e'

      expect(suggestions).toContain('fadeIn');
    });

    it('should return suggestions sorted by distance', () => {
      const available = ['fadeIn', 'slideIn', 'f'];
      const suggestions = suggestSimilarActions('fadIn', available);

      // 'fadeIn' should be first (distance 1), 'f' next (distance 4), 'slideIn' last (distance 5)
      expect(suggestions[0]).toBe('fadeIn');
    });

    it('should limit suggestions to maxSuggestions', () => {
      const available = ['fadeIn', 'fadeOut', 'slideIn', 'slideOut', 'rotateIn'];
      const suggestions = suggestSimilarActions('fadIn', available, 2); // maxSuggestions = 2

      expect(suggestions.length).toBeLessThanOrEqual(2);
    });

    it('should filter suggestions by maxDistance', () => {
      const available = ['fadeIn', 'xyz', 'abc'];
      const suggestions = suggestSimilarActions('fadIn', available, 3, 2); // maxDistance = 2

      // 'xyz' and 'abc' should be filtered out (distance > 2)
      expect(suggestions).toContain('fadeIn');
      expect(suggestions).not.toContain('xyz');
      expect(suggestions).not.toContain('abc');
    });

    it('should handle empty available actions', () => {
      const suggestions = suggestSimilarActions('fadeIn', []);
      expect(suggestions).toEqual([]);
    });

    it('should be case-insensitive', () => {
      const available = ['FadeIn', 'fadeOut'];
      const suggestions = suggestSimilarActions('fadein', available);

      expect(suggestions).toContain('FadeIn');
    });
  });
});
