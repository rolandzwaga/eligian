/**
 * Pipeline: Main Compilation Orchestration
 *
 * This module wires together all compilation stages into a complete
 * DSL → Eligius JSON pipeline using Effect composition.
 *
 * Pipeline stages:
 * 1. Parse: DSL source → Langium AST
 * 2. Transform: AST → Eligius IR
 * 3. Type Check: Validate IR constraints
 * 4. Optimize: Apply optimization passes
 * 5. Emit: IR → Eligius JSON configuration
 *
 * Design:
 * - Pure functional pipeline using Effect.flatMap composition
 * - Typed errors at each stage
 * - Configurable via CompileOptions
 * - No side effects (parsing/file I/O handled externally)
 *
 * This file is the composition root: the parse / library-loading / service /
 * document-error concerns live in the sibling `pipeline/` directory and are
 * re-exported here so existing importers (and the `compiler/index.ts` barrel)
 * are unchanged.
 */

import { Effect } from 'effect';
import type { IEngineConfiguration } from 'eligius';
import {
  type AssetLoadingResult,
  loadProgramAssets,
} from '../asset-loading/compiler-integration.js';
import type {
  AssetError,
  EmitError,
  ParseError,
  TransformError,
  TypeError,
  ValidationError,
} from '../errors/index.js';
import { isLibrary, type Program } from '../generated/ast.js';
import { getImports } from '../utils/program-helpers.js';
import { transformAST } from './ast-transformer.js';
import { emitJSON } from './emitter.js';
import { optimize } from './optimizer.js';
import { type DocumentWarning, extractDocumentWarnings } from './pipeline/document-errors.js';
import { parseSource, validateAST } from './pipeline/parser.js';
import { getSourceLocation } from './transformers/source-location.js';
import { typeCheck } from './type-checker.js';
import type { SourceLocation } from './types/common.js';
import type { EligiusIR } from './types/eligius-ir.js';

export type { DocumentWarning } from './pipeline/document-errors.js';
export {
  extractLibraryImports,
  extractLibraryImportsFromLibrary,
  loadLibraryFile,
  parseLibraryDocument,
  resolveLibraryPath,
} from './pipeline/library-loader.js';
export { parseSource, validateAST } from './pipeline/parser.js';
// Re-export the decomposed pipeline concerns so existing importers and the
// `compiler/index.ts` barrel keep their public surface unchanged.
export { getOrCreateServices } from './pipeline/services.js';

/**
 * Compilation options
 */
interface CompileOptions {
  /**
   * Enable optimization passes (default: true)
   */
  optimize?: boolean;

  /**
   * Minify output JSON (default: false)
   */
  minify?: boolean;

  /**
   * Include source maps in output (default: false)
   * Note: Not yet implemented
   */
  sourcemap?: boolean;

  /**
   * Source file URI/path for resolving relative asset imports
   * Required for asset validation to resolve relative paths
   */
  sourceUri?: string;

  /**
   * Target Eligius version (default: '1.x')
   * Note: Currently only 1.x is supported
   */
  target?: string;
}

/**
 * Non-fatal diagnostics (warning / info / hint) of a program returned by
 * {@link parseSource}. Only Error-severity diagnostics abort compilation; these
 * are returned so callers (e.g. the CLI) can report them without failing.
 */
export const getProgramWarnings = (program: Program): ReadonlyArray<DocumentWarning> =>
  extractDocumentWarnings(program.$document);

/**
 * Turn the asset-loading errors of a program into the (single) ValidationError
 * compile() fails with: the first error's message, hint and import location,
 * plus a count of any further asset errors.
 *
 * Every asset error is located at the import statement whose path it names (the
 * asset validation service only fills in a placeholder 0:0 location, and a
 * CssParseError's line/column are in the CSS file). The location carries no
 * `file`: imports are always in the main program, and main-program locations
 * carry no `file` (see getSourceLocation), so the error reporter renders the
 * snippet against the main source.
 */
const assetErrorToValidationError = (
  errors: ReadonlyArray<AssetError>,
  program: Program
): ValidationError => {
  const [first] = errors;
  const more = errors.length - 1;
  const suffix = more > 0 ? ` (and ${more} more asset error${more === 1 ? '' : 's'})` : '';

  const baseMessage =
    first._tag === 'CssParseError'
      ? `CSS file '${first.filePath}' has syntax errors (line ${first.line}, column ${first.column}): ${first.message}`
      : first.message;

  const importStmt = getImports(program).find(imp => imp.path === first.filePath);
  let location: SourceLocation;
  if (importStmt) {
    const { line, column, length } = getSourceLocation(importStmt);
    location = { line, column, length };
  } else if (first._tag !== 'CssParseError' && first.location.line >= 1) {
    location = {
      line: first.location.line,
      column: Math.max(1, first.location.column),
      length: first.location.length ?? 0,
    };
  } else {
    location = { line: 1, column: 1, length: 0 };
  }

  return {
    _tag: 'ValidationError' as const,
    kind: 'SemanticValidation' as const,
    message: `${baseMessage}${suffix}`,
    location,
    ...(first.hint ? { hint: first.hint } : {}),
  };
};

