# Data Model: Event Name and Argument Validation

**Feature**: 029-validate-event-names
**Date**: 2025-11-10

## Overview

This document defines the data entities and validation flow for event name and argument validation in Eligian event actions.

## Entities

### 1. TimelineEventMetadata (Existing)

**Source**: `packages/language/src/completion/metadata/timeline-events.generated.ts`

Represents a known Eligius event with its argument specifications.

**Fields**:
```typescript
interface TimelineEventMetadata {
  name: string;              // Event identifier (e.g., "data-sync", "before-request-video-url")
  description: string;       // Event description (e.g., "Event: data-sync")
  category?: string;         // Event category (e.g., "Timeline", "Navigation", "general")
  args?: EventArgMetadata[]; // Event arguments (empty array if no args)
}
```

**Relationships**:
- Contains 0..* `EventArgMetadata` (event arguments)

**Constraints**:
- `name` is unique across all events
- `name` is non-empty
- `args` defaults to empty array if not provided

**Examples**:
```typescript
// Event with arguments
{
  name: "before-request-video-url",
  description: "Event: before-request-video-url",
  category: "Navigation",
  args: [
    { name: "index", type: "number" },
    { name: "requestedVideoPosition", type: "number" },
    { name: "isHistoryRequest", type: "boolean" }
  ]
}

// Event without arguments
{
  name: "timeline-complete",
  description: "Event: timeline-complete",
  category: "Timeline",
  args: []
}
```

### 2. EventArgMetadata (Existing)

**Source**: `packages/language/src/completion/metadata/timeline-events.generated.ts`

Represents a single argument specification for an Eligius event.

**Fields**:
```typescript
interface EventArgMetadata {
  name: string;   // Argument identifier (e.g., "syncStatus", "itemCount")
  type: string;   // Argument type (e.g., "string", "number", "boolean")
}
```

**Relationships**:
- Belongs to one `TimelineEventMetadata` (parent event)

**Constraints**:
- `name` is non-empty
- `type` is non-empty
- `type` is one of: "string", "number", "boolean", "object", "array" (Eligius standard types)

**Examples**:
```typescript
{ name: "syncStatus", type: "string" }
{ name: "itemCount", type: "number" }
{ name: "isHistoryRequest", type: "boolean" }
```

### 3. EventActionDefinition (Existing AST Node)

**Source**: Langium-generated AST from `eligian.langium`

Represents an event action declaration in the Eligian DSL.

**Fields**:
```typescript
interface EventActionDefinition extends AstNode {
  eventName: string;             // Event name string literal (e.g., "data-sync")
  actionName: string;            // Action identifier (e.g., "HandleDataSync")
  parameters: Parameter[];       // Action parameters (empty array if no params)
  topic?: string;                // Optional event topic (e.g., "navigation")
  body: OperationStatement[];    // Action operations (must be non-empty)
}
```

**Relationships**:
- Contains 0..* `Parameter` (action parameters)
- Contains 1..* `OperationStatement` (action body operations)

**Constraints**:
- `eventName` is non-empty (validated by existing `checkEventActionDefinition`)
- `eventName` length ≤ 100 chars (validated by existing `checkEventActionDefinition`)
- `body` is non-empty (validated by existing `checkEventActionDefinition`)
- `actionName` follows identifier rules (validated by grammar)

**Examples**:
```typescript
// Event action with typed parameters
{
  eventName: "data-sync",
  actionName: "HandleDataSync",
  parameters: [
    { name: "syncStatus", type: "string" },
    { name: "itemCount", type: "number" }
  ],
  topic: undefined,
  body: [/* operations */]
}

// Event action without parameters
{
  eventName: "timeline-complete",
  actionName: "HandleTimelineComplete",
  parameters: [],
  topic: undefined,
  body: [/* operations */]
}

// Event action with topic
{
  eventName: "click",
  actionName: "HandleNavClick",
  parameters: [{ name: "targetId", type: "string" }],
  topic: "navigation",
  body: [/* operations */]
}
```

### 4. Parameter (Existing AST Node)

**Source**: Langium-generated AST from `eligian.langium`

Represents a single parameter declaration in an action or event action.

**Fields**:
```typescript
interface Parameter extends AstNode {
  name: string;      // Parameter identifier (e.g., "syncStatus")
  type?: string;     // Optional TypeScript type annotation (e.g., "string")
}
```

**Relationships**:
- Belongs to one `EventActionDefinition` or `ActionDefinition` (parent action)

**Constraints**:
- `name` is non-empty
- `name` is not a reserved keyword (validated by existing `checkEventActionParameters`)
- `name` is unique within parent action (validated by existing `checkEventActionParameters`)
- `type` is optional (type checking is opt-in)

