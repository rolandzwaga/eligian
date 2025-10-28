/**
 * Error Formatters (Feature 018 - US1)
 *
 * This module provides consistent error formatting across all Eligian tools
 * (CLI, VS Code extension, language server). All error types are formatted
 * consistently to improve user experience.
 *
 * @module errors/formatters
 */

import type { AllErrors, CssParseError, SourceLocation } from './index.js';

// ============================================================================
// Basic Error Formatting
// ============================================================================

/**
 * Format an error to a human-readable string.
 *
 * Format: "{file}:{line}:{column} {message}\nHint: {hint}"
 *
 * @param error - Any Eligian error
 * @returns Formatted error string
 *
 * @example
 * const error = createParseError({
 *   message: 'Unexpected token',
 *   location: { file: 'test.eligian', line: 10, column: 5 },
 *   expected: '}',
 *   actual: 'EOF'
 * });
 * console.log(formatError(error));
 * // Output: test.eligian:10:5 Unexpected token (Expected '}', got 'EOF')
 */
export function formatError(error: AllErrors): string {
  const parts: string[] = [];

  // Add location prefix if available
  const locationStr = formatLocation(error);
  if (locationStr) {
    parts.push(locationStr);
  }

  // Add main message
  const messageStr = formatMessage(error);
  parts.push(messageStr);

  // Add hint if available
  const hint = getHint(error);
  if (hint) {
    parts.push(`Hint: ${hint}`);
  }

  return parts.join('\n');
}

/**
 * Format location to string (file:line:column)
 */
function formatLocation(error: AllErrors): string | null {
  // Handle CssParseError (uses filePath, line, column directly)
  if (error._tag === 'CssParseError') {
    const cssError = error as CssParseError;
    const fileName = cssError.filePath.split(/[\\/]/).pop() || cssError.filePath;
    return `${fileName}:${cssError.line}:${cssError.column}`;
  }

  // Handle errors with location property
  if ('location' in error && error.location) {
    const loc = error.location as SourceLocation;
    const fileName = loc.file?.split(/[\\/]/).pop() || loc.file || '';
    if (fileName) {
      return `${fileName}:${loc.line}:${loc.column}`;
    }
    return `${loc.line}:${loc.column}`;
  }

  // Handle I/O errors with filePath
  if ('filePath' in error && error.filePath) {
    return error.filePath as string;
  }

  return null;
}

/**
 * Format error message with contextual details
 */
function formatMessage(error: AllErrors): string {
  const baseMessage = error.message;

  switch (error._tag) {
    case 'ParseError':
      if (error.expected && error.actual) {
        return `${baseMessage} (Expected '${error.expected}', got '${error.actual}')`;
      }
      return baseMessage;

    case 'TypeError':
      if (error.expected && error.actual) {
        return `${baseMessage} (Expected ${error.expected}, got ${error.actual})`;
      }
      return baseMessage;

    case 'HtmlImportError':
      return `${baseMessage} (${error.filePath})`;

    case 'CssImportError':
      return `${baseMessage} (${error.filePath})`;

    case 'MediaImportError':
      return `${baseMessage} (${error.filePath})`;

    default:
      return baseMessage;
  }
}

/**
 * Get hint from error (if available)
 */
function getHint(error: AllErrors): string | undefined {
  if ('hint' in error) {
    return error.hint as string | undefined;
  }
  return undefined;
}

// ============================================================================
// Error Formatting with Source Snippet
// ============================================================================

/**
 * Format an error with source code snippet.
 *
 * Includes the basic formatted error plus source lines around the error
 * with a marker indicating the error position.
 *
 * @param error - Any Eligian error
 * @param source - Source code text
 * @returns Formatted error with source snippet
 *
 * @example
 * const error = createValidationError({
 *   kind: 'UndefinedReference',
 *   message: "Action 'fadeIn' not defined",
 *   location: { file: 'test.eligian', line: 3, column: 5, length: 6 }
 * });
 * console.log(formatErrorWithSnippet(error, sourceCode));
 * // Output:
 * // test.eligian:3:5 Action 'fadeIn' not defined
 * //
 * //   2 |   at 0s..5s {
 * //   3 |     fadeIn("#box")
 * //       ^^^^^^
 * //   4 |   }
 */