/**
 * Union of all possible compilation errors
 */
export type CompileError = ParseError | ValidationError | TransformError | TypeError | EmitError;

/**
 * T078: Main compilation pipeline
 *
 * Composes all stages into a complete DSL → JSON pipeline:
 * source → parse → validate → transform → typecheck → optimize → emit → JSON
 */
export const compile = (
  source: string,
  options: CompileOptions = {}
): Effect.Effect<IEngineConfiguration, CompileError> =>
  Effect.gen(function* () {
    // T076: Parse source to AST
    const program = yield* parseSource(source, options.sourceUri);

    // Check if user tried to compile a library file directly
    if (isLibrary(program as any)) {
      return yield* Effect.fail({
        _tag: 'ParseError' as const,
        message: 'Cannot compile library files directly',
        location: { line: 1, column: 1, length: 0 },
        hint: 'Library files must be imported by a main program. Create a .eligian file with an "import" statement to use this library.',
      });
    }

    // T077: Validate AST (no-op, done during parsing - libraries already loaded in parseSource)
    const validatedProgram = yield* validateAST(program);

    // Load assets (layout HTML, CSS files, media) if sourceUri is provided
    let assets: AssetLoadingResult | undefined;
    if (options.sourceUri) {
      assets = loadProgramAssets(validatedProgram, options.sourceUri);
      // Never compile with assets silently dropped (missing layout, invalid
      // locales, broken HTML/CSS, ...). The IDE validator reports these too, but
      // compile() must not depend on it having run or on it matching each error
      // to an import node.
      if (assets.errors.length > 0) {
        return yield* Effect.fail(assetErrorToValidationError(assets.errors, validatedProgram));
      }
    }

    // T050-T059: Transform AST to IR
    const ir = yield* transformAST(validatedProgram, assets);

    // T060-T064: Type check IR
    const typedIR = yield* typeCheck(ir);

    // T065-T069: Optimize IR (if enabled)
    const optimizedIR = options.optimize !== false ? yield* optimize(typedIR) : typedIR;

    // T070-T075: Emit JSON configuration
    const config = yield* emitJSON(optimizedIR);

    return config;
  });

/**
 * T080: Compile from string
 *
 * Alias for compile() for API consistency.
 */
export const compileString = (
  source: string,
  options: CompileOptions = {}
): Effect.Effect<IEngineConfiguration, CompileError> => compile(source, options);

/**
 * T081: Compile to JSON string
 *
 * Helper that compiles and serializes to JSON string.
 */
export const compileToJSON = (
  source: string,
  options: CompileOptions = {}
): Effect.Effect<string, CompileError> =>
  Effect.gen(function* () {
    const config = yield* compile(source, options);

    // Serialize to JSON (minified or pretty)
    const json = options.minify ? JSON.stringify(config) : JSON.stringify(config, null, 2);

    return json;
  });

/**
 * T082: Get intermediate IR (for debugging/tooling)
 *
 * Runs pipeline up to optimization and returns IR instead of JSON.
 * Useful for compiler debugging and IDE tooling.
 */
export const compileToIR = (
  source: string,
  options: CompileOptions = {}
): Effect.Effect<EligiusIR, ParseError | ValidationError | TransformError | TypeError> =>
  Effect.gen(function* () {
    // Parse source to AST
    const program = yield* parseSource(source);

    // Validate AST
    const validatedProgram = yield* validateAST(program);

    // Transform AST to IR
    const ir = yield* transformAST(validatedProgram);

    // Type check IR
    const typedIR = yield* typeCheck(ir);

    // Optimize IR (if enabled)
    const optimizedIR = options.optimize !== false ? yield* optimize(typedIR) : typedIR;

    return optimizedIR;
  });

/**
 * T083: Version information
 *
 * Returns compiler version and supported Eligius versions.
 */
export const getCompilerVersion = (): { compiler: string; eligius: string } => ({
  compiler: '0.0.1',
  eligius: '1.1.4',
});

/**
 * T084: Compile with default options
 *
 * Convenience export for common use case.
 */
export const compileWithDefaults = (source: string) =>
  compile(source, { optimize: true, minify: false });

/**
 * T085: Export all pipeline functions
 *
 * Re-export all compilation functions for external use.
 */
export { emitJSON, optimize, transformAST, typeCheck };
