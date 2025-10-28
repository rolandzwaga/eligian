/**
 * Error Type Checking Integration Tests (T021)
 *
 * These tests verify that type guards work correctly in real-world usage scenarios,
 * demonstrating how they narrow types and enable exhaustive pattern matching in
 * actual error handling code.
 *
 * Test-First Development: This file is written BEFORE type-guards.ts exists.
 * Initial run should FAIL with import errors.
 */

import {
  createFileNotFoundError,
  createPermissionError,
  createReadError,
  createSecurityError,
} from '@eligian/shared-utils';
import { describe, expect, test } from 'vitest';
import type { AllErrors } from '../errors/index.js';
import {
  createCssImportError,
  createCssParseError,
  createEmitError,
  createHtmlImportError,
  createMediaImportError,
  createOptimizationError,
  createParseError,
  createTransformError,
  createTypeError,
  createValidationError,
  isAssetError,
  isCompilerError,
  isCssImportError,
  isCssParseError,
  isEligianError,
  isEmitError,
  isFileNotFoundError,
  isHtmlImportError,
  isIOError,
  isMediaImportError,
  isOptimizationError,
  isParseError,
  isPermissionError,
  isReadError,
  isSecurityError,
  isTransformError,
  isTypeError,
  isValidationError,
} from '../errors/index.js';

/**
 * Simulate error handling in a compiler pipeline
 *
 * This demonstrates real-world usage where we receive an unknown error
 * and need to handle it based on its type.
 */
function handleCompilerError(error: unknown): string {
  if (!isEligianError(error)) {
    return 'Unknown error type';
  }

  // Now TypeScript knows error is AllErrors
  if (isParseError(error)) {
    return `Syntax error at ${error.location.line}:${error.location.column}: ${error.message}`;
  }

  if (isValidationError(error)) {
    return `Validation failed (${error.kind}): ${error.message}`;
  }

  if (isTypeError(error)) {
    return `Type mismatch: expected ${error.expected}, got ${error.actual}`;
  }

  if (isTransformError(error)) {
    return `Transform failed (${error.kind}): ${error.message}`;
  }

  if (isOptimizationError(error)) {
    return `Optimization pass "${error.pass}" failed: ${error.message}`;
  }

  if (isEmitError(error)) {
    return `Failed to emit JSON: ${error.message}`;
  }

  if (isHtmlImportError(error)) {
    return `HTML import failed: ${error.filePath} - ${error.message}`;
  }

  if (isCssImportError(error)) {
    return `CSS import failed: ${error.filePath} - ${error.message}`;
  }

  if (isCssParseError(error)) {
    return `CSS syntax error at ${error.line}:${error.column}: ${error.message}`;
  }

  if (isMediaImportError(error)) {
    return `Media import failed: ${error.filePath} - ${error.message}`;
  }

  if (isFileNotFoundError(error)) {
    return `File not found: ${error.path}`;
  }

  if (isPermissionError(error)) {
    return `Permission denied: ${error.path}`;
  }

  if (isReadError(error)) {
    return `Read failed: ${error.path}`;
  }

  if (isSecurityError(error)) {
    return `Security violation: ${error.path}`;
  }

  // This line should never be reached if exhaustiveness checking works
  const _exhaustive: never = error;
  return `Unhandled error type: ${(_exhaustive as AllErrors)._tag}`;
}

/**
 * Handle errors by category (Compiler/Asset/IO)
 *
 * This demonstrates hierarchical error handling using category-level type guards.
 */
function handleErrorByCategory(error: AllErrors): string {
  if (isCompilerError(error)) {
    return `[COMPILER] ${error.message}`;
  }

  if (isAssetError(error)) {
    return `[ASSET] ${error.message}`;
  }

  if (isIOError(error)) {
    return `[I/O] ${error.message}`;
  }

  // Exhaustiveness check
  const _exhaustive: never = error;
  return `Unhandled error category: ${(_exhaustive as AllErrors)._tag}`;
}

/**
 * Extract error location for VS Code diagnostics
 *
 * This demonstrates accessing type-specific properties after narrowing.
 */
function extractLocation(error: AllErrors): { file?: string; line: number; column: number } | null {
  // CompilerError, AssetError (except CssParseError) have SourceLocation
  if (
    isParseError(error) ||
    isValidationError(error) ||
    isTypeError(error) ||
    isTransformError(error)
  ) {
    return {
      file: error.location.file,
      line: error.location.line,
      column: error.location.column,
    };
  }

  if (isHtmlImportError(error) || isCssImportError(error) || isMediaImportError(error)) {
    return {
      file: error.location.file,
      line: error.location.line,
      column: error.location.column,
    };
  }

  // CssParseError has line/column directly (no SourceLocation)
  if (isCssParseError(error)) {
    return {
      file: error.filePath,
      line: error.line,
      column: error.column,
    };
  }

  // IOError doesn't have line/column
  if (isIOError(error)) {
    return null;
  }

  // OptimizationError and EmitError don't have location
  return null;
}

