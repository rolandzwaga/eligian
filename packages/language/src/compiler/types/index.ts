/**
 * Type Exports for Eligius DSL Compiler
 *
 * This module organizes all compiler types:
 * - Internal IR (Intermediate Representation) - our DSL-specific structures
 * - Eligius types - imported from the eligius package (target output format)
 * - Error types - typed errors for pipeline stages
 * - Common types - shared utilities
 *
 * @module types
 */

// Re-export Eligius types (target output format)
export type {
  IActionConfiguration,
  IDuration,
  IEndableActionConfiguration,
  IEngineConfiguration,
  IEngineInfo,
  IEventActionConfiguration,
  ILabel,
  ILanguageLabel,
  IOperationConfiguration,
  IResolvedEngineConfiguration,
  IResolvedOperation,
  IStrictDuration,
  ITimelineActionConfiguration,
  ITimelineConfiguration,
  ITimelineProviderSettings,
  TimelineTypes,
  TLanguageCode,
  TTimelineProviderSettings,
} from 'eligius';
// Error types - now imported from unified errors namespace
// Note: Don't use export * to avoid duplicate SourceLocation export
export type {
  AssetError,
  CompilerError,
  EmitError,
  FormattedError,
  IOError,
  ParseError,
  TransformError,
  TypeError,
  ValidationError,
} from '../../errors/index.js';
// Common utility types
export * from './common.js';
// Our internal IR types
export * from './eligius-ir.js';
