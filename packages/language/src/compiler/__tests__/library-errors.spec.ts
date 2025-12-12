/**
 * Library Error Formatting Tests (Feature 032 - User Story 2, T021-T023)
 *
 * Unit tests for error formatting functions when library loading fails.
 *
 * Test Coverage:
 * - T021: FileNotFound error formatting (search paths, suggestions)
 * - T022: ParseError formatting (filename, line/column, syntax error)
 * - T023: InvalidLibrary error formatting (not a library file, wrong type)
 *
 * Constitution Principle II: Write tests BEFORE implementation.
 */

import { describe, expect, it } from 'vitest';
import { createParseError, createValidationError } from '../../errors/index.js';
import { formatParseError, formatValidationError } from '../error-reporter.js';
import { createSourceLocation } from '../types/common.js';

describe('Library Error Formatting (T021-T023)', () => {
  describe('T021: FileNotFound error formatting', () => {
    it('should format file not found error with attempted path', () => {
      // Simulate file not found error from library loading
      const error = createParseError(
        'Library file not found: ./animations.eligian',
        createSourceLocation(1, 1)
      );

      const formatted = formatParseError(error);

      expect(formatted.severity).toBe('error');
      expect(formatted.message).toContain('Parse Error');
      expect(formatted.message).toContain('Library file not found');
      expect(formatted.message).toContain('./animations.eligian');
    });

    it('should format error with full resolved path', () => {
      const error = createParseError(
        'Library file not found: /project/src/libs/animations.eligian',
        createSourceLocation(3, 8)
      );

      const formatted = formatParseError(error);

      expect(formatted.severity).toBe('error');
      expect(formatted.message).toContain('/project/src/libs/animations.eligian');
      expect(formatted.message).toContain('3:8');
    });

    it('should include code snippet showing import statement', () => {
      const sourceCode = `
import { fadeIn } from "./missing.eligian"
timeline "Test" in ".container" using raf {
  at 0s..5s fadeIn()
}`;
      const error = createParseError(
        'Library file not found: ./missing.eligian',
        createSourceLocation(2, 1)
      );

      const formatted = formatParseError(error, sourceCode);

      expect(formatted.codeSnippet).toBeDefined();
      expect(formatted.codeSnippet).toContain('import');
      expect(formatted.codeSnippet).toContain('missing.eligian');
    });
  });

  describe('T022: ParseError formatting', () => {
    it('should format parse error with filename and location', () => {
      const error = createParseError(
        'Unexpected token in library file ./utils.eligian',
        createSourceLocation(5, 10)
      );

      const formatted = formatParseError(error);

      expect(formatted.severity).toBe('error');
      expect(formatted.message).toContain('Parse Error');
      expect(formatted.message).toContain('5:10');
      expect(formatted.location).toEqual({ line: 5, column: 10 });
    });

    it('should include syntax error context when available', () => {
      const librarySource = `library animations
action fadeIn(selector: string) [
  selectElement(selector
]`;
      const error = createParseError(
        "Expected ')' but found ']'",
        createSourceLocation(3, 23),
        "')'",
        "']'"
      );

      const formatted = formatParseError(error, librarySource);

      expect(formatted.message).toContain("Expected ')' but found ']'");
      expect(formatted.codeSnippet).toBeDefined();
      expect(formatted.codeSnippet).toContain('selectElement');
    });

    it('should provide helpful hint for bracket errors', () => {
      const error = createParseError(
        "Expected ']' to close action block",
        createSourceLocation(4, 1)
      );

      const formatted = formatParseError(error);

      expect(formatted.hint).toBeDefined();
      expect(formatted.hint).toContain('brackets');
    });

    it('should format error for missing library keyword', () => {
      const error = createParseError(
        "Expected 'library' keyword at start of library file",
        createSourceLocation(1, 1)
      );

      const formatted = formatParseError(error);

      expect(formatted.message).toContain("Expected 'library' keyword");
      expect(formatted.location).toEqual({ line: 1, column: 1 });
    });
  });

  describe('T023: InvalidLibrary error formatting', () => {
    it('should format error when file is not a library', () => {
      // When a file parses as a Program instead of a Library
      const error = createValidationError(
        'MissingRequiredField',
        'File is not a library: expected "library" declaration but found Program',
        createSourceLocation(1, 1),
        'Library files must start with "library <name>" declaration'
      );

      const formatted = formatValidationError(error);

      expect(formatted.severity).toBe('error');
      expect(formatted.message).toContain('Validation Error');
      expect(formatted.message).toContain('not a library');
    });

    it('should include helpful hint for Program vs Library confusion', () => {
      const sourceCode = `
action fadeIn(selector: string) [
  selectElement(selector)
]
timeline "Test" in ".container" using raf {
  at 0s..5s fadeIn("#box")
}`;
      const error = createValidationError(
        'MissingRequiredField',
        'Cannot import from Program file - file must be a Library',
        createSourceLocation(1, 1),
        'Add "library <name>" at the start of the file to make it a library'
      );

      const formatted = formatValidationError(error, sourceCode);

      expect(formatted.message).toContain('Cannot import from Program file');
      expect(formatted.codeSnippet).toBeDefined();
    });

    it('should format error for incompatible library version', () => {
      const error = createValidationError(
        'MissingRequiredField',
        'Library version mismatch: expected Eligian 2.x, found 1.x syntax',
        createSourceLocation(1, 1)
      );

      const formatted = formatValidationError(error);

      expect(formatted.message).toContain('Library version mismatch');
      expect(formatted.message).toContain('Eligian 2.x');
      expect(formatted.location).toEqual({ line: 1, column: 1 });
    });

    it('should format error when library has no exported actions', () => {
      const error = createValidationError(
        'MissingRequiredField',
        'Library "empty" has no exported actions',
        createSourceLocation(1, 1)
      );

      const formatted = formatValidationError(error);

      expect(formatted.message).toContain('no exported actions');
      expect(formatted.message).toContain('Validation Error');
    });

    it('should format error for circular library imports', () => {
      const error = createValidationError(
        'InvalidScope',
        'Circular import detected: a.eligian → b.eligian → a.eligian',
        createSourceLocation(1, 8)
      );

      const formatted = formatValidationError(error);

      expect(formatted.message).toContain('Circular import detected');
      expect(formatted.location).toEqual({ line: 1, column: 8 });
    });
  });
});
