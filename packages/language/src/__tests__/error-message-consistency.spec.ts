/**
 * Error Message Consistency Tests (Feature 018 - US1)
 *
 * Tests that CompilerError messages are formatted consistently across all contexts
 * where they are created (validator, transformer, type checker, etc.).
 *
 * This test file follows Test-First Development (TFD) and was written BEFORE implementation.
 *
 * Test Strategy:
 * - Test that constructor functions create consistent error objects
 * - Test that all error types include required fields (_tag, message, location where applicable)
 * - Test that similar errors use similar message patterns
 */

import { describe, expect, test } from 'vitest';
import {
  createCssImportError,
  createCssParseError,
  createHtmlImportError,
  createMediaImportError,
} from '../errors/asset-errors.js';
// Import constructor functions (WILL FAIL UNTIL IMPLEMENTED)
import {
  createEmitError,
  createOptimizationError,
  createParseError,
  createTransformError,
  createTypeError,
  createValidationError,
} from '../errors/compiler-errors.js';
import type { SourceLocation } from '../errors/index.js';

describe('CompilerError Constructor Consistency', () => {
  const testLocation: SourceLocation = {
    file: 'test.eligian',
    line: 10,
    column: 5,
    length: 8,
  };

  describe('createParseError()', () => {
    test('creates ParseError with required fields', () => {
      const error = createParseError({
        message: 'Unexpected token',
        location: testLocation,
        expected: '}',
        actual: 'EOF',
      });

      expect(error._tag).toBe('ParseError');
      expect(error.message).toBe('Unexpected token');
      expect(error.location).toEqual(testLocation);
      expect(error.expected).toBe('}');
      expect(error.actual).toBe('EOF');
    });

    test('creates ParseError without optional fields', () => {
      const error = createParseError({
        message: 'Syntax error',
        location: testLocation,
      });

      expect(error._tag).toBe('ParseError');
      expect(error.message).toBe('Syntax error');
      expect(error.expected).toBeUndefined();
      expect(error.actual).toBeUndefined();
    });
  });

  describe('createValidationError()', () => {
    test('creates ValidationError with hint', () => {
      const error = createValidationError({
        kind: 'UndefinedReference',
        message: "Action 'fadeIn' not defined",
        location: testLocation,
        hint: 'Define the action before using it',
      });

      expect(error._tag).toBe('ValidationError');
      expect(error.kind).toBe('UndefinedReference');
      expect(error.message).toBe("Action 'fadeIn' not defined");
      expect(error.location).toEqual(testLocation);
      expect(error.hint).toBe('Define the action before using it');
    });

    test('creates ValidationError without hint', () => {
      const error = createValidationError({
        kind: 'DuplicateDefinition',
        message: "Action 'fadeIn' already defined",
        location: testLocation,
      });

      expect(error._tag).toBe('ValidationError');
      expect(error.hint).toBeUndefined();
    });
  });

  describe('createTypeError()', () => {
    test('creates TypeError with all fields', () => {
      const error = createTypeError({
        message: 'Type mismatch',
        location: testLocation,
        expected: 'string',
        actual: 'number',
        hint: 'Convert to string',
      });

      expect(error._tag).toBe('TypeError');
      expect(error.message).toBe('Type mismatch');
      expect(error.location).toEqual(testLocation);
      expect(error.expected).toBe('string');
      expect(error.actual).toBe('number');
      expect(error.hint).toBe('Convert to string');
    });
  });

  describe('createTransformError()', () => {
    test('creates TransformError with astNode', () => {
      const error = createTransformError({
        kind: 'UnknownNode',
        message: 'Unknown AST node type',
        location: testLocation,
        astNode: 'FutureConstruct',
      });

      expect(error._tag).toBe('TransformError');
      expect(error.kind).toBe('UnknownNode');
      expect(error.message).toBe('Unknown AST node type');
      expect(error.location).toEqual(testLocation);
      expect(error.astNode).toBe('FutureConstruct');
    });
  });

  describe('createOptimizationError()', () => {
    test('creates OptimizationError', () => {
      const error = createOptimizationError({
        message: 'Optimization failed',
        pass: 'deadCodeElimination',
        hint: 'This is a compiler bug',
      });

      expect(error._tag).toBe('OptimizationError');
      expect(error.message).toBe('Optimization failed');
      expect(error.pass).toBe('deadCodeElimination');
      expect(error.hint).toBe('This is a compiler bug');
    });
  });

  describe('createEmitError()', () => {
    test('creates EmitError', () => {
      const error = createEmitError({
        message: 'Failed to emit JSON',
        ir: '{ invalid IR }',
        hint: 'Check IR structure',
      });

      expect(error._tag).toBe('EmitError');
      expect(error.message).toBe('Failed to emit JSON');
      expect(error.ir).toBe('{ invalid IR }');
      expect(error.hint).toBe('Check IR structure');
    });
  });
});

