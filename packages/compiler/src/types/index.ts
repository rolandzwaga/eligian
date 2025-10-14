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
  IEngineConfiguration,
  IResolvedEngineConfiguration,
  ITimelineConfiguration,
  ITimelineActionConfiguration,
  IActionConfiguration,
  IEndableActionConfiguration,
  IEventActionConfiguration,
  IOperationConfiguration,
  IResolvedOperation,
  IEngineInfo,
  TTimelineProviderSettings,
  ITimelineProviderSettings,
} from "eligius"

export type {
  IDuration,
  IStrictDuration,
  TimelineTypes,
  ILanguageLabel,
  ILabel,
  TLanguageCode,
} from "eligius"

// Our internal IR types
export * from "./eligius-ir.js"

// Error types
export * from "./errors.js"

// Common utility types
export * from "./common.js"
