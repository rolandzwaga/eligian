# Data Model: Enhanced Typir Integration

**Feature**: Enhanced Typir Integration for IDE Support
**Branch**: `021-enhanced-typir-integration`
**Date**: 2025-10-30

## Overview

This document defines the custom Typir types and their relationships for enhanced DSL validation and IDE support. These types enable hover information, type inference, and validation for import statements, constants, timeline events, control flow, and timeline configurations.

---

## Entity 1: ImportType

**Purpose**: Represents an imported asset (layout, styles, provider, or named import) with type information for validation and hover display.

### Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `assetType` | `'html' \| 'css' \| 'media'` | Yes | Inferred from import keyword or file extension |
| `path` | `string` | Yes | Relative file path to the asset |
| `isDefault` | `boolean` | Yes | Whether this is a default import (layout/styles/provider) |

### Validation Rules

1. **Duplicate Default Imports**: Only one of each default import type ('layout', 'styles', 'provider') allowed per document
2. **Asset Type Mismatch**: Warning when explicit `as` clause conflicts with file extension
3. **Path Validation**: Must be relative path (starts with './' or '../')

### Relationships

- **Program → ImportStatements**: One-to-many (program contains multiple imports)
- **ImportStatement → ImportType**: One-to-one (each import has inferred type)

### Examples

```typescript
// Default import: styles './main.css'
{
  assetType: 'css',
  path: './main.css',
  isDefault: true
}

// Named import: import video from './intro.mp4' as html
{
  assetType: 'html',  // Explicit override
  path: './intro.mp4',
  isDefault: false
}
```

### Hover Display

- Format: `Import<assetType>`
- Example: Hovering over `styles './main.css'` shows `Import<css>`

---

## Entity 2: TimelineEventType

**Purpose**: Represents a timeline event (timed, sequence, or stagger) with timing information for validation and hover display.

### Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `eventKind` | `'timed' \| 'sequence' \| 'stagger'` | Yes | The event type |
| `startTime` | `number` | Yes | Start time in seconds (0 for sequences/staggers) |
| `endTime` | `number \| undefined` | No | End time in seconds (optional for sequences) |
| `duration` | `number \| undefined` | No | Duration in seconds (for sequences/staggers) |

### Validation Rules

1. **Timed Events**:
   - `startTime ≥ 0` (no negative times)
   - `endTime > startTime` (end must be after start)

2. **Sequence Events**:
   - `duration > 0` (positive duration required)

3. **Stagger Events**:
   - `delay > 0` (positive delay required)
   - Items expression must be array type

4. **Cross-Event Validation**:
   - Detect overlapping timed events within same timeline
   - Warning: "Events overlap: [0s→5s] and [3s→7s]"

### Relationships

- **Timeline → TimelineEvents**: One-to-many (timeline contains multiple events)
- **TimelineEvent → TimelineEventType**: One-to-one (each event has inferred type)

### Examples

```typescript
// Timed event: at 0s..5s fadeIn()
{
  eventKind: 'timed',
  startTime: 0,
  endTime: 5,
  duration: undefined
}

// Sequence event: sequence [...] for 2s
{
  eventKind: 'sequence',
  startTime: 0,
  endTime: undefined,
  duration: 2
}

// Stagger event: stagger 200ms items with action() for 1s
{
  eventKind: 'stagger',
  startTime: 0,
  endTime: undefined,
  duration: 1
}
```

### Hover Display

- Format: `eventKind + 'Event: ' + timing`
- Example: Hovering over `at 0s..5s` shows `TimedEvent: 0s → 5s`

---

## Entity 3: TimelineType

**Purpose**: Represents a timeline configuration with provider, container, and events for validation and hover display.

### Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `provider` | `'video' \| 'audio' \| 'raf' \| 'custom'` | Yes | Timeline provider type |
| `containerSelector` | `string` | Yes | CSS selector for timeline container |
| `source` | `string \| undefined` | No | Optional source file path (required for video/audio) |
| `events` | `TimelineEventType[]` | Yes | Array of timeline events (recursive type reference) |

### Validation Rules

1. **Provider-Source Consistency**:
   - Video/audio providers: `source` MUST be specified
   - RAF/custom providers: `source` should NOT be specified (warning)

2. **Container Selector**:
   - Must be valid CSS selector syntax

3. **Events**:
   - Warning if timeline has no events

### Relationships

- **Program → Timelines**: One-to-many (program contains multiple timelines)
- **Timeline → TimelineType**: One-to-one (each timeline has inferred type)
- **TimelineType → TimelineEventTypes**: One-to-many (timeline contains events via events property)

### Examples

```typescript
// Valid video timeline
{
  provider: 'video',
  containerSelector: '#app',
  source: './video.mp4',
  events: [/* TimelineEventType[] */]
}

// Invalid: video without source
{
  provider: 'video',
  containerSelector: '#app',
  source: undefined,  // ERROR: Video provider requires source
  events: []
}

// Warning: RAF with source
{
  provider: 'raf',
  containerSelector: '#app',
  source: './video.mp4',  // WARNING: RAF doesn't use source
  events: []
}
```

