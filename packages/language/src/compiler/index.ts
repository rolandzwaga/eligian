/**
 * Eligius DSL Compiler
 *
 * Entry point for the @eligian/compiler package.
 * Provides programmatic API for compiling Eligius DSL to JSON.
 *
 * @packageDocumentation
 */

import { ELIGIAN_VERSION } from './version.js';

// Effect services and layers
export {
  type CompileOptions,
  CompilerService,
  defaultCompileOptions,
  FileSystemLive,
  FileSystemService,
  FileSystemTest,
  LoggerLive,
  LoggerService,
  LoggerTest,
  type LogLevel,
  MainLayer,
  TestLayer,
} from './effects/index.js';
// Idea #14: compiled JSON → .eligian source (runtime errors, live playhead)
export {
  activeTimelineActions,
  buildEligianMap,
  type EligianMap,
  type EligianMapAction,
  type EligianMapOperation,
  type EngineErrorCandidate,
  type EngineErrorInfo,
  type LocatedEngineError,
  locateConfigPath,
  locateEngineError,
} from './eligian-map.js';
// Error formatting exports
export { formatErrors } from './error-reporter.js';
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
// BUG-001 FIX (T323): resolvePropertyChain removed - no longer needed
export {
  type MappingError,
  type MappingResult,
  mapParameters,
  mapPositionalToNamed,
  wrapParameters,
} from './operations/mapper.js';
// Operation validation exports (renamed to avoid conflict with ValidationError from types)
export {
  type ControlFlowError,
  type MissingDependencyError,
  type ParameterCountError,
  type UnknownOperationError,
  type ValidationError as OperationValidationErrorBase,
  type ValidationResult,
  validateControlFlowPairing,
  validateOperation,
  validateOperationExists,
  validateParameterCount,
  validateParameterTypes,
} from './operations/validator.js';
export type { CheckDiagnosticData, QuickFix } from './pipeline/check.js';
// Spec 058 phase 2 (A1): workspace helpers on the root singleton (`eligian_project`)
export { type LoadedDocuments, withLoadedDocuments } from './pipeline/check.js';
export {
  parseSourceTracked,
  releaseWorkspaceDocuments,
  type TrackedParse,
} from './pipeline/parser.js';
export { getOrCreateServices, resetServices } from './pipeline/services.js';
// Compilation pipeline exports
export {
  type CheckDiagnostic,
  type CheckFileResult,
  type CheckSeverity,
  type CompileError,
  checkFiles,
  compile,
  compileProgramWithMap,
  compileString,
  compileToIR,
  compileToJSON,
  compileWithDefaults,
  compileWithMap,
  type DocumentWarning,
  emitJSON,
  getCompilerVersion,
  getProgramWarnings,
  optimize,
  parseSource,
  transformAST,
  tryCompileProgramWithMap,
  typeCheck,
  validateAST,
} from './pipeline.js';
// Utility functions
export {
  createSourceLocation,
  formatSourceLocation,
} from './types/common.js';
// Type exports
export type {
  ActionCallIR,
  ActionDefinitionIR,
  ActionIR,
  BuiltInActionIR,
  // Our IR types
  EligiusIR,
  EventIR,
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
  ParameterIR,
  RawOperationIR,
  // Common types
  TargetSelector,
  TimeExpression,
  TimelineIR,
  TimelineTypes,
} from './types/index.js';
// Spec 058 Phase 3 (FR-040): operation provenance
export { OPERATION_ORIGINS, type OperationOrigin } from './types/operation-origin.js';

/**
 * Compiler version
 */
export const VERSION: string = ELIGIAN_VERSION;

// Idea #24: host operations, controllers and functions (extensions import)
export {
  controllerMetadata,
  type HostModule,
  hostModuleOf,
  hostOperations,
  isKnownController,
} from './operations/host-operations.js';
