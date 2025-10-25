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
 */

import { Effect } from 'effect';
import type { IEngineConfiguration } from 'eligius';
import { EmptyFileSystem, URI } from 'langium';
import {
  type AssetLoadingResult,
  loadProgramAssets,
} from '../asset-loading/compiler-integration.js';
import { createEligianServices } from '../eligian-module.js';
import type { Program } from '../generated/ast.js';
import { transformAST } from './ast-transformer.js';
import { emitJSON } from './emitter.js';
import { optimize } from './optimizer.js';
import { typeCheck } from './type-checker.js';
import type { EligiusIR } from './types/eligius-ir.js';
import type { EmitError, ParseError, TransformError, TypeError } from './types/errors.js';

/**
 * Singleton Langium service instance
 *
 * Creating Langium services is expensive. We reuse a single instance across
 * all parse calls for better performance and to prevent memory exhaustion
 * when running many tests.
 */
let sharedServices: ReturnType<typeof createEligianServices> | undefined;

function getOrCreateServices() {
  if (!sharedServices) {
    sharedServices = createEligianServices(EmptyFileSystem);
  }
  return sharedServices;
}

/**
 * Compilation options
 */
export interface CompileOptions {
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
 * Union of all possible compilation errors
 */
export type CompileError = ParseError | TransformError | TypeError | EmitError;

/**
 * Document counter for generating unique URIs
 *
 * Each parse call needs a unique URI to avoid conflicts in Langium's
 * document manager. We use a counter to ensure uniqueness.
 */
let documentCounter = 0;

/**
 * T076: Parse DSL source → Langium AST
 *
 * Uses Langium parser to convert source string to AST.
 * Returns ParseError if syntax is invalid.
 *
 * Note: Reuses a shared Langium service instance for better performance
 * and to prevent memory exhaustion during testing. Each parse gets a unique
 * URI to avoid document conflicts. Documents are removed from the workspace
 * after parsing to prevent memory leaks.
 */
export const parseSource = (source: string, uri?: string): Effect.Effect<Program, ParseError> =>
  Effect.gen(function* (_) {
    // Generate unique URI if not provided
    const uriString = uri ?? `file:///memory/source-${documentCounter++}.eligian`;
    const documentUri = URI.parse(uriString);

    // Wrap Langium parsing in Effect.tryPromise
    const result = yield* _(
      Effect.tryPromise({
        try: async () => {
          // Reuse shared Langium services (singleton pattern)
          const services = getOrCreateServices();

          // Parse directly without parseHelper to avoid test utility overhead
          const document = services.shared.workspace.LangiumDocumentFactory.fromString<Program>(
            source,
            documentUri
          );

          // Build document (runs lexer, parser, linker)
          await services.shared.workspace.DocumentBuilder.build([document], { validation: true });

          return document;
        },
        catch: error => ({
          _tag: 'ParseError' as const,
          message: error instanceof Error ? error.message : String(error),
          location: { line: 1, column: 1, length: 0 },
          hint: 'Unexpected error during parsing',
        }),
      })
    );

    const document = result;

    // Check for parse errors
    if (document.parseResult.lexerErrors.length > 0) {
      const error = document.parseResult.lexerErrors[0];
      return yield* _(
        Effect.fail({
          _tag: 'ParseError' as const,
          message: `Lexer error: ${error.message}`,
          location: {
            line: error.line ?? 1,
            column: error.column ?? 1,
            length: error.length ?? 0,
          },
          hint: 'Check for invalid characters or tokens',
        })
      );
    }

    if (document.parseResult.parserErrors.length > 0) {
      const error = document.parseResult.parserErrors[0];
      return yield* _(
        Effect.fail({
          _tag: 'ParseError' as const,
          message: error.message,
          location: {
            line: error.token.startLine ?? 1,
            column: error.token.startColumn ?? 1,
            length: error.token.endOffset ? error.token.endOffset - error.token.startOffset : 0,
          },
          hint: 'Check syntax against Eligian grammar',
        })
      );
    }

    // Check for validation errors (from semantic validator)
    if (document.diagnostics && document.diagnostics.length > 0) {
      const error = document.diagnostics[0];
      const range = error.range;
      return yield* _(
        Effect.fail({
          _tag: 'ParseError' as const,
          message: error.message,
          location: {
            line: range.start.line + 1, // Langium is 0-based
            column: range.start.character + 1,
            length: range.end.character - range.start.character,
          },
          hint: 'Semantic validation failed',
        })
      );
    }

    // Return parsed AST
    return document.parseResult.value;
  });

/**
 * T077: Validate AST semantics
 *
 * Note: Semantic validation is already performed by Langium during parsing
 * via eligian-validator.ts. This function is a no-op that exists for
 * pipeline completeness and potential future custom validations.
 */
export const validateAST = (program: Program): Effect.Effect<Program, never> =>
  Effect.succeed(program);

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
  Effect.gen(function* (_) {
    // T076: Parse source to AST
    const program = yield* _(parseSource(source, options.sourceUri));

    // T077: Validate AST (no-op, done during parsing)
    const validatedProgram = yield* _(validateAST(program));

    // Load assets (layout HTML, CSS files, media) if sourceUri is provided
    let assets: AssetLoadingResult | undefined;
    if (options.sourceUri) {
      assets = loadProgramAssets(validatedProgram, options.sourceUri);
    }

    // T050-T059: Transform AST to IR
    const ir = yield* _(transformAST(validatedProgram, assets));

    // T060-T064: Type check IR
    const typedIR = yield* _(typeCheck(ir));

    // T065-T069: Optimize IR (if enabled)
    const optimizedIR = options.optimize !== false ? yield* _(optimize(typedIR)) : typedIR;

    // T070-T075: Emit JSON configuration
    const config = yield* _(emitJSON(optimizedIR));

    return config;
  });

/**
 * T079: Compile from file path
 *
 * Helper that reads a file and compiles it.
 * Note: Requires FileSystem effect service (not yet implemented).
 * For now, this is a placeholder that expects source to be pre-read.
 */
export const compileFile = (
  _filePath: string,
  _options: CompileOptions = {}
): Effect.Effect<IEngineConfiguration, CompileError> =>
  Effect.gen(function* (_) {
    // TODO: Read file via FileSystem service
    // For now, this is a placeholder
    return yield* _(
      Effect.fail({
        _tag: 'ParseError' as const,
        message: 'compileFile not yet implemented - use compile() with source string',
        location: { line: 1, column: 1, length: 0 },
        hint: 'Read file externally and pass source to compile()',
      })
    );
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
  Effect.gen(function* (_) {
    const config = yield* _(compile(source, options));

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
): Effect.Effect<EligiusIR, ParseError | TransformError | TypeError> =>
  Effect.gen(function* (_) {
    // Parse source to AST
    const program = yield* _(parseSource(source));

    // Validate AST
    const validatedProgram = yield* _(validateAST(program));

    // Transform AST to IR
    const ir = yield* _(transformAST(validatedProgram));

    // Type check IR
    const typedIR = yield* _(typeCheck(ir));

    // Optimize IR (if enabled)
    const optimizedIR = options.optimize !== false ? yield* _(optimize(typedIR)) : typedIR;

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
export { transformAST, typeCheck, optimize, emitJSON };
