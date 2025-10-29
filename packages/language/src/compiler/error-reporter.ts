/**
 * Error Reporter
 *
 * Formats compilation errors for display in CLI and VS Code.
 * Provides user-friendly error messages with source locations and helpful hints.
 *
 * @module error-reporter
 */

import type {
  CompilerError,
  FormattedError,
  ParseError,
  TransformError,
  TypeError,
  ValidationError,
} from '../errors/index.js';
import { formatSourceLocation, type SourceLocation } from './types/common.js';

/**
 * Format a parse error with helpful context.
 *
 * Parse errors occur when the DSL syntax is invalid.
 *
 * @param error - Parse error to format
 * @param sourceCode - Optional source code for context snippet
 * @returns Formatted error message
 *
 * @example
 * formatParseError(error, sourceCode)
 * // "Parse error at line 5, column 10:
 * //  Expected 'timeline' but found 'timline'"
 */
export function formatParseError(error: ParseError, sourceCode?: string): FormattedError {
  const { message, location } = error;

  let formatted = `Parse Error: ${message}`;

  if (location) {
    formatted += `\n  at ${formatSourceLocation(location)}`;
  }

  const codeSnippet = sourceCode ? extractCodeSnippet(sourceCode, location) : undefined;
  const hint = generateParseHint(message);

  return {
    severity: 'error',
    message: formatted,
    location,
    hint,
    codeSnippet,
  };
}

/**
 * Format a validation error with helpful context.
 *
 * Validation errors occur when the DSL is syntactically correct
 * but semantically invalid (e.g., duplicate IDs, invalid time ranges).
 *
 * @param error - Validation error to format
 * @param sourceCode - Optional source code for context snippet
 * @returns Formatted error message
 */
export function formatValidationError(error: ValidationError, sourceCode?: string): FormattedError {
  const { message, location } = error;

  let formatted = `Validation Error: ${message}`;

  if (location) {
    formatted += `\n  at ${formatSourceLocation(location)}`;
  }

  const codeSnippet = sourceCode ? extractCodeSnippet(sourceCode, location) : undefined;
  const hint = generateValidationHint(message);

  return {
    severity: 'error',
    message: formatted,
    location,
    hint,
    codeSnippet,
  };
}

/**
 * Format a type error with helpful context.
 *
 * Type errors occur when types don't match (e.g., string where number expected).
 *
 * @param error - Type error to format
 * @param sourceCode - Optional source code for context snippet
 * @returns Formatted error message
 */
export function formatTypeError(error: TypeError, sourceCode?: string): FormattedError {
  const { message, location } = error;

  let formatted = `Type Error: ${message}`;

  if (location) {
    formatted += `\n  at ${formatSourceLocation(location)}`;
  }

  const codeSnippet = sourceCode ? extractCodeSnippet(sourceCode, location) : undefined;
  const hint = generateTypeHint(message);

  return {
    severity: 'error',
    message: formatted,
    location,
    hint,
    codeSnippet,
  };
}

/**
 * Format a transform error with helpful context.
 *
 * Transform errors occur during AST→IR transformation.
 *
 * @param error - Transform error to format
 * @param sourceCode - Optional source code for context snippet
 * @returns Formatted error message
 */
export function formatTransformError(error: TransformError, sourceCode?: string): FormattedError {
  const { message, location, kind } = error;

  let formatted = `Transform Error (${kind}): ${message}`;

  if (location) {
    formatted += `\n  at ${formatSourceLocation(location)}`;
  }

  const codeSnippet = sourceCode ? extractCodeSnippet(sourceCode, location) : undefined;
  const hint = generateTransformHint(kind, message);

  return {
    severity: 'error',
    message: formatted,
    location,
    hint,
    codeSnippet,
  };
}

/**
 * Format any compilation error (pattern match on error type).
 *
 * @param error - Compilation error to format
 * @param sourceCode - Optional source code for context snippet
 * @returns Formatted error message
 *
 * @example
 * const formatted = formatError(error, sourceCode);
 * console.error(formatted.message);
 */
export function formatError(error: CompilerError, sourceCode?: string): FormattedError {
  switch (error._tag) {
    case 'ParseError':
      return formatParseError(error, sourceCode);

    case 'ValidationError':
      return formatValidationError(error, sourceCode);

    case 'TypeError':
      return formatTypeError(error, sourceCode);

    case 'TransformError':
      return formatTransformError(error, sourceCode);

    case 'EmitError':
    case 'OptimizationError':
      // Emit and optimization errors don't have location information
      return {
        severity: 'error',
        message: `Compilation Error: ${error.message}`,
        location: { line: 1, column: 1, length: 0 },
        hint: error.hint,
        codeSnippet: undefined,
      };

    default:
      // Fallback for unknown error types
      return {
        severity: 'error',
        message: `Unknown Error: ${(error as any).message || 'An unknown error occurred'}`,
        location: { line: 1, column: 1, length: 0 },
        hint: undefined,
        codeSnippet: undefined,
      };
  }
}

