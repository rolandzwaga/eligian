/**
 * Eligius DSL Compiler
 *
 * Entry point for the @eligian/compiler package.
 * Provides programmatic API for compiling Eligius DSL to JSON.
 *
 * @packageDocumentation
 */

// Type exports
export type {
  // Eligius types (from eligius package)
  IEngineConfiguration,
  IResolvedEngineConfiguration,
  ITimelineConfiguration,
  ITimelineActionConfiguration,
  IActionConfiguration,
  IEndableActionConfiguration,
  IEventActionConfiguration,
  IOperationConfiguration,
  IDuration,
  TimelineTypes,

  // Our IR types
  EligiusIR,
  TimelineIR,
  EventIR,
  ActionDefinitionIR,
  ActionIR,
  BuiltInActionIR,
  ActionCallIR,
  RawOperationIR,
  OperationIR,
  TargetSelector,
  TimeExpression,
  ParameterIR,

  // Error types
  CompileError,
  ParseError,
  ValidationError,
  TypeError,
  TransformError,
  OptimizationError,
  EmitError,
  FormattedError,

  // Common types
  SourceLocation,
  JsonValue,
  JsonObject
} from "./types/index.js"

// Effect services and layers
export {
  FileSystemService,
  LoggerService,
  CompilerService,
  IOError,
  FileSystemLive,
  FileSystemTest,
  LoggerLive,
  LoggerTest,
  LoggerSilent,
  MainLayer,
  TestLayer,
  type CompileOptions,
  type LogLevel,
  defaultCompileOptions
} from "./effects/index.js"

// Error constructors
export {
  createParseError,
  createValidationError,
  createTypeError,
  createTransformError,
  createOptimizationError,
  createEmitError
} from "./types/errors.js"

// Utility functions
export {
  createSourceLocation,
  formatSourceLocation
} from "./types/common.js"

/**
 * Compiler version
 */
export const VERSION = "0.0.1"
