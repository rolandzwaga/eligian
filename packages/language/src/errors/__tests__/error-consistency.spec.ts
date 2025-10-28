/**
 * Error Consistency Tests (Feature 018 - US1)
 *
 * Tests that formatError() produces consistent error messages across all error types.
 * This test file follows Test-First Development (TFD) and was written BEFORE implementation.
 *
 * Test Strategy:
 * - Test formatError() produces consistent format for all error types
 * - Test formatErrorWithSnippet() includes source code context
 * - Test formatForVSCode() converts to vscode.Diagnostic format
 *
 * Expected Format:
 * - formatError(): "{file}:{line}:{column} {message}\nHint: {hint}"
 * - formatErrorWithSnippet(): adds source code excerpt with error marker
 * - formatForVSCode(): returns vscode.Diagnostic with proper range and message
 */

import { describe, expect, test } from 'vitest';
// Import formatters (WILL FAIL UNTIL IMPLEMENTED)
import { formatError, formatErrorWithSnippet, formatForVSCode } from '../formatters.js';
import type {
  CompilerError,
  CssImportError,
  CssParseError,
  HtmlImportError,
  IOError,
  MediaImportError,
  ParseError,
  SourceLocation,
  TypeError,
  ValidationError,
} from '../index.js';

describe('Error Consistency - formatError()', () => {
  const testLocation: SourceLocation = {
    file: 'test.eligian',
    line: 10,
    column: 5,
    length: 8,
  };

  describe('CompilerError formatting', () => {
    test('ParseError formats with expected/actual', () => {
      const error: ParseError = {
        _tag: 'ParseError',
        message: 'Unexpected token',
        location: testLocation,
        expected: '}',
        actual: 'EOF',
      };

      const formatted = formatError(error);

      expect(formatted).toContain('test.eligian:10:5');
      expect(formatted).toContain('Unexpected token');
      expect(formatted).toContain("Expected '}'"); // Quotes are added by formatter
      expect(formatted).toContain("got 'EOF'"); // Quotes are added by formatter
    });

    test('ValidationError formats with hint', () => {
      const error: ValidationError = {
        _tag: 'ValidationError',
        kind: 'UndefinedReference',
        message: "Action 'fadeIn' not defined",
        location: testLocation,
        hint: 'Did you forget to define the action?',
      };

      const formatted = formatError(error);

      expect(formatted).toContain('test.eligian:10:5');
      expect(formatted).toContain("Action 'fadeIn' not defined");
      expect(formatted).toContain('Hint: Did you forget to define the action?');
    });

    test('TypeError formats with expected/actual types', () => {
      const error: TypeError = {
        _tag: 'TypeError',
        message: 'Type mismatch in selectElement()',
        location: testLocation,
        expected: 'string',
        actual: 'number',
        hint: 'Parameter selector must be a string',
      };

      const formatted = formatError(error);

      expect(formatted).toContain('test.eligian:10:5');
      expect(formatted).toContain('Type mismatch in selectElement()');
      expect(formatted).toContain('Expected string');
      expect(formatted).toContain('got number');
      expect(formatted).toContain('Hint: Parameter selector must be a string');
    });
  });

  describe('AssetError formatting', () => {
    test('HtmlImportError formats with file path', () => {
      const error: HtmlImportError = {
        _tag: 'HtmlImportError',
        filePath: './layout.html',
        absolutePath: '/workspace/layout.html',
        message: 'HTML file not found',
        location: testLocation,
        hint: 'Check if the file exists and the path is correct',
      };

      const formatted = formatError(error);

      expect(formatted).toContain('test.eligian:10:5');
      expect(formatted).toContain('HTML file not found');
      expect(formatted).toContain('./layout.html');
      expect(formatted).toContain('Hint: Check if the file exists and the path is correct');
    });

    test('CssImportError formats with file path', () => {
      const error: CssImportError = {
        _tag: 'CssImportError',
        filePath: './styles.css',
        absolutePath: '/workspace/styles.css',
        message: 'CSS file not found',
        location: testLocation,
        hint: 'Ensure the CSS file exists',
      };

      const formatted = formatError(error);

      expect(formatted).toContain('test.eligian:10:5');
      expect(formatted).toContain('CSS file not found');
      expect(formatted).toContain('./styles.css');
      expect(formatted).toContain('Hint: Ensure the CSS file exists');
    });

    test('CssParseError formats with CSS file location', () => {
      const error: CssParseError = {
        _tag: 'CssParseError',
        filePath: '/workspace/styles.css',
        message: 'Unclosed block',
        line: 15,
        column: 3,
        hint: 'Add closing brace',
      };

      const formatted = formatError(error);

      expect(formatted).toContain('styles.css:15:3');
      expect(formatted).toContain('Unclosed block');
      expect(formatted).toContain('Hint: Add closing brace');
    });

    test('MediaImportError formats with file path', () => {
      const error: MediaImportError = {
        _tag: 'MediaImportError',
        filePath: './video.mp4',
        absolutePath: '/workspace/video.mp4',
        message: 'Media file not found',
        location: testLocation,
        hint: 'Check the file path',
      };

      const formatted = formatError(error);

      expect(formatted).toContain('test.eligian:10:5');
      expect(formatted).toContain('Media file not found');
      expect(formatted).toContain('./video.mp4');
      expect(formatted).toContain('Hint: Check the file path');
    });
  });

  describe('IOError formatting', () => {
    test('FileNotFoundError formats with file path', () => {
      const error: IOError = {
        _tag: 'FileNotFoundError',
        message: 'File does not exist',
        filePath: './missing.eligian',
        absolutePath: '/workspace/missing.eligian',
      };

      const formatted = formatError(error);

      expect(formatted).toContain('File does not exist');
      expect(formatted).toContain('./missing.eligian');
    });

    test('PermissionError formats with file path', () => {
      const error: IOError = {
        _tag: 'PermissionError',
        message: 'Permission denied',
        filePath: './restricted.eligian',
        absolutePath: '/workspace/restricted.eligian',
      };

      const formatted = formatError(error);

      expect(formatted).toContain('Permission denied');
      expect(formatted).toContain('./restricted.eligian');
    });
  });

  describe('Error without location', () => {
    test('formats OptimizationError without location', () => {
      const error: CompilerError = {
        _tag: 'OptimizationError',
        message: 'Dead code elimination failed',
        pass: 'deadCodeElimination',
        hint: 'This is a compiler bug',
      };

      const formatted = formatError(error);

      expect(formatted).toContain('Dead code elimination failed');
      expect(formatted).toContain('Hint: This is a compiler bug');
      // Should not have file:line:column format (no location)
      expect(formatted).not.toMatch(/^[^:]+:\d+:\d+/); // No file:line:column at start
    });
  });
});