### Hover Display

- Format: `Timeline<provider>`
- Example: Hovering over timeline shows `Timeline<video>`

---

## Entity 4: ConstantDeclaration

**Purpose**: Represents a program or action-scoped constant with inferred type for validation and hover display.

### Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | `string` | Yes | Constant identifier |
| `inferredType` | `PrimitiveType` | Yes | Type inferred from initial value |
| `scope` | `'program' \| 'action'` | Yes | Where constant is declared |

### Validation Rules

1. **Name Validation**:
   - Must not be a reserved keyword
   - Reserved: `if`, `else`, `for`, `in`, `break`, `continue`, `const`, `action`, `endable`, `timeline`, `at`, `sequence`, `stagger`

2. **Type Validation**:
   - Must not be void/undefined (if void type is modeled)

### Relationships

- **Program/Action → ConstantDeclarations**: One-to-many (contains multiple constants)
- **ConstantDeclaration → inferred type**: One-to-one (constant has single inferred type)

### Examples

```typescript
// Valid constant
{
  name: 'duration',
  inferredType: 'number',  // Inferred from value: 500
  scope: 'program'
}

// Invalid: reserved keyword
{
  name: 'if',  // ERROR: 'if' is a reserved keyword
  inferredType: 'number',
  scope: 'action'
}
```

### Hover Display

- Format: `const name: inferredType`
- Example: Hovering over `const duration = 500` shows `const duration: number`

---

## Entity 5: ControlFlowNode

**Purpose**: Represents control flow constructs (if/for) with type requirements for validation.

### Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `nodeType` | `'if' \| 'for'` | Yes | Control flow type |
| `conditionType` | `Type \| undefined` | No | Type of if condition (should be boolean) |
| `collectionType` | `Type \| undefined` | No | Type of for collection (should be array) |

### Validation Rules

1. **If Statements**:
   - Condition should evaluate to boolean (warning if not)
   - Warn if if/else branches are empty

2. **For Statements**:
   - Collection MUST be array type (error if not)
   - Warn if for body is empty

### Relationships

- **Action → ControlFlowNodes**: One-to-many (action contains control flow statements)
- **ControlFlowNode → condition/collection types**: One-to-one (references inferred types)

### Examples

```typescript
// Valid if statement
{
  nodeType: 'if',
  conditionType: 'boolean',  // Inferred from: $operationdata.enabled
  collectionType: undefined
}

// Invalid for loop
{
  nodeType: 'for',
  conditionType: undefined,
  collectionType: 'string'  // ERROR: For loop collection must be array
}
```

### Hover Display

- Format: Shows inferred type of condition/collection
- Example: Hovering over `for (item in items)` shows collection type

---

## Type Relationships Diagram

```
Program
├── ImportStatements[]
│   └── ImportType (inferred)
├── ConstantDeclarations[]
│   └── PrimitiveType (inferred)
└── Timelines[]
    └── TimelineType (inferred)
        └── TimelineEventTypes[] (events property)
            └── TimelineEventType (inferred)

Action
├── ConstantDeclarations[]
│   └── PrimitiveType (inferred)
└── ControlFlowNodes[]
    └── ControlFlowNode (inferred)
        ├── conditionType (Type reference)
        └── collectionType (Type reference)
```

---

## Typir CustomKind Factories

These entities are implemented using Typir's `CustomKind` API:

```typescript
// Import type factory
const importFactory = new CustomKind<ImportType, EligianSpecifics>(typir, {
  name: 'Import',
  calculateTypeName: props => `Import<${props.assetType}>`
});

// Timeline event type factory
const eventFactory = new CustomKind<TimelineEventType, EligianSpecifics>(typir, {
  name: 'TimelineEvent',
  calculateTypeName: props => `${props.eventKind}Event`
});

// Timeline type factory
const timelineFactory = new CustomKind<TimelineType, EligianSpecifics>(typir, {
  name: 'Timeline',
  calculateTypeName: props => `Timeline<${props.provider}>`
});
```

---

## Implementation Notes

### Type Inference

All types are inferred automatically from AST nodes during Langium's document build phase. Inference rules are registered via `typir.Inference.addInferenceRulesForAstNodes`.

### Validation

Validation rules are registered via `typir.validation.Collector.addValidationRulesForAstNodes` and run during Langium's validation phase.

### Performance

- Type inference: O(n) where n = AST nodes
- Validation: O(n × r) where r = rules per node type
- Caching: Enabled by default for inferred types

### Circular Dependencies

`TimelineType` contains `TimelineEventType[]` (recursive reference). Typir handles this via `getTypeFinal()` after `finish()`.