**Examples**:
```typescript
{ name: "syncStatus", type: "string" }     // With type annotation
{ name: "itemCount", type: "number" }      // With type annotation
{ name: "data", type: undefined }          // Without type annotation
```

## Validation Flow

### User Story 1: Event Name Validation

**Trigger**: Langium validator runs on `EventActionDefinition` AST node

**Flow**:
```
1. checkEventNameExists(eventAction, accept)
   │
   ├─> Extract eventAction.eventName
   │
   ├─> Check if empty string
   │   ├─> Yes: accept error "Event name cannot be empty" (code: empty_event_name)
   │   └─> No: continue
   │
   ├─> Load TIMELINE_EVENTS (import from timeline-events.generated.ts)
   │
   ├─> Find event by name: TIMELINE_EVENTS.find(e => e.name === eventAction.eventName)
   │
   ├─> Event found?
   │   ├─> Yes: VALID, return (no error)
   │   └─> No: Calculate suggestions
   │       │
   │       ├─> Extract all event names: TIMELINE_EVENTS.map(e => e.name)
   │       │
   │       ├─> Call findSimilar(eventName, allEventNames, threshold=2)
   │       │
   │       ├─> Suggestions found?
   │       │   ├─> Yes: format message "Unknown event name: 'X' (Did you mean: 'Y'?)"
   │       │   └─> No: format message "Unknown event name: 'X'"
   │       │
   │       └─> accept error with message (code: unknown_event_name)
   │
   └─> End
```

**Error Messages**:
- Empty event name: `"Event name cannot be empty"`
- Unknown event (with suggestions): `"Unknown event name: 'data-synk' (Did you mean: 'data-sync'?)"`
- Unknown event (no suggestions): `"Unknown event name: 'completely-invalid-event'"`

### User Story 2: Argument Count Validation

**Trigger**: Langium validator runs on `EventActionDefinition` AST node

**Flow**:
```
2. checkEventArgumentCount(eventAction, accept)
   │
   ├─> Extract eventAction.eventName
   │
   ├─> Load TIMELINE_EVENTS
   │
   ├─> Find event metadata: TIMELINE_EVENTS.find(e => e.name === eventAction.eventName)
   │
   ├─> Event metadata found?
   │   ├─> No: SKIP validation (event name validation will catch this)
   │   └─> Yes: continue
   │
   ├─> Get expected arg count: event.args?.length ?? 0
   ├─> Get actual param count: eventAction.parameters.length
   │
   ├─> Counts match?
   │   ├─> Yes: VALID, return (no warning)
   │   └─> No: format warning message
   │       │
   │       ├─> Build message:
   │       │   "Event 'X' provides N arguments, but action declares M parameters"
   │       │
   │       ├─> If actual < expected:
   │       │   append ". Missing arguments may be undefined at runtime."
   │       │
   │       ├─> If actual > expected:
   │       │   append ". Extra parameters will be ignored at runtime."
   │       │
   │       └─> accept warning with message (code: event_argument_count_mismatch)
   │
   └─> End
```

**Warning Messages**:
- Too few parameters: `"Event 'before-request-video-url' provides 3 arguments, but action declares 2 parameters. Missing arguments may be undefined at runtime."`
- Too many parameters: `"Event 'timeline-complete' provides 0 arguments, but action declares 1 parameter 'extraParam'. Extra parameters will be ignored at runtime."`

### User Story 3: Type Compatibility Validation

**Trigger**: Langium validator runs on `EventActionDefinition` AST node

**Flow**:
```
3. checkEventTypeCompatibility(eventAction, accept)
   │
   ├─> Extract eventAction.eventName
   │
   ├─> Load TIMELINE_EVENTS
   │
   ├─> Find event metadata: TIMELINE_EVENTS.find(e => e.name === eventAction.eventName)
   │
   ├─> Event metadata found?
   │   ├─> No: SKIP validation (event name validation will catch this)
   │   └─> Yes: continue
   │
   ├─> Get event arguments: event.args ?? []
   │
   ├─> Iterate eventAction.parameters with index:
   │   │
   │   ├─> Parameter has type annotation?
   │   │   ├─> No: SKIP this parameter (opt-in validation)
   │   │   └─> Yes: continue
   │   │
   │   ├─> Get expected arg at same index: eventArgs[index]
   │   │
   │   ├─> Expected arg exists?
   │   │   ├─> No: accept warning "Type annotation for 'X' is unnecessary (event provides no arg at position N)"
   │   │   └─> Yes: continue
   │   │
   │   ├─> Compare types: param.type === eventArg.type
   │   │
   │   ├─> Types match?
   │   │   ├─> Yes: VALID, continue to next parameter
   │   │   └─> No: accept error:
   │   │       "Type mismatch for parameter 'X': declared as 'Y' but event provides 'Z'"
   │   │       (code: event_type_mismatch)
   │   │
   │   └─> Next parameter
   │
   └─> End
```

