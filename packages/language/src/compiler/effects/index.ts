/**
 * Effect Services and Layers
 *
 * Exports all Effect services and layer implementations for the compiler.
 *
 * @module effects
 */

export {
  type CompileOptions,
  CompilerService,
  defaultCompileOptions,
} from './Compiler.js';
// Service definitions
export { FileSystemService } from './FileSystem.js';
export { LoggerService, type LogLevel } from './Logger.js';

// Layer implementations
export {
  FileSystemLive,
  FileSystemTest,
  LoggerLive,
  LoggerTest,
  MainLayer,
  TestLayer,
} from './layers.js';
