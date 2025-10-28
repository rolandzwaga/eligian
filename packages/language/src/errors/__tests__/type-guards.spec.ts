/**
 * Type Guard Tests - Runtime Type Checking for Errors (T019)
 *
 * These tests verify that type guard functions correctly identify error types
 * at runtime and enable TypeScript type narrowing.
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
} from '../index.js';

describe('Compiler Type Guards', () => {
  describe('isParseError', () => {
    test('returns true for ParseError', () => {
      const error = createParseError({
        message: 'Expected }',
        location: { line: 1, column: 10 },
        expected: '}',
        actual: 'EOF',
      });
      expect(isParseError(error)).toBe(true);
    });

    test('returns false for non-ParseError', () => {
      const error = createValidationError({
        kind: 'UndefinedReference',
        message: 'Undefined action',
        location: { line: 2, column: 5 },
      });
      expect(isParseError(error)).toBe(false);
    });

    test('returns false for null', () => {
      expect(isParseError(null)).toBe(false);
    });

    test('returns false for undefined', () => {
      expect(isParseError(undefined)).toBe(false);
    });

    test('returns false for plain object', () => {
      expect(isParseError({ _tag: 'NotAnError' })).toBe(false);
    });

    test('narrows type correctly', () => {
      const error: unknown = createParseError({
        message: 'Expected }',
        location: { line: 1, column: 10 },
        expected: '}',
        actual: 'EOF',
      });

      if (isParseError(error)) {
        // TypeScript should allow accessing ParseError properties
        expect(error._tag).toBe('ParseError');
        expect(error.expected).toBe('}');
        expect(error.actual).toBe('EOF');
      } else {
        throw new Error('Type guard failed');
      }
    });
  });

  describe('isValidationError', () => {
    test('returns true for ValidationError', () => {
      const error = createValidationError({
        kind: 'UndefinedReference',
        message: 'Undefined action',
        location: { line: 2, column: 5 },
      });
      expect(isValidationError(error)).toBe(true);
    });

    test('returns false for non-ValidationError', () => {
      const error = createParseError({
        message: 'Expected }',
        location: { line: 1, column: 10 },
      });
      expect(isValidationError(error)).toBe(false);
    });

    test('narrows type correctly', () => {
      const error: unknown = createValidationError({
        kind: 'DuplicateDefinition',
        message: 'Duplicate action',
        location: { line: 3, column: 1 },
      });

      if (isValidationError(error)) {
        expect(error._tag).toBe('ValidationError');
        expect(error.kind).toBe('DuplicateDefinition');
      } else {
        throw new Error('Type guard failed');
      }
    });
  });

  describe('isTypeError', () => {
    test('returns true for TypeError', () => {
      const error = createTypeError({
        message: 'Type mismatch',
        location: { line: 4, column: 10 },
        expected: 'string',
        actual: 'number',
      });
      expect(isTypeError(error)).toBe(true);
    });

    test('returns false for non-TypeError', () => {
      const error = createParseError({
        message: 'Expected }',
        location: { line: 1, column: 10 },
      });
      expect(isTypeError(error)).toBe(false);
    });

    test('narrows type correctly', () => {
      const error: unknown = createTypeError({
        message: 'Type mismatch',
        location: { line: 4, column: 10 },
        expected: 'string',
        actual: 'number',
      });

      if (isTypeError(error)) {
        expect(error._tag).toBe('TypeError');
        expect(error.expected).toBe('string');
        expect(error.actual).toBe('number');
      } else {
        throw new Error('Type guard failed');
      }
    });
  });

  describe('isTransformError', () => {
    test('returns true for TransformError', () => {
      const error = createTransformError({
        kind: 'UnknownNode',
        message: 'Unknown node type',
        location: { line: 5, column: 1 },
        astNode: 'FutureConstruct',
      });
      expect(isTransformError(error)).toBe(true);
    });

    test('returns false for non-TransformError', () => {
      const error = createParseError({
        message: 'Expected }',
        location: { line: 1, column: 10 },
      });
      expect(isTransformError(error)).toBe(false);
    });

    test('narrows type correctly', () => {
      const error: unknown = createTransformError({
        kind: 'InvalidTimeline',
        message: 'Timeline invalid',
        location: { line: 6, column: 1 },
      });

      if (isTransformError(error)) {
        expect(error._tag).toBe('TransformError');
        expect(error.kind).toBe('InvalidTimeline');
      } else {
        throw new Error('Type guard failed');
      }
    });
  });

  describe('isOptimizationError', () => {
    test('returns true for OptimizationError', () => {
      const error = createOptimizationError({
        message: 'Optimization failed',
        pass: 'dead-code-elimination',
      });
      expect(isOptimizationError(error)).toBe(true);
    });

    test('returns false for non-OptimizationError', () => {
      const error = createParseError({
        message: 'Expected }',
        location: { line: 1, column: 10 },
      });
      expect(isOptimizationError(error)).toBe(false);
    });

    test('narrows type correctly', () => {
      const error: unknown = createOptimizationError({
        message: 'Optimization failed',
        pass: 'constant-folding',
      });

      if (isOptimizationError(error)) {
        expect(error._tag).toBe('OptimizationError');
        expect(error.pass).toBe('constant-folding');
      } else {
        throw new Error('Type guard failed');
      }
    });
  });

  describe('isEmitError', () => {
    test('returns true for EmitError', () => {
      const error = createEmitError({
        message: 'Failed to emit JSON',
        ir: '{ invalid }',
      });
      expect(isEmitError(error)).toBe(true);
    });

    test('returns false for non-EmitError', () => {
      const error = createParseError({
        message: 'Expected }',
        location: { line: 1, column: 10 },
      });
      expect(isEmitError(error)).toBe(false);
    });

    test('narrows type correctly', () => {
      const error: unknown = createEmitError({
        message: 'Failed to emit JSON',
      });

      if (isEmitError(error)) {
        expect(error._tag).toBe('EmitError');
        expect(error.message).toBe('Failed to emit JSON');
      } else {
        throw new Error('Type guard failed');
      }
    });
  });

  describe('isCompilerError', () => {
    test('returns true for ParseError', () => {
      const error = createParseError({
        message: 'Expected }',
        location: { line: 1, column: 10 },
      });
      expect(isCompilerError(error)).toBe(true);
    });

    test('returns true for ValidationError', () => {
      const error = createValidationError({
        kind: 'UndefinedReference',
        message: 'Undefined action',
        location: { line: 2, column: 5 },
      });
      expect(isCompilerError(error)).toBe(true);
    });

    test('returns true for TypeError', () => {
      const error = createTypeError({
        message: 'Type mismatch',
        location: { line: 4, column: 10 },
        expected: 'string',
        actual: 'number',
      });
      expect(isCompilerError(error)).toBe(true);
    });

    test('returns true for TransformError', () => {
      const error = createTransformError({
        kind: 'UnknownNode',
        message: 'Unknown node type',
        location: { line: 5, column: 1 },
      });
      expect(isCompilerError(error)).toBe(true);
    });

    test('returns true for OptimizationError', () => {
      const error = createOptimizationError({
        message: 'Optimization failed',
        pass: 'dead-code-elimination',
      });
      expect(isCompilerError(error)).toBe(true);
    });

    test('returns true for EmitError', () => {
      const error = createEmitError({
        message: 'Failed to emit JSON',
      });
      expect(isCompilerError(error)).toBe(true);
    });

    test('returns false for non-CompilerError', () => {
      const error = createFileNotFoundError('./missing.css');
      expect(isCompilerError(error)).toBe(false);
    });
  });
});

describe('Asset Type Guards', () => {
  describe('isHtmlImportError', () => {
    test('returns true for HtmlImportError', () => {
      const error = createHtmlImportError({
        filePath: './layout.html',
        absolutePath: '/abs/layout.html',
        message: 'HTML syntax error',
        location: { line: 1, column: 1 },
        line: 5,
        column: 10,
      });
      expect(isHtmlImportError(error)).toBe(true);
    });

    test('returns false for non-HtmlImportError', () => {
      const error = createCssImportError({
        filePath: './styles.css',
        absolutePath: '/abs/styles.css',
        message: 'CSS not found',
        location: { line: 2, column: 1 },
      });
      expect(isHtmlImportError(error)).toBe(false);
    });

    test('narrows type correctly', () => {
      const error: unknown = createHtmlImportError({
        filePath: './layout.html',
        absolutePath: '/abs/layout.html',
        message: 'HTML syntax error',
        location: { line: 1, column: 1 },
      });

      if (isHtmlImportError(error)) {
        expect(error._tag).toBe('HtmlImportError');
        expect(error.filePath).toBe('./layout.html');
      } else {
        throw new Error('Type guard failed');
      }
    });
  });

  describe('isCssImportError', () => {
    test('returns true for CssImportError', () => {
      const error = createCssImportError({
        filePath: './styles.css',
        absolutePath: '/abs/styles.css',
        message: 'CSS not found',
        location: { line: 2, column: 1 },
      });
      expect(isCssImportError(error)).toBe(true);
    });

    test('returns false for non-CssImportError', () => {
      const error = createCssParseError({
        filePath: '/abs/styles.css',
        message: 'CSS syntax error',
        line: 10,
        column: 5,
      });
      expect(isCssImportError(error)).toBe(false);
    });

    test('narrows type correctly', () => {
      const error: unknown = createCssImportError({
        filePath: './styles.css',
        absolutePath: '/abs/styles.css',
        message: 'CSS not found',
        location: { line: 2, column: 1 },
      });

      if (isCssImportError(error)) {
        expect(error._tag).toBe('CssImportError');
        expect(error.filePath).toBe('./styles.css');
      } else {
        throw new Error('Type guard failed');
      }
    });
  });

  describe('isCssParseError', () => {
    test('returns true for CssParseError', () => {
      const error = createCssParseError({
        filePath: '/abs/styles.css',
        message: 'CSS syntax error',
        line: 10,
        column: 5,
        source: '.button { color',
      });
      expect(isCssParseError(error)).toBe(true);
    });

    test('returns false for non-CssParseError', () => {
      const error = createCssImportError({
        filePath: './styles.css',
        absolutePath: '/abs/styles.css',
        message: 'CSS not found',
        location: { line: 2, column: 1 },
      });
      expect(isCssParseError(error)).toBe(false);
    });

    test('narrows type correctly', () => {
      const error: unknown = createCssParseError({
        filePath: '/abs/styles.css',
        message: 'CSS syntax error',
        line: 10,
        column: 5,
      });

      if (isCssParseError(error)) {
        expect(error._tag).toBe('CssParseError');
        expect(error.line).toBe(10);
        expect(error.column).toBe(5);
      } else {
        throw new Error('Type guard failed');
      }
    });
  });

  describe('isMediaImportError', () => {
    test('returns true for MediaImportError', () => {
      const error = createMediaImportError({
        filePath: './video.mp4',
        absolutePath: '/abs/video.mp4',
        message: 'Media file not found',
        location: { line: 3, column: 1 },
      });
      expect(isMediaImportError(error)).toBe(true);
    });

    test('returns false for non-MediaImportError', () => {
      const error = createHtmlImportError({
        filePath: './layout.html',
        absolutePath: '/abs/layout.html',
        message: 'HTML syntax error',
        location: { line: 1, column: 1 },
      });
      expect(isMediaImportError(error)).toBe(false);
    });

    test('narrows type correctly', () => {
      const error: unknown = createMediaImportError({
        filePath: './video.mp4',
        absolutePath: '/abs/video.mp4',
        message: 'Media file not found',
        location: { line: 3, column: 1 },
      });

      if (isMediaImportError(error)) {
        expect(error._tag).toBe('MediaImportError');
        expect(error.filePath).toBe('./video.mp4');
      } else {
        throw new Error('Type guard failed');
      }
    });
  });

  describe('isAssetError', () => {
    test('returns true for HtmlImportError', () => {
      const error = createHtmlImportError({
        filePath: './layout.html',
        absolutePath: '/abs/layout.html',
        message: 'HTML syntax error',
        location: { line: 1, column: 1 },
      });
      expect(isAssetError(error)).toBe(true);
    });

    test('returns true for CssImportError', () => {
      const error = createCssImportError({
        filePath: './styles.css',
        absolutePath: '/abs/styles.css',
        message: 'CSS not found',
        location: { line: 2, column: 1 },
      });
      expect(isAssetError(error)).toBe(true);
    });

    test('returns true for CssParseError', () => {
      const error = createCssParseError({
        filePath: '/abs/styles.css',
        message: 'CSS syntax error',
        line: 10,
        column: 5,
      });
      expect(isAssetError(error)).toBe(true);
    });

    test('returns true for MediaImportError', () => {
      const error = createMediaImportError({
        filePath: './video.mp4',
        absolutePath: '/abs/video.mp4',
        message: 'Media file not found',
        location: { line: 3, column: 1 },
      });
      expect(isAssetError(error)).toBe(true);
    });

    test('returns false for non-AssetError', () => {
      const error = createParseError({
        message: 'Expected }',
        location: { line: 1, column: 10 },
      });
      expect(isAssetError(error)).toBe(false);
    });
  });
});

describe('I/O Type Guards', () => {
  describe('isFileNotFoundError', () => {
    test('returns true for FileNotFoundError', () => {
      const error = createFileNotFoundError('./missing.css');
      expect(isFileNotFoundError(error)).toBe(true);
    });

    test('returns false for non-FileNotFoundError', () => {
      const error = createPermissionError('./protected.css');
      expect(isFileNotFoundError(error)).toBe(false);
    });

    test('narrows type correctly', () => {
      const error: unknown = createFileNotFoundError('./missing.css');

      if (isFileNotFoundError(error)) {
        expect(error._tag).toBe('FileNotFoundError');
        expect(error.path).toBe('./missing.css');
      } else {
        throw new Error('Type guard failed');
      }
    });
  });

  describe('isPermissionError', () => {
    test('returns true for PermissionError', () => {
      const error = createPermissionError('./protected.css');
      expect(isPermissionError(error)).toBe(true);
    });

    test('returns false for non-PermissionError', () => {
      const error = createFileNotFoundError('./missing.css');
      expect(isPermissionError(error)).toBe(false);
    });

    test('narrows type correctly', () => {
      const error: unknown = createPermissionError('./protected.css');

      if (isPermissionError(error)) {
        expect(error._tag).toBe('PermissionError');
        expect(error.path).toBe('./protected.css');
      } else {
        throw new Error('Type guard failed');
      }
    });
  });

  describe('isReadError', () => {
    test('returns true for ReadError', () => {
      const error = createReadError('./corrupted.css', new Error('I/O error'));
      expect(isReadError(error)).toBe(true);
    });

    test('returns false for non-ReadError', () => {
      const error = createFileNotFoundError('./missing.css');
      expect(isReadError(error)).toBe(false);
    });

    test('narrows type correctly', () => {
      const error: unknown = createReadError('./corrupted.css');

      if (isReadError(error)) {
        expect(error._tag).toBe('ReadError');
        expect(error.path).toBe('./corrupted.css');
      } else {
        throw new Error('Type guard failed');
      }
    });
  });

  describe('isSecurityError', () => {
    test('returns true for SecurityError', () => {
      const error = createSecurityError('../evil.css', '/project');
      expect(isSecurityError(error)).toBe(true);
    });

    test('returns false for non-SecurityError', () => {
      const error = createFileNotFoundError('./missing.css');
      expect(isSecurityError(error)).toBe(false);
    });

    test('narrows type correctly', () => {
      const error: unknown = createSecurityError('../evil.css', '/project');

      if (isSecurityError(error)) {
        expect(error._tag).toBe('SecurityError');
        expect(error.path).toBe('../evil.css');
        expect(error.projectRoot).toBe('/project');
      } else {
        throw new Error('Type guard failed');
      }
    });
  });

  describe('isIOError', () => {
    test('returns true for FileNotFoundError', () => {
      const error = createFileNotFoundError('./missing.css');
      expect(isIOError(error)).toBe(true);
    });

    test('returns true for PermissionError', () => {
      const error = createPermissionError('./protected.css');
      expect(isIOError(error)).toBe(true);
    });

    test('returns true for ReadError', () => {
      const error = createReadError('./corrupted.css');
      expect(isIOError(error)).toBe(true);
    });

    test('returns true for SecurityError', () => {
      const error = createSecurityError('../evil.css', '/project');
      expect(isIOError(error)).toBe(true);
    });

    test('returns false for non-IOError', () => {
      const error = createParseError({
        message: 'Expected }',
        location: { line: 1, column: 10 },
      });
      expect(isIOError(error)).toBe(false);
    });
  });
});

describe('Top-Level Type Guard', () => {
  describe('isEligianError', () => {
    test('returns true for CompilerError', () => {
      const error = createParseError({
        message: 'Expected }',
        location: { line: 1, column: 10 },
      });
      expect(isEligianError(error)).toBe(true);
    });

    test('returns true for AssetError', () => {
      const error = createCssImportError({
        filePath: './styles.css',
        absolutePath: '/abs/styles.css',
        message: 'CSS not found',
        location: { line: 2, column: 1 },
      });
      expect(isEligianError(error)).toBe(true);
    });

    test('returns true for IOError', () => {
      const error = createFileNotFoundError('./missing.css');
      expect(isEligianError(error)).toBe(true);
    });

    test('returns false for non-EligianError', () => {
      expect(isEligianError({ _tag: 'NotAnError' })).toBe(false);
      expect(isEligianError(null)).toBe(false);
      expect(isEligianError(undefined)).toBe(false);
      expect(isEligianError(new Error('Standard JS error'))).toBe(false);
    });

    test('narrows type correctly for CompilerError', () => {
      const error: unknown = createValidationError({
        kind: 'UndefinedReference',
        message: 'Undefined action',
        location: { line: 2, column: 5 },
      });

      if (isEligianError(error)) {
        // Should be able to access common error properties
        expect(error._tag).toBe('ValidationError');
        expect(error.message).toBe('Undefined action');
      } else {
        throw new Error('Type guard failed');
      }
    });

    test('narrows type correctly for AssetError', () => {
      const error: unknown = createMediaImportError({
        filePath: './video.mp4',
        absolutePath: '/abs/video.mp4',
        message: 'Media file not found',
        location: { line: 3, column: 1 },
      });

      if (isEligianError(error)) {
        expect(error._tag).toBe('MediaImportError');
        expect(error.message).toBe('Media file not found');
      } else {
        throw new Error('Type guard failed');
      }
    });

    test('narrows type correctly for IOError', () => {
      const error: unknown = createSecurityError('../evil.css', '/project');

      if (isEligianError(error)) {
        expect(error._tag).toBe('SecurityError');
        expect(error.message).toContain('Path traversal detected');
      } else {
        throw new Error('Type guard failed');
      }
    });
  });
});