describe('Error Consistency - formatErrorWithSnippet()', () => {
  const source = `timeline "Demo" at 0s {
  at 0s..5s {
    fadeIn("#box")
  }
}`;

  test('includes source code excerpt with error marker', () => {
    const error: ValidationError = {
      _tag: 'ValidationError',
      kind: 'UndefinedReference',
      message: "Action 'fadeIn' not defined",
      location: {
        file: 'test.eligian',
        line: 3,
        column: 5,
        length: 6,
      },
      hint: 'Define the action before using it',
    };

    const formatted = formatErrorWithSnippet(error, source);

    // Should include basic formatted error
    expect(formatted).toContain('test.eligian:3:5');
    expect(formatted).toContain("Action 'fadeIn' not defined");

    // Should include source lines around error
    expect(formatted).toContain('at 0s..5s {');
    expect(formatted).toContain('fadeIn("#box")');

    // Should include error marker (e.g., ^^^^^ under the error)
    expect(formatted).toMatch(/[\^~]{5,}/); // At least 5 marker characters
  });

  test('handles error at start of file', () => {
    const error: ParseError = {
      _tag: 'ParseError',
      message: 'Unexpected token',
      location: {
        file: 'test.eligian',
        line: 1,
        column: 1,
        length: 8,
      },
    };

    const formatted = formatErrorWithSnippet(error, source);

    expect(formatted).toContain('timeline "Demo"');
    expect(formatted).toContain('Unexpected token');
  });

  test('handles error at end of file', () => {
    const error: ParseError = {
      _tag: 'ParseError',
      message: 'Expected closing brace',
      location: {
        file: 'test.eligian',
        line: 5,
        column: 1,
        length: 1,
      },
    };

    const formatted = formatErrorWithSnippet(error, source);

    expect(formatted).toContain('Expected closing brace');
    expect(formatted).toContain('}'); // Last line
  });
});

