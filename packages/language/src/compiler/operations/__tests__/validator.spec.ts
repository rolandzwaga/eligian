/**
 * Operation Validator Tests
 *
 * Tests for operation validation (T213-T217)
 */

import { describe, expect, it } from 'vitest';
import { OPERATION_REGISTRY } from '../index.js';
import {
  type ParameterCountError,
  trackOutputs,
  type UnknownOperationError,
  validateControlFlowPairing,
  validateDependencies,
  validateOperation,
  validateOperationExists,
  validateParameterCount,
} from '../validator.js';

describe('Operation Validator', () => {
  describe('T213: Operation Existence Validation', () => {
    describe('validateOperationExists', () => {
      it('should return undefined for valid operation', () => {
        const error = validateOperationExists('addClass');
        expect(error).toBeUndefined();
      });

      it.each([
        { operation: 'addClass', description: 'CSS class manipulation' },
        { operation: 'removeClass', description: 'CSS class manipulation' },
        { operation: 'toggleClass', description: 'CSS class manipulation' },
        { operation: 'selectElement', description: 'DOM element selection' },
        { operation: 'animate', description: 'Animation control' },
        { operation: 'setStyle', description: 'Style manipulation' },
        { operation: 'when', description: 'Conditional operation' },
        { operation: 'forEach', description: 'Loop operation' },
      ])('should return undefined for registered operation $operation ($description)', ({
        operation,
      }) => {
        const error = validateOperationExists(operation);
        expect(error).toBeUndefined();
      });

      it('should return error for unknown operation', () => {
        const error = validateOperationExists('unknownOperation');

        expect(error).toBeDefined();
        expect(error?.code).toBe('UNKNOWN_OPERATION');
        expect(error?.operationName).toBe('unknownOperation');
        expect(error?.message).toContain('Unknown operation');
      });

      it('should provide typo suggestions for similar operations', () => {
        // Test typo: "adClass" instead of "addClass"
        const error = validateOperationExists('adClass') as UnknownOperationError;

        expect(error).toBeDefined();
        expect(error.suggestions).toBeDefined();
        expect(error.suggestions.length).toBeGreaterThan(0);
        expect(error.suggestions).toContain('addClass');
      });

      it('should suggest multiple similar operations', () => {
        // Test typo: "selectElemen" (missing 't')
        const error = validateOperationExists('selectElemen') as UnknownOperationError;

        expect(error).toBeDefined();
        expect(error.suggestions).toContain('selectElement');
        expect(error.suggestions.length).toBeLessThanOrEqual(3);
      });

      it('should provide hint with suggestions', () => {
        const error = validateOperationExists('adClass') as UnknownOperationError;

        expect(error.hint).toBeDefined();
        expect(error.hint).toContain('Did you mean');
        expect(error.hint).toContain('addClass');
      });

      it('should handle completely invalid operation names gracefully', () => {
        const error = validateOperationExists('xyzabc123') as UnknownOperationError;

        expect(error).toBeDefined();
        expect(error.suggestions).toBeDefined();
        // Should still provide some suggestions even if not very similar
        expect(error.hint).toBeDefined();
      });

      it('should be case-sensitive', () => {
        // "AddClass" is not the same as "addClass"
        const error = validateOperationExists('AddClass');

        expect(error).toBeDefined();
        expect(error?.code).toBe('UNKNOWN_OPERATION');
      });
    });

    describe('validateOperation', () => {
      it('should return success with signature for valid operation', () => {
        const result = validateOperation('addClass');

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.signature).toBeDefined();
          expect(result.signature.systemName).toBe('addClass');
          expect(result.signature.parameters).toBeDefined();
        }
      });

      it('should return errors for unknown operation', () => {
        const result = validateOperation('unknownOp');

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.errors).toHaveLength(1);
          expect(result.errors[0].code).toBe('UNKNOWN_OPERATION');
        }
      });

      it('should include operation signature for all valid operations', () => {
        const operations = ['addClass', 'selectElement', 'animate', 'when'];

        for (const op of operations) {
          const result = validateOperation(op);
          expect(result.success).toBe(true);
          if (result.success) {
            expect(result.signature.systemName).toBe(op);
          }
        }
      });
    });
  });

  describe('T214: Parameter Count Validation', () => {
    describe('validateParameterCount', () => {
      it('should return undefined for correct parameter count', () => {
        // addClass requires 1 parameter (className)
        const signature = OPERATION_REGISTRY.addClass;
        const error = validateParameterCount(signature, 1);
        expect(error).toBeUndefined();
      });

      it('should return error for too few parameters', () => {
        // addClass requires 1 parameter
        const signature = OPERATION_REGISTRY.addClass;
        const error = validateParameterCount(signature, 0) as ParameterCountError;

        expect(error).toBeDefined();
        expect(error.code).toBe('PARAMETER_COUNT');
        expect(error.expected.min).toBe(1);
        expect(error.actual).toBe(0);
        expect(error.message).toContain('expects');
        expect(error.message).toContain('but got 0');
      });

      it('should return error for too many parameters', () => {
        // addClass requires 1 parameter, no optional params
        const signature = OPERATION_REGISTRY.addClass;
        const error = validateParameterCount(signature, 2) as ParameterCountError;

        expect(error).toBeDefined();
        expect(error.code).toBe('PARAMETER_COUNT');
        expect(error.expected.max).toBe(1);
        expect(error.actual).toBe(2);
      });

      it('should handle operations with optional parameters', () => {
        // animate has 2 required + 1 optional = 3 total
        const signature = OPERATION_REGISTRY.animate;

        // Valid with min parameters
        expect(validateParameterCount(signature, 2)).toBeUndefined();

        // Valid with max parameters
        expect(validateParameterCount(signature, 3)).toBeUndefined();

        // Invalid: too few
        const tooFewError = validateParameterCount(signature, 1);
        expect(tooFewError).toBeDefined();
        expect(tooFewError?.expected.min).toBe(2);

        // Invalid: too many
        const tooManyError = validateParameterCount(signature, 4);
        expect(tooManyError).toBeDefined();
        expect(tooManyError?.expected.max).toBe(3);
      });

      it('should handle operations with no parameters', () => {
        // endForEach has no parameters
        const signature = OPERATION_REGISTRY.endForEach;

        // Valid with 0 parameters
        expect(validateParameterCount(signature, 0)).toBeUndefined();

        // Invalid: too many
        const error = validateParameterCount(signature, 1);
        expect(error).toBeDefined();
        expect(error?.expected.max).toBe(0);
      });

      it('should include helpful hint with parameter names', () => {
        const signature = OPERATION_REGISTRY.addClass;
        const error = validateParameterCount(signature, 0) as ParameterCountError;

        expect(error.hint).toBeDefined();
        expect(error.hint).toContain('addClass');
        expect(error.hint).toContain('className');
      });

      it('should mark optional parameters with brackets in hint', () => {
        const signature = OPERATION_REGISTRY.animate;
        const error = validateParameterCount(signature, 1) as ParameterCountError;

        expect(error.hint).toBeDefined();
        // Should show required params without brackets, optional with brackets
        expect(error.hint).toMatch(/animate\([^[\]]+,\s*[^[\]]+,\s*\[.*\]\)/);
      });
    });

    describe('validateOperation with parameter count', () => {
      it('should validate parameter count when provided', () => {
        const result = validateOperation('addClass', 1);
        expect(result.success).toBe(true);
      });

      it('should return error for wrong parameter count', () => {
        const result = validateOperation('addClass', 0);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.errors).toHaveLength(1);
          expect(result.errors[0].code).toBe('PARAMETER_COUNT');
        }
      });

      it('should work without parameter count (backward compatible)', () => {
        // Should still work without argumentCount parameter
        const result = validateOperation('addClass');
        expect(result.success).toBe(true);
      });
    });
  });

  // ============================================================================
  // T216: Dependency Validation Tests
  // ============================================================================

  describe('T216: Dependency Validation', () => {
    describe('validateDependencies', () => {
      it('should return no errors when all dependencies are available', () => {
        const signature = OPERATION_REGISTRY.addClass;
        const available = new Set(['selectedElement']);

        const errors = validateDependencies(signature, available);
        expect(errors).toHaveLength(0);
      });

      it('should return error when dependency is missing', () => {
        const signature = OPERATION_REGISTRY.addClass;
        const available = new Set<string>(); // Empty - no outputs yet

        const errors = validateDependencies(signature, available);
        expect(errors).toHaveLength(1);
        expect(errors[0].code).toBe('MISSING_DEPENDENCY');
        expect(errors[0].dependencyName).toBe('selectedElement');
        expect(errors[0].message).toContain('addClass');
        expect(errors[0].message).toContain('selectedElement');
      });

      it('should provide helpful hint about which operations provide the dependency', () => {
        const signature = OPERATION_REGISTRY.addClass;
        const available = new Set<string>();

        const errors = validateDependencies(signature, available);
        expect(errors[0].hint).toBeDefined();
        expect(errors[0].hint).toContain('selectElement');
      });

      it('should handle operations with no dependencies', () => {
        const signature = OPERATION_REGISTRY.selectElement;
        const available = new Set<string>();

        const errors = validateDependencies(signature, available);
        expect(errors).toHaveLength(0);
      });

      it('should handle operations with multiple dependencies', () => {
        const signature = OPERATION_REGISTRY.animate;
        const available = new Set<string>(); // No dependencies available

        const errors = validateDependencies(signature, available);
        // animate requires selectedElement
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].dependencyName).toBe('selectedElement');
      });
    });

    describe('trackOutputs', () => {
      it('should add outputs to available set', () => {
        const signature = OPERATION_REGISTRY.selectElement;
        const available = new Set<string>();

        trackOutputs(signature, available);

        expect(available.has('selectedElement')).toBe(true);
      });

      it('should handle operations with no outputs', () => {
        const signature = OPERATION_REGISTRY.addClass;
        const available = new Set<string>();

        trackOutputs(signature, available);

        // addClass has no outputs
        expect(available.size).toBe(0);
      });

      it('should accumulate outputs from multiple operations', () => {
        const available = new Set<string>();

        // selectElement provides selectedElement
        const sig1 = OPERATION_REGISTRY.selectElement;
        trackOutputs(sig1, available);
        expect(available.has('selectedElement')).toBe(true);

        // Check accumulation works
        expect(available.size).toBeGreaterThan(0);
      });
    });

    describe('dependency validation workflow', () => {
      it('should validate a sequence of operations correctly', () => {
        const available = new Set<string>();

        // Step 1: Call addClass without selectElement - should fail
        const addClassSig = OPERATION_REGISTRY.addClass;
        const errors1 = validateDependencies(addClassSig, available);
        expect(errors1.length).toBeGreaterThan(0);

        // Step 2: Call selectElement - should succeed (no dependencies)
        const selectSig = OPERATION_REGISTRY.selectElement;
        const errors2 = validateDependencies(selectSig, available);
        expect(errors2).toHaveLength(0);

        // Step 3: Track outputs from selectElement
        trackOutputs(selectSig, available);

        // Step 4: Now addClass should succeed
        const errors3 = validateDependencies(addClassSig, available);
        expect(errors3).toHaveLength(0);
      });
    });
  });

  // ============================================================================
  // T217: Control Flow Pairing Validation Tests
  // ============================================================================

  describe('T217: Control Flow Pairing Validation', () => {
    describe('validateControlFlowPairing', () => {
      it('should return no errors for properly paired when/endWhen', () => {
        const operations = ['when', 'addClass', 'endWhen'];
        const errors = validateControlFlowPairing(operations);
        expect(errors).toHaveLength(0);
      });

      it('should return no errors for properly paired forEach/endForEach', () => {
        const operations = ['forEach', 'addClass', 'endForEach'];
        const errors = validateControlFlowPairing(operations);
        expect(errors).toHaveLength(0);
      });

      it('should return no errors for nested control flow blocks', () => {
        const operations = ['when', 'forEach', 'addClass', 'endForEach', 'endWhen'];
        const errors = validateControlFlowPairing(operations);
        expect(errors).toHaveLength(0);
      });

      it('should return no errors for otherwise inside when block', () => {
        const operations = ['when', 'addClass', 'otherwise', 'removeClass', 'endWhen'];
        const errors = validateControlFlowPairing(operations);
        expect(errors).toHaveLength(0);
      });

      it('should return error for unclosed when block', () => {
        const operations = ['when', 'addClass'];
        const errors = validateControlFlowPairing(operations);

        expect(errors).toHaveLength(1);
        expect(errors[0].code).toBe('CONTROL_FLOW');
        expect(errors[0].blockType).toBe('when');
        expect(errors[0].issue).toBe('unclosed');
        expect(errors[0].message).toContain('Unclosed');
        expect(errors[0].message).toContain('when');
        expect(errors[0].hint).toContain('endWhen');
      });

      it('should return error for unclosed forEach block', () => {
        const operations = ['forEach', 'addClass'];
        const errors = validateControlFlowPairing(operations);

        expect(errors).toHaveLength(1);
        expect(errors[0].code).toBe('CONTROL_FLOW');
        expect(errors[0].blockType).toBe('forEach');
        expect(errors[0].issue).toBe('unclosed');
        expect(errors[0].message).toContain('Unclosed');
        expect(errors[0].message).toContain('forEach');
        expect(errors[0].hint).toContain('endForEach');
      });

      it('should return error for unmatched endWhen', () => {
        const operations = ['addClass', 'endWhen'];
        const errors = validateControlFlowPairing(operations);

        expect(errors).toHaveLength(1);
        expect(errors[0].code).toBe('CONTROL_FLOW');
        expect(errors[0].blockType).toBe('when');
        expect(errors[0].issue).toBe('unmatched');
        expect(errors[0].message).toContain('Unmatched');
        expect(errors[0].message).toContain('endWhen');
        expect(errors[0].hint).toContain('when');
      });

      it('should return error for unmatched endForEach', () => {
        const operations = ['addClass', 'endForEach'];
        const errors = validateControlFlowPairing(operations);

        expect(errors).toHaveLength(1);
        expect(errors[0].code).toBe('CONTROL_FLOW');
        expect(errors[0].blockType).toBe('forEach');
        expect(errors[0].issue).toBe('unmatched');
        expect(errors[0].message).toContain('Unmatched');
        expect(errors[0].message).toContain('endForEach');
        expect(errors[0].hint).toContain('forEach');
      });

      it('should return error for otherwise outside when block', () => {
        const operations = ['addClass', 'otherwise', 'removeClass'];
        const errors = validateControlFlowPairing(operations);

        expect(errors).toHaveLength(1);
        expect(errors[0].code).toBe('CONTROL_FLOW');
        expect(errors[0].blockType).toBe('when');
        expect(errors[0].issue).toBe('invalid_otherwise');
        expect(errors[0].message).toContain('otherwise');
        expect(errors[0].message).toContain('outside');
        expect(errors[0].hint).toContain('between');
      });

      it('should return multiple errors for multiple unclosed blocks', () => {
        const operations = ['when', 'forEach', 'addClass'];
        const errors = validateControlFlowPairing(operations);

        expect(errors).toHaveLength(2);
        expect(errors.some(e => e.blockType === 'when' && e.issue === 'unclosed')).toBe(true);
        expect(errors.some(e => e.blockType === 'forEach' && e.issue === 'unclosed')).toBe(true);
      });

      it('should return multiple errors for multiple unmatched blocks', () => {
        const operations = ['endWhen', 'addClass', 'endForEach'];
        const errors = validateControlFlowPairing(operations);

        expect(errors).toHaveLength(2);
        expect(errors.some(e => e.blockType === 'when' && e.issue === 'unmatched')).toBe(true);
        expect(errors.some(e => e.blockType === 'forEach' && e.issue === 'unmatched')).toBe(true);
      });

      it('should handle complex nested structures correctly', () => {
        const operations = [
          'when',
          'forEach',
          'addClass',
          'when',
          'removeClass',
          'endWhen',
          'endForEach',
          'otherwise',
          'when',
          'toggleClass',
          'endWhen',
          'endWhen',
        ];
        const errors = validateControlFlowPairing(operations);
        expect(errors).toHaveLength(0);
      });

      it('should allow any closing order (validates pairing not nesting)', () => {
        // Note: This validator checks PAIRING (every open has a close)
        // It does NOT enforce proper nesting order - that would require AST-level validation
        const operations = [
          'when',
          'forEach',
          'addClass',
          'endWhen', // Closes the 'when' (any order is allowed)
          'endForEach', // Closes the 'forEach'
        ];
        const errors = validateControlFlowPairing(operations);

        // No errors - all blocks are paired (even if not properly nested)
        expect(errors).toHaveLength(0);
      });

      it('should provide position information in error messages', () => {
        const operations = ['addClass', 'endWhen', 'removeClass'];
        const errors = validateControlFlowPairing(operations);

        expect(errors[0].message).toContain('position 1');
      });
    });
  });
});
