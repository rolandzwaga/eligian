# Research: Event Actions with Declarative Syntax

**Feature**: 028-event-actions-the
**Date**: 2025-11-09
**Phase**: Phase 0 (Research & Discovery)

## Overview

This document consolidates research findings for implementing event-triggered actions in the Eligian DSL. Event actions enable developers to define custom actions that execute automatically when specific events are broadcast through the Eligius eventbus.

## 1. Eligius EventActions Schema

### Key Findings

**Source**: `f:\projects\eligius\eligius\src\configuration\types.ts:113-136`

```typescript
export interface IEventActionConfiguration extends IActionConfiguration {
  eventName: string;
  eventTopic?: string;
}

export interface IActionConfiguration {
  id: string;
  name: string;
  startOperations: IOperationConfiguration<TOperationData>[];
}
```

**Decision**: Event actions extend regular action configuration with two additional fields:
- `eventName` (required): String identifying the event type
- `eventTopic` (optional): String for namespacing events of the same name

**Rationale**: This schema is simpler than regular/timeline actions because event actions:
- Have NO `endOperations` (only `startOperations`)
- Have NO `duration` property (triggered by events, not timelines)
- Are triggered by event dispatches, not timeline positions

**Alternatives Considered**:
- Making eventTopic required: Rejected - topics are optional in Eligius schema
- Adding endOperations support: Rejected - Eligius does not support endOperations for event actions

## 2. Event Argument Passing (eventArgs)

### Key Findings

**Source**: `f:\projects\eligius\eligius\src\eventbus\actionregistry-eventbus-listener.ts:25-42`

When an event is broadcast, the eventbus listener creates an `operationData` object with the event arguments:

```typescript
handleEvent(eventName: string, eventTopic: string | undefined, args: any[]): void {
  if (eventTopic) {
    eventName = `${eventName}:${eventTopic}`;
  }
  const actions = this._actionRegistry.get(eventName);
  if (actions) {
    const operationData = {
      eventArgs: args,  // ← Arguments passed to event action operations
    };
    actions.forEach(action => {
      action.start(operationData);
    });
  }
}
```

**Decision**: Event arguments are passed to the action via `operationData.eventArgs` array. Parameters in the DSL event action definition (`on event "click" action HandleClick(element, timestamp)`) must map to indices in this array:
- First parameter (`element`) → `$operationData.eventArgs[0]`
- Second parameter (`timestamp`) → `$operationData.eventArgs[1]`
- Third parameter → `$operationData.eventArgs[2]`
- And so on...

**Rationale**: This matches Eligius runtime behavior where event dispatches pass arbitrary arguments as an array. The DSL provides syntactic sugar (named parameters) while compiling to array index access.

**Alternatives Considered**:
- Using object destructuring: Rejected - Eligius runtime uses array, not object
- Generating parameter names as property keys: Rejected - would require changing Eligius runtime behavior

## 3. Event Topic Namespacing

### Key Findings

**Source**: `f:\projects\eligius\eligius\src\eventbus\actionregistry-eventbus-listener.ts:14-23`

Topics are implemented as string concatenation with `:` delimiter:

```typescript
registerAction(action: IAction, eventName: string, eventTopic?: string): void {
  if (eventTopic?.length) {
    eventName = `${eventName}:${eventTopic}`;  // ← Combine event and topic
  }
  if (!this._actionRegistry.has(eventName)) {
    this._actionRegistry.set(eventName, []);
  }
  this._actionRegistry.get(eventName)?.push(action);
}
```

**Decision**: Topics provide namespacing for events:
- Event `"click"` with topic `"navigation"` → registered as `"click:navigation"`
- Event `"click"` with topic `"form"` → registered as `"click:form"`
- Event `"click"` with no topic → registered as `"click"`

This allows multiple handlers for the same event name in different contexts.

**Rationale**: Topics are a built-in Eligius feature for event organization. The DSL must expose this capability with clean syntax: `on event "click" topic "navigation" action ...`

**Alternatives Considered**:
- Nested event namespacing (e.g., `on event "navigation.click"`): Rejected - doesn't match Eligius runtime behavior
- Comma-separated topics: Rejected - Eligius only supports one topic per event action

## 4. Event Action Configuration in Eligius JSON

### Example Configuration

**Source**: Derived from `f:\projects\eligius\eligius\src\test\unit\configuration\configuration-resolver.spec.ts`

```json
{
  "eventActions": [
    {
      "id": "unique-uuid-here",
      "name": "HandleLanguageChange",
      "eventName": "language-change",
      "eventTopic": "user-selection",
      "startOperations": [
        {
          "id": "op-uuid-1",
          "systemName": "selectElement",
          "operationData": {
            "selector": ".language-display"
          }
        },
        {
          "id": "op-uuid-2",
          "systemName": "setTextContent",
          "operationData": {
            "textContent": "$operationData.eventArgs[0]"
          }
        }
      ]
    }
  ]
}
```

