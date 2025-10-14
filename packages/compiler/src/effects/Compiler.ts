/**
 * Compiler Effect Service
 *
 * Provides the main compilation interface as an Effect service.
 * This is the primary API for compiling DSL source to Eligius JSON.
 *
 * @module effects/Compiler
 */

import { Context, Effect } from "effect"
import type { IEngineConfiguration } from "eligius"
import type { EligiusIR, CompileError } from "../types/index.js"

/**
 * Compilation options
 */
export type CompileOptions = {
  /** Skip optimization passes */
  readonly noOptimize?: boolean
  /** Include source maps in output */
  readonly sourcemap?: boolean
  /** Minify JSON output */
  readonly minify?: boolean
  /** Target Eligius version */
  readonly target?: "eligius-1.0" | string
  /** Source file name (for error reporting) */
  readonly filename?: string
}

/**
 * Default compilation options
 */
export const defaultCompileOptions: CompileOptions = {
  noOptimize: false,
  sourcemap: false,
  minify: false,
  target: "eligius-1.0",
  filename: "input.eli"
}

/**
 * Compiler service interface
 *
 * Provides the core compilation pipeline operations.
 */
export class CompilerService extends Context.Tag("Compiler")<
  CompilerService,
  {
    /**
     * Compile DSL source string to Eligius JSON configuration
     */
    readonly compile: (
      source: string,
      options?: CompileOptions
    ) => Effect.Effect<IEngineConfiguration, CompileError>

    /**
     * Optimize Eligius IR (dead code elimination, constant folding, etc.)
     *
     * Note: Optimization cannot fail, returns Effect<IR, never>
     */
    readonly optimize: (ir: EligiusIR) => Effect.Effect<EligiusIR, never>

    /**
     * Validate IR structure (type checking, constraint validation)
     */
    readonly validate: (ir: EligiusIR) => Effect.Effect<EligiusIR, CompileError>
  }
>() {}
