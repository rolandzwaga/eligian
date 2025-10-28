/**
 * Base types for error reporting in Eligian DSL
 *
 * This module defines foundational types used across all error hierarchies,
 * particularly for tracking source code locations.
 *
 * @module errors/base
 */

/**
 * Source code location for error reporting
 *
 * Tracks the position of AST nodes or text in source files to provide
 * helpful error messages with line/column information.
 */
export type SourceLocation = {
  readonly file?: string; // Optional - file path or URI
  readonly line: number; // Line number (1-indexed)
  readonly column: number; // Column number (1-indexed)
  readonly length?: number; // Optional - length of the error span
};
