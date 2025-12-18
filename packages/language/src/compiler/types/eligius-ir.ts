/**
 * Intermediate Representation (IR) Types for Eligius DSL Compiler
 *
 * This module defines the internal representation used by the compiler
 * after parsing and before JSON emission.
 *
 * T278: Refactored to import Eligius types directly instead of duplicating them.
 * The IR now uses Eligius types with additional compiler-specific metadata.
 *
 * @module eligius-ir
 */

import type {
  IEndableActionConfiguration,
  IEngineConfiguration,
  IEngineInfo,
  IEventActionConfiguration,
  ILabel,
  ILocalesConfiguration,
  IOperationConfiguration,
  ITimelineActionConfiguration,
  ITimelineConfiguration,
  ITimelineFlow,
  ITimelineProviderSettings,
  TimelineTypes,
  TLanguageCode,
  TOperationData,
  TTimelineProviderSettings,
} from 'eligius';
import type { JsonValue, SourceLocation } from './common.js';
// Re-export for external use
export type { JsonValue };
// Re-export Eligius types for convenience
export type {
  IEndableActionConfiguration,
  IEngineConfiguration,
  IEngineInfo,
  IEventActionConfiguration,
  ILabel,
  ILocalesConfiguration,
  IOperationConfiguration,
  ITimelineActionConfiguration,
  ITimelineConfiguration,
  ITimelineFlow,
  ITimelineProviderSettings,
  TLanguageCode,
  TOperationData,
  TimelineTypes,
  TTimelineProviderSettings,
};

/**
 * T279: EligiusIR now wraps IEngineConfiguration with a SourceMap
 *
 * This is the root type returned by the transformer.
 * It contains:
 * - config: The actual IEngineConfiguration that will be serialized to JSON
 * - sourceMap: Parallel structure tracking source locations for error reporting
 * - metadata: Compiler metadata (DSL version, compiler version, etc.)
 *
 * The transformer builds IEngineConfiguration directly, and the emitter
 * just serializes it (no transformation needed).
 */
export type EligiusIR = {
  readonly config: IEngineConfiguration;
  readonly sourceMap: SourceMap;
  readonly metadata?: MetadataIR;
};

/**
 * T279: SourceMap - Parallel structure tracking source locations
 *
 * Maps entity IDs to their source locations for error reporting.
 * This keeps source location tracking separate from the Eligius config.
 */
export type SourceMap = {
  readonly root: SourceLocation; // Location of the program root
  readonly actions: ReadonlyMap<string, SourceLocation>; // action.id → location
  readonly operations: ReadonlyMap<string, SourceLocation>; // operation.id → location
  readonly timelines: ReadonlyMap<string, SourceLocation>; // timeline.id → location
  readonly timelineActions: ReadonlyMap<string, SourceLocation>; // timelineAction.id → location
};

/**
 * @deprecated Use IEngineInfo from 'eligius' instead
 * Kept for backward compatibility during migration
 */
export type EngineInfoIR = IEngineInfo;

/**
 * T279: TimelineFlowIR now uses Eligius ITimelineFlow
 * Re-exported for backward compatibility
 */
export type TimelineFlowIR = ITimelineFlow;

/**
 * T279: TimelineProviderSettingsIR now uses Eligius TTimelineProviderSettings
 * Re-exported for backward compatibility
 */
export type TimelineProviderSettingsIR = TTimelineProviderSettings;

/**
 * T279: TimelineProviderSettingIR now uses Eligius ITimelineProviderSettings
 * Re-exported for backward compatibility
 */
export type TimelineProviderSettingIR = ITimelineProviderSettings;

/**
 * T278: TimelineConfigIR extends Eligius ITimelineConfiguration with sourceLocation
 * Uses TimelineActionIR[] which includes sourceLocation for error reporting
 */
