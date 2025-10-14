# Data Model: Eligius DSL & Compiler

**Date**: 2025-10-14
**Phase**: 1 (Design & Contracts)

## Overview

This document defines all data structures used in the Eligius DSL project. It covers:
1. **Intermediate Representation (IR)** - Internal compiler representation
2. **Eligius Configuration Types** - Target JSON output format
3. **Error Types** - Typed errors for each pipeline stage
4. **AST Extensions** - Langium AST augmentations (if needed)

## Intermediate Representation (IR)

The IR is the compiler's internal representation after parsing and before JSON emission. It's optimized for transformation and validation.

### Core IR Types

```typescript
/**
 * Root IR structure representing a complete Eligius DSL program
 */
export type EligiusIR = {
  readonly timeline: TimelineIR
  readonly events: ReadonlyArray<EventIR>
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
 * Time expression - supports relative times, calculations
 */
export type TimeExpression =
  | { readonly kind: "literal"; readonly value: number }
  | { readonly kind: "variable"; readonly name: string }
  | { readonly kind: "binary"; readonly op: "+" | "-" | "*" | "/"; readonly left: TimeExpression; readonly right: TimeExpression }

/**
 * Action - what happens when an event triggers
 */
export type ActionIR = {
  readonly type: ActionType
  readonly target?: TargetSelector
  readonly properties?: Readonly<Record<string, JsonValue>>
  readonly sourceLocation: SourceLocation
}

export type ActionType =
  | "show"
  | "hide"
  | "animate"
  | "trigger"
  | "custom"

export type TargetSelector = {
  readonly kind: "id" | "class" | "element" | "query"
  readonly value: string
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

/**
 * Source location - for error reporting
 */
export type SourceLocation = {
  readonly file?: string
  readonly line: number
  readonly column: number
  readonly length?: number
}

/**
 * JSON-compatible value type
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonObject
  | JsonArray

export type JsonObject = Readonly<Record<string, JsonValue>>
export type JsonArray = ReadonlyArray<JsonValue>
```

## Eligius Configuration Types

These types represent the target Eligius JSON configuration format.

```typescript
/**
 * Eligius configuration - the final JSON output
 */
export type EligiusConfig = {
  readonly timeline: EligiusTimeline
  readonly events: ReadonlyArray<EligiusEvent>
  readonly providers?: ReadonlyArray<EligiusProvider>
  readonly metadata?: EligiusMetadata
}

export type EligiusTimeline = {
  readonly provider: string
  readonly source?: string
  readonly [key: string]: JsonValue | undefined
}

export type EligiusEvent = {
  readonly id: string
  readonly start: number
  readonly end: number
  readonly actions: ReadonlyArray<EligiusAction>
  readonly conditions?: ReadonlyArray<string>
  readonly [key: string]: JsonValue | undefined
}

export type EligiusAction = {
  readonly type: string
  readonly target?: string
  readonly properties?: JsonObject
  readonly [key: string]: JsonValue | undefined
}

export type EligiusProvider = {
  readonly name: string
  readonly type: string
  readonly config: JsonObject
}

export type EligiusMetadata = {
  readonly generatedBy?: string
  readonly version?: string
  readonly timestamp?: string
  readonly [key: string]: JsonValue | undefined
}
```

## Error Types

Each pipeline stage has specific error types for typed error handling.

### Compilation Errors

```typescript
/**
 * Union of all possible compilation errors
 */
export type CompileError =
  | ParseError
  | ValidationError
  | TypeError
  | TransformError
  | OptimizationError
  | EmitError

/**
 * Parse error - syntax errors from Langium
 */
export type ParseError = {
  readonly _tag: "ParseError"
  readonly message: string
  readonly location: SourceLocation
  readonly expected?: string
  readonly actual?: string
}

/**
 * Validation error - semantic validation failures
 */
export type ValidationError = {
  readonly _tag: "ValidationError"
  readonly kind: ValidationErrorKind
  readonly message: string
  readonly location: SourceLocation
  readonly hint?: string
}

export type ValidationErrorKind =
  | "UndefinedReference"
  | "DuplicateDefinition"
  | "InvalidScope"
  | "MissingRequiredField"

/**
 * Type error - type checking failures
 */
export type TypeError = {
  readonly _tag: "TypeError"
  readonly message: string
  readonly location: SourceLocation
  readonly expected: string
  readonly actual: string
  readonly hint?: string
}

/**
 * Transform error - AST → IR transformation failures
 */
export type TransformError = {
  readonly _tag: "TransformError"
  readonly kind: TransformErrorKind
  readonly message: string
  readonly location: SourceLocation
  readonly astNode?: string
}

export type TransformErrorKind =
  | "UnknownNode"
  | "InvalidTimeline"
  | "InvalidEvent"
  | "InvalidAction"
  | "InvalidExpression"

/**
 * Optimization error - should never fail, but for completeness
 */
export type OptimizationError = {
  readonly _tag: "OptimizationError"
  readonly message: string
  readonly pass: string
  readonly hint?: string
}

/**
 * Emit error - IR → JSON emission failures
 */
export type EmitError = {
  readonly _tag: "EmitError"
  readonly message: string
  readonly ir?: string
  readonly hint?: string
}
```

