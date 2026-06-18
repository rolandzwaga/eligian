/**
 * Tests for error reporter
 *
 * T102: Test error formatting with source locations and helpful hints
 */

import { describe, expect, it } from 'vitest';
import {
  createParseError,
  createTransformError,
  createTypeError,
  createValidationError,
} from '../../errors/index.js';
import {
  formatError,
  formatErrors,
  formatParseError,
  formatTransformError,
  formatTypeError,
  formatValidationError,
} from '../error-reporter.js';
import { createSourceLocation } from '../types/common.js';

describe('T102: Error Reporter Tests', () => {
  const sourceCode = `timeline "test" using raf {
  at 0s..5s [
    selectElement("#myId")
    addClass("active")
  ] []
}`;

  describe('formatParseError', () => {
    it('should format parse error with location', () => {
      const error = createParseError({
        message: 'Expected timeline keyword',
        location: createSourceLocation(1, 1),
      });

      const formatted = formatParseError(error);

      expect(formatted.severity).toBe('error');
      expect(formatted.message).toContain('Parse Error');
      expect(formatted.message).toContain('Expected timeline keyword');
      expect(formatted.message).toContain('1:1');
      expect(formatted.location).toEqual({ line: 1, column: 1 });
    });

    it('should include code snippet when source provided', () => {
      const error = createParseError({
        message: 'Expected timeline keyword',
        location: createSourceLocation(1, 1),
      });

      const formatted = formatParseError(error, sourceCode);

      expect(formatted.codeSnippet).toBeDefined();
      expect(formatted.codeSnippet).toContain('>');
      expect(formatted.codeSnippet).toContain('timeline');
      expect(formatted.codeSnippet).toContain('^'); // Error indicator
    });

    it('should provide helpful hint for timeline errors', () => {
      const error = createParseError({
        message: 'Missing timeline definition',
        location: createSourceLocation(1, 1),
      });

      const formatted = formatParseError(error);

      expect(formatted.hint).toBeDefined();
      expect(formatted.hint).toContain('timeline');
    });

    it('should handle error without location', () => {
      const error = createParseError({
        message: 'Generic parse error',
        location: createSourceLocation(0, 0),
      });

      const formatted = formatParseError(error);

      expect(formatted.severity).toBe('error');
      expect(formatted.message).toContain('Generic parse error');
    });
  });

  describe('formatValidationError', () => {
    it('should format validation error with location', () => {
      const error = createValidationError({
        kind: 'DuplicateDefinition',
        message: 'Duplicate action name "test"',
        location: createSourceLocation(2, 5),
      });

      const formatted = formatValidationError(error);

      expect(formatted.severity).toBe('error');
      expect(formatted.message).toContain('Validation Error');
      expect(formatted.message).toContain('Duplicate action name');
      expect(formatted.message).toContain('2:5');
    });

    it('should include code snippet when source provided', () => {
      const error = createValidationError({
        kind: 'ValidTimeRange',
        message: 'Invalid time range',
        location: createSourceLocation(2, 6),
      });

      const formatted = formatValidationError(error, sourceCode);

      expect(formatted.codeSnippet).toBeDefined();
      expect(formatted.codeSnippet).toContain('>');
      expect(formatted.codeSnippet).toContain('at 0s..5s');
    });

    it('should provide helpful hint for duplicate errors', () => {
      const error = createValidationError({
        kind: 'DuplicateDefinition',
        message: 'Duplicate action name',
        location: createSourceLocation(2, 5),
      });

      const formatted = formatValidationError(error);

      expect(formatted.hint).toBeDefined();
      expect(formatted.hint).toContain('unique');
    });

    it('B4 regression: a validation message containing "timeline" does NOT get the parse "define a timeline" hint', () => {
      // The CSS container-selector diagnostic's message contains the word
      // "timeline"; when it was mis-tagged ParseError it picked up the bogus
      // parse hint "Did you forget to define a timeline?". As a ValidationError
      // it must route through generateValidationHint (no such hint).
      const error = createValidationError({
        kind: 'SemanticValidation',
        message: "Unknown CSS ID in timeline container selector: 'stage'",
        location: createSourceLocation(1, 17),
      });

      const formatted = formatError(error);

      expect(formatted.message).toContain('Validation Error');
      expect(formatted.hint ?? '').not.toContain('Did you forget to define a timeline');
    });

    it('should provide helpful hint for time range errors', () => {
      const error = createValidationError({
        kind: 'ValidTimeRange',
        message: 'Invalid time range: end must be greater than start',
        location: createSourceLocation(2, 6),
      });

      const formatted = formatValidationError(error);

      expect(formatted.hint).toBeDefined();
      expect(formatted.hint).toContain('greater');
    });
  });

  describe('formatTypeError', () => {
    it('should format type error with location', () => {
      const error = createTypeError({
        message: 'Expected number but got string',
        location: createSourceLocation(2, 10),
        expected: 'number',
        actual: 'string',
      });

      const formatted = formatTypeError(error);

      expect(formatted.severity).toBe('error');
      expect(formatted.message).toContain('Type Error');
      expect(formatted.message).toContain('Expected number but got string');
      expect(formatted.message).toContain('2:10');
    });

    it('should include code snippet when source provided', () => {
      const error = createTypeError({
        message: 'Expected number but got string',
        location: createSourceLocation(3, 21),
        expected: 'number',
        actual: 'string',
      });

      const formatted = formatTypeError(error, sourceCode);

      expect(formatted.codeSnippet).toBeDefined();
      expect(formatted.codeSnippet).toContain('>');
      expect(formatted.codeSnippet).toContain('selectElement');
    });

    it('should provide helpful hint for number/string type errors', () => {
      const error = createTypeError({
        message: 'Expected number but got string',
        location: createSourceLocation(2, 10),
        expected: 'number',
        actual: 'string',
      });

      const formatted = formatTypeError(error);

      expect(formatted.hint).toBeDefined();
      expect(formatted.hint).toContain('Time values');
    });
  });

  describe('formatTransformError', () => {
    it('should format transform error with location', () => {
      const error = createTransformError({
        kind: 'ValidationError',
        message: 'Unknown operation: addClas',
        location: createSourceLocation(4, 5),
      });

      const formatted = formatTransformError(error);

      expect(formatted.severity).toBe('error');
      expect(formatted.message).toContain('Transform Error');
      expect(formatted.message).toContain('ValidationError');
      expect(formatted.message).toContain('Unknown operation');
      expect(formatted.message).toContain('4:5');
    });

    it('should include code snippet when source provided', () => {
      const error = createTransformError({
        kind: 'ValidationError',
        message: 'Unknown operation',
        location: createSourceLocation(4, 5),
      });

      const formatted = formatTransformError(error, sourceCode);

      expect(formatted.codeSnippet).toBeDefined();
      expect(formatted.codeSnippet).toContain('>');
      expect(formatted.codeSnippet).toContain('addClass');
    });

    it('should provide helpful hint for unknown operation errors', () => {
      const error = createTransformError({
        kind: 'ValidationError',
        message: 'Unknown operation: addClas',
        location: createSourceLocation(4, 5),
      });

      const formatted = formatTransformError(error);

      expect(formatted.hint).toBeDefined();
      expect(formatted.hint).toContain('typo');
    });

    it('should provide helpful hint for parameter errors', () => {
      const error = createTransformError({
        kind: 'ValidationError',
        message: 'Too many parameters for operation addClass',
        location: createSourceLocation(4, 5),
      });

      const formatted = formatTransformError(error);

      expect(formatted.hint).toBeDefined();
      expect(formatted.hint).toContain('parameter');
    });

    it('should provide helpful hint for dependency errors', () => {
      const error = createTransformError({
        kind: 'ValidationError',
        message: 'Missing dependency: selectedElement',
        location: createSourceLocation(4, 5),
      });

      const formatted = formatTransformError(error);

      expect(formatted.hint).toBeDefined();
      expect(formatted.hint).toContain('dependency');
    });
  });

  describe('formatError (pattern matching)', () => {
    it('should format parse errors', () => {
      const error = createParseError({
        message: 'Test error',
        location: createSourceLocation(1, 1),
      });
      const formatted = formatError(error);

      expect(formatted.severity).toBe('error');
      expect(formatted.message).toContain('Parse Error');
    });

    it('should format validation errors', () => {
      const error = createValidationError({
        kind: 'DuplicateDefinition',
        message: 'Test error',
        location: createSourceLocation(1, 1),
      });
      const formatted = formatError(error);

      expect(formatted.severity).toBe('error');
      expect(formatted.message).toContain('Validation Error');
    });

    it('should format type errors', () => {
      const error = createTypeError({
        message: 'Test error',
        location: createSourceLocation(1, 1),
        expected: 'number',
        actual: 'string',
      });
      const formatted = formatError(error);

      expect(formatted.severity).toBe('error');
      expect(formatted.message).toContain('Type Error');
    });

    it('should format transform errors', () => {
      const error = createTransformError({
        kind: 'ValidationError',
        message: 'Test error',
        location: createSourceLocation(1, 1),
      });
      const formatted = formatError(error);

      expect(formatted.severity).toBe('error');
      expect(formatted.message).toContain('Transform Error');
    });
  });

  describe('formatErrors (array)', () => {
    it('should format multiple errors', () => {
      const errors = [
        createParseError({ message: 'Parse error', location: createSourceLocation(1, 1) }),
        createValidationError({
          kind: 'DuplicateDefinition',
          message: 'Validation error',
          location: createSourceLocation(2, 5),
        }),
        createTypeError({
          message: 'Type error',
          location: createSourceLocation(3, 10),
          expected: 'number',
          actual: 'string',
        }),
      ];

      const formatted = formatErrors(errors);

      expect(formatted).toHaveLength(3);
      expect(formatted[0].severity).toBe('error');
      expect(formatted[0].message).toContain('Parse Error');
      expect(formatted[1].severity).toBe('error');
      expect(formatted[1].message).toContain('Validation Error');
      expect(formatted[2].severity).toBe('error');
      expect(formatted[2].message).toContain('Type Error');
    });

    it('should include source code snippets for all errors', () => {
      const errors = [
        createParseError({ message: 'Parse error', location: createSourceLocation(1, 1) }),
        createValidationError({
          kind: 'ValidTimeRange',
          message: 'Validation error',
          location: createSourceLocation(2, 6),
        }),
      ];

      const formatted = formatErrors(errors, sourceCode);

      expect(formatted[0].codeSnippet).toBeDefined();
      expect(formatted[0].codeSnippet).toContain('timeline');
      expect(formatted[1].codeSnippet).toBeDefined();
      expect(formatted[1].codeSnippet).toContain('at 0s..5s');
    });
  });

  describe('Code snippet extraction', () => {
    it('should show context lines before and after error', () => {
      const error = createParseError({
        message: 'Error in middle',
        location: createSourceLocation(3, 5),
      });
      const formatted = formatParseError(error, sourceCode);

      // Should show line 1-5 (2 before, error line, 2 after)
      expect(formatted.codeSnippet).toBeDefined();
      expect(formatted.codeSnippet).toContain('timeline');
      expect(formatted.codeSnippet).toContain('at 0s..5s');
      expect(formatted.codeSnippet).toContain('selectElement');
      expect(formatted.codeSnippet).toContain('addClass');
      expect(formatted.codeSnippet).toContain('] []');
    });

    it('should mark error line with >indicator', () => {
      const error = createParseError({ message: 'Error', location: createSourceLocation(3, 5) });
      const formatted = formatParseError(error, sourceCode);

      expect(formatted.codeSnippet).toBeDefined();
      const lines = formatted.codeSnippet!.split('\n');
      const errorLine = lines.find(line => line.startsWith('>'));
      expect(errorLine).toBeDefined();
      expect(errorLine).toContain('selectElement');
    });

    it('should show column indicator with ^', () => {
      const error = createParseError({ message: 'Error', location: createSourceLocation(3, 10) });
      const formatted = formatParseError(error, sourceCode);

      expect(formatted.codeSnippet).toBeDefined();
      expect(formatted.codeSnippet).toContain('^');
    });

    it('should handle errors at start of file', () => {
      const error = createParseError({ message: 'Error', location: createSourceLocation(1, 1) });
      const formatted = formatParseError(error, sourceCode);

      expect(formatted.codeSnippet).toBeDefined();
      expect(formatted.codeSnippet).toContain('timeline');
      expect(formatted.codeSnippet).toContain('>');
    });

    it('should handle errors at end of file', () => {
      const error = createParseError({ message: 'Error', location: createSourceLocation(6, 1) });
      const formatted = formatParseError(error, sourceCode);

      expect(formatted.codeSnippet).toBeDefined();
      expect(formatted.codeSnippet).toContain('}');
      expect(formatted.codeSnippet).toContain('>');
    });
  });

  describe('Helpful hints', () => {
    it('should suggest timeline help for timeline errors', () => {
      const error = createParseError({
        message: 'Missing timeline',
        location: createSourceLocation(1, 1),
      });
      const formatted = formatParseError(error);

      expect(formatted.hint).toBeDefined();
      expect(formatted.hint).toContain('timeline');
    });

    it('should suggest time range format for time errors', () => {
      const error = createParseError({
        message: 'Invalid time range at 5..10',
        location: createSourceLocation(2, 6),
      });
      const formatted = formatParseError(error);

      expect(formatted.hint).toBeDefined();
      expect(formatted.hint).toContain('at');
      expect(formatted.hint).toContain('..');
    });

    it('should suggest action bracket syntax for bracket errors', () => {
      const error = createParseError({
        message: 'Missing [',
        location: createSourceLocation(2, 15),
      });
      const formatted = formatParseError(error);

      expect(formatted.hint).toBeDefined();
      expect(formatted.hint).toContain('brackets');
    });

    it('should suggest unique names for duplicate errors', () => {
      const error = createValidationError({
        kind: 'DuplicateDefinition',
        message: 'Duplicate action name',
        location: createSourceLocation(2, 5),
      });
      const formatted = formatValidationError(error);

      expect(formatted.hint).toBeDefined();
      expect(formatted.hint).toContain('unique');
    });

    it('should suggest non-negative times for negative time errors', () => {
      const error = createValidationError({
        kind: 'NonNegativeTimes',
        message: 'Time cannot be negative',
        location: createSourceLocation(2, 6),
      });
      const formatted = formatValidationError(error);

      expect(formatted.hint).toBeDefined();
      expect(formatted.hint).toContain('non-negative');
    });
  });
});
