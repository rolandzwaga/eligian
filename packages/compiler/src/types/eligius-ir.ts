/**
 * Intermediate Representation (IR) Types for Eligius DSL Compiler
 *
 * This module defines the internal representation used by the compiler
 * after parsing and before JSON emission. The IR is optimized for
 * transformation, validation, and optimization.
 *
 * @module eligius-ir
 */

import type { SourceLocation, JsonValue } from "./common.js"

/**
 * Root IR structure representing a complete Eligius DSL program
 */
export type EligiusIR = {
  readonly timeline: TimelineIR
  readonly events: ReadonlyArray<EventIR>
  readonly actions?: ReadonlyArray<ActionDefinitionIR>
  readonly providers?: ReadonlyArray<ProviderIR>
  readonly metadata?: MetadataIR
  readonly sourceLocation: SourceLocation
}

/**
 * Timeline configuration - defines the time source for the presentation
 */
export type TimelineIR = {
  readonly provider: TimelineProvider
  readonly source?: string  // e.g., "video.mp4", "audio.mp3"
  readonly options?: Readonly<Record<string, JsonValue>>
  readonly sourceLocation: SourceLocation
}

/**
 * Timeline provider types
 */
export type TimelineProvider =
  | "video"
  | "audio"
  | "raf"  // RequestAnimationFrame
  | "custom"

/**
 * Event - triggered at specific times on the timeline
 */
export type EventIR = {
  readonly id: string
  readonly start: number | TimeExpression
  readonly end: number | TimeExpression
  readonly actions: ReadonlyArray<ActionIR>
  readonly conditions?: ReadonlyArray<ConditionIR>
  readonly metadata?: Readonly<Record<string, JsonValue>>
  readonly sourceLocation: SourceLocation
}

/**
 * Action definition - reusable action template (like a function)
 *
 * These are standalone actions that can be invoked from events using
 * action calls. This enables powerful code reuse and composition.
 */
export type ActionDefinitionIR = {
  readonly name: string
  readonly parameters: ReadonlyArray<ParameterIR>
  readonly operations: ReadonlyArray<OperationIR>
  readonly sourceLocation: SourceLocation
}

/**
 * Parameter definition for action definitions
 */
export type ParameterIR = {
  readonly name: string
  readonly type: ParameterType
  readonly defaultValue?: JsonValue
  readonly sourceLocation: SourceLocation
}

export type ParameterType = "selector" | "number" | "string" | "boolean"

/**
 * Time expression - supports relative times, calculations
 */
export type TimeExpression =
  | { readonly kind: "literal"; readonly value: number }
  | { readonly kind: "variable"; readonly name: string }
  | { readonly kind: "binary"; readonly op: "+" | "-" | "*" | "/"; readonly left: TimeExpression; readonly right: TimeExpression }

/**
 * Action - what happens when an event triggers
 *
 * Actions can be either:
 * 1. Built-in high-level actions (show, hide, animate, trigger)
 * 2. Calls to user-defined action definitions
 * 3. Raw Eligius operations
 */
export type ActionIR =
  | BuiltInActionIR
  | ActionCallIR
  | RawOperationIR

/**
 * Built-in high-level action
 */
export type BuiltInActionIR = {
  readonly kind: "built-in"
  readonly type: BuiltInActionType
  readonly target?: TargetSelector
  readonly properties?: Readonly<Record<string, JsonValue>>
  readonly sourceLocation: SourceLocation
}

export type BuiltInActionType =
  | "show"
  | "hide"
  | "animate"
  | "trigger"

/**
 * Call to a user-defined action
 */
export type ActionCallIR = {
  readonly kind: "action-call"
  readonly actionName: string
  readonly arguments: ReadonlyArray<ArgumentIR>
  readonly sourceLocation: SourceLocation
}

/**
 * Argument passed to an action call
 */
export type ArgumentIR = {
  readonly value: JsonValue | TargetSelector | TimeExpression
  readonly sourceLocation: SourceLocation
}

/**
 * Raw Eligius operation (escape hatch)
 */
export type RawOperationIR = {
  readonly kind: "raw-operation"
  readonly operation: OperationIR
  readonly sourceLocation: SourceLocation
}

/**
 * Eligius operation - atomic function
 */
export type OperationIR = {
  readonly systemName: string
  readonly operationData?: Readonly<Record<string, JsonValue>>
  readonly sourceLocation: SourceLocation
}

/**
 * Target selector - CSS-like element selector
 */
export type TargetSelector = {
  readonly kind: "id" | "class" | "element" | "query"
  readonly value: string
  readonly sourceLocation: SourceLocation
}

/**
 * Condition - predicate for conditional event triggering
 */
export type ConditionIR = {
  readonly kind: "expression"
  readonly expression: string  // Boolean expression
  readonly sourceLocation: SourceLocation
}

/**
 * Provider - custom timeline provider configuration
 */
export type ProviderIR = {
  readonly name: string
  readonly type: string
  readonly config: Readonly<Record<string, JsonValue>>
  readonly sourceLocation: SourceLocation
}

/**
 * Metadata - compilation metadata
 */
export type MetadataIR = {
  readonly dslVersion: string
  readonly compilerVersion: string
  readonly compiledAt: string  // ISO 8601 timestamp
  readonly sourceFile?: string
}