describe('AssetError Constructor Consistency', () => {
  const testLocation: SourceLocation = {
    file: 'test.eligian',
    line: 5,
    column: 10,
    length: 15,
  };

  describe('createHtmlImportError()', () => {
    test('creates HtmlImportError with all fields', () => {
      const error = createHtmlImportError({
        filePath: './layout.html',
        absolutePath: '/workspace/layout.html',
        message: 'HTML file not found',
        location: testLocation,
        line: 3,
        column: 5,
        hint: 'Check file path',
      });

      expect(error._tag).toBe('HtmlImportError');
      expect(error.filePath).toBe('./layout.html');
      expect(error.absolutePath).toBe('/workspace/layout.html');
      expect(error.message).toBe('HTML file not found');
      expect(error.location).toEqual(testLocation);
      expect(error.line).toBe(3);
      expect(error.column).toBe(5);
      expect(error.hint).toBe('Check file path');
    });

    test('creates HtmlImportError without optional HTML location', () => {
      const error = createHtmlImportError({
        filePath: './layout.html',
        absolutePath: '/workspace/layout.html',
        message: 'File not found',
        location: testLocation,
      });

      expect(error._tag).toBe('HtmlImportError');
      expect(error.line).toBeUndefined();
      expect(error.column).toBeUndefined();
      expect(error.hint).toBeUndefined();
    });
  });

  describe('createCssImportError()', () => {
    test('creates CssImportError', () => {
      const error = createCssImportError({
        filePath: './styles.css',
        absolutePath: '/workspace/styles.css',
        message: 'CSS file not found',
        location: testLocation,
        hint: 'Ensure file exists',
      });

      expect(error._tag).toBe('CssImportError');
      expect(error.filePath).toBe('./styles.css');
      expect(error.absolutePath).toBe('/workspace/styles.css');
      expect(error.message).toBe('CSS file not found');
      expect(error.location).toEqual(testLocation);
      expect(error.hint).toBe('Ensure file exists');
    });
  });

  describe('createCssParseError()', () => {
    test('creates CssParseError with source snippet', () => {
      const error = createCssParseError({
        filePath: '/workspace/styles.css',
        message: 'Unclosed block',
        line: 15,
        column: 3,
        source: '.button { color: red',
        hint: 'Add closing brace',
      });

      expect(error._tag).toBe('CssParseError');
      expect(error.filePath).toBe('/workspace/styles.css');
      expect(error.message).toBe('Unclosed block');
      expect(error.line).toBe(15);
      expect(error.column).toBe(3);
      expect(error.source).toBe('.button { color: red');
      expect(error.hint).toBe('Add closing brace');
    });

    test('creates CssParseError without source snippet', () => {
      const error = createCssParseError({
        filePath: '/workspace/styles.css',
        message: 'Invalid property',
        line: 10,
        column: 5,
      });

      expect(error._tag).toBe('CssParseError');
      expect(error.source).toBeUndefined();
      expect(error.hint).toBeUndefined();
    });
  });

  describe('createMediaImportError()', () => {
    test('creates MediaImportError', () => {
      const error = createMediaImportError({
        filePath: './video.mp4',
        absolutePath: '/workspace/video.mp4',
        message: 'Media file not found',
        location: testLocation,
        hint: 'Check file path',
      });

      expect(error._tag).toBe('MediaImportError');
      expect(error.filePath).toBe('./video.mp4');
      expect(error.absolutePath).toBe('/workspace/video.mp4');
      expect(error.message).toBe('Media file not found');
      expect(error.location).toEqual(testLocation);
      expect(error.hint).toBe('Check file path');
    });
  });
});

describe('Error Message Pattern Consistency', () => {
  const testLocation: SourceLocation = {
    file: 'test.eligian',
    line: 10,
    column: 5,
  };

  test('ValidationErrors for undefined references use consistent pattern', () => {
    const actionError = createValidationError({
      kind: 'UndefinedReference',
      message: "Action 'fadeIn' is not defined",
      location: testLocation,
    });

    const timelineError = createValidationError({
      kind: 'UndefinedReference',
      message: "Timeline 'main' is not defined",
      location: testLocation,
    });

    // Both should follow similar pattern: "X 'name' is not defined"
    expect(actionError.message).toMatch(/^(Action|Timeline) '.+' is not defined$/);
    expect(timelineError.message).toMatch(/^(Action|Timeline) '.+' is not defined$/);
  });

  test('Asset import errors use consistent pattern', () => {
    const htmlError = createHtmlImportError({
      filePath: './layout.html',
      absolutePath: '/workspace/layout.html',
      message: 'HTML file not found: ./layout.html',
      location: testLocation,
    });

    const cssError = createCssImportError({
      filePath: './styles.css',
      absolutePath: '/workspace/styles.css',
      message: 'CSS file not found: ./styles.css',
      location: testLocation,
    });

    const mediaError = createMediaImportError({
      filePath: './video.mp4',
      absolutePath: '/workspace/video.mp4',
      message: 'Media file not found: ./video.mp4',
      location: testLocation,
    });

    // All should follow pattern: "X file not found: path"
    expect(htmlError.message).toMatch(/^HTML file not found: /);
    expect(cssError.message).toMatch(/^CSS file not found: /);
    expect(mediaError.message).toMatch(/^Media file not found: /);
  });
});
