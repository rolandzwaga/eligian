/**
 * Operation Validator Tests
 *
 * Tests for operation validation (T213-T217)
 */

import { describe, it, expect } from 'vitest';
import {
  validateOperationExists,
  validateParameterCount,
  validateOperation,
  type UnknownOperationError,
  type ParameterCountError,
} from '../validator.ts';
import { OPERATION_REGISTRY } from '../index.ts';

describe('Operation Validator', () => {
  describe('T213: Operation Existence Validation', () => {
    describe('validateOperationExists', () => {
      it('should return undefined for valid operation', () => {
        const error = validateOperationExists('addClass');
        expect(error).toBeUndefined();
      });

      it('should return undefined for all registered operations', () => {
        const validOperations = [
          'addClass',
          'removeClass',
          'toggleClass',
          'selectElement',
          'animate',
          'setStyle',
          'when',
          'forEach',
        ];

        for (const op of validOperations) {
          const error = validateOperationExists(op);
          expect(error).toBeUndefined();
        }
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
        const signature = OPERATION_REGISTRY['addClass'];
        const error = validateParameterCount(signature, 1);
        expect(error).toBeUndefined();
      });

      it('should return error for too few parameters', () => {
        // addClass requires 1 parameter
        const signature = OPERATION_REGISTRY['addClass'];
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
        const signature = OPERATION_REGISTRY['addClass'];
        const error = validateParameterCount(signature, 2) as ParameterCountError;

        expect(error).toBeDefined();
        expect(error.code).toBe('PARAMETER_COUNT');
        expect(error.expected.max).toBe(1);
        expect(error.actual).toBe(2);
      });

      it('should handle operations with optional parameters', () => {
        // animate has 2 required + 1 optional = 3 total
        const signature = OPERATION_REGISTRY['animate'];

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

      it('should handle operations with all optional parameters', () => {
        // endAction has 1 optional parameter
        const signature = OPERATION_REGISTRY['endAction'];

        // Valid with 0 parameters (all optional)
        expect(validateParameterCount(signature, 0)).toBeUndefined();

        // Valid with 1 parameter (the optional one)
        expect(validateParameterCount(signature, 1)).toBeUndefined();

        // Invalid: too many
        const error = validateParameterCount(signature, 2);
        expect(error).toBeDefined();
      });

      it('should include helpful hint with parameter names', () => {
        const signature = OPERATION_REGISTRY['addClass'];
        const error = validateParameterCount(signature, 0) as ParameterCountError;

        expect(error.hint).toBeDefined();
        expect(error.hint).toContain('addClass');
        expect(error.hint).toContain('className');
      });

      it('should mark optional parameters with brackets in hint', () => {
        const signature = OPERATION_REGISTRY['animate'];
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
});