**Decision**: Event actions compile to the `eventActions` array in Eligius configuration with:
- `id`: UUID v4 (per Constitution Principle VII)
- `name`: Action name from DSL
- `eventName`: String literal from DSL
- `eventTopic`: Optional string literal from DSL
- `startOperations`: Array of operations (same structure as regular actions)

**Rationale**: Maintains consistency with existing action compilation patterns while adding event-specific fields.

## 5. Parameter Scoping and Resolution

### Challenge

Event action parameters create a scoping challenge:
1. Parameters are declared in the event action signature: `action HandleClick(element, timestamp)`
2. Parameters must resolve to `$operationData.eventArgs[n]` in operations
3. Parameters exist ONLY within the event action scope (not global)

### Decision

Implement parameter scoping using a **parameter registry** during transformation:

```typescript
// Conceptual approach (implementation in ast-transformer.ts)
interface EventActionContext {
  parameters: Map<string, number>;  // paramName → eventArgs index
}

// When transforming event action:
const context: EventActionContext = {
  parameters: new Map([
    ['element', 0],
    ['timestamp', 1]
  ])
};

// When transforming operation references to parameters:
if (context.parameters.has(identifier)) {
  const index = context.parameters.get(identifier);
  return `$operationData.eventArgs[${index}]`;
}
```

**Rationale**: This approach:
- Maintains parameter names for readability in DSL
- Compiles to correct array indices in JSON
- Prevents parameter name collisions with constants/variables
- Enables validation of undefined parameter references

**Alternatives Considered**:
- Global parameter scope: Rejected - parameters should be scoped to event action only
- String replacement: Rejected - too fragile, can't handle nested scopes
- AST annotation: Considered but adds complexity without benefit

## 6. Validation Requirements

### Identified Validation Rules

Based on feature spec requirements and Eligius constraints:

1. **Event Name Validation** (FR-006):
   - Must be non-empty string literal
   - Must NOT be a variable or expression
   - Validates at compile time

2. **Event Topic Validation** (FR-006):
   - If present, must be non-empty string literal
   - Must NOT be a variable or expression

3. **Event Action Name Validation** (FR-007):
   - Must follow action naming rules (alphanumeric + underscores)
   - Must NOT conflict with reserved keywords

4. **Parameter Name Validation** (FR-008):
   - Must be valid identifiers
   - Must NOT be reserved keywords (if, for, break, etc.)
   - Duplicates within same event action are errors

5. **Empty Body Validation** (FR-009):
   - Event action MUST have at least one operation in startOperations
   - Empty bodies are compile errors

6. **Duplicate Handler Warning** (FR-012):
   - Warn when multiple event actions have same (eventName, eventTopic) pair
   - Not an error (Eligius allows multiple handlers)

### Decision: Compiler-First Validation Pattern

Per Constitution Principle X, validation logic will be implemented in:
- **Compiler package** (`packages/compiler/src/validation/event-action-validator.ts`): Pure validation functions returning typed errors
- **Langium validator** (`packages/language/src/eligian-validator.ts`): Thin adapter calling compiler validators

**Rationale**: Ensures validation consistency across CLI and IDE, enables unit testing of validation logic in isolation.

## 7. Grammar Design

### Syntax Decision

```
EventActionDefinition:
  'on' 'event' eventName=STRING
  ('topic' eventTopic=STRING)?
  'action' name=ID
  '(' (parameters+=ID (',' parameters+=ID)*)? ')'
  '[' operations+=OperationStatement* ']'
;
```

**Key Design Choices**:

1. **'on event' keyword prefix**: Clearly distinguishes event actions from regular actions
2. **Optional topic clause**: Matches Eligius schema (eventTopic is optional)
3. **Parameter list**: Reuses existing ID production for consistency
4. **Operation body**: Reuses OperationStatement production (same as regular actions)

**Rationale**: This syntax:
- Is intuitive and readable
- Follows existing DSL patterns (similar to action definitions)
- Maps cleanly to Eligius JSON schema
- Allows zero parameters (valid use case per spec edge cases)

**Alternatives Considered**:
- `event "name" action ...`: Rejected - less clear, ambiguous with future extensions
- `@event("name") action ...`: Rejected - decorator syntax doesn't fit DSL style
- `when event "name" action ...`: Rejected - "when" implies conditional, not event-driven

## 8. IDE Integration Strategy

### Autocomplete for Event Names (US5)

**Challenge**: Event names are free-form strings in Eligius (no typed metadata)

**Decision**: Extract known event names from Eligius source if available, otherwise provide:
- Common timeline events: `"timeline-play"`, `"timeline-pause"`, `"timeline-complete"`
- Custom event suggestion: Autocomplete triggers on `"` after `on event`

**Source**: Check `f:\projects\eligius\eligius\src\types.ts` for `TimelineEventNames` enum or similar

