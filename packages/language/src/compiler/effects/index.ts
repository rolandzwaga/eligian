/**
 * Effect Services and Layers
 *
 * Exports all Effect services and layer implementations for the compiler.
 *
 * @module effects
 */

// Service definitions
export { FileSystemService, IOError } from "./FileSystem.js"
export { LoggerService, type LogLevel } from "./Logger.js"
export {
  CompilerService,
  type CompileOptions,
  defaultCompileOptions
} from "./Compiler.js"

// Layer implementations
export {
  FileSystemLive,
  FileSystemTest,
  LoggerLive,
  LoggerTest,
  LoggerSilent,
  MainLayer,
  TestLayer
} from "./layers.js"