/**
 * Format multiple compilation errors.
 *
 * @param errors - Array of compilation errors to format
 * @param sourceCode - Optional source code for context snippets
 * @returns Array of formatted error messages
 */
export function formatErrors(errors: CompilerError[], sourceCode?: string): FormattedError[] {
  return errors.map(error => formatError(error, sourceCode));
}

/**
 * Extract a code snippet showing the error location.
 *
 * Shows 2 lines before and after the error for context.
 *
 * @param sourceCode - Full source code
 * @param location - Error location
 * @returns Formatted code snippet with error indicator, or undefined if not possible
 */
function extractCodeSnippet(sourceCode: string, location: SourceLocation): string | undefined {
  if (location.line === undefined) {
    return undefined;
  }

  const lines = sourceCode.split('\n');
  const errorLine = location.line - 1; // Convert to 0-based

  if (errorLine < 0 || errorLine >= lines.length) {
    return undefined;
  }

  const contextBefore = 2;
  const contextAfter = 2;

  const startLine = Math.max(0, errorLine - contextBefore);
  const endLine = Math.min(lines.length - 1, errorLine + contextAfter);

  let snippet = '';

  // Build snippet with line numbers
  for (let i = startLine; i <= endLine; i++) {
    const lineNum = i + 1; // Convert back to 1-based
    const isErrorLine = i === errorLine;
    const prefix = isErrorLine ? '> ' : '  ';
    snippet += `${prefix}${lineNum} | ${lines[i]}\n`;

    // Add error indicator on the error line
    if (isErrorLine && location.column !== undefined) {
      const padding = ' '.repeat(prefix.length + String(lineNum).length + 3 + location.column);
      const underline = '^'.repeat(Math.max(1, location.length || 1));
      snippet += `${padding}${underline}\n`;
    }
  }

  return snippet.trimEnd();
}

/**
 * Generate a helpful hint for parse errors.
 *
 * @param message - Error message
 * @returns Helpful hint or undefined
 */
function generateParseHint(message: string): string | undefined {
  if (message.includes('timeline')) {
    return 'Did you forget to define a timeline? Every program needs exactly one timeline.';
  }

  if (message.includes('at') && message.includes('..')) {
    return 'Time ranges use the format: at <start>..<end> (e.g., at 0s..5s)';
  }

  if (message.includes('[') || message.includes(']')) {
    return 'Actions are defined inside square brackets: [ operation1() operation2() ]';
  }

  return undefined;
}

/**
 * Generate a helpful hint for validation errors.
 *
 * @param message - Error message
 * @returns Helpful hint or undefined
 */
function generateValidationHint(message: string): string | undefined {
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('duplicate')) {
    return 'Each action must have a unique name within the program.';
  }

  if (lowerMessage.includes('time range')) {
    return 'End time must be greater than start time (e.g., at 0s..5s).';
  }

  if (lowerMessage.includes('negative')) {
    return 'Time values must be non-negative numbers.';
  }

  if (lowerMessage.includes('source')) {
    return 'Video and audio timelines require a source URL.';
  }

  return undefined;
}

/**
 * Generate a helpful hint for type errors.
 *
 * @param message - Error message
 * @returns Helpful hint or undefined
 */
function generateTypeHint(message: string): string | undefined {
  if (message.includes('number') && message.includes('string')) {
    return 'Time values should be numbers (e.g., 5s, 100ms) not strings.';
  }

  if (message.includes('boolean')) {
    return 'Boolean values should be true or false (without quotes).';
  }

  return undefined;
}

/**
 * Generate a helpful hint for transform errors.
 *
 * @param kind - Transform error kind
 * @param message - Error message
 * @returns Helpful hint or undefined
 */
function generateTransformHint(kind: string, message: string): string | undefined {
  const lowerMessage = message.toLowerCase();

  if (kind === 'ValidationError') {
    if (lowerMessage.includes('unknown operation')) {
      return 'Check the operation name for typos. Use autocomplete in the IDE to see available operations.';
    }

    if (lowerMessage.includes('parameter')) {
      return 'Check the operation documentation for the correct number and types of parameters.';
    }

    if (lowerMessage.includes('dependency') || lowerMessage.includes('dependencies')) {
      return 'Some operations require previous operations to set up dependency (e.g., addClass needs selectElement first).';
    }
  }

  if (kind === 'UnknownNode') {
    return 'This is likely a bug in the compiler. Please report this issue.';
  }

  return undefined;
}
