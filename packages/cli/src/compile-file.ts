/**
 * Eligian Compiler - Library API
 *
 * Pure compilation function for programmatic use.
 * Does not call process.exit() or write to console.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  type CompilerError,
  compile,
  formatErrors,
  hasImports,
  type IEngineConfiguration,
  loadProgramAssets,
  type Program,
  parseSource,
} from '@eligian/language';
import { Effect } from 'effect';

/**
 * Options for compiling an Eligian file
 */
export interface CompileOptions {
  /** Minify JSON output (no whitespace) */
  minify?: boolean;
  /** Enable optimization passes (default: true) */
  optimize?: boolean;
}

/**
 * Result of a successful compilation
 */
export interface CompileResult {
  /** The compiled Eligius configuration */
  config: IEngineConfiguration;
  /** JSON string representation */
  json: string;
  /** Number of assets validated (if any imports) */
  assetCount: number;
}

/**
 * Base class for compilation errors
 */
export class CompileError extends Error {
  constructor(
    message: string,
    public readonly phase: 'parse' | 'asset' | 'compile' | 'io',
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'CompileError';
  }
}

/**
 * Error thrown when parsing fails
 */
export class ParseError extends CompileError {
  constructor(
    message: string,
    public readonly formatted: Array<{
      message: string;
      codeSnippet?: string;
      hint?: string;
    }>
  ) {
    super(message, 'parse', formatted);
    this.name = 'ParseError';
  }
}

/**
 * Error thrown when asset validation fails
 */
export class AssetError extends CompileError {
  constructor(
    message: string,
    public readonly errors: Array<{
      message: string;
      filePath: string;
      absolutePath: string;
      sourceLocation: { file: string; line: number; column: number };
      hint?: string;
      details?: string;
    }>
  ) {
    super(message, 'asset', errors);
    this.name = 'AssetError';
  }
}

/**
 * Error thrown when compilation fails
 */
export class CompilationError extends CompileError {
  constructor(
    message: string,
    public readonly formatted: Array<{
      message: string;
      codeSnippet?: string;
      hint?: string;
    }>
  ) {
    super(message, 'compile', formatted);
    this.name = 'CompilationError';
  }
}

/**
 * Error thrown for I/O operations (file not found, permission denied, etc.)
 */
export class IOError extends CompileError {
  constructor(message: string, cause?: unknown) {
    super(message, 'io', cause);
    this.name = 'IOError';
  }
}

/**
 * Extract the actual error from Effect's FiberFailure wrapper
 */
function extractEffectError(error: unknown): unknown {
  if (error && typeof error === 'object') {
    try {
      const errorJson = JSON.stringify(error);
      const parsed = JSON.parse(errorJson);
      const innerError = parsed.cause?.defect || parsed.cause?.failure;
      if (innerError?._tag) {
        return innerError;
      }
    } catch {
      // If parsing fails, use original error
    }
  }
  return error;
}

/**
 * Compile an Eligian file to Eligius JSON configuration.
 *
 * This is a pure library function that:
 * - Does NOT call process.exit()
 * - Does NOT write to console
 * - Returns the result or throws typed errors
 *
 * @param inputPath - Path to the .eligian file
 * @param options - Compilation options
 * @returns The compiled configuration and JSON string
 * @throws {ParseError} If the source cannot be parsed
 * @throws {AssetError} If asset validation fails
 * @throws {CompilationError} If compilation fails
 * @throws {IOError} If file cannot be read
 *
 * @example
 * ```typescript
 * import { compileFile } from '@eligian/cli';
 *
 * try {
 *   const result = await compileFile('my-timeline.eligian');
 *   console.log(result.json);
 * } catch (error) {
 *   if (error instanceof ParseError) {
 *     console.error('Parse failed:', error.formatted);
 *   }
 * }
 * ```
 */
export async function compileFile(
  inputPath: string,
  options: CompileOptions = {}
): Promise<CompileResult> {
  const { minify = false, optimize = true } = options;

  // Read source file
  let sourceCode: string;
  try {
    sourceCode = await fs.readFile(inputPath, 'utf-8');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new IOError(`Failed to read file '${inputPath}': ${message}`, error);
  }

  // Get absolute path for URI resolution
  const absoluteInputPath = path.resolve(inputPath);

  // Parse source to AST
  let program: Program;
  try {
    const parseEffect = parseSource(sourceCode, absoluteInputPath);
    program = await Effect.runPromise(parseEffect);
  } catch (error) {
    const actualError = extractEffectError(error) as CompilerError;
    const formatted = formatErrors([actualError], sourceCode);
    throw new ParseError(
      'Failed to parse Eligian source',
      formatted.map(err => ({
        message: err.message,
        codeSnippet: err.codeSnippet,
        hint: err.hint,
      }))
    );
  }

  // Validate and load assets if imports exist
  let assetCount = 0;
  if (hasImports(program)) {
    const assetResult = loadProgramAssets(program, absoluteInputPath);

    if (assetResult.errors.length > 0) {
      throw new AssetError(
        `Asset validation failed with ${assetResult.errors.length} error(s)`,
        assetResult.errors.map(err => ({
          message: err.message,
          filePath: err.filePath,
          absolutePath: err.absolutePath,
          sourceLocation: err.sourceLocation,
          hint: err.hint,
          details: err.details,
        }))
      );
    }

    assetCount =
      (assetResult.layoutTemplate ? 1 : 0) +
      assetResult.cssFiles.length +
      Object.keys(assetResult.importMap).length;
  }

  // Run compiler pipeline
  let config: IEngineConfiguration;
  try {
    const compileEffect = compile(sourceCode, {
      optimize,
      minify,
      sourceUri: absoluteInputPath,
    });
    config = await Effect.runPromise(compileEffect);
  } catch (error) {
    const formatted = formatErrors([error as CompilerError], sourceCode);
    throw new CompilationError(
      'Compilation failed',
      formatted.map(err => ({
        message: err.message,
        codeSnippet: err.codeSnippet,
        hint: err.hint,
      }))
    );
  }

  // Generate output JSON
  const json = minify ? JSON.stringify(config) : JSON.stringify(config, null, 2);

  return { config, json, assetCount };
}