describe('Error Type Checking - Real World Usage', () => {
  describe('handleCompilerError', () => {
    test('handles ParseError with location', () => {
      const error = createParseError({
        message: 'Expected }',
        location: { line: 10, column: 5 },
      });
      expect(handleCompilerError(error)).toBe('Syntax error at 10:5: Expected }');
    });

    test('handles ValidationError with kind', () => {
      const error = createValidationError({
        kind: 'UndefinedReference',
        message: 'Action not defined',
        location: { line: 15, column: 10 },
      });
      expect(handleCompilerError(error)).toBe(
        'Validation failed (UndefinedReference): Action not defined'
      );
    });

    test('handles TypeError with expected/actual', () => {
      const error = createTypeError({
        message: 'Type mismatch',
        location: { line: 20, column: 15 },
        expected: 'string',
        actual: 'number',
      });
      expect(handleCompilerError(error)).toBe('Type mismatch: expected string, got number');
    });

    test('handles TransformError with kind', () => {
      const error = createTransformError({
        kind: 'InvalidTimeline',
        message: 'Timeline structure invalid',
        location: { line: 25, column: 1 },
      });
      expect(handleCompilerError(error)).toBe(
        'Transform failed (InvalidTimeline): Timeline structure invalid'
      );
    });

    test('handles OptimizationError with pass', () => {
      const error = createOptimizationError({
        message: 'Dead code elimination failed',
        pass: 'dead-code-elimination',
      });
      expect(handleCompilerError(error)).toBe(
        'Optimization pass "dead-code-elimination" failed: Dead code elimination failed'
      );
    });

    test('handles EmitError', () => {
      const error = createEmitError({
        message: 'Invalid JSON structure',
      });
      expect(handleCompilerError(error)).toBe('Failed to emit JSON: Invalid JSON structure');
    });

    test('handles HtmlImportError', () => {
      const error = createHtmlImportError({
        filePath: './layout.html',
        absolutePath: '/abs/layout.html',
        message: 'Unclosed div tag',
        location: { line: 5, column: 1 },
      });
      expect(handleCompilerError(error)).toBe(
        'HTML import failed: ./layout.html - Unclosed div tag'
      );
    });

    test('handles CssImportError', () => {
      const error = createCssImportError({
        filePath: './styles.css',
        absolutePath: '/abs/styles.css',
        message: 'File not found',
        location: { line: 6, column: 1 },
      });
      expect(handleCompilerError(error)).toBe('CSS import failed: ./styles.css - File not found');
    });

    test('handles CssParseError', () => {
      const error = createCssParseError({
        filePath: '/abs/styles.css',
        message: 'Unclosed block',
        line: 42,
        column: 10,
      });
      expect(handleCompilerError(error)).toBe('CSS syntax error at 42:10: Unclosed block');
    });

    test('handles MediaImportError', () => {
      const error = createMediaImportError({
        filePath: './video.mp4',
        absolutePath: '/abs/video.mp4',
        message: 'File not found',
        location: { line: 7, column: 1 },
      });
      expect(handleCompilerError(error)).toBe('Media import failed: ./video.mp4 - File not found');
    });

    test('handles FileNotFoundError', () => {
      const error = createFileNotFoundError('./missing.css');
      expect(handleCompilerError(error)).toBe('File not found: ./missing.css');
    });

    test('handles PermissionError', () => {
      const error = createPermissionError('./protected.css');
      expect(handleCompilerError(error)).toBe('Permission denied: ./protected.css');
    });

    test('handles ReadError', () => {
      const error = createReadError('./corrupted.css');
      expect(handleCompilerError(error)).toBe('Read failed: ./corrupted.css');
    });

    test('handles SecurityError', () => {
      const error = createSecurityError('../evil.css', '/project');
      expect(handleCompilerError(error)).toBe('Security violation: ../evil.css');
    });

    test('rejects non-Eligian errors', () => {
      expect(handleCompilerError(new Error('Standard JS error'))).toBe('Unknown error type');
      expect(handleCompilerError({ _tag: 'NotAnError' })).toBe('Unknown error type');
      expect(handleCompilerError(null)).toBe('Unknown error type');
      expect(handleCompilerError(undefined)).toBe('Unknown error type');
    });
  });

  describe('handleErrorByCategory', () => {
    test('categorizes CompilerErrors', () => {
      const errors = [
        createParseError({ message: 'Parse', location: { line: 1, column: 1 } }),
        createValidationError({
          kind: 'UndefinedReference',
          message: 'Validation',
          location: { line: 2, column: 1 },
        }),
        createTypeError({
          message: 'Type',
          location: { line: 3, column: 1 },
          expected: 'string',
          actual: 'number',
        }),
        createTransformError({
          kind: 'UnknownNode',
          message: 'Transform',
          location: { line: 4, column: 1 },
        }),
        createOptimizationError({ message: 'Optimization', pass: 'test' }),
        createEmitError({ message: 'Emit' }),
      ];

      errors.forEach(error => {
        expect(handleErrorByCategory(error)).toMatch(/^\[COMPILER\]/);
      });
    });

    test('categorizes AssetErrors', () => {
      const errors = [
        createHtmlImportError({
          filePath: './layout.html',
          absolutePath: '/abs/layout.html',
          message: 'HTML',
          location: { line: 1, column: 1 },
        }),
        createCssImportError({
          filePath: './styles.css',
          absolutePath: '/abs/styles.css',
          message: 'CSS Import',
          location: { line: 2, column: 1 },
        }),
        createCssParseError({
          filePath: '/abs/styles.css',
          message: 'CSS Parse',
          line: 10,
          column: 5,
        }),
        createMediaImportError({
          filePath: './video.mp4',
          absolutePath: '/abs/video.mp4',
          message: 'Media',
          location: { line: 3, column: 1 },
        }),
      ];

      errors.forEach(error => {
        expect(handleErrorByCategory(error)).toMatch(/^\[ASSET\]/);
      });
    });

    test('categorizes IOErrors', () => {
      const errors = [
        createFileNotFoundError('./missing.css'),
        createPermissionError('./protected.css'),
        createReadError('./corrupted.css'),
        createSecurityError('../evil.css', '/project'),
      ];

      errors.forEach(error => {
        expect(handleErrorByCategory(error)).toMatch(/^\[I\/O\]/);
      });
    });
  });

  describe('extractLocation', () => {
    test('extracts location from ParseError', () => {
      const error = createParseError({
        message: 'Expected }',
        location: { file: 'test.eligian', line: 10, column: 5 },
      });
      expect(extractLocation(error)).toEqual({
        file: 'test.eligian',
        line: 10,
        column: 5,
      });
    });

    test('extracts location from ValidationError', () => {
      const error = createValidationError({
        kind: 'UndefinedReference',
        message: 'Action not defined',
        location: { line: 15, column: 10 },
      });
      expect(extractLocation(error)).toEqual({
        file: undefined,
        line: 15,
        column: 10,
      });
    });

    test('extracts location from CssParseError (different structure)', () => {
      const error = createCssParseError({
        filePath: '/abs/styles.css',
        message: 'Unclosed block',
        line: 42,
        column: 10,
      });
      expect(extractLocation(error)).toEqual({
        file: '/abs/styles.css',
        line: 42,
        column: 10,
      });
    });

    test('returns null for IOError (no location)', () => {
      const error = createFileNotFoundError('./missing.css');
      expect(extractLocation(error)).toBeNull();
    });

    test('returns null for OptimizationError (no location)', () => {
      const error = createOptimizationError({
        message: 'Optimization failed',
        pass: 'dead-code-elimination',
      });
      expect(extractLocation(error)).toBeNull();
    });

    test('returns null for EmitError (no location)', () => {
      const error = createEmitError({
        message: 'Failed to emit JSON',
      });
      expect(extractLocation(error)).toBeNull();
    });
  });

  describe('Type narrowing in conditional chains', () => {
    test('narrows type progressively', () => {
      const error: unknown = createTypeError({
        message: 'Type mismatch',
        location: { line: 20, column: 15 },
        expected: 'string',
        actual: 'number',
      });

      // First narrow to EligianError
      if (isEligianError(error)) {
        expect(error._tag).toBeTruthy();

        // Then narrow to CompilerError
        if (isCompilerError(error)) {
          expect(error.message).toBeTruthy();

          // Finally narrow to TypeError
          if (isTypeError(error)) {
            expect(error.expected).toBe('string');
            expect(error.actual).toBe('number');
          }
        }
      }
    });

    test('narrows type for AssetError', () => {
      const error: unknown = createCssParseError({
        filePath: '/abs/styles.css',
        message: 'Unclosed block',
        line: 42,
        column: 10,
      });

      if (isEligianError(error)) {
        if (isAssetError(error)) {
          if (isCssParseError(error)) {
            expect(error.line).toBe(42);
            expect(error.column).toBe(10);
          }
        }
      }
    });

    test('narrows type for IOError', () => {
      const error: unknown = createSecurityError('../evil.css', '/project');

      if (isEligianError(error)) {
        if (isIOError(error)) {
          if (isSecurityError(error)) {
            expect(error.path).toBe('../evil.css');
            expect(error.projectRoot).toBe('/project');
          }
        }
      }
    });
  });
});