export function formatErrorWithSnippet(error: AllErrors, source: string): string {
  const basicFormatted = formatError(error);

  // Get location (prefer location property over direct line/column)
  let line: number;
  let column: number;
  let length: number;

  if (error._tag === 'CssParseError') {
    line = error.line;
    column = error.column;
    length = 1; // Default length for CSS errors
  } else if ('location' in error && error.location) {
    line = error.location.line;
    column = error.location.column;
    length = error.location.length || 1;
  } else {
    // No location - return basic format
    return basicFormatted;
  }

  // Extract source snippet
  const snippet = extractSourceSnippet(source, line, column, length);

  return `${basicFormatted}\n\n${snippet}`;
}

/**
 * Extract source snippet with error marker
 */
function extractSourceSnippet(
  source: string,
  line: number,
  column: number,
  length: number
): string {
  const lines = source.split('\n');

  // Calculate line range (1-indexed line to 0-indexed array)
  const errorLineIdx = line - 1;
  const startLine = Math.max(0, errorLineIdx - 1); // Show 1 line before
  const endLine = Math.min(lines.length - 1, errorLineIdx + 1); // Show 1 line after

  // Format line numbers with padding
  const maxLineNum = endLine + 1;
  const lineNumWidth = String(maxLineNum).length;

  const snippetLines: string[] = [];

  for (let i = startLine; i <= endLine; i++) {
    const lineNum = i + 1;
    const lineContent = lines[i] || '';
    const lineNumStr = String(lineNum).padStart(lineNumWidth, ' ');

    snippetLines.push(`  ${lineNumStr} | ${lineContent}`);

    // Add error marker under the error line
    if (i === errorLineIdx) {
      const markerIndent = ' '.repeat(lineNumWidth + 3 + column - 1); // Line number + " | " + column offset
      const marker = '^'.repeat(Math.max(1, length));
      snippetLines.push(`  ${markerIndent}${marker}`);
    }
  }

  return snippetLines.join('\n');
}

// ============================================================================
// VS Code Diagnostic Formatting
// ============================================================================

/**
 * VS Code Diagnostic-compatible object
 *
 * This interface matches the vscode.Diagnostic structure without requiring
 * the vscode module dependency.
 */
export interface VSCodeDiagnostic {
  message: string;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  severity: number; // 0 = Error, 1 = Warning, 2 = Info, 3 = Hint
  code?: string | number;
  source?: string;
}

/**
 * Format an error to VS Code Diagnostic format.
 *
 * Converts Eligian errors to VS Code's diagnostic format for display in
 * the Problems panel and inline error decorations.
 *
 * @param error - Any Eligian error
 * @returns VS Code-compatible diagnostic object
 *
 * @example
 * const error = createValidationError({
 *   kind: 'UndefinedReference',
 *   message: "Action 'fadeIn' not defined",
 *   location: { file: 'test.eligian', line: 10, column: 5, length: 6 },
 *   hint: 'Define the action before using it'
 * });
 * const diagnostic = formatForVSCode(error);
 * // diagnostic.message = "Action 'fadeIn' not defined\nDefine the action before using it"
 * // diagnostic.range.start = { line: 9, character: 4 } (0-indexed)
 * // diagnostic.severity = 0 (Error)
 * // diagnostic.code = 'ValidationError'
 */
export function formatForVSCode(error: AllErrors): VSCodeDiagnostic {
  // Get location (0-indexed for VS Code)
  const range = formatRangeForVSCode(error);

  // Build message with hint if available
  let message = formatMessage(error);
  const hint = getHint(error);
  if (hint) {
    message = `${message}\n${hint}`;
  }

  return {
    message,
    range,
    severity: 0, // Always Error for now (could add Warning/Info in future)
    code: error._tag,
    source: 'eligian',
  };
}

/**
 * Format range for VS Code (converts 1-indexed to 0-indexed)
 */
function formatRangeForVSCode(error: AllErrors): {
  start: { line: number; character: number };
  end: { line: number; character: number };
} {
  // Handle CssParseError
  if (error._tag === 'CssParseError') {
    const line = error.line - 1; // Convert to 0-indexed
    const column = error.column - 1; // Convert to 0-indexed
    return {
      start: { line, character: column },
      end: { line, character: column + 1 }, // Default 1 character
    };
  }

  // Handle errors with location
  if ('location' in error && error.location) {
    const loc = error.location as SourceLocation;
    const line = loc.line - 1; // Convert to 0-indexed
    const column = loc.column - 1; // Convert to 0-indexed
    const length = loc.length || 1;

    return {
      start: { line, character: column },
      end: { line, character: column + length },
    };
  }

  // Default to start of file
  return {
    start: { line: 0, character: 0 },
    end: { line: 0, character: 0 },
  };
}
