/**
 * Logger Effect Service
 *
 * Provides logging operations as Effects for the compiler pipeline.
 * Allows different log levels and clean separation of logging concerns.
 *
 * @module effects/Logger
 */

import { Context, Effect } from "effect"

/**
 * Log level for filtering messages
 */
export type LogLevel = "debug" | "info" | "warn" | "error"

/**
 * Logger service interface
 *
 * Provides typed logging operations that return Effects.
 */
export class LoggerService extends Context.Tag("Logger")<
  LoggerService,
  {
    /**
     * Log debug message (verbose, development only)
     */
    readonly debug: (message: string) => Effect.Effect<void>

    /**
     * Log info message (general information)
     */
    readonly info: (message: string) => Effect.Effect<void>

    /**
     * Log warning message (non-critical issues)
     */
    readonly warn: (message: string) => Effect.Effect<void>

    /**
     * Log error message (critical issues)
     */
    readonly error: (message: string) => Effect.Effect<void>

    /**
     * Log with custom level
     */
    readonly log: (level: LogLevel, message: string) => Effect.Effect<void>
  }
>() {}