describe('Error Consistency - formatForVSCode()', () => {
  test('converts ParseError to vscode.Diagnostic', () => {
    const error: ParseError = {
      _tag: 'ParseError',
      message: 'Unexpected token',
      location: {
        file: 'test.eligian',
        line: 10,
        column: 5,
        length: 8,
      },
      expected: '}',
      actual: 'EOF',
    };

    const diagnostic = formatForVSCode(error);

    expect(diagnostic.message).toContain('Unexpected token');
    expect(diagnostic.message).toContain("Expected '}'"); // Quotes added by formatter
    expect(diagnostic.message).toContain("got 'EOF'"); // Quotes added by formatter
    expect(diagnostic.severity).toBe(0); // vscode.DiagnosticSeverity.Error
    expect(diagnostic.range.start.line).toBe(9); // 0-indexed (line 10 → index 9)
    expect(diagnostic.range.start.character).toBe(4); // 0-indexed (column 5 → index 4)
    expect(diagnostic.range.end.character).toBe(12); // start + length (4 + 8)
    expect(diagnostic.code).toBe('ParseError');
  });

  test('converts ValidationError with hint to vscode.Diagnostic', () => {
    const error: ValidationError = {
      _tag: 'ValidationError',
      kind: 'UndefinedReference',
      message: "Action 'fadeIn' not defined",
      location: {
        file: 'test.eligian',
        line: 3,
        column: 5,
        length: 6,
      },
      hint: 'Define the action before using it',
    };

    const diagnostic = formatForVSCode(error);

    expect(diagnostic.message).toContain("Action 'fadeIn' not defined");
    expect(diagnostic.message).toContain('Define the action before using it');
    expect(diagnostic.severity).toBe(0); // Error
    expect(diagnostic.range.start.line).toBe(2); // 0-indexed
    expect(diagnostic.range.start.character).toBe(4); // 0-indexed
    expect(diagnostic.code).toBe('ValidationError');
  });

  test('converts CssParseError to vscode.Diagnostic', () => {
    const error: CssParseError = {
      _tag: 'CssParseError',
      filePath: '/workspace/styles.css',
      message: 'Unclosed block',
      line: 15,
      column: 3,
      hint: 'Add closing brace',
    };

    const diagnostic = formatForVSCode(error);

    expect(diagnostic.message).toContain('Unclosed block');
    expect(diagnostic.message).toContain('Add closing brace');
    expect(diagnostic.severity).toBe(0); // Error
    expect(diagnostic.range.start.line).toBe(14); // 0-indexed
    expect(diagnostic.range.start.character).toBe(2); // 0-indexed
    expect(diagnostic.code).toBe('CssParseError');
  });

  test('handles IOError without location', () => {
    const error: IOError = {
      _tag: 'FileNotFoundError',
      message: 'File does not exist',
      filePath: './missing.eligian',
      absolutePath: '/workspace/missing.eligian',
    };

    const diagnostic = formatForVSCode(error);

    expect(diagnostic.message).toContain('File does not exist');
    expect(diagnostic.severity).toBe(0); // Error
    expect(diagnostic.range.start.line).toBe(0); // Default to start of file
    expect(diagnostic.range.start.character).toBe(0);
    expect(diagnostic.code).toBe('FileNotFoundError');
  });
});