export type TimelineConfigIR = {
  readonly id: string;
  readonly uri: string; // Eligius requires string, not string | undefined
  readonly type: TimelineTypes; // Using Eligius TimelineTypes
  readonly duration: number;
  readonly loop: boolean;
  readonly selector: string;
  readonly timelineActions: ReadonlyArray<TimelineActionIR>;
  readonly sourceLocation: SourceLocation;
};

/**
 * T278: TimelineType now uses Eligius TimelineTypes
 * Eligius defines: 'animation' | 'mediaplayer'
 * We extend with legacy types for backward compatibility during DSL parsing
 */
export type TimelineType =
  | TimelineTypes // Eligius types: 'animation' | 'mediaplayer'
  | 'raf' // Legacy - mapped to 'animation' during transformation
  | 'video' // Legacy - mapped to 'mediaplayer' during transformation
  | 'audio' // Legacy - mapped to 'mediaplayer' during transformation
  | 'custom'; // Custom providers (may not be in Eligius core types)

/**
 * DEPRECATED: Old timeline IR (kept for backward compatibility during migration)
 */
export type TimelineIR = {
  readonly provider: TimelineType;
  readonly source?: string; // e.g., "video.mp4", "audio.mp3"
  readonly options?: Readonly<Record<string, JsonValue>>;
  readonly sourceLocation: SourceLocation;
};

/**
 * @deprecated Use TimelineType instead
 */
export type TimelineProvider = TimelineType;

/**
 * T278: DurationIR extends Eligius IDuration to support TimeExpression
 * Eligius IDuration only supports numbers, but DSL needs compile-time expressions
 */
export type DurationIR = {
  readonly start: number | TimeExpression;
  readonly end: number | TimeExpression;
};

/**
 * T278: Base action configuration extends Eligius IActionConfiguration with sourceLocation
 * Note: Eligius uses IOperationConfiguration<TOperationData>[], we use OperationConfigIR[]
 */
export type BaseActionIR = {
  readonly id: string;
  readonly name: string;
  readonly startOperations: ReadonlyArray<OperationConfigIR>;
  readonly sourceLocation: SourceLocation;
};

/**
 * T278: EndableActionIR extends Eligius IEndableActionConfiguration with sourceLocation
 * Adds sourceLocation for error reporting and uses OperationConfigIR for operations
 */
export type EndableActionIR = {
  readonly id: string;
  readonly name: string;
  readonly startOperations: ReadonlyArray<OperationConfigIR>;
  readonly endOperations: ReadonlyArray<OperationConfigIR>;
  readonly sourceLocation: SourceLocation;
};

/**
 * T278: TimelineActionIR extends Eligius ITimelineActionConfiguration with sourceLocation
 * Uses DurationIR instead of IDuration to support TimeExpression
 */
export type TimelineActionIR = {
  readonly id: string;
  readonly name: string;
  readonly startOperations: ReadonlyArray<OperationConfigIR>;
  readonly endOperations: ReadonlyArray<OperationConfigIR>;
  readonly duration: DurationIR;
  readonly sourceLocation: SourceLocation;
};

/**
 * T278: EventActionIR extends Eligius IEventActionConfiguration with sourceLocation
 */
export type EventActionIR = {
  readonly id: string;
  readonly name: string;
  readonly startOperations: ReadonlyArray<OperationConfigIR>;
  readonly eventName: string;
  readonly eventTopic?: string;
  readonly sourceLocation: SourceLocation;
};

/**
 * T278: OperationConfigIR extends Eligius IOperationConfiguration with sourceLocation
 * Eligius type doesn't include sourceLocation (needed for error reporting)
 */
export type OperationConfigIR = IOperationConfiguration<TOperationData> & {
  readonly sourceLocation: SourceLocation;
};

/**
 * DEPRECATED: Old Event IR (kept for backward compatibility during migration)
 * This represents the DSL's simplified "event" concept, which maps to Eligius's TimelineAction
 */
