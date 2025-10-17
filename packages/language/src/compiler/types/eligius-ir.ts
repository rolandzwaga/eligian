/**
 * Intermediate Representation (IR) Types for Eligius DSL Compiler
 *
 * This module defines the internal representation used by the compiler
 * after parsing and before JSON emission. The IR is optimized for
 * transformation, validation, and optimization.
 *
 * This IR now aligns with Eligius's IEngineConfiguration structure.
 *
 * @module eligius-ir
 */

import type { TLanguageCode } from 'eligius';
import type { JsonValue, SourceLocation } from './common.js';
// Re-export for external use
export type { JsonValue };

/**
 * Root IR structure representing a complete Eligius DSL program
 *
 * Aligned with Eligius IEngineConfiguration interface
 */
export type EligiusIR = {
  // Required Eligius configuration fields
  readonly id: string;
  readonly engine: EngineInfoIR;
  readonly containerSelector: string;
  readonly language: TLanguageCode;
  readonly layoutTemplate: string;
  readonly availableLanguages: ReadonlyArray<LabelIR>;
  readonly labels: ReadonlyArray<LanguageLabelIR>;

  // Action layers (Eligius has multiple action contexts)
  readonly initActions: ReadonlyArray<OperationConfigIR>; // Run once on initialization (operations, not full actions)
  readonly actions: ReadonlyArray<EndableActionIR>; // Global actions (run throughout)
  readonly eventActions: ReadonlyArray<EventActionIR>; // Event-triggered actions (what DSL calls "events")

  // Timeline configuration (plural - Eligius supports multiple timelines)
  readonly timelines: ReadonlyArray<TimelineConfigIR>;
  readonly timelineFlow?: TimelineFlowIR;

  // Provider settings
  readonly timelineProviderSettings?: TimelineProviderSettingsIR;

  // Compiler metadata (not part of Eligius, but useful for debugging)
  readonly metadata?: MetadataIR;
  readonly sourceLocation: SourceLocation;
};

/**
 * Engine information
 */
export type EngineInfoIR = {
  readonly systemName: string;
};

/**
 * Label for language selection
 */
export type LabelIR = {
  readonly languageCode: string;
  readonly label: string;
};

/**
 * Language-specific label (for i18n)
 */
export type LanguageLabelIR = {
  readonly key: string;
  readonly language: TLanguageCode;
  readonly value: string;
};

/**
 * Timeline flow configuration (how timelines interact)
 */
export type TimelineFlowIR = Readonly<Record<string, JsonValue>>;

/**
 * Timeline provider settings
 */
export type TimelineProviderSettingsIR = Readonly<Record<string, TimelineProviderSettingIR>>;

export type TimelineProviderSettingIR = {
  readonly id: string;
  readonly vendor: string;
  readonly systemName: string;
  readonly selector?: string;
  readonly poster?: string;
};

/**
 * Timeline configuration - Eligius ITimelineConfiguration structure
 */
export type TimelineConfigIR = {
  readonly id: string;
  readonly uri: string | undefined; // Source file (video, audio, etc.)
  readonly type: TimelineType;
  readonly duration: number;
  readonly loop: boolean;
  readonly selector: string;
  readonly timelineActions: ReadonlyArray<TimelineActionIR>;
  readonly sourceLocation: SourceLocation;
};

/**
 * Timeline types (T271: Updated for Eligius schema compliance)
 *
 * Eligius uses:
 * - 'animation' for RAF-based timelines
 * - 'mediaplayer' for video/audio timelines
 */
export type TimelineType =
  | 'animation' // RequestAnimationFrame (mapped from 'raf' in DSL)
  | 'mediaplayer' // Video or audio (mapped from 'video'/'audio' in DSL)
  | 'raf' // Legacy - for backward compatibility
  | 'video' // Legacy - for backward compatibility
  | 'audio' // Legacy - for backward compatibility
  | 'custom';

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
 * Duration specification (Eligius IDuration)
 */
export type DurationIR = {
  readonly start: number | TimeExpression;
  readonly end: number | TimeExpression;
};

/**
 * Base action configuration (Eligius IActionConfiguration)
 */
export type BaseActionIR = {
  readonly id: string;
  readonly name: string;
  readonly startOperations: ReadonlyArray<OperationConfigIR>;
  readonly sourceLocation: SourceLocation;
};

/**
 * Endable action - has both start and end operations (Eligius IEndableActionConfiguration)
 */
export type EndableActionIR = BaseActionIR & {
  readonly endOperations: ReadonlyArray<OperationConfigIR>;
};

/**
 * Timeline action - tied to timeline duration (Eligius ITimelineActionConfiguration)
 */
export type TimelineActionIR = EndableActionIR & {
  readonly duration: DurationIR;
};

/**
 * Event action - triggered by events (Eligius IEventActionConfiguration)
 */
export type EventActionIR = BaseActionIR & {
  readonly eventName: string;
  readonly eventTopic?: string;
};

/**
 * Operation configuration (Eligius IOperationConfiguration)
 */
export type OperationConfigIR = {
  readonly id: string;
  readonly systemName: string;
  readonly operationData?: Readonly<Record<string, JsonValue>>;
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
