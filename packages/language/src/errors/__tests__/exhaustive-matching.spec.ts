/**
 * Exhaustive Pattern Matching Tests (T020)
 *
 * These tests verify that TypeScript exhaustiveness checking works correctly
 * with our error discriminated unions. When using switch statements with type
 * guards, TypeScript should ensure all cases are handled without requiring a
 * default case.
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
import type { AllErrors, AssetError, CompilerError, IOError } from '../index.js';
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
} from '../index.js';

/**
 * Format CompilerError using exhaustive switch (NO default case)
 *
 * TypeScript should ensure all CompilerError variants are handled.
 * If we miss a case, TypeScript will show a type error.
 */
function formatCompilerError(error: CompilerError): string {
  switch (error._tag) {
    case 'ParseError':
      return `Parse: ${error.message} (expected: ${error.expected ?? 'unknown'})`;
    case 'ValidationError':
      return `Validation: ${error.kind} - ${error.message}`;
    case 'TypeError':
      return `Type: expected ${error.expected}, got ${error.actual}`;
    case 'TransformError':
      return `Transform: ${error.kind} - ${error.message}`;
    case 'OptimizationError':
      return `Optimization (${error.pass}): ${error.message}`;
    case 'EmitError':
      return `Emit: ${error.message}`;
    // NO default case - TypeScript checks exhaustiveness
  }
}

/**
 * Format AssetError using exhaustive switch (NO default case)
 */
function formatAssetError(error: AssetError): string {
  switch (error._tag) {
    case 'HtmlImportError':
      return `HTML Import: ${error.filePath} - ${error.message}`;
    case 'CssImportError':
      return `CSS Import: ${error.filePath} - ${error.message}`;
    case 'CssParseError':
      return `CSS Parse (${error.line}:${error.column}): ${error.message}`;
    case 'MediaImportError':
      return `Media Import: ${error.filePath} - ${error.message}`;
    // NO default case - TypeScript checks exhaustiveness
  }
}

/**
 * Format IOError using exhaustive switch (NO default case)
 */
function formatIOError(error: IOError): string {
  switch (error._tag) {
    case 'FileNotFoundError':
      return `File Not Found: ${error.path}`;
    case 'PermissionError':
      return `Permission Denied: ${error.path}`;
    case 'ReadError':
      return `Read Failed: ${error.path}`;
    case 'SecurityError':
      return `Security Violation: ${error.path} (root: ${error.projectRoot})`;
    // NO default case - TypeScript checks exhaustiveness
  }
}

/**
 * Format AllErrors using exhaustive switch (NO default case)
 *
 * This demonstrates nested exhaustive checking - we first check the category
 * (Compiler/Asset/IO), then delegate to category-specific formatters.
 */
function formatAllErrors(error: AllErrors): string {
  // First check if it's a CompilerError (6 variants)
  if (
    error._tag === 'ParseError' ||
    error._tag === 'ValidationError' ||
    error._tag === 'TypeError' ||
    error._tag === 'TransformError' ||
    error._tag === 'OptimizationError' ||
    error._tag === 'EmitError'
  ) {
    return formatCompilerError(error);
  }

  // Then check if it's an AssetError (4 variants)
  if (
    error._tag === 'HtmlImportError' ||
    error._tag === 'CssImportError' ||
    error._tag === 'CssParseError' ||
    error._tag === 'MediaImportError'
  ) {
    return formatAssetError(error);
  }

  // Finally check if it's an IOError (4 variants)
  if (
    error._tag === 'FileNotFoundError' ||
    error._tag === 'PermissionError' ||
    error._tag === 'ReadError' ||
    error._tag === 'SecurityError'
  ) {
    return formatIOError(error);
  }

  // If TypeScript allows this line, we have a bug in our type system
  const _exhaustive: never = error;
  throw new Error(`Unhandled error type: ${(_exhaustive as AllErrors)._tag}`);
}