export type EventIR = {
  readonly id: string;
  readonly start: number | TimeExpression;
  readonly end: number | TimeExpression;
  readonly actions: ReadonlyArray<ActionIR>;
  readonly conditions?: ReadonlyArray<ConditionIR>;
  readonly metadata?: Readonly<Record<string, JsonValue>>;
  readonly sourceLocation: SourceLocation;
};

/**
 * Action definition - reusable action template (like a function)
 *
 * These are standalone actions that can be invoked from events using
 * action calls. This enables powerful code reuse and composition.
 */
export type ActionDefinitionIR = {
  readonly name: string;
  readonly parameters: ReadonlyArray<ParameterIR>;
  readonly operations: ReadonlyArray<OperationIR>;
  readonly sourceLocation: SourceLocation;
};

/**
 * Parameter definition for action definitions
 */
export type ParameterIR = {
  readonly name: string;
  readonly type: ParameterType;
  readonly defaultValue?: JsonValue;
  readonly sourceLocation: SourceLocation;
};

export type ParameterType = 'selector' | 'number' | 'string' | 'boolean';

/**
 * Time expression - supports relative times, calculations
 */
export type TimeExpression =
  | { readonly kind: 'literal'; readonly value: number }
  | { readonly kind: 'variable'; readonly name: string }
  | {
      readonly kind: 'binary';
      readonly op: '+' | '-' | '*' | '/';
      readonly left: TimeExpression;
      readonly right: TimeExpression;
    };

/**
 * Action - what happens when an event triggers
 *
 * Actions can be either:
 * 1. Built-in high-level actions (show, hide, animate, trigger)
 * 2. Calls to user-defined action definitions
 * 3. Raw Eligius operations
 */
export type ActionIR = BuiltInActionIR | ActionCallIR | RawOperationIR;

/**
 * Built-in high-level action
 */
export type BuiltInActionIR = {
  readonly kind: 'built-in';
  readonly type: BuiltInActionType;
  readonly target?: TargetSelector;
  readonly properties?: Readonly<Record<string, JsonValue>>;
  readonly sourceLocation: SourceLocation;
};

export type BuiltInActionType = 'show' | 'hide' | 'animate' | 'trigger';

/**
 * Call to a user-defined action
 */
export type ActionCallIR = {
  readonly kind: 'action-call';
  readonly actionName: string;
  readonly arguments: ReadonlyArray<ArgumentIR>;
  readonly sourceLocation: SourceLocation;
};

/**
 * Argument passed to an action call
 */
export type ArgumentIR = {
  readonly value: JsonValue | TargetSelector | TimeExpression;
  readonly sourceLocation: SourceLocation;
};

/**
 * Raw Eligius operation (escape hatch)
 */
export type RawOperationIR = {
  readonly kind: 'raw-operation';
  readonly operation: OperationIR;
  readonly sourceLocation: SourceLocation;
};

/**
 * Eligius operation - atomic function
 */
export type OperationIR = {
  readonly systemName: string;
  readonly operationData?: Readonly<Record<string, JsonValue>>;
  readonly sourceLocation: SourceLocation;
};

/**
 * Target selector - CSS-like element selector
 */
export type TargetSelector = {
  readonly kind: 'id' | 'class' | 'element' | 'query';
  readonly value: string;
  readonly sourceLocation: SourceLocation;
};

/**
 * Condition - predicate for conditional event triggering
 */
export type ConditionIR = {
  readonly kind: 'expression';
  readonly expression: string; // Boolean expression
  readonly sourceLocation: SourceLocation;
};

/**
 * Provider - custom timeline provider configuration
 */
export type ProviderIR = {
  readonly name: string;
  readonly type: string;
  readonly config: Readonly<Record<string, JsonValue>>;
  readonly sourceLocation: SourceLocation;
};

/**
 * Metadata - compilation metadata
 */
export type MetadataIR = {
  readonly dslVersion: string;
  readonly compilerVersion: string;
  readonly compiledAt: string; // ISO 8601 timestamp
  readonly sourceFile?: string;
};
