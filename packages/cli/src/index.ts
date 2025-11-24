/**
 * Eligian CLI - Library API
 *
 * @packageDocumentation
 *
 * @example
 * ```typescript
 * import { compileFile } from '@eligian/cli';
 *
 * // Simple compilation
 * const result = await compileFile('my-timeline.eligian');
 * console.log(result.json);
 *
 * // With options
 * const result = await compileFile('my-timeline.eligian', {
 *   minify: true,
 *   optimize: true,
 * });
 * ```
 *
 * For more control over the compilation pipeline (custom error handling,
 * streaming, incremental compilation, AST inspection), use the
 * `@eligian/language` package directly.
 */

// Types
export type { CompileOptions, CompileResult } from './compile-file.js';
// Main compilation function
// Error classes for catch blocks
export {
  AssetError,
  CompilationError,
  CompileError,
  compileFile,
  IOError,
  ParseError,
} from './compile-file.js';
