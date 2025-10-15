/**
 * Common types shared across the compiler
 *
 * @module common
 */

/**
 * Source location - for error reporting and diagnostics
 *
 * Tracks the position of AST nodes in the source file to provide
 * helpful error messages with line/column information.
 */
export type SourceLocation = {
  readonly file?: string;
  readonly line: number;
  readonly column: number;
  readonly length?: number;
};

/**
 * JSON-compatible value type
 *
 * Used for configuration options, metadata, and operation data
 * that will be serialized to JSON.
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | { readonly [key: string]: JsonValue }
  | ReadonlyArray<JsonValue>;

export type JsonObject = { readonly [key: string]: JsonValue };
export type JsonArray = ReadonlyArray<JsonValue>;

/**
 * Create a source location from line and column
 */
export const createSourceLocation = (
  line: number,
  column: number,
  file?: string,
  length?: number
): SourceLocation => ({
  file,
  line,
  column,
  length,
});

/**
 * Format source location as a string for error messages
 */
export const formatSourceLocation = (loc: SourceLocation): string => {
  const file = loc.file ? `${loc.file}:` : '';
  return `${file}${loc.line}:${loc.column}`;
};