**Rationale**: Even partial autocomplete improves developer experience. Full event validation requires Eligius to expose event metadata (future enhancement).

**Alternatives Considered**:
- No autocomplete: Rejected - poor DX
- Hardcoded event list: Acceptable as initial implementation

### Hover Documentation (US5)

**Decision**: Provide hover tooltips for:
- Event action definitions: Show parameters and their positions
- Event name string literals: Show documentation from Eligius (if available)

**Rationale**: Minimal implementation effort, high DX value.

## 9. Transformation Strategy

### AST → JSON Pipeline

**Location**: `packages/compiler/src/ast-transformer.ts`

**Approach**:

1. **Detect EventActionDefinition nodes** during AST traversal
2. **Create parameter context** mapping parameter names → indices
3. **Transform operations** with parameter context active
4. **Generate Eligius JSON** with eventName, eventTopic, startOperations

**Pseudocode**:

```typescript
function transformEventAction(node: EventActionDefinition): IEventActionConfiguration {
  // Build parameter registry
  const parameterMap = new Map<string, number>();
  node.parameters.forEach((param, index) => {
    parameterMap.set(param.name, index);
  });

  // Transform operations with parameter context
  const startOperations = node.operations.map(op =>
    transformOperation(op, { parameters: parameterMap })
  );

  return {
    id: crypto.randomUUID(),
    name: node.name,
    eventName: node.eventName,
    eventTopic: node.eventTopic,  // undefined if not present
    startOperations
  };
}

function transformOperationReference(
  ref: Reference,
  context: TransformContext
): string {
  // Check if reference is an event action parameter
  if (context.parameters?.has(ref.name)) {
    const index = context.parameters.get(ref.name);
    return `$operationData.eventArgs[${index}]`;
  }

  // Otherwise, use existing resolution logic
  return resolveReference(ref);
}
```

**Rationale**: Minimal changes to existing transformer, leverages parameter context pattern.

## 10. Testing Strategy

### Unit Tests

**Location**: `packages/language/src/__tests__/event-action-validation.spec.ts`

**Coverage**:
- Parse valid event action syntax
- Parse optional topic syntax
- Parse zero-parameter event actions
- Reject invalid event names (non-string literals)
- Reject reserved keyword parameters
- Reject empty event action bodies
- Warn on duplicate (eventName, eventTopic) pairs

### Integration Tests

**Location**: `packages/compiler/src/__tests__/event-action-integration.spec.ts`

**Coverage**:
- End-to-end DSL → JSON compilation
- Parameter mapping to eventArgs indices
- Multiple parameters in correct order
- Event actions with topics compile correctly
- Event actions without topics compile correctly

### Test Fixtures

Create example DSL files in `packages/compiler/src/__tests__/__fixtures__/event-actions/`:
- `simple-event-action.eligian` - Basic event action with parameters
- `event-action-with-topic.eligian` - Event action with topic namespacing
- `multiple-event-actions.eligian` - Multiple handlers for different events
- `invalid-event-action.eligian` - Invalid syntax for error testing

## 11. Documentation Requirements

### Language Specification Update

**File**: `LANGUAGE_SPEC.md`

**Required Additions**:
- Event Action Definition syntax
- Parameter scoping rules
- Event topic namespacing behavior
- Compilation to Eligius eventActions schema
- Examples with and without topics

**Per Constitution Principle XVII**: LANGUAGE_SPEC.md MUST be updated before implementation begins.

### Quickstart Guide

**File**: `specs/028-event-actions-the/quickstart.md`

**Content**:
- 5-minute tutorial for writing first event action
- Common event names (if available from Eligius)
- Parameter mapping explanation
- Topic namespacing examples

## Summary of Decisions

| Topic | Decision | Rationale |
|-------|----------|-----------|
| **Schema** | Extend `IActionConfiguration` with `eventName` and `eventTopic` | Matches Eligius JSON schema exactly |
| **Parameters** | Map to `$operationData.eventArgs[n]` by index | Matches Eligius runtime behavior |
| **Topics** | Optional `topic` clause after `event` | Exposes Eligius namespacing feature |
| **Syntax** | `on event "name" topic "topic" action Name(...) [...]` | Clear, intuitive, consistent with DSL |
| **Validation** | Compiler-first pattern with Langium adapter | Per Constitution Principle X |
| **Transformation** | Parameter context during AST traversal | Minimal change to existing transformer |
| **IDE Support** | Autocomplete event names, hover documentation | Improves DX without complex implementation |
| **Testing** | Unit + integration tests with fixtures | Per Constitution Principle II (80% coverage) |

## Next Steps (Phase 1)

1. Generate `data-model.md` with entity definitions
2. Generate `contracts/` with JSON schema examples
3. Generate `quickstart.md` with 5-minute tutorial
4. Update agent context with research findings
5. Re-evaluate Constitution Check post-design