### Error Formatting

```typescript
/**
 * Formatted error for display (CLI, VS Code diagnostics)
 */
export type FormattedError = {
  readonly severity: "error" | "warning" | "info"
  readonly message: string
  readonly location: SourceLocation
  readonly hint?: string
  readonly codeSnippet?: string
  readonly relatedInfo?: ReadonlyArray<RelatedInfo>
}

export type RelatedInfo = {
  readonly message: string
  readonly location: SourceLocation
}
```

## Validation Rules

These are the key validation rules enforced during compilation.

### Timeline Validation

| Rule | Description | Error Type |
|------|-------------|------------|
| **TimelineRequired** | Every program must have exactly one timeline declaration | ValidationError |
| **ValidProvider** | Provider must be one of: video, audio, raf, custom | ValidationError |
| **SourceRequired** | Video/audio providers require a source file | ValidationError |

### Event Validation

| Rule | Description | Error Type |
|------|-------------|------------|
| **UniqueEventIds** | Event IDs must be unique within a program | ValidationError |
| **ValidTimeRange** | Event start must be < end | ValidationError |
| **NonNegativeTimes** | Event start/end must be >=  0 | ValidationError |
| **EventsInOrder** | Events should be in chronological order (warning only) | ValidationError |

### Action Validation

| Rule | Description | Error Type |
|------|-------------|------------|
| **ValidActionType** | Action type must be known (show, hide, animate, trigger, custom) | ValidationError |
| **TargetRequired** | show/hide/animate actions require a target selector | ValidationError |
| **ValidSelector** | Target selector must be valid CSS-like selector | ValidationError |

### Type Checking

| Rule | Description | Error Type |
|------|-------------|------------|
| **TimeType** | Time expressions must evaluate to numbers | TypeError |
| **BooleanCondition** | Conditions must evaluate to boolean | TypeError |
| **StringLiteral** | Source files, selectors must be strings | TypeError |
| **NumericDuration** | Durations (e.g., 500ms) must be numeric | TypeError |

## State Transitions

The IR flows through the compilation pipeline with these state transitions:

```
DSL Source (string)
    ↓ (Langium Parse)
Langium AST
    ↓ (Validate)
Validated AST
    ↓ (Type Check)
Typed AST
    ↓ (Transform)
EligiusIR
    ↓ (Optimize)
Optimized EligiusIR
    ↓ (Emit)
EligiusConfig (JSON)
```

Each transition can fail with a typed error, which is captured in the Effect pipeline.

## Immutability Guarantees

All types are externally immutable (readonly, ReadonlyArray). Per constitution principle VI:

- **External API**: All public types are readonly
- **Internal implementation**: Transformation functions MAY use mutable structures internally for performance
- **Documentation**: Any internal mutation MUST be documented

Example:
```typescript
// External API: immutable
export const transformAST = (ast: LangiumAST): Effect.Effect<EligiusIR, TransformError> =>
  Effect.sync(() => {
    // Internal: mutable array for performance
    const events: EventIR[] = []  // Mutable during construction

    for (const node of ast.events) {
      events.push(transformEvent(node))
    }

    // Return immutable reference
    return {
      timeline: transformTimeline(ast.timeline),
      events: events,  // Becomes readonly after return
      sourceLocation: ast.location
    }
  })
```

## Extension Points

The data model is designed for extensibility:

1. **Custom Actions**: `ActionType` can be extended with new action types
2. **Custom Providers**: `TimelineProvider` supports "custom" + configuration
3. **Metadata**: All IR types have optional metadata fields for extensions
4. **Properties**: Actions have open `properties` field for custom options

---

**Data Model Complete**: 2025-10-14
**Next**: Define API contracts (CLI, Compiler, Extension)
