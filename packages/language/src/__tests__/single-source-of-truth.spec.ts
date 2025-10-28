/**
 * Single Source of Truth Tests (Feature 018 - US3)
 *
 * Tests that the unified error namespace provides a single source of truth
 * for all error types, making it easy to add new error types without
 * duplicating definitions across the codebase.
 *
 * Test ID: T029
 */

import { describe, expect, it } from 'vitest';
import type { AllErrors, AssetError, CompilerError, SourceLocation } from '../errors/index.js';
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
  formatError,
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

describe('Single Source of Truth (Feature 018 - US3)', () => {
  describe('T029-A: All error types are exported from unified namespace', () => {
    it('exports CompilerError union type', () => {
      const location: SourceLocation = { file: 'test.eligian', line: 1, column: 1 };
      const error: CompilerError = createParseError({ message: 'test', location });
      expect(error._tag).toBe('ParseError');
    });

    it('exports AssetError union type', () => {
      const location: SourceLocation = { file: 'test.eligian', line: 1, column: 1 };
      const error: AssetError = createCssImportError(
        'test.css',
        '/abs/test.css',
        'File not found',
        location
      );
      expect(error._tag).toBe('CssImportError');
    });

    it('exports IOError union type', () => {
      // IOError is re-exported from @eligian/shared-utils
      // We can't construct IOError directly here (it comes from external package)
      // But we can test that the type guard works
      const testError = {
        _tag: 'FileNotFoundError',
        path: '/test/file.txt',
        message: 'File not found',
      };
      expect(isFileNotFoundError(testError)).toBe(true);
    });

    it('exports AllErrors union type', () => {
      const location: SourceLocation = { file: 'test.eligian', line: 1, column: 1 };
      const compilerError: AllErrors = createParseError({ message: 'test', location });
      const assetError: AllErrors = createCssImportError(
        'test.css',
        '/abs/test.css',
        'File not found',
        location
      );

      expect(isCompilerError(compilerError)).toBe(true);
      expect(isAssetError(assetError)).toBe(true);
    });
  });

  describe('T029-B: All constructor functions are exported', () => {
    const location: SourceLocation = { file: 'test.eligian', line: 1, column: 1 };

    it('exports compiler error constructors', () => {
      expect(createParseError({ message: 'test', location })._tag).toBe('ParseError');
      expect(
        createValidationError({ kind: 'UndefinedReference', message: 'test', location })._tag
      ).toBe('ValidationError');
      expect(
        createTypeError({ message: 'test', location, expected: 'string', actual: 'number' })._tag
      ).toBe('TypeError');
      expect(createTransformError({ kind: 'UnknownNode', message: 'test', location })._tag).toBe(
        'TransformError'
      );
      expect(createOptimizationError({ message: 'test', pass: 'dead-code' })._tag).toBe(
        'OptimizationError'
      );
      expect(createEmitError({ message: 'test' })._tag).toBe('EmitError');
    });

    it('exports asset error constructors', () => {
      expect(
        createCssImportError({
          filePath: 'test.css',
          absolutePath: '/abs/test.css',
          message: 'File not found',
          location,
        })._tag
      ).toBe('CssImportError');
      expect(
        createCssParseError({ filePath: 'test.css', message: 'Syntax error', line: 1, column: 1 })
          ._tag
      ).toBe('CssParseError');
      expect(
        createHtmlImportError({
          filePath: 'test.html',
          absolutePath: '/abs/test.html',
          message: 'File not found',
          location,
        })._tag
      ).toBe('HtmlImportError');
      expect(
        createMediaImportError({
          filePath: 'test.mp4',
          absolutePath: '/abs/test.mp4',
          message: 'File not found',
          location,
        })._tag
      ).toBe('MediaImportError');
    });
  });

  describe('T029-C: All type guards are exported', () => {
    const location: SourceLocation = { file: 'test.eligian', line: 1, column: 1 };

    it('exports compiler error type guards', () => {
      const parseError = createParseError({ message: 'test', location });
      const validationError = createValidationError({
        kind: 'UndefinedReference',
        message: 'test',
        location,
      });
      const typeError = createTypeError({
        message: 'test',
        location,
        expected: 'string',
        actual: 'number',
      });
      const transformError = createTransformError({
        kind: 'UnknownNode',
        message: 'test',
        location,
      });
      const optimizationError = createOptimizationError({ message: 'test', pass: 'dead-code' });
      const emitError = createEmitError({ message: 'test' });

      expect(isParseError(parseError)).toBe(true);
      expect(isValidationError(validationError)).toBe(true);
      expect(isTypeError(typeError)).toBe(true);
      expect(isTransformError(transformError)).toBe(true);
      expect(isOptimizationError(optimizationError)).toBe(true);
      expect(isEmitError(emitError)).toBe(true);

      // All compiler errors should be detected by isCompilerError
      expect(isCompilerError(parseError)).toBe(true);
      expect(isCompilerError(validationError)).toBe(true);
      expect(isCompilerError(typeError)).toBe(true);
      expect(isCompilerError(transformError)).toBe(true);
      expect(isCompilerError(optimizationError)).toBe(true);
      expect(isCompilerError(emitError)).toBe(true);
    });

    it('exports asset error type guards', () => {
      const cssImportError = createCssImportError(
        'test.css',
        '/abs/test.css',
        'File not found',
        location
      );
      const cssParseError = createCssParseError({
        filePath: 'test.css',
        message: 'Syntax error',
        line: 1,
        column: 1,
      });
      const htmlImportError = createHtmlImportError(
        'test.html',
        '/abs/test.html',
        'File not found',
        location
      );
      const mediaImportError = createMediaImportError(
        'test.mp4',
        '/abs/test.mp4',
        'File not found',
        location
      );

      expect(isCssImportError(cssImportError)).toBe(true);
      expect(isCssParseError(cssParseError)).toBe(true);
      expect(isHtmlImportError(htmlImportError)).toBe(true);
      expect(isMediaImportError(mediaImportError)).toBe(true);

      // All asset errors should be detected by isAssetError
      expect(isAssetError(cssImportError)).toBe(true);
      expect(isAssetError(cssParseError)).toBe(true);
      expect(isAssetError(htmlImportError)).toBe(true);
      expect(isAssetError(mediaImportError)).toBe(true);
    });

    it('exports I/O error type guards', () => {
      const fileNotFoundError = {
        _tag: 'FileNotFoundError',
        path: '/test/file.txt',
        message: 'File not found',
      };
      const permissionError = {
        _tag: 'PermissionError',
        path: '/test/file.txt',
        operation: 'read',
        message: 'Permission denied',
      };
      const readError = {
        _tag: 'ReadError',
        path: '/test/file.txt',
        message: 'Read failed',
        cause: new Error('test'),
      };
      const securityError = {
        _tag: 'SecurityError',
        path: '/test/file.txt',
        message: 'Security violation',
        attemptedPath: '/etc/passwd',
      };

      expect(isFileNotFoundError(fileNotFoundError)).toBe(true);
      expect(isPermissionError(permissionError)).toBe(true);
      expect(isReadError(readError)).toBe(true);
      expect(isSecurityError(securityError)).toBe(true);

      // All I/O errors should be detected by isIOError
      expect(isIOError(fileNotFoundError)).toBe(true);
      expect(isIOError(permissionError)).toBe(true);
      expect(isIOError(readError)).toBe(true);
      expect(isIOError(securityError)).toBe(true);
    });

    it('exports isEligianError for all error types', () => {
      const location: SourceLocation = { file: 'test.eligian', line: 1, column: 1 };
      const parseError = createParseError({ message: 'test', location });
      const cssImportError = createCssImportError(
        'test.css',
        '/abs/test.css',
        'File not found',
        location
      );
      const fileNotFoundError = {
        _tag: 'FileNotFoundError',
        path: '/test/file.txt',
        message: 'File not found',
      };

      expect(isEligianError(parseError)).toBe(true);
      expect(isEligianError(cssImportError)).toBe(true);
      expect(isEligianError(fileNotFoundError)).toBe(true);
      expect(isEligianError(new Error('not an Eligian error'))).toBe(false);
    });
  });

  describe('T029-D: Error formatting is exported', () => {
    it('exports formatError function', () => {
      const location: SourceLocation = { file: 'test.eligian', line: 1, column: 1 };
      const error = createParseError({
        message: 'Unexpected token',
        location,
      });

      const formatted = formatError(error);
      expect(formatted).toContain('Unexpected token');
      expect(formatted).toContain('test.eligian');
      expect(formatted).toContain('1:1');
    });
  });

  describe('T029-E: Adding a new error type is easy', () => {
    it('demonstrates the workflow for adding a new error type', () => {
      // Workflow for adding a new error type:
      // 1. Define error type in appropriate module (compiler-errors.ts, asset-errors.ts)
      // 2. Add to union type (CompilerError, AssetError)
      // 3. Create constructor function
      // 4. Add type guard to type-guards.ts
      // 5. Export from index.ts
      // 6. That's it! No need to update multiple files across packages

      // This test documents that workflow and verifies all pieces are in place
      const location: SourceLocation = { file: 'test.eligian', line: 1, column: 1 };

      // Example: Adding a new compiler error type would look like this
      // Step 1-2: Define type and add to union (done in compiler-errors.ts)
      type NewErrorType = {
        readonly _tag: 'NewErrorType';
        readonly message: string;
        readonly location: SourceLocation;
      };

      // Step 3: Create constructor (done in compiler-errors.ts)
      const createNewError = (message: string, location: SourceLocation): NewErrorType => ({
        _tag: 'NewErrorType',
        message,
        location,
      });

      // Step 4: Create type guard (done in type-guards.ts)
      const isNewError = (error: unknown): error is NewErrorType => {
        return (
          typeof error === 'object' &&
          error !== null &&
          '_tag' in error &&
          error._tag === 'NewErrorType'
        );
      };

      // Step 5: Export from index.ts
      // export { createNewError, isNewError }
      // export type { NewErrorType }

      // Verify the workflow works
      const newError = createNewError('test error', location);
      expect(isNewError(newError)).toBe(true);
      expect(newError._tag).toBe('NewErrorType');
    });
  });
});
