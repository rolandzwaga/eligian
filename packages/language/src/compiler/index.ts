/**
 * Eligius DSL Compiler
 *
 * Entry point for the @eligian/compiler package.
 * Provides programmatic API for compiling Eligius DSL to JSON.
 *
 * @packageDocumentation
 */

// Effect services and layers
export {
  type CompileOptions,
  CompilerService,
  defaultCompileOptions,
  FileSystemLive,
  FileSystemService,
  FileSystemTest,
  IOError,
  LoggerLive,
  LoggerService,
  LoggerSilent,
  LoggerTest,
  type LogLevel,
  MainLayer,
  TestLayer,
} from './effects/index.js';
// Error formatting exports
export {
  formatError,
  formatErrors,
  formatParseError,
  formatTransformError,
  formatTypeError,
  formatValidationError,
} from './error-reporter.js';
// Operation registry exports
export {
  type ConstantValue,
  type DependencyInfo,
  findOperationsWithDependency,
  findOperationsWithOutput,
  getAllOperationNames,
  getAllOperations,
  getDefaultConstantValue,
  getOperationSignature,
  getOperationsByCategory,
  hasOperation,
  isConstantValueArray,
  isParameterTypeArray,
  OPERATION_REGISTRY,
  type OperationParameter,
  type OperationRegistry,
  type OperationSignature,
  type OutputInfo,
  type ParameterType,
  searchOperations,
  suggestSimilarOperations,
  validateRegistry,
} from './operations/index.js';
// Operation parameter mapping exports
export {
  type MappingError,
  type MappingResult,
  mapParameters,
  mapPositionalToNamed,
  resolvePropertyChain,
  wrapParameters,
} from './operations/mapper.js';
// Operation validation exports (renamed to avoid conflict with ValidationError from types)
export {
  type ControlFlowError,
  type MissingDependencyError,
  type OperationValidationError,
  type ParameterCountError,
  type ParameterTypeError,
  trackOutputs,
  type UnknownOperationError,
  type ValidationError as OperationValidationErrorBase,
  type ValidationResult,
  validateControlFlowPairing,
  validateDependencies,
  validateOperation,
  validateOperationExists,
  validateParameterCount,
  validateParameterTypes,
} from './operations/validator.js';
// Compilation pipeline exports
export {
  type CompileError,
  compile,
  compileFile,
  compileString,
  compileToIR,
  compileToJSON,
  compileWithDefaults,
  emitJSON,
  getCompilerVersion,
  optimize,
  parseSource,
  transformAST,
  typeCheck,
  validateAST,
} from './pipeline.js';
// Utility functions
export {
  createSourceLocation,
  formatSourceLocation,
} from './types/common.js';
// Error constructors
export {
  createEmitError,
  createOptimizationError,
  createParseError,
  createTransformError,
  createTypeError,
  createValidationError,
} from './types/errors.js';
// Type exports
export type {
  ActionCallIR,
  ActionDefinitionIR,
  ActionIR,
  BuiltInActionIR,
  // Our IR types
  EligiusIR,
  EmitError,
  EventIR,
  FormattedError,
  IActionConfiguration,
  IDuration,
  IEndableActionConfiguration,
  // Eligius types (from eligius package)
  IEngineConfiguration,
  IEventActionConfiguration,
  IOperationConfiguration,
  IResolvedEngineConfiguration,
  ITimelineActionConfiguration,
  ITimelineConfiguration,
  JsonObject,
  JsonValue,
  OperationIR,
  OptimizationError,
  ParameterIR,
  ParseError,
  RawOperationIR,
  // Common types
  SourceLocation,
  TargetSelector,
  TimeExpression,
  TimelineIR,
  TimelineTypes,
  TransformError,
  TypeError,
  ValidationError,
} from './types/index.js';

/**
 * Compiler version
 */
export const VERSION = '0.0.1';