describe('Exhaustive Pattern Matching', () => {
  describe('CompilerError exhaustiveness', () => {
    test('handles ParseError', () => {
      const error = createParseError({
        message: 'Expected }',
        location: { line: 1, column: 10 },
        expected: '}',
        actual: 'EOF',
      });
      expect(formatCompilerError(error)).toBe('Parse: Expected } (expected: })');
    });

    test('handles ValidationError', () => {
      const error = createValidationError({
        kind: 'UndefinedReference',
        message: 'Undefined action',
        location: { line: 2, column: 5 },
      });
      expect(formatCompilerError(error)).toBe('Validation: UndefinedReference - Undefined action');
    });

    test('handles TypeError', () => {
      const error = createTypeError({
        message: 'Type mismatch',
        location: { line: 4, column: 10 },
        expected: 'string',
        actual: 'number',
      });
      expect(formatCompilerError(error)).toBe('Type: expected string, got number');
    });

    test('handles TransformError', () => {
      const error = createTransformError({
        kind: 'UnknownNode',
        message: 'Unknown node type',
        location: { line: 5, column: 1 },
      });
      expect(formatCompilerError(error)).toBe('Transform: UnknownNode - Unknown node type');
    });

    test('handles OptimizationError', () => {
      const error = createOptimizationError({
        message: 'Optimization failed',
        pass: 'dead-code-elimination',
      });
      expect(formatCompilerError(error)).toBe(
        'Optimization (dead-code-elimination): Optimization failed'
      );
    });

    test('handles EmitError', () => {
      const error = createEmitError({
        message: 'Failed to emit JSON',
      });
      expect(formatCompilerError(error)).toBe('Emit: Failed to emit JSON');
    });
  });

  describe('AssetError exhaustiveness', () => {
    test('handles HtmlImportError', () => {
      const error = createHtmlImportError({
        filePath: './layout.html',
        absolutePath: '/abs/layout.html',
        message: 'HTML syntax error',
        location: { line: 1, column: 1 },
      });
      expect(formatAssetError(error)).toBe('HTML Import: ./layout.html - HTML syntax error');
    });

    test('handles CssImportError', () => {
      const error = createCssImportError({
        filePath: './styles.css',
        absolutePath: '/abs/styles.css',
        message: 'CSS not found',
        location: { line: 2, column: 1 },
      });
      expect(formatAssetError(error)).toBe('CSS Import: ./styles.css - CSS not found');
    });

    test('handles CssParseError', () => {
      const error = createCssParseError({
        filePath: '/abs/styles.css',
        message: 'Unclosed block',
        line: 10,
        column: 5,
      });
      expect(formatAssetError(error)).toBe('CSS Parse (10:5): Unclosed block');
    });

    test('handles MediaImportError', () => {
      const error = createMediaImportError({
        filePath: './video.mp4',
        absolutePath: '/abs/video.mp4',
        message: 'Media file not found',
        location: { line: 3, column: 1 },
      });
      expect(formatAssetError(error)).toBe('Media Import: ./video.mp4 - Media file not found');
    });
  });

  describe('IOError exhaustiveness', () => {
    test('handles FileNotFoundError', () => {
      const error = createFileNotFoundError('./missing.css');
      expect(formatIOError(error)).toBe('File Not Found: ./missing.css');
    });

    test('handles PermissionError', () => {
      const error = createPermissionError('./protected.css');
      expect(formatIOError(error)).toBe('Permission Denied: ./protected.css');
    });

    test('handles ReadError', () => {
      const error = createReadError('./corrupted.css');
      expect(formatIOError(error)).toBe('Read Failed: ./corrupted.css');
    });

    test('handles SecurityError', () => {
      const error = createSecurityError('../evil.css', '/project');
      expect(formatIOError(error)).toBe('Security Violation: ../evil.css (root: /project)');
    });
  });

  describe('AllErrors exhaustiveness', () => {
    test('handles all CompilerError variants', () => {
      const errors: CompilerError[] = [
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
        expect(formatAllErrors(error)).toBeTruthy();
      });
    });

    test('handles all AssetError variants', () => {
      const errors: AssetError[] = [
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
        expect(formatAllErrors(error)).toBeTruthy();
      });
    });

    test('handles all IOError variants', () => {
      const errors: IOError[] = [
        createFileNotFoundError('./missing.css'),
        createPermissionError('./protected.css'),
        createReadError('./corrupted.css'),
        createSecurityError('../evil.css', '/project'),
      ];

      errors.forEach(error => {
        expect(formatAllErrors(error)).toBeTruthy();
      });
    });
  });
});

/**
 * Type-level test: Verify that removing a case causes a TypeScript error
 *
 * Uncomment this function to verify TypeScript catches missing cases:
 *
 * function incompleteFormatter(error: CompilerError): string {
 *   switch (error._tag) {
 *     case 'ParseError':
 *       return 'Parse error';
 *     case 'ValidationError':
 *       return 'Validation error';
 *     // MISSING: TypeError, TransformError, OptimizationError, EmitError
 *   }
 *   // TypeScript should error: "Function lacks ending return statement"
 * }
 */