**Error Messages**:
- Type mismatch: `"Type mismatch for parameter 'index': declared as 'string' but event provides 'number'"`
- Unnecessary type annotation: `"Type annotation for 'param' is unnecessary because the event provides no arguments"`

## Validation Order

Validators run in this order (registered in `EligianValidatorRegistry`):

1. `checkEventActionDefinition` (existing) - Event name literal, length, body
2. `checkEventActionParameters` (existing) - Reserved keywords, duplicates
3. `checkEventNameExists` (new) - Event name validation (US1)
4. `checkEventArgumentCount` (new) - Argument count validation (US2)
5. `checkEventTypeCompatibility` (new) - Type compatibility validation (US3)

**Rationale**: Early validators ensure preconditions for later validators (e.g., event name must be valid before checking argument count).

## Data Sources

### Compile-Time Data

**TIMELINE_EVENTS** (immutable):
- Source: `packages/language/src/completion/metadata/timeline-events.generated.ts`
- Generated by: `packages/language/src/completion/generate-metadata.ts`
- Regeneration: `tsx src/completion/generate-metadata.ts` (when Eligius updates)
- 43 events total (as of current Eligius version)

**Levenshtein Utilities** (pure functions):
- Source: `packages/language/src/css/levenshtein.ts`
- Functions: `levenshteinDistance(a, b)`, `findSimilar(target, candidates, threshold)`
- No state, deterministic

### Runtime Data

**EventActionDefinition AST nodes**:
- Created by: Langium parser from `.eligian` source files
- Accessed via: Validator methods receive AST nodes as parameters
- Immutable: AST nodes are read-only during validation

## Assumptions

1. **Event metadata is complete**: All Eligius events are documented in `eventmetadata` export
2. **Type names match**: Type strings in event metadata match TypeScript type syntax (e.g., "string", "number", "boolean")
3. **Arguments by position**: Event arguments are matched by position, not by name (parameter names are free-form)
4. **No optional arguments**: Eligius events don't have optional arguments (all args are required or event has zero args)
5. **No rest parameters**: Eligius events don't have variable-length argument lists

## Edge Cases

1. **Event not in metadata**: Validation accepts error (unknown event name)
2. **Event with zero arguments**: Valid, no argument count warning if action has zero parameters
3. **Parameter without type annotation**: Skipped by type compatibility validation (opt-in)
4. **Multiple type mismatches**: Each parameter gets separate error diagnostic
5. **Event name with typo**: Levenshtein suggests up to 3 closest matches (if distance ≤ 2)
6. **Whitespace-only event name**: Treated as non-empty by grammar (string literal)
7. **Case-sensitive matching**: Event names and types are case-sensitive

## Performance Characteristics

**Event Lookup**:
- Time: O(n) linear search through 43 events
- Space: O(1) - imports existing constant array

**Levenshtein Calculation**:
- Time: O(n * m) where n=43 events, m=~20 avg string length = ~860 comparisons
- Only runs on error case (not hot path)

**Validation Overhead**:
- 3 validator methods run per `EventActionDefinition` node
- Estimated total time: ~5ms per event action
- Target: <300ms for entire document validation (per SC-002)

## Testing Strategy

**Unit Tests**: Not applicable (validators use Langium infrastructure, no pure functions to test)

**Integration Tests** (3 separate files per Principle II):

1. `event-name-validation.spec.ts` (15 tests):
   - Valid event names (no errors)
   - Unknown event names (errors with suggestions)
   - Empty event names (errors)
   - Typos with Levenshtein distance ≤ 2 (suggestions)
   - Typos with distance > 2 (no suggestions)

2. `argument-count-validation.spec.ts` (15 tests):
   - Correct parameter count (no warnings)
   - Too few parameters (warnings)
   - Too many parameters (warnings)
   - Zero arguments, zero parameters (no warnings)
   - Zero arguments, N parameters (warnings)

3. `argument-type-validation.spec.ts` (15 tests):
   - Matching types (no errors)
   - Mismatched types (errors)
   - No type annotations (no errors - opt-in)
   - Mixed: some params with types, some without
   - Unnecessary type annotations (warnings)

**Test Fixtures**:
- Reuse existing valid event actions from `packages/language/src/compiler/__tests__/__fixtures__/event-actions/valid/*.eligian`
- Create new invalid fixtures for error cases
