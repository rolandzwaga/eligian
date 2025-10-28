/**
 * Compilation Error Consistency Tests (Feature 018 - US1)
 *
 * Tests that CompilationService converts errors to consistent vscode.Diagnostic format
 * using formatForVSCode() from the formatters module.
 *
 * This test file follows Test-First Development (TFD) and was written BEFORE implementation.
 *
 * Test Strategy:
 * - Test that CompilationService uses formatForVSCode() for error conversion
 * - Test that converted diagnostics match expected format
 * - Test that all error types are handled consistently
 */

// Feature 018 (US1): Import from unified error system
import {
  createParseError,
  createTypeError,
  createValidationError,
  formatForVSCode,
  type ParseError,
  type SourceLocation,
  type ValidationError,
} from '@eligian/language/errors';
import { describe, expect, test } from 'vitest';

describe('CompilationService Error Conversion Consistency', () => {
  const testLocation: SourceLocation = {
    file: 'test.eligian',
    line: 10,
    column: 5,
    length: 8,
  };

  test('formatForVSCode() produces vscode.Diagnostic-compatible object', () => {
    const error: ParseError = createParseError({
      message: 'Unexpected token',
      location: testLocation,
      expected: '}',
      actual: 'EOF',
    });

    const diagnostic = formatForVSCode(error);

    // Should have required vscode.Diagnostic properties
    expect(diagnostic).toHaveProperty('message');
    expect(diagnostic).toHaveProperty('range');
    expect(diagnostic).toHaveProperty('severity');

    // Range should have start and end positions
    expect(diagnostic.range).toHaveProperty('start');
    expect(diagnostic.range).toHaveProperty('end');
    expect(diagnostic.range.start).toHaveProperty('line');
    expect(diagnostic.range.start).toHaveProperty('character');
    expect(diagnostic.range.end).toHaveProperty('line');
    expect(diagnostic.range.end).toHaveProperty('character');
  });

  test('formatForVSCode() converts line/column to 0-indexed', () => {
    const error: ValidationError = createValidationError({
      kind: 'UndefinedReference',
      message: "Action 'fadeIn' not defined",
      location: {
        file: 'test.eligian',
        line: 5, // 1-indexed in error
        column: 10, // 1-indexed in error
        length: 6,
      },
    });

    const diagnostic = formatForVSCode(error);

    // VS Code uses 0-indexed positions
    expect(diagnostic.range.start.line).toBe(4); // 5 - 1
    expect(diagnostic.range.start.character).toBe(9); // 10 - 1
    expect(diagnostic.range.end.line).toBe(4); // Same line
    expect(diagnostic.range.end.character).toBe(15); // 9 + 6
  });

  test('formatForVSCode() includes hint in message', () => {
    const error: ValidationError = createValidationError({
      kind: 'UndefinedReference',
      message: "Action 'fadeIn' not defined",
      location: testLocation,
      hint: 'Define the action before using it',
    });

    const diagnostic = formatForVSCode(error);

    expect(diagnostic.message).toContain("Action 'fadeIn' not defined");
    expect(diagnostic.message).toContain('Define the action before using it');
  });

  test('formatForVSCode() sets severity to Error', () => {
    const error = createParseError({
      message: 'Syntax error',
      location: testLocation,
    });

    const diagnostic = formatForVSCode(error);

    // vscode.DiagnosticSeverity.Error = 0
    expect(diagnostic.severity).toBe(0);
  });

  test('formatForVSCode() sets code to error _tag', () => {
    const parseError = createParseError({
      message: 'Parse error',
      location: testLocation,
    });

    const validationError = createValidationError({
      kind: 'UndefinedReference',
      message: 'Validation error',
      location: testLocation,
    });

    const typeError = createTypeError({
      message: 'Type error',
      location: testLocation,
      expected: 'string',
      actual: 'number',
    });

    expect(formatForVSCode(parseError).code).toBe('ParseError');
    expect(formatForVSCode(validationError).code).toBe('ValidationError');
    expect(formatForVSCode(typeError).code).toBe('TypeError');
  });

  test('formatForVSCode() handles error without location', () => {
    const error = {
      _tag: 'OptimizationError' as const,
      message: 'Optimization failed',
      pass: 'deadCodeElimination',
    };

    const diagnostic = formatForVSCode(error as any);

    // Should default to start of file
    expect(diagnostic.range.start.line).toBe(0);
    expect(diagnostic.range.start.character).toBe(0);
    expect(diagnostic.range.end.line).toBe(0);
    expect(diagnostic.range.end.character).toBe(0);
  });

  test('formatForVSCode() handles error without length', () => {
    const error = createValidationError({
      kind: 'UndefinedReference',
      message: "Action 'fadeIn' not defined",
      location: {
        file: 'test.eligian',
        line: 10,
        column: 5,
        // No length
      },
    });

    const diagnostic = formatForVSCode(error);

    // Should use default length (1 character)
    expect(diagnostic.range.start.line).toBe(9);
    expect(diagnostic.range.start.character).toBe(4);
    expect(diagnostic.range.end.line).toBe(9);
    expect(diagnostic.range.end.character).toBe(5); // start + 1
  });
});

describe('CompilationService Integration (Expected Usage)', () => {
  /**
   * These tests document how CompilationService SHOULD use formatForVSCode()
   * after the refactoring in T016.
   *
   * This serves as a specification for the refactoring task.
   */

  test('CompilationService should use formatForVSCode() for error conversion', () => {
    // This is a documentation test - shows expected usage pattern
    const error = createValidationError({
      kind: 'UndefinedReference',
      message: "Action 'fadeIn' not defined",
      location: {
        file: 'test.eligian',
        line: 10,
        column: 5,
        length: 6,
      },
      hint: 'Define the action before using it',
    });

    // Expected usage in CompilationService:
    // const diagnostic = formatForVSCode(error);

    const diagnostic = formatForVSCode(error);

    // Verify it produces the expected structure
    expect(diagnostic.message).toContain("Action 'fadeIn' not defined");
    expect(diagnostic.message).toContain('Define the action before using it');
    expect(diagnostic.range.start.line).toBe(9); // 0-indexed
    expect(diagnostic.range.start.character).toBe(4); // 0-indexed
    expect(diagnostic.severity).toBe(0); // Error
    expect(diagnostic.code).toBe('ValidationError');
  });

  test('formatForVSCode() output matches CompilationService.CompilationError structure', () => {
    // CompilationService expects errors with these properties:
    // - message: string
    // - line?: number (1-indexed)
    // - column?: number (1-indexed)
    // - length?: number
    // - code?: string
    // - severity: 'error' | 'warning'

    const error = createParseError({
      message: 'Unexpected token',
      location: {
        file: 'test.eligian',
        line: 5,
        column: 3,
        length: 4,
      },
      expected: '}',
      actual: 'EOF',
    });

    const diagnostic = formatForVSCode(error);

    // Should contain all necessary information
    expect(diagnostic.message).toBeTruthy();
    expect(diagnostic.range.start.line).toBeDefined();
    expect(diagnostic.range.start.character).toBeDefined();
    expect(diagnostic.severity).toBeDefined();
    expect(diagnostic.code).toBeDefined();
  });
});
